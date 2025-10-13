// Coordinate transformation utilities
class CoordinateUtils {
  // Convert screen coordinates to canvas coordinates
  static screenToCanvas(screenX, screenY, panX, panY, zoom) {
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();

    // Get the offset within the canvas element
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    // Convert to canvas coordinate system accounting for pan and zoom
    const x = (canvasX - panX) / zoom;
    const y = (canvasY - panY) / zoom;

    return { x, y };
  }

  // Convert canvas coordinates to screen coordinates
  static canvasToScreen(canvasX, canvasY, panX, panY, zoom) {
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();

    const x = rect.left + (canvasX * zoom) + panX;
    const y = rect.top + (canvasY * zoom) + panY;

    return { x, y };
  }
}
