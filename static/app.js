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
    this.canvasWidth = CanvasConfig.WIDTH;
    this.canvasHeight = CanvasConfig.HEIGHT;

    // Zoom and pan properties - start centered
    this.zoom = CanvasConfig.DEFAULT_ZOOM;
    this.panX = CanvasConfig.getInitialPanX();
    this.panY = CanvasConfig.getInitialPanY();
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

    this.init();
  }

  async init() {
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

    // Center view on nodes after initial load
    if (this.nodes.length > 0) {
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
    const canvas = document.getElementById("canvas");
    canvas.addEventListener("mousedown", this.handleCanvasPanStart.bind(this));
    canvas.addEventListener("mousemove", this.handleCanvasPan.bind(this));
    canvas.addEventListener("mouseup", this.handleCanvasPanEnd.bind(this));

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
    return BoardManager.saveCurrentBoard(this);
  }

  async saveBoardsToStorage() {
    return BoardManager.saveBoardsToStorage(this);
  }

  autoSave() {
    // Debounced auto-save
    clearTimeout(this.autoSaveTimeout);
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

  // Convert screen coordinates to canvas coordinates
  screenToCanvas(screenX, screenY) {
    return CoordinateUtils.screenToCanvas(screenX, screenY, this.panX, this.panY, this.zoom);
  }

  // Convert canvas coordinates to screen coordinates
  canvasToScreen(canvasX, canvasY) {
    return CoordinateUtils.canvasToScreen(canvasX, canvasY, this.panX, this.panY, this.zoom);
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
      if (!contentElement || !contentElement.id || !contentElement.id.startsWith('content-')) {
        // Try finding the closest parent with content-* id
        contentElement = editor.closest('[id^="content-"]');
      }

      // Check if we found a valid content element
      if (!contentElement || !contentElement.id) {
        console.warn('[exitAllEditModes] Could not find content element for editor', editor);
        return;
      }

      const contentId = contentElement.id;
      const nodeId = parseInt(contentId.replace("content-", ""));

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
  renderNodeContent(node) {
    return this.editModeManager.renderNodeContent(node);
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
      this.graphLayoutManager.autoArrange(animate, true); // Pan to center after arranging
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
