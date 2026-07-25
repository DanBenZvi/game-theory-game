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
  };
});
