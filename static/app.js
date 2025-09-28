// Configure marked for GFM
marked.setOptions({
  gfm: true,
  breaks: true,
  tables: true,
  highlight: function (code, lang) {
    if (Prism.languages[lang]) {
      return Prism.highlight(code, Prism.languages[lang], lang);
    }
    return code;
  },
});

// Main wallboard class
class Wallboard {
  constructor() {
    this.nodes = [];
    this.selectedNode = null;
    this.selectedNodes = new Set(); // For multi-select
    this.contextNode = null;
    this.isConnecting = false;
    this.connectStart = null;
    this.dragLine = null;
    this.nodeIdCounter = 0;
    this.connectionManager = new ConnectionManager(this, () => this.autoSave());

    // Properties for new drag-and-drop logic
    this.draggedNode = null;
    this.dragOffset = { x: 0, y: 0 };
    this.isDragging = false;

    // Group dragging state
    this.isGroupDragging = false;
    this.groupDragOffsets = new Map(); // nodeId -> {x, y} offset from primary node
    this.primaryDragNode = null;

    // Properties for connection dragging
    this.isConnectionDrag = false;
    this.connectionStartNode = null;
    this.currentMousePos = { x: 0, y: 0 };

    // Properties for connection cutting
    this.isCutting = false;
    this.cutPath = [];
    this.cutLine = null;

    // Theme system
    this.themes = {
      default: { accent: '#f42365', name: 'Pink' },
      pink: { accent: '#f42365', name: 'Pink' },
      blue: { accent: '#2563eb', name: 'Blue' },
      purple: { accent: '#9333ea', name: 'Purple' },
      green: { accent: '#059669', name: 'Green' },
      orange: { accent: '#ea580c', name: 'Orange' },
      red: { accent: '#dc2626', name: 'Red' },
      cyan: { accent: '#0891b2', name: 'Cyan' },
      yellow: { accent: '#ca8a04', name: 'Yellow' },
      indigo: { accent: '#4338ca', name: 'Indigo' },
      emerald: { accent: '#10b981', name: 'Emerald' },
      rose: { accent: '#e11d48', name: 'Rose' },
      violet: { accent: '#7c3aed', name: 'Violet' },
      amber: { accent: '#f59e0b', name: 'Amber' },
      teal: { accent: '#0d9488', name: 'Teal' },
      lime: { accent: '#65a30d', name: 'Lime' },
      fuchsia: { accent: '#c026d3', name: 'Fuchsia' }
    };
    this.globalTheme = 'default';
    this.nodeThemes = {}; // Per-node theme overrides

    // Canvas boundaries
    this.canvasWidth = 10000;
    this.canvasHeight = 8000;

    // Zoom and pan properties - start centered
    this.zoom = 1;
    this.panX = -(this.canvasWidth / 2) + (window.innerWidth / 2);
    this.panY = -(this.canvasHeight / 2) + (window.innerHeight / 2);
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.panUpdateTimeout = null;
    this.isAnyNodeEditing = false;

    // Board management
    this.currentBoardId = null;
    this.boards = {};
    this.autoSaveTimeout = null;

    this.init();
  }

  init() {
    // Initialize board system
    this.initBoardSystem();

    // Create particles
    this.createParticles();

    // Initialize connection manager
    this.connectionManager.init();

    // Set initial centered transform
    this.updateTransform();

    // Canvas click handler
    document.getElementById("canvas").addEventListener("click", (e) => {
      if (e.target.id === "canvas" && !this.isPanning) {
        this.deselectAll();
        this.exitAllEditModes();
      }
    });

    // Prevent context menu on canvas
    document.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Hide context menu on click outside and exit edit modes
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".context-menu") &&
          !e.target.closest(".theme-selector") &&
          !e.target.classList.contains('text-editor')) {
        this.hideContextMenu();

        // Exit edit mode if clicking outside all nodes
        if (!e.target.closest(".node")) {
          this.exitAllEditModes();
        }
      }
    });

    // Initialize keyboard shortcuts manager
    this.keyboardShortcuts = new KeyboardShortcuts(this);

    // Optimized drag event listeners - attached to document for better performance
    document.addEventListener("mousemove", this.handleMouseMove.bind(this), {
      passive: true,
    });
    document.addEventListener("mouseup", this.handleMouseUp.bind(this));
    document.addEventListener("mousedown", this.handleMouseDown.bind(this));

    // Zoom and pan event listeners
    document.addEventListener("wheel", this.handleWheel.bind(this), { passive: false });

    // Canvas pan listeners
    const canvas = document.getElementById("canvas");
    canvas.addEventListener("mousedown", this.handleCanvasPanStart.bind(this));
    canvas.addEventListener("mousemove", this.handleCanvasPan.bind(this));
    canvas.addEventListener("mouseup", this.handleCanvasPanEnd.bind(this));
  }

  // Board Management System
  initBoardSystem() {
    // Load global theme preference
    const savedGlobalTheme = localStorage.getItem('wallboard_global_theme');
    if (savedGlobalTheme) {
      this.globalTheme = savedGlobalTheme;
    }

    // Load boards from localStorage
    const savedBoards = localStorage.getItem('wallboard_boards');
    this.boards = savedBoards ? JSON.parse(savedBoards) : {};

    // Check for GitHub board URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const githubBoardUrl = urlParams.get('board');

    if (githubBoardUrl) {
      this.loadGitHubBoard(githubBoardUrl);
      return;
    }

    // Get last used board or create default
    const lastBoardId = localStorage.getItem('wallboard_last_board');

    if (lastBoardId && this.boards[lastBoardId]) {
      this.currentBoardId = lastBoardId;
      this.loadBoard(lastBoardId);
    } else {
      // Create default board
      this.createNewBoard('My First Board');
    }

    this.setupBoardSelector();
  }

  createNewBoard(name = 'New Board') {
    const boardId = Date.now().toString();
    const board = {
      id: boardId,
      name: name,
      nodes: [],
      connections: [],
      nodeIdCounter: 0,
      globalTheme: this.globalTheme || 'default',
      nodeThemes: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.boards[boardId] = board;
    this.currentBoardId = boardId;

    // Clear current state
    this.nodes = [];
    this.connectionManager.connections = [];
    this.nodeIdCounter = 0;

    // Clear canvas
    document.getElementById('canvas').innerHTML = '<svg class="svg-connections" id="connections"></svg>';
    this.connectionManager.init();

    this.saveBoardsToStorage();
    this.updateBoardSelector();
    return boardId;
  }

  loadBoard(boardId) {
    if (!this.boards[boardId]) return;

    const board = this.boards[boardId];
    this.currentBoardId = boardId;

    // Clear current state
    document.getElementById('canvas').innerHTML = '<svg class="svg-connections" id="connections"></svg>';
    this.connectionManager.init();

    // Load board state
    this.nodes = board.nodes || [];
    this.connectionManager.connections = board.connections || [];
    this.nodeIdCounter = board.nodeIdCounter || 0;
    this.globalTheme = board.globalTheme || 'default';
    this.nodeThemes = board.nodeThemes || {};

    // Apply loaded theme
    this.applyGlobalTheme(this.globalTheme);

    // Render all nodes
    this.nodes.forEach(node => this.renderNode(node));

    // Update connections
    this.connectionManager.updateConnections();

    // Update last used board
    localStorage.setItem('wallboard_last_board', boardId);

    this.updateBoardSelector();
  }

  saveCurrentBoard() {
    if (!this.currentBoardId) return;

    const board = this.boards[this.currentBoardId];
    if (!board) return;

    // Update board state
    board.nodes = this.nodes;
    board.connections = this.connectionManager.connections;
    board.nodeIdCounter = this.nodeIdCounter;
    board.globalTheme = this.globalTheme;
    board.nodeThemes = this.nodeThemes;
    board.updatedAt = new Date().toISOString();

    this.saveBoardsToStorage();
  }

  saveBoardsToStorage() {
    localStorage.setItem('wallboard_boards', JSON.stringify(this.boards));
    localStorage.setItem('wallboard_last_board', this.currentBoardId);
    localStorage.setItem('wallboard_global_theme', this.globalTheme);
  }

  autoSave() {
    // Debounced auto-save
    clearTimeout(this.autoSaveTimeout);
    this.autoSaveTimeout = setTimeout(() => {
      this.saveCurrentBoard();
    }, 1000); // Save 1 second after last change
  }

  async loadGitHubBoard(githubUrl) {
    try {
      // Show loading state
      this.showNotification('Loading board from GitHub...');

      // Convert GitHub URL to raw content URL
      const rawUrl = this.convertToGitHubRawUrl(githubUrl);
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
      if (!this.validateBoardData(boardData)) {
        throw new Error('Invalid board format. The file must contain valid board data.');
      }

      // Create a new board from GitHub data with duplicate handling
      const baseName = boardData.name || 'GitHub Board';
      const uniqueName = this.generateUniqueBoardName(baseName);
      const boardId = 'github_' + Date.now().toString();

      const board = {
        id: boardId,
        name: uniqueName,
        nodes: boardData.nodes || [],
        connections: boardData.connections || [],
        nodeIdCounter: boardData.nodeIdCounter || 0,
        globalTheme: boardData.globalTheme || 'default',
        nodeThemes: boardData.nodeThemes || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isFromGitHub: true,
        originalUrl: githubUrl
      };

      // Load the board and persist it
      this.boards[boardId] = board;
      this.currentBoardId = boardId;
      this.loadBoard(boardId);
      this.saveBoardsToStorage(); // Ensure persistence

      // Clear URL parameter to prevent re-import
      this.clearUrlParameter();

      this.showNotification(`Successfully loaded "${board.name}" from GitHub!`);

    } catch (error) {
      console.error('Failed to load GitHub board:', error);
      this.showNotification(`Error: ${error.message}`);

      // Fall back to creating a default board
      this.createNewBoard('My First Board');
    }

    this.setupBoardSelector();
  }

  convertToGitHubRawUrl(url) {
    try {
      // Handle different GitHub URL formats
      if (url.includes('github.com')) {
        // Convert github.com URLs to raw.githubusercontent.com
        const githubRegex = /github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/;
        const match = url.match(githubRegex);

        if (match) {
          const [, user, repo, branch, path] = match;
          return `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}`;
        }
      } else if (url.includes('raw.githubusercontent.com')) {
        // Already a raw URL
        return url;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  validateBoardData(data) {
    // Check if the data has the required structure for a board
    return (
      typeof data === 'object' &&
      data !== null &&
      (Array.isArray(data.nodes) || data.nodes === undefined) &&
      (Array.isArray(data.connections) || data.connections === undefined)
    );
  }

  generateUniqueBoardName(baseName) {
    // Check if base name exists
    const existingNames = Object.values(this.boards).map(board => board.name);

    if (!existingNames.includes(baseName)) {
      return baseName;
    }

    // Generate numbered variants: "Board Name (1)", "Board Name (2)", etc.
    let counter = 1;
    let uniqueName;

    do {
      uniqueName = `${baseName} (${counter})`;
      counter++;
    } while (existingNames.includes(uniqueName));

    return uniqueName;
  }

  clearUrlParameter() {
    // Remove the 'board' parameter from the URL without refreshing the page
    if (window.history && window.history.replaceState) {
      const url = new URL(window.location);
      url.searchParams.delete('board');
      window.history.replaceState({}, document.title, url.toString());
    }
  }

  setupBoardSelector() {
    // Create board selector in toolbar if it doesn't exist
    const toolbar = document.querySelector('.toolbar');
    if (!document.getElementById('board-selector')) {
      const boardSelectorHtml = `
        <div class="board-selector" id="board-selector">
          <select class="board-dropdown" id="board-dropdown">
          </select>
          <div class="board-actions">
            <button class="tool-btn small-btn" onclick="wallboard.renameBoardDialog()" title="Rename Board">
              <svg class="tool-icon small-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="tool-btn small-btn" onclick="wallboard.deleteBoardDialog()" title="Delete Board">
              <svg class="tool-icon small-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
            <button class="tool-btn new-board-btn" onclick="wallboard.showNewBoardDialog()">
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
      document.getElementById('board-dropdown').addEventListener('change', (e) => {
        this.loadBoard(e.target.value);
      });
    }

    this.updateBoardSelector();
  }

  updateBoardSelector() {
    const dropdown = document.getElementById('board-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';
    Object.values(this.boards).forEach(board => {
      const option = document.createElement('option');
      option.value = board.id;
      option.textContent = board.name;
      option.selected = board.id === this.currentBoardId;
      dropdown.appendChild(option);
    });
  }

  showNewBoardDialog() {
    const boardName = prompt('Enter board name:', `Board ${Object.keys(this.boards).length + 1}`);
    if (boardName && boardName.trim()) {
      this.createNewBoard(boardName.trim());
    }
  }

  renameBoardDialog() {
    if (!this.currentBoardId) return;
    const currentBoard = this.boards[this.currentBoardId];
    const newName = prompt('Enter new board name:', currentBoard.name);
    if (newName && newName.trim()) {
      currentBoard.name = newName.trim();
      this.saveBoardsToStorage();
      this.updateBoardSelector();
    }
  }

  deleteBoardDialog() {
    if (!this.currentBoardId) return;
    const currentBoard = this.boards[this.currentBoardId];
    const boardCount = Object.keys(this.boards).length;

    if (boardCount === 1) {
      alert('Cannot delete the last remaining board.');
      return;
    }

    if (confirm(`Are you sure you want to delete board "${currentBoard.name}"? This action cannot be undone.`)) {
      delete this.boards[this.currentBoardId];

      // Switch to the first available board
      const remainingBoardIds = Object.keys(this.boards);
      if (remainingBoardIds.length > 0) {
        this.loadBoard(remainingBoardIds[0]);
      }

      this.saveBoardsToStorage();
      this.updateBoardSelector();
    }
  }

  createParticles() {
    const particleContainer = document.getElementById("particles");
    for (let i = 0; i < 15; i++) {
      const particle = document.createElement("div");
      particle.className = "particle";
      particle.style.left = Math.random() * window.innerWidth + "px";
      particle.style.animationDelay = Math.random() * 20 + "s";
      particle.style.animationDuration = 15 + Math.random() * 10 + "s";
      particleContainer.appendChild(particle);
    }
  }
getRandomMarkdownContent() {
  const examples = [
    {
      title: "☕ Coffee Shop Empire",
      content: `# ☕ Coffee Shop Empire
*The most revolutionary note-taking experience since sliced bread learned to write!*

Supports **bold plans**, *sneaky tactics*, \`secret codes\`, and more!

- Step 1: Find the perfect beans
- Step 2: Create cozy vibes  
- Step 3: Conquer the neighborhood
- Step 4: World domination through caffeine!

| Shop Theme | Vibe Level | Secret Ingredient |
|------------|------------|------------------|
| Retro Arcade | 🕹️🕹️🕹️ | Nostalgia foam art |
| Plant Paradise | 🌱🌱🌱🌱 | Chlorophyll lattes |

\`\`\`javascript
const perfectCoffee = () => {
  return "Two shots of espresso + dreams + superior note organization";
};
\`\`\``
    },
    {
      title: "🧠 Brain Upgrade Protocol",
      content: `# 🧠 Brain Upgrade Protocol v2.0
*This note-taking tool is literally making you smarter right now. No refunds on genius!*

**WARNING**: May cause explosive productivity and uncontrollable organization addiction!

- Download more RAM for your brain
- Install creativity.exe 
- Debug your procrastination loops
- Compile your thoughts into pure genius

| Upgrade | Success Rate | Side Effects |
|---------|-------------|--------------|
| Memory Boost | 200% | Remembering everything |
| Focus Enhancement | 150% | Laser-like concentration |
| Creativity Injection | 300% | Uncontainable ideas |

\`\`\`javascript
const brainPower = (coffee, sleep, notes) => {
  return coffee * sleep * notes === "UNLIMITED POWER!";
};
\`\`\``
    },
    {
      title: "🦸‍♀️ Superhero Academy Admissions",
      content: `# 🦸‍♀️ Superhero Academy Admissions
*Finally, a note-taking tool worthy of your secret identity!*

**This superior organizational system** has been approved by 9 out of 10 caped crusaders!

- Master the art of dramatic entrances
- Learn to brood professionally on rooftops
- Advanced cape management techniques
- How to maintain secret identity while taking notes

| Superpower | Training Level | Weakness |
|------------|----------------|----------|
| Flight | Advanced | Low ceilings |
| Invisibility | Beginner | Forgetting you're invisible |
| Super Speed | Expert | Speed bumps |

\`\`\`javascript
const saveTheWorld = (heroName, superPower) => {
  return \`\${heroName} used \${superPower}! It's super effective!\`;
};
\`\`\``
    },
    {
      title: "🎪 Circus of Productivity",
      content: `# 🎪 Welcome to the Greatest Productivity Show on Earth!
*Step right up! Witness the most SPECTACULAR note-taking tool in the universe!*

**Ladies and gentlemen**, prepare to be **AMAZED** by organizational feats that defy the laws of chaos!

- Tame the wild beast of scattered thoughts
- Juggle infinite ideas without dropping any
- Walk the tightrope between genius and madness
- Become the ringmaster of your own success!

| Act | Difficulty | Applause Level |
|-----|------------|----------------|
| Idea Juggling | ⭐⭐⭐⭐⭐ | Standing ovation |
| Chaos Taming | ⭐⭐⭐⭐ | Thunderous |
| Mind Reading | ⭐⭐⭐ | Gasps of amazement |

\`\`\`javascript
const circusAct = () => {
  return "Ta-da! Your thoughts are now perfectly organized!";
};
\`\`\``
    },
    {
      title: "🔬 Mad Scientist Lab Notes",
      content: `# 🔬 Dr. Genius McSmarty's Lab Notes
*EUREKA! I've discovered the most SUPERIOR note-taking apparatus known to science!*

**BREAKTHROUGH**: This tool increases IQ by at least 47.3 points per use (results not scientifically verified)!

- Experiment #1: Turn coffee into pure productivity
- Experiment #2: Clone myself to get more work done
- Experiment #3: Invent time machine to meet deadlines
- Experiment #4: Achieve world peace through better organization

| Experiment | Success Rate | Explosive Potential |
|------------|-------------|-------------------|
| Productivity Serum | 98.7% | Mind-blowing |
| Chaos Neutralizer | 99.2% | Reality-bending |
| Genius Amplifier | 101.4% | Universe-altering |

\`\`\`javascript
const scientificMethod = (hypothesis, madness) => {
  return madness > 9000 ? "BREAKTHROUGH!" : "Back to the drawing board";
};
\`\`\``
    },
    {
      title: "🏰 Medieval Quest Planning",
      content: `# 🏰 Ye Olde Superior Quest Planner
*Hark! The most NOBLE and MAGNIFICENT tool for organizing thy adventures!*

**By royal decree**, this note-taking system has been declared **SUPERIOR** to all parchment and quill!

- Slay the dragon of disorganization
- Rescue the princess of productivity from the tower of chaos  
- Find the holy grail of perfect note-taking
- Unite the kingdom under one superior organizational system

| Quest | Difficulty | Reward |
|-------|------------|--------|
| Dragon Slaying | Legendary | Eternal organization |
| Princess Rescue | Epic | Infinite productivity |
| Grail Finding | Mythical | Perfect notes forever |

\`\`\`javascript
const questComplete = (courage, superior_notes) => {
  return "Thou hast achieved legendary status in organization!";
};
\`\`\``
    },
    {
      title: "🎮 Ultimate Gaming Strategy",
      content: `# 🎮 Level ∞: The Ultimate Gaming Strategy Guide
*ACHIEVEMENT UNLOCKED: Found the most LEGENDARY note-taking tool!*

**CRITICAL HIT!** This superior system deals 999+ damage to chaos and confusion!

- Speedrun through your to-do list
- Unlock all productivity achievements  
- Master the ultimate combo: Planning + Action + Success
- Defeat the final boss: Procrastination Dragon

| Boss Fight | Difficulty | Loot Drop |
|------------|------------|-----------|
| Procrastination Dragon | INSANE | Infinite motivation |
| Chaos Hydra | NIGHTMARE | Perfect organization |
| Confusion Kraken | IMPOSSIBLE | Crystal clear thinking |

\`\`\`javascript
const gameOver = (lives, superior_notes) => {
  return lives > 0 && superior_notes ? "YOU WIN!" : "Game Over, man!";
};
\`\`\``
    },
    {
      title: "🚀 Intergalactic Empire Building",
      content: `# 🚀 Galactic Emperor's Master Plan
*The most ASTRONOMICALLY SUPERIOR note-taking technology in the known universe!*

**COSMIC BREAKTHROUGH**: Scientists across 47 galaxies confirm this tool's supremacy!

- Conquer the Procrastination Nebula
- Establish mining colonies on Productivity Prime
- Build the Death Star of Organization (but for good!)
- Unite all star systems under one superior note-taking alliance

| Galaxy | Conquest Status | Resources |
|--------|----------------|-----------|
| Productivity Prime | 100% CONQUERED | Infinite motivation ore |
| Organization Alpha | 95% DOMINATED | Pure focus crystals |
| Chaos Void | 0% (avoid at all costs) | Nothing but confusion |

\`\`\`javascript
const galacticDomination = (fleets, superior_notes) => {
  return "The universe bows before your organizational might!";
};
\`\`\``
    },
    {
      title: "🧙‍♂️ Wizard's Spell Book",
      content: `# 🧙‍♂️ The Grand Grimoire of Supreme Organization
*BEHOLD! The most MAGICALLY SUPERIOR incantation for note mastery!*

**ANCIENT PROPHECY FULFILLED**: "When chaos reigns, a superior tool shall rise!"

- Cast "Organizus Supremus" on your scattered thoughts
- Brew the Potion of Infinite Productivity
- Summon the Spirit of Perfect Planning
- Transform base chaos into organizational gold

| Spell | Power Level | Mana Cost |
|-------|-------------|-----------|
| Clarity Vision | LEGENDARY | 5 coffee cups |
| Time Multiplication | MYTHICAL | 3 energy drinks |
| Chaos Banishment | GODLIKE | 1 good night's sleep |

\`\`\`javascript
const castSpell = (wisdom, superior_notes) => {
  return "✨ POOF! Your life is now magically organized! ✨";
};
\`\`\``
    },
    {
      title: "🦖 Dinosaur CEO Business Plan",
      content: `# 🦖 T-Rex Industries: Prehistoric Domination
*ROOOAAR! The most FEROCIOUSLY SUPERIOR note-taking tool since the Cretaceous period!*

**EXTINCTION-PROOF GUARANTEE**: This system survived the meteor that killed regular note-taking!

- Stomp out the competition with superior organization
- Build a business empire 65 million years in the making
- Evolve from scattered thoughts to apex predator productivity
- Rule the corporate jungle with tiny arms but BIG BRAIN POWER

| Department | Prehistoric Power | Evolution Level |
|------------|------------------|-----------------|
| Savage Marketing | 🦖🦖🦖🦖🦖 | Fully evolved |
| Brutal Efficiency | 🦕🦕🦕🦕 | Nearly extinct competition |
| Carnivorous Planning | 🦴🦴🦴 | Bone-crushing results |

\`\`\`javascript
const prehistoricSuccess = (rawPower, superior_notes) => {
  return "ROAAAAAR! Your productivity is now PREHISTORIC-LEVEL EPIC!";
};
\`\`\``
    }
  ];

  const randomIndex = Math.floor(Math.random() * examples.length);
  return examples[randomIndex].content;
}
addMarkdownNode() {
  const node = this.createNode("markdown", {
    content: this.getRandomMarkdownContent()
  });
  this.renderNode(node);
}

  addImageNode() {
    const node = this.createNode("image", {
      url: "",
    });
    this.renderNode(node);
  }

  createNode(type, data) {
    // Record change for undo/redo BEFORE making changes
    if (this.keyboardShortcuts) {
      this.keyboardShortcuts.recordChange('create_node', { type, data });
    }

    const node = {
      id: this.nodeIdCounter++,
      type: type,
      data: data,
      position: {
        x: (this.canvasWidth / 2) + (Math.random() - 0.5) * 800,
        y: (this.canvasHeight / 2) + (Math.random() - 0.5) * 600,
      },
    };
    this.nodes.push(node);
    this.autoSave();
    return node;
  }

  renderNode(node) {
    const nodeEl = document.createElement("div");
    nodeEl.className = "node";
    nodeEl.id = `node-${node.id}`;
    nodeEl.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;

    // Node header
    const header = document.createElement("div");
    header.className = "node-header";
    header.innerHTML = `
                    <div class="node-type" id="type-${node.id}">${node.type.toUpperCase()}</div>
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
                        <button class="node-btn" onclick="wallboard.toggleEdit(${
                          node.id
                        })">
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
      this.editNodeType(node.id);
    });
    nodeEl.appendChild(header);

    // Node content
    const content = document.createElement("div");
    content.className = "node-content";
    content.id = `content-${node.id}`;

    if (node.data && node.data.content !== undefined) {
      // Render any content node as markdown
      content.innerHTML = `<div class="markdown-content">${marked.parse(
        node.data.content
      )}</div>`;

      // Apply syntax highlighting to initial render
      setTimeout(() => {
        const codeBlocks = content.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
          Prism.highlightElement(block);
        });
      }, 0);
    } else if (node.type === "image") {
      if (node.data.url) {
        content.innerHTML = `<div class="image-node"><img src="${node.data.url}" alt="Node image"></div>`;
      } else {
        content.innerHTML = `
                            <div class="image-upload" onclick="wallboard.uploadImage(${node.id})">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21 15 16 10 5 21"></polyline>
                                </svg>
                                <p style="margin-top: 10px; color: var(--text-secondary)">Click or drag to upload</p>
                            </div>
                        `;
      }
    }

    nodeEl.appendChild(content);


    // Make draggable - header for regular drag
    header.addEventListener("mousedown", (e) => {
      this.handleNodeDragStart(e, node, nodeEl);
    });

    // Add double-click to edit content
    content.addEventListener("dblclick", (e) => {
      if (e.target.closest('.node-btn') || e.target.closest('textarea') || e.target.closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      this.toggleEdit(node.id);
    });

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
        this.handleConnectionDragStart(dragStartPos, node);
      }
    });

    content.addEventListener("mouseup", () => {
      dragStartPos = null;
      isDragStarted = false;
    });

    // Selection
    nodeEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.selectNode(node, e.shiftKey);
    });

    // Context menu
    nodeEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showContextMenu(e, node);
    });

    document.getElementById("canvas").appendChild(nodeEl);

    // Apply theme to the newly created node
    this.applyNodeTheme(node.id);
  }

  // --- Zoom and Pan Handlers ---

  handleWheel(e) {
    if (e.target.closest('.theme-selector') || e.target.closest('.context-menu')) {
      return; // Don't zoom when scrolling in menus
    }

    // Don't zoom/pan when any node is being edited or when interacting with a node
    if (this.isAnyNodeEditing || e.target.closest('.text-editor') || e.target.closest('.node')) {
      return; // Allow normal scrolling in text editors and nodes
    }

    e.preventDefault();

    const zoomFactor = 0.1;

    // Use center of viewport for zoom anchor point instead of mouse position
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    // Calculate zoom
    const oldZoom = this.zoom;
    if (e.deltaY < 0) {
      this.zoom = Math.min(this.zoom + zoomFactor, 3); // Max zoom 3x
    } else {
      this.zoom = Math.max(this.zoom - zoomFactor, 0.2); // Min zoom 0.2x
    }

    // Adjust pan to zoom from center of viewport
    const zoomRatio = this.zoom / oldZoom;
    this.panX = viewportCenterX - (viewportCenterX - this.panX) * zoomRatio;
    this.panY = viewportCenterY - (viewportCenterY - this.panY) * zoomRatio;

    this.updateTransform();
  }

  handleCanvasPanStart(e) {
    // Only allow panning if clicking directly on canvas (not on nodes or when editing)
    if (e.target.id === 'canvas' && !this.isDragging && !this.isConnectionDrag && !this.isCutting && !e.altKey && !this.isAnyNodeEditing && !e.target.closest('.node')) {
      this.isPanning = true;
      this.panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }

  handleCanvasPan(e) {
    if (this.isPanning) {
      let newPanX = e.clientX - this.panStart.x;
      let newPanY = e.clientY - this.panStart.y;

      // Apply pan limits with some buffer (allow going slightly outside)
      const buffer = 200;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const scaledCanvasWidth = this.canvasWidth * this.zoom;
      const scaledCanvasHeight = this.canvasHeight * this.zoom;

      newPanX = Math.max(-(scaledCanvasWidth - viewportWidth + buffer), Math.min(buffer, newPanX));
      newPanY = Math.max(-(scaledCanvasHeight - viewportHeight + buffer), Math.min(buffer, newPanY));

      this.panX = newPanX;
      this.panY = newPanY;

      // Update transform immediately for smooth panning
      const canvas = document.getElementById('canvas');
      canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
      canvas.style.transformOrigin = '0 0';

      // Throttle connection updates during panning
      if (!this.panUpdateTimeout) {
        this.panUpdateTimeout = setTimeout(() => {
          this.connectionManager.updateConnections();
          this.panUpdateTimeout = null;
        }, 16); // ~60fps
      }

      e.preventDefault();
    }
  }

  handleCanvasPanEnd(e) {
    if (this.isPanning) {
      this.isPanning = false;
      document.body.style.cursor = '';

      // Clear any pending connection update and update immediately
      if (this.panUpdateTimeout) {
        clearTimeout(this.panUpdateTimeout);
        this.panUpdateTimeout = null;
      }
      this.connectionManager.updateConnections();

      e.preventDefault();
    }
  }

  updateTransform() {
    const canvas = document.getElementById('canvas');
    canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    canvas.style.transformOrigin = '0 0';
    this.connectionManager.updateConnections();
  }

  getNodeById(id) {
    return this.nodes.find(node => node.id === id);
  }


  // Convert screen coordinates to canvas coordinates
  screenToCanvas(screenX, screenY) {
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();

    // Get the offset within the canvas element
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    // Convert to canvas coordinate system accounting for pan and zoom
    const x = (canvasX - this.panX) / this.zoom;
    const y = (canvasY - this.panY) / this.zoom;

    return { x, y };
  }

  // Convert canvas coordinates to screen coordinates
  canvasToScreen(canvasX, canvasY) {
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();

    const x = rect.left + (canvasX * this.zoom) + this.panX;
    const y = rect.top + (canvasY * this.zoom) + this.panY;

    return { x, y };
  }

  // --- Mouse Event Handlers ---

  handleMouseDown(e) {
    // Global mouse down handler for cutting connections
    if (e.altKey) {
      e.preventDefault();
      this.startCutting(e);
    }
  }

  handleMouseMove(e) {
    this.currentMousePos = { x: e.clientX, y: e.clientY };

    if (this.isDragging && this.draggedNode) {
      this.handleNodeDrag(e);
    } else if (this.isConnectionDrag) {
      this.handleConnectionDrag(e);
    } else if (this.isCutting) {
      this.handleCutDrag(e);
    }
  }

  handleMouseUp(e) {
    if (this.isDragging) {
      this.endNodeDrag();
    } else if (this.isConnectionDrag) {
      this.endConnectionDrag(e);
    } else if (this.isCutting) {
      this.endCutting();
    }
  }

  // --- Node Dragging ---

  handleNodeDragStart(e, node, element) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Record change for undo/redo at the START of drag
    if (this.keyboardShortcuts) {
      const nodeIds = this.selectedNodes.size > 1 && this.selectedNodes.has(node.id)
        ? Array.from(this.selectedNodes)
        : [node.id];
      this.keyboardShortcuts.recordChange('move_nodes', { nodeIds });
    }

    this.isDragging = true;
    this.draggedNode = { node, element };
    this.primaryDragNode = node;

    // Check if this node is part of a multi-selection
    if (this.selectedNodes.size > 1 && this.selectedNodes.has(node.id)) {
      this.isGroupDragging = true;
      this.setupGroupDrag(node);
    } else {
      // Single node drag - don't change selection here, let click handler do it
      this.isGroupDragging = false;
    }

    element.classList.add("dragging");

    // Convert mouse coordinates to canvas coordinate system
    const canvasCoords = this.screenToCanvas(e.clientX, e.clientY);
    this.dragOffset.x = canvasCoords.x - node.position.x;
    this.dragOffset.y = canvasCoords.y - node.position.y;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    e.preventDefault();
  }

  setupGroupDrag(primaryNode) {
    // Clear any existing group drag offsets
    this.groupDragOffsets.clear();

    // Calculate relative offsets for all selected nodes from the primary node
    this.selectedNodes.forEach(nodeId => {
      if (nodeId !== primaryNode.id) {
        const node = this.nodes.find(n => n.id === nodeId);
        if (node) {
          this.groupDragOffsets.set(nodeId, {
            x: node.position.x - primaryNode.position.x,
            y: node.position.y - primaryNode.position.y
          });

          // Add dragging class to all group members
          const nodeElement = document.getElementById(`node-${nodeId}`);
          if (nodeElement) {
            nodeElement.classList.add("dragging");
          }
        }
      }
    });
  }

  handleNodeDrag(e) {
    const { node, element } = this.draggedNode;

    requestAnimationFrame(() => {
      // Convert mouse coordinates to canvas coordinate system
      const canvasCoords = this.screenToCanvas(e.clientX, e.clientY);
      const newX = canvasCoords.x - this.dragOffset.x;
      const newY = canvasCoords.y - this.dragOffset.y;

      // Update primary node position
      node.position.x = newX;
      node.position.y = newY;
      element.style.transform = `translate3d(${node.position.x}px, ${node.position.y}px, 0)`;

      // If group dragging, update all other selected nodes
      if (this.isGroupDragging) {
        this.groupDragOffsets.forEach((offset, nodeId) => {
          const groupNode = this.nodes.find(n => n.id === nodeId);
          if (groupNode) {
            // Apply the same position plus the stored offset
            groupNode.position.x = newX + offset.x;
            groupNode.position.y = newY + offset.y;

            // Update DOM position
            const groupElement = document.getElementById(`node-${nodeId}`);
            if (groupElement) {
              groupElement.style.transform = `translate3d(${groupNode.position.x}px, ${groupNode.position.y}px, 0)`;
            }
          }
        });
      }

      this.connectionManager.updateConnections();
    });
  }

  endNodeDrag() {
    this.isDragging = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    if (this.draggedNode) {
      this.draggedNode.element.classList.remove("dragging");
      this.draggedNode = null;
    }

    // Clean up group dragging state
    if (this.isGroupDragging) {
      // Remove dragging class from all group members
      this.groupDragOffsets.forEach((offset, nodeId) => {
        const nodeElement = document.getElementById(`node-${nodeId}`);
        if (nodeElement) {
          nodeElement.classList.remove("dragging");
        }
      });

      this.groupDragOffsets.clear();
      this.isGroupDragging = false;
    }

    this.primaryDragNode = null;

    // Auto-save after node position changes
    this.autoSave();
  }

  // --- Connection Dragging ---

  handleConnectionDragStart(startPos, node) {
    this.isConnectionDrag = true;
    this.connectionStartNode = node;
    this.connectStart = startPos;

    document.body.style.cursor = "crosshair";
    document.body.style.userSelect = "none";
    this.connectionManager.createDragLine();
  }

  handleConnectionDrag(e) {
    this.connectionManager.updateDragLine(this.connectStart, { x: e.clientX, y: e.clientY });
  }

  endConnectionDrag(e) {
    this.isConnectionDrag = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";

    // Find target node using DOM element detection
    const targetElement = document.elementFromPoint(e.clientX, e.clientY);
    const targetNode = this.getNodeFromElement(targetElement);

    if (targetNode && targetNode.id !== this.connectionStartNode.id) {
      this.connectionManager.createConnection(
        { nodeId: this.connectionStartNode.id },
        { nodeId: targetNode.id }
      );
    }

    this.connectionManager.removeDragLine();
    this.connectionStartNode = null;
    this.connectStart = null;
  }

  // --- Connection Cutting ---

  startCutting(e) {
    this.isCutting = true;
    document.body.style.cursor = "crosshair";
    document.body.style.userSelect = "none";
    this.connectionManager.createCutLine();
    this.connectionManager.addCutPoint({ x: e.clientX, y: e.clientY });
  }

  handleCutDrag(e) {
    if (!this.isCutting) return;
    this.connectionManager.addCutPoint({ x: e.clientX, y: e.clientY });
  }

  endCutting() {
    this.isCutting = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    this.connectionManager.processConnectionCuts();
    this.connectionManager.removeCutLine();
  }

  cancelConnection() {
    if (this.isConnectionDrag) {
      this.isConnectionDrag = false;
      this.connectionManager.removeDragLine();
      this.connectionStartNode = null;
      this.connectStart = null;
      document.body.style.cursor = "";
    }
  }

  cancelCutting() {
    if (this.isCutting) {
      this.isCutting = false;
      this.cutPath = [];
      this.cutPathCanvas = [];
      document.body.style.cursor = "";
      this.connectionManager.removeCutLine();
    }
  }

  editNodeType(nodeId) {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const typeElement = document.getElementById(`type-${nodeId}`);
    const currentType = node.type;

    // Create input field
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentType;
    input.className = "node-type-editor";

    // Replace the type element with input
    typeElement.style.display = "none";
    typeElement.parentNode.insertBefore(input, typeElement);
    input.focus();
    input.select();

    // Handle save/cancel
    const saveEdit = () => {
      if (input.parentNode) {
        const newType = input.value.trim() || currentType;
        node.type = newType;
        typeElement.textContent = newType.toUpperCase();
        typeElement.style.display = "";
        input.remove();
        this.autoSave();
      }
    };

    const cancelEdit = () => {
      if (input.parentNode) {
        typeElement.style.display = "";
        input.remove();
      }
    };

    // Handle click outside to close editor
    const handleClickOutside = (e) => {
      if (!input.contains(e.target) && input.parentNode) {
        saveEdit();
        document.removeEventListener("click", handleClickOutside);
      }
    };

    // Add click outside listener after a small delay to avoid immediate trigger
    setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
    }, 10);

    input.addEventListener("blur", () => {
      // Small delay to ensure click events are processed first
      setTimeout(() => {
        if (input.parentNode) {
          saveEdit();
        }
      }, 10);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit();
        document.removeEventListener("click", handleClickOutside);
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
        document.removeEventListener("click", handleClickOutside);
      }
      // Prevent event bubbling to avoid conflicts
      e.stopPropagation();
    });

    // Prevent clicks on the input from bubbling up
    input.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // --- Theme Management ---

  setGlobalTheme(themeKey) {
    // Record change for undo/redo
    if (this.keyboardShortcuts) {
      this.keyboardShortcuts.recordChange('set_global_theme', {
        oldTheme: this.globalTheme,
        newTheme: themeKey
      });
    }

    this.globalTheme = themeKey;
    this.applyGlobalTheme();
    this.updateAllNodeThemes();
    this.autoSave();
  }

  setNodeTheme(nodeId, themeKey) {
    // Record change for undo/redo
    if (this.keyboardShortcuts) {
      this.keyboardShortcuts.recordChange('set_node_theme', {
        nodeId: nodeId,
        oldTheme: this.nodeThemes[nodeId] || 'default',
        newTheme: themeKey
      });
    }

    if (themeKey === 'default') {
      // Remove custom theme - node will use global theme
      delete this.nodeThemes[nodeId];
    } else {
      // Set specific theme for this node, regardless of global theme
      this.nodeThemes[nodeId] = themeKey;
    }
    this.applyNodeTheme(nodeId);
    this.autoSave();
  }

  applyGlobalTheme() {
    const theme = this.themes[this.globalTheme];
    const accentHex = theme.accent;
    const accentRgb = this.hexToRgb(accentHex);

    document.documentElement.style.setProperty('--accent', accentHex);
    document.documentElement.style.setProperty('--accent-glow', `${accentHex}40`);
    document.documentElement.style.setProperty('--accent-light', this.lightenColor(accentHex, 20));
    document.documentElement.style.setProperty('--accent-dark', this.darkenColor(accentHex, 20));

    // Update background gradients
    document.documentElement.style.setProperty('--bg-accent-glow', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.1)`);
    document.documentElement.style.setProperty('--bg-accent-light', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.05)`);
  }

  applyNodeTheme(nodeId) {
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) return;

    const themeKey = this.nodeThemes[nodeId];

    if (themeKey) {
      // Apply custom theme to this specific node
      const theme = this.themes[themeKey];
      nodeElement.style.setProperty('--node-accent', theme.accent);
      nodeElement.style.setProperty('--node-accent-glow', `${theme.accent}40`);
      nodeElement.style.setProperty('--node-accent-light', this.lightenColor(theme.accent, 20));
      nodeElement.classList.add('custom-theme');
    } else {
      // Use global theme - remove custom properties
      nodeElement.style.removeProperty('--node-accent');
      nodeElement.style.removeProperty('--node-accent-glow');
      nodeElement.style.removeProperty('--node-accent-light');
      nodeElement.classList.remove('custom-theme');
    }
  }

  updateAllNodeThemes() {
    this.nodes.forEach(node => {
      this.applyNodeTheme(node.id);
    });
  }

  lightenColor(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  darkenColor(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return "#" + (0x1000000 + (R > 255 ? 255 : R < 0 ? 0 : R) * 0x10000 +
      (G > 255 ? 255 : G < 0 ? 0 : G) * 0x100 +
      (B > 255 ? 255 : B < 0 ? 0 : B)).toString(16).slice(1);
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  showThemeSelector(nodeId = null) {
    this.hideThemeSelector(); // Close any existing selector

    const selector = document.createElement('div');
    selector.className = 'theme-selector';
    selector.id = 'themeSelector';

    const title = nodeId ? `Theme for Node ${nodeId}` : 'Global Theme';

    selector.innerHTML = `
      <div class="theme-selector-header">
        <h3>${title}</h3>
        <button class="close-btn" onclick="wallboard.hideThemeSelector()">×</button>
      </div>
      <div class="theme-grid">
        ${Object.entries(this.themes).filter(([key, theme]) => {
          // For global theme selector, exclude the duplicate 'pink' theme since 'default' is already pink
          if (!nodeId && key === 'pink') return false;
          return true;
        }).map(([key, theme]) => {
          let isActive = false;
          if (nodeId) {
            // For node themes, only mark active if this node has this specific theme
            isActive = this.nodeThemes[nodeId] === key;
          } else {
            // For global themes, mark active if it matches the global theme
            isActive = this.globalTheme === key;
          }

          // For node theme selector, show "Global" instead of "Pink" for the default theme
          const displayName = (nodeId && key === 'default') ? 'Global' : theme.name;

          // For the "Global" option in node theme selector, show the current global theme color
          const previewColor = (nodeId && key === 'default') ? this.themes[this.globalTheme].accent : theme.accent;

          return `
            <div class="theme-option ${isActive ? 'active' : ''}"
                 onclick="wallboard.selectTheme('${key}', ${nodeId !== null ? nodeId : 'null'})"
                 data-theme="${key}">
              <div class="theme-preview" style="background: ${previewColor}"></div>
              <span class="theme-name">${displayName}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    document.body.appendChild(selector);
  }

  hideThemeSelector() {
    const selector = document.getElementById('themeSelector');
    if (selector) selector.remove();
  }

  selectTheme(themeKey, nodeId = null) {
    // Handle the case where nodeId might be passed as string 'null'
    if (nodeId === 'null') {
      nodeId = null;
    }

    if (nodeId !== null && nodeId !== undefined) {
      // Always set the specific theme for the node, never affect global
      this.setNodeTheme(nodeId, themeKey);
    } else {
      // Only change global theme when explicitly setting global theme
      this.setGlobalTheme(themeKey);
    }
    this.hideThemeSelector();
  }

  // --- Helper Methods ---


  getNodeFromElement(element) {
    // Traverse up the DOM tree to find a node
    let current = element;
    while (current && current !== document.body) {
      if (current.classList && current.classList.contains("node")) {
        const nodeId = parseInt(current.id.replace("node-", ""));
        return this.nodes.find(n => n.id === nodeId);
      }
      current = current.parentElement;
    }
    return null;
  }

  findNodeAtCanvasPosition(x, y) {
    // Find node that contains the given canvas coordinates
    return this.nodes.find(node => {
      const nodeLeft = node.position.x;
      const nodeTop = node.position.y;
      const nodeRight = node.position.x + 200; // Approximate node width
      const nodeBottom = node.position.y + 150; // Approximate node height

      return x >= nodeLeft && x <= nodeRight && y >= nodeTop && y <= nodeBottom;
    });
  }

  cutIntersectingConnections() {
    if (this.cutPath.length < 2) return;

    const connectionsToRemove = [];

    this.connections.forEach((conn, index) => {
      const startNodeEl = document.getElementById(`node-${conn.start.nodeId}`);
      const endNodeEl = document.getElementById(`node-${conn.end.nodeId}`);

      if (!startNodeEl || !endNodeEl) return;

      // Get screen coordinates from DOM elements (same as connection display)
      const startRect = startNodeEl.getBoundingClientRect();
      const endRect = endNodeEl.getBoundingClientRect();

      // Use the same edge calculation as the display
      const connectionPoints = this.calculateEdgeConnectionPoints(startRect, endRect);

      // Check if the connection line intersects with any segment of the cut path (canvas coordinates)
      for (let i = 0; i < this.cutPathCanvas.length - 1; i++) {
        const cutStart = this.cutPathCanvas[i];
        const cutEnd = this.cutPathCanvas[i + 1];

        if (this.linesIntersect(connectionPoints.start, connectionPoints.end, cutStart, cutEnd)) {
          connectionsToRemove.push(index);
          break;
        }
      }
    });

    // Remove connections in reverse order to maintain indices
    connectionsToRemove.reverse().forEach(index => {
      this.connections.splice(index, 1);
    });

    if (connectionsToRemove.length > 0) {
      this.updateConnections();
    }
  }

  linesIntersect(p1, p2, p3, p4) {
    // Line intersection algorithm
    const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denom === 0) return false; // Lines are parallel

    const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
    const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }

  toggleEdit(nodeId) {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const content = document.getElementById(`content-${nodeId}`);

    // Allow editing for any node type that has content
    if (node.data && node.data.content !== undefined) {
      const isEditing = content.querySelector(".text-editor");

      if (isEditing) {
        // Save and render
        node.data.content = isEditing.value;

        // Clear any width constraints that were set for editing
        content.style.width = "";
        content.style.minWidth = "";
        content.style.overflow = ""; // Restore original overflow behavior

        // Always render as markdown since that's what we support
        content.innerHTML = `<div class="markdown-content">${marked.parse(
          node.data.content
        )}</div>`;

        // Re-highlight syntax after DOM update
        setTimeout(() => {
          const codeBlocks = content.querySelectorAll('pre code');
          codeBlocks.forEach(block => {
            Prism.highlightElement(block);
          });
        }, 0);

        // Update editing state
        this.updateEditingState();

        // Auto-save changes
        this.autoSave();

        // Redraw connections after content size may have changed
        setTimeout(() => {
          this.updateConnections();
        }, 100);
      } else {
        // Edit mode - capture current content width before switching
        const currentWidth = content.offsetWidth;

        const editor = document.createElement("textarea");
        editor.className = "text-editor";
        editor.value = node.data.content;

        // Preserve the content area width by setting it on the container
        content.style.width = currentWidth + "px";
        content.style.minWidth = currentWidth + "px";
        content.style.overflow = "visible"; // Remove scrollbar from container

        editor.style.width = "100%";
        editor.style.height = Math.max(150, content.offsetHeight) + "px";

        content.innerHTML = "";
        content.appendChild(editor);
        editor.focus();

        // Update editing state
        this.updateEditingState();

        // Auto-resize height only, keep width fixed
        editor.addEventListener("input", () => {
          editor.style.height = "auto";
          editor.style.height = Math.max(150, editor.scrollHeight) + "px";

          // Update connections when content size changes
          clearTimeout(this.resizeTimeout);
          this.resizeTimeout = setTimeout(() => {
            this.updateConnections();
          }, 300);
        });
      }
    }
  }

  updateEditingState() {
    // Check if any node is currently being edited
    this.isAnyNodeEditing = document.querySelectorAll('.text-editor').length > 0;
  }

  createConnection(start, end) {
    console.log("createConnection called with:", start, end);
    const connection = { id: Date.now(), start, end };
    this.connections.push(connection);
    console.log(
      "Connection added to array. Total connections:",
      this.connections.length
    );

    this.updateConnections();
    this.mockAPICall("createConnection", connection);
  }

  updateConnections() {
    const svg = document.getElementById("connections");
    if (!svg) return;

    // Clear existing connections but preserve drag line and cut line
    const dragLine = svg.querySelector(".drag-line");
    const cutLine = svg.querySelector(".cut-line");
    svg.innerHTML = "";
    if (dragLine) svg.appendChild(dragLine);
    if (cutLine) svg.appendChild(cutLine);

    this.connections.forEach((conn) => {
      const startNode = this.nodes.find(n => n.id === conn.start.nodeId);
      const endNode = this.nodes.find(n => n.id === conn.end.nodeId);

      if (!startNode || !endNode) return;

      // Use canvas coordinates directly from node positions
      const startRect = {
        left: startNode.position.x,
        top: startNode.position.y,
        width: 300, // Standard node width
        height: 200 // Approximate node height
      };

      const endRect = {
        left: endNode.position.x,
        top: endNode.position.y,
        width: 300,
        height: 200
      };

      // Calculate edge-based connection points
      const connectionPoints = this.calculateEdgeConnectionPoints(startRect, endRect);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = this.createSmoothPath(connectionPoints.start, connectionPoints.end, connectionPoints.direction);
      path.setAttribute("d", d);
      path.setAttribute("class", "connection-line");
      path.setAttribute("marker-end", "url(#arrow)");

      svg.appendChild(path);
    });
  }


    calculateEdgeConnectionPoints(startRect, endRect) {
    // Get centers
    const startCenter = {
      x: startRect.left + startRect.width / 2,
      y: startRect.top + startRect.height / 2
    };
    const endCenter = {
      x: endRect.left + endRect.width / 2,
      y: endRect.top + endRect.height / 2
    };

    // Calculate edges properly from rect properties
    const startRight = startRect.left + startRect.width;
    const startBottom = startRect.top + startRect.height;
    const endRight = endRect.left + endRect.width;
    const endBottom = endRect.top + endRect.height;

    // Calculate which edges to connect based on relative positions
    const dx = endCenter.x - startCenter.x;
    const dy = endCenter.y - startCenter.y;

    // Minimal offset from node edge - just enough so arrow tip touches the edge
    const offset = 2;

    let startPoint, endPoint, direction;

    // Determine best connection points based on angle between nodes
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal connection preferred
      direction = 'horizontal';
      if (dx > 0) {
        // Start from right edge center of start node (with offset)
        startPoint = {
          x: startRight + offset,
          y: startCenter.y
        };
        // End at left edge center of end node
        endPoint = {
          x: endRect.left,
          y: endCenter.y
        };
      } else {
        // Start from left edge center of start node (with offset)
        startPoint = {
          x: startRect.left - offset,
          y: startCenter.y
        };
        // End at right edge center of end node
        endPoint = {
          x: endRight,
          y: endCenter.y
        };
      }
    } else {
      // Vertical connection preferred
      direction = 'vertical';
      if (dy > 0) {
        // Start from bottom edge center of start node (with offset)
        startPoint = {
          x: startCenter.x,
          y: startBottom + offset
        };
        // End at top edge center of end node
        endPoint = {
          x: endCenter.x,
          y: endRect.top
        };
      } else {
        // Start from top edge center of start node (with offset)
        startPoint = {
          x: startCenter.x,
          y: startRect.top - offset
        };
        // End at bottom edge center of end node
        endPoint = {
          x: endCenter.x,
          y: endBottom
        };
      }
    }

    return { start: startPoint, end: endPoint, direction };
  }

  createSmoothPath(start, end, direction) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  // If nodes are very close, use simple direct connection
  if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
    return `M ${start.x},${start.y} L ${end.x},${end.y}`;
  }

  // For horizontal connections (connecting left/right edges)
  // we want to go horizontally from start, then approach the end point horizontally
  if (direction === 'horizontal') {
    // If already horizontally aligned, just go straight
    if (Math.abs(dy) < 20) {
      return `M ${start.x},${start.y} L ${end.x},${end.y}`;
    }
    // Go horizontally from start, then vertically, then horizontally to end
    const midX = (start.x + end.x) / 2;
    return `M ${start.x},${start.y} L ${midX},${start.y} L ${midX},${end.y} L ${end.x},${end.y}`;
  }
  // For vertical connections (connecting top/bottom edges)
  // we want to go vertically from start, then approach the end point vertically
  else {
    // If already vertically aligned, just go straight
    if (Math.abs(dx) < 20) {
      return `M ${start.x},${start.y} L ${end.x},${end.y}`;
    }
    // Go vertically from start, then horizontally, then vertically to end
    const midY = (start.y + end.y) / 2;
    return `M ${start.x},${start.y} L ${start.x},${midY} L ${end.x},${midY} L ${end.x},${end.y}`;
  }
}


  selectNode(node, isShiftClick = false) {
    if (isShiftClick) {
      // Multi-select mode
      if (this.selectedNodes.has(node.id)) {
        // Deselect if already selected
        this.selectedNodes.delete(node.id);
        document.getElementById(`node-${node.id}`).classList.remove("selected");

        // Update single selected node
        if (this.selectedNodes.size === 1) {
          const remainingId = Array.from(this.selectedNodes)[0];
          this.selectedNode = this.nodes.find(n => n.id === remainingId);
        } else {
          this.selectedNode = null;
        }
      } else {
        // Add to selection
        this.selectedNodes.add(node.id);
        document.getElementById(`node-${node.id}`).classList.add("selected");

        // Set as primary selected node if it's the only one
        if (this.selectedNodes.size === 1) {
          this.selectedNode = node;
        }
      }
    } else {
      // Single select mode
      this.deselectAll();
      this.selectedNode = node;
      this.selectedNodes.add(node.id);
      document.getElementById(`node-${node.id}`).classList.add("selected");
    }

    // Highlight connections - if multiple nodes selected, highlight all their connections
    if (this.selectedNodes.size > 1) {
      this.connectionManager.highlightConnectionsForMultipleNodes(Array.from(this.selectedNodes));
    } else if (this.selectedNode) {
      this.connectionManager.highlightConnectionsForNode(this.selectedNode.id);
    } else {
      this.connectionManager.clearConnectionHighlighting();
    }
  }

  deselectAll() {
    document
      .querySelectorAll(".node")
      .forEach((n) => n.classList.remove("selected"));
    this.selectedNode = null;
    this.selectedNodes.clear();

    // Clear connection highlighting when no node is selected
    this.connectionManager.clearConnectionHighlighting();
  }

  exitAllEditModes() {
    // Find all nodes currently in edit mode and save their content
    document.querySelectorAll(".text-editor").forEach(editor => {
      const contentId = editor.parentElement.id;
      const nodeId = parseInt(contentId.replace("content-", ""));

      // Trigger save by calling toggleEdit
      this.toggleEdit(nodeId);
    });

    // Update editing state
    this.updateEditingState();
  }

  showContextMenu(e, node) {
    this.contextNode = node;

    // Check if this is a multi-select context menu
    if (this.selectedNodes.size > 1) {
      // Show alignment menu for multiple nodes
      this.alignmentManager.showAlignmentMenu(e, Array.from(this.selectedNodes));
    } else {
      // Show regular context menu for single node
      const menu = document.getElementById("contextMenu");
      menu.style.left = e.clientX + "px";
      menu.style.top = e.clientY + "px";
      menu.classList.add("show");
    }
  }

  hideContextMenu() {
    document.getElementById("contextMenu").classList.remove("show");
  }

  editNode() {
    if (this.contextNode) {
      this.toggleEdit(this.contextNode.id);
      this.hideContextMenu();
    }
  }

  duplicateNode() {
    if (this.contextNode) {
      const newNode = {
        ...this.contextNode,
        id: this.nodeIdCounter++,
        position: {
          x: this.contextNode.position.x + 30,
          y: this.contextNode.position.y + 30,
        },
        data: { ...this.contextNode.data },
      };
      this.nodes.push(newNode);
      this.renderNode(newNode);
      this.hideContextMenu();
    }
  }

  deleteNode() {
    const node = this.contextNode || this.selectedNode;
    if (node) {
      this.removeNode(node.id);
      this.hideContextMenu();
    }
  }

  removeNode(nodeId) {
    console.log(`Removing node ${nodeId} via button`);

    const element = document.getElementById(`node-${nodeId}`);
    if (element) element.remove();

    const nodesBefore = this.nodes.length;
    const connectionsBefore = this.connectionManager.connections.length;

    this.nodes = this.nodes.filter((n) => n.id !== nodeId);

    // Remove connections through the connection manager
    this.connectionManager.connections = this.connectionManager.connections.filter(
      (c) => c.start.nodeId !== nodeId && c.end.nodeId !== nodeId
    );

    console.log(`Nodes: ${nodesBefore} → ${this.nodes.length}`);
    console.log(`Connections: ${connectionsBefore} → ${this.connectionManager.connections.length}`);

    this.connectionManager.updateConnections();
    this.autoSave();

    this.mockAPICall("deleteNode", { nodeId });
  }

  maximizeNode(nodeId) {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    // Exit edit mode if currently editing
    if (document.querySelector('.text-editor')) {
      this.exitAllEditModes();
    }

    // Create fullscreen overlay
    const overlay = document.createElement('div');
    overlay.className = 'fullscreen-overlay';
    overlay.id = `overlay-${nodeId}`;

    // Create the maximized node content
    const maximizedNode = document.createElement('div');
    maximizedNode.className = 'maximized-node';

    // Apply the node's theme if it has a custom one
    const nodeTheme = this.nodeThemes[nodeId];
    if (nodeTheme && this.themes[nodeTheme]) {
      const theme = this.themes[nodeTheme];
      maximizedNode.style.setProperty('--accent', theme.accent);
      maximizedNode.style.setProperty('--accent-glow', `${theme.accent}40`);
      maximizedNode.style.setProperty('--accent-light', this.lightenColor(theme.accent, 20));
      maximizedNode.classList.add('custom-theme');
    }

    // Add header with edit and close buttons
    const header = document.createElement('div');
    header.className = 'maximized-header';
    header.innerHTML = `
      <div class="maximized-title">${node.type.toUpperCase()}</div>
      <div class="maximized-actions">
        <button class="maximize-btn" onclick="wallboard.toggleMaximizedEdit(${nodeId})" title="Edit">
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
        this.minimizeNode(nodeId);
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
        this.minimizeNode(nodeId);
        document.removeEventListener('keydown', escListener);
      }
    };
    document.addEventListener('keydown', escListener);
    overlay._escListener = escListener;
  }

  minimizeNode(nodeId) {
    const overlay = document.getElementById(`overlay-${nodeId}`);
    if (overlay) {
      // Save any changes if in edit mode before closing
      const content = overlay.querySelector('.maximized-content');
      const editor = content.querySelector('.text-editor');
      if (editor) {
        const node = this.nodes.find((n) => n.id === nodeId);
        if (node && node.data && node.data.content !== undefined) {
          node.data.content = editor.value;
          // Update the original node content as well
          const originalContent = document.getElementById(`content-${nodeId}`);
          if (originalContent) {
            originalContent.innerHTML = `<div class="markdown-content">${marked.parse(node.data.content)}</div>`;

            // Re-highlight syntax for original node
            setTimeout(() => {
              const codeBlocks = originalContent.querySelectorAll('pre code');
              codeBlocks.forEach(block => {
                Prism.highlightElement(block);
              });
            }, 0);
          }
          this.autoSave();
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

  toggleMaximizedEdit(nodeId) {
    const node = this.nodes.find((n) => n.id === nodeId);
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
        content.innerHTML = `<div class="markdown-content">${marked.parse(node.data.content)}</div>`;

        // Re-highlight syntax after DOM update for maximized view
        setTimeout(() => {
          const codeBlocks = content.querySelectorAll('pre code');
          codeBlocks.forEach(block => {
            Prism.highlightElement(block);
          });
        }, 0);

        // Update the original node content as well
        const originalContent = document.getElementById(`content-${nodeId}`);
        if (originalContent) {
          originalContent.innerHTML = `<div class="markdown-content">${marked.parse(node.data.content)}</div>`;

          // Re-highlight syntax for original node too
          setTimeout(() => {
            const codeBlocks = originalContent.querySelectorAll('pre code');
            codeBlocks.forEach(block => {
              Prism.highlightElement(block);
            });
          }, 0);
        }

        this.autoSave();
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

  uploadImage(nodeId) {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const url = prompt("Enter image URL:");
    if (url) {
      node.data.url = url;
      const content = document.getElementById(`content-${nodeId}`);
      content.innerHTML = `<div class="image-node"><img src="${url}" alt="Node image"></div>`;
    }
  }

  clearBoard() {
    if (confirm("Clear all nodes and connections?")) {
      this.nodes = [];
      this.connections = [];
      document.querySelectorAll(".node").forEach((n) => n.remove());
      document.getElementById("connections").innerHTML = "";
    }
  }

  saveBoard() {
    const data = {
      nodes: this.nodes,
      connections: this.connections,
    };

    this.mockAPICall("saveBoard", data).then(() => {
      this.showNotification("Board saved successfully!");
    });
  }

  mockAPICall(endpoint, data) {
    console.log(`Mock API call to: ${endpoint}`, data);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true });
      }, 500);
    });
  }

  showNotification(message) {
    const notif = document.createElement("div");
    notif.style.cssText = `
                    position: fixed;
                    top: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--accent);
                    color: white;
                    padding: 12px 24px;
                    border-radius: 8px;
                    box-shadow: 0 10px 40px rgba(244, 35, 101, 0.4);
                    z-index: 3000;
                    animation: slideDown 0.3s ease;
                `;
    notif.textContent = message;
    document.body.appendChild(notif);

    setTimeout(() => {
      notif.style.animation = "slideUp 0.3s ease";
      setTimeout(() => notif.remove(), 300);
    }, 2000);
  }
}

// Initialize wallboard
const wallboard = new Wallboard();

// Initialize export manager
const exportManager = new ExportManager(wallboard);

// Initialize alignment manager
const alignmentManager = new AlignmentManager(wallboard);
wallboard.alignmentManager = alignmentManager;

// Initialize theme system
wallboard.applyGlobalTheme();
