// Ship placement screen: 10x10 grid + drag-and-drop fleet tray.
// Talks only to BattleshipLogic (shared/battleshipLogic.js) for placement
// rules, so the same validation can run again on the server later.

(function () {
  const L = window.BattleshipLogic;
  const GRID_GAP = 3; // must match the `gap` in .grid (style.css)

  function createPlacementScreen({ gridEl, trayEl, rotateBtn, randomizeBtn, readyBtn, statusEl }) {
    let grid = L.createEmptyGrid();
    /** @type {Map<string, {id:string,length:number,orientation:'H'|'V',row:number,col:number,cells:{row:number,col:number}[]}>} */
    let placements = new Map();
    // cellSize: width/height of one cell's content box.
    // cellStride: distance from the start of one cell to the start of the next
    // (cellSize + gap) — CSS Grid's `gap` means these aren't the same thing,
    // so every offset below picks deliberately between the two.
    let cellSize = 0;
    let cellStride = 0;
    let selectedShipId = null;
    let drag = null;
    let onReadyCallback = null;

    const cellEls = []; // cellEls[row][col]
    /** @type {Map<string, HTMLElement>} shipId -> its single persistent DOM node */
    const pieceEls = new Map();

    function buildGrid() {
      gridEl.innerHTML = '';
      cellEls.length = 0;
      for (let row = 0; row < L.BOARD_SIZE; row++) {
        const rowEls = [];
        for (let col = 0; col < L.BOARD_SIZE; col++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.row = String(row);
          cell.dataset.col = String(col);
          gridEl.appendChild(cell);
          rowEls.push(cell);
        }
        cellEls.push(rowEls);
      }
    }

    function buildTray() {
      // Ship elements can currently live in the tray OR on the board
      // (already placed) — remove() wherever they are before discarding
      // our references, or a placed ship becomes an orphaned DOM node.
      for (const piece of pieceEls.values()) {
        piece.remove();
      }
      trayEl.innerHTML = '';
      pieceEls.clear();
      for (const spec of L.SHIP_SPECS) {
        const piece = createShipPiece(spec.id, spec.length, 'H');
        piece.classList.add('in-tray');
        trayEl.appendChild(piece);
        pieceEls.set(spec.id, piece);
      }
    }

    function createShipPiece(id, length, orientation) {
      const piece = document.createElement('div');
      piece.className = 'ship-piece';
      piece.dataset.shipId = id;
      piece.dataset.length = String(length);
      piece.dataset.orientation = orientation;
      piece.style.touchAction = 'none';
      for (let i = 0; i < length; i++) {
        const seg = document.createElement('div');
        seg.className = 'ship-seg';
        seg.dataset.segmentIndex = String(i);
        piece.appendChild(seg);
      }
      applyPieceOrientation(piece);
      piece.addEventListener('pointerdown', onPointerDown);
      return piece;
    }

    function applyPieceOrientation(piece) {
      const length = Number(piece.dataset.length);
      const orientation = piece.dataset.orientation;
      piece.classList.toggle('vertical', orientation === 'V');
      piece.classList.toggle('horizontal', orientation !== 'V');
      if (piece.classList.contains('placed')) {
        const span = length * cellStride - GRID_GAP; // n cells + (n-1) internal gaps
        if (orientation === 'V') {
          piece.style.width = cellSize + 'px';
          piece.style.height = span + 'px';
        } else {
          piece.style.width = span + 'px';
          piece.style.height = cellSize + 'px';
        }
      }
    }

    function measure() {
      const gridWidth = gridEl.getBoundingClientRect().width;
      cellSize = (gridWidth - (L.BOARD_SIZE - 1) * GRID_GAP) / L.BOARD_SIZE;
      cellStride = cellSize + GRID_GAP;
      for (const placement of placements.values()) {
        positionPlacedPiece(placement);
      }
    }

    function positionPlacedPiece(placement) {
      const piece = pieceEls.get(placement.id);
      if (!piece) return;
      piece.style.left = placement.col * cellStride + 'px';
      piece.style.top = placement.row * cellStride + 'px';
      piece.dataset.orientation = placement.orientation;
      applyPieceOrientation(piece);
    }

    function clearPreview() {
      for (const row of cellEls) {
        for (const cell of row) {
          cell.classList.remove('preview-valid', 'preview-invalid');
        }
      }
    }

    function showPreview(cells, valid) {
      clearPreview();
      for (const { row, col } of cells) {
        if (!L.isInBounds(row, col)) continue;
        cellEls[row][col].classList.add(valid ? 'preview-valid' : 'preview-invalid');
      }
    }

    function pixelToCell(clientX, clientY) {
      const rect = gridEl.getBoundingClientRect();
      const col = Math.floor((clientX - rect.left) / cellStride);
      const row = Math.floor((clientY - rect.top) / cellStride);
      return { row, col };
    }

    function onPointerDown(evt) {
      if (evt.button !== undefined && evt.button !== 0) return;
      const piece = evt.currentTarget;
      const shipId = piece.dataset.shipId;
      const length = Number(piece.dataset.length);
      const wasPlaced = piece.classList.contains('placed');
      const grabbedSegment = evt.target.closest('.ship-seg');
      const grabIndex = grabbedSegment ? Number(grabbedSegment.dataset.segmentIndex) : 0;

      selectShip(shipId);

      const originalPlacement = wasPlaced ? placements.get(shipId) : null;
      if (wasPlaced) {
        L.removeShip(grid, shipId);
        placements.delete(shipId);
      }

      drag = {
        shipId,
        length,
        orientation: piece.dataset.orientation,
        piece,
        grabIndex,
        sourceType: wasPlaced ? 'board' : 'tray',
        originalPlacement,
        startX: evt.clientX,
        startY: evt.clientY,
        moved: false,
        lastValidCells: null,
        lastAnchor: null,
      };

      piece.classList.add('dragging-ghost');
      piece.style.position = 'fixed';
      piece.style.zIndex = '1000';
      piece.style.pointerEvents = 'none';
      // Reparent to <body>: a `position: fixed` descendant is positioned
      // relative to the nearest ancestor with a filter/backdrop-filter/
      // transform, not the viewport, and `.screen` has backdrop-filter.
      document.body.appendChild(piece);
      movePieceTo(piece, evt.clientX, evt.clientY);

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }

    function movePieceTo(piece, clientX, clientY) {
      const grabIndex = drag.grabIndex;
      const isVertical = drag.orientation === 'V';
      const span = drag.length * cellStride - GRID_GAP;
      const offsetMain = grabIndex * cellStride + cellSize / 2;
      const left = isVertical ? clientX - cellSize / 2 : clientX - offsetMain;
      const top = isVertical ? clientY - offsetMain : clientY - cellSize / 2;
      piece.style.left = left + 'px';
      piece.style.top = top + 'px';
      piece.style.width = (isVertical ? cellSize : span) + 'px';
      piece.style.height = (isVertical ? span : cellSize) + 'px';
    }

    function anchorFromPointer(clientX, clientY) {
      const { row, col } = pixelToCell(clientX, clientY);
      const grabIndex = drag.grabIndex;
      if (drag.orientation === 'V') {
        return { row: row - grabIndex, col };
      }
      return { row, col: col - grabIndex };
    }

    function onPointerMove(evt) {
      if (!drag) return;
      drag.moved =
        drag.moved ||
        Math.abs(evt.clientX - drag.startX) > 4 ||
        Math.abs(evt.clientY - drag.startY) > 4;

      movePieceTo(drag.piece, evt.clientX, evt.clientY);

      const anchor = anchorFromPointer(evt.clientX, evt.clientY);
      const cells = L.getShipCells(anchor.row, anchor.col, drag.length, drag.orientation);
      const valid = L.canPlaceShip(grid, cells);
      showPreview(cells, valid);
      drag.lastAnchor = anchor;
      drag.lastValidCells = valid ? cells : null;
    }

    function onPointerUp() {
      if (!drag) return;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      const { piece, shipId, length, orientation, sourceType, originalPlacement, moved } = drag;
      clearPreview();
      piece.classList.remove('dragging-ghost');
      piece.style.pointerEvents = '';
      piece.style.zIndex = '';

      if (!moved && sourceType === 'board' && originalPlacement) {
        // Pure click on an already-placed ship: put it back, treat as selection only.
        commitPlacement(originalPlacement);
        drag = null;
        return;
      }

      if (drag.lastValidCells) {
        const anchor = drag.lastAnchor;
        commitPlacement({
          id: shipId,
          length,
          orientation,
          row: anchor.row,
          col: anchor.col,
          cells: drag.lastValidCells,
        });
      } else if (sourceType === 'board' && originalPlacement) {
        commitPlacement(originalPlacement);
      } else {
        returnToTray(piece);
      }

      drag = null;
    }

    function commitPlacement(placement) {
      L.placeShip(grid, placement.cells, placement.id);
      placements.set(placement.id, placement);

      const piece = pieceEls.get(placement.id);
      piece.classList.add('placed');
      piece.classList.remove('in-tray');
      piece.style.position = 'absolute';
      piece.dataset.orientation = placement.orientation;
      if (piece.parentElement !== gridEl.parentElement) {
        gridEl.parentElement.appendChild(piece);
      }
      positionPlacedPiece(placement);
      updateReadyState();
    }

    function returnToTray(piece) {
      piece.classList.remove('placed');
      piece.classList.add('in-tray');
      piece.style.position = '';
      piece.style.left = '';
      piece.style.top = '';
      piece.style.width = '';
      piece.style.height = '';
      piece.dataset.orientation = 'H';
      applyPieceOrientation(piece);
      if (piece.parentElement !== trayEl) {
        trayEl.appendChild(piece);
      }
      updateReadyState();
    }

    function selectShip(shipId) {
      selectedShipId = shipId;
      for (const el of pieceEls.values()) {
        el.classList.toggle('selected', el.dataset.shipId === shipId);
      }
    }

    function rotateSelected() {
      const target = drag || (selectedShipId && placements.get(selectedShipId));
      if (drag) {
        drag.orientation = drag.orientation === 'V' ? 'H' : 'V';
        return;
      }
      if (!target) {
        flashStatus('Select or drag a ship to rotate it.');
        return;
      }
      const newOrientation = target.orientation === 'V' ? 'H' : 'V';
      const cells = L.getShipCells(target.row, target.col, target.length, newOrientation);
      L.removeShip(grid, target.id);
      if (L.canPlaceShip(grid, cells)) {
        placements.delete(target.id);
        commitPlacement({ ...target, orientation: newOrientation, cells });
      } else {
        L.placeShip(grid, target.cells, target.id);
        shakePiece(target.id);
      }
    }

    function shakePiece(shipId) {
      const piece = pieceEls.get(shipId);
      if (!piece) return;
      piece.classList.remove('shake');
      // Force reflow so the animation can restart if triggered twice quickly.
      void piece.offsetWidth;
      piece.classList.add('shake');
    }

    function flashStatus(message) {
      if (!statusEl) return;
      statusEl.textContent = message;
    }

    function updateReadyState() {
      const allPlaced = placements.size === L.SHIP_SPECS.length;
      readyBtn.disabled = !allPlaced;
      flashStatus(
        allPlaced
          ? 'Fleet ready. Click Ready to continue.'
          : `Place your fleet (${placements.size}/${L.SHIP_SPECS.length}).`,
      );
    }

    function randomize() {
      const result = L.randomPlacement();
      resetBoard();
      grid = result.grid;
      for (const placement of result.placements) {
        placements.set(placement.id, placement);
        const piece = pieceEls.get(placement.id);
        piece.dataset.orientation = placement.orientation;
        piece.classList.add('placed');
        piece.classList.remove('in-tray');
        piece.style.position = 'absolute';
        gridEl.parentElement.appendChild(piece);
      }
      measure();
      updateReadyState();
    }

    function resetBoard() {
      grid = L.createEmptyGrid();
      placements.clear();
      selectedShipId = null;
      buildTray();
      updateReadyState();
    }

    function onKeyDown(evt) {
      if (evt.key.toLowerCase() === 'r' && !gridEl.closest('.hidden')) {
        evt.preventDefault();
        rotateSelected();
      }
    }

    rotateBtn.addEventListener('click', rotateSelected);
    randomizeBtn.addEventListener('click', randomize);
    readyBtn.addEventListener('click', () => {
      if (readyBtn.disabled) return;
      const finalPlacements = Array.from(placements.values());
      if (onReadyCallback) onReadyCallback(finalPlacements);
    });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', measure);

    buildGrid();
    buildTray();

    return {
      enter(onReady) {
        onReadyCallback = onReady || null;
        resetBoard();
        requestAnimationFrame(measure);
      },
      getPlacements() {
        return Array.from(placements.values());
      },
    };
  }

  window.createPlacementScreen = createPlacementScreen;
})();
