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
          node.data.html = marked.parse(node.data.content);

          // Process wiki-style [[links]] immediately when exiting edit mode
          if (this.wallboard.linkManager) {
            this.wallboard.linkManager.processNodeLinks(node.id, node.data.content, true);
          }
        }

        // Remove editing class from node
        const nodeEl = document.getElementById(`node-${node.id}`);
        if (nodeEl) {
          nodeEl.classList.remove('editing');
        }

        // Clear any width/height constraints and zoom that were set for editing
        content.style.width = "";
        content.style.minWidth = "";
        content.style.maxWidth = "";
        content.style.height = "";
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

        // Auto-arrange nodes after exiting edit, keeping the edited node centered
        setTimeout(() => {
          if (this.wallboard.graphLayoutManager) {
            this.wallboard.graphLayoutManager.autoArrangeExcluding([node.id], true, true);
          }
        }, 150);
      } else {
        // Save scroll position as percentage before entering edit mode
        const scrollableHeightBefore = content.scrollHeight - content.clientHeight;
        const scrollableWidthBefore = content.scrollWidth - content.clientWidth;

        const savedScrollPercentY = scrollableHeightBefore > 0 ? content.scrollTop / scrollableHeightBefore : 0;
        const savedScrollPercentX = scrollableWidthBefore > 0 ? content.scrollLeft / scrollableWidthBefore : 0;

        console.log('Entering edit - scroll percent Y:', savedScrollPercentY, 'scrollTop:', content.scrollTop, 'scrollable:', scrollableHeightBefore);

        // Add editing class to node for higher z-index
        const nodeEl = document.getElementById(`node-${node.id}`);
        if (nodeEl) {
          nodeEl.classList.add('editing');
        }

        // Edit mode - create CodeMirror inline editor
        // Expand to maximum allowed size for user-friendly editing (from app.css: max-width: 400px, max-height: 500px)
        const maxEditWidth = 400;
        const maxEditHeight = 500;

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
        // Set to maximum allowed size for user-friendly editing
        content.style.width = (maxEditWidth * this.wallboard.zoom) + "px";
        content.style.maxWidth = (maxEditWidth * this.wallboard.zoom) + "px";
        content.style.height = (maxEditHeight * this.wallboard.zoom) + "px";
        content.style.maxHeight = (maxEditHeight * this.wallboard.zoom) + "px";

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
            node.data.html = marked.parse(node.data.content);
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
          node.data.html = marked.parse(node.data.content);
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
      // Use stored HTML if available, otherwise render with marked.js
      let htmlContent = node.data.html || marked.parse(node.data.content);

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
}
