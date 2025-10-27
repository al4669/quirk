// Global unified rendering utilities
window.MarkdownRenderer = {
  // Reset state for each render
  reset() {
    this.mathBlocks = new Map();
    this.mathInline = new Map();
    this.commands = new Map();
    this.mathCounter = 0;
    this.commandCounter = 0;
  },

  // Complete render pipeline
  render(markdown, debug = false) {
    if (!markdown) return '';

    this.reset();

    if (debug) console.log('[MarkdownRenderer] Input:', markdown.substring(0, 200));

    // Step 1: Extract and protect commands FIRST (before math)
    markdown = this.extractCommands(markdown);
    if (debug) console.log('[MarkdownRenderer] After extractCommands:', markdown.substring(0, 200));

    // Step 2: Extract and render math BEFORE markdown processing
    markdown = this.extractAndRenderMath(markdown);
    if (debug) {
      console.log('[MarkdownRenderer] After extractMath:', markdown.substring(0, 200));
      console.log('[MarkdownRenderer] Math blocks:', this.mathBlocks.size, 'inline:', this.mathInline.size);
    }

    // Step 3: Render markdown
    let html = marked.parse(markdown, {
      gfm: true,
      breaks: true,
      tables: true
    });
    if (debug) console.log('[MarkdownRenderer] After marked.parse:', html.substring(0, 200));

    // Step 4: Restore rendered math
    html = this.restoreMath(html);
    if (debug) console.log('[MarkdownRenderer] After restoreMath:', html.substring(0, 200));

    // Step 5: Restore commands with badges
    html = this.restoreCommands(html);
    if (debug) console.log('[MarkdownRenderer] After restoreCommands:', html.substring(0, 200));

    return html;
  },

  extractCommands(text) {
    // Extract [[COMMAND]] or [[COMMAND:args]] patterns
    // Handle multiline content within commands
    return text.replace(/\[\[([A-Z_]+)(?::([^\]]+?))?\]\]/gs, (match, command, args) => {
      const id = `::CMD${this.commandCounter++}::`;
      const commandText = args ? `${command}: ${args}` : command;
      this.commands.set(id, `<span class="ai-command-badge">${commandText}</span>`);
      return id;
    });
  },

  extractAndRenderMath(text) {
    // Extract and render block math first ($$...$$)
    // Very permissive: allows any whitespace around delimiters
    text = text.replace(/\$\$\s*([\s\S]+?)\s*\$\$/g, (match, formula) => {
      const id = `::MATHBLOCK${this.mathCounter++}::`;
      try {
        const rendered = katex.renderToString(formula.trim(), {
          throwOnError: false,
          displayMode: true
        });
        this.mathBlocks.set(id, '<div class="math-block">' + rendered + '</div>');
      } catch (e) {
        console.warn('KaTeX block math error:', e, formula);
        this.mathBlocks.set(id, '<div class="math-error">' + formula.trim() + '</div>');
      }
      return `\n\n${id}\n\n`;
    });

    // Extract and render inline math ($...$) - but not $$
    // More permissive: allows content across lines
    text = text.replace(/\$(?!\$)(.+?)\$/gs, (match, formula) => {
      // Skip if this looks like it's part of a block math we already processed
      if (match.includes('::MATHBLOCK')) {
        return match;
      }

      const id = `::MATHINLINE${this.mathCounter++}::`;
      try {
        // Remove any newlines/extra whitespace from inline math
        const cleanFormula = formula.replace(/\s+/g, ' ').trim();
        const rendered = katex.renderToString(cleanFormula, {
          throwOnError: false,
          displayMode: false
        });
        this.mathInline.set(id, rendered);
      } catch (e) {
        console.warn('KaTeX inline math error:', e, formula);
        this.mathInline.set(id, '<span class="math-error">' + formula.trim() + '</span>');
      }
      return id;
    });

    return text;
  },

  restoreMath(html) {
    // Restore block math (look for placeholders wrapped in <p> tags or standalone)
    html = html.replace(/(?:<p>)?(::MATHBLOCK\d+::)(?:<\/p>)?/g, (match, id) => {
      const rendered = this.mathBlocks.get(id);
      return rendered || match;
    });

    // Restore inline math (may be wrapped in various tags)
    html = html.replace(/::MATHINLINE\d+::/g, (id) => {
      const rendered = this.mathInline.get(id);
      return rendered || id;
    });

    return html;
  },

  restoreCommands(html) {
    // Restore commands (may be wrapped in tags)
    html = html.replace(/::CMD\d+::/g, (id) => {
      const rendered = this.commands.get(id);
      return rendered || id;
    });

    return html;
  }
};

// Backward compatibility alias
window.MathRenderer = window.MarkdownRenderer;

// Configure marked for GFM with improved code highlighting
marked.setOptions({
  gfm: true,
  breaks: true,
  tables: true,
  highlight: function (code, lang) {
    // Ensure code is a string and has content
    if (!code || typeof code !== 'string') return code;

    // If language specified and Prism supports it, highlight
    if (lang && Prism.languages[lang]) {
      try {
        return Prism.highlight(code, Prism.languages[lang], lang);
      } catch (e) {
        console.warn('Prism highlighting error:', e);
        return code;
      }
    }

    // Auto-detect language if not specified
    if (!lang) {
      // Try common languages
      const languages = ['javascript', 'python', 'css', 'gdscript'];
      for (const testLang of languages) {
        if (Prism.languages[testLang]) {
          try {
            // Simple heuristics
            if (testLang === 'python' && /^\s*(def|class|import|from)\s/.test(code)) {
              return Prism.highlight(code, Prism.languages[testLang], testLang);
            }
            if (testLang === 'javascript' && /(function|const|let|var|=>)/.test(code)) {
              return Prism.highlight(code, Prism.languages[testLang], testLang);
            }
          } catch (e) {
            // Continue to next language
          }
        }
      }
    }

    return code;
  },
});
