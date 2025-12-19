// HTML Sanitization utility using DOMPurify
// Protects against XSS attacks when rendering markdown content

class Sanitization {
  /**
   * Sanitize HTML content before inserting into DOM
   * @param {string} html - The HTML content to sanitize
   * @returns {string} - Sanitized HTML safe for innerHTML
   */
  static sanitize(html, options = {}) {
    if (!html) return '';

    // Check if DOMPurify is available
    if (typeof DOMPurify === 'undefined') {
      console.error('[Sanitization] DOMPurify is not loaded! HTML will not be sanitized.');
      return html;
    }

    // Configure DOMPurify to allow common markdown elements
    // but strip dangerous attributes and scripts
    const baseConfig = {
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

    // Merge options with base config, allowing additive tag/attr lists
    const mergeList = (base = [], extra = []) => Array.from(new Set([...(base || []), ...(extra || [])]));
    const config = { ...baseConfig };
    if (options.ALLOWED_TAGS || options.ADD_TAGS) {
      config.ALLOWED_TAGS = mergeList(baseConfig.ALLOWED_TAGS, [
        ...(options.ALLOWED_TAGS || []),
        ...(options.ADD_TAGS || [])
      ]);
    }
    if (options.ALLOWED_ATTR || options.ADD_ATTR) {
      config.ALLOWED_ATTR = mergeList(baseConfig.ALLOWED_ATTR, [
        ...(options.ALLOWED_ATTR || []),
        ...(options.ADD_ATTR || [])
      ]);
    }
    // Allow overrides for other keys if explicitly provided
    if (options.FORBID_TAGS) config.FORBID_TAGS = options.FORBID_TAGS;
    if (options.FORBID_ATTR) config.FORBID_ATTR = options.FORBID_ATTR;
    if (typeof options.ALLOW_DATA_ATTR === 'boolean') config.ALLOW_DATA_ATTR = options.ALLOW_DATA_ATTR;
    if (typeof options.KEEP_CONTENT === 'boolean') config.KEEP_CONTENT = options.KEEP_CONTENT;
    if (typeof options.RETURN_TRUSTED_TYPE === 'boolean') config.RETURN_TRUSTED_TYPE = options.RETURN_TRUSTED_TYPE;
    // Pass through any additional DOMPurify flags (e.g., WHOLE_DOCUMENT)
    Object.keys(options).forEach((key) => {
      if (!(key in config)) {
        config[key] = options[key];
      }
    });

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
