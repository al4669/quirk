class ConnectionManager {
  constructor(wallboardInstance = null, onChangeCallback = null) {
    this.connections = [];
    this.connectionThemes = {};

    // Cache for DOM elements to prevent constant recreation
    this.domCache = new Map();

    this.wallboard = wallboardInstance;
    this.onChangeCallback = onChangeCallback;
    this.svg = null;

    // Tools
    this.dragLine = null;
    this.cutLine = null;
    this.cutPath = [];

    this.rafId = null;
    this.handleArrowClick = this.handleArrowClick.bind(this);
  }

  init() {
    this.svg = document.getElementById("connections");
    if (!this.svg) return;

    this.svg.style.pointerEvents = "none";
    this.svg.removeEventListener('click', this.handleArrowClick);
    this.svg.addEventListener('click', this.handleArrowClick);
  }

  // --- CRUD Operations ---

  createConnection(start, end) {
    const startId = Number(start?.nodeId);
    const endId = Number(end?.nodeId);

    if (Number.isNaN(startId) || Number.isNaN(endId) || startId === endId) return null;

    const exists = this.connections.some(conn =>
      Number(conn.start.nodeId) === startId && Number(conn.end.nodeId) === endId
    );
    if (exists) return null;

    if (this.wallboard?.keyboardShortcuts) {
      this.wallboard.keyboardShortcuts.recordChange('create_connection', { startNodeId: startId, endNodeId: endId });
    }

    const connection = {
      id: `${startId}-${endId}`,
      start: { ...start, nodeId: startId },
      end: { ...end, nodeId: endId }
    };

    this.connections.push(connection);
    if (typeof soundManager !== 'undefined') soundManager.playSnap();

    this.updateConnections();
    if (this.onChangeCallback) this.onChangeCallback();
    return connection;
  }

  removeConnection(connectionId) {
    const index = this.connections.findIndex(c => c.id === connectionId);
    if (index === -1) return;

    const conn = this.connections[index];

    if (this.wallboard?.linkManager) {
      this.wallboard.linkManager.removeLinkFromContent(conn.start.nodeId, conn.end.nodeId);
    }

    this.connections.splice(index, 1);
    delete this.connectionThemes[connectionId];

    this.updateConnections();
    if (this.onChangeCallback) this.onChangeCallback();
  }

  // --- Rendering Loop ---

  updateConnections() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(() => {
      this._render();
      this.rafId = null;
    });
  }

  updateConnectionsInstant() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this._render();
  }

  _render() {
    if (!this.svg || !this.wallboard) return;

    // 1. Group Connections (Bidirectional Merge)
    const uniquePairs = new Map();
    const visibleNodes = this.wallboard.visibleNodeIds;

    for (const conn of this.connections) {
      const u = conn.start.nodeId;
      const v = conn.end.nodeId;

      if (visibleNodes && (!visibleNodes.has(u) || !visibleNodes.has(v))) continue;

      const key = u < v ? `${u}-${v}` : `${v}-${u}`;

      if (!uniquePairs.has(key)) {
        uniquePairs.set(key, { forward: null, reverse: null, key });
      }

      const entry = uniquePairs.get(key);
      if (u < v) entry.forward = conn;
      else entry.reverse = conn;
    }

    // 2. Batch Measure
    const rectCache = new Map();
    uniquePairs.forEach((pair) => {
      const idA = pair.forward ? pair.forward.start.nodeId : pair.reverse.end.nodeId;
      const idB = pair.forward ? pair.forward.end.nodeId : pair.reverse.start.nodeId;

      if (!rectCache.has(idA)) rectCache.set(idA, this.getNodeRect(idA));
      if (!rectCache.has(idB)) rectCache.set(idB, this.getNodeRect(idB));
    });

    // 3. Mark existing DOM unused
    this.domCache.forEach(el => el.inUse = false);

    // 4. Render
    uniquePairs.forEach((pair, key) => {
      const idA = pair.forward ? pair.forward.start.nodeId : pair.reverse.end.nodeId;
      const idB = pair.forward ? pair.forward.end.nodeId : pair.reverse.start.nodeId;

      const rectA = rectCache.get(idA);
      const rectB = rectCache.get(idB);

      const hasForward = !!pair.forward;
      const hasReverse = !!pair.reverse;

      // Always route from the visually leftmost node to the rightmost, so all types behave the same.
      const centerAx = rectA.x + rectA.w / 2;
      const centerBx = rectB.x + rectB.w / 2;
      const centerAy = rectA.y + rectA.h / 2;
      const centerBy = rectB.y + rectB.h / 2;

      let startRect = rectA;
      let endRect = rectB;
      let startId = idA;
      let endId = idB;
      let swapped = false;

      if (centerAx > centerBx || (centerAx === centerBx && centerAy > centerBy)) {
        startRect = rectB;
        endRect = rectA;
        startId = idB;
        endId = idA;
        swapped = true;
      }

      // Map connections to the routed start/end order
      const startToEndConn = swapped ? pair.reverse : pair.forward;
      const endToStartConn = swapped ? pair.forward : pair.reverse;
      const hasStartToEnd = !!startToEndConn;
      const hasEndToStart = !!endToStartConn;

      // Calculate the specific LR "Spine" Route
      const route = this.calculateSymmetricRoute(startRect, endRect, hasStartToEnd, hasEndToStart);

      const primaryConn = pair.forward || pair.reverse;

      // Check for explicit theme on either connection in the pair
      let themeKey = null;
      if (pair.forward && this.connectionThemes[pair.forward.id]) {
        themeKey = this.connectionThemes[pair.forward.id];
      } else if (pair.reverse && this.connectionThemes[pair.reverse.id]) {
        themeKey = this.connectionThemes[pair.reverse.id];
      }

      // Fallback to global or default if no explicit theme found
      if (!themeKey) {
        themeKey = this.wallboard?.globalTheme || 'default';
      }

      const color = this.getThemeColor(themeKey);

      let elGroup = this.getDOMElement(key);

      elGroup.path.setAttribute('d', route.path);
      elGroup.path.style.stroke = color;
      elGroup.path.setAttribute('data-connection-id', primaryConn.id);

      // Arrow at the routed end represents the connection going start -> end
      const startToEndId = startToEndConn ? startToEndConn.id : primaryConn.id;
      this.updateArrow(elGroup.arrowEnd, route.endPoint, route.direction, hasStartToEnd, color, startToEndId);

      // Arrow at the routed start represents the reverse connection (end -> start)
      const startDirection = this.getOppositeDirection(route.startDirection);
      const endToStartId = endToStartConn ? endToStartConn.id : primaryConn.id;
      this.updateArrow(elGroup.arrowStart, route.startPoint, startDirection, hasEndToStart, color, endToStartId);

      // Apply shadows
      const r = parseInt(color.substr(1, 2), 16);
      const g = parseInt(color.substr(3, 2), 16);
      const b = parseInt(color.substr(5, 2), 16);
      const shadow = `drop-shadow(0 0 3px rgba(${r}, ${g}, ${b}, 0.5))`;

      elGroup.path.style.filter = shadow;
      elGroup.arrowStart.style.filter = shadow;
      elGroup.arrowEnd.style.filter = shadow;

      elGroup.inUse = true;
    });

    // 5. Cleanup
    this.domCache.forEach((elGroup, key) => {
      if (!elGroup.inUse) {
        elGroup.path.remove();
        elGroup.arrowStart.remove();
        elGroup.arrowEnd.remove();
        this.domCache.delete(key);
      }
    });
  }

  /**
   * REPLACED ROUTING LOGIC
   * Strongly prefers Right -> Left flow with a shared vertical spine.
   */
  calculateSymmetricRoute(start, end, hasStartArrow, hasEndArrow) {
    const arrowPadding = 14;

    // Centers
    const startCy = start.y + start.h / 2;
    const endCy = end.y + end.h / 2;
    const startCx = start.x + start.w / 2;
    const endCx = end.x + end.w / 2;

    // Edges for Right->Left flow
    const startRightX = start.x + start.w;
    const endLeftX = end.x;

    // Is the target actually to the right? Allow mild overlap so all node types route the same.
    const horizontalLead = endCx - startCx;
    const verticalGap = Math.abs(endCy - startCy);
    const hasRightClearance = endLeftX > startRightX - 10; // small tolerance for overlapping widths
    const favorsHorizontal = horizontalLead * 1.2 >= verticalGap;
    const isForward = horizontalLead > 0 && (hasRightClearance || favorsHorizontal);

    let startPt, endPt, startExitDir, endExitDir;
    let d = '';

    if (isForward) {
      // --- STANDARD LEFT-TO-RIGHT FLOW ---

      // 1. Exit strictly from Right side of A
      startPt = { x: startRightX, y: startCy };
      startExitDir = 'right';

      // 2. Enter strictly from Left side of B
      endPt = { x: endLeftX, y: endCy };
      endExitDir = 'right'; // The arrow points right (entering from left)

      // Apply Padding
      if (hasStartArrow) startPt.x += arrowPadding;
      if (hasEndArrow) endPt.x -= arrowPadding;

      const sx = Math.round(startPt.x);
      const sy = Math.round(startPt.y);
      const ex = Math.round(endPt.x);
      const ey = Math.round(endPt.y);

      // 3. Calculate Shared Spine
      // The vertical line happens exactly halfway between the nodes.
      // If multiple nodes align in columns, this X will be identical for all of them,
      // creating the "Reuse/Bundling" visual effect.
      const spineX = Math.round((sx + ex) / 2);

      // Draw: Move to Start -> Line to Spine -> Vertical to Target Y -> Line to End
      d = `M ${sx},${sy} L ${spineX},${sy} L ${spineX},${ey} L ${ex},${ey}`;

    } else {
      // --- LOOPBACK / VERTICAL STACK ---
      // Target is behind source, or directly above/below. 
      // Fallback to "Exit Bottom / Enter Top" to avoid crossing through node text.

      const isBelow = end.y > start.y;

      if (isBelow) {
        // Downward
        startPt = { x: startCx, y: start.y + start.h };
        endPt = { x: endCx, y: end.y };
        startExitDir = 'down';
        endExitDir = 'down';
      } else {
        // Upward
        startPt = { x: startCx, y: start.y };
        endPt = { x: endCx, y: end.y + end.h };
        startExitDir = 'up';
        endExitDir = 'up';
      }

      // Apply Padding
      if (hasStartArrow) {
        if (startExitDir === 'down') startPt.y += arrowPadding;
        else startPt.y -= arrowPadding;
      }
      if (hasEndArrow) {
        if (endExitDir === 'down') endPt.y -= arrowPadding;
        else endPt.y += arrowPadding;
      }

      const sx = Math.round(startPt.x), sy = Math.round(startPt.y);
      const ex = Math.round(endPt.x), ey = Math.round(endPt.y);
      const midY = Math.round((sy + ey) / 2);

      // Simple S-bend
      d = `M ${sx},${sy} L ${sx},${midY} L ${ex},${midY} L ${ex},${ey}`;
    }

    return {
      path: d,
      startPoint: startPt,
      endPoint: endPt,
      direction: endExitDir, // Direction the line is travelling at the end
      startDirection: startExitDir // Direction the line travels out of start
    };
  }

  // --- Boilerplate (DOM/Theme/Tools) ---

  getDOMElement(key) {
    if (this.domCache.has(key)) return this.domCache.get(key);

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "connection-line");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linejoin", "round");
    path.style.pointerEvents = "visibleStroke";

    const arrowStart = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    arrowStart.setAttribute("class", "connection-arrow");
    arrowStart.style.cursor = 'pointer';
    arrowStart.style.pointerEvents = "auto";

    const arrowEnd = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    arrowEnd.setAttribute("class", "connection-arrow");
    arrowEnd.style.cursor = 'pointer';
    arrowEnd.style.pointerEvents = "auto";

    if (this.cutLine) this.svg.insertBefore(path, this.cutLine);
    else this.svg.appendChild(path);
    this.svg.appendChild(arrowStart);
    this.svg.appendChild(arrowEnd);

    const group = { path, arrowStart, arrowEnd, inUse: true };
    this.domCache.set(key, group);
    return group;
  }

  updateArrow(arrowEl, point, direction, isVisible, color, connectionId) {
    if (!isVisible) {
      arrowEl.style.display = 'none';
      return;
    }
    arrowEl.style.display = 'block';
    arrowEl.setAttribute('fill', color);
    arrowEl.setAttribute('data-connection-id', connectionId);

    const w = 6; const l = 14;
    const x = point.x; const y = point.y;
    let pts = '';

    switch (direction) {
      case 'right': pts = `${x},${y} ${x - l},${y - w} ${x - l},${y + w}`; break;
      case 'left': pts = `${x},${y} ${x + l},${y - w} ${x + l},${y + w}`; break;
      case 'down': pts = `${x},${y} ${x - w},${y - l} ${x + w},${y - l}`; break;
      case 'up': pts = `${x},${y} ${x - w},${y + l} ${x + w},${y + l}`; break;
    }
    arrowEl.setAttribute("points", pts);
  }

  getOppositeDirection(dir) {
    if (dir === 'left') return 'right';
    if (dir === 'right') return 'left';
    if (dir === 'up') return 'down';
    return 'up';
  }

  getNodeRect(nodeId) {
    const node = this.wallboard.getNodeById(nodeId);
    if (!node) return { x: 0, y: 0, w: 0, h: 0 };
    let size = this.wallboard.getNodeSize(nodeId);
    if (!size) {
      const el = document.getElementById(`node-${nodeId}`);
      if (el) {
        size = { width: el.offsetWidth, height: el.offsetHeight };
        this.wallboard.updateNodeSize(nodeId, size.width, size.height);
      } else {
        size = { width: 250, height: 180 };
      }
    }
    return { x: node.position.x, y: node.position.y, w: size.width, h: size.height };
  }

  // --- Highlighting ---
  highlightConnectionsForNode(nodeId) {
    if (!this.svg) return;
    const nid = Number(nodeId);
    this.domCache.forEach((group, key) => {
      if (!group.inUse) return;
      const parts = key.split('-');
      if (Number(parts[0]) === nid || Number(parts[1]) === nid) {
        group.path.style.opacity = '1';
        group.arrowStart.style.opacity = '1';
        group.arrowEnd.style.opacity = '1';
      } else {
        group.path.style.opacity = '0.1';
        group.arrowStart.style.opacity = '0.1';
        group.arrowEnd.style.opacity = '0.1';
      }
    });
  }

  clearConnectionHighlighting() {
    this.domCache.forEach(group => {
      if (group.inUse) {
        group.path.style.opacity = '1';
        group.arrowStart.style.opacity = '1';
        group.arrowEnd.style.opacity = '1';
      }
    });
  }

  hideAllConnections() {
    if (this.svg) {
      this.svg.style.opacity = '0';
      this.svg.style.transition = 'opacity 0.2s ease';
    }
  }

  showAllConnections() {
    if (this.svg) {
      this.svg.style.opacity = '1';
    }
  }

  // --- Themes & Interaction ---
  getConnectionTheme(id) { return this.connectionThemes[id] || this.wallboard?.globalTheme || 'default'; }
  getThemeColor(key) { return (typeof Themes !== 'undefined' && Themes.definitions?.[key]?.accent) || '#f42365'; }
  setConnectionTheme(id, key) {
    // Helper to update a single ID
    const update = (targetId) => {
      if (key === 'default') delete this.connectionThemes[targetId];
      else this.connectionThemes[targetId] = key;
    };

    update(id);

    // Also update the reverse connection if it exists, to keep them in sync
    const parts = id.split('-');
    if (parts.length === 2) {
      const reverseId = `${parts[1]}-${parts[0]}`;
      // Check if reverse connection actually exists in our model
      const reverseExists = this.connections.some(c => c.id === reverseId);
      if (reverseExists) {
        update(reverseId);
      }
    }

    this.updateConnections();
  }

  // Tools (Cut/Drag) - simplified for brevity
  createDragLine() { this.removeDragLine(); this.dragLine = document.createElementNS("http://www.w3.org/2000/svg", "line"); this.dragLine.setAttribute("class", "drag-line"); this.dragLine.setAttribute("stroke", "rgba(255,255,255,0.5)"); this.dragLine.setAttribute("stroke-dasharray", "5,5"); this.svg.appendChild(this.dragLine); }
  updateDragLine(start, end) { if (this.dragLine) { const s = this.screenToCanvas(start.x, start.y), e = this.screenToCanvas(end.x, end.y); this.dragLine.setAttribute("x1", s.x); this.dragLine.setAttribute("y1", s.y); this.dragLine.setAttribute("x2", e.x); this.dragLine.setAttribute("y2", e.y); } }
  removeDragLine() { this.dragLine?.remove(); this.dragLine = null; }
  createCutLine() { this.removeCutLine(); this.cutLine = document.createElementNS("http://www.w3.org/2000/svg", "polyline"); this.cutLine.setAttribute("class", "cut-line"); this.cutLine.setAttribute("fill", "none"); this.cutLine.setAttribute("stroke", "#ff4444"); this.svg.appendChild(this.cutLine); this.cutPath = []; }
  addCutPoint(pos) { const p = this.screenToCanvas(pos.x, pos.y); this.cutPath.push(p); this.cutLine.setAttribute("points", this.cutPath.map(pt => `${pt.x},${pt.y}`).join(" ")); }
  removeCutLine() { this.cutLine?.remove(); this.cutLine = null; this.cutPath = []; }
  screenToCanvas(sx, sy) { if (this.wallboard) return { x: (sx - this.wallboard.panX) / this.wallboard.zoom, y: (sy - this.wallboard.panY) / this.wallboard.zoom }; return { x: sx, y: sy }; }

  processConnectionCuts() {
    if (this.cutPath.length < 2) return;
    const segs = []; for (let i = 0; i < this.cutPath.length - 1; i++) segs.push({ p1: this.cutPath[i], p2: this.cutPath[i + 1] });
    const toRem = [];
    this.connections.forEach(c => {
      const s = this.getNodeRect(c.start.nodeId), e = this.getNodeRect(c.end.nodeId);
      const c1 = { x: s.x + s.w / 2, y: s.y + s.h / 2 }, c2 = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
      for (const sg of segs) if (this.linesIntersect(c1, c2, sg.p1, sg.p2)) { toRem.push(c.id); break; }
    });
    toRem.forEach(id => this.removeConnection(id));
    this.removeCutLine();
  }
  linesIntersect(p1, p2, p3, p4) { const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y); if (det === 0) return false; const l = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det, g = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det; return (0 < l && l < 1) && (0 < g && g < 1); }

  handleArrowClick(e) {
    const arrow = e.target.closest('.connection-arrow');
    if (!arrow) return;
    const id = arrow.getAttribute('data-connection-id');
    if (!id) return;
    e.stopPropagation();
    this.showConnectionThemeSelector(id, e);
  }

  // Theme UI methods
  showConnectionThemeSelector(id, e) {
    if (!this.wallboard) return;
    this.hideConnectionThemeSelector();
    const selector = document.createElement('div');
    selector.className = 'theme-selector connection-theme-selector';
    selector.id = 'connectionThemeSelector';
    const themes = (typeof Themes !== 'undefined' && Themes.definitions) ? Themes.definitions : { 'default': { name: 'Default', accent: '#f42365' } };
    selector.innerHTML = `<div class="theme-selector-header"><h3>Connection Theme</h3><button class="close-btn" onclick="wallboard.connectionManager.hideConnectionThemeSelector()">×</button></div><div class="theme-grid">${Object.entries(themes).filter(([k]) => k !== 'pink').map(([key, theme]) => `<div class="theme-option" onclick="wallboard.connectionManager.selectConnectionTheme('${id}', '${key}')"><div class="theme-preview" style="background: ${theme.accent || '#fff'}"></div><span class="theme-name">${key === 'default' ? 'Global' : theme.name}</span></div>`).join('')}</div>`;
    const x = Math.min(e.clientX, window.innerWidth - 300), y = Math.min(e.clientY, window.innerHeight - 400);
    selector.style.position = 'fixed'; selector.style.left = x + 'px'; selector.style.top = y + 'px';
    document.body.appendChild(selector);
    setTimeout(() => document.addEventListener('click', this.handleOutsideClick.bind(this)), 10);
  }
  hideConnectionThemeSelector() { document.getElementById('connectionThemeSelector')?.remove(); document.removeEventListener('click', this.handleOutsideClick.bind(this)); }
  handleOutsideClick(e) { if (!e.target.closest('.connection-theme-selector')) this.hideConnectionThemeSelector(); }
  selectConnectionTheme(id, key) { this.setConnectionTheme(id, key); this.hideConnectionThemeSelector(); }
}

if (typeof window !== 'undefined') window.ConnectionManager = ConnectionManager;
