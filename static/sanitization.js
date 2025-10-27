// HTML Sanitization utility using DOMPurify
// Protects against XSS attacks when rendering markdown content

class Sanitization {
  /**
   * Sanitize HTML content before inserting into DOM
   * @param {string} html - The HTML content to sanitize
   * @returns {string} - Sanitized HTML safe for innerHTML
   */
  static sanitize(html) {
    if (!html) return '';

    // Check if DOMPurify is available
    if (typeof DOMPurify === 'undefined') {
      console.error('[Sanitization] DOMPurify is not loaded! HTML will not be sanitized.');
      return html;
    }

    // Configure DOMPurify to allow common markdown elements
    // but strip dangerous attributes and scripts
    const config = {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'ul', 'ol', 'li',
        'a', 'strong', 'em', 'code', 'pre',
        'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img', 'span', 'div',
        'input', 'label', // For checkboxes
        // KaTeX MathML elements
        'math', 'semantics', 'mrow', 'mi', 'mn', 'mo', 'mfrac', 'msup', 'msub',
        'msqrt', 'mtext', 'annotation', 'mspace', 'mpadded', 'munder', 'mover',
        'munderover', 'mtable', 'mtr', 'mtd', 'menclose', 'mstyle'
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'alt', 'src',
        'class', 'id',
        'type', 'checked', 'disabled', // For checkboxes
        'data-line', // For checkbox tracking
        'style', 'aria-hidden', 'xmlns', // For KaTeX rendering
        'data-expanded' // For AI thinking sections
      ],
      ALLOW_DATA_ATTR: true, // Allow data-* attributes for functionality
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'], // Block event handlers
      KEEP_CONTENT: true, // Keep text content even if tags are removed
      RETURN_TRUSTED_TYPE: false
    };

    return DOMPurify.sanitize(html, config);
  }

  /**
   * Sanitize and set innerHTML on an element
   * @param {HTMLElement} element - The element to update
   * @param {string} html - The HTML content to sanitize and set
   */
  static setInnerHTML(element, html) {
    if (!element) {
      console.warn('[Sanitization] Element is null or undefined');
      return;
    }

    element.innerHTML = this.sanitize(html);
  }
}
