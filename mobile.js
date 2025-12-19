// Mobile-optimized interface for QUIRK
// Completely separate from desktop implementation

class MobileInterface {
  constructor(wallboard) {
    this.wallboard = wallboard;
    this.container = null;
    this.activeNodeId = null;
    this.init();
  }

  init() {
    console.log('Mobile interface initializing...');

    // Hide desktop canvas and related UI
    const canvas = document.getElementById('canvas');
    if (canvas) {
      canvas.style.display = 'none';
      console.log('Canvas hidden');
    }

    // Hide desktop-only elements
    const instructions = document.querySelector('.instructions');
    if (instructions) instructions.style.display = 'none';

    const particles = document.getElementById('particles');
    if (particles) particles.style.display = 'none';

    // Create mobile container
    this.container = document.createElement('div');
    this.container.id = 'mobile-container';
    this.container.className = 'mobile-container';

    // Append mobile container
    document.body.appendChild(this.container);

    // Render mobile view
    this.render();

    // Listen for board changes
    this.wallboard.onChangeCallback = () => this.render();

    console.log('Mobile interface initialized');
  }

  render() {
    if (!this.container) return;

    const nodes = this.wallboard.nodes || [];

    this.container.innerHTML = `
      <div class="mobile-nodes-list">
        ${nodes.length === 0 ? this.renderEmptyState() : nodes.map(node => this.renderNode(node)).join('')}
      </div>
    `;

    // Setup Prism for code highlighting
    setTimeout(() => {
      if (typeof Prism !== 'undefined') {
        Prism.highlightAll();
      }
    }, 100);
  }

  renderEmptyState() {
    return `
      <div class="mobile-empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <h3>No nodes yet</h3>
        <p>Tap the menu button to add a node</p>
      </div>
    `;
  }

  renderNode(node) {
    const nodeTitle = this.wallboard.getNodeTitle(node);
    const connections = this.getNodeConnections(node.id);
    const theme = this.wallboard.nodeThemes[node.id]
      ? Themes.definitions[this.wallboard.nodeThemes[node.id]]
      : Themes.definitions[this.wallboard.globalTheme];

    return `
      <div class="mobile-node" data-node-id="${node.id}">
        <div class="mobile-node-header" style="--node-accent: ${theme.accent}">
          <div class="mobile-node-title-row">
            <span class="mobile-node-title">${nodeTitle.toUpperCase()}</span>
            <div class="mobile-node-actions">
              <button class="mobile-node-btn" onclick="mobileInterface.editNode(${node.id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="mobile-node-btn" onclick="mobileInterface.deleteNode(${node.id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          ${connections.length > 0 ? `
            <div class="mobile-connections">
              ${connections.map(conn => `
                <div class="mobile-connection-tag ${conn.direction}" onclick="mobileInterface.scrollToNode(${conn.nodeId})">
                  ${conn.direction === 'to' ? '→' : '←'} ${conn.title}
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <div class="mobile-node-content">
          ${node.data && node.data.content ? Sanitization.sanitize(marked.parse(node.data.content)) : '<p class="mobile-empty-content">Empty node</p>'}
        </div>
      </div>
    `;
  }

  getNodeConnections(nodeId) {
    const connections = [];
    const allConnections = this.wallboard.connectionManager.connections || [];

    allConnections.forEach(conn => {
      if (conn.start.nodeId === nodeId) {
        // Outgoing connection
        const targetNode = this.wallboard.nodes.find(n => n.id === conn.end.nodeId);
        if (targetNode) {
          connections.push({
            nodeId: conn.end.nodeId,
            title: this.getNodePreviewText(targetNode),
            direction: 'to'
          });
        }
      } else if (conn.end.nodeId === nodeId) {
        // Incoming connection
        const sourceNode = this.wallboard.nodes.find(n => n.id === conn.start.nodeId);
        if (sourceNode) {
          connections.push({
            nodeId: conn.start.nodeId,
            title: this.getNodePreviewText(sourceNode),
            direction: 'from'
          });
        }
      }
    });

    return connections;
  }

  getNodePreviewText(node) {
    return this.wallboard.getNodeTitle(node).toUpperCase();
  }

  getCurrentBoardName() {
    if (!this.wallboard.currentBoardId) return 'QUIRK';
    const board = this.wallboard.boards[this.wallboard.currentBoardId];
    return board ? board.name.toUpperCase() : 'QUIRK';
  }

  scrollToNode(nodeId) {
    const nodeElement = this.container.querySelector(`[data-node-id="${nodeId}"]`);
    if (nodeElement) {
      nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash highlight
      nodeElement.style.backgroundColor = 'rgba(244, 35, 101, 0.1)';
      setTimeout(() => {
        nodeElement.style.backgroundColor = '';
      }, 1000);
    }
  }

  addNode() {
    const title = prompt('Node title:', 'markdown');
    if (title) {
      this.wallboard.createNode(title, { content: '# New Node\n\nStart writing...' });
      this.render();
      // Scroll to bottom where new node appears
      setTimeout(() => {
        this.container.scrollTop = this.container.scrollHeight;
      }, 100);
    }
  }

  editNode(nodeId) {
    const node = this.wallboard.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const currentContent = node.data?.content || '';
    const newContent = prompt('Edit content:', currentContent);

    if (newContent !== null) {
      if (!node.data) node.data = {};
      node.data.content = newContent;
      this.wallboard.autoSave();
      this.render();
    }
  }

  deleteNode(nodeId) {
    if (confirm('Delete this node?')) {
      this.wallboard.removeNode(nodeId);
      this.render();
    }
  }

  destroy() {
    // Cleanup mobile interface and restore desktop
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    const canvas = document.getElementById('canvas');
    if (canvas) canvas.style.display = 'block';
  }
}
