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

    // Add transforming class for performance on mobile
    const canvas = document.getElementById("canvas");
    if (window.innerWidth <= 768) {
      canvas.classList.add('transforming');
      clearTimeout(this.wallboard.transformTimeout);
      this.wallboard.transformTimeout = setTimeout(() => {
        canvas.classList.remove('transforming');
      }, 150);
    }

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
  }

  handleCanvasPanStart(e) {
    // Don't pan if clicking on connections
    if (e.target.classList.contains('connection-line') ||
        e.target.classList.contains('connection-arrow')) {
      return;
    }

    // Only allow panning if clicking directly on canvas (not on nodes or when editing)
    if (e.target.id === 'canvas' && !this.wallboard.isDragging && !this.wallboard.isConnectionDrag && !this.wallboard.isCutting && !e.altKey && !this.wallboard.isAnyNodeEditing && !e.target.closest('.node')) {
      this.wallboard.isPanning = true;
      this.wallboard.panStart = { x: e.clientX - this.wallboard.panX, y: e.clientY - this.wallboard.panY };
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }

  handleCanvasPan(e) {
    if (this.wallboard.isPanning) {
      let newPanX = e.clientX - this.wallboard.panStart.x;
      let newPanY = e.clientY - this.wallboard.panStart.y;

      // Apply pan limits with more generous buffer on mobile
      const isMobile = window.innerWidth <= 768;
      const buffer = isMobile ? 100 : 200; // Smaller buffer on mobile for better boundaries
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const scaledCanvasWidth = this.wallboard.canvasWidth * this.wallboard.zoom;
      const scaledCanvasHeight = this.wallboard.canvasHeight * this.wallboard.zoom;

      // More restrictive boundaries on mobile to prevent getting lost
      if (isMobile) {
        newPanX = Math.max(-(scaledCanvasWidth - viewportWidth + buffer), Math.min(buffer, newPanX));
        newPanY = Math.max(-(scaledCanvasHeight - viewportHeight + buffer), Math.min(buffer, newPanY));
      } else {
        newPanX = Math.max(-(scaledCanvasWidth - viewportWidth + buffer), Math.min(buffer, newPanX));
        newPanY = Math.max(-(scaledCanvasHeight - viewportHeight + buffer), Math.min(buffer, newPanY));
      }

      this.wallboard.panX = newPanX;
      this.wallboard.panY = newPanY;

      // Update transform immediately for smooth panning
      const canvas = document.getElementById('canvas');
      canvas.style.transform = `translate(${this.wallboard.panX}px, ${this.wallboard.panY}px) scale(${this.wallboard.zoom})`;
      canvas.style.transformOrigin = '0 0';

      // Throttle connection updates during panning
      if (!this.wallboard.panUpdateTimeout) {
        this.wallboard.panUpdateTimeout = setTimeout(() => {
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

      e.preventDefault();
    }
  }

  updateTransform() {
    const canvas = document.getElementById('canvas');
    DomUtils.applyTransform('canvas', this.wallboard.zoom, this.wallboard.panX, this.wallboard.panY);

    // Add zoomed-out class at 30% zoom for simplified view
    if (this.wallboard.zoom <= 0.3) {
      canvas.classList.add('zoomed-out');
    } else {
      canvas.classList.remove('zoomed-out');
    }

    // Debounce connection updates on mobile
    if (window.innerWidth <= 768) {
      if (this.wallboard.updateConnectionsTimeout) {
        cancelAnimationFrame(this.wallboard.updateConnectionsTimeout);
      }
      this.wallboard.updateConnectionsTimeout = requestAnimationFrame(() => {
        this.wallboard.connectionManager.updateConnections();
      });
    } else {
      this.wallboard.connectionManager.updateConnections();
    }
  }
}
