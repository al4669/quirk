// DOM utility functions
class DomUtils {
  // Apply CSS transform matrix to an element
  static applyTransform(elementId, zoom, panX, panY) {
    const element = document.getElementById(elementId);
    if (element) {
      element.style.transform = `matrix(${zoom}, 0, 0, ${zoom}, ${panX}, ${panY})`;
      element.style.transformOrigin = '0 0';
    }
  }

  // Hide context menu by removing show class or removing element
  static hideContextMenu(menuId = 'contextMenu') {
    const menu = document.getElementById(menuId);
    if (menu) {
      menu.classList.remove('show');
    }
  }

  // Show and position a context menu
  static showContextMenu(menuId, x, y) {
    const menu = document.getElementById(menuId);
    if (menu) {
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.classList.add('show');
    }
  }
}
