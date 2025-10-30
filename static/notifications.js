// Notification system for showing toast messages
class Notifications {
  static show(message, type = 'success') {
    const notif = document.createElement("div");
    notif.className = 'app-notification';

    // Different styles based on type
    const styles = {
      success: {
        background: 'var(--accent)',
        color: 'var(--text-on-accent)',
        shadow: 'var(--accent-glow)'
      },
      error: {
        background: '#ef4444',
        color: 'white',
        shadow: 'rgba(239, 68, 68, 0.4)'
      },
      info: {
        background: 'var(--bg-tertiary)',
        color: 'var(--text)',
        shadow: 'var(--accent-glow)'
      }
    };

    const style = styles[type] || styles.success;

    notif.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: ${style.background};
      color: ${style.color};
      padding: 12px 24px;
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: 0 10px 40px ${style.shadow};
      backdrop-filter: blur(10px);
      z-index: 5000;
      font-size: 14px;
      font-weight: 500;
      animation: slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      max-width: 400px;
      text-align: center;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);

    setTimeout(() => {
      notif.style.animation = "slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
      setTimeout(() => notif.remove(), 300);
    }, 3000);
  }
}
