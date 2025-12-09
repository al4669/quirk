// Node operations manager for CRUD operations on nodes
class NodeOperationsManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
  }

  addMarkdownNode(position = null) {
    const resolvedPosition = position
      || (typeof this.wallboard.getNextNodePosition === 'function'
        ? this.wallboard.getNextNodePosition()
        : this.getLegacyPositionFallback());
    const node = this.createNode("markdown", {
      content: SampleContent.getRandomMarkdown()
    }, resolvedPosition);
    this.wallboard.renderNode(node);

    // Select and focus the newly added node
    this.wallboard.deselectAll();
    this.wallboard.selectedNode = node;
    this.wallboard.selectedNodes.add(node.id);
    const nodeEl = document.getElementById(`node-${node.id}`);
    nodeEl?.classList.add("selected");
    this.wallboard.focusOnNodes([node.id]);

    return node;
  }

  getLegacyPositionFallback() {
    const lastNode = this.wallboard.nodes[this.wallboard.nodes.length - 1];
    if (lastNode) {
      const bounds = this.wallboard.getNodesBounds([lastNode]);
      const shift = this.wallboard.findAvailableDuplicateShift(bounds);
      return {
        x: lastNode.position.x + shift.x,
        y: lastNode.position.y
      };
    }
    // Fallback to viewport center
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const canvasX = (centerX - this.wallboard.panX) / this.wallboard.zoom;
    const canvasY = (centerY - this.wallboard.panY) / this.wallboard.zoom;
    return { x: canvasX - 125, y: canvasY - 90 };
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
      data: { ...data, nodeType: data.nodeType || type },
      position: nodePosition,
    };
    this.wallboard.nodes.push(node);

    // Set default theme to 'default' (inherit global theme)
    if (this.wallboard.themeManager) {
      this.wallboard.themeManager.setNodeTheme(node.id, 'default');
    }

    this.wallboard.updateCanvasBounds();
    this.wallboard.autoSave();
    return node;
  }

  duplicateNode() {
    if (this.wallboard.contextNode) {
      // Get the original title and generate a unique one
      const originalTitle = this.wallboard.getNodeTitle(this.wallboard.contextNode);
      const uniqueTitle = NodeUtils.generateUniqueTitle(originalTitle, this.wallboard.nodes);

      const bounds = this.wallboard.getNodesBounds([this.wallboard.contextNode]);
      const shift = this.wallboard.findAvailableDuplicateShift(bounds);

      const duplicatingResultSide = this.wallboard.isShowingResult(this.wallboard.contextNode.id);
      const duplicatedData = { ...this.wallboard.contextNode.data };
      const sourceContent = duplicatingResultSide && duplicatedData.resultContent
        ? duplicatedData.resultContent
        : duplicatedData.content || '';
      duplicatedData.content = sourceContent;
      delete duplicatedData.html;
      delete duplicatedData.resultContent;
      delete duplicatedData.resultHtml;
      duplicatedData.showingResult = false;

      const newNode = {
        ...this.wallboard.contextNode,
        id: this.wallboard.nodeIdCounter++,
        title: uniqueTitle,
        position: {
          x: this.wallboard.contextNode.position.x + shift.x,
          y: this.wallboard.contextNode.position.y + shift.y,
        },
        data: duplicatedData,
      };

      if (this.wallboard.nodeThemes[this.wallboard.contextNode.id]) {
        this.wallboard.nodeThemes[newNode.id] = this.wallboard.nodeThemes[this.wallboard.contextNode.id];
      }

      this.wallboard.nodes.push(newNode);
      this.wallboard.renderNode(newNode);
      this.wallboard.updateCanvasBounds();
      this.wallboard.connectionManager.updateConnections();

      this.wallboard.deselectAll();
      this.wallboard.selectedNodes.add(newNode.id);
      this.wallboard.selectedNode = newNode;
      const nodeEl = document.getElementById(`node-${newNode.id}`);
      nodeEl?.classList.add("selected");

      this.wallboard.focusOnNodes([newNode.id]);
      this.wallboard.autoSave();
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
    const normalizedNodeId = Number(nodeId);
    if (Number.isNaN(normalizedNodeId)) {
      console.warn('[removeNode] Invalid node id', nodeId);
      return;
    }

    console.log(`Removing node ${normalizedNodeId} via button`);

    // Remove all [[links]] to this node from other nodes' markdown
    if (this.wallboard.linkManager) {
      this.wallboard.linkManager.removeAllLinksToNode(nodeId);
    }

    const element = document.getElementById(`node-${normalizedNodeId}`);
    if (element) element.remove();
    this.wallboard.deleteNodeSize(normalizedNodeId);

    const nodesBefore = this.wallboard.nodes.length;
    const connectionsBefore = this.wallboard.connectionManager.connections.length;

    this.wallboard.nodes = this.wallboard.nodes.filter((n) => Number(n.id) !== normalizedNodeId);

    // Remove connections through the connection manager
    this.wallboard.connectionManager.connections = this.wallboard.connectionManager.connections.filter(
      (c) => Number(c.start.nodeId) !== normalizedNodeId && Number(c.end.nodeId) !== normalizedNodeId
    );

    // Clean up theme
    if (this.wallboard.nodeThemes && this.wallboard.nodeThemes[normalizedNodeId]) {
      delete this.wallboard.nodeThemes[normalizedNodeId];
    }

    console.log(`Nodes: ${nodesBefore} → ${this.wallboard.nodes.length}`);
    console.log(`Connections: ${connectionsBefore} → ${this.wallboard.connectionManager.connections.length}`);

    this.wallboard.connectionManager.updateConnections();
    this.wallboard.updateCanvasBounds();
    this.wallboard.autoSave();

    this.wallboard.mockAPICall("deleteNode", { nodeId: normalizedNodeId });
  }

  clearBoard() {
    if (confirm("Clear all nodes and connections?")) {
      this.wallboard.nodes = [];
      this.wallboard.connections = [];
      document.querySelectorAll(".node").forEach((n) => n.remove());
      document.getElementById("connections").innerHTML = "";
      this.wallboard.clearNodeSizeCache();
      this.wallboard.updateCanvasBounds();
    }
  }
}
