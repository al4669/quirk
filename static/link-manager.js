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

      // Track newly created nodes for selective auto-arrange
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
      // Note: Auto-arrange is deferred until edit mode exits to avoid layout issues with edit-mode sizing
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
      html: marked.parse(placeholderContent)
    });

    // Smart placement near the source node (initial position before auto-arrange)
    if (sourceNodeId) {
      const sourceNode = this.wallboard.getNodeById(sourceNodeId);
      if (sourceNode) {
        node.position = this.findBestPositionNearNode(sourceNode, node.id);
      }
    }

    this.wallboard.renderNode(node);

    return { node, wasCreated: true };
  }

  /**
   * Find the best position for a new node near a source node, avoiding overlaps
   * @param {object} sourceNode - The source node
   * @param {number} newNodeId - The ID of the new node
   * @returns {object} - {x, y} position
   */
  findBestPositionNearNode(sourceNode, newNodeId) {
    const nodeWidth = 300;
    const nodeHeight = 200;
    const spacing = 50;

    // Try positions in a circular pattern around the source node
    const angles = [0, 45, 90, 135, 180, 225, 270, 315]; // degrees
    const distance = 400; // Distance from source node

    for (const angle of angles) {
      const radians = (angle * Math.PI) / 180;
      const x = sourceNode.position.x + Math.cos(radians) * distance;
      const y = sourceNode.position.y + Math.sin(radians) * distance;

      // Check if this position overlaps with any existing nodes
      const overlaps = this.wallboard.nodes.some(n => {
        if (n.id === sourceNode.id || n.id === newNodeId) return false;

        const dx = Math.abs(n.position.x - x);
        const dy = Math.abs(n.position.y - y);

        return dx < (nodeWidth + spacing) && dy < (nodeHeight + spacing);
      });

      if (!overlaps) {
        return { x, y };
      }
    }

    // If all positions are taken, try farther away
    const radians = (Math.random() * 360 * Math.PI) / 180;
    const farDistance = 600;
    return {
      x: sourceNode.position.x + Math.cos(radians) * farDistance,
      y: sourceNode.position.y + Math.sin(radians) * farDistance
    };
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
    // Get all outgoing connections from this node
    const outgoingConnections = this.wallboard.connectionManager.connections.filter(
      conn => conn.start.nodeId === sourceNodeId
    );

    // Create a set of target node IDs that should exist (based on linkTitles)
    const validTargetIds = new Set();

    linkTitles.forEach(linkTitle => {
      const targetNode = this.wallboard.nodes.find(n => {
        const nodeTitle = this.wallboard.getNodeTitle(n);
        return nodeTitle.toLowerCase() === linkTitle.toLowerCase();
      });

      if (targetNode) {
        validTargetIds.add(targetNode.id);
      }
    });

    // Remove connections to nodes that are not in the valid set
    outgoingConnections.forEach(conn => {
      if (!validTargetIds.has(conn.end.nodeId)) {
        this.wallboard.connectionManager.removeConnection(conn.id);
        console.log(`Pruned orphaned connection: ${sourceNodeId} -> ${conn.end.nodeId}`);
      }
    });
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
    node.data.html = marked.parse(content);

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

      const linkText = `[[${deletedTitle}]]`;

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
        node.data.html = marked.parse(node.data.content);

        // Update display
        this.updateNodeDisplay(node.id);
      }
    });
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
