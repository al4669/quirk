// Canvas configuration constants
class CanvasConfig {
  static WIDTH = 30000;
  static HEIGHT = 30000;
  static DEFAULT_ZOOM = 1;

  static getInitialPanX() {
    return -(this.WIDTH / 2) + (window.innerWidth / 2);
  }

  static getInitialPanY() {
    return -(this.HEIGHT / 2) + (window.innerHeight / 2);
  }
}
