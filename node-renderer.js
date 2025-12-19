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
    const typeMeta = NodeRenderer.getNodeTypeMeta(node, wallboard);

    header.innerHTML = `
                    <div class="node-type-and-actions-container">
                    <div class="node-type" id="type-${node.id}" data-node-type="${typeMeta.type}">
                        <span class="node-type-icon" aria-hidden="true">${typeMeta.icon}</span>
                        <span class="node-type-label">${typeMeta.label}</span>
                    </div>
                    <div class="node-actions">
                        <button class="node-btn" onclick="wallboard.maximizeNode(${node.id
      })" title="Maximize">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"></path>
                            </svg>
                        </button>
                        <button class="node-btn" onclick="wallboard.showThemeSelector(${node.id
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
                        <button class="node-btn" onclick="wallboard.openInEditor(${node.id
      })" title="Edit">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="node-btn" onclick="wallboard.removeNode(${node.id
      })">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                  </div>
                `;

    // Add double-click event listener to the node type
    const nodeTypeElement = header.querySelector('.node-type');
    nodeTypeElement.title = wallboard.getNodeTitle(node);
    requestAnimationFrame(() => NodeRenderer.fitNodeTitleElement(nodeTypeElement));
    nodeTypeElement.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // In zoomed-out view, enable inline editing
      if (wallboard.zoom <= 0.3) {
        const currentTitle = wallboard.getNodeTitle(node);

        // Store original dimensions
        const currentWidth = nodeEl.offsetWidth;
        const currentHeight = nodeEl.offsetHeight;

        // Create inline editor
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = 'node-type-inline-editor';
        input.style.width = '100%';
        input.style.fontSize = getComputedStyle(nodeTypeElement).fontSize;
        input.style.fontFamily = getComputedStyle(nodeTypeElement).fontFamily;
        input.style.textAlign = 'center';
        input.style.background = 'transparent';

        // Get the actual computed color from the node type element (which has the node's theme applied)
        const computedColor = getComputedStyle(nodeTypeElement).color;
        input.style.border = 'none';
        input.style.color = computedColor;

        input.style.padding = '8px';
        input.style.borderRadius = '8px';
        input.style.outline = 'none';

        // Lock node dimensions during editing
        nodeEl.style.width = currentWidth + 'px';
        nodeEl.style.height = currentHeight + 'px';
        nodeEl.style.minWidth = currentWidth + 'px';
        nodeEl.style.minHeight = currentHeight + 'px';

        // Replace text with input
        nodeTypeElement.style.display = 'none';
        header.appendChild(input);
        input.focus();
        input.select();

        let isFinishing = false;
        const finishEditing = () => {
          if (isFinishing) return;
          isFinishing = true;

          const newTitle = input.value.trim() || 'Untitled';

          // Update the node title FIRST before updating references
          node.title = newTitle;
          node.type = newTitle; // Keep for backwards compatibility
          NodeRenderer.setNodeTypeLabel(nodeTypeElement, newTitle);
          nodeTypeElement.style.display = '';
          input.remove();

          // Unlock node dimensions
          nodeEl.style.width = '';
          nodeEl.style.height = '';
          nodeEl.style.minWidth = '';
          nodeEl.style.minHeight = '';

          // Only update references if title actually changed
          if (newTitle !== currentTitle) {
            // Update all [[link]] references in other nodes
            if (wallboard.linkManager) {
              wallboard.linkManager.updateAllReferencesToNode(node.id, currentTitle, newTitle);
            }
          }

          wallboard.saveState();

          // Remove document click handler
          document.removeEventListener('mousedown', outsideClickHandler);
        };

        const cancelEditing = () => {
          if (isFinishing) return;
          isFinishing = true;

          nodeTypeElement.style.display = '';
          input.remove();
          // Unlock node dimensions
          nodeEl.style.width = '';
          nodeEl.style.height = '';
          nodeEl.style.minWidth = '';
          nodeEl.style.minHeight = '';

          // Remove document click handler
          document.removeEventListener('mousedown', outsideClickHandler);
        };

        // Handle clicks outside the input
        const outsideClickHandler = (event) => {
          if (!input.contains(event.target) && event.target !== input) {
            finishEditing();
          }
        };

        // Add document click handler with a small delay to avoid immediate trigger
        setTimeout(() => {
          document.addEventListener('mousedown', outsideClickHandler);
        }, 100);

        input.addEventListener('blur', () => {
          // Small delay to ensure blur happens properly
          setTimeout(finishEditing, 10);
        });
        input.addEventListener('keydown', (ke) => {
          if (ke.key === 'Enter') {
            finishEditing();
          } else if (ke.key === 'Escape') {
            cancelEditing();
          }
        });
      } else {
        // Normal behavior for non-zoomed-out view
        wallboard.editNodeType(node.id);
      }
    });

    // Add double-click to header to exit edit mode
    header.addEventListener('dblclick', (e) => {
      // Don't trigger if clicking on node type (it has its own handler)
      if (e.target.closest('.node-type') || e.target.closest('.node-actions')) {
        return;
      }

      const content = wallboard.getActiveContentElement(node.id);
      const isEditing = content.querySelector('.text-editor');
      if (isEditing) {
        e.preventDefault();
        e.stopPropagation();
        wallboard.toggleEdit(node.id);
      }
    });

    nodeEl.appendChild(header);

    // Node content (front) and result (back)
    const cardShell = document.createElement('div');
    cardShell.className = 'node-card-shell';
    const cardInner = document.createElement('div');
    cardInner.className = 'node-card-inner';

    const frontFace = document.createElement('div');
    frontFace.className = 'node-card-face node-card-front';

    const content = document.createElement("div");
    content.className = "node-content";
    content.id = `content-${node.id}`;

    if (node.data && node.data.content !== undefined) {
      // Render node content (uses stored HTML or plain text) with XSS protection
      content.innerHTML = Sanitization.sanitize(wallboard.renderNodeContent(node));
      wallboard.htmlPreviewManager?.hydrate(content, node, 'content');

      // Enable checkboxes and apply syntax highlighting to initial render
      setTimeout(() => {
        wallboard.enableCheckboxes(content, node);

        const codeBlocks = content.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
          Prism.highlightElement(block);
        });
      }, 0);
    }

    frontFace.appendChild(content);

    const backFace = document.createElement('div');
    backFace.className = 'node-card-face node-card-back';

    const resultContent = document.createElement('div');
    resultContent.className = 'node-content node-result-content';
    resultContent.id = `result-content-${node.id}`;

    if (node.data && node.data.resultContent !== undefined) {
      resultContent.innerHTML = Sanitization.sanitize(wallboard.renderNodeContent(node, 'result'));
      wallboard.htmlPreviewManager?.hydrate(resultContent, node, 'result');
      setTimeout(() => {
        wallboard.enableCheckboxes(resultContent, node);
        const codeBlocks = resultContent.querySelectorAll('pre code');
        codeBlocks.forEach(block => Prism.highlightElement(block));
      }, 0);
    }

    backFace.appendChild(resultContent);

    cardInner.appendChild(frontFace);
    cardInner.appendChild(backFace);
    cardShell.appendChild(cardInner);
    nodeEl.appendChild(cardShell);

    // Make draggable - header for regular drag
    // When zoomed out to 30%, split header: left 50% for dragging, right 50% for connections
    let headerDragStartPos = null;
    let headerDragStarted = false;

    header.addEventListener("mousedown", (e) => {
      // Don't interfere with buttons or node type
      if (e.target.closest('.node-btn') || e.target.closest('.node-actions')) return;

      // When zoomed out, check which side was clicked (based on entire node width)
      if (wallboard.zoom <= 0.3) {
        const nodeRect = nodeEl.getBoundingClientRect();
        const clickX = e.clientX - nodeRect.left;
        const nodeWidth = nodeRect.width;

        // Right 50% of entire node - start connection drag
        if (clickX > nodeWidth / 2) {
          headerDragStartPos = { x: e.clientX, y: e.clientY };
          headerDragStarted = false;
          e.preventDefault();
          return;
        }
      }

      // Left 50% (or not zoomed out) - normal node dragging
      wallboard.handleNodeDragStart(e, node, nodeEl);
    });

    header.addEventListener("mousemove", (e) => {
      if (!headerDragStartPos) return;

      const distance = Math.sqrt(
        Math.pow(e.clientX - headerDragStartPos.x, 2) +
        Math.pow(e.clientY - headerDragStartPos.y, 2)
      );

      if (distance > 10 && !headerDragStarted) {
        headerDragStarted = true;
        wallboard.handleConnectionDragStart(headerDragStartPos, node);
      }
    });

    header.addEventListener("mouseup", () => {
      headerDragStartPos = null;
      headerDragStarted = false;
    });

    // Update cursor based on position when zoomed out - for entire node
    const updateCursor = (e) => {
      if (wallboard.zoom <= 0.3) {
        const nodeRect = nodeEl.getBoundingClientRect();
        const mouseX = e.clientX - nodeRect.left;
        const nodeWidth = nodeRect.width;

        // Right 50% of entire node - crosshair cursor for connections
        if (mouseX > nodeWidth / 2) {
          nodeEl.style.setProperty('cursor', 'crosshair', 'important');
          header.style.setProperty('cursor', 'crosshair', 'important');
          nodeTypeElement.style.setProperty('cursor', 'crosshair', 'important');
        } else {
          // Left 50% of entire node - move cursor for dragging
          nodeEl.style.setProperty('cursor', 'move', 'important');
          header.style.setProperty('cursor', 'move', 'important');
          nodeTypeElement.style.setProperty('cursor', 'move', 'important');
        }
      } else {
        // Reset cursor when not zoomed out
        nodeEl.style.cursor = '';
        header.style.cursor = '';
        nodeTypeElement.style.cursor = '';
      }
    };

    nodeEl.addEventListener("mousemove", (e) => {
      updateCursor(e);
    });

    header.addEventListener("mousemove", (e) => {
      updateCursor(e);
    });

    // Touch support for header dragging
    header.addEventListener("touchstart", (e) => {
      if (e.target.closest('.node-btn') || e.target.closest('.node-actions')) return;

      if (e.touches.length === 1) {
        const touch = e.touches[0];

        // When zoomed out, check which side was touched (based on entire node width)
        if (wallboard.zoom <= 0.3) {
          const nodeRect = nodeEl.getBoundingClientRect();
          const touchX = touch.clientX - nodeRect.left;
          const nodeWidth = nodeRect.width;

          // Right 50% of entire node - start connection drag
          if (touchX > nodeWidth / 2) {
            headerDragStartPos = { x: touch.clientX, y: touch.clientY };
            headerDragStarted = false;
            e.preventDefault();
            return;
          }
        }

        // Left 50% (or not zoomed out) - normal node dragging
        e.preventDefault();
        wallboard.handleNodeDragStart({
          clientX: touch.clientX,
          clientY: touch.clientY,
          preventDefault: () => { },
          target: e.target
        }, node, nodeEl);
      }
    }, { passive: false });

    header.addEventListener("touchmove", (e) => {
      if (!headerDragStartPos || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const distance = Math.sqrt(
        Math.pow(touch.clientX - headerDragStartPos.x, 2) +
        Math.pow(touch.clientY - headerDragStartPos.y, 2)
      );

      if (distance > 10 && !headerDragStarted) {
        headerDragStarted = true;
        wallboard.handleConnectionDragStart(headerDragStartPos, node);
      }
    }, { passive: false });

    header.addEventListener("touchend", () => {
      headerDragStartPos = null;
      headerDragStarted = false;
    });

    // Add connection dragging to the entire node content
    const attachContentDragHandlers = (target) => {
      let dragStartPos = null;
      let isDragStarted = false;

      target.addEventListener("mousedown", (e) => {
        if (e.target.closest('.node-btn') || e.target.closest('textarea') || e.target.closest('button')) return;

        dragStartPos = { x: e.clientX, y: e.clientY };
        isDragStarted = false;
        e.preventDefault();
      });

      target.addEventListener("mousemove", (e) => {
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

      target.addEventListener("mouseup", () => {
        dragStartPos = null;
        isDragStarted = false;
      });

      // Touch support for connection dragging
      target.addEventListener("touchstart", (e) => {
        if (e.target.closest('.node-btn') || e.target.closest('textarea') || e.target.closest('button')) return;
        if (e.touches.length === 1) {
          const touch = e.touches[0];
          dragStartPos = { x: touch.clientX, y: touch.clientY };
          isDragStarted = false;
          e.preventDefault();
        }
      }, { passive: false });

      target.addEventListener("touchmove", (e) => {
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

      target.addEventListener("touchend", () => {
        dragStartPos = null;
        isDragStarted = false;
      });
    };

    attachContentDragHandlers(content);
    attachContentDragHandlers(resultContent);

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
    wallboard.updateNodeSizeFromElement(node.id, nodeEl);
    wallboard.setNodeSide(node.id, node.data?.showingResult ? 'result' : 'content');
    if (wallboard.executionManager) {
      const state = wallboard.executionManager.executionState?.[node.id] || {};
      wallboard.executionManager.updateStatusBadge(node.id, state.status || 'idle', state);
    }

    // Apply theme to the newly created node
    wallboard.applyNodeTheme(node.id);
  }

  // Map node types to icons + labels
  static getNodeTypeMeta(node, wallboard) {
    const type = (node?.data?.nodeType || node?.title || '').toLowerCase();
    const label = (wallboard?.getNodeTitle(node) || 'Node').toUpperCase();

    const icons = {
      markdown: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="5" y="3" width="14" height="18" rx="2"/>
          <path d="M9 7h6M9 11h6M9 15h3"/>
        </svg>`,
      instruction: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>
        </svg>`,
      instruct: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>
        </svg>`,
      script: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="7 8 3 12 7 16"/><polyline points="17 8 21 12 17 16"/><line x1="10" y1="19" x2="14" y2="5"/>
        </svg>`,
      'html-preview': `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="16" rx="2" ry="2"/>
          <path d="M7 8h10M7 12h6M7 16h4"/>
        </svg>`,
      save: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 3h14l2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
          <path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>
        </svg>`,
      system: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 3h14l2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
          <path d="M12 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
          <path d="M12 8v2M8 12h2m4 0h2m-4 4v2"/>
        </svg>`,
      image: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="5" width="18" height="14" rx="2"/>
          <circle cx="8.5" cy="10" r="1.5"/>
          <path d="M21 15l-5-5-11 11"/>
        </svg>`,
      default: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>
        </svg>`
    };

    // Heuristic matches for "save file" style names
    const normalized = type.replace(/[\s_-]+/g, ' ');
    const icon =
      icons[type] ||
      (normalized.includes('save') && icons.save) ||
      icons.default;

    return { type, label, icon };
  }

  static setNodeTypeLabel(nodeTypeElement, text) {
    if (!nodeTypeElement) return;
    const labelEl = nodeTypeElement.querySelector('.node-type-label');
    if (labelEl) {
      labelEl.textContent = text.toUpperCase();
    } else {
      nodeTypeElement.textContent = text.toUpperCase();
    }
    NodeRenderer.fitNodeTitleElement(nodeTypeElement);
  }

  /**
   * Fit a node title into its container by shrinking the font (never grows it).
   * Keeps height stable with a minimum font size and single-line ellipsis.
   */
  static fitNodeTitleElement(el, minFontSize = 12) {
    if (!el) return;
    const width = el.clientWidth;
    if (!width) return;

    const computed = getComputedStyle(el);
    const baseSize = parseFloat(computed.fontSize) || 17;
    const isZoomedOut = document.getElementById('canvas')?.classList.contains('zoomed-out');
    const minSize = isZoomedOut ? 36 : minFontSize;
    const tolerance = isZoomedOut ? 20 : 6; // allow more slack when zoomed out
    const maxMultiplier = isZoomedOut ? 2.1 : 1.0; // allow larger base when zoomed out
    const targetBase = isZoomedOut
      ? Math.max(44, Math.min(baseSize * maxMultiplier, 64))
      : baseSize;

    // Reset to base before shrinking
    el.style.fontSize = `${targetBase}px`;

    // Tighten font size until it fits or hits the minimum
    let size = targetBase;
    let guard = 0;
    while (el.scrollWidth - tolerance > el.clientWidth && size > minSize && guard < 30) {
      size -= 1;
      el.style.fontSize = `${size}px`;
      guard++;
    }
  }
}
