// Node rendering component
class NodeRenderer {
  static render(wallboard, node) {
    const nodeEl = document.createElement("div");
    nodeEl.className = "node";
    nodeEl.id = `node-${node.id}`;
    nodeEl.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;

    // Node header
    const header = document.createElement("div");
    header.className = "node-header";
    header.innerHTML = `
                    <div class="node-type" id="type-${node.id}">${wallboard.getNodeTitle(node).toUpperCase()}</div>
                    <div class="node-actions">
                        <button class="node-btn" onclick="wallboard.maximizeNode(${
                          node.id
                        })" title="Maximize">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"></path>
                            </svg>
                        </button>
                        <button class="node-btn" onclick="wallboard.showThemeSelector(${
                          node.id
                        })" title="Change theme">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="5"></circle>
                                <line x1="12" y1="1" x2="12" y2="3"></line>
                                <line x1="12" y1="21" x2="12" y2="23"></line>
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                                <line x1="1" y1="12" x2="3" y2="12"></line>
                                <line x1="21" y1="12" x2="23" y2="12"></line>
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                            </svg>
                        </button>
                        <button class="node-btn" onclick="wallboard.openInEditor(${
                          node.id
                        })" title="Edit">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="node-btn" onclick="wallboard.removeNode(${
                          node.id
                        })">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                `;

    // Add double-click event listener to the node type
    const nodeTypeElement = header.querySelector('.node-type');
    nodeTypeElement.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      wallboard.editNodeType(node.id);
    });

    // Add double-click to header to exit edit mode
    header.addEventListener('dblclick', (e) => {
      // Don't trigger if clicking on node type (it has its own handler)
      if (e.target.closest('.node-type') || e.target.closest('.node-actions')) {
        return;
      }

      const content = document.getElementById(`content-${node.id}`);
      const isEditing = content.querySelector('.text-editor');
      if (isEditing) {
        e.preventDefault();
        e.stopPropagation();
        wallboard.toggleEdit(node.id);
      }
    });

    nodeEl.appendChild(header);

    // Node content
    const content = document.createElement("div");
    content.className = "node-content";
    content.id = `content-${node.id}`;

    if (node.data && node.data.content !== undefined) {
      // Render node content (uses stored HTML or plain text) with XSS protection
      content.innerHTML = Sanitization.sanitize(wallboard.renderNodeContent(node));

      // Enable checkboxes and apply syntax highlighting to initial render
      setTimeout(() => {
        wallboard.enableCheckboxes(content, node);

        const codeBlocks = content.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
          Prism.highlightElement(block);
        });
      }, 0);
    }

    nodeEl.appendChild(content);


    // Make draggable - header for regular drag
    header.addEventListener("mousedown", (e) => {
      wallboard.handleNodeDragStart(e, node, nodeEl);
    });

    // Touch support for header dragging
    header.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        wallboard.handleNodeDragStart({
          clientX: touch.clientX,
          clientY: touch.clientY,
          preventDefault: () => {},
          target: e.target
        }, node, nodeEl);
      }
    }, { passive: false });

    // Add connection dragging to the entire node content
    let dragStartPos = null;
    let isDragStarted = false;

    content.addEventListener("mousedown", (e) => {
      if (e.target.closest('.node-btn') || e.target.closest('textarea') || e.target.closest('button')) return;

      dragStartPos = { x: e.clientX, y: e.clientY };
      isDragStarted = false;
      e.preventDefault();
    });

    content.addEventListener("mousemove", (e) => {
      if (!dragStartPos) return;

      const distance = Math.sqrt(
        Math.pow(e.clientX - dragStartPos.x, 2) +
        Math.pow(e.clientY - dragStartPos.y, 2)
      );

      if (distance > 10 && !isDragStarted) {
        isDragStarted = true;
        wallboard.handleConnectionDragStart(dragStartPos, node);
      }
    });

    content.addEventListener("mouseup", () => {
      dragStartPos = null;
      isDragStarted = false;
    });

    // Touch support for connection dragging
    content.addEventListener("touchstart", (e) => {
      if (e.target.closest('.node-btn') || e.target.closest('textarea') || e.target.closest('button')) return;
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        dragStartPos = { x: touch.clientX, y: touch.clientY };
        isDragStarted = false;
        e.preventDefault();
      }
    }, { passive: false });

    content.addEventListener("touchmove", (e) => {
      if (!dragStartPos || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const distance = Math.sqrt(
        Math.pow(touch.clientX - dragStartPos.x, 2) +
        Math.pow(touch.clientY - dragStartPos.y, 2)
      );

      if (distance > 10 && !isDragStarted) {
        isDragStarted = true;
        wallboard.handleConnectionDragStart(dragStartPos, node);
      }
    }, { passive: false });

    content.addEventListener("touchend", () => {
      dragStartPos = null;
      isDragStarted = false;
    });

    // Selection and double-tap to edit
    let lastTapTime = 0;
    let tapTimer = null;

    const handleNodeClick = (e) => {
      // Don't stop propagation for wiki links - let them bubble to document handler
      if (!e.target.closest('.wiki-link')) {
        e.stopPropagation();
      }

      const now = Date.now();
      const timeSinceLastTap = now - lastTapTime;

      // Double tap to edit on mobile (within 400ms)
      if (window.innerWidth <= 768 && timeSinceLastTap < 400 && timeSinceLastTap > 0) {
        clearTimeout(tapTimer);
        wallboard.toggleEdit(node.id);
        lastTapTime = 0; // Reset
      } else {
        // Single tap - wait a bit to see if there's a second tap
        lastTapTime = now;
        if (tapTimer) clearTimeout(tapTimer);

        // On mobile, delay to detect double tap; on desktop, select immediately
        const delay = window.innerWidth <= 768 ? 250 : 0;

        tapTimer = setTimeout(() => {
          wallboard.selectNode(node, e.shiftKey);

          // Close mobile menus when clicking nodes
          if (window.innerWidth <= 768) {
            document.querySelector('.toolbar')?.classList.remove('mobile-open');
            document.querySelector('.board-menu')?.classList.remove('mobile-open');
          }
        }, delay);
      }
    };

    nodeEl.addEventListener("click", handleNodeClick);
    nodeEl.addEventListener("touchend", handleNodeClick);

    // Context menu
    nodeEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      wallboard.showContextMenu(e, node);
    });

    document.getElementById("canvas").appendChild(nodeEl);

    // Apply theme to the newly created node
    wallboard.applyNodeTheme(node.id);
  }
}
