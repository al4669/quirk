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
    // Don't process shortcuts if user is typing in a text field
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

      case 'escape':
        this.handleEscape();
        break;

      case 'd':
        if (this.wallboard.selectedNodes.size > 0) {
          e.preventDefault();
          this.duplicateSelectedNodes();
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
        }
        break;

      case 'm':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.wallboard.addMarkdownNode();
        }
        break;

      case 'i':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.wallboard.addImageNode();
        }
        break;
    }
  }

  handleEscape() {
    this.wallboard.cancelConnection();
    this.wallboard.cancelCutting();
    this.wallboard.deselectAll();
    this.wallboard.exitAllEditModes();
    this.wallboard.hideContextMenu();
    this.wallboard.hideThemeSelector();
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

      const duplicatedNode = {
        ...originalNode,
        id: newNodeId,
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
    this.wallboard.showNotification('Undone');
  }

  redo() {
    if (this.historyIndex >= this.commandHistory.length - 1) return;

    this.historyIndex++;
    const command = this.commandHistory[this.historyIndex];
    if (!command || !command.afterState) return;

    // Restore the state AFTER the action was performed
    this.restoreState(command.afterState);

    this.wallboard.showNotification('Redone');
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
}