/**
 * Graph Layout Manager
 * Production-ready: Batched DOM access, Optimized Algorithms, LR/TB Support.
 * Fixed: Keeps layout centered on current view, Syncs connections perfectly.
 *
 * NEW: Disconnected clusters + single nodes are handled cleanly.
 *  - Connected components are detected (BFS)
 *  - Each cluster is laid out independently (hierarchical/radial)
 *  - Clusters are then packed in a grid with spacing
 *  - Single nodes are arranged in a symmetric grid BELOW the clusters
 */
class GraphLayoutManager {
  constructor(wallboard) {
    this.wallboard = wallboard;

    // Default configuration
    this.defaults = {
      animate: true,
      animationDuration: 500,
      layoutType: 'hierarchical', // 'hierarchical' | 'radial' | 'grid'
      direction: 'LR',            // 'TB' (Top-Bottom) or 'LR' (Left-Right)

      // Spacing configuration
      horizontalGap: 300,
      verticalGap: 100,

      // Cluster packing spacing (between clusters)
      clusterGapX: 240,
      clusterGapY: 200,

      // Disconnected node grid spacing
      disconnectedGapX: 220,
      disconnectedGapY: 160,

      // Behavior
      centerNodes: true,     // Keep the layout centered on where the nodes currently are
      excludeIds: [],        // Nodes to keep fixed in space
      clusterize: true       // NEW: enable cluster-aware layouts (recommended)
    };
  }

  /**
   * Main entry point.
   */
  autoArrange(options = {}) {
    const config = { ...this.defaults, ...options };
    const nodes = this.wallboard.nodes;

    if (!nodes || nodes.length === 0) return;

    const activeNodeIds = nodes
      .map(n => n.id)
      .filter(id => !config.excludeIds.includes(id));

    if (activeNodeIds.length === 0) return;

    // 1) Snapshot center (keep layout where the graph already is)
    let initialCenter;
    if (config.targetCenter) {
      initialCenter = config.targetCenter;
    } else if (config.centerOnViewport) {
      initialCenter = this.getViewportCenter();
    } else {
      initialCenter = this.getGeometricCenter(activeNodeIds);
    }

    // 2) Batch read: measure nodes
    const nodeMetrics = this.batchMeasureNodes(nodes);

    // 3) Calculate: run algorithms (0,0 based)
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

    // 4) Offset: shift new layout so its center matches the initial center
    if (config.centerNodes) {
      positions = this.alignLayoutToCenter(positions, nodeMetrics, initialCenter);
    }

    // 5) Animate: apply to DOM using JS interpolation for perfect connection sync
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
    return {
      x: (w / 2 - this.wallboard.panX) / this.wallboard.zoom,
      y: (h / 2 - this.wallboard.panY) / this.wallboard.zoom
    };
  }

  /**
   * Shifts the calculated positions so their center matches targetCenter
   */
  alignLayoutToCenter(positions, metrics, targetCenter) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    positions.forEach((p, id) => {
      const m = metrics.get(id);
      if (!m) return;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + m.width);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + m.height);
    });

    if (!isFinite(minX) || !isFinite(minY)) return positions;

    const layoutCenterX = minX + (maxX - minX) / 2;
    const layoutCenterY = minY + (maxY - minY) / 2;

    const offsetX = targetCenter.x - layoutCenterX;
    const offsetY = targetCenter.y - layoutCenterY;

    const centered = new Map();
    positions.forEach((p, id) => {
      centered.set(id, { x: p.x + offsetX, y: p.y + offsetY });
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
      metrics.set(node.id, {
        width: Math.max(width, 150),
        height: Math.max(height, 80)
      });
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

    const activeNodes = [];
    targetPositions.forEach((target, id) => {
      const node = this.wallboard.getNodeById(id);
      if (node) {
        activeNodes.push({
          node,
          start: { x: node.position.x, y: node.position.y },
          end: target
        });
      }
    });

    const startTime = performance.now();
    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

    const frame = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      activeNodes.forEach(item => {
        const cx = item.start.x + (item.end.x - item.start.x) * eased;
        const cy = item.start.y + (item.end.y - item.start.y) * eased;
        item.node.position.x = cx;
        item.node.position.y = cy;
        this.updateNodeDOM(item.node);
      });

      this.wallboard.updateConnections();

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        this.wallboard.updateCanvasBounds();
        this.wallboard.autoSave();
      }
    };

    requestAnimationFrame(frame);
  }

  updateNodeDOM(node) {
    const el = document.getElementById(`node-${node.id}`);
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;
    }
  }

  // ---------------------------------------------------------------------------
  // Layout Algorithms
  // ---------------------------------------------------------------------------

  /**
   * NEW: Cluster-aware hierarchical layout.
   * - Detect connected components
   * - Layout each cluster independently
   * - Pack clusters into a grid
   * - Place singletons in a symmetric grid below
   */
  calculateHierarchicalLayout(nodeIds, metrics, config) {
    if (!config.clusterize) {
      return this._calculateHierarchicalLayoutForCluster(nodeIds, metrics, config);
    }

    const clusters = this.detectClusters(nodeIds);
    return this.layoutClusters(clusters, (clusterIds) => {
      return this._calculateHierarchicalLayoutForCluster(clusterIds, metrics, config);
    }, metrics, config);
  }

  /**
   * Original hierarchical logic, but for a SINGLE cluster.
   */
  _calculateHierarchicalLayoutForCluster(nodeIds, metrics, config) {
    const positions = new Map();
    const graph = this.buildGraph(nodeIds);
    const isLR = config.direction === 'LR';

    const levels = this.assignLevels(graph, nodeIds);
    this.reduceCrossings(levels, graph);

    let currentLevelPos = 0;

    levels.forEach(levelIds => {
      if (!levelIds || levelIds.length === 0) return;

      if (isLR) {
        const colWidth = Math.max(...levelIds.map(id => metrics.get(id)?.width ?? 250));
        const totalColHeight = levelIds.reduce((acc, id) =>
          acc + (metrics.get(id)?.height ?? 180) + config.verticalGap, 0) - config.verticalGap;
        let currentY = -(totalColHeight / 2);

        levelIds.forEach(id => {
          const dim = metrics.get(id) || { width: 250, height: 180 };
          positions.set(id, { x: currentLevelPos, y: currentY });
          currentY += dim.height + config.verticalGap;
        });

        currentLevelPos += colWidth + config.horizontalGap;
      } else {
        const rowHeight = Math.max(...levelIds.map(id => metrics.get(id)?.height ?? 180));
        const totalRowWidth = levelIds.reduce((acc, id) =>
          acc + (metrics.get(id)?.width ?? 250) + config.horizontalGap, 0) - config.horizontalGap;
        let currentX = -(totalRowWidth / 2);

        levelIds.forEach(id => {
          const dim = metrics.get(id) || { width: 250, height: 180 };
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

    // Grid already handles disconnected well; keep it simple and fast.
    const cols = Math.ceil(Math.sqrt(nodeIds.length));
    let curX = 0, curY = 0, maxLineH = 0, colCount = 0;

    nodeIds.forEach(id => {
      const dim = metrics.get(id) || { width: 250, height: 180 };
      positions.set(id, { x: curX, y: curY });
      maxLineH = Math.max(maxLineH, dim.height);
      curX += dim.width + config.horizontalGap;
      colCount++;
      if (colCount >= cols) {
        colCount = 0;
        curX = 0;
        curY += maxLineH + config.verticalGap;
        maxLineH = 0;
      }
    });

    return positions;
  }

  calculateRadialLayout(nodeIds, metrics, config) {
    // Optional clusterization: radial layouts for multiple clusters look much better when separated.
    if (config.clusterize) {
      const clusters = this.detectClusters(nodeIds);
      return this.layoutClusters(clusters, (clusterIds) => {
        return this._calculateRadialLayoutForCluster(clusterIds, metrics, config);
      }, metrics, config);
    }

    return this._calculateRadialLayoutForCluster(nodeIds, metrics, config);
  }

  _calculateRadialLayoutForCluster(nodeIds, metrics, config) {
    const positions = new Map();
    const graph = this.buildGraph(nodeIds);
    const roots = this.findRoots(graph, nodeIds);
    const processed = new Set();
    let radius = 0;
    let currentLevel = roots.length ? roots : [nodeIds[0]];

    currentLevel.forEach((id, i) => {
      const angle = (i / currentLevel.length) * Math.PI * 2;
      positions.set(id, { x: Math.cos(angle) * 10, y: Math.sin(angle) * 10 });
      processed.add(id);
    });

    while (currentLevel.length > 0) {
      const nextLevel = [];
      radius += 350;
      currentLevel.forEach(parentId => {
        const children = (graph.outgoing.get(parentId) || [])
          .filter(c => !processed.has(c) && nodeIds.includes(c));
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

  // ---------------------------------------------------------------------------
  // NEW: Cluster support
  // ---------------------------------------------------------------------------

  /**
   * detectClusters(nodeIds)
   * - Uses BFS on an undirected adjacency to find connected components.
   * - Returns: Array< Array<nodeId> >
   */
  detectClusters(nodeIds) {
    const active = new Set(nodeIds);

    // Build undirected adjacency
    const adj = new Map();
    nodeIds.forEach(id => adj.set(id, []));

    this.wallboard.connectionManager.connections.forEach(conn => {
      const a = conn.start?.nodeId;
      const b = conn.end?.nodeId;
      if (!active.has(a) || !active.has(b)) return;
      adj.get(a).push(b);
      adj.get(b).push(a);
    });

    const visited = new Set();
    const clusters = [];

    nodeIds.forEach(startId => {
      if (visited.has(startId)) return;

      const queue = [startId];
      visited.add(startId);
      const cluster = [];

      while (queue.length) {
        const id = queue.shift();
        cluster.push(id);
        const neighbors = adj.get(id) || [];
        for (const n of neighbors) {
          if (!visited.has(n)) {
            visited.add(n);
            queue.push(n);
          }
        }
      }

      clusters.push(cluster);
    });

    // Stable ordering: larger clusters first (so packing looks nicer)
    clusters.sort((a, b) => b.length - a.length);
    return clusters;
  }

  /**
   * getLayoutBounds(positions, metrics)
   * - Bounding box for a layout map (cluster)
   */
  getLayoutBounds(positions, metrics) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;

    positions.forEach((p, id) => {
      const m = metrics.get(id) || { width: 250, height: 180 };
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + m.width);
      maxY = Math.max(maxY, p.y + m.height);
      found = true;
    });

    if (!found) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

    return {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * layoutClusters(clusters, layoutFn, metrics, config)
   * - layouts each connected cluster using layoutFn(clusterIds) => Map(id -> {x,y})
   * - packs multi-node clusters into a grid
   * - places single-node clusters into a symmetric grid below
   */
  layoutClusters(clusters, layoutFn, metrics, config) {
    const multi = [];
    const singles = [];

    for (const c of clusters) {
      if (c.length <= 1) singles.push(c);
      else multi.push(c);
    }

    // 1) Layout each multi-node cluster independently
    const clusterLayouts = multi.map(clusterIds => {
      const pos = layoutFn(clusterIds);
      const bounds = this.getLayoutBounds(pos, metrics);
      return { clusterIds, pos, bounds };
    });

    // 2) Pack clusters into a grid-ish formation (simple shelf pack)
    const packed = new Map();
    if (clusterLayouts.length > 0) {
      const cols = Math.ceil(Math.sqrt(clusterLayouts.length));
      let col = 0;
      let cursorX = 0;
      let cursorY = 0;
      let rowMaxH = 0;

      clusterLayouts.forEach((cl) => {
        // shift cluster so its minX/minY start at 0 before packing
        const shiftX = -cl.bounds.minX;
        const shiftY = -cl.bounds.minY;

        // place at current cursor
        const placeX = cursorX;
        const placeY = cursorY;

        cl.pos.forEach((p, id) => {
          packed.set(id, { x: p.x + shiftX + placeX, y: p.y + shiftY + placeY });
        });

        rowMaxH = Math.max(rowMaxH, cl.bounds.height);
        cursorX += cl.bounds.width + config.clusterGapX;
        col++;

        if (col >= cols) {
          col = 0;
          cursorX = 0;
          cursorY += rowMaxH + config.clusterGapY;
          rowMaxH = 0;
        }
      });
    }

    // 3) Single nodes: symmetric grid BELOW the packed cluster area
    const packedBounds = this.getLayoutBounds(packed, metrics);
    const singlesTopY = (packed.size > 0) ? (packedBounds.maxY + config.clusterGapY) : 0;

    if (singles.length > 0) {
      const singleIds = singles.map(c => c[0]);
      const sCols = Math.ceil(Math.sqrt(singleIds.length));

      // compute row widths to center them
      let row = 0;
      let rowIds = [];
      const rows = [];
      for (const id of singleIds) {
        rowIds.push(id);
        if (rowIds.length >= sCols) {
          rows.push(rowIds);
          rowIds = [];
        }
      }
      if (rowIds.length) rows.push(rowIds);

      let y = singlesTopY;
      rows.forEach(rids => {
        // total width of this row
        const rowW = rids.reduce((acc, id, idx) => {
          const m = metrics.get(id) || { width: 250, height: 180 };
          return acc + m.width + (idx ? config.disconnectedGapX : 0);
        }, 0);

        // center relative to packed area (or around 0 if no clusters)
        const areaCenterX = (packed.size > 0)
          ? (packedBounds.minX + packedBounds.width / 2)
          : 0;

        let x = areaCenterX - rowW / 2;

        let maxH = 0;
        rids.forEach((id, idx) => {
          const m = metrics.get(id) || { width: 250, height: 180 };
          packed.set(id, { x, y });
          maxH = Math.max(maxH, m.height);
          x += m.width + config.disconnectedGapX;
        });

        y += maxH + config.disconnectedGapY;
        row++;
      });
    }

    return packed;
  }

  // ---------------------------------------------------------------------------
  // Graph Helpers
  // ---------------------------------------------------------------------------

  buildGraph(nodeIds) {
    const activeSet = new Set(nodeIds);
    const outgoing = new Map(), incoming = new Map();
    nodeIds.forEach(id => { outgoing.set(id, []); incoming.set(id, []); });

    this.wallboard.connectionManager.connections.forEach(conn => {
      const a = conn.start?.nodeId;
      const b = conn.end?.nodeId;
      if (activeSet.has(a) && activeSet.has(b)) {
        outgoing.get(a).push(b);
        incoming.get(b).push(a);
      }
    });

    return { outgoing, incoming };
  }

  assignLevels(graph, nodeIds) {
    const levels = [];
    const visited = new Set();
    const roots = this.findRoots(graph, nodeIds);

    const start = roots.length ? roots[0] : nodeIds[0];
    const queue = [{ id: start, lvl: 0 }];

    while (queue.length > 0) {
      const { id, lvl } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      if (!levels[lvl]) levels[lvl] = [];
      levels[lvl].push(id);
      (graph.outgoing.get(id) || []).forEach(child => queue.push({ id: child, lvl: lvl + 1 }));
    }

    // IMPORTANT: for cluster layouts we do NOT want “dump all unvisited into level 0”
    // because clusters are handled separately now. But within a cluster, there might
    // still be directionality issues; we keep orphan nodes (no path from chosen root)
    // at level 0 *within that cluster*.
    nodeIds.forEach(id => {
      if (!visited.has(id)) {
        if (!levels[0]) levels[0] = [];
        levels[0].push(id);
      }
    });

    return levels;
  }

  findRoots(graph, nodeIds) {
    return nodeIds.filter(id => (graph.incoming.get(id) || []).length === 0);
  }

  reduceCrossings(levels, graph) {
    for (let i = 1; i < levels.length; i++) {
      const prev = levels[i - 1] || [];
      levels[i].sort((a, b) => {
        const getAvg = (pid) => {
          const parents = graph.incoming.get(pid) || [];
          const denom = parents.length || 1;
          return parents.reduce((s, x) => s + Math.max(0, prev.indexOf(x)), 0) / denom;
        };
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
          const mA = metrics.get(idA) || { width: 250, height: 180 };
          const mB = metrics.get(idB) || { width: 250, height: 180 };

          const dx = (pA.x + mA.width / 2) - (pB.x + mB.width / 2);
          const dy = (pA.y + mA.height / 2) - (pB.y + mB.height / 2);

          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minD = (Math.max(mA.width, mB.width) + 50);

          if (dist < minD) {
            const push = (minD - dist) / 2;
            const mx = (dx / dist) * push;
            const my = (dy / dist) * push;
            pA.x += mx; pA.y += my;
            pB.x -= mx; pB.y -= my;
          }
        }
      }
    }
  }
}
