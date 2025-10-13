// Dialog utility functions
class DialogUtils {
  // Show a prompt dialog and return trimmed input or null
  static promptText(message, defaultValue = '') {
    const result = prompt(message, defaultValue);
    return result ? result.trim() : null;
  }

  // Show a confirmation dialog
  static confirmAction(message) {
    return confirm(message);
  }

  // Show an alert message
  static alertMessage(message) {
    alert(message);
  }
}
