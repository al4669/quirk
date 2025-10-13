// Board management system
class BoardManager {
  static async initBoardSystem(wallboard) {
    // Initialize IndexedDB storage
    wallboard.storage = new QuirkStorage();
    await wallboard.storage.initPromise;

    // Migrate from localStorage if needed
    await wallboard.storage.migrateFromLocalStorage();

    // Load global theme preference
    const savedGlobalTheme = await wallboard.storage.getSetting('wallboard_global_theme');
    if (savedGlobalTheme) {
      wallboard.globalTheme = savedGlobalTheme;
    }

    // Load boards from IndexedDB
    wallboard.boards = await wallboard.storage.getAllBoards();

    // Check for GitHub board URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const githubBoardUrl = urlParams.get('board');

    if (githubBoardUrl) {
      await this.loadGitHubBoard(wallboard, githubBoardUrl);
      return;
    }

    // Get last used board or create default
    const lastBoardId = await wallboard.storage.getSetting('wallboard_last_board');

    if (lastBoardId && wallboard.boards[lastBoardId]) {
      wallboard.currentBoardId = lastBoardId;
      await this.loadBoard(wallboard, lastBoardId);
    } else {
      // Create default board
      await this.createNewBoard(wallboard, 'My First Board');
    }

    this.setupBoardSelector(wallboard);
  }

  static async createNewBoard(wallboard, name = 'New Board') {
    const boardId = Date.now().toString();
    const board = {
      id: boardId,
      name: name,
      nodes: [],
      connections: [],
      connectionThemes: {},
      nodeIdCounter: 0,
      globalTheme: wallboard.globalTheme || 'default',
      nodeThemes: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    wallboard.boards[boardId] = board;
    wallboard.currentBoardId = boardId;

    // Clear current state
    wallboard.nodes = [];
    wallboard.connectionManager.connections = [];
    wallboard.connectionManager.connectionThemes = {};
    wallboard.nodeIdCounter = 0;

    // Clear canvas
    document.getElementById('canvas').innerHTML = '<svg class="svg-connections" id="connections"></svg>';
    wallboard.connectionManager.init();

    await this.saveBoardsToStorage(wallboard);
    this.updateBoardSelector(wallboard);
    return boardId;
  }

  static async loadBoard(wallboard, boardId) {
    if (!wallboard.boards[boardId]) return;

    const board = wallboard.boards[boardId];
    wallboard.currentBoardId = boardId;

    // Clear current state
    document.getElementById('canvas').innerHTML = '<svg class="svg-connections" id="connections"></svg>';
    wallboard.connectionManager.init();

    // Load board state
    wallboard.nodes = board.nodes || [];
    wallboard.connectionManager.connections = board.connections || [];
    wallboard.connectionManager.connectionThemes = board.connectionThemes || {};
    wallboard.nodeIdCounter = board.nodeIdCounter || 0;
    wallboard.globalTheme = board.globalTheme || 'default';
    wallboard.nodeThemes = board.nodeThemes || {};

    // Migrate old "type" field to new "title" field for backwards compatibility
    wallboard.nodes.forEach(node => {
      if (node.type && !node.title) {
        node.title = node.type;
        delete node.type;
      }
    });

    // Apply loaded theme
    wallboard.applyGlobalTheme(wallboard.globalTheme);

    // Render all nodes
    wallboard.nodes.forEach(node => wallboard.renderNode(node));

    // Update connections
    wallboard.connectionManager.updateConnections();

    // Update last used board
    await wallboard.storage.saveSetting('wallboard_last_board', boardId);

    this.updateBoardSelector(wallboard);
  }

  static async saveCurrentBoard(wallboard) {
    if (!wallboard.currentBoardId) return;

    const board = wallboard.boards[wallboard.currentBoardId];
    if (!board) return;

    // Update board state
    board.nodes = wallboard.nodes;
    board.connections = wallboard.connectionManager.connections;
    board.connectionThemes = wallboard.connectionManager.connectionThemes;
    board.nodeIdCounter = wallboard.nodeIdCounter;
    board.globalTheme = wallboard.globalTheme;
    board.nodeThemes = wallboard.nodeThemes;
    board.updatedAt = new Date().toISOString();

    // Save to IndexedDB (fast, async)
    await wallboard.storage.saveBoard(wallboard.currentBoardId, board);
    await wallboard.storage.saveSetting('wallboard_last_board', wallboard.currentBoardId);
    await wallboard.storage.saveSetting('wallboard_global_theme', wallboard.globalTheme);
  }

  static async saveBoardsToStorage(wallboard) {
    // Save all boards
    for (const [boardId, board] of Object.entries(wallboard.boards)) {
      await wallboard.storage.saveBoard(boardId, board);
    }
    await wallboard.storage.saveSetting('wallboard_last_board', wallboard.currentBoardId);
    await wallboard.storage.saveSetting('wallboard_global_theme', wallboard.globalTheme);
  }

  static async loadGitHubBoard(wallboard, githubUrl) {
    try {
      // Show loading state
      Notifications.show('Loading board from GitHub...');

      // Convert GitHub URL to raw content URL
      const rawUrl = UrlUtils.convertToGitHubRawUrl(githubUrl);
      if (!rawUrl) {
        throw new Error('Invalid GitHub URL. Please provide a valid GitHub file URL.');
      }

      // Fetch board data from GitHub
      const response = await fetch(rawUrl);
      if (!response.ok) {
        throw new Error(`Failed to load board: ${response.status} ${response.statusText}`);
      }

      const boardData = await response.json();

      // Validate board data structure
      if (!BoardUtils.validateBoardData(boardData)) {
        throw new Error('Invalid board format. The file must contain valid board data.');
      }

      // Create a new board from GitHub data with duplicate handling
      const baseName = boardData.name || 'GitHub Board';
      const existingNames = Object.values(wallboard.boards).map(board => board.name);
      const uniqueName = BoardUtils.generateUniqueName(baseName, existingNames);
      const boardId = 'github_' + Date.now().toString();

      const board = {
        id: boardId,
        name: uniqueName,
        nodes: boardData.nodes || [],
        connections: boardData.connections || [],
        connectionThemes: boardData.connectionThemes || {},
        nodeIdCounter: boardData.nodeIdCounter || 0,
        globalTheme: boardData.globalTheme || 'default',
        nodeThemes: boardData.nodeThemes || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isFromGitHub: true,
        originalUrl: githubUrl
      };

      // Load the board and persist it
      wallboard.boards[boardId] = board;
      wallboard.currentBoardId = boardId;
      await this.loadBoard(wallboard, boardId);
      await this.saveBoardsToStorage(wallboard); // Ensure persistence

      // Clear URL parameter to prevent re-import
      UrlUtils.clearUrlParameter();

      Notifications.show(`Successfully loaded "${board.name}" from GitHub!`);

    } catch (error) {
      console.error('Failed to load GitHub board:', error);
      Notifications.show(`Error: ${error.message}`);

      // Fall back to creating a default board
      this.createNewBoard(wallboard, 'My First Board');
    }

    this.setupBoardSelector(wallboard);
  }

  static setupBoardSelector(wallboard) {
    // Create board selector in toolbar if it doesn't exist
    const toolbar = document.querySelector('.toolbar');
    if (!document.getElementById('board-selector')) {
      const boardSelectorHtml = `
        <div class="board-selector" id="board-selector">
          <select class="board-dropdown" id="board-dropdown">
          </select>
          <div class="board-actions">
            <button class="tool-btn small-btn" id="rename-board-btn" title="Rename Board">
              <svg class="tool-icon small-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="tool-btn small-btn" id="delete-board-btn" title="Delete Board">
              <svg class="tool-icon small-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            <button class="tool-btn new-board-btn" id="new-board-btn">
              <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span class="tool-text">New Board</span>
            </button>
          </div>
        </div>
      `;
      toolbar.insertAdjacentHTML('afterbegin', boardSelectorHtml);

      // Add event listener for board selection
      document.getElementById('board-dropdown').addEventListener('change', async (e) => {
        await this.loadBoard(wallboard, e.target.value);
      });

      // Add event listeners for board actions
      document.getElementById('rename-board-btn').addEventListener('click', () => this.renameBoardDialog(wallboard));
      document.getElementById('delete-board-btn').addEventListener('click', () => this.deleteBoardDialog(wallboard));
      document.getElementById('new-board-btn').addEventListener('click', () => this.showNewBoardDialog(wallboard));
    }

    this.updateBoardSelector(wallboard);
  }

  static updateBoardSelector(wallboard) {
    const dropdown = document.getElementById('board-dropdown');
    if (dropdown) {
      dropdown.innerHTML = '';
      Object.values(wallboard.boards).forEach(board => {
        const option = document.createElement('option');
        option.value = board.id;
        option.textContent = board.name;
        option.selected = board.id === wallboard.currentBoardId;
        dropdown.appendChild(option);
      });
    }

    // Update mobile board menu
    const boardMenuList = document.getElementById('boardMenuList');
    if (boardMenuList) {
      boardMenuList.innerHTML = '';
      Object.values(wallboard.boards).forEach(board => {
        const button = document.createElement('button');
        button.className = 'board-menu-item';
        if (board.id === wallboard.currentBoardId) {
          button.classList.add('active');
        }
        button.textContent = board.name;
        button.onclick = async () => {
          await this.loadBoard(wallboard, board.id);
          document.querySelector('.board-menu').classList.remove('mobile-open');
        };
        boardMenuList.appendChild(button);
      });
    }
  }

  static showNewBoardDialog(wallboard) {
    const boardName = DialogUtils.promptText('Enter board name:', `Board ${Object.keys(wallboard.boards).length + 1}`);
    if (boardName) {
      this.createNewBoard(wallboard, boardName);
    }
  }

  static async renameBoardDialog(wallboard) {
    if (!wallboard.currentBoardId) return;
    const currentBoard = wallboard.boards[wallboard.currentBoardId];
    const newName = DialogUtils.promptText('Enter new board name:', currentBoard.name);
    if (newName) {
      currentBoard.name = newName;
      await this.saveBoardsToStorage(wallboard);
      this.updateBoardSelector(wallboard);
    }
  }

  static async deleteBoardDialog(wallboard) {
    if (!wallboard.currentBoardId) return;
    const currentBoard = wallboard.boards[wallboard.currentBoardId];
    const boardCount = Object.keys(wallboard.boards).length;

    if (boardCount === 1) {
      DialogUtils.alertMessage('Cannot delete the last remaining board.');
      return;
    }

    if (DialogUtils.confirmAction(`Are you sure you want to delete board "${currentBoard.name}"? This action cannot be undone.`)) {
      delete wallboard.boards[wallboard.currentBoardId];

      // Switch to the first available board
      const remainingBoardIds = Object.keys(wallboard.boards);
      if (remainingBoardIds.length > 0) {
        await this.loadBoard(wallboard, remainingBoardIds[0]);
      }

      await this.saveBoardsToStorage(wallboard);
      this.updateBoardSelector(wallboard);
    }
  }
}
