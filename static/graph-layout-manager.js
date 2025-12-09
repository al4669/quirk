/**
 * Graph Layout Manager
 * Production-ready: Batched DOM access, Optimized Algorithms, LR/TB Support.
 * Fixed: Keeps layout centered on current view, Syncs connections perfectly.
 */
class GraphLayoutManager {
  constructor(wallboard) {
    this.wallboard = wallboard;

    // Default configuration
    this.defaults = {
      animate: true,
      animationDuration: 500,     // Slightly slower for smoother visual
      layoutType: 'hierarchical', // 'hierarchical' | 'radial' | 'grid'
      direction: 'LR',            // 'TB' (Top-Bottom) or 'LR' (Left-Right)

      // Spacing configuration
      horizontalGap: 300,
      verticalGap: 100,

      // Behavior
      centerNodes: true,  // Keep the layout centered on where the nodes currently are
      excludeIds: []      // Nodes to keep fixed in space
    };
  }

  /**
   * Main entry point.
   */
  autoArrange(options = {}) {
    const config = { ...this.defaults, ...options };
    const nodes = this.wallboard.nodes;

    if (!nodes || nodes.length === 0) return;

    // 1. SNAPSHOT: Where is the center of the graph right now?
    // We will move the new layout here so it doesn't fly off screen.
    const activeNodeIds = nodes
      .map(n => n.id)
      .filter(id => !config.excludeIds.includes(id));

    if (activeNodeIds.length === 0) return;

    let initialCenter;
    if (config.targetCenter) {
      initialCenter = config.targetCenter;
    } else if (config.centerOnViewport) {
      initialCenter = this.getViewportCenter();
    } else {
      initialCenter = this.getGeometricCenter(activeNodeIds);
    }

    // 2. BATCH READ: Measure nodes
    const nodeMetrics = this.batchMeasureNodes(nodes);

    // 3. CALCULATE: Run algorithms (0,0 based)
    let positions = new Map();

    switch (config.layoutType) {
      case 'radial':
        positions = this.calculateRadialLayout(activeNodeIds, nodeMetrics, config);
        break;
      case 'grid':
        positions = this.calculateGridLayout(activeNodeIds, nodeMetrics, config);
        break;
      case 'hierarchical':
      default:
        positions = this.calculateHierarchicalLayout(activeNodeIds, nodeMetrics, config);
        break;
    }

    // 4. OFFSET: Shift new layout so its center matches the initial center
    if (config.centerNodes) {
      positions = this.alignLayoutToCenter(positions, nodeMetrics, initialCenter);
    }

    // 5. ANIMATE: Apply to DOM using JS Interpolation for perfect connection sync
    this.applyLayout(positions, config.animate, config.animationDuration);
  }

  /**
   * Measures the center X/Y of a list of node IDs currently on board
   */
  getGeometricCenter(nodeIds) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let found = false;

    nodeIds.forEach(id => {
      const node = this.wallboard.getNodeById(id);
      if (node) {
        // Use current model position
        minX = Math.min(minX, node.position.x);
        maxX = Math.max(maxX, node.position.x + (node.width || 250));
        minY = Math.min(minY, node.position.y);
        maxY = Math.max(maxY, node.position.y + (node.height || 180));
        found = true;
      }
    });

    if (!found) return { x: 0, y: 0 };

    return {
      x: minX + (maxX - minX) / 2,
      y: minY + (maxY - minY) / 2
    };
  }

  getViewportCenter() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Convert screen center to canvas coordinates
    return {
      x: (w / 2 - this.wallboard.panX) / this.wallboard.zoom,
      y: (h / 2 - this.wallboard.panY) / this.wallboard.zoom
    };
  }

  /**
   * Shifts the calculated positions so their center matches targetCenter
   */
  alignLayoutToCenter(positions, metrics, targetCenter) {
    // Find bounds of the NEW calculated layout
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    positions.forEach((p, id) => {
      const m = metrics.get(id);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + m.width);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + m.height);
    });

    const layoutCenterX = minX + (maxX - minX) / 2;
    const layoutCenterY = minY + (maxY - minY) / 2;

    // Calculate delta
    const offsetX = targetCenter.x - layoutCenterX;
    const offsetY = targetCenter.y - layoutCenterY;

    // Apply delta
    const centered = new Map();
    positions.forEach((p, id) => {
      centered.set(id, {
        x: p.x + offsetX,
        y: p.y + offsetY
      });
    });

    return centered;
  }

  batchMeasureNodes(nodes) {
    const metrics = new Map();
    const canvas = document.getElementById('canvas');
    const wasZoomedOut = canvas?.classList.contains('zoomed-out');
    if (wasZoomedOut) canvas.classList.remove('zoomed-out');

    nodes.forEach(node => {
      const el = document.getElementById(`node-${node.id}`);
      const width = el ? el.offsetWidth : (node.width || 250);
      const height = el ? el.offsetHeight : (node.height || 180);
      metrics.set(node.id, { width: Math.max(width, 150), height: Math.max(height, 80) });
    });

    if (wasZoomedOut) canvas.classList.add('zoomed-out');
    return metrics;
  }

  /**
   * JS-Based Animation Loop.
   * Updates Nodes AND Connections in the same frame to prevent ghosting.
   */
  applyLayout(targetPositions, animate, duration) {
    if (!animate) {
      // Instant Apply
      targetPositions.forEach((pos, id) => {
        const node = this.wallboard.getNodeById(id);
        if (node) {
          node.position.x = pos.x;
          node.position.y = pos.y;
          this.updateNodeDOM(node);
        }
      });
      this.wallboard.updateConnections();
      this.wallboard.updateCanvasBounds();
      this.wallboard.autoSave();
      return;
    }

    // --- Animation Setup ---
    const startPositions = new Map();
    const activeNodes = [];

    targetPositions.forEach((target, id) => {
      const node = this.wallboard.getNodeById(id);
      if (node) {
        startPositions.set(id, { x: node.position.x, y: node.position.y });
        activeNodes.push({ node, start: startPositions.get(id), end: target });
      }
    });

    const startTime = performance.now();

    // Easing function (Ease Out Cubic)
    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

    const frame = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      // 1. Update positions in Data Model AND DOM
      activeNodes.forEach(item => {
        const cx = item.start.x + (item.end.x - item.start.x) * eased;
        const cy = item.start.y + (item.end.y - item.start.y) * eased;

        item.node.position.x = cx;
        item.node.position.y = cy;
        this.updateNodeDOM(item.node);
      });

      // 2. Force Connection Update immediately (Syncs perfectly with nodes)
      this.wallboard.updateConnections();

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        // Finalize
        this.wallboard.updateCanvasBounds();
        this.wallboard.autoSave();
      }
    };

    requestAnimationFrame(frame);
  }

  updateNodeDOM(node) {
    const el = document.getElementById(`node-${node.id}`);
    if (el) {
      // Direct transform update (bypass CSS transitions for strict sync)
      el.style.transition = 'none';
      el.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;
    }
  }

  // --- Layout Algorithms (Unchanged & Perfect) ---

  calculateHierarchicalLayout(nodeIds, metrics, config) {
    const positions = new Map();
    const graph = this.buildGraph(nodeIds);
    const isLR = config.direction === 'LR';
    const levels = this.assignLevels(graph, nodeIds);
    this.reduceCrossings(levels, graph);

    let currentLevelPos = 0;

    levels.forEach(levelIds => {
      if (levelIds.length === 0) return;

      if (isLR) {
        const colWidth = Math.max(...levelIds.map(id => metrics.get(id).width));
        const totalColHeight = levelIds.reduce((acc, id) =>
          acc + metrics.get(id).height + config.verticalGap, 0) - config.verticalGap;
        let currentY = -(totalColHeight / 2);

        levelIds.forEach(id => {
          const dim = metrics.get(id);
          positions.set(id, { x: currentLevelPos, y: currentY });
          currentY += dim.height + config.verticalGap;
        });
        currentLevelPos += colWidth + config.horizontalGap;
      } else {
        const rowHeight = Math.max(...levelIds.map(id => metrics.get(id).height));
        const totalRowWidth = levelIds.reduce((acc, id) =>
          acc + metrics.get(id).width + config.horizontalGap, 0) - config.horizontalGap;
        let currentX = -(totalRowWidth / 2);

        levelIds.forEach(id => {
          const dim = metrics.get(id);
          positions.set(id, { x: currentX, y: currentLevelPos });
          currentX += dim.width + config.horizontalGap;
        });
        currentLevelPos += rowHeight + config.verticalGap;
      }
    });
    return positions;
  }

  calculateGridLayout(nodeIds, metrics, config) {
    const positions = new Map();
    const cols = Math.ceil(Math.sqrt(nodeIds.length));
    let curX = 0, curY = 0, maxLineH = 0, colCount = 0;
    nodeIds.forEach(id => {
      const dim = metrics.get(id);
      positions.set(id, { x: curX, y: curY });
      maxLineH = Math.max(maxLineH, dim.height);
      curX += dim.width + config.horizontalGap;
      colCount++;
      if (colCount >= cols) {
        colCount = 0; curX = 0;
        curY += maxLineH + config.verticalGap; maxLineH = 0;
      }
    });
    return positions;
  }

  calculateRadialLayout(nodeIds, metrics, config) {
    const positions = new Map();
    const graph = this.buildGraph(nodeIds);
    const roots = this.findRoots(graph, nodeIds);
    const processed = new Set();
    let radius = 0;
    let currentLevel = roots;

    roots.forEach((id, i) => {
      const angle = (i / roots.length) * Math.PI * 2;
      positions.set(id, { x: Math.cos(angle) * 10, y: Math.sin(angle) * 10 });
      processed.add(id);
    });

    while (currentLevel.length > 0) {
      const nextLevel = [];
      radius += 350;
      currentLevel.forEach(parentId => {
        const children = (graph.outgoing.get(parentId) || []).filter(c => !processed.has(c) && nodeIds.includes(c));
        if (children.length === 0) return;
        const pPos = positions.get(parentId);
        const startAngle = Math.atan2(pPos.y, pPos.x) - (Math.PI / 1.5) / 2;
        children.forEach((childId, i) => {
          const angle = startAngle + (i / children.length) * (Math.PI / 1.5);
          positions.set(childId, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
          processed.add(childId);
          nextLevel.push(childId);
        });
      });
      currentLevel = nextLevel;
    }
    this.resolveCollisions(positions, metrics);
    return positions;
  }

  // --- Graph Helpers ---
  buildGraph(nodeIds) {
    const activeSet = new Set(nodeIds);
    const outgoing = new Map(), incoming = new Map();
    nodeIds.forEach(id => { outgoing.set(id, []); incoming.set(id, []); });
    this.wallboard.connectionManager.connections.forEach(conn => {
      if (activeSet.has(conn.start.nodeId) && activeSet.has(conn.end.nodeId)) {
        outgoing.get(conn.start.nodeId).push(conn.end.nodeId);
        incoming.get(conn.end.nodeId).push(conn.start.nodeId);
      }
    });
    return { outgoing, incoming };
  }

  assignLevels(graph, nodeIds) {
    const levels = [], visited = new Set();
    const roots = this.findRoots(graph, nodeIds);
    const queue = roots.length ? roots.map(id => ({ id, lvl: 0 })) : [{ id: nodeIds[0], lvl: 0 }];
    while (queue.length > 0) {
      const { id, lvl } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      if (!levels[lvl]) levels[lvl] = [];
      levels[lvl].push(id);
      (graph.outgoing.get(id) || []).forEach(child => queue.push({ id: child, lvl: lvl + 1 }));
    }
    nodeIds.forEach(id => { if (!visited.has(id)) { if (!levels[0]) levels[0] = []; levels[0].push(id); } });
    return levels;
  }

  findRoots(graph, nodeIds) {
    return nodeIds.filter(id => (graph.incoming.get(id) || []).length === 0);
  }

  reduceCrossings(levels, graph) {
    for (let i = 1; i < levels.length; i++) {
      levels[i].sort((a, b) => {
        const getAvg = (pid) => { const p = graph.incoming.get(pid) || []; return p.reduce((s, x) => s + levels[i - 1].indexOf(x), 0) / (p.length || 1); };
        return getAvg(a) - getAvg(b);
      });
    }
  }

  resolveCollisions(positions, metrics) {
    const nodes = Array.from(positions.keys());
    for (let i = 0; i < 3; i++) {
      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          const idA = nodes[a], idB = nodes[b];
          const pA = positions.get(idA), pB = positions.get(idB);
          const mA = metrics.get(idA), mB = metrics.get(idB);
          const dx = (pA.x + mA.width / 2) - (pB.x + mB.width / 2), dy = (pA.y + mA.height / 2) - (pB.y + mB.height / 2);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1, minD = (Math.max(mA.width, mB.width) + 50);
          if (dist < minD) {
            const push = (minD - dist) / 2, mx = (dx / dist) * push, my = (dy / dist) * push;
            pA.x += mx; pA.y += my; pB.x -= mx; pB.y -= my;
          }
        }
      }
    }
  }
}