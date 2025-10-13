// Node utility functions
class NodeUtils {
  // Get node title with fallback logic
  static getNodeTitle(node) {
    // New format uses "title", old format used "type"
    return node.title || node.type || 'markdown';
  }

  // Find node by ID in array
  static getNodeById(id, nodes) {
    return nodes.find(node => node.id === id);
  }

  // Generate a unique title by appending numbers if needed
  static generateUniqueTitle(desiredTitle, nodes, excludeNodeId = null) {
    // Check if the desired title is already unique
    const titleExists = (title) => {
      return nodes.some(n => {
        // Exclude the current node when checking (for rename operations)
        if (excludeNodeId !== null && n.id === excludeNodeId) {
          return false;
        }
        const nodeTitle = this.getNodeTitle(n);
        return nodeTitle.toLowerCase() === title.toLowerCase();
      });
    };

    // If title is unique, return as-is
    if (!titleExists(desiredTitle)) {
      return desiredTitle;
    }

    // Title exists, append numbers until we find a unique one
    let counter = 2;
    let candidateTitle = `${desiredTitle} ${counter}`;

    while (titleExists(candidateTitle)) {
      counter++;
      candidateTitle = `${desiredTitle} ${counter}`;

      // Safety check to prevent infinite loops (shouldn't happen but just in case)
      if (counter > 10000) {
        // Fallback to using timestamp
        return `${desiredTitle} ${Date.now()}`;
      }
    }

    return candidateTitle;
  }
}
