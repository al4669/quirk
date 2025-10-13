// Board validation and naming utilities
class BoardUtils {
  // Validate board data structure
  static validateBoardData(data) {
    return (
      typeof data === 'object' &&
      data !== null &&
      (Array.isArray(data.nodes) || data.nodes === undefined) &&
      (Array.isArray(data.connections) || data.connections === undefined)
    );
  }

  // Generate a unique name by appending a counter if needed
  static generateUniqueName(baseName, existingNames) {
    if (!existingNames.includes(baseName)) {
      return baseName;
    }

    // Generate numbered variants: "Name (1)", "Name (2)", etc.
    let counter = 1;
    let uniqueName;

    do {
      uniqueName = `${baseName} (${counter})`;
      counter++;
    } while (existingNames.includes(uniqueName));

    return uniqueName;
  }
}
