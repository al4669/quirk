// Graph layout manager for automatic node arrangement
class GraphLayoutManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
  }

  /**
   * Helper to measure real node dimensions (removing zoomed-out class temporarily if needed)
   * @param {number} nodeId - The node ID to measure
   * @returns {{width: number, height: number}} - The real unscaled dimensions
   */
  measureNodeDimensions(nodeId) {
    const nodeEl = document.getElementById(`node-${nodeId}`);
    if (!nodeEl) {
      return { width: 250, height: 180 }; // Default fallback
    }

    // Check if canvas has zoomed-out class (which hides content and makes nodes smaller)
    const canvas = document.getElementById('canvas');
    const wasZoomedOut = canvas?.classList.contains('zoomed-out');

    // Temporarily remove zoomed-out class to get real dimensions
    if (wasZoomedOut) {
      canvas.classList.remove('zoomed-out');
    }

    // Measure the node
    const width = nodeEl.offsetWidth || 250;
    const height = nodeEl.offsetHeight || 180;

    // Restore zoomed-out class if it was there
    if (wasZoomedOut) {
      canvas.classList.add('zoomed-out');
    }

    return { width, height };
  }

  /**
   * Calculate hierarchical tree layout for all nodes
   * @param {object} options - Layout configuration
   * @returns {Map} - Map of nodeId -> {x, y} positions
   */
  calculateTreeLayout(options = {}) {
    const {
      horizontalGap = 200,    // Fixed horizontal gap between sibling nodes
      verticalGap = 200,      // Fixed vertical gap between levels
      centerCanvas = true     // Center the layout on canvas
    } = options;

    if (this.wallboard.nodes.length === 0) {
      return new Map();
    }

    // Get actual node sizes (use helper to handle zoomed-out state)
    const nodeSizes = new Map();
    this.wallboard.nodes.forEach(node => {
      nodeSizes.set(node.id, this.measureNodeDimensions(node.id));
    });

    // Build graph structure from connections
    const graph = this.buildGraphStructure();

    // Find root nodes (nodes with no incoming connections or isolated nodes)
    const roots = this.findRootNodes(graph);

    // Assign levels to each node using BFS
    const nodeLevels = this.assignLevels(roots, graph);

    // Calculate positions with consistent gaps
    const positions = this.positionNodesWithGaps(nodeLevels, nodeSizes, horizontalGap, verticalGap);

    // Center the layout on canvas if requested
    if (centerCanvas) {
      this.centerLayout(positions, nodeSizes);
    }

    return positions;
  }

  /**
   * Center the layout on the canvas
   */
  centerLayout(positions, nodeSizes = null) {
    if (positions.size === 0) return;

    // Find bounding box of all nodes
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    positions.forEach((pos, nodeId) => {
      // Use actual node size if available, otherwise use default estimate
      const size = nodeSizes?.get(nodeId) || { width: 250, height: 180 };

      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + size.width);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y + size.height);
    });

    // Calculate center of the layout
    const layoutCenterX = (minX + maxX) / 2;
    const layoutCenterY = (minY + maxY) / 2;

    // Get canvas center - the canvas is positioned with its center at (WIDTH/2, HEIGHT/2)
    const canvasCenterX = this.wallboard.canvasWidth / 2;
    const canvasCenterY = this.wallboard.canvasHeight / 2;

    // Calculate offset to center the layout on canvas
    const offsetX = canvasCenterX - layoutCenterX;
    const offsetY = canvasCenterY - layoutCenterY;

    console.log('[GraphLayout] Centering debug:', {
      bbox: { minX, maxX, minY, maxY },
      layoutCenter: { x: layoutCenterX, y: layoutCenterY },
      canvasCenter: { x: canvasCenterX, y: canvasCenterY },
      canvasSize: { w: this.wallboard.canvasWidth, h: this.wallboard.canvasHeight },
      offset: { x: offsetX, y: offsetY },
      nodeCount: positions.size
    });

    // Apply offset to all positions
    positions.forEach(pos => {
      pos.x += offsetX;
      pos.y += offsetY;
    });
  }

  /**
   * Build adjacency list from connections
   * @param {boolean} ignoreBackwardEdges - If true, ignore bidirectional connections (keep only one direction)
   */
  buildGraphStructure(ignoreBackwardEdges = false) {
    const graph = {
      outgoing: new Map(), // node -> [children]
      incoming: new Map()  // node -> [parents]
    };

    // Initialize for all nodes
    this.wallboard.nodes.forEach(node => {
      graph.outgoing.set(node.id, []);
      graph.incoming.set(node.id, []);
    });

    // Track connections we've already processed (for bidirectional detection)
    const processedConnections = new Set();

    // Build from connections
    this.wallboard.connectionManager.connections.forEach(conn => {
      const sourceId = conn.start.nodeId;
      const targetId = conn.end.nodeId;

      // Create a normalized connection key for bidirectional detection
      const forwardKey = `${sourceId}-${targetId}`;
      const reverseKey = `${targetId}-${sourceId}`;

      if (ignoreBackwardEdges) {
        // Check if we've already seen the reverse connection
        if (processedConnections.has(reverseKey)) {
          // This is a backward edge (B→A when we already have A→B), skip it
          console.log(`[GraphLayout] Ignoring backward edge: ${sourceId}→${targetId} (reverse of ${targetId}→${sourceId})`);
          return;
        }
      }

      // Add this connection
      if (graph.outgoing.has(sourceId)) {
        graph.outgoing.get(sourceId).push(targetId);
      }
      if (graph.incoming.has(targetId)) {
        graph.incoming.get(targetId).push(sourceId);
      }

      // Mark as processed
      processedConnections.add(forwardKey);
    });

    return graph;
  }

  /**
   * Find root nodes (no incoming connections) or isolated nodes
   */
  findRootNodes(graph) {
    const roots = [];

    this.wallboard.nodes.forEach(node => {
      const incomingCount = graph.incoming.get(node.id)?.length || 0;
      if (incomingCount === 0) {
        roots.push(node.id);
      }
    });

    return roots;
  }

  /**
   * Assign level to each node using BFS
   */
  assignLevels(roots, graph) {
    const levels = new Map(); // nodeId -> level
    const visited = new Set();
    const queue = [];

    // Start with roots at level 0
    roots.forEach(rootId => {
      queue.push({ nodeId: rootId, level: 0 });
      visited.add(rootId);
    });

    // BFS traversal
    while (queue.length > 0) {
      const { nodeId, level } = queue.shift();
      levels.set(nodeId, level);

      // Add children to next level
      const children = graph.outgoing.get(nodeId) || [];
      children.forEach(childId => {
        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push({ nodeId: childId, level: level + 1 });
        }
      });
    }

    // Handle any nodes not reached (cycles or disconnected components)
    this.wallboard.nodes.forEach(node => {
      if (!levels.has(node.id)) {
        levels.set(node.id, 0); // Put at root level
      }
    });

    // Organize by levels
    const nodeLevels = [];
    levels.forEach((level, nodeId) => {
      if (!nodeLevels[level]) {
        nodeLevels[level] = [];
      }
      nodeLevels[level].push(nodeId);
    });

    console.log('[GraphLayout] Level assignment:', {
      totalNodes: this.wallboard.nodes.length,
      totalLevels: nodeLevels.length,
      nodesPerLevel: nodeLevels.map((level, idx) => `Level ${idx}: ${level.length} nodes`),
      graph: {
        roots: roots.length,
        connections: this.wallboard.connectionManager.connections.length
      }
    });

    // Apply crossing reduction using barycenter method
    this.reduceCrossings(nodeLevels, graph);

    return nodeLevels;
  }

  /**
   * Reduce edge crossings using the barycenter heuristic
   */
  reduceCrossings(nodeLevels, graph) {
    const maxIterations = 10;

    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;

      // Forward pass: order nodes based on parents
      for (let level = 1; level < nodeLevels.length; level++) {
        const newOrder = this.orderByBarycenter(nodeLevels[level], nodeLevels[level - 1], graph, 'incoming');
        if (this.arraysAreDifferent(nodeLevels[level], newOrder)) {
          nodeLevels[level] = newOrder;
          changed = true;
        }
      }

      // Backward pass: order nodes based on children
      for (let level = nodeLevels.length - 2; level >= 0; level--) {
        const newOrder = this.orderByBarycenter(nodeLevels[level], nodeLevels[level + 1], graph, 'outgoing');
        if (this.arraysAreDifferent(nodeLevels[level], newOrder)) {
          nodeLevels[level] = newOrder;
          changed = true;
        }
      }

      if (!changed) break;
    }
  }

  /**
   * Order nodes by barycenter (average position of connected nodes)
   */
  orderByBarycenter(nodes, adjacentLevel, graph, direction) {
    const barycenters = nodes.map(nodeId => {
      const connections = direction === 'incoming'
        ? graph.incoming.get(nodeId) || []
        : graph.outgoing.get(nodeId) || [];

      if (connections.length === 0) {
        return { nodeId, barycenter: adjacentLevel.indexOf(nodeId) };
      }

      // Calculate average position of connected nodes
      const sum = connections.reduce((acc, connectedId) => {
        const pos = adjacentLevel.indexOf(connectedId);
        return acc + (pos !== -1 ? pos : 0);
      }, 0);

      return { nodeId, barycenter: sum / connections.length };
    });

    // Sort by barycenter value
    barycenters.sort((a, b) => a.barycenter - b.barycenter);

    return barycenters.map(item => item.nodeId);
  }

  /**
   * Check if two arrays are different
   */
  arraysAreDifferent(arr1, arr2) {
    if (arr1.length !== arr2.length) return true;
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return true;
    }
    return false;
  }

  /**
   * Position nodes with consistent gaps between them
   * @param {Array} nodeLevels - Array of arrays, each containing node IDs for that level
   * @param {Map} nodeSizes - Map of nodeId -> {width, height}
   * @param {number} horizontalGap - Fixed gap between sibling nodes
   * @param {number} verticalGap - Fixed gap between levels
   */
  positionNodesWithGaps(nodeLevels, nodeSizes, horizontalGap, verticalGap) {
    const positions = new Map();
    let currentY = 0;

    nodeLevels.forEach((nodeIds, level) => {
      // Calculate the width of each node and total width of this level
      const nodeWidths = nodeIds.map(id => nodeSizes.get(id)?.width || 250);
      const totalWidth = nodeWidths.reduce((sum, w) => sum + w, 0) + (horizontalGap * (nodeIds.length - 1));

      // Start X for this level (centered around 0)
      let currentX = -totalWidth / 2;

      // Find max height in this level for vertical spacing
      const maxHeightInLevel = Math.max(...nodeIds.map(id => nodeSizes.get(id)?.height || 180));

      // Position each node in this level with consistent gaps
      nodeIds.forEach((nodeId, index) => {
        const size = nodeSizes.get(nodeId) || { width: 250, height: 180 };

        positions.set(nodeId, {
          x: currentX,
          y: currentY
        });

        // Move X position for next node: current node width + gap
        currentX += size.width + horizontalGap;
      });

      // Move Y position for next level: max height in this level + gap
      currentY += maxHeightInLevel + verticalGap;
    });

    return positions;
  }

  /**
   * Apply calculated layout to nodes with smooth animation
   */
  applyLayout(positions, animate = true, onComplete = null) {
    if (!animate) {
      // Instant positioning
      positions.forEach((pos, nodeId) => {
        const node = this.wallboard.getNodeById(nodeId);
        if (node) {
          node.position.x = pos.x;
          node.position.y = pos.y;
          console.log(`[GraphLayout] Set node ${nodeId} to (${pos.x}, ${pos.y})`);
        }
      });

      // Re-render all nodes and connections
      this.wallboard.nodes.forEach(node => {
        const nodeEl = document.getElementById(`node-${node.id}`);
        if (nodeEl) {
          nodeEl.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;
          console.log(`[GraphLayout] DOM node ${node.id} positioned at (${node.position.x}, ${node.position.y})`);
        }
      });
      this.wallboard.updateConnections();

      // Save the new positions
      this.wallboard.autoSave();

      // Call completion callback
      if (onComplete) onComplete();
      return;
    }

    // Animated positioning
    const duration = 300; // ms - faster animation
    const startTime = Date.now();
    const startPositions = new Map();

    // Record start positions
    positions.forEach((pos, nodeId) => {
      const node = this.wallboard.getNodeById(nodeId);
      if (node) {
        startPositions.set(nodeId, { x: node.position.x, y: node.position.y });
      }
    });

    // Easing function (easeOutCubic - snappier feel)
    const easeOutCubic = (t) => {
      return 1 - Math.pow(1 - t, 3);
    };

    // Animation loop
    const animate_frame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      // Update each node position
      positions.forEach((targetPos, nodeId) => {
        const node = this.wallboard.getNodeById(nodeId);
        const startPos = startPositions.get(nodeId);

        if (node && startPos) {
          // Interpolate position
          node.position.x = startPos.x + (targetPos.x - startPos.x) * easedProgress;
          node.position.y = startPos.y + (targetPos.y - startPos.y) * easedProgress;

          // Update DOM
          const nodeEl = document.getElementById(`node-${node.id}`);
          if (nodeEl) {
            nodeEl.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;
          }
        }
      });

      // Update connections
      this.wallboard.updateConnections();

      // Continue animation
      if (progress < 1) {
        requestAnimationFrame(animate_frame);
      } else {
        // Save final state and log final positions
        console.log('[GraphLayout] Animation complete. Final positions:');
        positions.forEach((targetPos, nodeId) => {
          console.log(`  Node ${nodeId}: (${targetPos.x}, ${targetPos.y})`);
        });
        this.wallboard.autoSave();

        // Call completion callback
        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(animate_frame);
  }

  /**
   * Main method: Auto-arrange all nodes
   * @param {boolean} animate - Whether to animate the layout transition
   * @param {boolean} panToCenter - Whether to pan viewport to center after arranging
   */
  autoArrange(animate = true, panToCenter = true) {
    // Use hierarchical layout for all graphs - cleaner and more compact
    const positions = this.calculateHierarchicalLayout();

    // Apply the layout first
    this.applyLayout(positions, animate, () => {
      // Pan viewport to show the centered layout AFTER animation completes (only if requested)
      if (panToCenter && positions.size > 0) {
        this.panToCenter();
      }
    });
  }

  /**
   * Auto-arrange all nodes with the same hierarchical layout as the Arrange button,
   * but shifted so the excluded node stays at its current position
   * @param {Array<number>} excludeNodeIds - Array of node IDs to keep in place
   * @param {boolean} animate - Whether to animate the layout transition
   * @param {boolean} panToCenter - Whether to pan viewport to center excluded node after arranging
   */
  autoArrangeExcluding(excludeNodeIds = [], animate = true, panToCenter = false) {
    if (!excludeNodeIds || excludeNodeIds.length === 0) {
      // No exclusions, just do normal auto-arrange
      return this.autoArrange(animate, panToCenter);
    }

    console.log('[GraphLayout] Auto-arranging with excluded nodes:', excludeNodeIds);

    const excludedNodeId = excludeNodeIds[0]; // Primary excluded node
    const excludedNode = this.wallboard.getNodeById(excludedNodeId);

    if (!excludedNode) {
      console.warn('[GraphLayout] Excluded node not found, falling back to normal arrange');
      return this.autoArrange(animate, panToCenter);
    }

    // Calculate the full hierarchical layout (same as Arrange button)
    // Pass excluded node IDs so we can use normal size estimates instead of edit-mode sizes
    const calculatedPositions = this.calculateHierarchicalLayout(excludeNodeIds);

    // Get where the excluded node would be in the calculated layout
    const calculatedPos = calculatedPositions.get(excludedNodeId);

    if (!calculatedPos) {
      console.warn('[GraphLayout] Could not find excluded node in calculated layout');
      return this.autoArrange(animate, panToCenter);
    }

    // Calculate offset needed to keep excluded node at its current position
    const currentPos = { x: excludedNode.position.x, y: excludedNode.position.y };
    const offsetX = currentPos.x - calculatedPos.x;
    const offsetY = currentPos.y - calculatedPos.y;

    console.log('[GraphLayout] Shifting entire layout by offset:', { offsetX, offsetY });

    // Apply offset to ALL nodes to shift the entire layout
    const finalPositions = new Map();
    calculatedPositions.forEach((pos, nodeId) => {
      finalPositions.set(nodeId, {
        x: pos.x + offsetX,
        y: pos.y + offsetY
      });
    });

    // Apply the layout
    this.applyLayout(finalPositions, animate, () => {
      if (panToCenter && finalPositions.size > 0) {
        // Center on the excluded node (which should now be at its original position)
        this.panToCenterOnNode(excludedNodeId);
      }
    });
  }

  /**
   * Pan viewport to center on a specific node
   * @param {number} nodeId - The node ID to center on
   */
  panToCenterOnNode(nodeId) {
    const node = this.wallboard.getNodeById(nodeId);
    if (!node) return;

    const nodeEl = document.getElementById(`node-${node.id}`);
    if (!nodeEl) return;

    // Calculate node center
    const nodeCenterX = node.position.x + nodeEl.offsetWidth / 2;
    const nodeCenterY = node.position.y + nodeEl.offsetHeight / 2;

    // Calculate viewport center
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    // Pan to center the node
    this.wallboard.panX = viewportCenterX - (nodeCenterX * this.wallboard.zoom);
    this.wallboard.panY = viewportCenterY - (nodeCenterY * this.wallboard.zoom);

    // Apply the transform
    this.wallboard.updateTransform();

    console.log('[GraphLayout] Panned to center on node:', nodeId, {
      nodeCenter: { x: nodeCenterX, y: nodeCenterY },
      viewportCenter: { x: viewportCenterX, y: viewportCenterY },
      zoom: this.wallboard.zoom,
      pan: { x: this.wallboard.panX, y: this.wallboard.panY }
    });
  }

  /**
   * Detect if the graph contains cycles (e.g., bidirectional connections)
   * @returns {boolean} - True if cycles exist
   */
  detectCycles() {
    const graph = this.buildGraphStructure();
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycleDFS = (nodeId) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const children = graph.outgoing.get(nodeId) || [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          if (hasCycleDFS(childId)) return true;
        } else if (recursionStack.has(childId)) {
          return true; // Cycle detected
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of this.wallboard.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycleDFS(node.id)) {
          console.log('[GraphLayout] Cycles detected - using force-directed layout');
          return true;
        }
      }
    }

    console.log('[GraphLayout] No cycles detected - using radial layout');
    return false;
  }

  /**
   * Calculate radial tree layout - expands from center like a fungus colony
   */
  calculateRadialLayout() {
    const positions = new Map();
    const nodeSizes = new Map();
    const nodes = this.wallboard.nodes;

    if (nodes.length === 0) return positions;

    // Get actual node sizes (use helper to handle zoomed-out state)
    nodes.forEach(node => {
      nodeSizes.set(node.id, this.measureNodeDimensions(node.id));
    });

    // Build graph structure
    const graph = this.buildGraphStructure();
    const roots = this.findRootNodes(graph);

    // If no connections, arrange in a grid
    if (this.wallboard.connectionManager.connections.length === 0) {
      return this.calculateGridLayout(nodeSizes);
    }

    // Position nodes radially from center
    this.positionNodesRadially(positions, roots, graph, nodeSizes);

    // Center the layout
    this.centerLayout(positions, nodeSizes);

    return positions;
  }

  /**
   * Position nodes in a radial pattern expanding from center
   */
  positionNodesRadially(positions, roots, graph, nodeSizes) {
    // Calculate max node dimensions for proper spacing
    let maxWidth = 0;
    let maxHeight = 0;
    nodeSizes.forEach(size => {
      maxWidth = Math.max(maxWidth, size.width);
      maxHeight = Math.max(maxHeight, size.height);
    });

    // Calculate radius increment based on actual node sizes
    // Use the diagonal of the largest node + small padding for compact spacing
    // Ensure minimum spacing accounts for max possible node size (551x402)
    const maxDiagonal = Math.sqrt(maxWidth * maxWidth + maxHeight * maxHeight);
    const minRadiusForMaxNode = Math.sqrt(551 * 551 + 402 * 402) * 0.5;
    const radiusIncrement = Math.max(maxDiagonal * 0.7 + 30, minRadiusForMaxNode); // Distance between each level/ring - more compact
    const positioned = new Set();

    console.log('[GraphLayout] Radial layout spacing:', {
      maxWidth,
      maxHeight,
      maxDiagonal: Math.round(maxDiagonal),
      radiusIncrement: Math.round(radiusIncrement)
    });

    // Position root nodes at center
    if (roots.length === 1) {
      // Single root at origin (centered)
      const size = nodeSizes.get(roots[0]);
      positions.set(roots[0], {
        x: -size.width / 2,
        y: -size.height / 2
      });
      positioned.add(roots[0]);
    } else {
      // Multiple roots in a small circle at center
      // Scale root radius based on number of roots and max node size - very compact
      const rootRadius = Math.max(maxDiagonal * 0.25, 120);
      roots.forEach((rootId, index) => {
        const angle = (index / roots.length) * 2 * Math.PI;
        const size = nodeSizes.get(rootId);
        positions.set(rootId, {
          x: Math.cos(angle) * rootRadius - size.width / 2,
          y: Math.sin(angle) * rootRadius - size.height / 2
        });
        positioned.add(rootId);
      });
    }

    // BFS to position children around parents
    const queue = roots.map(rootId => ({ nodeId: rootId, level: 0 }));

    while (queue.length > 0) {
      const { nodeId, level } = queue.shift();
      const children = graph.outgoing.get(nodeId) || [];

      // Filter out already positioned children (to handle cycles/cross-edges)
      const unpositionedChildren = children.filter(childId => !positioned.has(childId));

      if (unpositionedChildren.length === 0) continue;

      const parentPos = positions.get(nodeId);
      const parentSize = nodeSizes.get(nodeId);

      // Calculate parent's center point
      const parentCenterX = parentPos.x + parentSize.width / 2;
      const parentCenterY = parentPos.y + parentSize.height / 2;

      // Calculate angular space for children
      // Distribute children evenly around parent
      unpositionedChildren.forEach((childId, index) => {
        // Calculate base angle for this child
        let baseAngle = (index / unpositionedChildren.length) * 2 * Math.PI;

        // Add parent's angle to create outward expansion pattern
        const parentAngle = Math.atan2(parentCenterY, parentCenterX);

        // For single child, place in direction away from parent's origin angle
        if (unpositionedChildren.length === 1) {
          baseAngle = parentAngle;
        } else {
          // For multiple children, fan them out around parent's outward direction
          // Use wider spread for more children to prevent overlap
          const spreadAngle = Math.min(Math.PI * 1.5, Math.PI * 0.6 * unpositionedChildren.length); // Dynamic spread based on child count
          baseAngle = parentAngle - spreadAngle/2 + (index / (unpositionedChildren.length - 1)) * spreadAngle;
        }

        // Calculate child center position at calculated angle and radius from parent center
        const childCenterX = parentCenterX + Math.cos(baseAngle) * radiusIncrement;
        const childCenterY = parentCenterY + Math.sin(baseAngle) * radiusIncrement;

        // Convert to top-left position for rendering
        const childSize = nodeSizes.get(childId);
        positions.set(childId, {
          x: childCenterX - childSize.width / 2,
          y: childCenterY - childSize.height / 2
        });
        positioned.add(childId);

        queue.push({ nodeId: childId, level: level + 1 });
      });
    }

    // Handle any unpositioned nodes (isolated or in cycles)
    this.wallboard.nodes.forEach(node => {
      if (!positioned.has(node.id)) {
        // Place at a random position in outer ring
        const angle = Math.random() * 2 * Math.PI;
        const radius = radiusIncrement * 3;
        const size = nodeSizes.get(node.id);
        positions.set(node.id, {
          x: Math.cos(angle) * radius - size.width / 2,
          y: Math.sin(angle) * radius - size.height / 2
        });
      }
    });

    // Apply collision detection and adjustment
    this.adjustForCollisions(positions, nodeSizes);
  }

  /**
   * Adjust positions to prevent node overlaps
   */
  adjustForCollisions(positions, nodeSizes) {
    const iterations = 200; // More iterations for better convergence
    const gap = 150; // Consistent gap between node edges

    for (let iter = 0; iter < iterations; iter++) {
      let adjusted = false;

      const posArray = Array.from(positions.entries());

      for (let i = 0; i < posArray.length; i++) {
        for (let j = i + 1; j < posArray.length; j++) {
          const [id1, pos1] = posArray[i];
          const [id2, pos2] = posArray[j];

          const size1 = nodeSizes.get(id1);
          const size2 = nodeSizes.get(id2);

          // Calculate center points
          const center1X = pos1.x + size1.width / 2;
          const center1Y = pos1.y + size1.height / 2;
          const center2X = pos2.x + size2.width / 2;
          const center2Y = pos2.y + size2.height / 2;

          const dx = center2X - center1X;
          const dy = center2Y - center1Y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Calculate minimum distance using diagonal half-distances
          // This properly accounts for rectangular node dimensions
          const halfDiag1 = Math.sqrt(size1.width * size1.width + size1.height * size1.height) / 2;
          const halfDiag2 = Math.sqrt(size2.width * size2.width + size2.height * size2.height) / 2;
          const minDistance = halfDiag1 + halfDiag2 + gap;

          if (distance < minDistance && distance > 0) {
            // Push nodes apart along the line between their centers
            const pushDistance = (minDistance - distance) / 2;
            const angle = Math.atan2(dy, dx);

            pos1.x -= Math.cos(angle) * pushDistance;
            pos1.y -= Math.sin(angle) * pushDistance;
            pos2.x += Math.cos(angle) * pushDistance;
            pos2.y += Math.sin(angle) * pushDistance;

            adjusted = true;
          }
        }
      }

      if (!adjusted) break;
    }

    console.log('[GraphLayout] Collision detection completed');
  }

  /**
   * Calculate clean hierarchical layout - compact and visually pleasing
   * @param {Array<number>} excludeFromSizing - Node IDs to use estimated normal size (ignore edit-mode size)
   */
  calculateHierarchicalLayout(excludeFromSizing = []) {
    const positions = new Map();
    const nodeSizes = new Map();
    const nodes = this.wallboard.nodes;

    if (nodes.length === 0) return positions;

    // Get actual node sizes (but use estimates for excluded nodes to avoid edit-mode size issues)
    nodes.forEach(node => {
      // For excluded nodes, use estimated normal size instead of potentially inflated edit-mode size
      if (excludeFromSizing.includes(node.id)) {
        nodeSizes.set(node.id, { width: 300, height: 200 }); // Average normal node size
      } else {
        // Use helper to measure real dimensions (handles zoomed-out state)
        nodeSizes.set(node.id, this.measureNodeDimensions(node.id));
      }
    });

    // If no connections, arrange in a compact grid
    if (this.wallboard.connectionManager.connections.length === 0) {
      const gridPositions = this.calculateCompactGrid(nodeSizes);
      // Center the layout before returning
      this.centerLayout(gridPositions, nodeSizes);
      return gridPositions;
    }

    // Build graph structure - ignore backward edges to prevent cycles
    const graph = this.buildGraphStructure(true);

    // Find nodes with fewest connections to use as roots
    const roots = this.findOptimalRoots(graph);

    // Assign nodes to levels using BFS
    const levels = this.assignNodeLevels(roots, graph);

    // Reduce crossings by reordering nodes within levels
    this.reduceCrossingsInLevels(levels, graph);

    // Calculate positions for each level with tighter spacing
    this.positionLevelsCompact(positions, levels, nodeSizes);

    // Center the layout
    this.centerLayout(positions, nodeSizes);

    return positions;
  }

  /**
   * Find optimal root nodes - prefer nodes with fewer connections or actual roots
   */
  findOptimalRoots(graph) {
    const roots = this.findRootNodes(graph);

    // If we have actual roots (no incoming connections), use them
    if (roots.length > 0) {
      return roots;
    }

    // No roots means cycles - find nodes with fewest total connections
    const connectionCounts = new Map();
    this.wallboard.nodes.forEach(node => {
      const incoming = (graph.incoming.get(node.id) || []).length;
      const outgoing = (graph.outgoing.get(node.id) || []).length;
      connectionCounts.set(node.id, incoming + outgoing);
    });

    // Sort by connection count and take the node(s) with fewest connections
    const sorted = Array.from(connectionCounts.entries()).sort((a, b) => a[1] - b[1]);
    const minConnections = sorted[0][1];

    // Return all nodes with the minimum connection count
    return sorted.filter(([_, count]) => count === minConnections).map(([id, _]) => id);
  }

  /**
   * Calculate compact grid layout
   */
  calculateCompactGrid(nodeSizes) {
    const positions = new Map();
    const nodes = this.wallboard.nodes;

    // Special case: single node - center it at origin (will be centered by centerLayout)
    if (nodes.length === 1) {
      const node = nodes[0];
      const size = nodeSizes.get(node.id) || { width: 250, height: 180 };
      // Position at origin (0,0), centerLayout will move it to canvas center
      positions.set(node.id, { x: -size.width / 2, y: -size.height / 2 });
      return positions;
    }

    const horizontalGap = 120; // Tighter spacing
    const verticalGap = 120;

    const cols = Math.ceil(Math.sqrt(nodes.length));

    const rowHeights = new Map();
    const colWidths = new Map();

    // First pass: determine column widths and row heights
    nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const size = nodeSizes.get(node.id) || { width: 250, height: 180 };

      colWidths.set(col, Math.max(colWidths.get(col) || 0, size.width));
      rowHeights.set(row, Math.max(rowHeights.get(row) || 0, size.height));
    });

    // Second pass: position nodes
    nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      let x = 0;
      for (let c = 0; c < col; c++) {
        x += (colWidths.get(c) || 0) + horizontalGap;
      }

      let y = 0;
      for (let r = 0; r < row; r++) {
        y += (rowHeights.get(r) || 0) + verticalGap;
      }

      positions.set(node.id, { x, y });
    });

    return positions;
  }

  /**
   * Reduce edge crossings by reordering nodes within levels
   */
  reduceCrossingsInLevels(levels, graph) {
    const maxIterations = 10;

    for (let iter = 0; iter < maxIterations; iter++) {
      let changed = false;

      // Forward pass: order based on parents
      for (let i = 1; i < levels.length; i++) {
        const newOrder = this.orderLevelByParents(levels[i], levels[i - 1], graph);
        if (!this.arrayEquals(levels[i], newOrder)) {
          levels[i] = newOrder;
          changed = true;
        }
      }

      // Backward pass: order based on children
      for (let i = levels.length - 2; i >= 0; i--) {
        const newOrder = this.orderLevelByChildren(levels[i], levels[i + 1], graph);
        if (!this.arrayEquals(levels[i], newOrder)) {
          levels[i] = newOrder;
          changed = true;
        }
      }

      if (!changed) break;
    }
  }

  /**
   * Order nodes in a level based on parent positions
   */
  orderLevelByParents(level, parentLevel, graph) {
    return level.slice().sort((a, b) => {
      const parentsA = graph.incoming.get(a) || [];
      const parentsB = graph.incoming.get(b) || [];

      // Calculate average parent position
      const avgA = parentsA.length > 0
        ? parentsA.reduce((sum, p) => sum + parentLevel.indexOf(p), 0) / parentsA.length
        : parentLevel.length;

      const avgB = parentsB.length > 0
        ? parentsB.reduce((sum, p) => sum + parentLevel.indexOf(p), 0) / parentsB.length
        : parentLevel.length;

      return avgA - avgB;
    });
  }

  /**
   * Order nodes in a level based on children positions
   */
  orderLevelByChildren(level, childLevel, graph) {
    return level.slice().sort((a, b) => {
      const childrenA = graph.outgoing.get(a) || [];
      const childrenB = graph.outgoing.get(b) || [];

      // Calculate average child position
      const avgA = childrenA.length > 0
        ? childrenA.reduce((sum, c) => sum + childLevel.indexOf(c), 0) / childrenA.length
        : childLevel.length;

      const avgB = childrenB.length > 0
        ? childrenB.reduce((sum, c) => sum + childLevel.indexOf(c), 0) / childrenB.length
        : childLevel.length;

      return avgA - avgB;
    });
  }

  /**
   * Check if two arrays are equal
   */
  arrayEquals(a, b) {
    return a.length === b.length && a.every((val, idx) => val === b[idx]);
  }

  /**
   * Assign nodes to hierarchical levels
   */
  assignNodeLevels(roots, graph) {
    const nodeLevel = new Map();
    const visited = new Set();
    const queue = [];

    // BFS from roots
    roots.forEach(rootId => {
      queue.push({ nodeId: rootId, level: 0 });
      visited.add(rootId);
    });

    while (queue.length > 0) {
      const { nodeId, level } = queue.shift();
      nodeLevel.set(nodeId, level);

      const children = graph.outgoing.get(nodeId) || [];
      children.forEach(childId => {
        if (!visited.has(childId)) {
          visited.add(childId);
          queue.push({ nodeId: childId, level: level + 1 });
        }
      });
    }

    // Handle disconnected nodes
    this.wallboard.nodes.forEach(node => {
      if (!nodeLevel.has(node.id)) {
        nodeLevel.set(node.id, 0);
      }
    });

    // Organize into level arrays
    const levels = [];
    nodeLevel.forEach((level, nodeId) => {
      if (!levels[level]) levels[level] = [];
      levels[level].push(nodeId);
    });

    return levels;
  }

  /**
   * Position nodes in hierarchical levels with compact spacing - left-to-right tree structure
   * Creates a funnel/branching pattern where nodes branch out from their parents
   */
  positionLevelsCompact(positions, levels, nodeSizes) {
    const horizontalGap = 250; // Horizontal gap between levels
    const verticalGap = 100; // Vertical gap between siblings

    const graph = this.buildGraphStructure();

    let currentX = 0;

    // Position each level
    levels.forEach((nodeIds, levelIndex) => {
      if (levelIndex === 0) {
        // Position root nodes in a vertical column
        let currentY = 0;

        nodeIds.forEach((nodeId, idx) => {
          const size = nodeSizes.get(nodeId) || { width: 250, height: 180 };
          positions.set(nodeId, { x: currentX, y: currentY });
          currentY += size.height + verticalGap;
        });
      } else {
        // Position children nodes near their parents to create tree branches
        // Group nodes by their parent(s)
        const nodesByParent = new Map();

        nodeIds.forEach(nodeId => {
          const parents = graph.incoming.get(nodeId) || [];

          if (parents.length > 0) {
            // Use first parent for positioning (handles cases with multiple parents)
            const primaryParent = parents[0];

            if (!nodesByParent.has(primaryParent)) {
              nodesByParent.set(primaryParent, []);
            }
            nodesByParent.get(primaryParent).push(nodeId);
          } else {
            // Orphan node (shouldn't happen but handle it)
            if (!nodesByParent.has('orphans')) {
              nodesByParent.set('orphans', []);
            }
            nodesByParent.get('orphans').push(nodeId);
          }
        });

        // Position children relative to their parents
        nodesByParent.forEach((childIds, parentId) => {
          if (parentId === 'orphans') {
            // Position orphans at the bottom
            let currentY = 1000; // Large offset for orphans
            childIds.forEach(nodeId => {
              const size = nodeSizes.get(nodeId) || { width: 250, height: 180 };
              positions.set(nodeId, { x: currentX, y: currentY });
              currentY += size.height + verticalGap;
            });
            return;
          }

          const parentPos = positions.get(parentId);
          if (!parentPos) return;

          const parentSize = nodeSizes.get(parentId) || { width: 250, height: 180 };
          const parentCenterY = parentPos.y + parentSize.height / 2;

          // Calculate total height needed for all children
          const childrenTotalHeight = childIds.reduce((sum, id, idx) => {
            const size = nodeSizes.get(id) || { width: 250, height: 180 };
            return sum + size.height + (idx < childIds.length - 1 ? verticalGap : 0);
          }, 0);

          // Start Y position: center children around parent's Y position
          let currentY = parentCenterY - childrenTotalHeight / 2;

          childIds.forEach(nodeId => {
            const size = nodeSizes.get(nodeId) || { width: 250, height: 180 };
            positions.set(nodeId, { x: currentX, y: currentY });
            currentY += size.height + verticalGap;
          });
        });

        // Resolve any vertical overlaps between different parent groups
        this.resolveVerticalOverlapsInLevel(nodeIds, positions, nodeSizes, verticalGap);
      }

      const maxWidth = Math.max(...nodeIds.map(id => nodeSizes.get(id)?.width || 250));
      currentX += maxWidth + horizontalGap;
    });
  }

  /**
   * Resolve vertical overlaps within a level by shifting nodes apart
   */
  resolveVerticalOverlapsInLevel(nodeIds, positions, nodeSizes, gap) {
    // Sort nodes by Y position, filtering out any without positions
    const sorted = nodeIds
      .map(id => ({
        id,
        pos: positions.get(id),
        size: nodeSizes.get(id) || { width: 250, height: 180 }
      }))
      .filter(item => item.pos !== undefined) // Skip nodes without positions
      .sort((a, b) => a.pos.y - b.pos.y);

    // Iteratively push apart overlapping nodes
    let maxIterations = 10;
    for (let iter = 0; iter < maxIterations; iter++) {
      let hadOverlap = false;

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];

        const minY = prev.pos.y + prev.size.height + gap;

        if (curr.pos.y < minY) {
          curr.pos.y = minY;
          hadOverlap = true;
        }
      }

      if (!hadOverlap) break;
    }
  }

  /**
   * Position nodes in hierarchical levels (left-to-right)
   * Uses consistent gaps between nodes and levels
   */
  positionLevels(positions, levels, nodeSizes) {
    const horizontalGap = 200; // Fixed gap between levels (left-to-right)
    const verticalGap = 200; // Fixed gap between nodes in same level

    const graph = this.buildGraphStructure();

    // Position root level first
    let currentX = 0;

    // Position each level, considering parent positions
    levels.forEach((nodeIds, levelIndex) => {
      if (levelIndex === 0) {
        // Position roots vertically centered with consistent gaps
        const totalHeight = nodeIds.reduce((sum, id, idx) => {
          const size = nodeSizes.get(id) || { width: 250, height: 180 };
          return sum + size.height + (idx < nodeIds.length - 1 ? verticalGap : 0);
        }, 0);

        let currentY = -totalHeight / 2;

        nodeIds.forEach(nodeId => {
          const size = nodeSizes.get(nodeId) || { width: 250, height: 180 };
          positions.set(nodeId, { x: currentX, y: currentY });
          currentY += size.height + verticalGap;
        });

        const maxWidth = Math.max(...nodeIds.map(id => nodeSizes.get(id)?.width || 250));
        currentX += maxWidth + horizontalGap;
      } else {
        // Position children near their parents
        const positioned = new Set();

        nodeIds.forEach(nodeId => {
          if (positioned.has(nodeId)) return;

          const parents = graph.incoming.get(nodeId) || [];
          let parentY = 0;

          // Calculate average parent Y position
          if (parents.length > 0) {
            const parentPositions = parents
              .map(pid => positions.get(pid))
              .filter(p => p);

            if (parentPositions.length > 0) {
              parentY = parentPositions.reduce((sum, p) => sum + p.y, 0) / parentPositions.length;
            }
          }

          positions.set(nodeId, { x: currentX, y: parentY });
          positioned.add(nodeId);
        });

        // Resolve vertical overlaps within this level with consistent gaps
        this.resolveVerticalOverlaps(nodeIds, positions, nodeSizes, verticalGap);

        const maxWidth = Math.max(...nodeIds.map(id => nodeSizes.get(id)?.width || 250));
        currentX += maxWidth + horizontalGap;
      }
    });
  }

  /**
   * Resolve vertical overlaps by shifting nodes apart with consistent gaps
   */
  resolveVerticalOverlaps(nodeIds, positions, nodeSizes, gap) {
    // Sort by Y position
    const sorted = nodeIds
      .map(id => ({ id, pos: positions.get(id), size: nodeSizes.get(id) || { width: 250, height: 180 } }))
      .sort((a, b) => a.pos.y - b.pos.y);

    // Adjust positions to ensure consistent gap between nodes
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      const minY = prev.pos.y + prev.size.height + gap;

      if (curr.pos.y < minY) {
        curr.pos.y = minY;
      }
    }
  }

  /**
   * Calculate grid layout for unconnected nodes with consistent gaps
   */
  calculateGridLayout(nodeSizes) {
    const positions = new Map();
    const nodes = this.wallboard.nodes;
    const horizontalGap = 200;
    const verticalGap = 200;

    const cols = Math.ceil(Math.sqrt(nodes.length));

    // Calculate positions for each node with consistent gaps
    const rowHeights = new Map(); // Track the height of each row
    const colWidths = new Map();  // Track the width of each column

    // First pass: determine column widths and row heights
    nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const size = nodeSizes.get(node.id) || { width: 250, height: 180 };

      colWidths.set(col, Math.max(colWidths.get(col) || 0, size.width));
      rowHeights.set(row, Math.max(rowHeights.get(row) || 0, size.height));
    });

    // Second pass: position nodes using cumulative widths/heights + gaps
    nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      // Calculate X position: sum of all previous column widths + gaps
      let x = 0;
      for (let c = 0; c < col; c++) {
        x += (colWidths.get(c) || 0) + horizontalGap;
      }

      // Calculate Y position: sum of all previous row heights + gaps
      let y = 0;
      for (let r = 0; r < row; r++) {
        y += (rowHeights.get(r) || 0) + verticalGap;
      }

      positions.set(node.id, { x, y });
    });

    return positions;
  }

  /**
   * Calculate force-directed layout optimized for rectangular nodes with edge connections
   */
  calculateForceDirectedLayout() {
    const positions = new Map();
    const nodeSizes = new Map();
    const nodes = this.wallboard.nodes;

    if (nodes.length === 0) return positions;

    // Get actual node sizes (use helper to handle zoomed-out state)
    nodes.forEach(node => {
      nodeSizes.set(node.id, this.measureNodeDimensions(node.id));
    });

    // Initialize positions - use current positions if they exist, otherwise circle layout
    nodes.forEach((node, index) => {
      if (node.position && node.position.x !== undefined && node.position.y !== undefined) {
        // Use existing position
        positions.set(node.id, {
          x: node.position.x,
          y: node.position.y,
          vx: 0,
          vy: 0
        });
      } else {
        // Initialize in a circle
        const radius = Math.max(400, nodes.length * 80);
        const angle = (index / nodes.length) * 2 * Math.PI;
        positions.set(node.id, {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          vx: 0,
          vy: 0
        });
      }
    });

    // Force-directed layout simulation - optimized for rectangular nodes
    const iterations = 300; // More iterations for better convergence
    const minGap = 100; // Minimum gap between node edges
    const idealEdgeDistance = 350; // Ideal distance between connection points on edges
    const repulsionStrength = 150000; // Stronger repulsion to prevent overlap
    const attractionStrength = 0.005; // Moderate attraction for connected nodes
    const damping = 0.8; // Velocity damping

    for (let iter = 0; iter < iterations; iter++) {
      // Gradually reduce forces for convergence
      const progress = iter / iterations;
      const cooling = 1 - (progress * 0.5); // Cool down to 50% strength

      // Reset forces
      nodes.forEach(node => {
        const pos = positions.get(node.id);
        pos.fx = 0;
        pos.fy = 0;
      });

      // Repulsion between all nodes (prevent overlap)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const node1 = nodes[i];
          const node2 = nodes[j];
          const pos1 = positions.get(node1.id);
          const pos2 = positions.get(node2.id);

          const size1 = nodeSizes.get(node1.id);
          const size2 = nodeSizes.get(node2.id);

          // Calculate centers
          const center1X = pos1.x + size1.width / 2;
          const center1Y = pos1.y + size1.height / 2;
          const center2X = pos2.x + size2.width / 2;
          const center2Y = pos2.y + size2.height / 2;

          const dx = center2X - center1X;
          const dy = center2Y - center1Y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

          // Calculate minimum safe distance using diagonal + gap
          const diag1 = Math.sqrt(size1.width * size1.width + size1.height * size1.height);
          const diag2 = Math.sqrt(size2.width * size2.width + size2.height * size2.height);
          const minDistance = (diag1 + diag2) / 2 + minGap;

          let force = repulsionStrength / (distance * distance);

          // Much stronger repulsion when overlapping
          if (distance < minDistance) {
            force *= 15; // Very strong push when too close
          }

          const fx = (dx / distance) * force * cooling;
          const fy = (dy / distance) * force * cooling;

          pos1.fx -= fx;
          pos1.fy -= fy;
          pos2.fx += fx;
          pos2.fy += fy;
        }
      }

      // Attraction between connected nodes - account for edge connection points
      this.wallboard.connectionManager.connections.forEach(conn => {
        const node1 = this.wallboard.getNodeById(conn.start.nodeId);
        const node2 = this.wallboard.getNodeById(conn.end.nodeId);

        if (!node1 || !node2) return;

        const pos1 = positions.get(node1.id);
        const pos2 = positions.get(node2.id);
        const size1 = nodeSizes.get(node1.id);
        const size2 = nodeSizes.get(node2.id);

        // Calculate centers
        const center1X = pos1.x + size1.width / 2;
        const center1Y = pos1.y + size1.height / 2;
        const center2X = pos2.x + size2.width / 2;
        const center2Y = pos2.y + size2.height / 2;

        const dx = center2X - center1X;
        const dy = center2Y - center1Y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        // Account for node dimensions when calculating ideal distance
        // Connection points are on edges, so subtract half of each node's dimension
        const avgDimension1 = (size1.width + size1.height) / 2;
        const avgDimension2 = (size2.width + size2.height) / 2;
        const effectiveIdealDistance = idealEdgeDistance + (avgDimension1 + avgDimension2) / 2;

        // Spring force towards ideal distance
        const force = (distance - effectiveIdealDistance) * attractionStrength;

        const fx = (dx / distance) * force * cooling;
        const fy = (dy / distance) * force * cooling;

        pos1.fx += fx;
        pos1.fy += fy;
        pos2.fx -= fx;
        pos2.fy -= fy;
      });

      // Apply forces and update positions
      nodes.forEach(node => {
        const pos = positions.get(node.id);
        pos.vx = (pos.vx + pos.fx) * damping;
        pos.vy = (pos.vy + pos.fy) * damping;

        // Limit max velocity to prevent wild swings
        const maxVelocity = 20;
        const speed = Math.sqrt(pos.vx * pos.vx + pos.vy * pos.vy);
        if (speed > maxVelocity) {
          pos.vx = (pos.vx / speed) * maxVelocity;
          pos.vy = (pos.vy / speed) * maxVelocity;
        }

        pos.x += pos.vx;
        pos.y += pos.vy;
      });
    }

    // Center the layout
    this.centerLayout(positions, nodeSizes);

    // Return simplified positions (remove velocity data)
    const finalPositions = new Map();
    positions.forEach((pos, nodeId) => {
      finalPositions.set(nodeId, { x: pos.x, y: pos.y });
    });

    return finalPositions;
  }

  /**
   * Align nodes that are nearly in the same row or column
   */
  alignNearbyNodes(positions, nodeSizes) {
    const nodes = this.wallboard.nodes;
    const alignThreshold = 80; // If within 80px, align them

    // Group nodes by approximate rows (y-coordinate)
    const rows = [];
    nodes.forEach(node1 => {
      const pos1 = positions.get(node1.id);

      // Find existing row to join
      let foundRow = false;
      for (const row of rows) {
        const avgY = row.reduce((sum, n) => sum + positions.get(n.id).y, 0) / row.length;
        if (Math.abs(pos1.y - avgY) < alignThreshold) {
          row.push(node1);
          foundRow = true;
          break;
        }
      }

      if (!foundRow) {
        rows.push([node1]);
      }
    });

    // Align nodes in each row
    rows.forEach(row => {
      if (row.length > 1) {
        const avgY = row.reduce((sum, n) => sum + positions.get(n.id).y, 0) / row.length;
        row.forEach(node => {
          const pos = positions.get(node.id);
          pos.y = avgY;
        });
      }
    });

    // Group nodes by approximate columns (x-coordinate)
    const columns = [];
    nodes.forEach(node1 => {
      const pos1 = positions.get(node1.id);

      // Find existing column to join
      let foundCol = false;
      for (const col of columns) {
        const avgX = col.reduce((sum, n) => sum + positions.get(n.id).x, 0) / col.length;
        if (Math.abs(pos1.x - avgX) < alignThreshold) {
          col.push(node1);
          foundCol = true;
          break;
        }
      }

      if (!foundCol) {
        columns.push([node1]);
      }
    });

    // Align nodes in each column
    columns.forEach(col => {
      if (col.length > 1) {
        const avgX = col.reduce((sum, n) => sum + positions.get(n.id).x, 0) / col.length;
        col.forEach(node => {
          const pos = positions.get(node.id);
          pos.x = avgX;
        });
      }
    });
  }

  /**
   * Pan the viewport to center on the arranged layout
   */
  panToCenter() {
    // Center the viewport at canvas center (5000, 4000)
    const canvasCenterX = this.wallboard.canvasWidth / 2;
    const canvasCenterY = this.wallboard.canvasHeight / 2;

    // Keep current zoom level (do not reset)
    // this.wallboard.zoom = 1;

    // Calculate pan to center the canvas center in the viewport
    // The formula is: panX = viewportCenter - (canvasCenter * zoom)
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    this.wallboard.panX = viewportCenterX - (canvasCenterX * this.wallboard.zoom);
    this.wallboard.panY = viewportCenterY - (canvasCenterY * this.wallboard.zoom);

    // Apply the transform
    this.wallboard.updateTransform();

    console.log('[GraphLayout] Panned to center:', {
      canvasCenter: { x: canvasCenterX, y: canvasCenterY },
      viewportCenter: { x: viewportCenterX, y: viewportCenterY },
      zoom: this.wallboard.zoom,
      pan: { x: this.wallboard.panX, y: this.wallboard.panY }
    });
  }

  /**
   * Arrange only new linked nodes around a source node without moving other nodes
   * @param {number} sourceNodeId - The source node ID
   * @param {Array<number>} newNodeIds - Array of newly created node IDs to arrange
   */
  arrangeLinkedNodesAround(sourceNodeId, newNodeIds) {
    if (!newNodeIds || newNodeIds.length === 0) {
      console.log('[GraphLayout] No new nodes to arrange');
      return;
    }

    const sourceNode = this.wallboard.getNodeById(sourceNodeId);
    if (!sourceNode) {
      console.log('[GraphLayout] Source node not found:', sourceNodeId);
      return;
    }

    console.log('[GraphLayout] Arranging', newNodeIds.length, 'new nodes around source node', sourceNodeId);

    // Get node sizes (use helper to handle zoomed-out state)
    const nodeSizes = new Map();
    [sourceNodeId, ...newNodeIds].forEach(nodeId => {
      nodeSizes.set(nodeId, this.measureNodeDimensions(nodeId));
    });

    const sourceSize = nodeSizes.get(sourceNodeId);
    const sourceCenterX = sourceNode.position.x + sourceSize.width / 2;
    const sourceCenterY = sourceNode.position.y + sourceSize.height / 2;

    // Start with a base radius from the source node's edge
    const sourceHalfDiag = Math.sqrt(sourceSize.width * sourceSize.width + sourceSize.height * sourceSize.height) / 2;
    const gap = 50; // Gap between nodes
    const baseRadius = sourceHalfDiag + 200 + gap; // Distance from source center

    // Position new nodes in a circle around the source, avoiding collisions
    const positions = new Map();

    // Helper function to check if a position overlaps with any existing nodes or already-placed new nodes
    const hasCollision = (testX, testY, testSize, currentNodeId) => {
      // Check against all existing nodes (except source and the current node being placed)
      const existingNodesCollision = this.wallboard.nodes.some(existingNode => {
        if (existingNode.id === sourceNodeId || existingNode.id === currentNodeId) {
          return false;
        }

        const existingSize = nodeSizes.get(existingNode.id) || { width: 250, height: 180 };

        // Simple rectangle overlap test with gap
        const dx = Math.abs((testX + testSize.width / 2) - (existingNode.position.x + existingSize.width / 2));
        const dy = Math.abs((testY + testSize.height / 2) - (existingNode.position.y + existingSize.height / 2));

        const minDx = (testSize.width + existingSize.width) / 2 + gap;
        const minDy = (testSize.height + existingSize.height) / 2 + gap;

        return dx < minDx && dy < minDy;
      });

      // Also check against already-placed new nodes
      const newNodesCollision = Array.from(positions.entries()).some(([placedNodeId, placedPos]) => {
        if (placedNodeId === currentNodeId) return false;

        const placedSize = nodeSizes.get(placedNodeId);
        const dx = Math.abs((testX + testSize.width / 2) - (placedPos.x + placedSize.width / 2));
        const dy = Math.abs((testY + testSize.height / 2) - (placedPos.y + placedSize.height / 2));

        const minDx = (testSize.width + placedSize.width) / 2 + gap;
        const minDy = (testSize.height + placedSize.height) / 2 + gap;

        return dx < minDx && dy < minDy;
      });

      return existingNodesCollision || newNodesCollision;
    };

    newNodeIds.forEach((nodeId, index) => {
      const nodeSize = nodeSizes.get(nodeId);

      // Try multiple angles and radii to find a good position
      let foundPosition = null;
      const angleStep = (2 * Math.PI) / newNodeIds.length;
      const baseAngle = index * angleStep;

      // Try different radii (increasing outward)
      for (let radiusMultiplier = 1; radiusMultiplier <= 3 && !foundPosition; radiusMultiplier++) {
        const radius = baseRadius * radiusMultiplier;

        // Try angles around the base angle
        const angleOffsets = [0, 0.3, -0.3, 0.6, -0.6, 1, -1];
        for (const offset of angleOffsets) {
          const angle = baseAngle + offset;

          const nodeCenterX = sourceCenterX + Math.cos(angle) * radius;
          const nodeCenterY = sourceCenterY + Math.sin(angle) * radius;

          const testX = nodeCenterX - nodeSize.width / 2;
          const testY = nodeCenterY - nodeSize.height / 2;

          if (!hasCollision(testX, testY, nodeSize, nodeId)) {
            foundPosition = { x: testX, y: testY };
            break;
          }
        }
      }

      // If still no position found, place it farther out at the base angle
      if (!foundPosition) {
        const fallbackRadius = baseRadius * 4;
        const nodeCenterX = sourceCenterX + Math.cos(baseAngle) * fallbackRadius;
        const nodeCenterY = sourceCenterY + Math.sin(baseAngle) * fallbackRadius;
        foundPosition = {
          x: nodeCenterX - nodeSize.width / 2,
          y: nodeCenterY - nodeSize.height / 2
        };
      }

      positions.set(nodeId, foundPosition);
    });

    // Apply positions without animation (instant)
    positions.forEach((pos, nodeId) => {
      const node = this.wallboard.getNodeById(nodeId);
      if (node) {
        node.position.x = pos.x;
        node.position.y = pos.y;

        // Update DOM
        const nodeEl = document.getElementById(`node-${nodeId}`);
        if (nodeEl) {
          nodeEl.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;
        }
      }
    });

    // Update connections
    this.wallboard.updateConnections();

    // Save the new positions
    this.wallboard.autoSave();

    console.log('[GraphLayout] Arranged new nodes around source. Positions:',
      Array.from(positions.entries()).map(([id, pos]) => `Node ${id}: (${Math.round(pos.x)}, ${Math.round(pos.y)})`).join(', ')
    );
  }
}
