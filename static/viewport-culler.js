/**
 * ViewportCuller - Optimizes performance by culling nodes outside the viewport
 *
 * When zoomed out, rendering all nodes is expensive. This class determines
 * which nodes are visible in the current viewport to avoid rendering off-screen nodes.
 */
class ViewportCuller {
  /**
   * Check if a node is visible in the current viewport
   * @param {Object} node - Node object with position {x, y}
   * @param {number} zoom - Current zoom level
   * @param {number} panX - Current pan X offset
   * @param {number} panY - Current pan Y offset
   * @returns {boolean} True if node is visible or near viewport
   */
  static isNodeVisible(node, zoom, panX, panY) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Typical node dimensions (400x400 in world space)
    const nodeWidth = 400;
    const nodeHeight = 400;

    // Calculate node bounds in screen space
    const nodeScreenX = node.position.x * zoom + panX;
    const nodeScreenY = node.position.y * zoom + panY;
    const nodeScreenWidth = nodeWidth * zoom;
    const nodeScreenHeight = nodeHeight * zoom;

    // Add buffer for smooth appearance (nodes appear before they're fully on screen)
    // Larger buffer when zoomed out for smoother culling
    const buffer = zoom < 0.5 ? 300 : 200;

    // Check if node intersects with viewport (with buffer)
    return !(nodeScreenX + nodeScreenWidth < -buffer ||
             nodeScreenX > viewportWidth + buffer ||
             nodeScreenY + nodeScreenHeight < -buffer ||
             nodeScreenY > viewportHeight + buffer);
  }

  /**
   * Get list of visible node IDs from an array of nodes
   * @param {Array} nodes - Array of node objects
   * @param {number} zoom - Current zoom level
   * @param {number} panX - Current pan X offset
   * @param {number} panY - Current pan Y offset
   * @returns {Set} Set of visible node IDs
   */
  static getVisibleNodeIds(nodes, zoom, panX, panY) {
    const visibleIds = new Set();

    for (const node of nodes) {
      if (this.isNodeVisible(node, zoom, panX, panY)) {
        visibleIds.add(node.id);
      }
    }

    return visibleIds;
  }

  /**
   * Check if a connection should be rendered
   * @param {Object} connection - Connection object with start and end node IDs
   * @param {Set} visibleNodeIds - Set of visible node IDs
   * @returns {boolean} True if at least one endpoint is visible
   */
  static shouldRenderConnection(connection, visibleNodeIds) {
    // Render if at least one endpoint is visible
    // This ensures connections appear smoothly as nodes enter viewport
    return visibleNodeIds.has(connection.start.nodeId) ||
           visibleNodeIds.has(connection.end.nodeId);
  }
}
