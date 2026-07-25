// Online battle screen: mirrors battle.js's board rendering, but every
// shot is server-authoritative — firing emits a socket event and the
// grid only updates when the server's broadcast comes back, for both
// players' shots alike. Also supports resuming mid-game after a
// reconnect via a server-provided snapshot.

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

    function applyShot(cellEls, row, col, status, shipCells) {
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

    function fireAtEnemy(row, col) {
      if (turn !== myPlayerNumber || gameOver) return;
      const cell = enemyCellEls[row][col];
      if (cell.classList.contains('hit') || cell.classList.contains('miss') || cell.classList.contains('sunk')) {
        return;
      }
      socket.emit('fire', { code, row, col }, (ack) => {
        // Rejections (not your turn / already fired) are rare races —
        // the authoritative shotResult broadcast (or its absence) is
        // the real source of truth, so there's nothing to reconcile here.
        if (!ack.ok) console.warn('fire rejected:', ack.error);
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

    function finishGame(winner, disconnectWin) {
      gameOver = true;
      updateTurnIndicator();
      const won = winner === myPlayerNumber;
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
        applyShot(ownCellEls, shot.row, shot.col, shot.status, shot.cells);
      }
      for (const shot of snapshot.myShotsOnOpponent) {
        applyShot(enemyCellEls, shot.row, shot.col, shot.status, shot.cells);
      }

      gameOverEl.classList.add('hidden');
      if (gameOver) {
        finishGame(snapshot.winner, false);
      } else {
        updateTurnIndicator();
      }
    }

    function handleShotResult({ by, row, col, status, shipCells, turn: nextTurn, gameOver: over, winner }) {
      const isMyShot = by === myPlayerNumber;
      const cellEls = isMyShot ? enemyCellEls : ownCellEls;
      applyShot(cellEls, row, col, status, shipCells);
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
