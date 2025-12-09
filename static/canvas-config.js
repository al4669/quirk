// Canvas configuration constants
class CanvasConfig {
  static MIN_WIDTH = 30000;
  static MIN_HEIGHT = 30000;
  static DEFAULT_ZOOM = 1;

  static getInitialPanX(canvasWidth = null) {
    const width = canvasWidth || this.MIN_WIDTH;
    return -(width / 2) + (window.innerWidth / 2);
  }

  static getInitialPanY(canvasHeight = null) {
    const height = canvasHeight || this.MIN_HEIGHT;
    return -(height / 2) + (window.innerHeight / 2);
  }
}
