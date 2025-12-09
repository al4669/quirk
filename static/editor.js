// EasyMDE Editor Manager
class EditorManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
    this.currentEditor = null;
    this.currentNode = null;
    this.editorOverlay = null;
    this.currentSide = 'content';
  }

  // Open a node's content in EasyMDE
  openNode(node) {
    this.currentNode = node;
    this.currentSide = this.wallboard.isShowingResult(node.id) ? 'result' : 'content';
    this.autoSaveTimeout = null;

    // Save scroll position as percentage from the node content
    const nodeContent = this.wallboard.getContentElement(node.id, this.currentSide);
    let savedScrollPercent = 0;
    if (nodeContent && nodeContent.scrollHeight > nodeContent.clientHeight) {
      savedScrollPercent = nodeContent.scrollTop / (nodeContent.scrollHeight - nodeContent.clientHeight);
    }

    // Create overlay
    this.editorOverlay = document.createElement('div');
    this.editorOverlay.className = 'editor-overlay';

    // Get theme colors
    const nodeTheme = this.wallboard.nodeThemes[node.id];
    const themeName = nodeTheme || this.wallboard.globalTheme;
    const theme = Themes.definitions[themeName] || Themes.definitions.default;
    const accent = theme.accent;

    const nodeTitle = this.wallboard.getNodeTitle(node).toUpperCase();

    this.editorOverlay.innerHTML = `
      <div class="editor-container">
        <div class="editor-header">
          <div class="editor-title">EDITING ${nodeTitle}</div>
          <button class="editor-close-btn" onclick="wallboard.editorManager.close()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <textarea id="easymde-editor"></textarea>
      </div>
    `;

    document.body.appendChild(this.editorOverlay);

    // Click outside to close - only if clicking the overlay itself, not the container
    this.editorOverlay.addEventListener('click', (e) => {
      if (e.target === this.editorOverlay) {
        this.close();
      }
    });

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Apply theme styling
    const container = this.editorOverlay.querySelector('.editor-container');
    // container.style.border = `1px solid ${accent}40`;
    container.style.boxShadow = `0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px ${accent}20`;

    // Prevent scroll events from bubbling to elements behind - attach to container
    container.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: false });

    // Initialize EasyMDE
    const textarea = document.getElementById('easymde-editor');
    const contentKey = this.currentSide === 'result' ? 'resultContent' : 'content';
    textarea.value = node.data[contentKey] || '';

    this.currentEditor = new EasyMDE({
      element: textarea,
      autofocus: true,
      spellChecker: false,
      status: false,
      minHeight: '500px',
      maxHeight: '100%',
      toolbar: [
        {
          name: 'bold',
          action: EasyMDE.toggleBold,
          className: 'easymde-bold',
          title: 'Bold (Ctrl-B)',
        },
        {
          name: 'italic',
          action: EasyMDE.toggleItalic,
          className: 'easymde-italic',
          title: 'Italic (Ctrl-I)',
        },
        {
          name: 'heading',
          action: EasyMDE.toggleHeadingSmaller,
          className: 'easymde-heading',
          title: 'Heading (Ctrl-H)',
        },
        {
          name: 'strikethrough',
          action: EasyMDE.toggleStrikethrough,
          className: 'easymde-strikethrough',
          title: 'Strikethrough',
        },
        '|',
        {
          name: 'quote',
          action: EasyMDE.toggleBlockquote,
          className: 'easymde-quote',
          title: 'Quote',
        },
        {
          name: 'unordered-list',
          action: EasyMDE.toggleUnorderedList,
          className: 'easymde-ul',
          title: 'Bullet List',
        },
        {
          name: 'ordered-list',
          action: EasyMDE.toggleOrderedList,
          className: 'easymde-ol',
          title: 'Numbered List',
        },
        {
          name: 'checklist',
          action: (editor) => {
            const cm = editor.codemirror;
            const selection = cm.getSelection();
            if (selection) {
              const lines = selection.split('\n');
              const checklistLines = lines.map(line => `- [ ] ${line}`).join('\n');
              cm.replaceSelection(checklistLines);
            } else {
              cm.replaceSelection('- [ ] ');
            }
            cm.focus();
          },
          className: 'easymde-checklist',
          title: 'Task List',
        },
        '|',
        {
          name: 'link',
          action: EasyMDE.drawLink,
          className: 'easymde-link',
          title: 'Insert Link',
        },
        {
          name: 'image',
          action: EasyMDE.drawImage,
          className: 'easymde-image',
          title: 'Insert Image',
        },
        {
          name: 'code',
          action: EasyMDE.toggleCodeBlock,
          className: 'easymde-code',
          title: 'Code Block',
        },
        {
          name: 'table',
          action: EasyMDE.drawTable,
          className: 'easymde-table',
          title: 'Insert Table',
        },
        {
          name: 'horizontal-rule',
          action: EasyMDE.drawHorizontalRule,
          className: 'easymde-hr',
          title: 'Horizontal Rule',
        },
        '|',
        {
          name: 'close',
          action: () => this.close(),
          className: 'easymde-close',
          title: 'Close (Ctrl+S)',
        }
      ],
      shortcuts: {
        togglePreview: null,
        toggleSideBySide: null,
      },
      renderingConfig: {
        codeSyntaxHighlighting: true,
      },
      previewRender: (plainText) => {
        return marked.parse(plainText);
      }
    });

    // Custom close shortcut
    this.currentEditor.codemirror.setOption('extraKeys', {
      'Ctrl-S': () => {
        this.close();
        return false;
      }
    });

    // Auto-save on change with debounce
    this.currentEditor.codemirror.on('change', () => {
      clearTimeout(this.autoSaveTimeout);
      this.autoSaveTimeout = setTimeout(() => {
        this.autoSave();

        // Process wiki-style [[links]] after save
        if (this.currentNode && this.wallboard.linkManager) {
          const content = this.currentEditor.value();
          this.wallboard.linkManager.processNodeLinks(this.currentNode.id, content);
        }
      }, 1000); // Save 1 second after user stops typing
    });

    // Apply theme to EasyMDE
    this.applyThemeToEditor(accent);

    // Force CodeMirror to refresh and enable scrolling
    setTimeout(() => {
      this.currentEditor.codemirror.refresh();

      // Ensure the CodeMirror scroll element has proper event handling
      const cmScroll = this.editorOverlay.querySelector('.CodeMirror-scroll');
      if (cmScroll) {
        cmScroll.addEventListener('wheel', (e) => {
          e.stopPropagation();
        }, { passive: false });
      }

      // Restore scroll position using percentage
      if (savedScrollPercent > 0) {
        const cm = this.currentEditor.codemirror;
        const scrollInfo = cm.getScrollInfo();
        const maxScroll = scrollInfo.height - scrollInfo.clientHeight;
        const targetScrollTop = maxScroll * savedScrollPercent;

        // Scroll to the calculated position
        cm.scrollTo(0, targetScrollTop);

        // Also position the cursor near that location
        const lineHeight = cm.defaultTextHeight() || 20;
        const targetLine = Math.floor(targetScrollTop / lineHeight);
        if (targetLine > 0 && targetLine < cm.lineCount()) {
          cm.setCursor({ line: targetLine, ch: 0 });
        }
      }
    }, 100);
  }

  // Apply QUIRK theme to EasyMDE
  applyThemeToEditor(accent) {
    const style = document.createElement('style');
    style.id = 'easymde-theme';
    style.innerHTML = `
      .editor-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        overflow: hidden;
      }

      .editor-container {
        width: 100%;
        max-width: 1200px;
        height: 90vh;
        background: var(--bg-secondary);
        backdrop-filter: blur(20px);
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--bg-secondary);
        border-bottom: 1px solid var(--border);
        border-radius: 16px 16px 0 0;
        position: relative;
      }

      .editor-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, ${accent}60, transparent);
        opacity: 0.6;
      }

      .editor-title {
        font-size: 14px;
        font-weight: bold;
        color: ${accent};
        letter-spacing: 1px;
      }

      .editor-close-btn {
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
        padding: 5px;
        opacity: 0.7;
        transition: opacity 0.2s;
      }

      .editor-close-btn:hover {
        opacity: 1;
      }

      .editor-container .EasyMDEContainer {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .editor-container .CodeMirror {
        flex: 1;
        background: var(--bg-secondary);
        color: var(--text);
        border: none;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        font-size: 15px;
        line-height: 1.6;
        height: 100% !important;
      }

      .editor-container .CodeMirror-scroll {
        overflow-y: auto !important;
        overflow-x: auto !important;
        height: 100% !important;
        max-height: none !important;
        padding: 20px !important;
      }

      .editor-container .CodeMirror-sizer {
        margin-bottom: 0 !important;
      }

      .editor-container .CodeMirror pre.CodeMirror-line,
      .editor-container .CodeMirror pre.CodeMirror-line-like {
        font-family: inherit;
        font-size: 15px;
        line-height: 1.6;
      }

      /* Code blocks should use monospace */
      .editor-container .cm-comment,
      .editor-container .CodeMirror-code .cm-string {
        font-family: "SF Mono", Monaco, Consolas, monospace;
      }

      .editor-container .CodeMirror-cursor {
        border-left-color: ${accent};
      }

      .editor-container .CodeMirror-selected {
        background: ${accent}30 !important;
      }

      .editor-container .CodeMirror-focused .CodeMirror-selected {
        background: ${accent}40 !important;
      }

      .editor-container .CodeMirror-line::selection,
      .editor-container .CodeMirror-line > span::selection,
      .editor-container .CodeMirror-line > span > span::selection {
        background: ${accent}50 !important;
      }

      .editor-container .CodeMirror-line::-moz-selection,
      .editor-container .CodeMirror-line > span::-moz-selection,
      .editor-container .CodeMirror-line > span > span::-moz-selection {
        background: ${accent}50 !important;
      }

      .editor-container .editor-toolbar {
        background: var(--bg-secondary);
        border: none;
        border-bottom: 1px solid ${accent}40;
        opacity: 1;
        padding: 8px;
      }

      .editor-container .editor-toolbar button {
        background: none;
        border: 1px solid transparent;
        color: #fff !important;
        opacity: 0.7;
        width: 30px;
        height: 30px;
        padding: 0;
        margin: 2px;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.2s;
        position: relative;
      }

      .editor-container .editor-toolbar button:hover {
        background: ${accent}20;
        border-color: ${accent}40;
        opacity: 1;
      }

      .editor-container .editor-toolbar button.active {
        background: ${accent}30;
        border-color: ${accent};
        opacity: 1;
      }

      .editor-container .editor-toolbar i.separator {
        border-left: 1px solid ${accent}40;
        border-right: none;
        margin: 0 6px;
      }

      /* Custom SVG icons for toolbar buttons */
      .editor-container .editor-toolbar button::before {
        content: '';
        display: block;
        width: 16px;
        height: 16px;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        filter: brightness(0) invert(1);
        opacity: 0.9;
      }

      .easymde-bold::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>');
      }

      .easymde-italic::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>');
      }

      .easymde-heading::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M6 4v16M18 4v16M8 4H4M20 4h-4M8 20H4M20 20h-4M9 12h6"/></svg>');
      }

      .easymde-strikethrough::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/></svg>');
      }

      .easymde-quote::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>');
      }

      .easymde-ul::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill="white"/><circle cx="4" cy="12" r="1" fill="white"/><circle cx="4" cy="18" r="1" fill="white"/></svg>');
      }

      .easymde-ol::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 10h1V4L3 5" stroke-linecap="round"/><path d="M3 14v.01M3 18h2l-2-2.5V14h2" stroke-linecap="round"/></svg>');
      }

      .easymde-checklist::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="5" width="6" height="6" rx="1"/><rect x="3" y="13" width="6" height="6" rx="1"/><line x1="13" y1="8" x2="21" y2="8"/><line x1="13" y1="16" x2="21" y2="16"/><polyline points="5 8 6 9 8 7"/></svg>');
      }

      .easymde-link::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>');
      }

      .easymde-image::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>');
      }

      .easymde-code::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>');
      }

      .easymde-table::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg>');
      }

      .easymde-hr::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="6" x2="8" y2="6"/><line x1="16" y1="6" x2="20" y2="6"/><line x1="4" y1="18" x2="8" y2="18"/><line x1="16" y1="18" x2="20" y2="18"/></svg>');
      }

      .easymde-close::before {
        background-image: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>');
      }
    `;
    document.head.appendChild(style);
  }

  // Auto-save current content
  autoSave() {
    if (this.currentEditor && this.currentNode) {
      const content = this.currentEditor.value();
      const contentKey = this.currentSide === 'result' ? 'resultContent' : 'content';
      const htmlKey = this.currentSide === 'result' ? 'resultHtml' : 'html';

      // Update node content
      this.currentNode.data[contentKey] = content;

      // Render with MarkdownRenderer to support math formulas
      this.currentNode.data[htmlKey] = typeof MarkdownRenderer !== 'undefined'
        ? MarkdownRenderer.render(content)
        : marked.parse(content);

      // Update the node's display
      const nodeContent = this.wallboard.getContentElement(this.currentNode.id, this.currentSide);
      if (nodeContent) {
        nodeContent.innerHTML = Sanitization.sanitize(this.wallboard.renderNodeContent(this.currentNode, this.currentSide));

        // Re-enable checkboxes and re-highlight code blocks
        setTimeout(() => {
          this.wallboard.enableCheckboxes(nodeContent, this.currentNode);

          const codeBlocks = nodeContent.querySelectorAll('pre code');
          codeBlocks.forEach(block => {
            Prism.highlightElement(block);
          });
        }, 0);
      }

      // Save changes
      this.wallboard.autoSave();
    }
  }

  // Close editor
  close() {
    // Clear any pending autosave
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
      this.autoSaveTimeout = null;
    }

    // Final save before closing
    this.autoSave();

    // Process wiki-style [[links]] immediately when closing editor
    if (this.currentNode && this.wallboard.linkManager && this.currentEditor) {
      const content = this.currentEditor.value();
      this.wallboard.linkManager.processNodeLinks(this.currentNode.id, content, true);
    }

    if (this.currentEditor) {
      this.currentEditor.toTextArea();
      this.currentEditor = null;
    }

    if (this.editorOverlay) {
      this.editorOverlay.remove();
      this.editorOverlay = null;
    }

    // Restore body scroll
    document.body.style.overflow = '';

    // Remove theme style
    const themeStyle = document.getElementById('easymde-theme');
    if (themeStyle) {
      themeStyle.remove();
    }

    this.currentNode = null;
  }
}
