// Theme selector UI component
class ThemeSelector {
  static outsideClickHandler = null;

  static show(nodeId, globalTheme, nodeThemes, onSelectCallback) {
    this.hide(); // Close any existing selector

    // Also close connection theme selector if it exists
    if (window.wallboard && window.wallboard.connectionManager) {
      window.wallboard.connectionManager.hideConnectionThemeSelector();
    }

    const selector = document.createElement('div');
    selector.className = 'theme-selector';
    selector.id = 'themeSelector';

    const title = nodeId ? `Theme for Node ${nodeId}` : 'Global Theme';

    selector.innerHTML = this.buildHTML(nodeId, globalTheme, nodeThemes, title, onSelectCallback);

    document.body.appendChild(selector);

    // Add click outside to close
    this.outsideClickHandler = (e) => {
      if (!e.target.closest('#themeSelector')) {
        ThemeSelector.hide();
      }
    };

    setTimeout(() => {
      document.addEventListener('click', this.outsideClickHandler);
    }, 10);
  }

  static hide() {
    const selector = document.getElementById('themeSelector');
    if (selector) {
      selector.remove();
    }
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
  }

  static buildHTML(nodeId, globalTheme, nodeThemes, title, onSelectCallback) {
    const themeOptionsHTML = Object.entries(Themes.definitions)
      .filter(([key, theme]) => {
        // For global theme selector, exclude the duplicate 'pink' theme since 'default' is already pink
        if (!nodeId && key === 'pink') return false;
        return true;
      })
      .map(([key, theme]) => {
        let isActive = false;
        if (nodeId) {
          // For node themes, only mark active if this node has this specific theme
          isActive = nodeThemes[nodeId] === key;
        } else {
          // For global themes, mark active if it matches the global theme
          isActive = globalTheme === key;
        }

        // For node theme selector, show "Global" instead of "Pink" for the default theme
        const displayName = (nodeId && key === 'default') ? 'Global' : theme.name;

        // For the "Global" option in node theme selector, show the current global theme color
        const previewColor = (nodeId && key === 'default')
          ? Themes.definitions[globalTheme].accent
          : theme.accent;

        return `
          <div class="theme-option ${isActive ? 'active' : ''}"
               onclick="wallboard.selectTheme('${key}', ${nodeId !== null ? nodeId : 'null'})"
               data-theme="${key}">
            <div class="theme-preview" style="background: ${previewColor}"></div>
            <span class="theme-name">${displayName}</span>
          </div>
        `;
      })
      .join('');

    return `
      <div class="theme-selector-header">
        <h3>${title}</h3>
        <button class="close-btn" onclick="wallboard.hideThemeSelector()">×</button>
      </div>
      <div class="theme-grid">
        ${themeOptionsHTML}
      </div>
    `;
  }
}
