// Turn-based battle screen: two 10x10 grids (own fleet + enemy fog of
// war), wired to a client-side AI opponent. Firing rules come from
// BattleshipLogic.fireAt so the exact same function can run server-side
// for online mode in step 4.

(function () {
  const L = window.BattleshipLogic;
  const AI = window.BattleshipAI;

  function createBattleScreen({
    ownGridEl,
    enemyGridEl,
    turnIndicatorEl,
    gameOverEl,
    gameOverTitleEl,
    gameOverStatsEl,
    playAgainBtn,
    rematchBtn,
    onRematchRequested,
  }) {
    let ownState = null;
    let enemyState = null;
    let ai = null;
    let turn = 'player';
    let gameOver = false;
    let onExitCallback = null;
    let lastDifficulty = null;

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

    function start({ placements, difficulty }, onExit) {
      onExitCallback = onExit || null;
      lastDifficulty = difficulty;
      ownState = L.createBattleState(placements);
      enemyState = L.createBattleState(L.randomPlacement().placements);
      ai = AI.createAI(difficulty);
      turn = 'player';
      gameOver = false;

      buildGrid(ownGridEl, ownCellEls, null);
      buildGrid(enemyGridEl, enemyCellEls, handleEnemyCellClick);

      for (const p of ownState.placements) {
        for (const { row, col } of p.cells) {
          ownCellEls[row][col].classList.add('ship');
        }
      }

      gameOverEl.classList.add('hidden');
      updateTurnIndicator();
    }

    async function handleEnemyCellClick(row, col) {
      if (turn !== 'player' || gameOver) return;
      if (enemyState.shots.has(L.cellKey(row, col))) return;

      turn = null; // lock input while the shot is resolving
      SoundEngine.fire();
      await BattleEffects.fireMissile(ownGridEl, enemyCellEls[row][col], { color: '#29e0ff' });

      const result = L.fireAt(enemyState, row, col);
      await applyResult(enemyCellEls, enemyState, row, col, result);

      if (result.allSunk) {
        finishGame('win');
        return;
      }
      turn = 'ai';
      updateTurnIndicator();
      setTimeout(aiTurn, 650);
    }

    async function aiTurn() {
      if (gameOver) return;
      const remainingLengths = ownState.placements
        .filter((p) => !L.getShipStatus(ownState, p.id).sunk)
        .map((p) => p.length);

      const { row, col } = ai.chooseShot(remainingLengths);

      SoundEngine.fire();
      await BattleEffects.fireMissile(enemyGridEl, ownCellEls[row][col], { color: '#ff5a3c' });

      const result = L.fireAt(ownState, row, col);
      ai.markResult(row, col, result.status);
      await applyResult(ownCellEls, ownState, row, col, result);

      if (result.allSunk) {
        finishGame('lose');
        return;
      }
      turn = 'player';
      updateTurnIndicator();
    }

    async function applyResult(cellEls, state, row, col, result) {
      const cell = cellEls[row][col];
      cell.classList.add(result.status === 'miss' ? 'miss' : 'hit');

      if (result.status === 'miss') {
        SoundEngine.splash();
        BattleEffects.impactMiss(cell);
        return;
      }

      SoundEngine.explosion();
      BattleEffects.impactHit(cell);

      if (result.status === 'sunk') {
        const ship = state.placements.find((p) => p.id === result.shipId);
        const shipCellEls = ship.cells.map(({ row: r, col: c }) => cellEls[r][c]);
        SoundEngine.sunk();
        await BattleEffects.sinkShip(shipCellEls);
        for (const el of shipCellEls) {
          el.classList.remove('hit', 'sinking');
          el.classList.add('sunk');
        }
      }
    }

    function updateTurnIndicator() {
      if (gameOver) {
        turnIndicatorEl.textContent = '';
        return;
      }
      turnIndicatorEl.textContent = turn === 'player' ? 'Your turn — fire!' : 'Enemy turn…';
      turnIndicatorEl.classList.toggle('enemy-turn', turn === 'ai');
    }

    function finishGame(outcome) {
      gameOver = true;
      updateTurnIndicator();
      const won = outcome === 'win';
      if (won) {
        SoundEngine.victory();
        BattleEffects.celebrate();
      } else {
        SoundEngine.defeat();
      }

      const myStats = L.summarizeBattle(enemyState); // my shots fired at the enemy fleet

      gameOverTitleEl.textContent = won ? 'VICTORY' : 'DEFEAT';
      gameOverTitleEl.classList.toggle('victory', won);
      gameOverTitleEl.classList.toggle('defeat', !won);
      gameOverStatsEl.textContent =
        `Shots fired: ${myStats.shotsFired} · Hits: ${myStats.hits} · Accuracy: ${myStats.accuracy}% · ` +
        (won
          ? `Enemy fleet: ${myStats.shipsSunk}/${myStats.totalShips} sunk`
          : `You sank ${myStats.shipsSunk}/${myStats.totalShips} enemy ships`);
      gameOverEl.classList.remove('hidden');
    }

    playAgainBtn.addEventListener('click', () => {
      if (onExitCallback) onExitCallback();
    });

    if (rematchBtn) {
      rematchBtn.addEventListener('click', () => {
        // Back to placement to re-arrange ships, not an instant restart —
        // main.js owns that screen transition; we just hand back which
        // difficulty was in play so it can stay preselected.
        if (onRematchRequested) onRematchRequested(lastDifficulty);
      });
    }

    /** Player navigated away mid-game (in-battle "Back to Menu") — reuses the
     * existing gameOver guards in handleEnemyCellClick/aiTurn/applyResult so
     * a pending AI setTimeout can't fire a stray shot/sound after they've left. */
    function leaveMidGame() {
      gameOver = true;
    }

    return { start, leaveMidGame };
  }

  window.createBattleScreen = createBattleScreen;
})();
