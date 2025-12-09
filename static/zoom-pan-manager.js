// Zoom and pan event handling manager
class ZoomPanManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
  }

  handleWheel(e) {
    if (e.target.closest('.theme-selector') || e.target.closest('.context-menu') || e.target.closest('.editor-overlay')) {
      return; // Don't zoom when scrolling in menus or editor
    }

    // Don't zoom/pan when any node is being edited or when interacting with a node
    if (this.wallboard.isAnyNodeEditing || e.target.closest('.text-editor') || e.target.closest('.node')) {
      return; // Allow normal scrolling in text editors and nodes
    }

    e.preventDefault();

    // Add transforming class for performance on ALL devices
    // This hides content during zoom for smoother animation
    const canvas = document.getElementById("canvas");
    canvas.classList.add('transforming');
    clearTimeout(this.wallboard.transformTimeout);
    this.wallboard.transformTimeout = setTimeout(() => {
      canvas.classList.remove('transforming');
    }, 150);

    const zoomFactor = 0.1;

    // Use center of viewport for zoom anchor point instead of mouse position
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    // Calculate zoom with minimum of 30% to prevent glitching
    const oldZoom = this.wallboard.zoom;
    if (e.deltaY < 0) {
      this.wallboard.zoom = Math.min(this.wallboard.zoom + zoomFactor, 3); // Max zoom 3x
    } else {
      this.wallboard.zoom = Math.max(this.wallboard.zoom - zoomFactor, 0.3); // Min zoom 30%
    }

    // Adjust pan to zoom from center of viewport
    const zoomRatio = this.wallboard.zoom / oldZoom;
    this.wallboard.panX = viewportCenterX - (viewportCenterX - this.wallboard.panX) * zoomRatio;
    this.wallboard.panY = viewportCenterY - (viewportCenterY - this.wallboard.panY) * zoomRatio;

    this.updateTransform();
    // Persist view state (debounced via autoSave, plus quick cache)
    BoardManager.cacheViewState?.(this.wallboard.currentBoardId, {
      zoom: this.wallboard.zoom,
      panX: this.wallboard.panX,
      panY: this.wallboard.panY
    });
    if (this.wallboard?.autoSave) {
      this.wallboard.autoSave();
    }
  }

  handleCanvasPanStart(e) {
    // Don't pan if clicking on connections
    if (e.target.classList.contains('connection-line') ||
      e.target.classList.contains('connection-arrow')) {
      return;
    }

    // Only allow panning if clicking directly on canvas or background (not on nodes or when editing)
    const isCanvasOrBackground = e.target.id === 'canvas' || e.target === document.body || e.target.classList.contains('canvas-container');

    if (isCanvasOrBackground && !this.wallboard.isDragging && !this.wallboard.isConnectionDrag && !this.wallboard.isCutting && !e.altKey && !this.wallboard.isAnyNodeEditing && !e.target.closest('.node')) {
      this.wallboard.isPanning = true;
      this.wallboard.panStart = { x: e.clientX - this.wallboard.panX, y: e.clientY - this.wallboard.panY };
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }

  handleCanvasPan(e) {
    if (this.wallboard.isPanning) {
      this.wallboard.panX = e.clientX - this.wallboard.panStart.x;
      this.wallboard.panY = e.clientY - this.wallboard.panStart.y;

      // Update transform immediately for smooth panning
      const canvas = document.getElementById('canvas');
      canvas.style.transform = `translate(${this.wallboard.panX}px, ${this.wallboard.panY}px) scale(${this.wallboard.zoom})`;
      canvas.style.transformOrigin = '0 0';

      // Throttle culling + connection updates during panning
      if (!this.wallboard.panUpdateTimeout) {
        this.wallboard.panUpdateTimeout = setTimeout(() => {
          BoardManager.updateViewportCulling(this.wallboard);
          this.wallboard.connectionManager.updateConnections();
          this.wallboard.panUpdateTimeout = null;
        }, 16); // ~60fps
      }

      e.preventDefault();
    }
  }

  handleCanvasPanEnd(e) {
    if (this.wallboard.isPanning) {
      this.wallboard.isPanning = false;
      document.body.style.cursor = '';

      // Clear any pending connection update and update immediately
      if (this.wallboard.panUpdateTimeout) {
        clearTimeout(this.wallboard.panUpdateTimeout);
        this.wallboard.panUpdateTimeout = null;
      }
      this.wallboard.connectionManager.updateConnections();
      BoardManager.updateViewportCulling(this.wallboard);
      BoardManager.cacheViewState?.(this.wallboard.currentBoardId, {
        zoom: this.wallboard.zoom,
        panX: this.wallboard.panX,
        panY: this.wallboard.panY
      });
      if (this.wallboard?.autoSave) {
        this.wallboard.autoSave();
      }

      e.preventDefault();
    }
  }

  updateTransform() {
    const canvas = document.getElementById('canvas');
    DomUtils.applyTransform('canvas', this.wallboard.zoom, this.wallboard.panX, this.wallboard.panY);

    // Add zoomed-out class at 30% zoom for simplified view
    const wasZoomedOut = canvas.classList.contains('zoomed-out');
    const nowZoomedOut = this.wallboard.zoom <= 0.3;
    if (nowZoomedOut) {
      canvas.classList.add('zoomed-out');
    } else {
      canvas.classList.remove('zoomed-out');
    }

    // Debounce connection and culling updates for ALL devices (not just mobile)
    // This prevents excessive recalculations during zoom/pan
    if (this.wallboard.updateConnectionsTimeout) {
      cancelAnimationFrame(this.wallboard.updateConnectionsTimeout);
    }
    this.wallboard.updateConnectionsTimeout = requestAnimationFrame(() => {
      // Update viewport culling first (adds/removes nodes from DOM)
      BoardManager.updateViewportCulling(this.wallboard);

      // Then update connections (only for visible nodes)
      this.wallboard.connectionManager.updateConnections();
    });

    // If we crossed the zoomed-out threshold, refresh connections immediately to avoid ghosts
    if (wasZoomedOut !== nowZoomedOut) {
      // Clear all rendered connections so they are rebuilt for the new mode
      if (this.wallboard?.connectionManager?.clearRenderedConnections) {
        this.wallboard.connectionManager.clearRenderedConnections();
        // Recreate the root SVG if it was cleared
        const canvas = document.getElementById('canvas');
        if (canvas && !document.getElementById('connections')) {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.classList.add('svg-connections');
          svg.id = 'connections';
          canvas.insertBefore(svg, canvas.firstChild);
          this.wallboard.connectionManager.svg = svg;
        }
      }
      BoardManager.updateViewportCulling(this.wallboard);
      this.wallboard.connectionManager.updateConnections();
      // Reset title font size and refit in new mode
      if (typeof NodeRenderer?.fitNodeTitleElement === 'function') {
        document.querySelectorAll('.node-type').forEach(el => {
          el.style.fontSize = '';
          NodeRenderer.fitNodeTitleElement(el);
        });
      }
    }
  }
}
