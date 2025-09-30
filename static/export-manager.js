class ExportManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
  }

  // Export current board as zip file
  async exportCurrentBoard() {
    if (!this.wallboard.currentBoardId) {
      alert('No board to export!');
      return;
    }

    const board = this.wallboard.boards[this.wallboard.currentBoardId];
    const boardName = this.sanitizeFilename(board.name);

    // Create export data
    const exportData = {
      boardInfo: {
        name: board.name,
        id: board.id,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
        globalTheme: board.globalTheme,
        nodeThemes: board.nodeThemes,
        connectionThemes: board.connectionThemes || {}
      },
      nodes: board.nodes,
      connections: board.connections,
      nodeIdCounter: board.nodeIdCounter
    };

    // Create zip file
    await this.createBoardZip(boardName, board.nodes, board.connections, exportData);
  }

  // Export all boards as zip
  async exportAllBoards() {
    const zip = new JSZip();
    const dateString = this.getDateString();

    // Create master metadata file
    const allBoardsData = {
      boards: this.wallboard.boards,
      exportedAt: new Date().toISOString(),
      version: "1.0"
    };

    zip.file("wallboard-backup.json", JSON.stringify(allBoardsData, null, 2));

    // Create individual board folders
    for (const [boardId, board] of Object.entries(this.wallboard.boards)) {
      const boardName = this.sanitizeFilename(board.name);
      const boardFolder = zip.folder(boardName);

      // Add board metadata
      const boardData = {
        boardInfo: {
          name: board.name,
          id: board.id,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
          globalTheme: board.globalTheme,
          nodeThemes: board.nodeThemes,
          connectionThemes: board.connectionThemes || {}
        },
        connections: board.connections,
        nodeIdCounter: board.nodeIdCounter
      };

      // Create connection map
      const connectionMap = this.createConnectionMap(board.nodes, board.connections, boardData);
      boardFolder.file("connections.json", JSON.stringify(connectionMap, null, 2));

      // Add markdown files for each node
      board.nodes.forEach((node, index) => {
        if (node.data && node.data.content) {
          const nodeTitle = this.getNodeTitle([node], node.id);
          const filename = `${String(index + 1).padStart(2, '0')}-${nodeTitle}.md`;
          const markdownContent = this.createMarkdownWithMetadata(node, connectionMap);
          boardFolder.file(filename, markdownContent);
        }
      });
    }

    // Generate and download zip
    const content = await zip.generateAsync({type: "blob"});
    const filename = `wallboard-all-boards-${dateString}.zip`;
    this.downloadBlob(filename, content);

    alert(`Exported ${Object.keys(this.wallboard.boards).length} board(s) to ${filename}`);
  }

  exportAsMarkdownFiles(boardName, nodes, connections, metadata) {
    // Create a ZIP-like structure by downloading multiple files
    const dateString = this.getDateString();

    // Export connection map and metadata
    const connectionMap = {
      metadata: metadata.boardInfo,
      connections: connections.map(conn => ({
        from: this.getNodeTitle(nodes, conn.start.nodeId),
        to: this.getNodeTitle(nodes, conn.end.nodeId),
        fromId: conn.start.nodeId,
        toId: conn.end.nodeId
      })),
      nodePositions: nodes.map(node => ({
        id: node.id,
        title: this.getNodeTitle([node], node.id),
        x: node.position.x,
        y: node.position.y,
        theme: metadata.boardInfo.nodeThemes[node.id] || metadata.boardInfo.globalTheme
      }))
    };

    // Download connection map
    this.downloadFile(
      `${boardName}-connections-${dateString}.json`,
      JSON.stringify(connectionMap, null, 2),
      'application/json'
    );

    // Export each node as a separate markdown file
    nodes.forEach((node, index) => {
      if (node.data && node.data.content) {
        const nodeTitle = this.getNodeTitle([node], node.id);
        const filename = `${boardName}-${String(index + 1).padStart(2, '0')}-${nodeTitle}.md`;

        // Add metadata header to markdown
        const markdownContent = this.createMarkdownWithMetadata(node, connectionMap);

        this.downloadFile(filename, markdownContent, 'text/markdown');
      }
    });

    // Show success message
    setTimeout(() => {
      alert(`Exported ${nodes.length} markdown files and connection map for "${metadata.boardInfo.name}"`);
    }, 500);
  }

  createMarkdownWithMetadata(node, connectionMap) {
    const nodeConnections = connectionMap.connections.filter(
      conn => conn.fromId === node.id || conn.toId === node.id
    );

    let metadata = `---
id: ${node.id}
position:
  x: ${node.position.x}
  y: ${node.position.y}
connections:`;

    if (nodeConnections.length > 0) {
      nodeConnections.forEach(conn => {
        if (conn.fromId === node.id) {
          metadata += `\n  - to: "${conn.to}" (id: ${conn.toId})`;
        } else {
          metadata += `\n  - from: "${conn.from}" (id: ${conn.fromId})`;
        }
      });
    } else {
      metadata += ' []';
    }

    metadata += `\ncreated: ${new Date().toISOString()}
---

`;

    return metadata + node.data.content;
  }

  getNodeTitle(nodes, nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.data || !node.data.content) return `node-${nodeId}`;

    // Extract title from markdown content
    const lines = node.data.content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        return this.sanitizeFilename(trimmed.replace(/^#+\s*/, '').trim());
      }
    }

    // If no heading found, use first few words
    const firstLine = lines[0]?.trim() || '';
    if (firstLine) {
      return this.sanitizeFilename(firstLine.substring(0, 30));
    }

    return `node-${nodeId}`;
  }

  sanitizeFilename(name) {
    return name
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50) || 'untitled';
  }

  getDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  async createBoardZip(boardName, nodes, connections, exportData) {
    const zip = new JSZip();
    const dateString = this.getDateString();

    // Create connection map
    const connectionMap = this.createConnectionMap(nodes, connections, exportData);
    zip.file("connections.json", JSON.stringify(connectionMap, null, 2));

    // Add markdown files for each node
    nodes.forEach((node, index) => {
      if (node.data && node.data.content) {
        const nodeTitle = this.getNodeTitle([node], node.id);
        const filename = `${String(index + 1).padStart(2, '0')}-${nodeTitle}.md`;
        const markdownContent = this.createMarkdownWithMetadata(node, connectionMap);
        zip.file(filename, markdownContent);
      }
    });

    // Generate and download zip
    const content = await zip.generateAsync({type: "blob"});
    const filename = `${boardName}-export-${dateString}.zip`;
    this.downloadBlob(filename, content);

    alert(`Exported board "${exportData.boardInfo.name}" as ${filename}`);
  }

  createConnectionMap(nodes, connections, exportData) {
    return {
      metadata: exportData.boardInfo,
      connections: connections.map(conn => {
        const connId = `${conn.start.nodeId}-${conn.end.nodeId}`;
        return {
          from: this.getNodeTitle(nodes, conn.start.nodeId),
          to: this.getNodeTitle(nodes, conn.end.nodeId),
          fromId: conn.start.nodeId,
          toId: conn.end.nodeId,
          theme: exportData.boardInfo.connectionThemes?.[connId] || 'default'
        };
      }),
      nodePositions: nodes.map(node => ({
        id: node.id,
        title: this.getNodeTitle([node], node.id),
        x: node.position.x,
        y: node.position.y,
        theme: exportData.boardInfo.nodeThemes[node.id] || exportData.boardInfo.globalTheme
      }))
    };
  }

  downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import functionality
  showImportDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.zip';
    input.onchange = (e) => this.handleImportFile(e);
    input.click();
  }

  async handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      if (file.name.endsWith('.zip')) {
        await this.handleZipImport(file);
      } else if (file.name.endsWith('.json')) {
        await this.handleJsonImport(file);
      } else {
        alert('Please select a valid .json or .zip export file.');
      }
    } catch (error) {
      alert('Error importing file. Please check the file format.');
      console.error('Import error:', error);
    }
  }

  async handleJsonImport(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          this.importBoards(data);
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  async handleZipImport(file) {
    const zip = new JSZip();
    const zipData = await zip.loadAsync(file);

    // Check if it's an all-boards backup
    if (zipData.files['wallboard-backup.json']) {
      const backupContent = await zipData.files['wallboard-backup.json'].async('string');
      const allBoardsData = JSON.parse(backupContent);
      this.importBoards(allBoardsData);
      return;
    }

    // Otherwise, try to import as single board zip
    await this.importSingleBoardFromZip(zipData);
  }

  async importSingleBoardFromZip(zipData) {
    const connectionsFile = zipData.files['connections.json'];
    if (!connectionsFile) {
      alert('Invalid zip format: missing connections.json');
      return;
    }

    const connectionsData = JSON.parse(await connectionsFile.async('string'));
    const boardInfo = connectionsData.metadata;

    // Create new board
    const boardId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const board = {
      id: boardId,
      name: boardInfo.name + ' (imported)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      globalTheme: boardInfo.globalTheme || 'default',
      nodeThemes: boardInfo.nodeThemes || {},
      connectionThemes: boardInfo.connectionThemes || {},
      nodes: [],
      connections: [],
      nodeIdCounter: 1
    };

    // Import markdown files as nodes
    const markdownFiles = Object.keys(zipData.files).filter(name => name.endsWith('.md'));
    let maxNodeId = 0;

    console.log(`Found ${markdownFiles.length} markdown files:`, markdownFiles);

    for (const filename of markdownFiles) {
      console.log(`Processing file: ${filename}`);
      const content = await zipData.files[filename].async('string');
      console.log(`File content length: ${content.length}`);
      console.log(`First 200 chars:`, content.substring(0, 200));

      const node = this.parseMarkdownToNode(content);
      if (node) {
        console.log(`Successfully parsed node:`, node);
        board.nodes.push(node);
        maxNodeId = Math.max(maxNodeId, node.id);
      } else {
        console.warn(`Failed to parse node from file: ${filename}`);
      }
    }

    console.log(`Total nodes imported: ${board.nodes.length}`);
    console.log(`All imported nodes:`, board.nodes);

    // Set nodeIdCounter to be higher than any existing node ID
    board.nodeIdCounter = maxNodeId + 1;

    // Rebuild connections based on the connection map
    this.rebuildConnections(board, connectionsData);

    // Add to wallboard and switch to it
    this.wallboard.boards[boardId] = board;
    this.wallboard.saveBoardsToStorage();
    this.wallboard.updateBoardSelector();

    // Load the imported board
    this.wallboard.loadBoard(boardId);

    alert(`Successfully imported board "${board.name}"!`);
  }

  parseMarkdownToNode(markdownContent) {
    // Extract YAML frontmatter
    const yamlMatch = markdownContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!yamlMatch) {
      console.warn('No YAML frontmatter found in markdown');
      return null;
    }

    const [, yamlContent, content] = yamlMatch;
    const metadata = this.parseSimpleYaml(yamlContent);

    if (!metadata.id) {
      console.warn('Node missing ID in markdown metadata');
      console.log('YAML content:', yamlContent);
      console.log('Parsed metadata:', metadata);
      return null;
    }

    return {
      id: metadata.id,
      title: 'markdown', // All imported nodes have markdown title by default
      position: {
        x: metadata.position?.x || Math.random() * 800 + 100,
        y: metadata.position?.y || Math.random() * 600 + 100
      },
      data: {
        content: content.trim()
      }
    };
  }

  parseSimpleYaml(yamlContent) {
    const result = {};
    const lines = yamlContent.split('\n');
    let currentSection = null;

    console.log('Parsing YAML lines:', lines);

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const cleanKey = key.trim();
        const value = valueParts.join(':').trim();

        console.log(`Processing line: "${line}", cleanKey: "${cleanKey}", value: "${value}", isTopLevel: ${!line.startsWith(' ') && !line.startsWith('\t')}`);

        // Top-level fields (no indentation)
        if (!line.startsWith(' ') && !line.startsWith('\t')) {
          if (cleanKey === 'position') {
            result.position = {};
            currentSection = 'position';
          } else if (cleanKey === 'connections') {
            currentSection = 'connections';
          } else if (cleanKey === 'id') {
            result.id = parseInt(value);
            console.log('Set ID to:', result.id);
          } else if (cleanKey === 'created') {
            result.created = value;
          }
        }
        // Indented fields (belongs to current section)
        else if (currentSection === 'position') {
          if (cleanKey === 'x') {
            result.position.x = parseInt(value);
          } else if (cleanKey === 'y') {
            result.position.y = parseInt(value);
          }
        }
      }
    }

    console.log('Final parsed result:', result);
    return result;
  }

  rebuildConnections(board, connectionsData) {
    console.log('Rebuilding connections...');
    console.log('Connection data:', connectionsData.connections);
    console.log('Available node IDs:', board.nodes.map(n => n.id));

    connectionsData.connections.forEach((connData, index) => {
      console.log(`Processing connection ${index}:`, connData);
      const startNode = board.nodes.find(n => n.id === connData.fromId);
      const endNode = board.nodes.find(n => n.id === connData.toId);

      console.log(`Start node found:`, startNode ? 'YES' : 'NO');
      console.log(`End node found:`, endNode ? 'YES' : 'NO');

      if (startNode && endNode) {
        const connection = {
          start: { nodeId: startNode.id },
          end: { nodeId: endNode.id }
        };
        board.connections.push(connection);

        // Restore connection theme if present
        if (connData.theme && connData.theme !== 'default') {
          const connId = `${startNode.id}-${endNode.id}`;
          board.connectionThemes[connId] = connData.theme;
        }

        console.log('Added connection:', connection);
      } else {
        console.warn(`Skipping connection - missing nodes. FromId: ${connData.fromId}, ToId: ${connData.toId}`);
      }
    });

    console.log(`Total connections rebuilt: ${board.connections.length}`);
  }

  importBoards(data) {
    if (data.boards) {
      // Importing all boards
      const importedCount = Object.keys(data.boards).length;

      if (confirm(`This will import ${importedCount} board(s). Continue?`)) {
        // Merge with existing boards (avoiding conflicts)
        Object.entries(data.boards).forEach(([boardId, board]) => {
          // Generate new ID if board already exists
          let newBoardId = boardId;
          if (this.wallboard.boards[boardId]) {
            newBoardId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            board.id = newBoardId;
            board.name = board.name + ' (imported)';
          }
          this.wallboard.boards[newBoardId] = board;
        });

        this.wallboard.saveBoardsToStorage();
        this.wallboard.updateBoardSelector();
        alert(`Successfully imported ${importedCount} board(s)!`);
      }
    } else {
      alert('Invalid export file format.');
    }
  }

  // Export board as GitHub-compatible JSON file
  exportForGitHub() {
    if (!this.wallboard.currentBoardId) {
      alert('No board to export!');
      return;
    }

    const board = this.wallboard.boards[this.wallboard.currentBoardId];
    const boardName = this.sanitizeFilename(board.name);

    // Create GitHub-compatible export data
    const githubData = {
      name: board.name,
      description: `Wallboard exported on ${new Date().toLocaleDateString()}`,
      nodes: board.nodes,
      connections: board.connections,
      connectionThemes: board.connectionThemes || {},
      nodeIdCounter: board.nodeIdCounter,
      globalTheme: board.globalTheme,
      nodeThemes: board.nodeThemes,
      version: "1.0",
      exportedAt: new Date().toISOString()
    };

    // Download as JSON file
    const filename = `${boardName}-wallboard.json`;
    this.downloadFile(filename, JSON.stringify(githubData, null, 2), 'application/json');

    // Show instructions
    setTimeout(() => {
      const githubUrl = `${window.location.origin}${window.location.pathname}?board=YOUR_GITHUB_RAW_URL`;

      alert(`✅ Exported "${board.name}" as GitHub-compatible JSON!

📁 File saved as: ${filename}

🚀 To share this board:
1. Upload ${filename} to a GitHub repository
2. Get the raw file URL from GitHub
3. Share this link: ${githubUrl.replace('YOUR_GITHUB_RAW_URL', '[paste-raw-url-here]')}

Example: ${window.location.origin}${window.location.pathname}?board=https://raw.githubusercontent.com/user/repo/main/board.json`);
    }, 100);
  }

  // Export options dialog
  showExportDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'export-dialog';
    dialog.innerHTML = `
      <div class="export-dialog-content">
        <h3>Export Options</h3>
        <div class="export-options">
          <button class="export-btn" onclick="exportManager.exportForGitHub(); this.closest('.export-dialog').remove();">
            Export for GitHub Sharing
            <small>JSON file for URL sharing</small>
          </button>
          <button class="export-btn" onclick="exportManager.exportCurrentBoard(); this.closest('.export-dialog').remove();">
            Export Current Board
            <small>Markdown files + connection map</small>
          </button>
          <button class="export-btn" onclick="exportManager.exportAllBoards(); this.closest('.export-dialog').remove();">
            Export All Boards
            <small>Complete backup as JSON + markdown</small>
          </button>
          <button class="export-btn" onclick="exportManager.showImportDialog(); this.closest('.export-dialog').remove();">
            Import Boards
            <small>Restore from backup file</small>
          </button>
        </div>
        <button class="export-cancel" onclick="this.closest('.export-dialog').remove();">Cancel</button>
      </div>
    `;

    document.body.appendChild(dialog);

    // Close on background click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }
}