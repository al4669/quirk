class ConnectionManager {
  constructor(wallboardInstance = null, onChangeCallback = null) {
    this.connections = [];
    this.dragLine = null;
    this.cutLine = null;
    this.cutPath = [];
    this.svg = null;
    this.wallboard = wallboardInstance;
    this.onChangeCallback = onChangeCallback;
  }

  init() {
    this.svg = document.getElementById("connections");
    this.setupArrowMarkers();
  }

  setupArrowMarkers() {
    // This method is no longer needed since we use custom polygon arrows
    // Keeping it empty to avoid breaking the init() call
    console.log('Arrow markers setup complete (using polygon arrows)');
  }

  createConnection(start, end) {
    // Record change for undo/redo BEFORE making changes
    if (this.wallboard && this.wallboard.keyboardShortcuts) {
      this.wallboard.keyboardShortcuts.recordChange('create_connection', {
        startNodeId: start.nodeId,
        endNodeId: end.nodeId
      });
    }

    const connection = {
      id: `${start.nodeId}-${end.nodeId}`,
      start: start,
      end: end
    };
    this.connections.push(connection);
    this.updateConnections();
    if (this.onChangeCallback) this.onChangeCallback();
    return connection;
  }

  removeConnection(connectionId) {
    this.connections = this.connections.filter(conn =>
      `${conn.start.nodeId}-${conn.end.nodeId}` !== connectionId
    );
    this.updateConnections();
    if (this.onChangeCallback) this.onChangeCallback();
  }

  updateConnections() {
    if (!this.svg) return;

    // Store the currently selected node for re-highlighting after update
    const selectedNodeId = this.wallboard && this.wallboard.selectedNode ? this.wallboard.selectedNode.id : null;

    // Clear existing connections but preserve drag line and cut line
    const dragLine = this.svg.querySelector(".drag-line");
    const cutLine = this.svg.querySelector(".cut-line");
    this.svg.innerHTML = "";
    if (dragLine) this.svg.appendChild(dragLine);
    if (cutLine) this.svg.appendChild(cutLine);

    this.connections.forEach((conn) => {
      const startNode = this.wallboard.getNodeById(conn.start.nodeId);
      const endNode = this.wallboard.getNodeById(conn.end.nodeId);

      if (!startNode || !endNode) return;

      // Get actual DOM elements to get real dimensions
      const startEl = document.getElementById(`node-${startNode.id}`);
      const endEl = document.getElementById(`node-${endNode.id}`);

      if (!startEl || !endEl) return;

      // Get real dimensions from DOM
      const startRect = startEl.getBoundingClientRect();
      const endRect = endEl.getBoundingClientRect();

      // Convert screen coords to canvas coords accounting for zoom/pan
      const startCanvasRect = this.screenRectToCanvasRect(startRect);
      const endCanvasRect = this.screenRectToCanvasRect(endRect);

      // Calculate connection points
      const connectionPoints = this.calculateConnectionPoints(startCanvasRect, endCanvasRect);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = this.createSmoothPath(connectionPoints.start, connectionPoints.end, connectionPoints.direction);
      path.setAttribute("d", d);
      path.setAttribute("class", "connection-line");
      path.setAttribute("data-connection-id", conn.id);
      path.setAttribute("data-start-node", conn.start.nodeId);
      path.setAttribute("data-end-node", conn.end.nodeId);
      // Remove the marker-end since we're using custom polygon arrows
      // path.setAttribute("marker-end", "url(#arrow)");

      this.svg.appendChild(path);

      // Create arrow triangle at the arrow point (node edge)
      const arrow = this.createArrowTriangle(connectionPoints.arrow || connectionPoints.end, connectionPoints.start, connectionPoints.direction);
      arrow.setAttribute("class", "connection-arrow");
      arrow.setAttribute("data-connection-id", conn.id);
      arrow.setAttribute("data-start-node", conn.start.nodeId);
      arrow.setAttribute("data-end-node", conn.end.nodeId);
      this.svg.appendChild(arrow);
    });

    // Re-apply highlighting for the selected node if any
    if (selectedNodeId !== null) {
      this.highlightConnectionsForNode(selectedNodeId);
    }
  }

  screenRectToCanvasRect(screenRect) {
    // Get canvas transform values
    const canvas = document.getElementById('canvas');
    const transform = new DOMMatrix(getComputedStyle(canvas).transform);

    // Convert screen coordinates to canvas coordinates
    return {
      left: (screenRect.left - transform.e) / transform.a,
      top: (screenRect.top - transform.f) / transform.d,
      width: screenRect.width / transform.a,
      height: screenRect.height / transform.d
    };
  }

  calculateConnectionPoints(startRect, endRect) {
    // Get centers
    const startCenter = {
      x: startRect.left + startRect.width / 2,
      y: startRect.top + startRect.height / 2
    };
    const endCenter = {
      x: endRect.left + endRect.width / 2,
      y: endRect.top + endRect.height / 2
    };

    // Calculate edges properly from rect properties
    const startRight = startRect.left + startRect.width;
    const startBottom = startRect.top + startRect.height;
    const endRight = endRect.left + endRect.width;
    const endBottom = endRect.top + endRect.height;

    // Calculate direction
    const dx = endCenter.x - startCenter.x;
    const dy = endCenter.y - startCenter.y;

    // Consistent offset for all connection points
    const offset = 16;

    // Determine which edges to connect
    let startPoint, endPoint, direction;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal connection
      direction = 'horizontal';
      if (dx > 0) {
        // Start from right edge center of start node (with offset)
        startPoint = {
          x: startRight + offset,
          y: startCenter.y
        };
        // End before left edge center of end node (line stops short of arrow)
        endPoint = {
          x: endRect.left - offset,
          y: endCenter.y
        };
      } else {
        // Start from left edge center of start node (with offset)
        startPoint = {
          x: startRect.left - offset,
          y: startCenter.y
        };
        // End before right edge center of end node (line stops short of arrow)
        endPoint = {
          x: endRight + offset,
          y: endCenter.y
        };
      }
    } else {
      // Vertical connection
      direction = 'vertical';
      if (dy > 0) {
        // Start from bottom edge center of start node (with offset)
        startPoint = {
          x: startCenter.x,
          y: startBottom + offset
        };
        // End before top edge center of end node (line stops short of arrow)
        endPoint = {
          x: endCenter.x,
          y: endRect.top - offset
        };
      } else {
        // Start from top edge center of start node (with offset)
        startPoint = {
          x: startCenter.x,
          y: startRect.top - offset
        };
        // End before bottom edge center of end node (line stops short of arrow)
        endPoint = {
          x: endCenter.x,
          y: endBottom + offset
        };
      }
    }

    // Create arrow point - position so arrow tip touches node edge, not goes inside
    const arrowPoint = {
      x: direction === 'horizontal' ?
          (dx > 0 ? endRect.left : endRight) :
          endCenter.x,
      y: direction === 'vertical' ?
          (dy > 0 ? endRect.top : endBottom) :
          endCenter.y
    };

    return { start: startPoint, end: endPoint, arrow: arrowPoint, direction };
  }

  createSmoothPath(start, end, direction) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // If nodes are very close, use simple direct connection
    if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
      return `M ${start.x},${start.y} L ${end.x},${end.y}`;
    }

    // For horizontal connections (connecting left/right edges)
    // we want to go horizontally from start, then approach the end point horizontally
    if (direction === 'horizontal') {
      // If already horizontally aligned, just go straight
      if (Math.abs(dy) < 20) {
        return `M ${start.x},${start.y} L ${end.x},${end.y}`;
      }
      // Go horizontally from start, then vertically, then horizontally to end
      const midX = (start.x + end.x) / 2;
      return `M ${start.x},${start.y} L ${midX},${start.y} L ${midX},${end.y} L ${end.x},${end.y}`;
    }
    // For vertical connections (connecting top/bottom edges)
    // we want to go vertically from start, then approach the end point vertically
    else {
      // If already vertically aligned, just go straight
      if (Math.abs(dx) < 20) {
        return `M ${start.x},${start.y} L ${end.x},${end.y}`;
      }
      // Go vertically from start, then horizontally, then vertically to end
      const midY = (start.y + end.y) / 2;
      return `M ${start.x},${start.y} L ${start.x},${midY} L ${end.x},${midY} L ${end.x},${end.y}`;
    }
  }

  createArrowTriangle(endPoint, startPoint, direction) {
    // Arrow size
    const arrowSize = 16;

    // Get global theme color
    const themeColor = this.wallboard ? this.wallboard.themes[this.wallboard.globalTheme].accent : '#f42365';

    // Calculate arrow direction based on which edge we're connecting to
    let angle;

    if (direction === 'horizontal') {
      // Connecting to left/right edge - arrow should point horizontally
      const dx = endPoint.x - startPoint.x;
      if (dx > 0) {
        // Pointing right (connecting to left edge)
        angle = 0;
      } else {
        // Pointing left (connecting to right edge)
        angle = Math.PI;
      }
    } else {
      // Connecting to top/bottom edge - arrow should point vertically
      const dy = endPoint.y - startPoint.y;
      if (dy > 0) {
        // Pointing down (connecting to top edge)
        angle = Math.PI / 2;
      } else {
        // Pointing up (connecting to bottom edge)
        angle = -Math.PI / 2;
      }
    }

    // Position arrow with tip slightly back from node edge to prevent going inside
    const tipOffset = 4; // Small offset to keep arrow outside node
    const x1 = endPoint.x - tipOffset * Math.cos(angle);
    const y1 = endPoint.y - tipOffset * Math.sin(angle);

    // Base points extend backward from tip (away from node)
    const x2 = x1 - arrowSize * Math.cos(angle - Math.PI / 6);
    const y2 = y1 - arrowSize * Math.sin(angle - Math.PI / 6);
    const x3 = x1 - arrowSize * Math.cos(angle + Math.PI / 6);
    const y3 = y1 - arrowSize * Math.sin(angle + Math.PI / 6);

    // Create polygon triangle
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    arrow.setAttribute("points", `${x1},${y1} ${x2},${y2} ${x3},${y3}`);
    arrow.setAttribute("fill", themeColor);
    arrow.setAttribute("stroke", "none");

    // Convert hex to rgba for shadow
    const r = parseInt(themeColor.substr(1, 2), 16);
    const g = parseInt(themeColor.substr(3, 2), 16);
    const b = parseInt(themeColor.substr(5, 2), 16);
    arrow.style.filter = `drop-shadow(0 0 4px rgba(${r}, ${g}, ${b}, 0.4))`;

    return arrow;
  }

  // Drag line methods
  createDragLine() {
    if (this.dragLine) this.removeDragLine();
    this.dragLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.dragLine.setAttribute("class", "drag-line");
    this.svg.appendChild(this.dragLine);
  }

  updateDragLine(startPos, endPos) {
    if (!this.dragLine) return;

    // Convert screen coordinates to canvas coordinates
    const startCanvas = this.screenToCanvas(startPos.x, startPos.y);
    const endCanvas = this.screenToCanvas(endPos.x, endPos.y);

    const path = `M ${startCanvas.x},${startCanvas.y} L ${endCanvas.x},${endCanvas.y}`;
    this.dragLine.setAttribute("d", path);
  }

  screenToCanvas(screenX, screenY) {
    // Get canvas transform values
    const canvas = document.getElementById('canvas');
    const transform = new DOMMatrix(getComputedStyle(canvas).transform);

    // Convert screen coordinates to canvas coordinates
    return {
      x: (screenX - transform.e) / transform.a,
      y: (screenY - transform.f) / transform.d
    };
  }

  removeDragLine() {
    if (this.dragLine) {
      this.dragLine.remove();
      this.dragLine = null;
    }
  }

  // Cut line methods
  createCutLine() {
    if (this.cutLine) this.removeCutLine();
    this.cutLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    this.cutLine.setAttribute("class", "cut-line");
    this.svg.appendChild(this.cutLine);
  }

  addCutPoint(screenPos) {
    const canvasPos = this.screenToCanvas(screenPos.x, screenPos.y);
    this.cutPath.push(canvasPos);
    this.updateCutLine();
  }

  updateCutLine() {
    if (!this.cutLine || this.cutPath.length < 2) return;
    const points = this.cutPath.map(point => `${point.x},${point.y}`).join(" ");
    this.cutLine.setAttribute("points", points);
  }

  removeCutLine() {
    if (this.cutLine) {
      this.cutLine.remove();
      this.cutLine = null;
    }
    this.cutPath = [];
  }

  processConnectionCuts() {
    if (this.cutPath.length < 2) return;

    // Record change for undo/redo before making changes
    if (this.wallboard && this.wallboard.keyboardShortcuts) {
      this.wallboard.keyboardShortcuts.recordChange('cut_connections', {});
    }

    const connectionsToRemove = [];

    this.connections.forEach((conn, index) => {
      const startNode = this.wallboard.getNodeById(conn.start.nodeId);
      const endNode = this.wallboard.getNodeById(conn.end.nodeId);

      if (!startNode || !endNode) return;

      // Get screen rects and convert to canvas
      const startEl = document.getElementById(`node-${startNode.id}`);
      const endEl = document.getElementById(`node-${endNode.id}`);

      if (!startEl || !endEl) return;

      const startRect = this.screenRectToCanvasRect(startEl.getBoundingClientRect());
      const endRect = this.screenRectToCanvasRect(endEl.getBoundingClientRect());

      const connectionPoints = this.calculateConnectionPoints(startRect, endRect);

      // Check intersection with cut path
      for (let i = 0; i < this.cutPath.length - 1; i++) {
        const cutStart = this.cutPath[i];
        const cutEnd = this.cutPath[i + 1];

        if (this.linesIntersect(connectionPoints.start, connectionPoints.end, cutStart, cutEnd)) {
          connectionsToRemove.push(index);
          break;
        }
      }
    });

    // Remove cut connections
    connectionsToRemove.reverse().forEach(index => {
      this.connections.splice(index, 1);
    });

    if (connectionsToRemove.length > 0) {
      this.updateConnections();
      if (this.onChangeCallback) this.onChangeCallback();
    }
  }

  linesIntersect(p1, p2, p3, p4) {
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denom === 0) return false;

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }

  // Connection highlighting methods
  highlightConnectionsForNode(nodeId) {
    if (!this.svg || nodeId === null || nodeId === undefined) {
      this.clearConnectionHighlighting();
      return;
    }

    const connectionElements = this.svg.querySelectorAll('.connection-line');

    connectionElements.forEach(element => {
      const startNodeId = parseInt(element.getAttribute('data-start-node'));
      const endNodeId = parseInt(element.getAttribute('data-end-node'));

      if (startNodeId === nodeId || endNodeId === nodeId) {
        // This connection is related to the selected node
        element.classList.add('active');
        element.classList.remove('inactive');
        element.setAttribute('marker-end', 'url(#arrow-active)');
      } else {
        // This connection is not related to the selected node - hide it completely
        element.style.display = 'none';
      }
    });

    // Update arrow triangles
    const arrowElements = this.svg.querySelectorAll('.connection-arrow');
    arrowElements.forEach(element => {
      const startNodeId = parseInt(element.getAttribute('data-start-node'));
      const endNodeId = parseInt(element.getAttribute('data-end-node'));

      if (startNodeId === nodeId || endNodeId === nodeId) {
        // Active arrow - bright with glow using theme color
        const themeColor = this.wallboard ? this.wallboard.themes[this.wallboard.globalTheme].accent : '#f42365';
        element.setAttribute('fill', themeColor);
        const r = parseInt(themeColor.substr(1, 2), 16);
        const g = parseInt(themeColor.substr(3, 2), 16);
        const b = parseInt(themeColor.substr(5, 2), 16);
        element.style.filter = `drop-shadow(0 0 8px rgba(${r}, ${g}, ${b}, 0.8))`;
      } else {
        // Hide arrow for unrelated connections
        element.style.display = 'none';
      }
    });
  }

  highlightConnectionsForMultipleNodes(nodeIds) {
    if (!this.svg || !nodeIds || nodeIds.length === 0) {
      this.clearConnectionHighlighting();
      return;
    }

    const connectionElements = this.svg.querySelectorAll('.connection-line');

    connectionElements.forEach(element => {
      const startNodeId = parseInt(element.getAttribute('data-start-node'));
      const endNodeId = parseInt(element.getAttribute('data-end-node'));

      if (nodeIds.includes(startNodeId) || nodeIds.includes(endNodeId)) {
        // This connection is related to one of the selected nodes
        element.classList.add('active');
        element.classList.remove('inactive');
        element.setAttribute('marker-end', 'url(#arrow-active)');
      } else {
        // This connection is not related to any selected nodes - hide it completely
        element.style.display = 'none';
      }
    });

    // Update arrow triangles for multiple nodes
    const arrowElements = this.svg.querySelectorAll('.connection-arrow');
    arrowElements.forEach(element => {
      const startNodeId = parseInt(element.getAttribute('data-start-node'));
      const endNodeId = parseInt(element.getAttribute('data-end-node'));

      if (nodeIds.includes(startNodeId) || nodeIds.includes(endNodeId)) {
        // Active arrow - bright with glow using theme color
        const themeColor = this.wallboard ? this.wallboard.themes[this.wallboard.globalTheme].accent : '#f42365';
        element.setAttribute('fill', themeColor);
        const r = parseInt(themeColor.substr(1, 2), 16);
        const g = parseInt(themeColor.substr(3, 2), 16);
        const b = parseInt(themeColor.substr(5, 2), 16);
        element.style.filter = `drop-shadow(0 0 8px rgba(${r}, ${g}, ${b}, 0.8))`;
      } else {
        // Hide arrow for unrelated connections
        element.style.display = 'none';
      }
    });
  }

  clearConnectionHighlighting() {
    if (!this.svg) return;

    const connectionElements = this.svg.querySelectorAll('.connection-line');
    connectionElements.forEach(element => {
      element.classList.remove('active', 'inactive');
      element.setAttribute('marker-end', 'url(#arrow)');
      element.style.display = ''; // Show all connections
    });

    // Reset arrow triangles to default state using theme color
    const arrowElements = this.svg.querySelectorAll('.connection-arrow');
    arrowElements.forEach(element => {
      const themeColor = this.wallboard ? this.wallboard.themes[this.wallboard.globalTheme].accent : '#f42365';
      element.setAttribute('fill', themeColor);
      const r = parseInt(themeColor.substr(1, 2), 16);
      const g = parseInt(themeColor.substr(3, 2), 16);
      const b = parseInt(themeColor.substr(5, 2), 16);
      element.style.filter = `drop-shadow(0 0 4px rgba(${r}, ${g}, ${b}, 0.4))`;
      element.style.display = ''; // Show all arrows
    });
  }
}