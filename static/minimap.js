// Minimap for canvas navigation
class Minimap {
  constructor(wallboard) {
    this.wallboard = wallboard;
    this.container = null;
    this.canvas = null;
    this.ctx = null;
    this.viewport = null;
    this.isDragging = false;
    this.updateInterval = null;

    // Calculate scale to fit entire canvas in minimap
    this.calculateScale();

    this.init();
  }

  init() {
    this.createMinimapUI();
    this.startUpdates();
    this.attachEventListeners();
  }

  calculateScale() {
    // Calculate scale to fit the entire canvas in the minimap
    const minimapWidth = 200; // Canvas width in pixels
    const minimapHeight = 200; // Canvas height in pixels

    const scaleX = minimapWidth / this.wallboard.canvasWidth;
    const scaleY = minimapHeight / this.wallboard.canvasHeight;

    // Use the smaller scale to ensure everything fits
    this.scale = Math.min(scaleX, scaleY);
  }

  createMinimapUI() {
    // Create minimap container
    this.container = document.createElement('div');
    this.container.className = 'minimap-container';
    this.container.innerHTML = `
      <div class="minimap-header">
        <span class="minimap-title">MAP</span>
        <div class="minimap-zoom-display">${Math.round(this.wallboard.zoom * 100)}%</div>
      </div>
      <canvas class="minimap-canvas" width="200" height="200"></canvas>
      <div class="minimap-controls">
        <button class="minimap-btn zoom-in" title="Zoom In">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="11" y1="8" x2="11" y2="14"></line>
            <line x1="8" y1="11" x2="14" y2="11"></line>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
        <button class="minimap-btn zoom-reset" title="Reset Zoom">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
        <button class="minimap-btn zoom-out" title="Zoom Out">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="8" y1="11" x2="14" y2="11"></line>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
        <button class="minimap-btn center-view" title="Center View">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(this.container);

    this.canvas = this.container.querySelector('.minimap-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.zoomDisplay = this.container.querySelector('.minimap-zoom-display');
  }

  attachEventListeners() {
    // Zoom controls
    this.container.querySelector('.zoom-in').addEventListener('click', () => {
      this.zoomFromCenter(1.2);
    });

    this.container.querySelector('.zoom-out').addEventListener('click', () => {
      this.zoomFromCenter(0.8);
    });

    this.container.querySelector('.zoom-reset').addEventListener('click', () => {
      this.zoomFromCenter(1.0 / this.wallboard.zoom);
    });

    this.container.querySelector('.center-view').addEventListener('click', () => {
      this.centerOnNodes();
    });

    // Canvas interaction for navigation
    this.canvas.addEventListener('mousedown', (e) => this.handleMinimapMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMinimapMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.handleMinimapMouseUp());
    this.canvas.addEventListener('mouseleave', () => this.handleMinimapMouseUp());
  }

  handleMinimapMouseDown(e) {
    this.isDragging = true;
    this.updateViewportFromMinimap(e);
  }

  handleMinimapMouseMove(e) {
    if (this.isDragging) {
      this.updateViewportFromMinimap(e);
    }
  }

  handleMinimapMouseUp() {
    this.isDragging = false;
  }

  updateViewportFromMinimap(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert minimap coordinates to canvas coordinates
    const canvasX = x / this.scale;
    const canvasY = y / this.scale;

    // Center the viewport on the clicked position
    this.wallboard.panX = (window.innerWidth / 2) - (canvasX * this.wallboard.zoom);
    this.wallboard.panY = (window.innerHeight / 2) - (canvasY * this.wallboard.zoom);

    this.wallboard.zoomPanManager.updateTransform();
  }

  zoomFromCenter(zoomMultiplier) {
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    const oldZoom = this.wallboard.zoom;
    const newZoom = Math.max(0.3, Math.min(3, oldZoom * zoomMultiplier));

    this.wallboard.zoom = newZoom;

    // Adjust pan to zoom from center of viewport
    const zoomRatio = newZoom / oldZoom;
    this.wallboard.panX = viewportCenterX - (viewportCenterX - this.wallboard.panX) * zoomRatio;
    this.wallboard.panY = viewportCenterY - (viewportCenterY - this.wallboard.panY) * zoomRatio;

    this.wallboard.zoomPanManager.updateTransform();
  }

  centerOnNodes() {
    if (this.wallboard.nodes.length === 0) return;

    // Temporarily store current zoom and reset to 1.0 to get accurate dimensions
    const currentZoom = this.wallboard.zoom;
    const wasZoomedOut = currentZoom <= 0.3;

    const canvasEl = document.getElementById('canvas');

    // If zoomed out, temporarily hide canvas and reset zoom to get accurate measurements
    if (wasZoomedOut) {
      canvasEl.style.opacity = '0';
      canvasEl.style.transition = 'none'; // Disable transitions during measurement

      this.wallboard.zoom = 1.0;
      this.wallboard.zoomPanManager.updateTransform();
    }

    // Small delay to ensure DOM has updated with new zoom
    setTimeout(() => {
      // Calculate bounding box of all nodes with accurate dimensions
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;

      this.wallboard.nodes.forEach(node => {
        const nodeEl = document.getElementById(`node-${node.id}`);
        if (nodeEl) {
          minX = Math.min(minX, node.position.x);
          minY = Math.min(minY, node.position.y);
          maxX = Math.max(maxX, node.position.x + nodeEl.offsetWidth);
          maxY = Math.max(maxY, node.position.y + nodeEl.offsetHeight);
        }
      });

      // Calculate center
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // Calculate zoom to fit all nodes
      const width = maxX - minX;
      const height = maxY - minY;
      const zoomX = (window.innerWidth * 0.8) / width;
      const zoomY = (window.innerHeight * 0.8) / height;
      const fitZoom = Math.max(0.3, Math.min(zoomX, zoomY, 1.0)); // Min 30%, max 100%

      // Apply zoom and pan
      this.wallboard.zoom = fitZoom;
      this.wallboard.panX = (window.innerWidth / 2) - (centerX * this.wallboard.zoom);
      this.wallboard.panY = (window.innerHeight / 2) - (centerY * this.wallboard.zoom);

      this.wallboard.zoomPanManager.updateTransform();

      // Restore canvas visibility after a brief moment
      if (wasZoomedOut) {
        setTimeout(() => {
          canvasEl.style.transition = '';
          canvasEl.style.opacity = '1';
        }, 20);
      }
    }, wasZoomedOut ? 50 : 0);
  }

  startUpdates() {
    // Update minimap at 30 FPS for smooth updates
    this.updateInterval = setInterval(() => {
      this.render();
    }, 33);
  }

  render() {
    const ctx = this.ctx;
    const canvas = this.canvas;

    // Clear canvas
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw canvas bounds
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0,
      this.wallboard.canvasWidth * this.scale,
      this.wallboard.canvasHeight * this.scale
    );

    // Draw connections
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;

    this.wallboard.connectionManager.connections.forEach(conn => {
      const startNode = this.wallboard.nodes.find(n => n.id === conn.start.nodeId);
      const endNode = this.wallboard.nodes.find(n => n.id === conn.end.nodeId);

      if (startNode && endNode) {
        const startEl = document.getElementById(`node-${startNode.id}`);
        const endEl = document.getElementById(`node-${endNode.id}`);

        if (startEl && endEl) {
          const startX = (startNode.position.x + startEl.offsetWidth / 2) * this.scale;
          const startY = (startNode.position.y + startEl.offsetHeight / 2) * this.scale;
          const endX = (endNode.position.x + endEl.offsetWidth / 2) * this.scale;
          const endY = (endNode.position.y + endEl.offsetHeight / 2) * this.scale;

          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
      }
    });

    ctx.globalAlpha = 1.0;

    // Draw nodes
    this.wallboard.nodes.forEach(node => {
      const nodeEl = document.getElementById(`node-${node.id}`);
      if (!nodeEl) return;

      const x = node.position.x * this.scale;
      const y = node.position.y * this.scale;
      const width = nodeEl.offsetWidth * this.scale;
      const height = nodeEl.offsetHeight * this.scale;

      // Node fill
      if (this.wallboard.selectedNodes.has(node.id)) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      } else {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim();
      }
      ctx.fillRect(x, y, width, height);

      // Node border
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border-light').trim();
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, width, height);
    });

    // Draw viewport rectangle
    this.drawViewport();

    // Update zoom display
    this.zoomDisplay.textContent = `${Math.round(this.wallboard.zoom * 100)}%`;
  }

  drawViewport() {
    const ctx = this.ctx;

    // Get the canvas element to see its current transform
    const canvasEl = document.getElementById('canvas');
    if (!canvasEl) return;

    // Calculate what portion of the canvas is visible
    // The viewport in canvas coordinates (before zoom/pan)
    const viewportWidth = window.innerWidth / this.wallboard.zoom;
    const viewportHeight = window.innerHeight / this.wallboard.zoom;

    // Top-left corner of viewport in canvas coordinates
    const viewportX = -this.wallboard.panX / this.wallboard.zoom;
    const viewportY = -this.wallboard.panY / this.wallboard.zoom;

    // Convert to minimap coordinates
    const minimapX = viewportX * this.scale;
    const minimapY = viewportY * this.scale;
    const minimapWidth = viewportWidth * this.scale;
    const minimapHeight = viewportHeight * this.scale;

    // Draw viewport rectangle with subtle styling
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.6;

    // Subtle glow
    ctx.shadowColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    ctx.shadowBlur = 6;
    ctx.strokeRect(minimapX, minimapY, minimapWidth, minimapHeight);

    // Reset shadow
    ctx.shadowBlur = 0;

    // Fill with semi-transparent accent
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    ctx.globalAlpha = 0.1;
    ctx.fillRect(minimapX, minimapY, minimapWidth, minimapHeight);

    ctx.globalAlpha = 1.0;
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.container) {
      this.container.remove();
    }
  }
}
