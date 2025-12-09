// Wiki-style link manager for detecting [[NodeTitle]] patterns and creating connections
class LinkManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
    this.debounceTimeouts = new Map(); // Debounce per node
  }

  /**
   * Main method: Parse content for [[links]] and sync connections
   * @param {number} nodeId - The node whose content changed
   * @param {string} content - The markdown content
   * @param {boolean} immediate - If true, process immediately without debouncing
   */
  processNodeLinks(nodeId, content, immediate = false) {
    // If immediate processing is requested, cancel any pending timeout and process now
    if (immediate) {
      if (this.debounceTimeouts.has(nodeId)) {
        clearTimeout(this.debounceTimeouts.get(nodeId));
        this.debounceTimeouts.delete(nodeId);
      }
      this.processNodeLinksImmediate(nodeId, content);
      return;
    }

    // Debounce per node to avoid too many updates
    if (this.debounceTimeouts.has(nodeId)) {
      clearTimeout(this.debounceTimeouts.get(nodeId));
    }

    this.debounceTimeouts.set(nodeId, setTimeout(() => {
      this.processNodeLinksImmediate(nodeId, content);
    }, 150)); // 150ms debounce - very responsive
  }

  /**
   * Internal method: Process links immediately without debouncing
   * @param {number} nodeId - The node whose content changed
   * @param {string} content - The markdown content
   */
  async processNodeLinksImmediate(nodeId, content) {
    try {
      // 1. Extract all [[links]] from content
      const linkTitles = this.extractLinks(content);

      if (linkTitles.length === 0) {
        // No links found, just prune any existing connections
        this.pruneOrphanedConnections(nodeId, []);
        return;
      }

      // Track newly created nodes for automatic arrangement
      const newlyCreatedNodeIds = [];

      // 2. For each link, find or create target node and ensure connection
      linkTitles.forEach(linkTitle => {
        const result = this.findOrCreateNodeByTitle(linkTitle, nodeId);
        if (result) {
          // Create connection immediately
          this.ensureConnection(nodeId, result.node.id);

          // Track if this was a newly created node
          if (result.wasCreated) {
            newlyCreatedNodeIds.push(result.node.id);
          }
        }
      });

      // 3. Remove connections that no longer have corresponding links
      this.pruneOrphanedConnections(nodeId, linkTitles);

      // 4. Force immediate connection redraw
      if (this.wallboard.connectionManager) {
        this.wallboard.connectionManager.updateConnections();
      }

    } catch (error) {
      console.error('[LinkManager] Error processing links:', error);
    } finally {
      this.debounceTimeouts.delete(nodeId);
    }
  }

  /**
   * Extract all [[NodeTitle]] patterns from markdown content
   * @param {string} content - Markdown content
   * @returns {string[]} - Array of unique link titles
   */
  extractLinks(content) {
    const regex = /\[\[([^\]]+)\]\]/g;
    const links = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      const title = match[1].trim();
      if (title) {
        links.push(title);
      }
    }

    // Return unique titles (case-insensitive deduplication)
    const uniqueLinks = [];
    const seenLower = new Set();

    for (const link of links) {
      const lowerLink = link.toLowerCase();
      if (!seenLower.has(lowerLink)) {
        seenLower.add(lowerLink);
        uniqueLinks.push(link);
      }
    }

    return uniqueLinks;
  }

  /**
   * Find node by title (case-insensitive) or create a new empty node
   * @param {string} title - The node title to find or create
   * @param {number} sourceNodeId - The source node ID (for placement)
   * @returns {object|null} - Object with {node, wasCreated} or null
   */
  findOrCreateNodeByTitle(title, sourceNodeId = null) {
    // Search existing nodes by title (case-insensitive)
    let node = this.wallboard.nodes.find(n => {
      const nodeTitle = this.wallboard.getNodeTitle(n);
      return nodeTitle.toLowerCase() === title.toLowerCase();
    });

    if (node) {
      return { node, wasCreated: false };
    }

    // Generate unique title (createNode will also do this, but we need it for the content)
    const uniqueTitle = NodeUtils.generateUniqueTitle(title, this.wallboard.nodes);

    // Create new empty node with the unique title
    const placeholderContent = `# ${uniqueTitle}\n\n_Empty node created from link_`;

    node = this.wallboard.nodeOperationsManager.createNode(uniqueTitle, {
      content: placeholderContent,
      html: typeof MarkdownRenderer !== 'undefined'
        ? MarkdownRenderer.render(placeholderContent)
        : marked.parse(placeholderContent)
    });

    // Position the new node using hierarchical graph logic
    if (sourceNodeId) {
      const sourceNode = this.wallboard.getNodeById(sourceNodeId);
      if (sourceNode) {
        node.position = this.calculateSmartPosition(sourceNode, node.id);
      }
    }

    // Ensure the new node does NOT have a custom theme - it should inherit the global theme
    delete this.wallboard.nodeThemes[node.id];

    this.wallboard.renderNode(node);

    return { node, wasCreated: true };
  }

  /**
   * Calculate smart position for a new linked node using hierarchical layout logic
   * Places node to the right of source, vertically aligned with siblings
   * @param {object} sourceNode - The source node
   * @param {number} newNodeId - The new node ID
   * @returns {object} - {x, y} position
   */
  calculateSmartPosition(sourceNode, newNodeId) {
    const horizontalGap = 250;
    const verticalGap = 100;

    // Get source node dimensions
    const sourceNodeEl = document.getElementById(`node-${sourceNode.id}`);
    const sourceWidth = sourceNodeEl ? sourceNodeEl.offsetWidth : 300;
    const sourceHeight = sourceNodeEl ? sourceNodeEl.offsetHeight : 200;

    // Estimate new node dimensions (will adjust after render)
    const newNodeWidth = 300;
    const newNodeHeight = 150;

    // Find all children of the source node (siblings of the new node)
    const graph = this.buildSimpleGraph();
    const siblings = graph.outgoing.get(sourceNode.id) || [];

    // Calculate X position: to the right of source node
    const newX = sourceNode.position.x + sourceWidth + horizontalGap;

    // Calculate Y position: stack below existing siblings
    let newY = sourceNode.position.y; // Start aligned with parent

    if (siblings.length > 0) {
      // Find the lowest sibling to stack below it
      let maxY = sourceNode.position.y;

      siblings.forEach(siblingId => {
        const sibling = this.wallboard.getNodeById(siblingId);
        if (sibling && sibling.id !== newNodeId) {
          const siblingEl = document.getElementById(`node-${siblingId}`);
          const siblingHeight = siblingEl ? siblingEl.offsetHeight : 200;
          const siblingBottom = sibling.position.y + siblingHeight;

          if (siblingBottom > maxY) {
            maxY = siblingBottom;
          }
        }
      });

      // Position below the lowest sibling
      newY = maxY + verticalGap;
    }

    // Check for collisions with other nodes and adjust if needed
    const finalPosition = this.adjustForCollisions(
      newX,
      newY,
      newNodeWidth,
      newNodeHeight,
      newNodeId,
      sourceNode.id
    );

    return finalPosition;
  }

  /**
   * Build a simple graph structure for positioning
   */
  buildSimpleGraph() {
    const graph = {
      outgoing: new Map(),
      incoming: new Map()
    };

    // Initialize for all nodes
    this.wallboard.nodes.forEach(node => {
      graph.outgoing.set(node.id, []);
      graph.incoming.set(node.id, []);
    });

    // Build from connections
    this.wallboard.connectionManager.connections.forEach(conn => {
      const sourceId = conn.start.nodeId;
      const targetId = conn.end.nodeId;

      if (graph.outgoing.has(sourceId)) {
        graph.outgoing.get(sourceId).push(targetId);
      }
      if (graph.incoming.has(targetId)) {
        graph.incoming.get(targetId).push(sourceId);
      }
    });

    return graph;
  }

  /**
   * Adjust position to avoid collisions with existing nodes
   */
  adjustForCollisions(x, y, width, height, newNodeId, sourceNodeId) {
    const gap = 80;
    let currentY = y;
    let maxIterations = 50;
    let iteration = 0;

    while (iteration < maxIterations) {
      let hasCollision = false;

      // Check against all existing nodes
      for (const existingNode of this.wallboard.nodes) {
        if (existingNode.id === newNodeId || existingNode.id === sourceNodeId) {
          continue;
        }

        const existingEl = document.getElementById(`node-${existingNode.id}`);
        const existingWidth = existingEl ? existingEl.offsetWidth : 300;
        const existingHeight = existingEl ? existingEl.offsetHeight : 200;

        // Calculate centers
        const newCenterX = x + width / 2;
        const newCenterY = currentY + height / 2;
        const existingCenterX = existingNode.position.x + existingWidth / 2;
        const existingCenterY = existingNode.position.y + existingHeight / 2;

        const dx = Math.abs(newCenterX - existingCenterX);
        const dy = Math.abs(newCenterY - existingCenterY);

        const minDx = (width + existingWidth) / 2 + gap;
        const minDy = (height + existingHeight) / 2 + gap;

        if (dx < minDx && dy < minDy) {
          // Collision detected - move down
          currentY = existingNode.position.y + existingHeight + gap;
          hasCollision = true;
          break;
        }
      }

      if (!hasCollision) {
        break;
      }

      iteration++;
    }

    return { x, y: currentY };
  }

  /**
   * Ensure a connection exists from source to target
   * @param {number} sourceNodeId - Source node ID
   * @param {number} targetNodeId - Target node ID
   */
  ensureConnection(sourceNodeId, targetNodeId) {
    // Don't create self-links
    if (sourceNodeId === targetNodeId) {
      return;
    }

    // Check if connection already exists
    const connectionId = `${sourceNodeId}-${targetNodeId}`;
    const exists = this.wallboard.connectionManager.connections.some(conn =>
      conn.id === connectionId
    );

    if (exists) {
      return;
    }

    // Create the connection
    this.wallboard.connectionManager.createConnection(
      { nodeId: sourceNodeId },
      { nodeId: targetNodeId }
    );
  }

  /**
   * Remove connections from source node that no longer have corresponding [[links]]
   * @param {number} sourceNodeId - Source node ID
   * @param {string[]} linkTitles - Array of link titles that should exist
   */
  pruneOrphanedConnections(sourceNodeId, linkTitles) {
    // Previously removed connections when links vanished.
    // We now leave connections intact to avoid surprising disconnections during edits.
    return;
  }

  /**
   * Add a link to the ## Links section (used for drag-connect)
   * @param {number} nodeId - The node to add the link to
   * @param {string} targetTitle - The title of the target node
   */
  addLinkToSection(nodeId, targetTitle) {
    const node = this.wallboard.getNodeById(nodeId);
    if (!node) return;

    const linkText = `[[${targetTitle}]]`;

    // Check if link already exists anywhere in content
    if (node.data.content.includes(linkText)) {
      console.log(`Link ${linkText} already exists in node ${nodeId}`);
      return; // Already linked
    }

    let content = node.data.content;

    // Just append the link at the end on a new line
    content = content.trim() + '\n' + linkText;

    // Update node content
    node.data.content = content;
    node.data.html = typeof MarkdownRenderer !== 'undefined'
      ? MarkdownRenderer.render(content)
      : marked.parse(content);

    // Update display
    this.updateNodeDisplay(nodeId);

    console.log(`Added link ${linkText} to node ${nodeId}`);
  }

  /**
   * Update node display after content change
   * @param {number} nodeId - The node to update
   */
  updateNodeDisplay(nodeId) {
    const node = this.wallboard.getNodeById(nodeId);
    if (!node) return;

    const nodeContent = document.getElementById(`content-${nodeId}`);

    // Only update if not currently editing
    if (nodeContent && !nodeContent.querySelector('.text-editor')) {
      nodeContent.innerHTML = Sanitization.sanitize(this.wallboard.renderNodeContent(node));

      // Re-enable checkboxes and syntax highlighting
      setTimeout(() => {
        this.wallboard.enableCheckboxes(nodeContent, node);

        const codeBlocks = nodeContent.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
          Prism.highlightElement(block);
        });
      }, 0);
    }

    this.wallboard.autoSave();
  }

  /**
   * Remove a [[link]] from a node's content when connection is deleted
   * @param {number} sourceNodeId - The source node ID
   * @param {number} targetNodeId - The target node ID
   */
  removeLinkFromContent(sourceNodeId, targetNodeId) {
    console.log(`[LinkManager] removeLinkFromContent called: ${sourceNodeId} -> ${targetNodeId}`);

    const sourceNode = this.wallboard.getNodeById(sourceNodeId);
    const targetNode = this.wallboard.getNodeById(targetNodeId);

    if (!sourceNode || !targetNode) {
      console.warn(`[LinkManager] Could not find nodes: source=${sourceNodeId}, target=${targetNodeId}`);
      return;
    }

    const targetTitle = this.wallboard.getNodeTitle(targetNode);
    console.log(`[LinkManager] Looking for links to "${targetTitle}" in node ${sourceNodeId}`);

    // Remove the link from content
    let content = sourceNode.data.content;
    const originalContent = content;

    // Escape the title for use in regex
    const escapedTitle = this.escapeRegex(targetTitle);

    // Remove the link in different formats (with flexible whitespace):
    // 1. Remove "- [[Link]]" list items (allows spaces inside brackets)
    content = content.replace(new RegExp(`^\\s*-\\s*\\[\\[\\s*${escapedTitle}\\s*\\]\\]\\s*$`, 'gm'), '');

    // 2. Remove inline [[Link]] occurrences (allows spaces inside brackets)
    content = content.replace(new RegExp(`\\[\\[\\s*${escapedTitle}\\s*\\]\\]`, 'g'), '');

    // Clean up empty ## Links sections
    content = content.replace(/^##\s+Links\s*\n(\s*\n)+/gm, '');

    // Clean up multiple consecutive empty lines
    content = content.replace(/\n{3,}/g, '\n\n');

    // Check if anything was actually removed
    if (content === originalContent) {
      console.log(`[LinkManager] No matching link found for "${targetTitle}" in node ${sourceNodeId}`);
      return;
    }

    // Update node content
    sourceNode.data.content = content.trim();
    sourceNode.data.html = marked.parse(sourceNode.data.content);

    console.log(`[LinkManager] Removed link(s) to "${targetTitle}" from node ${sourceNodeId}`);

    // Update display
    this.updateNodeDisplay(sourceNodeId);
  }

  /**
   * Remove all [[links]] to a deleted node from all other nodes
   * @param {number} deletedNodeId - The ID of the node that was deleted
   */
  removeAllLinksToNode(deletedNodeId) {
    const deletedNode = this.wallboard.getNodeById(deletedNodeId);
    if (!deletedNode) return;

    const deletedTitle = this.wallboard.getNodeTitle(deletedNode);

    // Find all nodes that have links to the deleted node
    this.wallboard.nodes.forEach(node => {
      if (node.id === deletedNodeId) return; // Skip the deleted node itself

      // Check if this node has a link to the deleted node (with flexible whitespace)
      const escapedTitle = this.escapeRegex(deletedTitle);
      const hasLink = new RegExp(`\\[\\[\\s*${escapedTitle}\\s*\\]\\]`).test(node.data.content);

      if (hasLink) {
        // Remove the link from this node's content
        let content = node.data.content;

        // Remove the link in different formats (with flexible whitespace):
        // 1. Remove "- [[Link]]" list items
        content = content.replace(new RegExp(`^\\s*-\\s*\\[\\[\\s*${escapedTitle}\\s*\\]\\]\\s*$`, 'gm'), '');

        // 2. Remove inline [[Link]] occurrences
        content = content.replace(new RegExp(`\\[\\[\\s*${escapedTitle}\\s*\\]\\]`, 'g'), '');

        // Clean up empty ## Links sections
        content = content.replace(/^##\s+Links\s*\n(\s*\n)+/gm, '');

        // Clean up multiple consecutive empty lines
        content = content.replace(/\n{3,}/g, '\n\n');

        // Update node content
        node.data.content = content.trim();
        node.data.html = typeof MathRenderer !== 'undefined'
          ? MathRenderer.render(node.data.content)
          : marked.parse(node.data.content);

        // Update display
        this.updateNodeDisplay(node.id);
      }
    });
  }

  /**
   * Update all [[link]] references when a node is renamed
   * @param {number} nodeId - The ID of the node that was renamed
   * @param {string} oldTitle - The old title
   * @param {string} newTitle - The new title
   */
  updateAllReferencesToNode(nodeId, oldTitle, newTitle) {
    console.log(`[LinkManager] Updating all references: "${oldTitle}" -> "${newTitle}"`);

    // Track which nodes need link reprocessing
    const nodesToReprocess = [];

    // Find all nodes that have links to this node
    this.wallboard.nodes.forEach(node => {
      if (node.id === nodeId) return; // Skip the renamed node itself

      // Check if this node has a link to the old title (with flexible whitespace)
      const escapedOldTitle = this.escapeRegex(oldTitle);
      const hasLink = new RegExp(`\\[\\[\\s*${escapedOldTitle}\\s*\\]\\]`, 'i').test(node.data.content);

      if (hasLink) {
        console.log(`[LinkManager] Updating references in node ${node.id}`);

        // Replace all occurrences of [[oldTitle]] with [[newTitle]] (case-insensitive)
        let content = node.data.content;

        // Replace the link (case-insensitive, with flexible whitespace)
        content = content.replace(
          new RegExp(`\\[\\[\\s*${escapedOldTitle}\\s*\\]\\]`, 'gi'),
          `[[${newTitle}]]`
        );

        // Update node content
        node.data.content = content;
        // Clear cached HTML to force re-render with link processing
        delete node.data.html;

        console.log(`[LinkManager] Updated references in node ${node.id}`);

        // Update display (re-renders the content with proper wiki-link styling)
        this.updateNodeDisplay(node.id);

        // Track for reprocessing
        nodesToReprocess.push({ id: node.id, content });
      }
    });

    // After all content is updated, reprocess links to update connections
    // This ensures the renamed node exists with its new title before processing
    nodesToReprocess.forEach(({ id, content }) => {
      // Just update connections, don't create new nodes
      this.updateConnectionsOnly(id, content);
    });
  }

  /**
   * Update connections for a node without creating new nodes
   * @param {number} nodeId - The node ID
   * @param {string} content - The markdown content
   */
  updateConnectionsOnly(nodeId, content) {
    console.log(`[LinkManager] updateConnectionsOnly for node ${nodeId}`);

    // Extract all [[links]] from content
    const linkTitles = this.extractLinks(content);
    console.log(`[LinkManager] Found ${linkTitles.length} links:`, linkTitles);

    if (linkTitles.length === 0) {
      this.pruneOrphanedConnections(nodeId, []);
      return;
    }

    // For each link, find existing node and ensure connection (don't create new nodes)
    linkTitles.forEach(linkTitle => {
      console.log(`[LinkManager] Looking for node with title "${linkTitle}"`);

      const targetNode = this.wallboard.nodes.find(n => {
        const nodeTitle = this.wallboard.getNodeTitle(n);
        const matches = nodeTitle.toLowerCase() === linkTitle.toLowerCase();
        console.log(`[LinkManager] Comparing "${nodeTitle}" with "${linkTitle}": ${matches}`);
        return matches;
      });

      if (targetNode) {
        console.log(`[LinkManager] Found target node ${targetNode.id}, creating connection`);
        // Only create connection if target node exists
        this.ensureConnection(nodeId, targetNode.id);
      } else {
        console.log(`[LinkManager] No target node found for "${linkTitle}"`);
      }
    });

    // Remove connections that no longer have corresponding links
    this.pruneOrphanedConnections(nodeId, linkTitles);

    // Force immediate connection redraw
    if (this.wallboard.connectionManager) {
      this.wallboard.connectionManager.updateConnections();
    }
  }

  /**
   * Escape special regex characters in a string
   * @param {string} str - String to escape
   * @returns {string} - Escaped string
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
