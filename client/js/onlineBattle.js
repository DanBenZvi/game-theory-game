// Online battle screen: mirrors battle.js's board rendering, but every
// shot is server-authoritative — firing emits a socket event and the
// grid only updates when the server's broadcast comes back, for both
// players' shots alike. Also supports resuming mid-game after a
// reconnect via a server-provided snapshot (instant, no animations —
// those are only for shots landing live), and a mutual rematch flow
// that keeps a running score across replays in the same room.

(function () {
  const L = window.BattleshipLogic;
  const TURN_TIMEOUT_SECONDS = 15; // must match server/roomManager.js's TURN_TIMEOUT_MS

  function createOnlineBattleScreen(
    {
      ownGridEl,
      enemyGridEl,
      turnIndicatorEl,
      scoreboardEl,
      gameOverEl,
      gameOverTitleEl,
      gameOverStatsEl,
      rematchStatusEl,
      playAgainBtn,
      onlineRematchBtn,
    },
    socket,
  ) {
    let code = null;
    let myPlayerNumber = null;
    let turn = null;
    let gameOver = false;
    let onExitCallback = null;
    let pendingOutgoingMissile = null;
    let myStats = { shotsFired: 0, hits: 0, shipsSunk: 0 };
    let score = { 1: 0, 2: 0 };
    let countdownTimer = null;
    let countdownSeconds = 0;

    const ownCellEls = [];
    const enemyCellEls = [];

    function deriveStatsFromHistory(history) {
      const shotsFired = history.length;
      const hits = history.filter((h) => h.status !== 'miss').length;
      const shipsSunk = new Set(history.filter((h) => h.status === 'sunk').map((h) => h.shipId)).size;
      return { shotsFired, hits, shipsSunk };
    }

    function buildGrid(container, cellEls, onCellClick) {
      container.innerHTML = '';
      cellEls.length = 0;
      for (let row = 0; row < L.BOARD_SIZE; row++) {
        const rowEls = [];
        for (let col = 0; col < L.BOARD_SIZE; col++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.row = String(row);
          cell.dataset.col = String(col);
          if (onCellClick) {
            cell.addEventListener('click', () => onCellClick(row, col));
          }
          container.appendChild(cell);
          rowEls.push(cell);
        }
        cellEls.push(rowEls);
      }
    }

    function revealOwnShips(placements) {
      for (const p of placements) {
        for (const { row, col } of p.cells) {
          ownCellEls[row][col].classList.add('ship');
        }
      }
    }

    function updateScoreboard() {
      if (!scoreboardEl || !myPlayerNumber) return;
      const opponentNumber = myPlayerNumber === 1 ? 2 : 1;
      const mine = score[myPlayerNumber] || 0;
      const theirs = score[opponentNumber] || 0;
      scoreboardEl.innerHTML =
        `<span class="score-you">YOU ${mine}</span> — <span class="score-opponent">${theirs} OPPONENT</span>`;
      scoreboardEl.classList.remove('hidden');
    }

    /** Instant, no animation/sound — used to replay history on resume/reconnect. */
    function applyShotInstant(cellEls, row, col, status, shipCells) {
      const cell = cellEls[row][col];
      cell.classList.remove('hit', 'miss', 'sunk');
      cell.classList.add(status === 'miss' ? 'miss' : 'hit');
      if (status === 'sunk' && shipCells) {
        for (const { row: r, col: c } of shipCells) {
          cellEls[r][c].classList.remove('hit');
          cellEls[r][c].classList.add('sunk');
        }
      }
    }

    /** Animated + sound — used for shots landing live. */
    async function applyShotLive(cellEls, row, col, status, shipCells) {
      const cell = cellEls[row][col];
      cell.classList.add(status === 'miss' ? 'miss' : 'hit');

      if (status === 'miss') {
        SoundEngine.splash();
        BattleEffects.impactMiss(cell);
        return;
      }

      SoundEngine.explosion();
      BattleEffects.impactHit(cell);

      if (status === 'sunk' && shipCells) {
        const shipCellEls = shipCells.map(({ row: r, col: c }) => cellEls[r][c]);
        SoundEngine.sunk();
        await BattleEffects.sinkShip(shipCellEls);
        for (const el of shipCellEls) {
          el.classList.remove('hit', 'sinking');
          el.classList.add('sunk');
        }
      }
    }

    function fireAtEnemy(row, col) {
      if (turn !== myPlayerNumber || gameOver) return;
      const cell = enemyCellEls[row][col];
      if (cell.classList.contains('hit') || cell.classList.contains('miss') || cell.classList.contains('sunk')) {
        return;
      }

      turn = null; // lock input while the shot is resolving
      SoundEngine.fire();
      pendingOutgoingMissile = BattleEffects.fireMissile(ownGridEl, cell, { color: '#29e0ff' });

      socket.emit('fire', { code, row, col }, (ack) => {
        if (!ack.ok) {
          console.warn('fire rejected:', ack.error);
          pendingOutgoingMissile = null;
          turn = myPlayerNumber; // rare race (e.g. stale turn) — hand control back
          updateTurnIndicator();
        }
      });
    }

    function clearCountdown() {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }

    /** Local, cosmetic countdown shown during my own turn — the server enforces the
     * actual timeout independently, so this doesn't need to be millisecond-exact,
     * just give a sense of urgency before a stalled turn gets auto-passed. */
    function startCountdown() {
      clearCountdown();
      countdownSeconds = TURN_TIMEOUT_SECONDS;
      turnIndicatorEl.textContent = `Your turn — fire! (${countdownSeconds}s)`;
      countdownTimer = setInterval(() => {
        countdownSeconds -= 1;
        if (countdownSeconds <= 0) {
          clearCountdown();
          return;
        }
        turnIndicatorEl.textContent = `Your turn — fire! (${countdownSeconds}s)`;
      }, 1000);
    }

    function updateTurnIndicator() {
      clearCountdown();
      if (gameOver) {
        turnIndicatorEl.textContent = '';
        turnIndicatorEl.classList.remove('enemy-turn');
        return;
      }
      turnIndicatorEl.classList.toggle('enemy-turn', turn !== myPlayerNumber);
      if (turn === myPlayerNumber) {
        startCountdown();
      } else {
        turnIndicatorEl.textContent = "Opponent's turn…";
      }
    }

    function finishGame(winner, disconnectWin, playSound = true) {
      gameOver = true;
      updateTurnIndicator();
      const won = winner === myPlayerNumber;
      if (playSound) {
        if (won) {
          SoundEngine.victory();
          BattleEffects.celebrate();
        } else {
          SoundEngine.defeat();
        }
      }
      gameOverTitleEl.textContent = won ? 'VICTORY' : 'DEFEAT';
      gameOverTitleEl.classList.toggle('victory', won);
      gameOverTitleEl.classList.toggle('defeat', !won);

      const accuracy = myStats.shotsFired > 0 ? Math.round((myStats.hits / myStats.shotsFired) * 100) : 0;
      const statsLine =
        `Shots fired: ${myStats.shotsFired} · Hits: ${myStats.hits} · Accuracy: ${accuracy}% · ` +
        (won
          ? `Enemy fleet: ${myStats.shipsSunk}/${L.SHIP_SPECS.length} sunk`
          : `You sank ${myStats.shipsSunk}/${L.SHIP_SPECS.length} enemy ships`);
      gameOverStatsEl.textContent = disconnectWin ? `Your opponent left the game. ${statsLine}` : statsLine;
      if (rematchStatusEl) rematchStatusEl.textContent = '';
      if (onlineRematchBtn) onlineRematchBtn.disabled = false;
      gameOverEl.classList.remove('hidden');
    }

    function start({ code: roomCode, playerNumber, placements, turn: startingTurn, score: startingScore }, onExit) {
      code = roomCode;
      myPlayerNumber = playerNumber;
      turn = startingTurn;
      gameOver = false;
      onExitCallback = onExit || null;
      myStats = { shotsFired: 0, hits: 0, shipsSunk: 0 };
      score = startingScore || score;

      buildGrid(ownGridEl, ownCellEls, null);
      buildGrid(enemyGridEl, enemyCellEls, fireAtEnemy);
      revealOwnShips(placements);

      gameOverEl.classList.add('hidden');
      updateScoreboard();
      updateTurnIndicator();
    }

    /** Rebuilds the whole screen from a server snapshot after a reconnect. */
    function resume({ code: roomCode, playerNumber, snapshot }, onExit) {
      code = roomCode;
      myPlayerNumber = playerNumber;
      turn = snapshot.turn;
      gameOver = snapshot.status === 'finished';
      onExitCallback = onExit || null;
      myStats = deriveStatsFromHistory(snapshot.myShotsOnOpponent);
      score = snapshot.score || score;

      buildGrid(ownGridEl, ownCellEls, null);
      buildGrid(enemyGridEl, enemyCellEls, fireAtEnemy);
      revealOwnShips(snapshot.myPlacements);

      for (const shot of snapshot.opponentShotsOnMe) {
        applyShotInstant(ownCellEls, shot.row, shot.col, shot.status, shot.cells);
      }
      for (const shot of snapshot.myShotsOnOpponent) {
        applyShotInstant(enemyCellEls, shot.row, shot.col, shot.status, shot.cells);
      }

      updateScoreboard();
      gameOverEl.classList.add('hidden');
      if (gameOver) {
        finishGame(snapshot.winner, false, false);
      } else {
        updateTurnIndicator();
      }
    }

    async function handleShotResult({ by, row, col, status, shipCells, turn: nextTurn, gameOver: over, winner, score: newScore }) {
      const isMyShot = by === myPlayerNumber;
      const cellEls = isMyShot ? enemyCellEls : ownCellEls;

      if (isMyShot && pendingOutgoingMissile) {
        await pendingOutgoingMissile;
        pendingOutgoingMissile = null;
      } else if (!isMyShot) {
        SoundEngine.fire();
        await BattleEffects.fireMissile(enemyGridEl, ownCellEls[row][col], { color: '#ff5a3c' });
      }

      if (isMyShot) {
        myStats.shotsFired++;
        if (status !== 'miss') myStats.hits++;
        if (status === 'sunk') myStats.shipsSunk++;
      }

      await applyShotLive(cellEls, row, col, status, shipCells);

      turn = nextTurn;
      if (newScore) {
        score = newScore;
        updateScoreboard();
      }
      if (over) {
        finishGame(winner, false);
      } else {
        updateTurnIndicator();
      }
    }

    function handleOpponentLeftMidGame(newScore) {
      if (gameOver) return;
      if (newScore) {
        score = newScore;
        updateScoreboard();
      }
      finishGame(myPlayerNumber, true);
    }

    /** Server auto-passed a stalled turn — just re-sync, no animation (nothing was fired). */
    function handleTurnTimeout({ turn: newTurn }) {
      if (gameOver) return;
      turn = newTurn;
      updateTurnIndicator();
    }

    /** I've clicked Rematch — tell the server and reflect the waiting state. */
    function requestRematch() {
      if (onlineRematchBtn) onlineRematchBtn.disabled = true;
      if (rematchStatusEl) rematchStatusEl.textContent = 'Waiting for opponent to rematch…';
      socket.emit('requestRematch', { code }, (ack) => {
        if (!ack.ok && rematchStatusEl) {
          rematchStatusEl.textContent = ack.error || 'Could not start a rematch.';
          if (onlineRematchBtn) onlineRematchBtn.disabled = false;
        }
      });
    }

    /** The server told us someone (me or the opponent) has requested a rematch. */
    function handleRematchRequested(playerNumber) {
      if (!rematchStatusEl || gameOver === false) return;
      if (playerNumber === myPlayerNumber) {
        rematchStatusEl.textContent = 'Waiting for opponent to rematch…';
      } else {
        rematchStatusEl.textContent = 'Opponent wants a rematch — click Rematch to accept!';
      }
    }

    /** Called when the player intentionally leaves via the in-battle "Back to Menu"
     * button — tells the server so the opponent isn't left waiting on a room
     * that's never coming back (forfeit if a battle was in progress). */
    function leaveMidGame() {
      clearCountdown();
      if (code) socket.emit('leaveRoom', { code });
    }

    playAgainBtn.addEventListener('click', () => {
      if (onExitCallback) onExitCallback();
    });

    if (onlineRematchBtn) {
      onlineRematchBtn.addEventListener('click', requestRematch);
    }

    return {
      start,
      resume,
      handleShotResult,
      handleOpponentLeftMidGame,
      handleRematchRequested,
      handleTurnTimeout,
      leaveMidGame,
      getScore: () => score,
    };
  }

  window.createOnlineBattleScreen = createOnlineBattleScreen;
})();
