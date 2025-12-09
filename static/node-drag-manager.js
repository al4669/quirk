// Node dragging manager for single and multi-node dragging
class NodeDragManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
    // Track the animation frame ID so we can cancel it
    this.dragAnimationFrame = null;
  }

  handleNodeDragStart(e, node, element) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Record change for undo/redo at the START of drag
    if (this.wallboard.keyboardShortcuts) {
      const nodeIds = this.wallboard.selectedNodes.size > 1 && this.wallboard.selectedNodes.has(node.id)
        ? Array.from(this.wallboard.selectedNodes)
        : [node.id];
      this.wallboard.keyboardShortcuts.recordChange('move_nodes', { nodeIds });
    }

    this.wallboard.isDragging = true;
    this.wallboard.draggedNode = { node, element };
    this.wallboard.primaryDragNode = node;

    // Check if this node is part of a multi-selection
    if (this.wallboard.selectedNodes.size > 1 && this.wallboard.selectedNodes.has(node.id)) {
      this.wallboard.isGroupDragging = true;
      this.setupGroupDrag(node);
    } else {
      // Single node drag - don't change selection here, let click handler do it
      this.wallboard.isGroupDragging = false;
    }

    element.classList.add("dragging");

    // Convert mouse coordinates to canvas coordinate system
    const canvasCoords = this.wallboard.screenToCanvas(e.clientX, e.clientY);
    this.wallboard.dragOffset.x = canvasCoords.x - node.position.x;
    this.wallboard.dragOffset.y = canvasCoords.y - node.position.y;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    e.preventDefault();
  }

  setupGroupDrag(primaryNode) {
    // Clear any existing group drag offsets
    this.wallboard.groupDragOffsets.clear();

    // Calculate relative offsets for all selected nodes from the primary node
    this.wallboard.selectedNodes.forEach(nodeId => {
      if (nodeId !== primaryNode.id) {
        const node = this.wallboard.nodes.find(n => n.id === nodeId);
        if (node) {
          this.wallboard.groupDragOffsets.set(nodeId, {
            x: node.position.x - primaryNode.position.x,
            y: node.position.y - primaryNode.position.y
          });

          // Add dragging class to all group members
          const nodeElement = document.getElementById(`node-${nodeId}`);
          if (nodeElement) {
            nodeElement.classList.add("dragging");
          }
        }
      }
    });
  }

  handleNodeDrag(e) {
    // If we aren't logically dragging, stop immediately
    if (!this.wallboard.isDragging) return;

    // 1. Optimization: Cancel any pending frame to prevent stacking multiple frames
    if (this.dragAnimationFrame) {
      cancelAnimationFrame(this.dragAnimationFrame);
    }

    // 2. Request new frame
    this.dragAnimationFrame = requestAnimationFrame(() => {
      // 3. Safety check: Ensure dragging is still active when the frame actually runs
      if (!this.wallboard.isDragging || !this.wallboard.draggedNode) return;

      const { node, element } = this.wallboard.draggedNode;

      // Convert mouse coordinates to canvas coordinate system
      const canvasCoords = this.wallboard.screenToCanvas(e.clientX, e.clientY);
      const newX = canvasCoords.x - this.wallboard.dragOffset.x;
      const newY = canvasCoords.y - this.wallboard.dragOffset.y;

      // Update primary node position
      node.position.x = newX;
      node.position.y = newY;
      element.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;

      // If group dragging, update all other selected nodes
      if (this.wallboard.isGroupDragging) {
        this.wallboard.groupDragOffsets.forEach((offset, nodeId) => {
          const groupNode = this.wallboard.nodes.find(n => n.id === nodeId);
          if (groupNode) {
            // Apply the same position plus the stored offset
            groupNode.position.x = newX + offset.x;
            groupNode.position.y = newY + offset.y;

            // Update DOM position
            const groupElement = document.getElementById(`node-${nodeId}`);
            if (groupElement) {
              groupElement.style.transform = `translate3d(${groupNode.position.x}px, ${groupNode.position.y}px, 0)`;
            }
          }
        });
      }

      this.wallboard.connectionManager.updateConnections();
      
      // Clear the frame ID as it has completed
      this.dragAnimationFrame = null;
    });
  }

  endNodeDrag() {
    // 4. CRITICAL FIX: Cancel any pending animation frame immediately.
    // This prevents the "twitch" where a frame runs AFTER the mouse is released.
    if (this.dragAnimationFrame) {
      cancelAnimationFrame(this.dragAnimationFrame);
      this.dragAnimationFrame = null;
    }

    this.wallboard.isDragging = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    if (this.wallboard.draggedNode) {
      this.wallboard.draggedNode.element.classList.remove("dragging");
      this.wallboard.draggedNode = null;
    }

    // Clean up group dragging state
    if (this.wallboard.isGroupDragging) {
      // Remove dragging class from all group members
      this.wallboard.groupDragOffsets.forEach((offset, nodeId) => {
        const nodeElement = document.getElementById(`node-${nodeId}`);
        if (nodeElement) {
          nodeElement.classList.remove("dragging");
        }
      });

      this.wallboard.groupDragOffsets.clear();
      this.wallboard.isGroupDragging = false;
    }

    this.wallboard.primaryDragNode = null;

    // Auto-save after node position changes
    this.wallboard.updateCanvasBounds();
    this.wallboard.autoSave();
  }
}