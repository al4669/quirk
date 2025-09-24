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
  }

  createConnection(start, end) {
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
      const d = this.createSmoothPath(connectionPoints.start, connectionPoints.end);
      path.setAttribute("d", d);
      path.setAttribute("class", "connection-line");

      this.svg.appendChild(path);
    });
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

    // Calculate direction
    const dx = endCenter.x - startCenter.x;
    const dy = endCenter.y - startCenter.y;

    // Determine which edges to connect
    let startPoint, endPoint;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal connection
      if (dx > 0) {
        // Start from right edge of start node
        startPoint = {
          x: startRect.left + startRect.width,
          y: startCenter.y
        };
        // End at left edge of end node
        endPoint = {
          x: endRect.left,
          y: endCenter.y
        };
      } else {
        // Start from left edge of start node
        startPoint = {
          x: startRect.left,
          y: startCenter.y
        };
        // End at right edge of end node
        endPoint = {
          x: endRect.left + endRect.width,
          y: endCenter.y
        };
      }
    } else {
      // Vertical connection
      if (dy > 0) {
        // Start from bottom edge of start node
        startPoint = {
          x: startCenter.x,
          y: startRect.top + startRect.height
        };
        // End at top edge of end node
        endPoint = {
          x: endCenter.x,
          y: endRect.top
        };
      } else {
        // Start from top edge of start node
        startPoint = {
          x: startCenter.x,
          y: startRect.top
        };
        // End at bottom edge of end node
        endPoint = {
          x: endCenter.x,
          y: endRect.top + endRect.height
        };
      }
    }

    return { start: startPoint, end: endPoint };
  }

  createSmoothPath(start, end) {
    const dx = end.x - start.x;

    // Create smooth bezier curve
    const cp1x = start.x + dx * 0.5;
    const cp1y = start.y;
    const cp2x = end.x - dx * 0.5;
    const cp2y = end.y;

    return `M ${start.x},${start.y} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${end.x},${end.y}`;
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
}