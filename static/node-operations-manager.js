// Node operations manager for CRUD operations on nodes
class NodeOperationsManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
  }

  addMarkdownNode(position = null) {
    const node = this.createNode("markdown", {
      content: SampleContent.getRandomMarkdown()
    }, position);
    this.wallboard.renderNode(node);
    return node;
  }

  createNode(type, data, position = null) {
    // Record change for undo/redo BEFORE making changes
    if (this.wallboard.keyboardShortcuts) {
      this.wallboard.keyboardShortcuts.recordChange('create_node', { type, data });
    }

    // Generate unique title
    const uniqueTitle = NodeUtils.generateUniqueTitle(type, this.wallboard.nodes);

    // If no position provided, place at center of current viewport
    let nodePosition = position;
    if (!nodePosition) {
      // Get viewport center in screen coordinates
      const viewportCenterX = window.innerWidth / 2;
      const viewportCenterY = window.innerHeight / 2;

      // Convert to canvas coordinates using direct formula
      // Canvas has transform: translate(panX, panY) scale(zoom)
      // So: screenPos = canvasPos * zoom + panX
      // Therefore: canvasPos = (screenPos - panX) / zoom
      const canvasX = (viewportCenterX - this.wallboard.panX) / this.wallboard.zoom;
      const canvasY = (viewportCenterY - this.wallboard.panY) / this.wallboard.zoom;

      console.log('[NodeCreate] Placing node at viewport center:', {
        viewportCenter: { x: viewportCenterX, y: viewportCenterY },
        canvasPos: { x: canvasX, y: canvasY },
        pan: { x: this.wallboard.panX, y: this.wallboard.panY },
        zoom: this.wallboard.zoom
      });

      nodePosition = {
        x: canvasX - 125, // Center the node (assuming ~250px width)
        y: canvasY - 90   // Center the node (assuming ~180px height)
      };
    }

    const node = {
      id: this.wallboard.nodeIdCounter++,
      title: uniqueTitle,
      data: data,
      position: nodePosition,
    };
    this.wallboard.nodes.push(node);
    this.wallboard.autoSave();
    return node;
  }

  duplicateNode() {
    if (this.wallboard.contextNode) {
      // Get the original title and generate a unique one
      const originalTitle = this.wallboard.getNodeTitle(this.wallboard.contextNode);
      const uniqueTitle = NodeUtils.generateUniqueTitle(originalTitle, this.wallboard.nodes);

      const newNode = {
        ...this.wallboard.contextNode,
        id: this.wallboard.nodeIdCounter++,
        title: uniqueTitle,
        position: {
          x: this.wallboard.contextNode.position.x + 30,
          y: this.wallboard.contextNode.position.y + 30,
        },
        data: { ...this.wallboard.contextNode.data },
      };
      this.wallboard.nodes.push(newNode);
      this.wallboard.renderNode(newNode);
      this.wallboard.hideContextMenu();
    }
  }

  deleteNode() {
    const node = this.wallboard.contextNode || this.wallboard.selectedNode;
    if (node) {
      this.removeNode(node.id);
      this.wallboard.hideContextMenu();
    }
  }

  removeNode(nodeId) {
    console.log(`Removing node ${nodeId} via button`);

    // Remove all [[links]] to this node from other nodes' markdown
    if (this.wallboard.linkManager) {
      this.wallboard.linkManager.removeAllLinksToNode(nodeId);
    }

    const element = document.getElementById(`node-${nodeId}`);
    if (element) element.remove();

    const nodesBefore = this.wallboard.nodes.length;
    const connectionsBefore = this.wallboard.connectionManager.connections.length;

    this.wallboard.nodes = this.wallboard.nodes.filter((n) => n.id !== nodeId);

    // Remove connections through the connection manager
    this.wallboard.connectionManager.connections = this.wallboard.connectionManager.connections.filter(
      (c) => c.start.nodeId !== nodeId && c.end.nodeId !== nodeId
    );

    console.log(`Nodes: ${nodesBefore} → ${this.wallboard.nodes.length}`);
    console.log(`Connections: ${connectionsBefore} → ${this.wallboard.connectionManager.connections.length}`);

    this.wallboard.connectionManager.updateConnections();
    this.wallboard.autoSave();

    this.wallboard.mockAPICall("deleteNode", { nodeId });
  }

  clearBoard() {
    if (confirm("Clear all nodes and connections?")) {
      this.wallboard.nodes = [];
      this.wallboard.connections = [];
      document.querySelectorAll(".node").forEach((n) => n.remove());
      document.getElementById("connections").innerHTML = "";
    }
  }
}
