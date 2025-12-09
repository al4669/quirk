// Main wallboard class
class Wallboard {
  constructor() {
    this.nodes = [];
    this.selectedNode = null;
    this.selectedNodes = new Set(); // For multi-select
    this.contextNode = null;
    this.isConnecting = false;
    this.connectStart = null;
    this.dragLine = null;
    this.nodeIdCounter = 0;
    this.connectionManager = new ConnectionManager(this, () => this.autoSave());
    this.editorManager = new EditorManager(this);
    this.editModeManager = new EditModeManager(this);
    this.nodeDragManager = new NodeDragManager(this);
    this.themeManager = new ThemeManager(this);
    this.zoomPanManager = new ZoomPanManager(this);
    this.nodeSelectionManager = new NodeSelectionManager(this);
    this.nodeOperationsManager = new NodeOperationsManager(this);
    this.contextMenuManager = new ContextMenuManager(this);
    this.nodeContentManager = new NodeContentManager(this);
    this.htmlPreviewManager = new HtmlPreviewManager(this);
    this.linkManager = new LinkManager(this);
    this.graphLayoutManager = new GraphLayoutManager(this);
    this.minimap = null; // Will be initialized after board loads

    // Properties for new drag-and-drop logic
    this.draggedNode = null;
    this.dragOffset = { x: 0, y: 0 };
    this.isDragging = false;

    // Group dragging state
    this.isGroupDragging = false;
    this.groupDragOffsets = new Map(); // nodeId -> {x, y} offset from primary node
    this.primaryDragNode = null;

    // Properties for connection dragging
    this.isConnectionDrag = false;
    this.connectionStartNode = null;
    this.currentMousePos = { x: 0, y: 0 };

    // Properties for connection cutting
    this.isCutting = false;
    this.cutPath = [];
    this.cutLine = null;

    // Theme system
    this.globalTheme = 'default';
    this.nodeThemes = {}; // Per-node theme overrides

    // Canvas boundaries
    this.canvasWidth = CanvasConfig.MIN_WIDTH;
    this.canvasHeight = CanvasConfig.MIN_HEIGHT;

    // Zoom and pan properties - start centered
    this.zoom = CanvasConfig.DEFAULT_ZOOM;
    this.panX = CanvasConfig.getInitialPanX(this.canvasWidth);
    this.panY = CanvasConfig.getInitialPanY(this.canvasHeight);
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.panUpdateTimeout = null;
    this.isAnyNodeEditing = false;

    // Board management
    this.currentBoardId = null;
    this.boards = {};
    this.autoSaveTimeout = null;

    this.alignmentManager = new AlignmentManager(this);
    this.executionManager = new ExecutionManager(this);
    this.nodeSizeCache = new Map();
    this.savingIndicatorEl = null;
    this.savingHideTimeout = null;
    this.viewWasRestored = false;

    this.init();
  }

  async init() {
    this.initSavingIndicator();
    // Initialize board system
    await this.initBoardSystem();

    // Create particles
    ParticleSystem.create();

    // Initialize connection manager
    this.connectionManager.init();

    // Set initial centered transform
    this.updateTransform();

    // Canvas click handler
    const handleCanvasClick = (e) => {
      // Don't exit edit mode if clicking on text editor or inside node
      if (e.target.classList.contains('text-editor') ||
        e.target.closest('.text-editor') ||
        e.target.closest('.node-content')) {
        return;
      }

      if (e.target.id === "canvas" && !this.isPanning) {
        this.deselectAll();
        this.exitAllEditModes();
      }

      // Close mobile menus when clicking canvas
      if (window.innerWidth <= 768) {
        document.querySelector('.toolbar')?.classList.remove('mobile-open');
        document.querySelector('.board-menu')?.classList.remove('mobile-open');
      }
    };

    document.getElementById("canvas").addEventListener("click", handleCanvasClick);
    document.getElementById("canvas").addEventListener("touchend", handleCanvasClick);

    // Prevent context menu on canvas
    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Hide context menu on click outside and exit edit modes
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".context-menu") &&
        !e.target.closest(".theme-selector") &&
        !e.target.classList.contains('text-editor')) {
        this.hideContextMenu();

        // Exit edit mode if clicking outside all nodes
        if (!e.target.closest(".node")) {
          this.exitAllEditModes();
        }
      }

      // Close mobile menus on click outside (deferred to run after button handlers)
      if (window.innerWidth <= 768) {
        setTimeout(() => {
          const toolbar = document.querySelector('.toolbar');
          const boardMenu = document.querySelector('.board-menu');

          const clickedToolbar = e.target.closest(".toolbar");
          const clickedToolbarBtn = e.target.closest(".mobile-menu-btn");
          const clickedBoardMenu = e.target.closest(".board-menu");
          const clickedBoardBtn = e.target.closest(".board-menu-btn");

          // Close toolbar if clicking outside
          if (!clickedToolbar && !clickedToolbarBtn && toolbar?.classList.contains('mobile-open')) {
            toolbar.classList.remove('mobile-open');
          }

          // Close board menu if clicking outside
          if (!clickedBoardMenu && !clickedBoardBtn && boardMenu?.classList.contains('mobile-open')) {
            boardMenu.classList.remove('mobile-open');
          }
        }, 0);
      }
    });

    // Handle menu button clicks
    document.querySelector('.mobile-menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const toolbar = document.querySelector('.toolbar');
      toolbar?.classList.toggle('mobile-open');
      // Close board menu if open
      document.querySelector('.board-menu')?.classList.remove('mobile-open');
    });

    document.querySelector('.board-menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const boardMenu = document.querySelector('.board-menu');
      boardMenu?.classList.toggle('mobile-open');
      // Close toolbar if open
      document.querySelector('.toolbar')?.classList.remove('mobile-open');
    });

    // Initialize keyboard shortcuts manager
    this.keyboardShortcuts = new KeyboardShortcuts(this);

    // Initialize minimap
    this.minimap = new Minimap(this);

    // Center view on nodes after initial load only if we have no restored view
    if (!this.viewWasRestored && this.nodes.length > 0) {
      setTimeout(() => {
        this.minimap.centerOnNodes();
      }, 100);
    }

    // Optimized drag event listeners - attached to document for better performance
    document.addEventListener("mousemove", this.handleMouseMove.bind(this), {
      passive: true,
    });
    document.addEventListener("mouseup", this.handleMouseUp.bind(this));
    document.addEventListener("mousedown", this.handleMouseDown.bind(this));

    // Zoom and pan event listeners
    document.addEventListener("wheel", this.handleWheel.bind(this), { passive: false });

    // Canvas pan listeners
    // Canvas pan listeners - attached to window for infinite panning
    window.addEventListener("mousedown", this.handleCanvasPanStart.bind(this));
    window.addEventListener("mousemove", this.handleCanvasPan.bind(this));
    window.addEventListener("mouseup", this.handleCanvasPanEnd.bind(this));

    // Event delegation for wiki-style [[links]] - handles clicks on .wiki-link elements
    document.addEventListener('click', (e) => {
      const wikiLink = e.target.closest('.wiki-link');
      if (wikiLink) {
        e.preventDefault();
        const nodeId = parseInt(wikiLink.getAttribute('data-node-id'));
        if (nodeId && !isNaN(nodeId)) {
          this.focusNode(nodeId);
        }
      }
    });
  }

  // Board Management System - delegated to BoardManager
  async initBoardSystem() {
    return BoardManager.initBoardSystem(this);
  }

  async createNewBoard(name = 'New Board') {
    return BoardManager.createNewBoard(this, name);
  }

  async loadBoard(boardId) {
    return BoardManager.loadBoard(this, boardId);
  }

  async saveCurrentBoard() {
    this.showSavingIndicator();
    try {
      return await BoardManager.saveCurrentBoard(this);
    } finally {
      this.hideSavingIndicator();
    }
  }

  async saveBoardsToStorage() {
    return BoardManager.saveBoardsToStorage(this);
  }

  autoSave() {
    // Debounced auto-save
    this.updateCanvasBounds();
    clearTimeout(this.autoSaveTimeout);
    this.showSavingIndicator();
    this.autoSaveTimeout = setTimeout(() => {
      this.saveCurrentBoard();
    }, 1000); // Save 1 second after last change
  }

  async loadGitHubBoard(githubUrl) {
    return BoardManager.loadGitHubBoard(this, githubUrl);
  }

  setupBoardSelector() {
    return BoardManager.setupBoardSelector(this);
  }

  updateBoardSelector() {
    return BoardManager.updateBoardSelector(this);
  }

  showNewBoardDialog() {
    return BoardManager.showNewBoardDialog(this);
  }

  async renameBoardDialog() {
    return BoardManager.renameBoardDialog(this);
  }

  async deleteBoardDialog() {
    return BoardManager.deleteBoardDialog(this);
  }

  // --- Node Operations - delegated to NodeOperationsManager ---

  addMarkdownNode(position = null) {
    return this.nodeOperationsManager.addMarkdownNode(position);
  }

  createNode(type, data, position = null) {
    return this.nodeOperationsManager.createNode(type, data, position);
  }

  // Helper function for backwards compatibility
  getNodeTitle(node) {
    return NodeUtils.getNodeTitle(node);
  }

  renderNode(node) {
    return NodeRenderer.render(this, node);
  }

  showContextMenu(e, node) {
    return this.contextMenuManager.showContextMenu(e, node);
  }

  // --- Zoom and Pan Handlers - delegated to ZoomPanManager ---

  handleWheel(e) {
    return this.zoomPanManager.handleWheel(e);
  }

  handleCanvasPanStart(e) {
    return this.zoomPanManager.handleCanvasPanStart(e);
  }

  handleCanvasPan(e) {
    return this.zoomPanManager.handleCanvasPan(e);
  }

  handleCanvasPanEnd(e) {
    return this.zoomPanManager.handleCanvasPanEnd(e);
  }

  updateTransform() {
    return this.zoomPanManager.updateTransform();
  }

  getNodeById(id) {
    return NodeUtils.getNodeById(id, this.nodes);
  }

  isShowingResult(nodeId) {
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (nodeEl) {
      return nodeEl.classList.contains('showing-result');
    }
    const node = this.getNodeById(nodeId);
    return !!node?.data?.showingResult;
  }

  setNodeSide(nodeId, side = 'content') {
    const node = this.getNodeById(nodeId);
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl || !node) return;

    const showResult = side === 'result' && !!node.data?.resultContent;
    node.data.showingResult = showResult;
    nodeEl.classList.toggle('showing-result', showResult);
    nodeEl.dataset.side = showResult ? 'result' : 'content';

    // Ensure result content is rendered when first shown
    if (showResult) {
      const resultEl = this.getContentElement(nodeId, 'result');
      if (resultEl && !resultEl.querySelector('.text-editor')) {
        resultEl.innerHTML = Sanitization.sanitize(this.renderNodeContent(node, 'result'));
        this.htmlPreviewManager?.hydrate(resultEl, node, 'result');
        this.enableCheckboxes(resultEl, node);
        const codeBlocks = resultEl.querySelectorAll('pre code');
        if (typeof Prism !== 'undefined') {
          codeBlocks.forEach(block => Prism.highlightElement(block));
        }
      }
    }

    // Recompute size and connections after flipping
    if (nodeEl.isConnected) {
      requestAnimationFrame(() => {
        this.updateNodeSizeFromElement(nodeId, nodeEl);
        this.updateConnections();
      });
    }
  }

  toggleResultSide(nodeId) {
    const node = this.getNodeById(nodeId);
    if (!node?.data?.resultContent) return;

    const activeContent = this.getActiveContentElement(nodeId);
    if (activeContent?.querySelector('.text-editor')) {
      // Save and close the current editor before flipping
      this.editModeManager.toggleEdit(nodeId);
    }

    const nextSide = this.isShowingResult(nodeId) ? 'content' : 'result';
    this.setNodeSide(nodeId, nextSide);

    // Refresh badge state to reflect which side is visible
    const state = this.executionManager?.executionState?.[nodeId] || {};
    this.executionManager?.updateStatusBadge(nodeId, state.status || 'idle', state);

    // Update connections after layout change
    setTimeout(() => this.updateConnections(), 50);
  }

  getContentElement(nodeId, side = null) {
    const resolvedSide = side || (this.isShowingResult(nodeId) ? 'result' : 'content');
    const id = resolvedSide === 'result' ? `result-content-${nodeId}` : `content-${nodeId}`;
    return document.getElementById(id);
  }

  getActiveContentElement(nodeId) {
    return this.getContentElement(nodeId);
  }

  // Convert screen coordinates to canvas coordinates
  screenToCanvas(screenX, screenY) {
    return CoordinateUtils.screenToCanvas(screenX, screenY, this.panX, this.panY, this.zoom);
  }

  // Convert canvas coordinates to screen coordinates
  canvasToScreen(canvasX, canvasY) {
    return CoordinateUtils.canvasToScreen(canvasX, canvasY, this.panX, this.panY, this.zoom);
  }

  updateNodeSize(nodeId, width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return;
    }
    this.nodeSizeCache.set(nodeId, { width, height });
  }

  updateNodeSizeFromElement(nodeId, element) {
    if (!element) return;
    const width = element.offsetWidth || 250;
    const height = element.offsetHeight || 180;
    this.updateNodeSize(nodeId, width, height);
  }

  getNodeSize(nodeId) {
    return this.nodeSizeCache.get(nodeId);
  }

  deleteNodeSize(nodeId) {
    this.nodeSizeCache.delete(nodeId);
  }

  clearNodeSizeCache() {
    this.nodeSizeCache.clear();
  }

  getNodeRect(node) {
    if (!node) return null;
    let size = this.getNodeSize(node.id);
    const nodeEl = document.getElementById(`node-${node.id}`);
    if (nodeEl) {
      this.updateNodeSizeFromElement(node.id, nodeEl);
      size = { width: nodeEl.offsetWidth || 250, height: nodeEl.offsetHeight || 180 };
    } else if (!size) {
      size = { width: 250, height: 180 };
    }

    return {
      left: node.position.x,
      top: node.position.y,
      right: node.position.x + size.width,
      bottom: node.position.y + size.height,
      width: size.width,
      height: size.height
    };
  }

  getDefaultNodeSize() {
    return { width: 250, height: 180 };
  }

  getViewportCenteredPosition(nodeSize = this.getDefaultNodeSize()) {
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    // Canvas has transform: translate(panX, panY) scale(zoom)
    const canvasX = (viewportCenterX - this.panX) / this.zoom;
    const canvasY = (viewportCenterY - this.panY) / this.zoom;

    return {
      x: canvasX - nodeSize.width / 2,
      y: canvasY - nodeSize.height / 2
    };
  }

  getNextNodePosition(referenceNodes = null, nodeSize = this.getDefaultNodeSize()) {
    // If no nodes exist, center the first node so it's visible
    if (!this.nodes || this.nodes.length === 0) {
      return this.getViewportCenteredPosition(nodeSize);
    }

    // Prefer explicit references, otherwise use the last node added
    let baseNodes = [];
    if (referenceNodes && referenceNodes.length) {
      const refIds = new Set(referenceNodes.map(r => (typeof r === 'object' ? r.id : r)));
      baseNodes = this.nodes.filter(n => refIds.has(n.id));
    }

    if (baseNodes.length === 0) {
      const lastNode = this.nodes[this.nodes.length - 1];
      if (lastNode) baseNodes = [lastNode];
    }

    const bounds = this.getNodesBounds(baseNodes);
    if (!bounds) {
      return this.getViewportCenteredPosition(nodeSize);
    }

    const shift = this.findAvailableDuplicateShift(bounds);
    const centeredY = bounds.top + (bounds.height - nodeSize.height) / 2;

    return {
      x: bounds.left + shift.x,
      y: Number.isFinite(centeredY) ? centeredY : bounds.top
    };
  }

  initSavingIndicator() {
    if (this.savingIndicatorEl) return;
    const el = document.createElement('div');
    el.className = 'saving-indicator';
    el.innerHTML = `
      <div class="saving-indicator__spinner">
        <span></span><span></span><span></span>
      </div>
      <div class="saving-indicator__text">
        <strong>Saving…</strong>
        <small>Don’t close</small>
      </div>
    `;
    document.body.appendChild(el);
    this.savingIndicatorEl = el;
    this.hideSavingIndicator(true);
  }

  showSavingIndicator() {
    if (!this.savingIndicatorEl) return;
    clearTimeout(this.savingHideTimeout);
    this.savingIndicatorEl.classList.add('visible');
    // Safety auto-hide in case something stalls
    this.savingHideTimeout = setTimeout(() => {
      this.hideSavingIndicator(true);
    }, 12000);
  }

  hideSavingIndicator(immediate = false) {
    if (!this.savingIndicatorEl) return;
    clearTimeout(this.savingHideTimeout);
    if (immediate) {
      this.savingIndicatorEl.classList.remove('visible');
      return;
    }
    setTimeout(() => {
      this.savingIndicatorEl.classList.remove('visible');
    }, 200);
  }

  getNodesBounds(nodes = []) {
    if (!nodes || nodes.length === 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    nodes.forEach(node => {
      const rect = this.getNodeRect(node);
      if (!rect) return;
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.right);
      maxY = Math.max(maxY, rect.bottom);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return null;
    }

    return {
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY)
    };
  }

  rectOverlapsNodes(rect, excludeIds = null) {
    if (!rect) return false;

    const exclude = excludeIds instanceof Set ? excludeIds : new Set();

    return this.nodes.some(node => {
      if (exclude.has(node.id)) return false;

      const nodeRect = this.getNodeRect(node);
      if (!nodeRect) return false;

      const separated = rect.right <= nodeRect.left ||
        rect.left >= nodeRect.right ||
        rect.bottom <= nodeRect.top ||
        rect.top >= nodeRect.bottom;
      return !separated;
    });
  }

  findAvailableDuplicateShift(bounds, excludeIds = null, gap = 200) {
    if (!bounds) {
      return { x: gap, y: 0 };
    }

    const exclude = excludeIds || new Set();
    const width = Math.max(bounds.width, 200);
    let shiftX = width + gap;
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      const candidateRect = {
        left: bounds.left + shiftX,
        right: bounds.right + shiftX,
        top: bounds.top,
        bottom: bounds.bottom
      };

      if (!this.rectOverlapsNodes(candidateRect, exclude)) {
        return { x: shiftX, y: 0 };
      }

      shiftX += width + gap;
      attempts += 1;
    }

    return { x: shiftX, y: 0 };
  }

  focusOnNodes(nodeIds = []) {
    if (!nodeIds || nodeIds.length === 0) return;
    const nodes = this.nodes.filter(node => nodeIds.includes(node.id));
    const bounds = this.getNodesBounds(nodes);
    if (!bounds) return;

    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    this.panX = viewportCenterX - (centerX * this.zoom);
    this.panY = viewportCenterY - (centerY * this.zoom);
    this.updateTransform();
  }

  updateCanvasBounds(padding = 0) {
    if (!this.nodes || this.nodes.length === 0) {
      this.canvasWidth = CanvasConfig.MIN_WIDTH;
      this.canvasHeight = CanvasConfig.MIN_HEIGHT;
      const canvasEl = document.getElementById('canvas');
      const connectionsEl = document.getElementById('connections');
      if (canvasEl) {
        canvasEl.style.width = `${this.canvasWidth}px`;
        canvasEl.style.height = `${this.canvasHeight}px`;
        canvasEl.style.transformOrigin = '0 0';
      }
      if (connectionsEl) {
        connectionsEl.setAttribute('width', this.canvasWidth);
        connectionsEl.setAttribute('height', this.canvasHeight);
      }
      if (this.minimap) {
        this.minimap.calculateScale();
      }
      return;
    }

    const bounds = this.getNodesBounds(this.nodes);
    if (!bounds) return;

    const offsetX = bounds.left - padding;
    const offsetY = bounds.top - padding;
    let didShift = false;

    // Only shift if nodes are going into negative coordinates (beyond padding)
    // We treat anything < -1 as needing correction. Positive offsets (moving right/down) are allowed.
    const shiftX = offsetX < -1 ? offsetX : 0;
    const shiftY = offsetY < -1 ? offsetY : 0;

    if (shiftX !== 0 || shiftY !== 0) {
      // Disable transitions to prevent visual twitching during coordinate reset
      document.body.classList.add('no-transition');

      this.nodes.forEach(node => {
        node.position.x -= shiftX;
        node.position.y -= shiftY;
        const nodeEl = document.getElementById(`node-${node.id}`);
        if (nodeEl) {
          nodeEl.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;
        }
      });

      this.panX += shiftX * this.zoom;
      this.panY += shiftY * this.zoom;
      this.updateTransform();

      // Force reflow to ensure the transform changes are applied instantly without transition
      document.body.offsetHeight;

      // Re-enable transitions
      document.body.classList.remove('no-transition');

      didShift = true;
    }

    const normalizedBounds = this.getNodesBounds(this.nodes);
    if (!normalizedBounds) return;

    // Use the right/bottom bounds to determine width/height, since we no longer force left/top to 0
    const width = Math.max(normalizedBounds.right + padding, CanvasConfig.MIN_WIDTH);
    const height = Math.max(normalizedBounds.bottom + padding, CanvasConfig.MIN_HEIGHT);

    this.canvasWidth = width;
    this.canvasHeight = height;

    const canvasEl = document.getElementById('canvas');
    const connectionsEl = document.getElementById('connections');
    if (canvasEl) {
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;
      canvasEl.style.transformOrigin = '0 0';
    }
    if (connectionsEl) {
      connectionsEl.setAttribute('width', width);
      connectionsEl.setAttribute('height', height);
    }

    if (this.minimap) {
      this.minimap.calculateScale();
    }

    if (didShift && this.connectionManager) {
      this.connectionManager.updateConnectionsInstant();
    }
  }

  // --- Mouse Event Handlers ---

  handleMouseDown(e) {
    // Global mouse down handler for cutting connections
    if (e.altKey) {
      e.preventDefault();
      this.startCutting(e);
    }
  }

  handleMouseMove(e) {
    this.currentMousePos = { x: e.clientX, y: e.clientY };

    if (this.isDragging && this.draggedNode) {
      this.handleNodeDrag(e);
    } else if (this.isConnectionDrag) {
      this.handleConnectionDrag(e);
    } else if (this.isCutting) {
      this.handleCutDrag(e);
    }
  }

  handleMouseUp(e) {
    if (this.isDragging) {
      this.endNodeDrag();
    } else if (this.isConnectionDrag) {
      this.endConnectionDrag(e);
    } else if (this.isCutting) {
      this.endCutting();
    }
  }


  // --- Node Dragging ---

  handleNodeDragStart(e, node, element) {
    return this.nodeDragManager.handleNodeDragStart(e, node, element);
  }

  setupGroupDrag(primaryNode) {
    return this.nodeDragManager.setupGroupDrag(primaryNode);
  }

  handleNodeDrag(e) {
    return this.nodeDragManager.handleNodeDrag(e);
  }

  endNodeDrag() {
    return this.nodeDragManager.endNodeDrag();
  }

  // --- Connection Dragging ---

  handleConnectionDragStart(startPos, node) {
    this.isConnectionDrag = true;
    this.connectionStartNode = node;
    this.connectStart = startPos;

    document.body.style.cursor = "crosshair";
    document.body.style.userSelect = "none";
    this.connectionManager.createDragLine();
  }

  handleConnectionDrag(e) {
    this.connectionManager.updateDragLine(this.connectStart, { x: e.clientX, y: e.clientY });
  }

  endConnectionDrag(e) {
    this.isConnectionDrag = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    // Find target node using DOM element detection
    const targetElement = document.elementFromPoint(e.clientX, e.clientY);
    const targetNode = this.getNodeFromElement(targetElement);

    if (targetNode && targetNode.id !== this.connectionStartNode.id) {
      this.connectionManager.createConnection(
        { nodeId: this.connectionStartNode.id },
        { nodeId: targetNode.id }
      );

      // Add link to ## Links section for drag-created connections
      if (this.linkManager) {
        const targetTitle = this.getNodeTitle(targetNode);
        this.linkManager.addLinkToSection(this.connectionStartNode.id, targetTitle);
      }
    }

    this.connectionManager.removeDragLine();
    this.connectionStartNode = null;
    this.connectStart = null;
  }

  // --- Connection Cutting ---

  startCutting(e) {
    this.isCutting = true;
    document.body.style.cursor = "crosshair";
    document.body.style.userSelect = "none";
    this.connectionManager.createCutLine();
    this.connectionManager.addCutPoint({ x: e.clientX, y: e.clientY });
  }

  handleCutDrag(e) {
    if (!this.isCutting) return;
    this.connectionManager.addCutPoint({ x: e.clientX, y: e.clientY });
  }

  endCutting() {
    this.isCutting = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    this.connectionManager.processConnectionCuts();
    this.connectionManager.removeCutLine();
  }

  cancelConnection() {
    if (this.isConnectionDrag) {
      this.isConnectionDrag = false;
      this.connectionManager.removeDragLine();
      this.connectionStartNode = null;
      this.connectStart = null;
      document.body.style.cursor = "";
    }
  }

  cancelCutting() {
    if (this.isCutting) {
      this.isCutting = false;
      this.cutPath = [];
      this.cutPathCanvas = [];
      document.body.style.cursor = "";
      this.connectionManager.removeCutLine();
    }
  }

  editNodeType(nodeId) {
    return this.nodeContentManager.editNodeType(nodeId);
  }

  // --- Theme Management - delegated to ThemeManager ---

  setGlobalTheme(themeKey) {
    return this.themeManager.setGlobalTheme(themeKey);
  }

  setNodeTheme(nodeId, themeKey) {
    return this.themeManager.setNodeTheme(nodeId, themeKey);
  }

  applyGlobalTheme() {
    return this.themeManager.applyGlobalTheme();
  }

  applyNodeTheme(nodeId) {
    return this.themeManager.applyNodeTheme(nodeId);
  }

  updateAllNodeThemes() {
    return this.themeManager.updateAllNodeThemes();
  }

  showThemeSelector(nodeId = null) {
    return this.themeManager.showThemeSelector(nodeId);
  }

  hideThemeSelector() {
    return this.themeManager.hideThemeSelector();
  }

  selectTheme(themeKey, nodeId = null) {
    return this.themeManager.selectTheme(themeKey, nodeId);
  }

  // --- Helper Methods ---


  getNodeFromElement(element) {
    // Traverse up the DOM tree to find a node
    let current = element;
    while (current && current !== document.body) {
      if (current.classList && current.classList.contains("node")) {
        const nodeId = parseInt(current.id.replace("node-", ""));
        return this.nodes.find(n => n.id === nodeId);
      }
      current = current.parentElement;
    }
    return null;
  }

  findNodeAtCanvasPosition(x, y) {
    // Find node that contains the given canvas coordinates
    return this.nodes.find(node => {
      const nodeLeft = node.position.x;
      const nodeTop = node.position.y;
      const nodeRight = node.position.x + 200; // Approximate node width
      const nodeBottom = node.position.y + 150; // Approximate node height

      return x >= nodeLeft && x <= nodeRight && y >= nodeTop && y <= nodeBottom;
    });
  }

  toggleEdit(nodeId) {
    return this.editModeManager.toggleEdit(nodeId);
  }

  updateEditingState() {
    return this.editModeManager.updateEditingState();
  }

  createConnection(start, end) {
    console.log("createConnection called with:", start, end);
    const connection = { id: Date.now(), start, end };
    this.connections.push(connection);
    console.log(
      "Connection added to array. Total connections:",
      this.connections.length
    );

    this.updateConnections();
    this.mockAPICall("createConnection", connection);
  }

  updateConnections() {
    // Delegate to ConnectionManager which uses proper DOM-based positioning
    if (this.connectionManager) {
      this.connectionManager.updateConnections();
    }
  }


  selectNode(node, isShiftClick = false) {
    return this.nodeSelectionManager.selectNode(node, isShiftClick);
  }

  deselectAll() {
    return this.nodeSelectionManager.deselectAll();
  }

  exitAllEditModes() {
    // Find all nodes currently in edit mode and save their content
    document.querySelectorAll(".text-editor").forEach(editor => {
      // The editor might be the CodeMirror wrapper, so find the parent content div
      let contentElement = editor.parentElement;

      // If the editor is the CodeMirror wrapper, it's directly inside the content div
      if (!contentElement || !contentElement.id || (!contentElement.id.startsWith('content-') && !contentElement.id.startsWith('result-content-'))) {
        // Try finding the closest parent with content-* or result-content-* id
        contentElement = editor.closest('[id^="content-"], [id^="result-content-"]');
      }

      // Check if we found a valid content element
      if (!contentElement || !contentElement.id) {
        console.warn('[exitAllEditModes] Could not find content element for editor', editor);
        return;
      }

      const contentId = contentElement.id;
      const nodeIdMatch = contentId.match(/(?:content|result-content)-(\d+)/);
      const nodeId = nodeIdMatch ? parseInt(nodeIdMatch[1], 10) : null;
      if (nodeId === null || Number.isNaN(nodeId)) {
        console.warn('[exitAllEditModes] Could not parse node id from content element', contentElement);
        return;
      }

      // Trigger save by calling toggleEdit
      this.toggleEdit(nodeId);
    });

    // Update editing state
    this.updateEditingState();
  }

  // --- Context Menu - delegated to ContextMenuManager ---

  hideContextMenu() {
    return this.contextMenuManager.hide();
  }

  editNode() {
    return this.contextMenuManager.editNode();
  }

  openInEditor(nodeId) {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (node) {
      this.editorManager.openNode(node);
    }
  }

  // Flip all nodes to result side (if available) and restore
  toggleFlipAllNodes() {
    if (!this._flipAllState) {
      // Save current side state
      this._flipAllState = {
        saved: new Map(this.nodes.map(n => [n.id, !!n.data?.showingResult])),
        phase: 'results'
      };
      this.nodes.forEach(n => {
        const hasResult = !!n.data?.resultContent;
        this.setNodeSide(n.id, hasResult ? 'result' : 'content');
      });
      Notifications?.show?.('Flipped all nodes to results', 'info');
    } else if (this._flipAllState.phase === 'results') {
      // Move to content phase
      this.nodes.forEach(n => this.setNodeSide(n.id, 'content'));
      this._flipAllState.phase = 'content';
      Notifications?.show?.('Flipped all nodes to content', 'info');
    } else {
      // Restore prior state
      this.nodes.forEach(n => {
        const wasResult = this._flipAllState.saved.get(n.id);
        this.setNodeSide(n.id, wasResult ? 'result' : 'content');
      });
      this._flipAllState = null;
      Notifications?.show?.('Restored node sides', 'info');
    }
  }

  // Focus on a specific node (pan and zoom to center it)
  focusNode(nodeId) {
    const node = this.getNodeById(nodeId);
    if (!node) return;

    const nodeEl = document.getElementById(`node-${node.id}`);
    if (!nodeEl) return;

    // Measure real node dimensions (handle zoomed-out state)
    const canvas = document.getElementById('canvas');
    const wasZoomedOut = canvas?.classList.contains('zoomed-out');

    if (wasZoomedOut) {
      canvas.classList.remove('zoomed-out');
    }

    const nodeWidth = nodeEl.offsetWidth || 250;
    const nodeHeight = nodeEl.offsetHeight || 180;

    if (wasZoomedOut) {
      canvas.classList.add('zoomed-out');
    }

    const nodeCenterX = node.position.x + nodeWidth / 2;
    const nodeCenterY = node.position.y + nodeHeight / 2;

    this.zoom = 1.0;

    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    this.panX = viewportCenterX - (nodeCenterX * this.zoom);
    this.panY = viewportCenterY - (nodeCenterY * this.zoom);

    this.zoomPanManager.updateTransform();

    // Select the focused node after a brief delay to ensure transform completes
    setTimeout(() => {
      this.selectNode(node, false);
    }, 10);
  }

  // Helper to render node content (uses cached HTML or marked.js)
  renderNodeContent(node, side = 'content') {
    return this.editModeManager.renderNodeContent(node, side);
  }

  // --- Node Content Management - delegated to NodeContentManager ---

  enableCheckboxes(contentElement, node) {
    return this.nodeContentManager.enableCheckboxes(contentElement, node);
  }

  handleCheckboxToggle(node, checkboxIndex, isChecked) {
    return this.nodeContentManager.handleCheckboxToggle(node, checkboxIndex, isChecked);
  }

  duplicateNode() {
    return this.nodeOperationsManager.duplicateNode();
  }

  deleteNode() {
    return this.nodeOperationsManager.deleteNode();
  }

  removeNode(nodeId) {
    return this.nodeOperationsManager.removeNode(nodeId);
  }

  maximizeNode(nodeId) {
    return MaximizeUtils.maximizeNode(this, nodeId);
  }

  minimizeNode(nodeId) {
    return MaximizeUtils.minimizeNode(this, nodeId);
  }

  toggleMaximizedEdit(nodeId) {
    return MaximizeUtils.toggleMaximizedEdit(this, nodeId);
  }

  clearBoard() {
    return this.nodeOperationsManager.clearBoard();
  }

  // Auto-arrange nodes using graph layout
  autoArrangeNodes(animate = true) {
    if (this.graphLayoutManager) {
      // Center on the middle of the default canvas size
      const centerX = CanvasConfig.MIN_WIDTH / 2;
      const centerY = CanvasConfig.MIN_HEIGHT / 2;

      // Pan to this center point
      const viewportCenterX = window.innerWidth / 2;
      const viewportCenterY = window.innerHeight / 2;

      // Animate pan if requested (simple interpolation could be added here, but direct set is safer for sync)
      this.panX = viewportCenterX - (centerX * this.zoom);
      this.panY = viewportCenterY - (centerY * this.zoom);
      this.zoomPanManager.updateTransform();

      this.graphLayoutManager.autoArrange({
        animate,
        targetCenter: { x: centerX, y: centerY }
      });
    }
  }

  saveBoard() {
    const data = {
      nodes: this.nodes,
      connections: this.connections,
    };

    this.mockAPICall("saveBoard", data).then(() => {
      Notifications.show("Board saved successfully!");
    });
  }

  mockAPICall(endpoint, data) {
    console.log(`Mock API call to: ${endpoint}`, data);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true });
      }, 500);
    });
  }

}

// Initialize wallboard
const wallboard = new Wallboard();

// Initialize export manager
const exportManager = new ExportManager(wallboard);

// Initialize alignment manager
const alignmentManager = new AlignmentManager(wallboard);
wallboard.alignmentManager = alignmentManager;

// Initialize theme system
wallboard.applyGlobalTheme();

// Initialize mobile or desktop interface based on device
let mobileInterface = null;
const isMobileDevice = DeviceUtils.isMobile();

console.log('Mobile detection:', DeviceUtils.getDeviceInfo());

if (isMobileDevice) {
  console.log('Initializing mobile interface...');
  // Initialize mobile interface after boards are loaded
  if (typeof MobileInterface !== 'undefined') {
    mobileInterface = new MobileInterface(wallboard);
  } else {
    console.error('MobileInterface class not found!');
  }
} else {
  console.log('Desktop mode - canvas interface active');
}
