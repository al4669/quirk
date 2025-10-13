// Context menu manager for node context menus
class ContextMenuManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
  }

  show(e, node) {
    // Remove any existing dynamically created menu
    const existingMenu = document.getElementById("contextMenu");
    if (existingMenu && existingMenu.parentNode) {
      existingMenu.remove();
    }

    this.wallboard.contextNode = node;

    const menu = document.createElement("div");
    menu.className = "context-menu show";
    menu.id = "contextMenu";

    // Basic node actions with proper HTML structure
    let menuItems = `
      <div class="context-item" onclick="wallboard.toggleEdit(${node.id}); wallboard.hideContextMenu();">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        Edit Content
      </div>
      <div class="context-item" onclick="wallboard.showThemeSelector(${node.id}); wallboard.hideContextMenu();">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
        Change Theme
      </div>
      <div class="context-divider"></div>
      <div class="context-item" onclick="wallboard.removeNode(${node.id}); wallboard.hideContextMenu();">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        Delete Node
      </div>
    `;

    // Alignment options (only if multiple nodes are selected)
    if (this.wallboard.selectedNodes.size > 1 && this.wallboard.selectedNodes.has(node.id)) {
      const nodeIds = Array.from(this.wallboard.selectedNodes);
      menuItems += `
        <div class="context-divider"></div>
        <div class="context-item" onclick="wallboard.alignmentManager.showAlignmentMenu(event, [${nodeIds.join(',')}])">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="21" y1="10" x2="3" y2="10"></line>
            <line x1="21" y1="6" x2="3" y2="6"></line>
            <line x1="21" y1="14" x2="3" y2="14"></line>
            <line x1="21" y1="18" x2="3" y2="18"></line>
          </svg>
          Align Selection (${this.wallboard.selectedNodes.size})
        </div>
      `;
    }

    menu.innerHTML = menuItems;

    // Position and show the menu
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    document.body.appendChild(menu);
  }

  showContextMenu(e, node) {
    this.wallboard.contextNode = node;

    // Check if this is a multi-select context menu
    if (this.wallboard.selectedNodes.size > 1) {
      // Show alignment menu for multiple nodes
      this.wallboard.alignmentManager.showAlignmentMenu(e, Array.from(this.wallboard.selectedNodes));
    } else {
      // Show regular context menu for single node (create it)
      this.show(e, node);
    }
  }

  hide() {
    DomUtils.hideContextMenu('contextMenu');
  }

  editNode() {
    if (this.wallboard.contextNode) {
      this.wallboard.toggleEdit(this.wallboard.contextNode.id);
      this.hide();
    }
  }
}
