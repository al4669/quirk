// Notification system for showing toast messages
class Notifications {
  static show(message) {
    const notif = document.createElement("div");
    notif.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--accent);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(244, 35, 101, 0.4);
      z-index: 3000;
      animation: slideDown 0.3s ease;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);

    setTimeout(() => {
      notif.style.animation = "slideUp 0.3s ease";
      setTimeout(() => notif.remove(), 300);
    }, 2000);
  }
}
