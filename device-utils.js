// Device detection utilities
class DeviceUtils {
  static isMobile() {
    return window.innerWidth <= 768 ||
           /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  static getDeviceInfo() {
    return {
      isMobile: this.isMobile(),
      width: window.innerWidth,
      userAgent: navigator.userAgent
    };
  }
}
