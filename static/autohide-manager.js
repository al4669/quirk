// Auto-hide manager for toolbar and minimap
class AutohideManager {
  constructor() {
    this.toolbarHideTimeout = null;
    this.minimapHideTimeout = null;
    this.initialDelay = 3000; // Show for 3 seconds initially
    this.hoverRevealDistance = 50; // Distance from edge to reveal

    this.init();
  }

  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.toolbar = document.querySelector('.toolbar');
    this.minimapContainer = document.querySelector('.minimap-container');

    if (!this.toolbar || !this.minimapContainer) {
      console.warn('[AutohideManager] Toolbar or minimap not found, retrying...');
      setTimeout(() => this.setup(), 500);
      return;
    }

    // Add CSS classes for transitions
    this.toolbar.classList.add('autohide');
    this.minimapContainer.classList.add('autohide');

    // Initial hide after delay
    this.scheduleToolbarHide();
    this.scheduleMinimapHide();

    // Setup mouse move listener for revealing
    this.setupMouseListeners();
  }

  setupMouseListeners() {
    let mouseMoveTimeout = null;

    document.addEventListener('mousemove', (e) => {
      // Clear any pending timeout to avoid excessive checks
      if (mouseMoveTimeout) {
        clearTimeout(mouseMoveTimeout);
      }

      mouseMoveTimeout = setTimeout(() => {
        this.handleMouseMove(e);
      }, 50);
    });

    // Hover listeners for toolbar
    this.toolbar.addEventListener('mouseenter', () => {
      this.cancelToolbarHide();
      this.showToolbar();
    });

    this.toolbar.addEventListener('mouseleave', () => {
      this.scheduleToolbarHide();
    });

    // Hover listeners for minimap
    this.minimapContainer.addEventListener('mouseenter', () => {
      this.cancelMinimapHide();
      this.showMinimap();
    });

    this.minimapContainer.addEventListener('mouseleave', () => {
      this.scheduleMinimapHide();
    });
  }

  handleMouseMove(e) {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Check if mouse is near top (for toolbar)
    if (e.clientY < this.hoverRevealDistance) {
      this.showToolbar();
      this.cancelToolbarHide();
      // Schedule hide when mouse leaves
      this.scheduleToolbarHide(1000);
    }

    // Check if mouse is near bottom-left (for minimap)
    if (e.clientX < 250 && e.clientY > windowHeight - 250) {
      this.showMinimap();
      this.cancelMinimapHide();
      // Schedule hide when mouse leaves
      this.scheduleMinimapHide(1000);
    }
  }

  // Toolbar methods
  showToolbar() {
    if (this.toolbar) {
      this.toolbar.classList.add('visible');
    }
  }

  hideToolbar() {
    if (this.toolbar && !this.toolbar.matches(':hover')) {
      this.toolbar.classList.remove('visible');
    }
  }

  scheduleToolbarHide(delay = this.initialDelay) {
    this.cancelToolbarHide();
    this.toolbarHideTimeout = setTimeout(() => {
      this.hideToolbar();
    }, delay);
  }

  cancelToolbarHide() {
    if (this.toolbarHideTimeout) {
      clearTimeout(this.toolbarHideTimeout);
      this.toolbarHideTimeout = null;
    }
  }

  // Minimap methods
  showMinimap() {
    if (this.minimapContainer) {
      this.minimapContainer.classList.add('visible');
    }
  }

  hideMinimap() {
    if (this.minimapContainer && !this.minimapContainer.matches(':hover')) {
      this.minimapContainer.classList.remove('visible');
    }
  }

  scheduleMinimapHide(delay = this.initialDelay) {
    this.cancelMinimapHide();
    this.minimapHideTimeout = setTimeout(() => {
      this.hideMinimap();
    }, delay);
  }

  cancelMinimapHide() {
    if (this.minimapHideTimeout) {
      clearTimeout(this.minimapHideTimeout);
      this.minimapHideTimeout = null;
    }
  }
}

// Initialize on load
if (typeof window !== 'undefined') {
  window.autohideManager = new AutohideManager();
}
