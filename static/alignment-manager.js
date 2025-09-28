class AlignmentManager {
  constructor(wallboardInstance) {
    this.wallboard = wallboardInstance;
  }

  // Alignment operations
  alignLeft(nodeIds) {
    if (nodeIds.length < 2) return;

    const nodeWidth = 300; // Approximate node width
    const nodes = nodeIds.map(id => this.wallboard.nodes.find(n => n.id === id)).filter(Boolean);

    // Find the leftmost edge (position.x of leftmost node)
    const leftmostX = Math.min(...nodes.map(node => node.position.x));

    nodes.forEach(node => {
      node.position.x = leftmostX;
      this.updateNodePosition(node);
    });

    // Force connection update immediately after alignment
    this.wallboard.connectionManager.updateConnections();

    // Also call wallboard's updateConnections if it exists
    if (this.wallboard.updateConnections) {
      this.wallboard.updateConnections();
    }

    this.wallboard.autoSave();
  }

  alignRight(nodeIds) {
    if (nodeIds.length < 2) return;

    const nodes = nodeIds.map(id => this.wallboard.nodes.find(n => n.id === id)).filter(Boolean);

    // Find the rightmost edge using actual node widths
    let rightmostX = 0;
    nodes.forEach(node => {
      const nodeEl = document.getElementById(`node-${node.id}`);
      if (nodeEl) {
        const rect = nodeEl.getBoundingClientRect();
        const canvas = document.getElementById('canvas');
        const transform = new DOMMatrix(getComputedStyle(canvas).transform);
        const nodeWidth = rect.width / transform.a;
        const nodeRightEdge = node.position.x + nodeWidth;
        rightmostX = Math.max(rightmostX, nodeRightEdge);
      }
    });

    nodes.forEach(node => {
      const nodeEl = document.getElementById(`node-${node.id}`);
      if (nodeEl) {
        const rect = nodeEl.getBoundingClientRect();
        const canvas = document.getElementById('canvas');
        const transform = new DOMMatrix(getComputedStyle(canvas).transform);
        const nodeWidth = rect.width / transform.a;
        // Set position so the right edge aligns to rightmostX
        node.position.x = rightmostX - nodeWidth;
        this.updateNodePosition(node);
      }
    });

    // Force connection update immediately after alignment
    this.wallboard.connectionManager.updateConnections();

    // Also call wallboard's updateConnections if it exists
    if (this.wallboard.updateConnections) {
      this.wallboard.updateConnections();
    }

    this.wallboard.autoSave();
  }

  alignTop(nodeIds) {
    if (nodeIds.length < 2) return;

    const nodeHeight = 200; // Approximate node height
    const nodes = nodeIds.map(id => this.wallboard.nodes.find(n => n.id === id)).filter(Boolean);

    // Find the topmost edge (position.y of topmost node)
    const topmostY = Math.min(...nodes.map(node => node.position.y));

    nodes.forEach(node => {
      node.position.y = topmostY;
      this.updateNodePosition(node);
    });

    // Force connection update immediately after alignment
    this.wallboard.connectionManager.updateConnections();

    // Also call wallboard's updateConnections if it exists
    if (this.wallboard.updateConnections) {
      this.wallboard.updateConnections();
    }

    this.wallboard.autoSave();
  }

  alignBottom(nodeIds) {
    if (nodeIds.length < 2) return;

    const nodes = nodeIds.map(id => this.wallboard.nodes.find(n => n.id === id)).filter(Boolean);

    // Find the bottommost edge using actual node heights
    let bottommostY = 0;
    nodes.forEach(node => {
      const nodeEl = document.getElementById(`node-${node.id}`);
      if (nodeEl) {
        const rect = nodeEl.getBoundingClientRect();
        const canvas = document.getElementById('canvas');
        const transform = new DOMMatrix(getComputedStyle(canvas).transform);
        const nodeHeight = rect.height / transform.d;
        const nodeBottomEdge = node.position.y + nodeHeight;
        bottommostY = Math.max(bottommostY, nodeBottomEdge);
      }
    });

    nodes.forEach(node => {
      const nodeEl = document.getElementById(`node-${node.id}`);
      if (nodeEl) {
        const rect = nodeEl.getBoundingClientRect();
        const canvas = document.getElementById('canvas');
        const transform = new DOMMatrix(getComputedStyle(canvas).transform);
        const nodeHeight = rect.height / transform.d;
        // Set position so the bottom edge aligns to bottommostY
        node.position.y = bottommostY - nodeHeight;
        this.updateNodePosition(node);
      }
    });

    // Force connection update immediately after alignment
    this.wallboard.connectionManager.updateConnections();

    // Also call wallboard's updateConnections if it exists
    if (this.wallboard.updateConnections) {
      this.wallboard.updateConnections();
    }

    this.wallboard.autoSave();
  }

  alignCenterHorizontal(nodeIds) {
    if (nodeIds.length < 2) return;

    const nodes = nodeIds.map(id => this.wallboard.nodes.find(n => n.id === id)).filter(Boolean);

    // Use the first selected node as the reference
    const referenceNode = nodes[0];
    const referenceNodeEl = document.getElementById(`node-${referenceNode.id}`);
    if (!referenceNodeEl) return;

    const referenceRect = referenceNodeEl.getBoundingClientRect();
    const canvas = document.getElementById('canvas');
    const transform = new DOMMatrix(getComputedStyle(canvas).transform);
    const referenceNodeHeight = referenceRect.height / transform.d;
    const referenceCenterY = referenceNode.position.y + referenceNodeHeight / 2;

    nodes.forEach(node => {
      const nodeEl = document.getElementById(`node-${node.id}`);
      if (nodeEl) {
        const rect = nodeEl.getBoundingClientRect();
        const nodeHeight = rect.height / transform.d;
        // Set position so the center aligns to reference node's center
        node.position.y = referenceCenterY - nodeHeight / 2;
        this.updateNodePosition(node);
      }
    });

    // Force connection update immediately after alignment
    this.wallboard.connectionManager.updateConnections();

    // Also call wallboard's updateConnections if it exists
    if (this.wallboard.updateConnections) {
      this.wallboard.updateConnections();
    }

    this.wallboard.autoSave();
  }

  alignCenterVertical(nodeIds) {
    if (nodeIds.length < 2) return;

    const nodes = nodeIds.map(id => this.wallboard.nodes.find(n => n.id === id)).filter(Boolean);

    // Use the first selected node as the reference
    const referenceNode = nodes[0];
    const referenceNodeEl = document.getElementById(`node-${referenceNode.id}`);
    if (!referenceNodeEl) return;

    const referenceRect = referenceNodeEl.getBoundingClientRect();
    const canvas = document.getElementById('canvas');
    const transform = new DOMMatrix(getComputedStyle(canvas).transform);
    const referenceNodeWidth = referenceRect.width / transform.a;
    const referenceCenterX = referenceNode.position.x + referenceNodeWidth / 2;

    nodes.forEach(node => {
      const nodeEl = document.getElementById(`node-${node.id}`);
      if (nodeEl) {
        const rect = nodeEl.getBoundingClientRect();
        const nodeWidth = rect.width / transform.a;
        // Set position so the center aligns to reference node's center
        node.position.x = referenceCenterX - nodeWidth / 2;
        this.updateNodePosition(node);
      }
    });

    // Force connection update immediately after alignment
    this.wallboard.connectionManager.updateConnections();

    // Also call wallboard's updateConnections if it exists
    if (this.wallboard.updateConnections) {
      this.wallboard.updateConnections();
    }

    this.wallboard.autoSave();
  }

  // Distribution operations
  distributeHorizontally(nodeIds) {
    if (nodeIds.length < 3) return;

    const nodes = nodeIds.map(id => this.wallboard.nodes.find(n => n.id === id)).filter(Boolean);
    nodes.sort((a, b) => a.position.x - b.position.x);

    const leftmost = nodes[0].position.x;
    const rightmost = nodes[nodes.length - 1].position.x;
    const spacing = (rightmost - leftmost) / (nodes.length - 1);

    nodes.forEach((node, index) => {
      node.position.x = leftmost + (spacing * index);
      this.updateNodePosition(node);
    });

    // Force connection update immediately after alignment
    this.wallboard.connectionManager.updateConnections();

    // Also call wallboard's updateConnections if it exists
    if (this.wallboard.updateConnections) {
      this.wallboard.updateConnections();
    }

    this.wallboard.autoSave();
  }

  distributeVertically(nodeIds) {
    if (nodeIds.length < 3) return;

    const nodes = nodeIds.map(id => this.wallboard.nodes.find(n => n.id === id)).filter(Boolean);
    nodes.sort((a, b) => a.position.y - b.position.y);

    const topmost = nodes[0].position.y;
    const bottommost = nodes[nodes.length - 1].position.y;
    const spacing = (bottommost - topmost) / (nodes.length - 1);

    nodes.forEach((node, index) => {
      node.position.y = topmost + (spacing * index);
      this.updateNodePosition(node);
    });

    // Force connection update immediately after alignment
    this.wallboard.connectionManager.updateConnections();

    // Also call wallboard's updateConnections if it exists
    if (this.wallboard.updateConnections) {
      this.wallboard.updateConnections();
    }

    this.wallboard.autoSave();
  }

  // Spacing operations
  spaceEvenlyHorizontal(nodeIds) {
    if (nodeIds.length < 3) return;

    const nodes = nodeIds.map(id => this.wallboard.nodes.find(n => n.id === id)).filter(Boolean);
    nodes.sort((a, b) => a.position.x - b.position.x);

    const standardNodeWidth = 300; // Approximate node width
    const leftmost = nodes[0].position.x;
    const rightmost = nodes[nodes.length - 1].position.x;
    const totalSpace = rightmost - leftmost;
    const totalNodeSpace = (nodes.length - 2) * standardNodeWidth; // Middle nodes
    const availableSpace = totalSpace - totalNodeSpace;
    const spacing = availableSpace / (nodes.length - 1);

    for (let i = 1; i < nodes.length - 1; i++) {
      nodes[i].position.x = leftmost + (spacing + standardNodeWidth) * i;
      this.updateNodePosition(nodes[i]);
    }

    // Force connection update immediately after alignment
    this.wallboard.connectionManager.updateConnections();

    // Also call wallboard's updateConnections if it exists
    if (this.wallboard.updateConnections) {
      this.wallboard.updateConnections();
    }

    this.wallboard.autoSave();
  }

  spaceEvenlyVertical(nodeIds) {
    if (nodeIds.length < 3) return;

    const nodes = nodeIds.map(id => this.wallboard.nodes.find(n => n.id === id)).filter(Boolean);
    nodes.sort((a, b) => a.position.y - b.position.y);

    const standardNodeHeight = 200; // Approximate node height
    const topmost = nodes[0].position.y;
    const bottommost = nodes[nodes.length - 1].position.y;
    const totalSpace = bottommost - topmost;
    const totalNodeSpace = (nodes.length - 2) * standardNodeHeight; // Middle nodes
    const availableSpace = totalSpace - totalNodeSpace;
    const spacing = availableSpace / (nodes.length - 1);

    for (let i = 1; i < nodes.length - 1; i++) {
      nodes[i].position.y = topmost + (spacing + standardNodeHeight) * i;
      this.updateNodePosition(nodes[i]);
    }

    // Force connection update immediately after alignment
    this.wallboard.connectionManager.updateConnections();

    // Also call wallboard's updateConnections if it exists
    if (this.wallboard.updateConnections) {
      this.wallboard.updateConnections();
    }

    this.wallboard.autoSave();
  }

  // Helper method to update node position in DOM
  updateNodePosition(node) {
    const nodeEl = document.getElementById(`node-${node.id}`);
    if (nodeEl) {
      nodeEl.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;
    }
  }

  // Show alignment context menu
  showAlignmentMenu(e, nodeIds) {
    this.hideAlignmentMenu(); // Close any existing menu

    const menu = document.createElement('div');
    menu.className = 'alignment-menu';
    menu.id = 'alignmentMenu';

    const nodeCount = nodeIds.length;

    menu.innerHTML = `
      <div class="alignment-menu-header">
        <h3>Align ${nodeCount} Nodes</h3>
        <button class="close-btn" onclick="alignmentManager.hideAlignmentMenu()">×</button>
      </div>

      <div class="alignment-section">
        <div class="alignment-label">Align</div>
        <div class="alignment-buttons">
          <button class="alignment-btn" onclick="alignmentManager.alignLeft([${nodeIds.join(',')}])" title="Align Left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="15" y2="12"></line>
              <line x1="3" y1="18" x2="18" y2="18"></line>
            </svg>
            Left
          </button>

          <button class="alignment-btn" onclick="alignmentManager.alignCenterVertical([${nodeIds.join(',')}])" title="Align Center Vertical">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="2" x2="12" y2="22"></line>
              <line x1="8" y1="6" x2="16" y2="6"></line>
              <line x1="6" y1="12" x2="18" y2="12"></line>
              <line x1="8" y1="18" x2="16" y2="18"></line>
            </svg>
            Center V
          </button>

          <button class="alignment-btn" onclick="alignmentManager.alignRight([${nodeIds.join(',')}])" title="Align Right">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="9" y1="12" x2="21" y2="12"></line>
              <line x1="6" y1="18" x2="21" y2="18"></line>
            </svg>
            Right
          </button>
        </div>

        <div class="alignment-buttons">
          <button class="alignment-btn" onclick="alignmentManager.alignTop([${nodeIds.join(',')}])" title="Align Top">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="6" y1="3" x2="6" y2="21"></line>
              <line x1="12" y1="3" x2="12" y2="15"></line>
              <line x1="18" y1="3" x2="18" y2="18"></line>
            </svg>
            Top
          </button>

          <button class="alignment-btn" onclick="alignmentManager.alignCenterHorizontal([${nodeIds.join(',')}])" title="Align Center Horizontal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <line x1="6" y1="8" x2="6" y2="16"></line>
              <line x1="12" y1="6" x2="12" y2="18"></line>
              <line x1="18" y1="8" x2="18" y2="16"></line>
            </svg>
            Center H
          </button>

          <button class="alignment-btn" onclick="alignmentManager.alignBottom([${nodeIds.join(',')}])" title="Align Bottom">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="6" y1="3" x2="6" y2="21"></line>
              <line x1="12" y1="9" x2="12" y2="21"></line>
              <line x1="18" y1="6" x2="18" y2="21"></line>
            </svg>
            Bottom
          </button>
        </div>
      </div>

      ${nodeCount >= 3 ? `
      <div class="alignment-section">
        <div class="alignment-label">Distribute</div>
        <div class="alignment-buttons">
          <button class="alignment-btn" onclick="alignmentManager.distributeHorizontally([${nodeIds.join(',')}])" title="Distribute Horizontally">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="7" width="3" height="10"></rect>
              <rect x="10.5" y="7" width="3" height="10"></rect>
              <rect x="18" y="7" width="3" height="10"></rect>
              <line x1="2" y1="4" x2="22" y2="4"></line>
              <line x1="2" y1="20" x2="22" y2="20"></line>
            </svg>
            Horizontal
          </button>

          <button class="alignment-btn" onclick="alignmentManager.distributeVertically([${nodeIds.join(',')}])" title="Distribute Vertically">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="7" y="3" width="10" height="3"></rect>
              <rect x="7" y="10.5" width="10" height="3"></rect>
              <rect x="7" y="18" width="10" height="3"></rect>
              <line x1="4" y1="2" x2="4" y2="22"></line>
              <line x1="20" y1="2" x2="20" y2="22"></line>
            </svg>
            Vertical
          </button>
        </div>
      </div>

      <div class="alignment-section">
        <div class="alignment-label">Space Evenly</div>
        <div class="alignment-buttons">
          <button class="alignment-btn" onclick="alignmentManager.spaceEvenlyHorizontal([${nodeIds.join(',')}])" title="Space Evenly Horizontal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="4" height="10"></rect>
              <rect x="10" y="7" width="4" height="10"></rect>
              <rect x="18" y="7" width="4" height="10"></rect>
              <line x1="7" y1="12" x2="9" y2="12"></line>
              <line x1="15" y1="12" x2="17" y2="12"></line>
            </svg>
            Horizontal
          </button>

          <button class="alignment-btn" onclick="alignmentManager.spaceEvenlyVertical([${nodeIds.join(',')}])" title="Space Evenly Vertical">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="7" y="2" width="10" height="4"></rect>
              <rect x="7" y="10" width="10" height="4"></rect>
              <rect x="7" y="18" width="10" height="4"></rect>
              <line x1="12" y1="7" x2="12" y2="9"></line>
              <line x1="12" y1="15" x2="12" y2="17"></line>
            </svg>
            Vertical
          </button>
        </div>
      </div>
      ` : ''}
    `;

    // Position the menu
    menu.style.left = Math.min(e.clientX, window.innerWidth - 300) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - 400) + 'px';

    document.body.appendChild(menu);

    // Add click outside to close
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick.bind(this));
    }, 10);
  }

  hideAlignmentMenu() {
    const menu = document.getElementById('alignmentMenu');
    if (menu) {
      menu.remove();
      document.removeEventListener('click', this.handleOutsideClick.bind(this));
    }
  }

  handleOutsideClick(e) {
    if (!e.target.closest('.alignment-menu')) {
      this.hideAlignmentMenu();
    }
  }

}