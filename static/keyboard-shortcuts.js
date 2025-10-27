// Keyboard Shortcuts Manager for QUIRK
class KeyboardShortcuts {
  constructor(wallboard) {
    this.wallboard = wallboard;
    this.commandHistory = []; // For undo/redo functionality
    this.historyIndex = -1;
    this.maxHistorySize = 50;
    this.currentCommandData = null; // For storing pending command data

    this.init();
  }

  init() {
    document.addEventListener("keydown", (e) => this.handleKeydown(e));
  }

  handleKeydown(e) {
    // Handle Esc key specially - it should work even in text editors
    if (e.key === 'Escape') {
      this.handleEscape();
      return;
    }

    // Don't process other shortcuts if user is typing in a text field
    if (e.target.matches('input, textarea, .text-editor')) {
      return;
    }

    // Handle keyboard shortcuts
    switch (e.key.toLowerCase()) {
      case 'delete':
      case 'backspace':
        if (this.wallboard.selectedNode) {
          this.deleteSelectedNodes();
        }
        break;

      case 'd':
        if (this.wallboard.selectedNodes.size > 0) {
          e.preventDefault();
          this.duplicateSelectedNodes();
        }
        break;

      case 'e':
        if (this.wallboard.selectedNode) {
          e.preventDefault();

          // In zoomed-out mode, edit the node title instead of full content
          if (this.wallboard.zoom <= 0.3) {
            this.editNodeTitle(this.wallboard.selectedNode);
          } else {
            this.wallboard.toggleEdit(this.wallboard.selectedNode.id);
          }
        }
        break;

      case 'z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (e.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
        }
        break;

      case 'y':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.redo();
        }
        break;

      case 'a':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.selectAllNodes();
        } else {
          e.preventDefault();
          this.wallboard.autoArrangeNodes();
        }
        break;

      case 'i':
        e.preventDefault();
        this.addConnectedMarkdownNode();
        break;

      case 'm':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.addConnectedMarkdownNode();
        }
        break;

      case 'h':
        e.preventDefault();
        this.toggleHelpModal();
        break;

      case 'f':
        e.preventDefault();
        if (this.wallboard.selectedNode) {
          this.focusOnSelectedNode();
        } else {
          this.showCommandPalette();
        }
        break;

      case 'k':
        e.preventDefault();
        if (window.aiChat) {
          window.aiChat.toggle();
        }
        break;

      case 'c':
        e.preventDefault();
        this.centerView();
        break;

      case 'arrowup':
      case 'arrowdown':
      case 'arrowleft':
      case 'arrowright':
        e.preventDefault();
        this.handleArrowNavigation(e.key.toLowerCase());
        break;
    }
  }

  handleEscape() {
    // Check if AI chat is open - close it first
    if (window.aiChat && window.aiChat.isOpen) {
      window.aiChat.close();
      return;
    }

    // Check if we're in edit mode
    const isEditing = document.querySelector('.text-editor') !== null;

    this.wallboard.cancelConnection();
    this.wallboard.cancelCutting();

    // Only deselect if we're not exiting edit mode
    if (!isEditing) {
      this.wallboard.deselectAll();
    }

    this.wallboard.exitAllEditModes();
    this.wallboard.hideContextMenu();
    this.wallboard.hideThemeSelector();
    this.hideHelpModal();
    this.hideCommandPalette();
  }

  toggleHelpModal() {
    const existingModal = document.getElementById('help-modal');
    if (existingModal) {
      this.hideHelpModal();
    } else {
      this.showHelpModal();
    }
  }

  showHelpModal() {
    // Remove existing modal if present
    this.hideHelpModal();

    const modal = document.createElement('div');
    modal.id = 'help-modal';
    modal.className = 'help-modal';
    modal.innerHTML = `
      <div class="help-modal-overlay"></div>
      <div class="help-modal-content">
        <div class="help-modal-header">
          <h3>Keyboard Shortcuts & Controls</h3>
          <button class="close-btn" onclick="wallboard.keyboardShortcuts.hideHelpModal()">×</button>
        </div>
        <div class="help-modal-body">
          <div class="help-section">
            <h4>Canvas Controls</h4>
            <div class="help-item">
              <span class="help-key">Mouse Wheel</span>
              <span class="help-description">Zoom in/out</span>
            </div>
            <div class="help-item">
              <span class="help-key">Drag Canvas</span>
              <span class="help-description">Pan around</span>
            </div>
            <div class="help-item">
              <span class="help-key">C</span>
              <span class="help-description">Center view on all nodes</span>
            </div>
          </div>

          <div class="help-section">
            <h4>Node Operations</h4>
            <div class="help-item">
              <span class="help-key">Drag</span>
              <span class="help-description">From card content to connect nodes</span>
            </div>
            <div class="help-item">
              <span class="help-key">Alt + Drag</span>
              <span class="help-description">Cut connections</span>
            </div>
            <div class="help-item">
              <span class="help-key">Shift + Click</span>
              <span class="help-description">Multi-select nodes</span>
            </div>
            <div class="help-item">
              <span class="help-key">Arrow Keys</span>
              <span class="help-description">Navigate between cards</span>
            </div>
            <div class="help-item">
              <span class="help-key">I</span>
              <span class="help-description">Insert new node</span>
            </div>
            <div class="help-item">
              <span class="help-key">D</span>
              <span class="help-description">Duplicate selected nodes</span>
            </div>
            <div class="help-item">
              <span class="help-key">E</span>
              <span class="help-description">Edit node (title when zoomed out, content otherwise)</span>
            </div>
            <div class="help-item">
              <span class="help-key">A</span>
              <span class="help-description">Auto-arrange nodes</span>
            </div>
            <div class="help-item">
              <span class="help-key">F</span>
              <span class="help-description">Search nodes (or focus on selected node)</span>
            </div>
            <div class="help-item">
              <span class="help-key">Delete / Backspace</span>
              <span class="help-description">Delete selected nodes</span>
            </div>
          </div>

          <div class="help-section">
            <h4>Editing</h4>
            <div class="help-item">
              <span class="help-key">Ctrl + Z / Ctrl + Y</span>
              <span class="help-description">Undo / Redo</span>
            </div>
            <div class="help-item">
              <span class="help-key">Ctrl + A</span>
              <span class="help-description">Select all nodes</span>
            </div>
          </div>

          <div class="help-section">
            <h4>Other</h4>
            <div class="help-item">
              <span class="help-key">K</span>
              <span class="help-description">Toggle AI Chat Assistant</span>
            </div>
            <div class="help-item">
              <span class="help-key">H</span>
              <span class="help-description">Toggle this help modal</span>
            </div>
            <div class="help-item">
              <span class="help-key">Esc</span>
              <span class="help-description">Cancel operations / Close dialogs</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add click handler to close when clicking overlay
    const overlay = modal.querySelector('.help-modal-overlay');
    overlay.addEventListener('click', () => this.hideHelpModal());

    // Prevent all interaction with elements behind the modal
    const preventInteraction = (e) => {
      e.stopPropagation();
    };

    // Stop mousedown, touchstart, and wheel events from reaching the canvas
    modal.addEventListener('mousedown', preventInteraction, true);
    modal.addEventListener('touchstart', preventInteraction, true);
    modal.addEventListener('wheel', preventInteraction, true);

    // Fade in animation
    requestAnimationFrame(() => {
      modal.classList.add('show');
    });
  }

  hideHelpModal() {
    const modal = document.getElementById('help-modal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    }
  }

  deleteSelectedNodes() {
    if (this.wallboard.selectedNodes.size === 0) return;

    const nodesToDelete = Array.from(this.wallboard.selectedNodes);
    this.saveState('delete_nodes', { nodeIds: nodesToDelete });

    nodesToDelete.forEach(nodeId => {
      this.wallboard.removeNode(nodeId);
    });

    this.wallboard.deselectAll();
  }

  duplicateSelectedNodes() {
    if (this.wallboard.selectedNodes.size === 0) return;

    // Record the BEFORE state first (this captures the state before any changes)
    this.saveState('duplicate_nodes', {
      originalNodeIds: Array.from(this.wallboard.selectedNodes)
    });

    const nodesToDuplicate = Array.from(this.wallboard.selectedNodes).map(nodeId =>
      this.wallboard.nodes.find(n => n.id === nodeId)
    ).filter(node => node !== undefined);

    if (nodesToDuplicate.length === 0) return;

    // Create a map of old node IDs to new node IDs for connection mapping
    const nodeIdMapping = new Map();
    const duplicatedNodes = [];
    const offset = 30; // Offset for positioning duplicated nodes

    // First pass: create all new nodes
    nodesToDuplicate.forEach(originalNode => {
      const newNodeId = this.wallboard.nodeIdCounter++;
      nodeIdMapping.set(originalNode.id, newNodeId);

      // Generate unique title for the duplicate
      const originalTitle = this.wallboard.getNodeTitle(originalNode);
      const uniqueTitle = NodeUtils.generateUniqueTitle(originalTitle, this.wallboard.nodes);

      const duplicatedNode = {
        ...originalNode,
        id: newNodeId,
        title: uniqueTitle,
        position: {
          x: originalNode.position.x + offset,
          y: originalNode.position.y + offset,
        },
        data: { ...originalNode.data },
      };

      duplicatedNodes.push(duplicatedNode);
      this.wallboard.nodes.push(duplicatedNode);
    });

    // Second pass: duplicate connections between the selected nodes
    const originalConnections = [...this.wallboard.connectionManager.connections];
    const newConnections = [];

    originalConnections.forEach(connection => {
      const startNodeInSelection = nodeIdMapping.has(connection.start.nodeId);
      const endNodeInSelection = nodeIdMapping.has(connection.end.nodeId);

      // Only duplicate connections where both nodes are in the selection
      if (startNodeInSelection && endNodeInSelection) {
        const newConnection = {
          id: Date.now() + Math.random(), // Ensure unique ID
          start: { nodeId: nodeIdMapping.get(connection.start.nodeId) },
          end: { nodeId: nodeIdMapping.get(connection.end.nodeId) }
        };
        newConnections.push(newConnection);
        this.wallboard.connectionManager.connections.push(newConnection);
      }
    });

    // Apply themes to duplicated nodes BEFORE rendering (so it's part of the same operation)
    duplicatedNodes.forEach((node, index) => {
      const originalNode = nodesToDuplicate[index];
      if (originalNode && this.wallboard.nodeThemes[originalNode.id]) {
        // Copy the theme from the original node to the duplicated node
        this.wallboard.nodeThemes[node.id] = this.wallboard.nodeThemes[originalNode.id];
      }
    });

    // Render all duplicated nodes (themes are already applied)
    duplicatedNodes.forEach(node => {
      this.wallboard.renderNode(node);
    });

    // Update connections display
    this.wallboard.connectionManager.updateConnections();

    // Select the duplicated nodes
    this.wallboard.deselectAll();
    duplicatedNodes.forEach(node => {
      this.wallboard.selectedNodes.add(node.id);
      document.getElementById(`node-${node.id}`).classList.add("selected");
    });

    // Set the first duplicated node as the primary selected node
    if (duplicatedNodes.length > 0) {
      this.wallboard.selectedNode = duplicatedNodes[0];
    }

    this.wallboard.autoSave();

    // Finalize the state to capture the complete after-state for redo
    this.finalizeState();
  }

  selectAllNodes() {
    this.wallboard.deselectAll();

    this.wallboard.nodes.forEach(node => {
      this.wallboard.selectedNodes.add(node.id);
      document.getElementById(`node-${node.id}`).classList.add("selected");
    });

    if (this.wallboard.nodes.length > 0) {
      this.wallboard.selectedNode = this.wallboard.nodes[0];
    }

    // Highlight all connections when all nodes are selected
    if (this.wallboard.selectedNodes.size > 1) {
      this.wallboard.connectionManager.highlightConnectionsForMultipleNodes(Array.from(this.wallboard.selectedNodes));
    }
  }

  // Undo/Redo functionality
  saveState(action, data) {
    // Store the current state as the BEFORE state
    this.currentCommandData = {
      action,
      data,
      timestamp: Date.now(),
      beforeState: {
        nodes: JSON.parse(JSON.stringify(this.wallboard.nodes)),
        connections: JSON.parse(JSON.stringify(this.wallboard.connectionManager.connections)),
        connectionThemes: JSON.parse(JSON.stringify(this.wallboard.connectionManager.connectionThemes)),
        nodeThemes: JSON.parse(JSON.stringify(this.wallboard.nodeThemes)),
        nodeIdCounter: this.wallboard.nodeIdCounter
      }
    };
  }

  finalizeState() {
    // Call this method after an operation is complete to save the after-state
    if (!this.currentCommandData) return;

    const state = {
      ...this.currentCommandData,
      afterState: {
        nodes: JSON.parse(JSON.stringify(this.wallboard.nodes)),
        connections: JSON.parse(JSON.stringify(this.wallboard.connectionManager.connections)),
        connectionThemes: JSON.parse(JSON.stringify(this.wallboard.connectionManager.connectionThemes)),
        nodeThemes: JSON.parse(JSON.stringify(this.wallboard.nodeThemes)),
        nodeIdCounter: this.wallboard.nodeIdCounter
      }
    };

    // Remove any history after current index (when user made changes after undo)
    this.commandHistory = this.commandHistory.slice(0, this.historyIndex + 1);

    // Add new state
    this.commandHistory.push(state);

    // Limit history size
    if (this.commandHistory.length > this.maxHistorySize) {
      this.commandHistory.shift();
    } else {
      this.historyIndex++;
    }

    this.currentCommandData = null;
  }

  undo() {
    if (this.historyIndex < 0) return;

    const command = this.commandHistory[this.historyIndex];
    if (!command || !command.beforeState) return;

    // Restore the state BEFORE the action was performed
    this.restoreState(command.beforeState);

    this.historyIndex--;
    Notifications.show('Undone');
  }

  redo() {
    if (this.historyIndex >= this.commandHistory.length - 1) return;

    this.historyIndex++;
    const command = this.commandHistory[this.historyIndex];
    if (!command || !command.afterState) return;

    // Restore the state AFTER the action was performed
    this.restoreState(command.afterState);

    Notifications.show('Redone');
  }

  restoreState(state) {
    // Clear current state
    this.wallboard.deselectAll();
    document.querySelectorAll(".node").forEach(n => n.remove());

    // Restore all state
    this.wallboard.nodes = JSON.parse(JSON.stringify(state.nodes));
    this.wallboard.connectionManager.connections = JSON.parse(JSON.stringify(state.connections));
    this.wallboard.connectionManager.connectionThemes = JSON.parse(JSON.stringify(state.connectionThemes || {}));
    this.wallboard.nodeThemes = JSON.parse(JSON.stringify(state.nodeThemes));
    this.wallboard.nodeIdCounter = state.nodeIdCounter;

    // Migrate old "type" field to new "title" field for backwards compatibility
    this.wallboard.nodes.forEach(node => {
      if (node.type && !node.title) {
        node.title = node.type;
        delete node.type;
      }
    });

    // Re-render all nodes
    this.wallboard.nodes.forEach(node => {
      this.wallboard.renderNode(node);
    });

    // Update connections
    this.wallboard.connectionManager.updateConnections();

    // Auto-save the restored state
    this.wallboard.autoSave();
  }

  // Method to be called when any significant change happens
  recordChange(action, data = {}) {
    this.saveState(action, data);
    // For most operations, finalize immediately
    // (duplication handles this manually because it's more complex)
    if (action !== 'duplicate_nodes') {
      // Use a small timeout to ensure the DOM and state updates are complete
      setTimeout(() => {
        this.finalizeState();
      }, 10);
    }
  }

  focusOnSelectedNode() {
    if (!this.wallboard.selectedNode) return;

    const node = this.wallboard.selectedNode;
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

    // Get node's center position in canvas coordinates
    const nodeCenterX = node.position.x + nodeWidth / 2;
    const nodeCenterY = node.position.y + nodeHeight / 2;

    // Set zoom to 100% (1.0)
    this.wallboard.zoom = 1.0;

    // Calculate pan to center the node in viewport
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    // Pan so that node center appears at viewport center
    this.wallboard.panX = viewportCenterX - (nodeCenterX * this.wallboard.zoom);
    this.wallboard.panY = viewportCenterY - (nodeCenterY * this.wallboard.zoom);

    // Apply the transform
    this.wallboard.zoomPanManager.updateTransform();
  }

  centerView() {
    if (this.wallboard.minimap) {
      this.wallboard.minimap.centerOnNodes();
    }
  }

  editNodeTitle(node) {
    const nodeEl = document.getElementById(`node-${node.id}`);
    if (!nodeEl) return;

    const header = nodeEl.querySelector('.node-header');
    const nodeTypeElement = header.querySelector('.node-type');
    if (!nodeTypeElement) return;

    const currentTitle = this.wallboard.getNodeTitle(node);

    // Store original dimensions
    const currentWidth = nodeEl.offsetWidth;
    const currentHeight = nodeEl.offsetHeight;

    // Create inline editor
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.className = 'node-type-inline-editor';
    input.style.width = '100%';
    input.style.fontSize = getComputedStyle(nodeTypeElement).fontSize;
    input.style.fontFamily = getComputedStyle(nodeTypeElement).fontFamily;
    input.style.textAlign = 'center';
    input.style.background = 'transparent';

    // Get the actual computed color from the node type element (which has the node's theme applied)
    const computedColor = getComputedStyle(nodeTypeElement).color;
    input.style.border = 'none';
    input.style.color = computedColor;
    input.style.padding = '8px';
    input.style.borderRadius = '8px';
    input.style.outline = 'none';

    // Lock node dimensions during editing
    nodeEl.style.width = currentWidth + 'px';
    nodeEl.style.height = currentHeight + 'px';
    nodeEl.style.minWidth = currentWidth + 'px';
    nodeEl.style.minHeight = currentHeight + 'px';

    // Replace text with input
    nodeTypeElement.style.display = 'none';
    header.appendChild(input);
    input.focus();
    input.select();

    let isFinishing = false;
    const finishEditing = () => {
      if (isFinishing) return;
      isFinishing = true;

      const newTitle = input.value.trim() || 'Untitled';

      // Update the node title FIRST before updating references
      node.title = newTitle;
      node.type = newTitle; // Keep for backwards compatibility
      nodeTypeElement.textContent = newTitle.toUpperCase();
      nodeTypeElement.style.display = '';
      input.remove();

      // Unlock node dimensions
      nodeEl.style.width = '';
      nodeEl.style.height = '';
      nodeEl.style.minWidth = '';
      nodeEl.style.minHeight = '';

      // Only update references if title actually changed
      if (newTitle !== currentTitle) {
        // Update all [[link]] references in other nodes
        if (this.wallboard.linkManager) {
          this.wallboard.linkManager.updateAllReferencesToNode(node.id, currentTitle, newTitle);
        }
      }

      this.wallboard.autoSave();

      // Remove document click handler
      document.removeEventListener('mousedown', outsideClickHandler);
    };

    const cancelEditing = () => {
      if (isFinishing) return;
      isFinishing = true;

      nodeTypeElement.style.display = '';
      input.remove();
      // Unlock node dimensions
      nodeEl.style.width = '';
      nodeEl.style.height = '';
      nodeEl.style.minWidth = '';
      nodeEl.style.minHeight = '';

      // Remove document click handler
      document.removeEventListener('mousedown', outsideClickHandler);
    };

    // Handle clicks outside the input
    const outsideClickHandler = (event) => {
      if (!input.contains(event.target) && event.target !== input) {
        finishEditing();
      }
    };

    // Add document click handler with a small delay to avoid immediate trigger
    setTimeout(() => {
      document.addEventListener('mousedown', outsideClickHandler);
    }, 100);

    input.addEventListener('blur', () => {
      // Small delay to ensure blur happens properly
      setTimeout(finishEditing, 10);
    });
    input.addEventListener('keydown', (ke) => {
      if (ke.key === 'Enter') {
        finishEditing();
      } else if (ke.key === 'Escape') {
        cancelEditing();
      }
    });
  }

  showCommandPalette() {
    // Don't show if already open
    if (document.getElementById('command-palette')) return;

    // Lock background scroll
    document.body.style.overflow = 'hidden';

    const palette = document.createElement('div');
    palette.id = 'command-palette';
    palette.className = 'command-palette';

    palette.innerHTML = `
      <div class="command-palette-overlay"></div>
      <div class="command-palette-content">
        <input
          type="text"
          class="command-palette-input"
          placeholder="Search nodes..."
          autocomplete="off"
          spellcheck="false"
        />
        <div class="command-palette-results"></div>
      </div>
    `;

    document.body.appendChild(palette);

    const input = palette.querySelector('.command-palette-input');
    const results = palette.querySelector('.command-palette-results');
    const overlay = palette.querySelector('.command-palette-overlay');

    let selectedIndex = 0;
    let filteredNodes = [];

    // Render results
    const renderResults = (searchTerm = '') => {
      const term = searchTerm.toLowerCase();

      filteredNodes = this.wallboard.nodes.filter(node => {
        const title = this.wallboard.getNodeTitle(node).toLowerCase();
        const content = node.data.content.toLowerCase();
        return title.includes(term) || content.includes(term);
      });

      // Sort by title
      filteredNodes.sort((a, b) => {
        const titleA = this.wallboard.getNodeTitle(a).toLowerCase();
        const titleB = this.wallboard.getNodeTitle(b).toLowerCase();
        return titleA.localeCompare(titleB);
      });

      selectedIndex = 0;

      if (filteredNodes.length === 0) {
        results.innerHTML = '<div class="command-palette-empty">No nodes found</div>';
        return;
      }

      results.innerHTML = filteredNodes.map((node, index) => {
        const title = this.wallboard.getNodeTitle(node);
        const preview = node.data.content.substring(0, 100).replace(/\n/g, ' ');

        return `
          <div class="command-palette-item ${index === 0 ? 'selected' : ''}" data-index="${index}">
            <div class="command-palette-item-title">${this.escapeHtml(title)}</div>
            <div class="command-palette-item-preview">${this.escapeHtml(preview)}</div>
          </div>
        `;
      }).join('');

      // Add click handlers
      results.querySelectorAll('.command-palette-item').forEach((item, index) => {
        item.addEventListener('click', () => {
          this.selectNodeFromPalette(filteredNodes[index]);
        });
      });
    };

    // Handle input
    input.addEventListener('input', (e) => {
      renderResults(e.target.value);
    });

    // Handle keyboard navigation
    input.addEventListener('keydown', (e) => {
      const items = results.querySelectorAll('.command-palette-item');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectedIndex < filteredNodes.length - 1) {
          items[selectedIndex].classList.remove('selected');
          selectedIndex++;
          items[selectedIndex].classList.add('selected');
          items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectedIndex > 0) {
          items[selectedIndex].classList.remove('selected');
          selectedIndex--;
          items[selectedIndex].classList.add('selected');
          items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredNodes[selectedIndex]) {
          this.selectNodeFromPalette(filteredNodes[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideCommandPalette();
      }
    });

    // Close on overlay click
    overlay.addEventListener('click', () => {
      this.hideCommandPalette();
    });

    // Prevent scroll propagation to background
    const paletteContent = palette.querySelector('.command-palette-content');
    paletteContent.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });

    // Initial render
    renderResults();

    // Fade in animation and focus input
    requestAnimationFrame(() => {
      palette.classList.add('show');
      // Focus input after the DOM has settled
      requestAnimationFrame(() => {
        input.focus();
      });
    });
  }

  hideCommandPalette() {
    const palette = document.getElementById('command-palette');
    if (palette) {
      palette.classList.remove('show');
      setTimeout(() => {
        palette.remove();
        // Restore background scroll
        document.body.style.overflow = '';
      }, 200);
    }
  }

  selectNodeFromPalette(node) {
    this.hideCommandPalette();

    // Deselect all and select this node
    this.wallboard.deselectAll();
    this.wallboard.selectedNode = node;
    this.wallboard.selectedNodes.add(node.id);

    const nodeEl = document.getElementById(`node-${node.id}`);
    if (nodeEl) {
      nodeEl.classList.add('selected');
    }

    // Focus on the selected node
    this.focusOnSelectedNode();
  }

  addConnectedMarkdownNode() {
    // If a node is selected, create a new node positioned near it
    if (this.wallboard.selectedNode) {
      const selectedNode = this.wallboard.selectedNode;
      const selectedEl = document.getElementById(`node-${selectedNode.id}`);

      // Calculate position to the right of the selected node
      // Use actual node width to avoid overlap, plus spacing
      const spacing = 50; // Gap between nodes
      let newX = selectedNode.position.x;
      let newY = selectedNode.position.y;

      if (selectedEl) {
        // Position to the right of the selected node
        newX = selectedNode.position.x + selectedEl.offsetWidth + spacing;
      } else {
        // Fallback if element not found
        newX = selectedNode.position.x + 300;
      }

      const newPosition = {
        x: newX,
        y: newY
      };

      // Create the new node with the calculated position
      const newNode = this.wallboard.addMarkdownNode(newPosition);

      // Create a connection from the selected node to the new node
      if (newNode) {
        this.wallboard.connectionManager.createConnection(
          { nodeId: selectedNode.id },
          { nodeId: newNode.id }
        );

        // Add link to ## Links section
        if (this.wallboard.linkManager) {
          const newNodeTitle = this.wallboard.getNodeTitle(newNode);
          this.wallboard.linkManager.addLinkToSection(selectedNode.id, newNodeTitle);
        }

        // Select the newly created node
        this.wallboard.selectNode(newNode, false);
      }
    } else {
      // No node selected, just create a node at default position
      this.wallboard.addMarkdownNode();
    }
  }

  handleArrowNavigation(direction) {
    // If no node is selected, select the first node
    if (!this.wallboard.selectedNode && this.wallboard.nodes.length > 0) {
      const firstNode = this.wallboard.nodes[0];
      this.wallboard.selectNode(firstNode, false);
      return;
    }

    // If no nodes exist, do nothing
    if (this.wallboard.nodes.length === 0) {
      return;
    }

    const currentNode = this.wallboard.selectedNode;
    if (!currentNode) return;

    // Get current node's center position
    const currentEl = document.getElementById(`node-${currentNode.id}`);
    if (!currentEl) return;

    const currentCenterX = currentNode.position.x + currentEl.offsetWidth / 2;
    const currentCenterY = currentNode.position.y + currentEl.offsetHeight / 2;

    // Find the nearest node in the specified direction
    let nearestNode = null;
    let minDistance = Infinity;

    this.wallboard.nodes.forEach(node => {
      if (node.id === currentNode.id) return; // Skip current node

      const nodeEl = document.getElementById(`node-${node.id}`);
      if (!nodeEl) return;

      const nodeCenterX = node.position.x + nodeEl.offsetWidth / 2;
      const nodeCenterY = node.position.y + nodeEl.offsetHeight / 2;

      // Calculate relative position
      const deltaX = nodeCenterX - currentCenterX;
      const deltaY = nodeCenterY - currentCenterY;

      // Check if node is in the correct direction
      let isInDirection = false;
      let distance = 0;

      switch (direction) {
        case 'arrowup':
          // Node should be above (negative Y)
          if (deltaY < -10) { // 10px threshold to avoid near-horizontal nodes
            isInDirection = true;
            // Distance combines vertical distance (primary) and horizontal offset (secondary)
            distance = Math.abs(deltaY) + Math.abs(deltaX) * 0.5;
          }
          break;

        case 'arrowdown':
          // Node should be below (positive Y)
          if (deltaY > 10) {
            isInDirection = true;
            distance = Math.abs(deltaY) + Math.abs(deltaX) * 0.5;
          }
          break;

        case 'arrowleft':
          // Node should be to the left (negative X)
          if (deltaX < -10) {
            isInDirection = true;
            distance = Math.abs(deltaX) + Math.abs(deltaY) * 0.5;
          }
          break;

        case 'arrowright':
          // Node should be to the right (positive X)
          if (deltaX > 10) {
            isInDirection = true;
            distance = Math.abs(deltaX) + Math.abs(deltaY) * 0.5;
          }
          break;
      }

      // Update nearest node if this one is closer
      if (isInDirection && distance < minDistance) {
        minDistance = distance;
        nearestNode = node;
      }
    });

    // If we found a node in that direction, select it
    if (nearestNode) {
      this.wallboard.selectNode(nearestNode, false);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}