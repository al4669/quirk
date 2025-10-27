// Edit mode management for inline node editing
class EditModeManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
    this.inlineEditTimeout = null;
    this.resizeTimeout = null;
  }

  toggleEdit(nodeId) {
    const node = this.wallboard.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const content = document.getElementById(`content-${nodeId}`);

    // Allow editing for any node type that has content
    if (node.data && node.data.content !== undefined) {
      const isEditing = content.querySelector(".text-editor");

      if (isEditing) {
        // Save scroll position as percentage before exiting edit mode
        let savedScrollPercentY = 0;
        let savedScrollPercentX = 0;
        if (content.scrollHeight > content.clientHeight) {
          savedScrollPercentY = content.scrollTop / (content.scrollHeight - content.clientHeight);
        }
        if (content.scrollWidth > content.clientWidth) {
          savedScrollPercentX = content.scrollLeft / (content.scrollWidth - content.clientWidth);
        }

        // Save and destroy CodeMirror
        const cmInstance = isEditing._cmInstance;
        if (cmInstance) {
          node.data.content = cmInstance.getValue();
          node.data.html = typeof MarkdownRenderer !== 'undefined'
            ? MarkdownRenderer.render(node.data.content)
            : marked.parse(node.data.content);

          // Process wiki-style [[links]] immediately when exiting edit mode
          if (this.wallboard.linkManager) {
            this.wallboard.linkManager.processNodeLinks(node.id, node.data.content, true);
          }
        }

        // Remove editing class from node
        const nodeEl = document.getElementById(`node-${node.id}`);
        if (nodeEl) {
          nodeEl.classList.remove('editing');
          // Remove inline toolbar
          this.removeInlineToolbar(nodeEl);
          // Clear node width constraints
          nodeEl.style.width = "";
          nodeEl.style.maxWidth = "";
        }

        // Clear any width/height constraints and zoom that were set for editing
        content.style.width = "";
        content.style.minWidth = "";
        content.style.maxWidth = "";
        content.style.height = "";
        content.style.minHeight = "";
        content.style.maxHeight = "";
        content.style.overflow = "";
        content.style.overflowY = "";
        content.style.overflowX = "";
        content.style.zoom = "";

        // Render node content with XSS protection
        content.innerHTML = Sanitization.sanitize(this.renderNodeContent(node));

        // Restore scroll position using percentage
        if (savedScrollPercentY > 0 && content.scrollHeight > content.clientHeight) {
          content.scrollTop = savedScrollPercentY * (content.scrollHeight - content.clientHeight);
        }
        if (savedScrollPercentX > 0 && content.scrollWidth > content.clientWidth) {
          content.scrollLeft = savedScrollPercentX * (content.scrollWidth - content.clientWidth);
        }

        // Re-enable checkboxes and re-highlight syntax after DOM update
        setTimeout(() => {
          this.wallboard.enableCheckboxes(content, node);

          const codeBlocks = content.querySelectorAll('pre code');
          codeBlocks.forEach(block => {
            Prism.highlightElement(block);
          });
        }, 0);

        // Update editing state
        this.updateEditingState();

        // Auto-save changes
        this.wallboard.autoSave();

        // Redraw connections after content size may have changed
        setTimeout(() => {
          this.wallboard.updateConnections();
        }, 100);
      } else {
        // Save scroll position as percentage before entering edit mode
        const scrollableHeightBefore = content.scrollHeight - content.clientHeight;
        const scrollableWidthBefore = content.scrollWidth - content.clientWidth;

        const savedScrollPercentY = scrollableHeightBefore > 0 ? content.scrollTop / scrollableHeightBefore : 0;
        const savedScrollPercentX = scrollableWidthBefore > 0 ? content.scrollLeft / scrollableWidthBefore : 0;

        console.log('Entering edit - scroll percent Y:', savedScrollPercentY, 'scrollTop:', content.scrollTop, 'scrollable:', scrollableHeightBefore);

        // Add editing class to node for higher z-index
        const nodeEl = document.getElementById(`node-${node.id}`);

        // Capture node width FIRST, before any modifications
        const nodeWidth = nodeEl.offsetWidth;

        if (nodeEl) {
          nodeEl.classList.add('editing');
          // Lock node width immediately to prevent growth
          nodeEl.style.width = nodeWidth + "px";
          nodeEl.style.maxWidth = nodeWidth + "px";
        }

        // Capture the ACTUAL rendered size before entering edit mode and adding toolbar
        const currentWidth = content.offsetWidth;
        const currentHeight = content.offsetHeight;

        // Edit mode - create CodeMirror inline editor
        // Use the current rendered size instead of always expanding to maximum
        const editWidth = currentWidth;
        const editHeight = currentHeight;

        // Create textarea placeholder for CodeMirror
        const textarea = document.createElement("textarea");
        textarea.className = "text-editor";
        textarea.value = node.data.content;

        content.innerHTML = "";
        content.appendChild(textarea);

        // Initialize CodeMirror
        const cmInstance = CodeMirror.fromTextArea(textarea, {
          mode: 'markdown',
          lineWrapping: true,
          autofocus: true,
          theme: 'easymde',
          lineNumbers: false,
          viewportMargin: Infinity,
          extraKeys: {
            'Enter': 'newlineAndIndentContinueMarkdownList',
            'Tab': false,
            'Shift-Tab': false,
          }
        });

        // Get the CodeMirror wrapper element
        const cmWrapper = content.querySelector('.CodeMirror');
        cmWrapper.classList.add('text-editor');
        cmWrapper._cmInstance = cmInstance;

        // Add inline toolbar to node header
        this.addInlineToolbar(nodeEl, cmInstance);

        // Style the CodeMirror editor to match view width
        cmWrapper.style.height = 'auto';
        cmWrapper.style.minHeight = '150px';
        cmWrapper.style.width = '100%';

        // Use CSS zoom inverse to fix cursor positioning
        // zoom affects coordinate calculations unlike transform: scale()
        const inverseZoom = 1 / this.wallboard.zoom;
        content.style.zoom = inverseZoom;

        // Scale font size to compensate and match visual size with view mode
        // Canvas at this.zoom × content at 1/this.zoom × font at this.zoom = this.zoom (matches rendered)
        cmWrapper.style.fontSize = (this.wallboard.zoom * 100) + '%';

        // Apply node's custom accent color if it has one
        if (node.theme && nodeEl) {
          const accentColor = getComputedStyle(nodeEl).getPropertyValue('--node-accent');
          const accentGlow = getComputedStyle(nodeEl).getPropertyValue('--node-accent-glow');
          // Set on content so children inherit
          content.style.setProperty('--accent', accentColor);
          content.style.setProperty('--accent-glow', accentGlow);
        }

        // Multiply by zoom to compensate for the inverse zoom applied above
        // Maintain the same size as in view mode
        content.style.width = (editWidth * this.wallboard.zoom) + "px";
        content.style.maxWidth = (editWidth * this.wallboard.zoom) + "px";
        content.style.minHeight = (editHeight * this.wallboard.zoom) + "px";
        content.style.maxHeight = (editHeight * this.wallboard.zoom) + "px";

        // Ensure content can scroll to see all lines
        content.style.overflowY = 'auto';
        content.style.overflowX = 'hidden';

        // Refresh CodeMirror and restore scroll position after it's fully rendered
        setTimeout(() => {
          cmInstance.refresh();

          // Update connections immediately after node expands to max size
          this.wallboard.updateConnections();

          // Restore scroll position using percentage after refresh
          setTimeout(() => {
            // Restore scroll on the content container (not CodeMirror's internal scroll)
            if (savedScrollPercentY > 0) {
              const scrollableHeight = content.scrollHeight - content.clientHeight;
              if (scrollableHeight > 0) {
                const targetScrollTop = scrollableHeight * savedScrollPercentY;
                content.scrollTop = targetScrollTop;
                console.log('Restored scroll - percent:', savedScrollPercentY, 'scrollable:', scrollableHeight, 'target:', targetScrollTop, 'actual:', content.scrollTop);
              }
            }

            if (savedScrollPercentX > 0) {
              const scrollableWidth = content.scrollWidth - content.clientWidth;
              if (scrollableWidth > 0) {
                const targetScrollLeft = scrollableWidth * savedScrollPercentX;
                content.scrollLeft = targetScrollLeft;
              }
            }

            // Position cursor near the visible area
            if (savedScrollPercentY > 0) {
              const lineHeight = cmInstance.defaultTextHeight() || 20;
              const targetLine = Math.floor((content.scrollTop / lineHeight));
              if (targetLine > 0 && targetLine < cmInstance.lineCount()) {
                cmInstance.setCursor({ line: targetLine, ch: 0 });
              }
            }
          }, 100);
        }, 10);

        // Auto-save on change
        cmInstance.on('change', () => {
          clearTimeout(this.inlineEditTimeout);
          this.inlineEditTimeout = setTimeout(() => {
            node.data.content = cmInstance.getValue();
            node.data.html = typeof MathRenderer !== 'undefined'
              ? MathRenderer.render(node.data.content)
              : marked.parse(node.data.content);
            this.wallboard.autoSave();

            // Process wiki-style [[links]] after save
            if (this.wallboard.linkManager) {
              this.wallboard.linkManager.processNodeLinks(node.id, node.data.content);
            }
          }, 300); // Reduced from 1000ms for faster response
        });

        // Save immediately on blur (when clicking outside)
        cmInstance.on('blur', () => {
          // Clear any pending timeout
          clearTimeout(this.inlineEditTimeout);
          // Save immediately
          node.data.content = cmInstance.getValue();
          node.data.html = typeof MarkdownRenderer !== 'undefined'
            ? MarkdownRenderer.render(node.data.content)
            : marked.parse(node.data.content);
          this.wallboard.autoSave();

          // Process wiki-style [[links]] immediately on blur
          if (this.wallboard.linkManager) {
            this.wallboard.linkManager.processNodeLinks(node.id, node.data.content, true);
          }
        });

        // Auto-resize on change
        cmInstance.on('change', () => {
          clearTimeout(this.resizeTimeout);
          this.resizeTimeout = setTimeout(() => {
            this.wallboard.updateConnections();
          }, 300);
        });

        // Update editing state
        this.updateEditingState();

        // Focus the editor
        setTimeout(() => {
          cmInstance.refresh();
          cmInstance.focus();
        }, 10);
      }
    }
  }

  updateEditingState() {
    // Check if any node is currently being edited
    this.wallboard.isAnyNodeEditing = document.querySelectorAll('.text-editor').length > 0;
  }

  renderNodeContent(node) {
    if (node.data && node.data.content !== undefined) {
      let content = node.data.content;

      // Pre-process: ensure list items are on their own lines
      // Match "- " that's not at the start of a line or after a newline
      content = content.replace(/([^\n])-\s+/g, '$1\n- ');

      // Use stored HTML if available, otherwise render with MarkdownRenderer or marked.js
      let htmlContent;
      if (node.data.html) {
        htmlContent = node.data.html;
      } else if (typeof MarkdownRenderer !== 'undefined') {
        htmlContent = MarkdownRenderer.render(content);
      } else {
        htmlContent = marked.parse(content);
      }

      // Post-process: Convert [[links]] to clickable elements
      htmlContent = this.makeLinksClickable(htmlContent);

      return `<div class="markdown-content">${htmlContent}</div>`;
    }
    return '';
  }

  makeLinksClickable(html) {
    // Find all [[NodeTitle]] patterns in the rendered HTML and make them clickable
    return html.replace(/\[\[([^\]]+)\]\]/g, (match, title) => {
      const trimmedTitle = title.trim();

      // Find the node with this title
      const targetNode = this.wallboard.nodes.find(n => {
        const nodeTitle = this.wallboard.getNodeTitle(n);
        return nodeTitle.toLowerCase() === trimmedTitle.toLowerCase();
      });

      if (targetNode) {
        // Create a clickable link that focuses the target node (onclick handled via event delegation in app.js)
        return `<a href="#" class="wiki-link" data-node-id="${targetNode.id}">${trimmedTitle}</a>`;
      } else {
        // Node doesn't exist yet, show as inactive link
        return `<span class="wiki-link-inactive">${trimmedTitle}</span>`;
      }
    });
  }

  addInlineToolbar(nodeEl, cmInstance) {
    const header = nodeEl.querySelector('.node-header');
    if (!header) return;

    // Check if toolbar already exists
    if (header.querySelector('.inline-editor-toolbar')) return;

    // Create inline toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'inline-editor-toolbar';
    toolbar.setAttribute('role', 'toolbar');

    // Helper function to create a toolbar button
    const createButton = (className, title, iconSVG, action) => {
      const button = document.createElement('button');
      button.className = `inline-toolbar-btn ${className}`;
      button.type = 'button';
      button.title = title;
      button.setAttribute('aria-label', title);
      button.setAttribute('tabindex', '-1');
      button.innerHTML = iconSVG;
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        action(cmInstance);
        cmInstance.focus();
      });
      return button;
    };

    // Helper function to create separator
    const createSeparator = () => {
      const separator = document.createElement('i');
      separator.className = 'separator';
      separator.textContent = '|';
      return separator;
    };

    // Add buttons with SVG icons
    toolbar.appendChild(createButton('bold', 'Bold (Ctrl-B)',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>',
      (cm) => this.toggleBold(cm)));

    toolbar.appendChild(createButton('italic', 'Italic (Ctrl-I)',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>',
      (cm) => this.toggleItalic(cm)));

    toolbar.appendChild(createButton('heading', 'Heading (Ctrl-H)',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4v16M18 4v16M8 4H4M20 4h-4M8 20H4M20 20h-4M9 12h6"/></svg>',
      (cm) => this.toggleHeading(cm)));

    toolbar.appendChild(createButton('strikethrough', 'Strikethrough',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>',
      (cm) => this.toggleStrikethrough(cm)));

    toolbar.appendChild(createSeparator());

    toolbar.appendChild(createButton('quote', 'Quote',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>',
      (cm) => this.toggleQuote(cm)));

    toolbar.appendChild(createButton('unordered-list', 'Bullet List',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>',
      (cm) => this.toggleBulletList(cm)));

    toolbar.appendChild(createButton('ordered-list', 'Numbered List',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 10h1V4L3 5" stroke-linecap="round"/><path d="M3 14v.01M3 18h2l-2-2.5V14h2" stroke-linecap="round"/></svg>',
      (cm) => this.toggleNumberedList(cm)));

    toolbar.appendChild(createButton('checklist', 'Task List',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="6" height="6" rx="1"/><rect x="3" y="13" width="6" height="6" rx="1"/><line x1="13" y1="8" x2="21" y2="8"/><line x1="13" y1="16" x2="21" y2="16"/><polyline points="5 8 6 9 8 7"/></svg>',
      (cm) => this.toggleChecklist(cm)));

    toolbar.appendChild(createSeparator());

    toolbar.appendChild(createButton('link', 'Insert Link',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      (cm) => this.insertLink(cm)));

    toolbar.appendChild(createButton('code', 'Code Block',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
      (cm) => this.toggleCodeBlock(cm)));

    // Append toolbar at the end (after node-actions)
    // The CSS order properties will handle the visual ordering
    header.appendChild(toolbar);
  }

  removeInlineToolbar(nodeEl) {
    if (!nodeEl) return;
    const toolbar = nodeEl.querySelector('.inline-editor-toolbar');
    if (toolbar) {
      toolbar.remove();
    }
  }

  // Toolbar action helpers - simplified versions of EasyMDE functions
  toggleBold(cm) {
    const selection = cm.getSelection();
    const isBold = selection.startsWith('**') && selection.endsWith('**');
    cm.replaceSelection(isBold ? selection.slice(2, -2) : `**${selection}**`);
  }

  toggleItalic(cm) {
    const selection = cm.getSelection();
    const isItalic = selection.startsWith('*') && selection.endsWith('*') && !selection.startsWith('**');
    cm.replaceSelection(isItalic ? selection.slice(1, -1) : `*${selection}*`);
  }

  toggleHeading(cm) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);
    const match = line.match(/^(#{1,6})\s/);

    if (match) {
      const level = match[1].length;
      if (level < 6) {
        cm.replaceRange('#' + line, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
      } else {
        cm.replaceRange(line.slice(7), { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
      }
    } else {
      cm.replaceRange('# ' + line, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
    }
  }

  toggleStrikethrough(cm) {
    const selection = cm.getSelection();
    const isStrike = selection.startsWith('~~') && selection.endsWith('~~');
    cm.replaceSelection(isStrike ? selection.slice(2, -2) : `~~${selection}~~`);
  }

  toggleQuote(cm) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);
    const isQuote = line.startsWith('> ');
    cm.replaceRange(isQuote ? line.slice(2) : '> ' + line, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
  }

  toggleBulletList(cm) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);
    const isBullet = line.match(/^[-*]\s/);
    cm.replaceRange(isBullet ? line.slice(2) : '- ' + line, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
  }

  toggleNumberedList(cm) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);
    const isNumbered = line.match(/^\d+\.\s/);
    cm.replaceRange(isNumbered ? line.replace(/^\d+\.\s/, '') : '1. ' + line, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
  }

  toggleChecklist(cm) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);
    const isChecklist = line.match(/^- \[[x\s]\]\s/);
    cm.replaceRange(isChecklist ? line.replace(/^- \[[x\s]\]\s/, '') : '- [ ] ' + line, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
  }

  insertLink(cm) {
    const selection = cm.getSelection();
    if (selection) {
      cm.replaceSelection(`[${selection}](url)`);
    } else {
      cm.replaceSelection('[text](url)');
    }
  }

  toggleCodeBlock(cm) {
    const selection = cm.getSelection();
    if (selection.includes('\n')) {
      const isCode = selection.startsWith('```\n') && selection.endsWith('\n```');
      cm.replaceSelection(isCode ? selection.slice(4, -4) : `\`\`\`\n${selection}\n\`\`\``);
    } else {
      const isInline = selection.startsWith('`') && selection.endsWith('`');
      cm.replaceSelection(isInline ? selection.slice(1, -1) : `\`${selection}\``);
    }
  }
}
