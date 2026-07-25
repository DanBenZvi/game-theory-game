// Pure board/placement logic shared between browser and server.
// No DOM, no I/O — safe to `require()` on the server and to load with a
// plain <script> tag in the browser (attaches to `window.BattleshipLogic`).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BattleshipLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const BOARD_SIZE = 10;

  const SHIP_SPECS = [
    { id: 'carrier', length: 5 },
    { id: 'battleship', length: 4 },
    { id: 'cruiser', length: 3 },
    { id: 'submarine', length: 3 },
    { id: 'destroyer', length: 2 },
  ];

  function createEmptyGrid(size = BOARD_SIZE) {
    return Array.from({ length: size }, () => Array(size).fill(null));
  }

  function isInBounds(row, col, size = BOARD_SIZE) {
    return row >= 0 && row < size && col >= 0 && col < size;
  }

  /** Cells occupied by a ship of given length/orientation anchored at (row, col). */
  function getShipCells(row, col, length, orientation) {
    const cells = [];
    for (let i = 0; i < length; i++) {
      cells.push(
        orientation === 'V' ? { row: row + i, col } : { row, col: col + i },
      );
    }
    return cells;
  }

  function canPlaceShip(grid, cells, size = BOARD_SIZE) {
    return cells.every(
      ({ row, col }) => isInBounds(row, col, size) && grid[row][col] === null,
    );
  }

  /** Mutates `grid`, marking each cell with `shipId`. Assumes canPlaceShip was checked. */
  function placeShip(grid, cells, shipId) {
    for (const { row, col } of cells) {
      grid[row][col] = shipId;
    }
  }

  /** Mutates `grid`, clearing every cell belonging to `shipId`. */
  function removeShip(grid, shipId, size = BOARD_SIZE) {
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (grid[row][col] === shipId) grid[row][col] = null;
      }
    }
  }

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  /** Produces a full valid random placement for the given ship specs. */
  function randomPlacement(shipSpecs = SHIP_SPECS, size = BOARD_SIZE) {
    const grid = createEmptyGrid(size);
    const placements = [];

    for (const spec of shipSpecs) {
      let placed = false;
      while (!placed) {
        const orientation = Math.random() < 0.5 ? 'H' : 'V';
        const row = randomInt(size);
        const col = randomInt(size);
        const cells = getShipCells(row, col, spec.length, orientation);
        if (canPlaceShip(grid, cells, size)) {
          placeShip(grid, cells, spec.id);
          placements.push({
            id: spec.id,
            length: spec.length,
            orientation,
            row,
            col,
            cells,
          });
          placed = true;
        }
      }
    }

    return { grid, placements };
  }

  /** Validates a full set of placements (one per spec, no overlaps, in bounds). */
  function validateFullPlacement(placements, shipSpecs = SHIP_SPECS, size = BOARD_SIZE) {
    if (!Array.isArray(placements) || placements.length !== shipSpecs.length) {
      return false;
    }
    const grid = createEmptyGrid(size);
    const seenIds = new Set();
    for (const p of placements) {
      const spec = shipSpecs.find((s) => s.id === p.id);
      if (!spec || spec.length !== p.length || seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      const cells = getShipCells(p.row, p.col, p.length, p.orientation);
      if (!canPlaceShip(grid, cells, size)) return false;
      placeShip(grid, cells, p.id);
    }
    return true;
  }

  function cellKey(row, col) {
    return row + ',' + col;
  }

  /**
   * A "battle board" is one side's fleet plus every shot fired *at* it.
   * Both the client (vs. AI) and, later, the server (online mode) drive
   * their turn loop through this same fireAt() so hit/miss/sunk rules
   * can't drift between the two.
   */
  function createBattleState(placements, size = BOARD_SIZE) {
    const grid = createEmptyGrid(size);
    for (const p of placements) placeShip(grid, p.cells, p.id);
    const hitsByShip = {};
    for (const p of placements) hitsByShip[p.id] = new Set();
    return { grid, placements, size, shots: new Set(), hitsByShip };
  }

  function getShipStatus(state, shipId) {
    const placement = state.placements.find((p) => p.id === shipId);
    const hits = state.hitsByShip[shipId];
    return { length: placement.length, hits: hits.size, sunk: hits.size === placement.length };
  }

  function isFleetSunk(state) {
    return state.placements.every((p) => getShipStatus(state, p.id).sunk);
  }

  /**
   * Fires at (row, col) on `state`. Mutates `state` (records the shot and,
   * on a hit, credits the owning ship). Returns a result describing what
   * happened — callers use this both to update the UI and (server-side,
   * later) to decide whose turn is next.
   */
  function fireAt(state, row, col) {
    if (!isInBounds(row, col, state.size)) {
      return { status: 'invalid', row, col };
    }
    const key = cellKey(row, col);
    if (state.shots.has(key)) {
      return { status: 'already-fired', row, col };
    }
    state.shots.add(key);

    const shipId = state.grid[row][col];
    if (!shipId) {
      return { status: 'miss', row, col };
    }

    state.hitsByShip[shipId].add(key);
    const { sunk } = getShipStatus(state, shipId);
    const allSunk = sunk && isFleetSunk(state);
    return { status: sunk ? 'sunk' : 'hit', row, col, shipId, sunk, allSunk };
  }

  /**
   * Replays every shot already fired at `state` into a transport-friendly
   * list — used to rebuild a client's board after a reload/reconnect.
   * Sunk ships include their `cells` (safe to reveal; no longer secret).
   */
  function getShotHistory(state) {
    const history = [];
    for (const key of state.shots) {
      const [row, col] = key.split(',').map(Number);
      const shipId = state.grid[row][col];
      if (!shipId) {
        history.push({ row, col, status: 'miss' });
        continue;
      }
      const { sunk } = getShipStatus(state, shipId);
      const entry = { row, col, status: sunk ? 'sunk' : 'hit', shipId };
      if (sunk) {
        entry.cells = state.placements.find((p) => p.id === shipId).cells;
      }
      history.push(entry);
    }
    return history;
  }

  /** Post-game stats for the side that fired the shots recorded in `state`. */
  function summarizeBattle(state) {
    const shotsFired = state.shots.size;
    let hits = 0;
    for (const key of state.shots) {
      const [row, col] = key.split(',').map(Number);
      if (state.grid[row][col]) hits++;
    }
    const shipsSunk = state.placements.filter((p) => getShipStatus(state, p.id).sunk).length;
    return {
      shotsFired,
      hits,
      misses: shotsFired - hits,
      accuracy: shotsFired > 0 ? Math.round((hits / shotsFired) * 100) : 0,
      shipsSunk,
      totalShips: state.placements.length,
    };
  }

  return {
    BOARD_SIZE,
    SHIP_SPECS,
    createEmptyGrid,
    isInBounds,
    getShipCells,
    canPlaceShip,
    placeShip,
    removeShip,
    randomPlacement,
    validateFullPlacement,
    cellKey,
    createBattleState,
    getShipStatus,
    isFleetSunk,
    fireAt,
    getShotHistory,
    summarizeBattle,
  };
});
