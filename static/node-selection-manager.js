// Node selection manager for single and multi-node selection
class NodeSelectionManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
  }

  selectNode(node, isShiftClick = false) {
    if (isShiftClick) {
      // Multi-select mode
      if (this.wallboard.selectedNodes.has(node.id)) {
        // Deselect if already selected
        this.wallboard.selectedNodes.delete(node.id);
        document.getElementById(`node-${node.id}`).classList.remove("selected");

        // Update single selected node
        if (this.wallboard.selectedNodes.size === 1) {
          const remainingId = Array.from(this.wallboard.selectedNodes)[0];
          this.wallboard.selectedNode = this.wallboard.nodes.find(n => n.id === remainingId);
        } else {
          this.wallboard.selectedNode = null;
        }
      } else {
        // Add to selection
        this.wallboard.selectedNodes.add(node.id);
        document.getElementById(`node-${node.id}`).classList.add("selected");

        // Set as primary selected node if it's the only one
        if (this.wallboard.selectedNodes.size === 1) {
          this.wallboard.selectedNode = node;
        }
      }
    } else {
      // Single select mode
      this.deselectAll();
      this.wallboard.selectedNode = node;
      this.wallboard.selectedNodes.add(node.id);
      document.getElementById(`node-${node.id}`).classList.add("selected");
    }

    // Highlight connections - if multiple nodes selected, highlight all their connections
    if (this.wallboard.selectedNodes.size > 1) {
      this.wallboard.connectionManager.highlightConnectionsForMultipleNodes(Array.from(this.wallboard.selectedNodes));
    } else if (this.wallboard.selectedNode) {
      this.wallboard.connectionManager.highlightConnectionsForNode(this.wallboard.selectedNode.id);
    } else {
      this.wallboard.connectionManager.clearConnectionHighlighting();
    }
  }

  deselectAll() {
    document
      .querySelectorAll(".node")
      .forEach((n) => n.classList.remove("selected"));
    this.wallboard.selectedNode = null;
    this.wallboard.selectedNodes.clear();

    // Clear connection highlighting when no node is selected
    this.wallboard.connectionManager.clearConnectionHighlighting();
  }
}
