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
    this.boundsPadding = 500;
    this.renderParams = {
      baseLeft: 0,
      baseTop: 0,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      contentWidth: 1,
      contentHeight: 1
    };

    this.init();
  }

  init() {
    this.createMinimapUI();
    this.startUpdates();
    this.attachEventListeners();
  }

  calculateScale() {
    if (!this.canvas) return;

    const minimapWidth = this.canvas.width;
    const minimapHeight = this.canvas.height;
    const bounds = this.wallboard.getNodesBounds(this.wallboard.nodes);

    let baseLeft = 0;
    let baseTop = 0;
    let contentWidth = Math.max(this.wallboard.canvasWidth, 1);
    let contentHeight = Math.max(this.wallboard.canvasHeight, 1);

    if (bounds) {
      baseLeft = bounds.left - this.boundsPadding;
      baseTop = bounds.top - this.boundsPadding;
      contentWidth = Math.max(bounds.width + this.boundsPadding * 2, 1);
      contentHeight = Math.max(bounds.height + this.boundsPadding * 2, 1);
    }

    const scaleX = minimapWidth / contentWidth;
    const scaleY = minimapHeight / contentHeight;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (minimapWidth - contentWidth * scale) / 2;
    const offsetY = (minimapHeight - contentHeight * scale) / 2;

    this.renderParams = {
      baseLeft,
      baseTop,
      offsetX,
      offsetY,
      scale,
      contentWidth,
      contentHeight
    };
  }

  createMinimapUI() {
    // Create minimap container
    this.container = document.createElement('div');
    this.container.className = 'minimap-container';
    this.container.innerHTML = `
      <div class="minimap-header">
        <span class="minimap-title">MAP</span>
        <span class="minimap-node-count">${this.wallboard.nodes.length} nodes</span>
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
    this.nodeCountDisplay = this.container.querySelector('.minimap-node-count');

    this.calculateScale();
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
    document.addEventListener('mouseup', () => this.handleMinimapMouseUp());
    document.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
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

  handleGlobalMouseMove(e) {
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

    const { baseLeft, baseTop, offsetX, offsetY, scale, contentWidth, contentHeight } = this.renderParams;
    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;

    // Convert minimap coordinates to canvas coordinates
    const adjustedX = Math.min(Math.max(x - offsetX, 0), scaledWidth);
    const adjustedY = Math.min(Math.max(y - offsetY, 0), scaledHeight);

    const canvasX = baseLeft + adjustedX / scale;
    const canvasY = baseTop + adjustedY / scale;

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
          this.wallboard.updateNodeSizeFromElement(node.id, nodeEl);
        }
        const size = nodeEl
          ? { width: nodeEl.offsetWidth || 250, height: nodeEl.offsetHeight || 180 }
          : (this.wallboard.getNodeSize(node.id) || { width: 250, height: 180 });

        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + size.width);
        maxY = Math.max(maxY, node.position.y + size.height);
      });

      // Calculate center
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // Calculate zoom to fit all nodes
      const width = maxX - minX;
      const height = maxY - minY;
      const zoomX = (window.innerWidth * 0.8) / width;
      const zoomY = (window.innerHeight * 0.8) / height;
      const minPreferredZoom = CanvasConfig.DEFAULT_ZOOM || 1.0;
      const fitZoom = Math.max(minPreferredZoom, Math.min(zoomX, zoomY, 1.0)); // never shrink below baseline

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
    this.calculateScale();

    const ctx = this.ctx;
    const canvas = this.canvas;

    // Clear canvas
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { baseLeft, baseTop, offsetX, offsetY, scale, contentWidth, contentHeight } = this.renderParams;
    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Draw canvas bounds
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, scaledWidth, scaledHeight);

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

        if (startEl) {
          this.wallboard.updateNodeSizeFromElement(startNode.id, startEl);
        }
        if (endEl) {
          this.wallboard.updateNodeSizeFromElement(endNode.id, endEl);
        }

        const startSize = startEl
          ? { width: startEl.offsetWidth || 250, height: startEl.offsetHeight || 180 }
          : (this.wallboard.getNodeSize(startNode.id) || { width: 250, height: 180 });
        const endSize = endEl
          ? { width: endEl.offsetWidth || 250, height: endEl.offsetHeight || 180 }
          : (this.wallboard.getNodeSize(endNode.id) || { width: 250, height: 180 });

        const startX = ((startNode.position.x + startSize.width / 2) - baseLeft) * scale;
        const startY = ((startNode.position.y + startSize.height / 2) - baseTop) * scale;
        const endX = ((endNode.position.x + endSize.width / 2) - baseLeft) * scale;
        const endY = ((endNode.position.y + endSize.height / 2) - baseTop) * scale;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    });

    ctx.globalAlpha = 1.0;

    // Draw nodes
    this.wallboard.nodes.forEach(node => {
      const nodeEl = document.getElementById(`node-${node.id}`);
      if (nodeEl) {
        this.wallboard.updateNodeSizeFromElement(node.id, nodeEl);
      }
      const size = nodeEl
        ? { width: nodeEl.offsetWidth || 250, height: nodeEl.offsetHeight || 180 }
        : (this.wallboard.getNodeSize(node.id) || { width: 250, height: 180 });

      const x = (node.position.x - baseLeft) * scale;
      const y = (node.position.y - baseTop) * scale;
      const width = size.width * scale;
      const height = size.height * scale;

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

    ctx.restore();

    // Draw viewport rectangle
    this.drawViewport();

    // Update zoom display and node count
    this.zoomDisplay.textContent = `${Math.round(this.wallboard.zoom * 100)}%`;
    this.nodeCountDisplay.textContent = `${this.wallboard.nodes.length} nodes`;
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

    const { baseLeft, baseTop, offsetX, offsetY, scale } = this.renderParams;

    // Convert to minimap coordinates
    const minimapX = offsetX + (viewportX - baseLeft) * scale;
    const minimapY = offsetY + (viewportY - baseTop) * scale;
    const minimapWidth = viewportWidth * scale;
    const minimapHeight = viewportHeight * scale;

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
