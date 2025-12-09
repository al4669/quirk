// Handles sandboxed HTML previews inside nodes
class HtmlPreviewManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
  }

  hydrate(container, node, side = 'content') {
    if (!container) return;
    const previews = container.querySelectorAll('[data-html-preview]');
    previews.forEach((el) => {
      if (el.dataset.hydrated === 'true') return;
      this.renderPreview(el, side);
    });
  }

  static encodeHtml(html) {
    try {
      if (typeof TextEncoder === 'undefined') {
        return btoa(unescape(encodeURIComponent(html || '')));
      }
      const bytes = new TextEncoder().encode(html || '');
      let binary = '';
      bytes.forEach((b) => {
        binary += String.fromCharCode(b);
      });
      return btoa(binary);
    } catch (err) {
      console.warn('[HTML Preview] Failed to encode content', err);
      return '';
    }
  }

  static decodeHtml(encoded) {
    if (!encoded) return '';
    try {
      if (typeof TextDecoder === 'undefined') {
        return decodeURIComponent(escape(atob(encoded)));
      }
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch (err) {
      console.warn('[HTML Preview] Failed to decode content', err);
      return '';
    }
  }

  static cleanDocument(rawHtml) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, 'text/html');

      // Remove forbidden elements
      const forbidden = ['script', 'iframe', 'object', 'embed'];
      forbidden.forEach((tag) => doc.querySelectorAll(tag).forEach((el) => el.remove()));

      // Strip event handlers and javascript: URLs
      const cleanAttr = (el) => {
        [...el.attributes].forEach((attr) => {
          const name = attr.name.toLowerCase();
          const value = attr.value || '';
          if (name.startsWith('on')) {
            el.removeAttribute(attr.name);
          }
          if ((name === 'href' || name === 'src') && /^javascript:/i.test(value)) {
            el.removeAttribute(attr.name);
          }
        });
      };
      doc.querySelectorAll('*').forEach(cleanAttr);

      const doctype = doc.doctype
        ? `<!DOCTYPE ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}" "${doc.doctype.systemId}"` : ''}>`
        : '<!doctype html>';

      return `${doctype}\n${doc.documentElement.outerHTML}`;
    } catch (err) {
      console.warn('[HTML Preview] Failed to clean document, falling back to raw', err);
      return rawHtml;
    }
  }

  wrapHtml(userHtml) {
    const original = userHtml && userHtml.trim().length
      ? userHtml.trim()
      : '<div class="html-preview-empty">No HTML to display.</div>';

    // If the user already supplied a full HTML document (doctype/head/body), keep it as-is
    if (/<!doctype|<html|<head|<body/i.test(original)) {
      return original;
    }

    // Otherwise, wrap the fragment with a lightweight shell + carry any inline <style> blocks
    const styleBlocks = [];
    const remaining = original.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (m, css) => {
      styleBlocks.push(css);
      return '';
    });

    const baseStyles = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 16px;
        background: #0b0c10;
        color: #e6edf3;
        font-family: "Inter", "SF Pro Display", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      img, video { max-width: 100%; }
      .html-preview-empty {
        color: #a6accd;
        font-family: "Inter", "SF Pro Display", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        text-align: center;
        padding: 32px;
      }
    `;

    const combinedStyles = [baseStyles, ...styleBlocks].join('\n');

    return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>${combinedStyles}</style>
      </head>
      <body>${remaining}</body>
    </html>`;
  }

  renderPreview(shell, side) {
    const encoded = shell.dataset.htmlPayload || '';
    const userHtml = HtmlPreviewManager.decodeHtml(encoded).trim();
    const doc = this.wrapHtml(userHtml);
    const label = shell.dataset.previewLabel || (side === 'result' ? 'Result HTML' : 'HTML Preview');

    // Build toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'html-preview-toolbar';
    const labelEl = document.createElement('span');
    labelEl.className = 'html-preview-label';
    labelEl.textContent = label;
    toolbar.appendChild(labelEl);

    const fullBtn = document.createElement('button');
    fullBtn.type = 'button';
    fullBtn.className = 'html-preview-btn';
    fullBtn.textContent = 'Fullscreen';
    fullBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openOverlay(doc);
    });

    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'html-preview-btn';
    tabBtn.textContent = 'New tab';
    tabBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openInNewTab(doc);
    });

    toolbar.appendChild(fullBtn);
    toolbar.appendChild(tabBtn);

    // Frame
    const frame = document.createElement('div');
    frame.className = 'html-preview-frame';
    const iframe = document.createElement('iframe');
    iframe.className = 'html-preview-iframe';
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.srcdoc = doc;
    frame.appendChild(iframe);

    // Note
    const note = document.createElement('div');
    note.className = 'html-preview-note';
    note.textContent = 'Sandboxed preview: scripts removed, inline styles allowed.';

    shell.innerHTML = '';
    shell.appendChild(toolbar);
    shell.appendChild(frame);
    shell.appendChild(note);
    shell.dataset.hydrated = 'true';
  }

  openOverlay(doc) {
    const overlay = document.createElement('div');
    overlay.className = 'html-preview-overlay';

    const panel = document.createElement('div');
    panel.className = 'html-preview-panel';

    const actions = document.createElement('div');
    actions.className = 'html-preview-overlay-actions';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'html-preview-btn';
    closeBtn.textContent = 'Close';

    const newTabBtn = document.createElement('button');
    newTabBtn.type = 'button';
    newTabBtn.className = 'html-preview-btn';
    newTabBtn.textContent = 'New tab';
    newTabBtn.addEventListener('click', () => this.openInNewTab(doc));

    actions.appendChild(closeBtn);
    actions.appendChild(newTabBtn);

    const iframe = document.createElement('iframe');
    iframe.className = 'html-preview-iframe fullscreen';
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.srcdoc = doc;

    panel.appendChild(actions);
    panel.appendChild(iframe);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    document.addEventListener('keydown', escHandler);
    closeBtn.addEventListener('click', close);
  }

  openInNewTab(doc) {
    const content = doc || '<!doctype html><html><body><div class="html-preview-empty">No HTML to display.</div></body></html>';
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}
