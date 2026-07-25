// Client-side opponent AI. Pure logic (no DOM) — dual CommonJS/browser
// export like shared/battleshipLogic.js so it can be unit-tested with
// plain `node`, not just clicked through in a browser.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../shared/battleshipLogic'));
  } else {
    root.BattleshipAI = factory(root.BattleshipLogic);
  }
})(typeof self !== 'undefined' ? self : this, function (L) {
  const DIFFICULTIES = ['easy', 'medium', 'hard'];

  function neighbors(row, col) {
    return [
      { row: row - 1, col },
      { row: row + 1, col },
      { row, col: col - 1 },
      { row, col: col + 1 },
    ].filter(({ row: r, col: c }) => L.isInBounds(r, c));
  }

  /**
   * Scores every unshot cell by how many placements of the remaining ship
   * lengths could legally cover it, given cells already known to be
   * misses. Classic "probability density" hunting: cells that could hold
   * more of the remaining fleet score higher.
   */
  function probabilityGrid(shotsFired, remainingLengths, size = L.BOARD_SIZE) {
    const scores = L.createEmptyGrid(size).map((row) => row.map(() => 0));

    for (const length of remainingLengths) {
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          // Horizontal placement starting here.
          if (col + length <= size) {
            let fits = true;
            for (let i = 0; i < length; i++) {
              if (shotsFired.has(L.cellKey(row, col + i))) { fits = false; break; }
            }
            if (fits) for (let i = 0; i < length; i++) scores[row][col + i]++;
          }
          // Vertical placement starting here.
          if (row + length <= size) {
            let fits = true;
            for (let i = 0; i < length; i++) {
              if (shotsFired.has(L.cellKey(row + i, col))) { fits = false; break; }
            }
            if (fits) for (let i = 0; i < length; i++) scores[row + i][col]++;
          }
        }
      }
    }

    return scores;
  }

  function bestCellsFrom(scores, cells) {
    let best = -1;
    let candidates = [];
    for (const { row, col } of cells) {
      const s = scores[row][col];
      if (s > best) {
        best = s;
        candidates = [{ row, col }];
      } else if (s === best) {
        candidates.push({ row, col });
      }
    }
    return candidates;
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * @param {string} difficulty - 'easy' | 'medium' | 'hard'
   * @param {number} size - board size, defaults to the standard 10x10
   */
  function createAI(difficulty, size = L.BOARD_SIZE) {
    if (!DIFFICULTIES.includes(difficulty)) {
      throw new Error('Unknown AI difficulty: ' + difficulty);
    }

    const shotsFired = new Set();
    let targetQueue = []; // cells to try next, most-promising first (medium/hard)

    function allUnshotCells() {
      const cells = [];
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (!shotsFired.has(L.cellKey(row, col))) cells.push({ row, col });
        }
      }
      return cells;
    }

    function chooseShot(remainingLengths) {
      if (difficulty !== 'easy') {
        while (targetQueue.length) {
          const cand = targetQueue.shift();
          if (!shotsFired.has(L.cellKey(cand.row, cand.col))) return cand;
        }
      }

      const unshot = allUnshotCells();

      if (difficulty === 'hard') {
        const scores = probabilityGrid(shotsFired, remainingLengths, size);
        // Parity targeting: the smallest ship still afloat is at least
        // length 2, so any ship must occupy a checkerboard cell of one
        // color — restricting the hunt to that color halves the search
        // without ever being able to miss a ship.
        const parityCells = unshot.filter(({ row, col }) => (row + col) % 2 === 0);
        const pool = parityCells.length > 0 ? parityCells : unshot;
        return pickRandom(bestCellsFrom(scores, pool));
      }

      // Easy and medium's "hunting" phase both fire blind at random.
      return pickRandom(unshot);
    }

    function markResult(row, col, status) {
      shotsFired.add(L.cellKey(row, col));
      if (difficulty === 'easy') return;

      if (status === 'hit') {
        targetQueue.push(...neighbors(row, col));
      } else if (status === 'sunk') {
        // Simplification: drop all pending targets once a ship goes down
        // rather than tracking which queued cells belonged to it. With
        // one active hit-chain at a time (the normal case) this is exact;
        // it only over-clears in the rare case of two simultaneous
        // unresolved hit-chains, which just costs a few extra random shots.
        targetQueue = [];
      }
    }

    return { chooseShot, markResult, difficulty };
  }

  return { createAI, DIFFICULTIES, probabilityGrid };
});
