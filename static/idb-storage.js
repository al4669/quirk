/**
 * Fast IndexedDB Storage for QUIRK
 * Replaces localStorage for better performance with large boards
 */

class QuirkStorage {
  constructor() {
    this.dbName = 'QuirkDB';
    this.version = 1;
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores
        if (!db.objectStoreNames.contains('boards')) {
          db.createObjectStore('boards', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }
      };
    });
  }

  async saveBoard(boardId, boardData) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['boards'], 'readwrite');
      const store = transaction.objectStore('boards');
      const request = store.put({ id: boardId, ...boardData });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getBoard(boardId) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['boards'], 'readonly');
      const store = transaction.objectStore('boards');
      const request = store.get(boardId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllBoards() {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['boards'], 'readonly');
      const store = transaction.objectStore('boards');
      const request = store.getAll();

      request.onsuccess = () => {
        const boards = {};
        request.result.forEach(board => {
          boards[board.id] = board;
        });
        resolve(boards);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBoard(boardId) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['boards'], 'readwrite');
      const store = transaction.objectStore('boards');
      const request = store.delete(boardId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveSetting(key, value) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.put(value, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result !== undefined ? request.result : defaultValue);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // API Key Management (secure storage)
  async saveAPIKey(provider, apiKey) {
    const key = `api_key_${provider}`;
    await this.saveSetting(key, apiKey);
  }

  async getAPIKey(provider) {
    const key = `api_key_${provider}`;
    return await this.getSetting(key, '');
  }

  async deleteAPIKey(provider) {
    const key = `api_key_${provider}`;
    await this.initPromise;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // LLM Configuration Management
  async saveLLMConfig(config) {
    await this.saveSetting('llm_config', config);
  }

  async getLLMConfig() {
    return await this.getSetting('llm_config', {
      provider: 'ollama',
      endpoint: 'http://localhost:11434/api/chat',
      model: 'llama3.2'
    });
  }

  // Migration from localStorage
  async migrateFromLocalStorage() {
    console.log('Checking for localStorage data to migrate...');

    const localStorageBoards = localStorage.getItem('wallboard_boards');
    if (localStorageBoards) {
      console.log('Migrating boards from localStorage to IndexedDB...');
      const boards = JSON.parse(localStorageBoards);

      // Save each board to IndexedDB
      for (const [boardId, boardData] of Object.entries(boards)) {
        await this.saveBoard(boardId, boardData);
      }

      console.log(`Migrated ${Object.keys(boards).length} boards to IndexedDB`);
    }

    // Migrate settings
    const lastBoard = localStorage.getItem('wallboard_last_board');
    if (lastBoard) {
      await this.saveSetting('wallboard_last_board', lastBoard);
    }

    const globalTheme = localStorage.getItem('wallboard_global_theme');
    if (globalTheme) {
      await this.saveSetting('wallboard_global_theme', globalTheme);
    }

    // Migrate AI settings to IndexedDB
    let aiEndpoint = localStorage.getItem('ai_chat_endpoint');
    const aiModel = localStorage.getItem('ai_chat_model');
    const aiProvider = localStorage.getItem('ai_chat_provider') || 'ollama';

    // Auto-migrate old direct API endpoints to proxy endpoints
    if (aiEndpoint) {
      if (aiEndpoint.includes('api.anthropic.com')) {
        console.log('Migrating Anthropic endpoint to proxy...');
        aiEndpoint = 'http://localhost:8080/api/anthropic';
        localStorage.setItem('ai_chat_endpoint', aiEndpoint);
      } else if (aiEndpoint.includes('api.openai.com')) {
        console.log('Migrating OpenAI endpoint to proxy...');
        aiEndpoint = 'http://localhost:8080/api/openai';
        localStorage.setItem('ai_chat_endpoint', aiEndpoint);
      }
    }

    if (aiEndpoint || aiModel || aiProvider !== 'ollama') {
      const config = {
        provider: aiProvider,
        endpoint: aiEndpoint || 'http://localhost:11434/api/chat',
        model: aiModel || 'llama3.2'
      };
      await this.saveLLMConfig(config);
      console.log('Migrated AI settings to IndexedDB');
    }

    // Clean up localStorage after successful migration
    if (localStorageBoards || lastBoard || globalTheme) {
      console.log('Migration complete! Cleaning up localStorage...');
      localStorage.removeItem('wallboard_boards');
      localStorage.removeItem('wallboard_last_board');
      localStorage.removeItem('wallboard_global_theme');
    }
  }
}

// Export for use in app.js
if (typeof window !== 'undefined') {
  window.QuirkStorage = QuirkStorage;
}
