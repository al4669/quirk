// Zoom and touch utility functions
class ZoomUtils {
  static MIN_ZOOM = 0.1;
  static MAX_ZOOM = 3;

  // Calculate distance between two touch points (for pinch gestures)
  static getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Clamp zoom value to valid range
  static clampZoom(zoom, min = this.MIN_ZOOM, max = this.MAX_ZOOM) {
    return Math.max(min, Math.min(max, zoom));
  }

  // Calculate new zoom and pan values for zooming at a specific point
  static calculateZoomAtPoint(clientX, clientY, factor, currentZoom, currentPanX, currentPanY) {
    const newZoom = this.clampZoom(currentZoom * factor);

    if (newZoom === currentZoom) {
      return null; // No change needed
    }

    // Calculate the point in canvas coordinates before zoom
    const canvasX = (clientX - currentPanX) / currentZoom;
    const canvasY = (clientY - currentPanY) / currentZoom;

    // Calculate new pan to keep the point under the cursor
    const newPanX = clientX - canvasX * newZoom;
    const newPanY = clientY - canvasY * newZoom;

    return {
      zoom: newZoom,
      panX: newPanX,
      panY: newPanY
    };
  }
}
