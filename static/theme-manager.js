// Theme management for global and per-node themes
class ThemeManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
  }

  setGlobalTheme(themeKey) {
    // Record change for undo/redo
    if (this.wallboard.keyboardShortcuts) {
      this.wallboard.keyboardShortcuts.recordChange('set_global_theme', {
        oldTheme: this.wallboard.globalTheme,
        newTheme: themeKey
      });
    }

    this.wallboard.globalTheme = themeKey;
    this.applyGlobalTheme();
    this.updateAllNodeThemes();
    this.wallboard.autoSave();
  }

  setNodeTheme(nodeId, themeKey) {
    // Record change for undo/redo
    if (this.wallboard.keyboardShortcuts) {
      this.wallboard.keyboardShortcuts.recordChange('set_node_theme', {
        nodeId: nodeId,
        oldTheme: this.wallboard.nodeThemes[nodeId] || 'default',
        newTheme: themeKey
      });
    }

    if (themeKey === 'default') {
      // Remove custom theme - node will use global theme
      delete this.wallboard.nodeThemes[nodeId];
    } else {
      // Set specific theme for this node, regardless of global theme
      this.wallboard.nodeThemes[nodeId] = themeKey;
    }
    this.applyNodeTheme(nodeId);
    this.wallboard.autoSave();
  }

  applyGlobalTheme() {
    const theme = Themes.definitions[this.wallboard.globalTheme];
    const accentHex = theme.accent;
    const accentRgb = ColorUtils.hexToRgb(accentHex);

    document.documentElement.style.setProperty('--accent', accentHex);
    document.documentElement.style.setProperty('--accent-glow', `${accentHex}40`);
    document.documentElement.style.setProperty('--accent-light', ColorUtils.lightenColor(accentHex, 20));
    document.documentElement.style.setProperty('--accent-dark', ColorUtils.darkenColor(accentHex, 20));

    // Update background gradients
    document.documentElement.style.setProperty('--bg-accent-glow', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.1)`);
    document.documentElement.style.setProperty('--bg-accent-light', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.05)`);
  }

  applyNodeTheme(nodeId) {
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) return;

    const themeKey = this.wallboard.nodeThemes[nodeId];

    if (themeKey) {
      // Apply custom theme to this specific node
      const theme = Themes.definitions[themeKey];
      nodeElement.style.setProperty('--node-accent', theme.accent);
      nodeElement.style.setProperty('--node-accent-glow', `${theme.accent}40`);
      nodeElement.style.setProperty('--node-accent-light', ColorUtils.lightenColor(theme.accent, 20));
      nodeElement.classList.add('custom-theme');
    } else {
      // Use global theme - remove custom properties
      nodeElement.style.removeProperty('--node-accent');
      nodeElement.style.removeProperty('--node-accent-glow');
      nodeElement.style.removeProperty('--node-accent-light');
      nodeElement.classList.remove('custom-theme');
    }
  }

  updateAllNodeThemes() {
    this.wallboard.nodes.forEach(node => {
      this.applyNodeTheme(node.id);
    });
  }

  showThemeSelector(nodeId = null) {
    ThemeSelector.show(nodeId, this.wallboard.globalTheme, this.wallboard.nodeThemes);
  }

  hideThemeSelector() {
    ThemeSelector.hide();
  }

  selectTheme(themeKey, nodeId = null) {
    // Handle the case where nodeId might be passed as string 'null'
    if (nodeId === 'null') {
      nodeId = null;
    }

    if (nodeId !== null && nodeId !== undefined) {
      // Always set the specific theme for the node, never affect global
      this.setNodeTheme(nodeId, themeKey);
    } else {
      // Only change global theme when explicitly setting global theme
      this.setGlobalTheme(themeKey);
    }
    this.hideThemeSelector();
  }
}
