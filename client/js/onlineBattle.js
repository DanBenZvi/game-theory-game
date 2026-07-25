// Online battle screen: mirrors battle.js's board rendering, but every
// shot is server-authoritative — firing emits a socket event and the
// grid only updates when the server's broadcast comes back, for both
// players' shots alike. Also supports resuming mid-game after a
// reconnect via a server-provided snapshot (instant, no animations —
// those are only for shots landing live).

(function () {
  const L = window.BattleshipLogic;

  function createOnlineBattleScreen(
    { ownGridEl, enemyGridEl, turnIndicatorEl, gameOverEl, gameOverTitleEl, gameOverStatsEl, playAgainBtn },
    socket,
  ) {
    let code = null;
    let myPlayerNumber = null;
    let turn = null;
    let gameOver = false;
    let onExitCallback = null;
    let pendingOutgoingMissile = null;

    const ownCellEls = [];
    const enemyCellEls = [];

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
          el.classList.remove('hit');
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

    function updateTurnIndicator() {
      if (gameOver) {
        turnIndicatorEl.textContent = '';
        return;
      }
      turnIndicatorEl.textContent = turn === myPlayerNumber ? 'Your turn — fire!' : "Opponent's turn…";
      turnIndicatorEl.classList.toggle('enemy-turn', turn !== myPlayerNumber);
    }

    function finishGame(winner, disconnectWin, playSound = true) {
      gameOver = true;
      updateTurnIndicator();
      const won = winner === myPlayerNumber;
      if (playSound) {
        if (won) SoundEngine.victory();
        else SoundEngine.defeat();
      }
      gameOverTitleEl.textContent = won ? 'VICTORY' : 'DEFEAT';
      gameOverTitleEl.classList.toggle('victory', won);
      gameOverTitleEl.classList.toggle('defeat', !won);
      gameOverStatsEl.textContent = disconnectWin
        ? 'Your opponent left the game.'
        : won
          ? 'You sank the enemy fleet!'
          : 'Your fleet has been destroyed.';
      gameOverEl.classList.remove('hidden');
    }

    function start({ code: roomCode, playerNumber, placements, turn: startingTurn }, onExit) {
      code = roomCode;
      myPlayerNumber = playerNumber;
      turn = startingTurn;
      gameOver = false;
      onExitCallback = onExit || null;

      buildGrid(ownGridEl, ownCellEls, null);
      buildGrid(enemyGridEl, enemyCellEls, fireAtEnemy);
      revealOwnShips(placements);

      gameOverEl.classList.add('hidden');
      updateTurnIndicator();
    }

    /** Rebuilds the whole screen from a server snapshot after a reconnect. */
    function resume({ code: roomCode, playerNumber, snapshot }, onExit) {
      code = roomCode;
      myPlayerNumber = playerNumber;
      turn = snapshot.turn;
      gameOver = snapshot.status === 'finished';
      onExitCallback = onExit || null;

      buildGrid(ownGridEl, ownCellEls, null);
      buildGrid(enemyGridEl, enemyCellEls, fireAtEnemy);
      revealOwnShips(snapshot.myPlacements);

      for (const shot of snapshot.opponentShotsOnMe) {
        applyShotInstant(ownCellEls, shot.row, shot.col, shot.status, shot.cells);
      }
      for (const shot of snapshot.myShotsOnOpponent) {
        applyShotInstant(enemyCellEls, shot.row, shot.col, shot.status, shot.cells);
      }

      gameOverEl.classList.add('hidden');
      if (gameOver) {
        finishGame(snapshot.winner, false, false);
      } else {
        updateTurnIndicator();
      }
    }

    async function handleShotResult({ by, row, col, status, shipCells, turn: nextTurn, gameOver: over, winner }) {
      const isMyShot = by === myPlayerNumber;
      const cellEls = isMyShot ? enemyCellEls : ownCellEls;

      if (isMyShot && pendingOutgoingMissile) {
        await pendingOutgoingMissile;
        pendingOutgoingMissile = null;
      } else if (!isMyShot) {
        SoundEngine.fire();
        await BattleEffects.fireMissile(enemyGridEl, ownCellEls[row][col], { color: '#ff5a3c' });
      }

      await applyShotLive(cellEls, row, col, status, shipCells);

      turn = nextTurn;
      if (over) {
        finishGame(winner, false);
      } else {
        updateTurnIndicator();
      }
    }

    function handleOpponentLeftMidGame() {
      if (gameOver) return;
      finishGame(myPlayerNumber, true);
    }

    playAgainBtn.addEventListener('click', () => {
      if (onExitCallback) onExitCallback();
    });

    return { start, resume, handleShotResult, handleOpponentLeftMidGame };
  }

  window.createOnlineBattleScreen = createOnlineBattleScreen;
})();
