// Character Base Class - Extensible character system for UI avatars
class Character {
  constructor(containerId, config = {}) {
    this.containerId = containerId;
    this.container = null;
    this.svg = null;
    this.isAnimating = false;
    this.currentState = 'idle';
    this.animationController = null;

    // Default config
    this.config = {
      width: 80,
      height: 80,
      autoInit: true,
      ...config
    };

    if (this.config.autoInit) {
      this.init();
    }
  }

  init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.error(`Container ${this.containerId} not found`);
      return;
    }

    this.render();
  }

  render() {
    // Override in subclass
    console.warn('render() should be implemented in subclass');
  }

  setState(state) {
    if (this.states && this.states[state]) {
      this.currentState = state;
      this.applyState(this.states[state]);
    }
  }

  applyState(stateConfig) {
    // Override in subclass to apply state-specific animations
    console.warn('applyState() should be implemented in subclass');
  }

  destroy() {
    if (this.animationController) {
      this.animationController.pause();
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}
