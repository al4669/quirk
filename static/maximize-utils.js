// Node maximize/fullscreen utilities
class MaximizeUtils {
  static maximizeNode(wallboard, nodeId) {
    const node = wallboard.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Exit edit mode if currently editing
    if (document.querySelector('.text-editor')) {
      wallboard.exitAllEditModes();
    }

    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.className = 'fullscreen-overlay';
    overlay.id = `overlay-${nodeId}`;

    // Create the maximized node content
    const maximizedNode = document.createElement('div');
    maximizedNode.className = 'maximized-node';

    // Apply the node's theme if it has a custom one
    const nodeTheme = wallboard.nodeThemes[nodeId];
    if (nodeTheme && Themes.definitions[nodeTheme]) {
      const theme = Themes.definitions[nodeTheme];
      maximizedNode.style.setProperty('--accent', theme.accent);
      maximizedNode.style.setProperty('--accent-glow', `${theme.accent}40`);
      maximizedNode.style.setProperty('--accent-light', ColorUtils.lightenColor(theme.accent, 20));
      maximizedNode.classList.add('custom-theme');
    }

    // Add header with edit and close buttons
    const header = document.createElement('div');
    header.className = 'maximized-header';
    header.innerHTML = `
      <div class="maximized-title">${wallboard.getNodeTitle(node).toUpperCase()}</div>
      <div class="maximized-actions">
        <button class="maximize-btn" onclick="wallboard.minimizeNode(${nodeId}); wallboard.openInEditor(${nodeId});" title="Edit">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="close-maximize-btn" onclick="wallboard.minimizeNode(${nodeId})" title="Minimize">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 14h6m0 0v6m0-6L4 20M20 10h-6m0 0V4m0 6l6-6"></path>
          </svg>
        </button>
      </div>
    `;

    // Create content area
    const content = document.createElement('div');
    content.className = 'maximized-content';
    content.tabIndex = 0; // Make it focusable for scrolling

    // Copy the node content
    const originalContent = document.getElementById(`content-${nodeId}`);
    if (originalContent) {
      content.innerHTML = originalContent.innerHTML;
    }

    // Assemble the maximized node
    maximizedNode.appendChild(header);
    maximizedNode.appendChild(content);
    overlay.appendChild(maximizedNode);

    // Add to DOM
    document.body.appendChild(overlay);

    // Enable checkboxes for the maximized view
    setTimeout(() => {
      wallboard.enableCheckboxes(content, node);

      // Also highlight code blocks
      const codeBlocks = content.querySelectorAll('pre code');
      codeBlocks.forEach(block => {
        Prism.highlightElement(block);
      });
    }, 0);

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.add('active');
      // Focus the content area after animation starts for better scrolling
      setTimeout(() => {
        content.focus();
      }, 100);
    });

    // Add click listener to close when clicking on overlay background
    const clickListener = (e) => {
      if (e.target === overlay) {
        wallboard.minimizeNode(nodeId);
      }
    };
    overlay.addEventListener('click', clickListener);
    overlay._clickListener = clickListener;

    // Prevent scroll events from being blocked
    overlay.addEventListener('wheel', (e) => {
      e.stopPropagation();
    });

    // Allow scrolling to work properly in the content area
    content.addEventListener('wheel', (e) => {
      e.stopPropagation();
    });

    // Add ESC key listener
    const escListener = (e) => {
      if (e.key === 'Escape') {
        wallboard.minimizeNode(nodeId);
        document.removeEventListener('keydown', escListener);
      }
    };
    document.addEventListener('keydown', escListener);
    overlay._escListener = escListener;
  }

  static minimizeNode(wallboard, nodeId) {
    const overlay = document.getElementById(`overlay-${nodeId}`);
    if (overlay) {
      // Save any changes if in edit mode before closing
      const content = overlay.querySelector('.maximized-content');
      const editor = content.querySelector('.text-editor');
      if (editor) {
        const node = wallboard.nodes.find((n) => n.id === nodeId);
        if (node && node.data && node.data.content !== undefined) {
          node.data.content = editor.value;
          // Update the original node content as well
          const originalContent = document.getElementById(`content-${nodeId}`);
          if (originalContent) {
            originalContent.innerHTML = Sanitization.sanitize(wallboard.renderNodeContent(node));

            // Re-enable checkboxes and re-highlight syntax for original node
            setTimeout(() => {
              wallboard.enableCheckboxes(originalContent, node);

              const codeBlocks = originalContent.querySelectorAll('pre code');
              codeBlocks.forEach(block => {
                Prism.highlightElement(block);
              });
            }, 0);
          }
          wallboard.autoSave();
        }
      }

      // Remove listeners
      if (overlay._escListener) {
        document.removeEventListener('keydown', overlay._escListener);
      }
      if (overlay._clickListener) {
        overlay.removeEventListener('click', overlay._clickListener);
      }

      // Animate out
      overlay.classList.remove('active');
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }
  }

  static toggleMaximizedEdit(wallboard, nodeId) {
    const node = wallboard.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const overlay = document.getElementById(`overlay-${nodeId}`);
    if (!overlay) return;

    const content = overlay.querySelector('.maximized-content');
    if (!content) return;

    // Check if already editing
    const isEditing = content.querySelector('.text-editor');

    if (isEditing) {
      // Save and switch to view mode
      if (node.data && node.data.content !== undefined) {
        node.data.content = isEditing.value;

        // Restore view mode
        content.style.width = "";
        content.style.minWidth = "";
        content.classList.remove('editing');
        content.innerHTML = Sanitization.sanitize(wallboard.renderNodeContent(node));

        // Re-enable checkboxes and re-highlight syntax after DOM update for maximized view
        setTimeout(() => {
          wallboard.enableCheckboxes(content, node);

          const codeBlocks = content.querySelectorAll('pre code');
          codeBlocks.forEach(block => {
            Prism.highlightElement(block);
          });
        }, 0);

        // Update the original node content as well
        const originalContent = document.getElementById(`content-${nodeId}`);
        if (originalContent) {
          originalContent.innerHTML = Sanitization.sanitize(wallboard.renderNodeContent(node));

          // Re-enable checkboxes and re-highlight syntax for original node too
          setTimeout(() => {
            wallboard.enableCheckboxes(originalContent, node);

            const codeBlocks = originalContent.querySelectorAll('pre code');
            codeBlocks.forEach(block => {
              Prism.highlightElement(block);
            });
          }, 0);
        }

        wallboard.autoSave();
      }
    } else {
      // Switch to edit mode
      if (node.data && node.data.content !== undefined) {
        // Capture current content width before switching
        const currentWidth = content.offsetWidth;

        const editor = document.createElement("textarea");
        editor.className = "text-editor maximized-editor";
        editor.value = node.data.content;

        // Preserve the content area width
        content.style.width = currentWidth + "px";
        content.style.minWidth = currentWidth + "px";
        content.classList.add('editing');

        // Set editor height to fill the content area
        const availableHeight = content.offsetHeight - 80; // Account for padding
        editor.style.width = "100%";
        editor.style.height = Math.max(400, availableHeight) + "px";

        content.innerHTML = "";
        content.appendChild(editor);
        editor.focus();

        // Auto-resize height for editor
        editor.addEventListener("input", () => {
          editor.style.height = "auto";
          editor.style.height = Math.max(400, editor.scrollHeight) + "px";
        });
      }
    }
  }
}
