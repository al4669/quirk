// AI Chat System - OpenAI-compatible streaming chat with board manipulation
class AIChat {
  constructor(wallboard) {
    this.wallboard = wallboard;
    this.isOpen = false;
    this.messages = [];
    // Load from localStorage for now, will migrate to IndexedDB
    this.provider = localStorage.getItem('ai_chat_provider') || 'ollama';
    this.apiEndpoint = localStorage.getItem('ai_chat_endpoint') || this.getDefaultEndpoint('ollama');
    this.apiModel = localStorage.getItem('ai_chat_model') || this.getDefaultModel('ollama');
    this.apiKey = ''; // Will be loaded from IndexedDB in init()
    this.showThinking = localStorage.getItem('ai_show_thinking') !== 'false'; // Default to true
    this.selectedCharacter = localStorage.getItem('ai_character') || 'buddy'; // 'buddy' or 'read'
    this.customPrompt = localStorage.getItem('ai_custom_prompt') || ''; // Custom personality prompt
    this.customPromptMode = localStorage.getItem('ai_custom_prompt_mode') || 'append'; // 'append' or 'replace'
    // Temperature: null means use model default, otherwise use configured value
    const savedTemp = localStorage.getItem('ai_chat_temperature');
    this.temperature = savedTemp !== null ? parseFloat(savedTemp) : null;
    this.controller = null;
    this.lastOpenTime = 0;
    this.character = null; // Current character instance (Buddy or Read)

    // Tool calling state
    this.pendingToolResults = []; // Store tool results to send back to LLM
    this.currentToolUse = null; // Current tool being accumulated (Anthropic)
    this.accumulatedToolJson = ''; // Accumulated partial JSON (Anthropic)
    this.currentAssistantToolUses = []; // Store tool_use blocks for assistant message
    this.openAIToolCalls = {}; // Accumulate OpenAI tool calls by index
    this.previousToolCalls = []; // Track previous tool calls to detect loops

    this.init();
  }

  getDefaultEndpoint(provider) {
    switch (provider) {
      case 'anthropic': return 'http://localhost:8080/api/anthropic';
      case 'openai': return 'http://localhost:8080/api/openai';
      default: return 'http://localhost:11434/api/chat';
    }
  }

  getDefaultModel(provider) {
    switch (provider) {
      case 'anthropic': return 'claude-sonnet-4-5-20250929';
      case 'openai': return 'gpt-4';
      default: return 'qwen3:4b';
    }
  }

  async init() {
    this.createChatPanel();
    this.initCharacter();
    this.attachEventListeners();
    this.loadChatHistory();

    // Wait for storage to be ready, then load API key from IndexedDB
    await this.ensureStorageReady();

    if (this.wallboard.storage && this.provider !== 'ollama') {
      console.log('Loading API key for provider:', this.provider);
      this.apiKey = await this.wallboard.storage.getAPIKey(this.provider) || '';
      if (this.apiKey) {
        console.log('API key loaded successfully, length:', this.apiKey.length);
      } else {
        console.log('No API key found in IndexedDB for provider:', this.provider);
      }
    }
  }

  async ensureStorageReady() {
    // Wait for wallboard storage to be initialized
    let attempts = 0;
    while (!this.wallboard.storage && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (this.wallboard.storage && this.wallboard.storage.initPromise) {
      await this.wallboard.storage.initPromise;
    }

    if (!this.wallboard.storage) {
      console.error('Storage failed to initialize after 5 seconds');
    }
  }

  initCharacter() {
    console.log('Initializing character:', this.selectedCharacter);

    // Initialize the selected character
    if (this.selectedCharacter === 'read' && typeof ReadCharacter !== 'undefined') {
      console.log('Creating Read character');
      this.character = new ReadCharacter('aiCharacter', {
        width: 90,
        height: 90,
        showShadow: false,
        autoInit: false // Don't auto-init, we'll do it manually
      });
      this.character.init();
      this.character.setState('idle');
    } else if (typeof BuddyCharacter !== 'undefined') {
      console.log('Creating Buddy character');
      // Default to Buddy
      this.character = new BuddyCharacter('aiCharacter', {
        width: 90,
        height: 90,
        showShadow: false,
        autoInit: false // Don't auto-init, we'll do it manually
      });
      this.character.init();
      this.character.setState('idle');
    } else {
      console.warn('Character classes not loaded');
    }
  }

  switchCharacter(characterName) {
    console.log('Switching character from', this.selectedCharacter, 'to', characterName);

    // Clean up old character
    if (this.character) {
      console.log('Destroying old character');
      this.character.destroy();
      this.character = null;
    }

    // Clear the container
    const container = document.getElementById('aiCharacter');
    if (container) {
      console.log('Clearing container');
      container.innerHTML = '';
    }

    // Update selected character
    this.selectedCharacter = characterName;
    localStorage.setItem('ai_character', characterName);
    console.log('Saved character preference:', characterName);

    // Initialize new character
    this.initCharacter();
    console.log('Character switch complete');
  }

  /**
   * Get tool definitions for LLM tool calling
   * @param {string} provider - 'anthropic', 'openai', or 'ollama'
   * Returns array of tools in provider-specific format
   */
  getToolDefinitions(provider = null) {
    // Detect provider if not specified
    if (!provider) {
      provider = this.apiEndpoint.includes('anthropic') ? 'anthropic' : 'openai';
    }

    const isAnthropic = provider === 'anthropic';

    // Base tool definitions (name, description, parameters)
    const baseTools = [
      {
        name: "create_node",
        description: "Create a new node on the board with a title and content. The content should be detailed, useful, and use markdown formatting (lists, bold, etc.). Always provide real content, never placeholders.",
        parameters: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The title of the node (concise, descriptive)"
            },
            content: {
              type: "string",
              description: "The detailed content of the node (use markdown: lists, bold, code blocks, etc.)"
            },
            node_type: {
              type: "string",
              description: "Node type: instruction (planning/guidance), script (JS to run), or markdown (default). Use instruction for goals/steps, script for executable JS, markdown for regular notes."
            }
          },
          required: ["title", "content"]
        }
      },
      {
        name: "edit_node",
        description: "Edit an existing node's content. You can update either the title, content, or both.",
        parameters: {
          type: "object",
          properties: {
            node_id: {
              type: "integer",
              description: "The ID of the node to edit"
            },
            title: {
              type: "string",
              description: "The new title for the node (optional)"
            },
            content: {
              type: "string",
              description: "The new content for the node (optional)"
            },
            node_type: {
              type: "string",
              description: "Update the node type (instruction | script | markdown)."
            }
          },
          required: ["node_id"]
        }
      },
      {
        name: "delete_node",
        description: "Delete a node from the board. Use with caution!",
        parameters: {
          type: "object",
          properties: {
            node_id: {
              type: "integer",
              description: "The ID of the node to delete"
            }
          },
          required: ["node_id"]
        }
      },
      {
        name: "connect_nodes",
        description: "Create a connection between two nodes on the board.",
        parameters: {
          type: "object",
          properties: {
            from_node_id: {
              type: "integer",
              description: "The ID of the source node"
            },
            to_node_id: {
              type: "integer",
              description: "The ID of the target node"
            }
          },
          required: ["from_node_id", "to_node_id"]
        }
      },
      {
        name: "search_nodes",
        description: "Search for nodes on the current board by keyword or phrase. Returns matching nodes with their IDs, titles, and content.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query (searches in both titles and content)"
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_board_state",
        description: "Get the current state of the board including all nodes and connections. Useful for understanding the board before making changes.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "arrange_nodes",
        description: "Automatically arrange all nodes on the board in a clean layout.",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "clear_board",
        description: "Clear all nodes from the board. DESTRUCTIVE - ask user for confirmation first!",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    ];

    // Transform to provider-specific format
    if (isAnthropic) {
      // Anthropic format: flat structure with input_schema
      return baseTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters
      }));
    } else {
      // OpenAI/Ollama format: nested with type and function
      return baseTools.map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));
    }
  }

  /**
   * Execute a tool call from the LLM
   * @param {Object} toolCall - Tool call object with {id, name, input}
   */
  async executeTool(toolCall) {
    const { id, name, input } = toolCall;
    console.log(`[Tool] Executing ${name} with input:`, input);

    let result = {
      success: false,
      data: null,
      error: null
    };

    try {
      switch (name) {
        case 'create_node': {
          const { title, content } = input;
          const nodeType = this.normalizeNodeType(input.node_type || input.nodeType || input.type);
          const position = this.getSmartNodePosition();
          const newNode = this.wallboard.nodeOperationsManager.createNode(
            nodeType,
            { content, nodeType },
            position
          );

          if (newNode) {
            newNode.title = title;
            newNode.content = content;
            newNode.type = nodeType;
            newNode.data = newNode.data || {};
            newNode.data.content = content;
            newNode.data.nodeType = nodeType;

            // Remove and re-render with proper title
            const nodeEl = document.getElementById(`node-${newNode.id}`);
            if (nodeEl) {
              nodeEl.remove();
            }

            this.wallboard.renderNode(newNode);
            // Focus and select the newly created node
            this.wallboard.deselectAll();
            this.wallboard.selectedNode = newNode;
            this.wallboard.selectedNodes.add(newNode.id);
            const renderedEl = document.getElementById(`node-${newNode.id}`);
            renderedEl?.classList.add("selected");
            this.wallboard.focusOnNodes([newNode.id]);
            this.wallboard.autoSave();

            result.success = true;
            result.data = {
              node_id: newNode.id,
              title: newNode.title,
              node_type: nodeType,
              message: `Created node "${title}" with ID ${newNode.id}`
            };

            console.log(`[Tool] Created node ${newNode.id}: "${title}"`);
          } else {
            result.error = 'Failed to create node';
          }
          break;
        }

        case 'edit_node': {
          const { node_id, title, content } = input;
          const incomingType = input.node_type ?? input.nodeType ?? input.type;
          const normalizedType = incomingType !== undefined
            ? this.normalizeNodeType(incomingType)
            : null;
          const node = this.wallboard.getNodeById(node_id);

          if (node) {
            if (title !== undefined) {
              node.title = title;
            }
            if (content !== undefined) {
              node.content = content;
              node.data = node.data || {};
              node.data.content = content;
            }
            if (normalizedType) {
              node.data = node.data || {};
              node.data.nodeType = normalizedType;
              node.type = normalizedType;
            }

            // Re-render the node
            const nodeEl = document.getElementById(`node-${node_id}`);
            if (nodeEl) {
              nodeEl.remove();
            }
            this.wallboard.renderNode(node);
            this.wallboard.autoSave();

            result.success = true;
            result.data = {
              node_id: node_id,
              node_type: node.data?.nodeType || node.type,
              message: `Updated node ${node_id}`
            };

            console.log(`[Tool] Edited node ${node_id}`);
          } else {
            result.error = `Node ${node_id} not found`;
          }
          break;
        }

        case 'delete_node': {
          const { node_id } = input;
          const node = this.wallboard.getNodeById(node_id);

          if (node) {
            this.wallboard.removeNode(node_id);

            result.success = true;
            result.data = {
              message: `Deleted node ${node_id}`
            };

            console.log(`[Tool] Deleted node ${node_id}`);
          } else {
            result.error = `Node ${node_id} not found`;
          }
          break;
        }

        case 'connect_nodes': {
          const { from_node_id, to_node_id } = input;
          const fromNode = this.wallboard.getNodeById(from_node_id);
          const toNode = this.wallboard.getNodeById(to_node_id);

          if (fromNode && toNode) {
            this.wallboard.connectionManager.createConnection(
              { nodeId: from_node_id },
              { nodeId: to_node_id }
            );

            result.success = true;
            result.data = {
              message: `Connected node ${from_node_id} to ${to_node_id}`
            };

            console.log(`[Tool] Connected ${from_node_id} → ${to_node_id}`);
          } else {
            result.error = `One or both nodes not found: ${from_node_id}, ${to_node_id}`;
          }
          break;
        }

        case 'search_nodes': {
          const { query } = input;
          const matchingNodes = this.wallboard.nodes.filter(node => {
            const title = this.wallboard.getNodeTitle(node).toLowerCase();
            const content = (node.content || '').toLowerCase();
            const searchQuery = query.toLowerCase();
            return title.includes(searchQuery) || content.includes(searchQuery);
          });

          result.success = true;
          result.data = {
            count: matchingNodes.length,
            nodes: matchingNodes.map(n => ({
              id: n.id,
              title: this.wallboard.getNodeTitle(n),
              content: n.content ? n.content.substring(0, 200) : ''
            }))
          };

          console.log(`[Tool] Found ${matchingNodes.length} nodes matching "${query}"`);
          break;
        }

        case 'get_board_state': {
          const boardInfo = {
            board_name: this.wallboard.boards[this.wallboard.currentBoardId]?.name || 'Unknown',
            node_count: this.wallboard.nodes.length,
            connection_count: this.wallboard.connectionManager.connections.length,
            nodes: this.wallboard.nodes.map(n => ({
              id: n.id,
              title: this.wallboard.getNodeTitle(n),
              content: (n.data?.content || n.content || '').substring(0, 150),
              type: n.data?.nodeType || n.type || 'markdown',
              node_type: n.data?.nodeType || n.type || 'markdown'
            })),
            connections: this.wallboard.connectionManager.connections.map(c => ({
              from: c.source?.nodeId,
              to: c.target?.nodeId
            }))
          };

          result.success = true;
          result.data = boardInfo;

          console.log(`[Tool] Retrieved board state: ${boardInfo.node_count} nodes, ${boardInfo.connection_count} connections`);
          break;
        }

        case 'arrange_nodes': {
          this.wallboard.autoArrangeNodes();

          result.success = true;
          result.data = {
            message: 'Arranged all nodes automatically'
          };

          console.log(`[Tool] Auto-arranged nodes`);
          break;
        }

        case 'clear_board': {
          // Clear all nodes
          const nodeCount = this.wallboard.nodes.length;
          this.wallboard.nodes.forEach(node => {
            this.wallboard.removeNode(node.id);
          });

          result.success = true;
          result.data = {
            message: `Cleared board (removed ${nodeCount} nodes)`
          };

          console.log(`[Tool] Cleared board (${nodeCount} nodes removed)`);
          break;
        }

        default:
          result.error = `Unknown tool: ${name}`;
          console.error(`[Tool] Unknown tool: ${name}`);
      }
    } catch (error) {
      result.success = false;
      result.error = error.message;
      console.error(`[Tool] Error executing ${name}:`, error);
    }

    // Store result for next API call
    this.pendingToolResults.push({
      id: id,
      name: name,
      result: result
    });

    return result;
  }

  /**
   * Build tool result messages for the next API call
   * Format varies by provider (Anthropic vs OpenAI/Ollama)
   */
  buildToolResultMessages() {
    if (this.pendingToolResults.length === 0) {
      return [];
    }

    console.log(`[Tool] Building result messages for ${this.pendingToolResults.length} tools`);

    // Detect provider from current endpoint
    const isAnthropic = this.apiEndpoint.includes('anthropic');

    if (isAnthropic) {
      // Anthropic format: single user message with tool_result content blocks
      return [{
        role: 'user',
        content: this.pendingToolResults.map(tr => ({
          type: 'tool_result',
          tool_use_id: tr.id,
          content: JSON.stringify(tr.result)
        }))
      }];
    } else {
      // OpenAI/Ollama format: separate messages with role "tool"
      return this.pendingToolResults.map(tr => ({
        role: 'tool',
        tool_call_id: tr.id, // OpenAI uses this
        name: tr.name, // Ollama might use this
        content: JSON.stringify(tr.result)
      }));
    }
  }

  createChatPanel() {
    const chatPanel = document.createElement('div');
    chatPanel.id = 'ai-chat-panel';
    chatPanel.className = 'ai-chat-panel';
    chatPanel.innerHTML = `
      <div class="ai-chat-header">
        <div class="ai-chat-header-left">
          <div id="aiCharacter" class="ai-chat-buddy"></div>
        </div>
        <div class="ai-chat-header-right">
          <button class="ai-header-btn" id="aiChatSettings" title="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"></path>
            </svg>
          </button>
          <button class="ai-header-btn" id="aiChatClear" title="Clear Chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button class="ai-header-btn" id="aiChatClose" title="Close (K)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="ai-chat-messages" id="aiChatMessages">
        <div class="ai-welcome-message">
          <div class="ai-welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h3>AI Board Assistant</h3>
          <p>I can help you create, edit, and organize your boards. Try asking me to:</p>
          <ul>
            <li>Create a new board from scratch</li>
            <li>Add nodes with specific content</li>
            <li>Organize and arrange nodes</li>
            <li>Connect related ideas</li>
            <li>Brainstorm and expand on topics</li>
          </ul>
          <div class="ai-welcome-shortcut">Press <kbd>K</kbd> to open this panel anytime</div>
        </div>
      </div>

      <div class="ai-chat-input-container">
        <div class="ai-chat-input-wrapper">
          <textarea
            id="aiChatInput"
            class="ai-chat-input"
            placeholder="Ask me anything about your boards..."
            rows="1"
          ></textarea>
          <button class="ai-send-btn" id="aiSendBtn" title="Send (Enter)">
            <svg class="ai-send-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            <svg class="ai-stop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
              <rect x="6" y="6" width="12" height="12"></rect>
            </svg>
          </button>
        </div>
        <div class="ai-input-hints">
          <span class="ai-hint">Shift+Enter for new line</span>
          <span class="ai-hint">Enter to send</span>
        </div>
      </div>

      <!-- Settings Modal -->
      <div class="ai-settings-modal" id="aiSettingsModal" style="display: none;" data-form-type="other">
        <div class="ai-settings-content" data-form-type="other">
          <h3>AI Chat Settings</h3>
          <!-- Dummy fields to prevent password manager interference -->
          <input type="text" name="prevent-autofill" autocomplete="off" style="display: none;" tabindex="-1" aria-hidden="true">
          <input type="password" name="prevent-autofill-pw" autocomplete="off" style="display: none;" tabindex="-1" aria-hidden="true">

          <div class="ai-settings-field">
            <label>Character</label>
            <select id="aiCharacterSelect" style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; color: var(--text); font-size: 14px; outline: none;">
              <option value="buddy" ${this.selectedCharacter === 'buddy' ? 'selected' : ''}>🌥️ Buddy - Friendly Cloud (Sounds)</option>
              <option value="read" ${this.selectedCharacter === 'read' ? 'selected' : ''}>🤖 Read - Robot Reader (Voice)</option>
            </select>
            <small>Choose your AI assistant character. Buddy uses cute sounds, Read uses text-to-speech.</small>
          </div>

          <div class="ai-settings-field">
            <label>LLM Provider</label>
            <select id="aiProviderSelect" style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; color: var(--text); font-size: 14px; outline: none;">
              <option value="ollama" ${this.provider === 'ollama' ? 'selected' : ''}>🦙 Ollama (Local)</option>
              <option value="anthropic" ${this.provider === 'anthropic' ? 'selected' : ''}>🤖 Claude (Anthropic)</option>
              <option value="openai" ${this.provider === 'openai' ? 'selected' : ''}>🧠 OpenAI</option>
            </select>
            <small>Choose your LLM backend. Ollama runs locally, others require API keys.</small>
          </div>

          <div class="ai-settings-field" id="aiApiKeyField" style="display: ${this.provider !== 'ollama' ? 'block' : 'none'};">
            <label>API Key</label>
            <input type="password" id="aiApiKeyInput" name="api-token-key" value="${this.apiKey || ''}" placeholder="sk-ant-... or sk-..." autocomplete="off" data-form-type="other" data-lpignore="true" aria-label="API Token" readonly>
            <small>Your API key (stored securely in IndexedDB). Required for Claude and OpenAI.</small>
          </div>

          <div class="ai-settings-field">
            <label>API Endpoint</label>
            <input type="text" id="aiEndpointInput" value="${this.apiEndpoint}" placeholder="http://localhost:11434/api/chat">
            <small id="aiEndpointHint">Ollama native: http://localhost:11434/api/chat</small>
          </div>
          <div class="ai-settings-field">
            <label>Model Name</label>
            <input type="text" id="aiModelInput" value="${this.apiModel}" placeholder="qwen3:4b">
            <small id="aiModelHint">For Ollama: qwen3:4b, llama3.2, mistral, etc.</small>
          </div>
          <div class="ai-settings-field">
            <label>Temperature</label>
            <input type="number" id="aiTemperatureInput" value="${this.temperature !== null ? this.temperature : ''}" min="0" max="2" step="0.1" placeholder="1.0">
            <small>Controls randomness (0-2). Higher = more creative. Some models only support default (1). Leave empty to use model default.</small>
          </div>
          <div class="ai-settings-field">
            <label>Custom Prompt <button type="button" class="ai-prompt-show-default" id="aiShowDefaultPrompt" title="View Default Prompt">👁️ View Default</button></label>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <label style="display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: normal;">
                <input type="radio" name="promptMode" value="append" ${this.customPromptMode === 'append' ? 'checked' : ''} style="margin: 0;">
                <span>Append</span>
              </label>
              <label style="display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: normal;">
                <input type="radio" name="promptMode" value="replace" ${this.customPromptMode === 'replace' ? 'checked' : ''} style="margin: 0;">
                <span>Replace</span>
              </label>
            </div>
            <textarea id="aiCustomPromptInput" rows="6" placeholder="Add custom personality or instructions here...">${this.customPrompt}</textarea>
            <small><strong>Append:</strong> Adds to default personality. <strong>Replace:</strong> Completely overrides personality section. Tools/board info always included.</small>
          </div>
          <div class="ai-settings-field">
            <label style="display: flex; align-items: center; gap: 8px;">
              <input type="checkbox" id="aiShowThinkingInput" ${this.showThinking ? 'checked' : ''} style="width: auto; margin: 0;">
              <span>Show AI Thinking Process</span>
            </label>
            <small>Display the AI's reasoning steps (can be collapsed). Thinking gives better answers.</small>
          </div>
          <div class="ai-settings-actions">
            <button class="ai-settings-btn ai-settings-save" id="aiSettingsSave">Save</button>
            <button class="ai-settings-btn ai-settings-cancel" id="aiSettingsCancel">Cancel</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(chatPanel);
  }

  attachEventListeners() {
    // Prevent wheel events from propagating to canvas
    const panel = document.getElementById('ai-chat-panel');
    panel.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: false });

    // Close on click outside (with slight delay to avoid closing immediately after opening)
    document.addEventListener('mousedown', (e) => {
      if (this.isOpen && !panel.contains(e.target)) {
        // Use a small timeout to ensure the panel has fully opened before allowing outside clicks to close it
        if (Date.now() - this.lastOpenTime > 100) {
          this.close();
        }
      }
    });

    // Prevent clicks inside panel from propagating
    panel.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    // Close button
    document.getElementById('aiChatClose').addEventListener('click', () => this.close());

    // Send button
    document.getElementById('aiSendBtn').addEventListener('click', () => this.handleSend());

    // Input handling
    const input = document.getElementById('aiChatInput');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    });

    // Settings button
    document.getElementById('aiChatSettings').addEventListener('click', () => this.openSettings());

    // Settings modal
    document.getElementById('aiSettingsSave').addEventListener('click', () => this.saveSettings());
    document.getElementById('aiSettingsCancel').addEventListener('click', () => this.closeSettings());

    // Show default prompt button
    document.getElementById('aiShowDefaultPrompt').addEventListener('click', () => this.showDefaultPrompt());

    // Provider selection handler
    document.getElementById('aiProviderSelect').addEventListener('change', async (e) => {
      await this.updateProviderUI(e.target.value);
    });

    // Clear chat
    document.getElementById('aiChatClear').addEventListener('click', () => this.clearChat());

    // Prevent password manager interference on API key field
    // Make it readonly initially, then remove readonly on focus
    const apiKeyInput = document.getElementById('aiApiKeyInput');
    if (apiKeyInput) {
      apiKeyInput.setAttribute('readonly', 'true');
      apiKeyInput.addEventListener('focus', function () {
        this.removeAttribute('readonly');
      });
      apiKeyInput.addEventListener('blur', function () {
        // Re-add readonly after a short delay to prevent autofill on blur
        setTimeout(() => {
          this.setAttribute('readonly', 'true');
        }, 100);
      });
    }
  }

  async updateProviderUI(provider) {
    const apiKeyField = document.getElementById('aiApiKeyField');
    const apiKeyInput = document.getElementById('aiApiKeyInput');
    const endpointInput = document.getElementById('aiEndpointInput');
    const modelInput = document.getElementById('aiModelInput');
    const endpointHint = document.getElementById('aiEndpointHint');
    const modelHint = document.getElementById('aiModelHint');

    // Show/hide API key field
    apiKeyField.style.display = provider !== 'ollama' ? 'block' : 'none';

    // Load saved API key for this provider
    if (provider !== 'ollama' && this.wallboard.storage) {
      await this.ensureStorageReady();
      const savedKey = await this.wallboard.storage.getAPIKey(provider);
      if (apiKeyInput) {
        apiKeyInput.value = savedKey || '';
        // Apply readonly to prevent password manager interference
        apiKeyInput.setAttribute('readonly', 'true');
      }
    } else if (apiKeyInput) {
      apiKeyInput.value = '';
      apiKeyInput.setAttribute('readonly', 'true');
    }

    // Update default endpoint and model
    endpointInput.value = this.getDefaultEndpoint(provider);
    modelInput.value = this.getDefaultModel(provider);

    // Update hints
    switch (provider) {
      case 'anthropic':
        endpointHint.textContent = 'Proxy endpoint (runs on your local server to bypass CORS)';
        modelHint.textContent = 'claude-sonnet-4-5-20250929, claude-3-5-sonnet-20241022, claude-3-opus-20240229';
        break;
      case 'openai':
        endpointHint.textContent = 'Proxy endpoint (runs on your local server to bypass CORS)';
        modelHint.textContent = 'gpt-4, gpt-3.5-turbo, etc.';
        break;
      default:
        endpointHint.textContent = 'Ollama native: http://localhost:11434/api/chat';
        modelHint.textContent = 'For Ollama: qwen3:4b, llama3.2, mistral, etc.';
    }
  }

  async handleSend() {
    console.log('handleSend called');
    const input = document.getElementById('aiChatInput');
    const message = input.value.trim();
    console.log('Message:', message);
    console.log('Controller:', this.controller);

    if (!message || this.controller) {
      console.log('Send blocked - empty message or already processing');
      return; // Don't send if empty or already processing
    }

    // Add user message
    this.addMessage('user', message);
    input.value = '';
    input.style.height = 'auto';

    // Show assistant thinking
    const assistantMsgId = this.addMessage('assistant', '');
    this.setStatus('thinking');
    if (this.character) this.character.setState('thinking');

    // Show stop button
    this.toggleSendButton(true);

    try {
      await this.streamResponse(message, assistantMsgId);
    } catch (error) {
      console.error('Chat error:', error);
      this.updateMessage(assistantMsgId, `Error: ${error.message}`);
      this.setStatus('error');
      if (this.character) this.character.setState('idle');
    } finally {
      this.toggleSendButton(false);
      this.setStatus('idle');
      // Don't set character to idle if it's still speaking (Read character manages its own state)
      if (this.character && this.selectedCharacter !== 'read') {
        this.character.setState('idle');
      }
      this.saveChatHistory();
    }
  }

  async streamResponse(userMessage, assistantMsgId, providedMessages = null, toolCallRound = 0) {
    // Limit tool calling rounds to prevent infinite loops
    const MAX_TOOL_ROUNDS = 5;

    if (toolCallRound >= MAX_TOOL_ROUNDS) {
      console.warn(`[Tool] Maximum tool calling rounds (${MAX_TOOL_ROUNDS}) reached, stopping to prevent infinite loop`);

      // Get current message content and append a note
      const messageDiv = document.getElementById(`ai-msg-${assistantMsgId}`);
      if (messageDiv) {
        const textDiv = messageDiv.querySelector('.ai-message-text');
        const currentContent = textDiv.innerHTML;
        textDiv.innerHTML = currentContent + '<br><br><em style="color: var(--text-tertiary);">[Stopped: Tool calling limit reached to prevent infinite loop]</em>';
      }

      return;
    }

    console.log(`[Tool] Starting stream response, round ${toolCallRound} of max ${MAX_TOOL_ROUNDS}`);

    // Reset tool use tracking for this response
    this.currentAssistantToolUses = [];
    this.openAIToolCalls = {};

    // Clear previous tool calls if this is round 0 (new conversation turn)
    if (toolCallRound === 0) {
      this.previousToolCalls = [];
    }

    // Ensure storage is ready and API key is loaded for cloud providers
    if (this.provider !== 'ollama' && !this.apiKey) {
      await this.ensureStorageReady();
      if (this.wallboard.storage) {
        console.log('Loading API key for provider:', this.provider);
        this.apiKey = await this.wallboard.storage.getAPIKey(this.provider) || '';
      }
    }

    this.controller = new AbortController();
    let hasStartedTalking = false; // Track if we've switched to talking yet
    let lastThinkingTime = Date.now(); // Track when we last received thinking chunks

    // Reset speech buffer for new message
    if (this.selectedCharacter === 'read' && this.character) {
      this.speechBuffer = '';
      this.lastSpokenIndex = 0;
      // Clear any existing queued speech
      if (this.character.speechQueue) {
        this.character.stopSpeech();
      }
    }

    // Build system prompt with board manipulation capabilities
    const systemPrompt = this.buildSystemPrompt();

    // Use provided messages if available (for multi-turn tool calling)
    // Otherwise build from message history
    let messages;

    if (providedMessages) {
      // Use pre-built messages (includes tool_use and tool_result blocks)
      messages = [{ role: 'system', content: systemPrompt }, ...providedMessages];
      console.log('[Tool] Using provided messages for continuation');
    } else {
      // Build message history - only include if there are saved messages
      messages = [
        { role: 'system', content: systemPrompt },
        // Only include recent history if messages array is not empty, and filter out empty messages
        // Note: content can be a string or array (for tool results)
        ...(this.messages.length > 0 ? this.messages.slice(-10).filter(m => {
          if (!m.content) return false;
          if (typeof m.content === 'string') return m.content.trim() !== '';
          if (Array.isArray(m.content)) return m.content.length > 0;
          return true;
        }).map(m => ({ role: m.role, content: m.content })) : [])
      ];

      // Only add current user message if it's not empty
      // (for multi-turn tool calling, userMessage can be empty)
      if (userMessage && userMessage.trim()) {
        messages.push({ role: 'user', content: userMessage });
      }
    }

    console.log(`Sending ${messages.length} messages (including system prompt and current message)`);
    console.log('History messages:', this.messages.length);

    // Detect provider type
    const isOllamaNative = this.apiEndpoint.includes('/api/chat');
    const isAnthropic = this.apiEndpoint.includes('anthropic') && !isOllamaNative;
    const isOpenAI = this.apiEndpoint.includes('openai') && !isOllamaNative;

    // Build headers
    let headers = {
      'Content-Type': 'application/json',
    };

    // Build request body based on provider
    let requestBody;

    if (isAnthropic) {
      // Anthropic via proxy
      if (!this.apiKey) {
        throw new Error('API key required for Anthropic Claude. Please add your API key in settings.');
      }

      // Anthropic requires system prompt separate from messages
      const systemMessage = messages.find(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      requestBody = {
        apiKey: this.apiKey, // Proxy extracts this
        model: this.apiModel,
        max_tokens: 4096,
        messages: userMessages,
        tools: this.getToolDefinitions(), // Native tool use
        stream: true,
      };

      // Only add temperature if configured (some models require default)
      if (this.temperature !== null && this.temperature !== undefined) {
        requestBody.temperature = this.temperature;
      }

      if (systemMessage) {
        requestBody.system = systemMessage.content;
      }
    } else if (isOpenAI) {
      // OpenAI via proxy
      if (!this.apiKey) {
        throw new Error('API key required for OpenAI. Please add your API key in settings.');
      }

      requestBody = {
        apiKey: this.apiKey, // Proxy extracts this
        model: this.apiModel,
        messages: messages,
        tools: this.getToolDefinitions(), // Native tool use
        tool_choice: "auto", // Let model decide when to use tools
        stream: true,
      };

      // Only add temperature if configured (some models require default)
      if (this.temperature !== null && this.temperature !== undefined) {
        requestBody.temperature = this.temperature;
      }
    } else {
      // Ollama native API
      requestBody = {
        model: this.apiModel,
        messages: messages,
        tools: this.getToolDefinitions(), // Native tool use
        stream: true,
        think: true // Enable thinking for better responses
      };

      // Only add temperature if configured (some models require default)
      if (this.temperature !== null && this.temperature !== undefined) {
        requestBody.temperature = this.temperature;
      }
    }

    console.log('Sending request to:', this.apiEndpoint, 'Provider:', this.provider);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
      signal: this.controller.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API error response:', errorText);
      throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let fullThinking = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          let json;

          // Handle SSE format (data: prefix) for OpenAI/Anthropic
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            json = JSON.parse(data);
          } else {
            // Handle plain JSON format (Ollama)
            json = JSON.parse(trimmed);
          }

          // Check if response is done (Ollama format)
          if (json.done) continue;

          // Extract thinking, content, and tool calls based on provider
          let thinking = '';
          let content = '';
          let hasToolCall = false;

          if (isAnthropic) {
            // Anthropic SSE format with tool use support
            if (json.type === 'content_block_start') {
              const block = json.content_block;
              if (block.type === 'tool_use') {
                // Start of a new tool use block
                this.currentToolUse = {
                  id: block.id,
                  name: block.name,
                  input: null
                };
                this.accumulatedToolJson = '';
                hasToolCall = true;
                console.log('[Tool] Starting tool use:', block.name);
              }
            } else if (json.type === 'content_block_delta') {
              const delta = json.delta;
              if (delta.type === 'input_json_delta') {
                // Accumulate partial JSON for tool input
                this.accumulatedToolJson += delta.partial_json;
                hasToolCall = true;
              } else if (delta.type === 'text_delta') {
                // Regular text content
                content = delta.text || '';
              }
            } else if (json.type === 'content_block_stop') {
              // End of content block
              if (this.currentToolUse && this.accumulatedToolJson) {
                // Parse completed JSON and execute tool
                try {
                  this.currentToolUse.input = JSON.parse(this.accumulatedToolJson);
                  console.log('[Tool] Completed tool JSON:', this.currentToolUse);

                  // Save tool_use block for assistant message
                  this.currentAssistantToolUses.push({
                    type: 'tool_use',
                    id: this.currentToolUse.id,
                    name: this.currentToolUse.name,
                    input: this.currentToolUse.input
                  });

                  // Update message to show we're still working (keeps thinking animation alive)
                  if (!fullResponse) {
                    this.updateMessage(assistantMsgId, '', fullThinking);
                  }

                  await this.executeTool(this.currentToolUse);
                  hasToolCall = true;
                } catch (e) {
                  console.error('[Tool] Failed to parse tool JSON:', this.accumulatedToolJson, e);
                }
                this.currentToolUse = null;
                this.accumulatedToolJson = '';
              }
            }
          } else if (isOpenAI) {
            // OpenAI format with tool calls
            const delta = json.choices?.[0]?.delta;
            content = delta?.content || '';

            if (delta?.tool_calls) {
              // OpenAI tool calls come in chunks with an index
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;

                // Initialize tool call accumulator if needed
                if (!this.openAIToolCalls[index]) {
                  this.openAIToolCalls[index] = {
                    id: toolCallDelta.id || null,
                    type: 'function',
                    function: {
                      name: '',
                      arguments: ''
                    }
                  };
                }

                // Accumulate data
                if (toolCallDelta.id) {
                  this.openAIToolCalls[index].id = toolCallDelta.id;
                }
                if (toolCallDelta.function?.name) {
                  this.openAIToolCalls[index].function.name += toolCallDelta.function.name;
                }
                if (toolCallDelta.function?.arguments) {
                  this.openAIToolCalls[index].function.arguments += toolCallDelta.function.arguments;
                }

                hasToolCall = true;
              }
            }

            // Check if we got finish_reason = tool_calls (means tool calls are complete)
            if (json.choices?.[0]?.finish_reason === 'tool_calls') {
              console.log('[Tool] OpenAI tool calls completed');
              console.log('[Tool] Raw accumulated tool calls:', this.openAIToolCalls);

              // Process all accumulated tool calls
              for (const index in this.openAIToolCalls) {
                const toolCall = this.openAIToolCalls[index];
                console.log('[Tool] Processing tool call index', index);
                console.log('[Tool] Arguments type:', typeof toolCall.function.arguments);
                console.log('[Tool] Arguments length:', toolCall.function.arguments.length);
                console.log('[Tool] First 100 chars:', toolCall.function.arguments.substring(0, 100));

                try {
                  let parsedArgs;

                  // Try to parse the arguments
                  try {
                    parsedArgs = JSON.parse(toolCall.function.arguments);
                    console.log('[Tool] Successfully parsed arguments on first try');
                  } catch (parseError) {
                    // If parsing fails, the arguments might already be an object or have control chars
                    console.warn('[Tool] Direct JSON parse failed:', parseError.message);
                    console.warn('[Tool] Problematic JSON:', toolCall.function.arguments);

                    // Check if it's already an object
                    if (typeof toolCall.function.arguments === 'object') {
                      console.log('[Tool] Arguments are already an object');
                      parsedArgs = toolCall.function.arguments;
                    } else {
                      // Try to sanitize the JSON string
                      // The issue is that the string might contain actual newline/tab characters
                      // inside JSON string values, which need to be escaped
                      console.log('[Tool] Attempting to sanitize control characters');

                      // The OpenAI streaming API seems to send JSON with literal control characters
                      // We need to properly escape them for JSON parsing
                      // Strategy: Just escape literal control characters, don't touch backslashes
                      // since properly formatted escape sequences like \n should already work
                      let sanitized = toolCall.function.arguments;

                      // Only replace literal control characters (actual 0x0A, 0x0D, 0x09 bytes)
                      sanitized = sanitized
                        .replace(/\n/g, '\\n')    // Literal newlines
                        .replace(/\r/g, '\\r')    // Literal carriage returns
                        .replace(/\t/g, '\\t')    // Literal tabs
                        .replace(/\f/g, '\\f')    // Form feeds
                        .replace(/\b/g, '\\b');   // Backspaces

                      console.log('[Tool] Sanitized JSON (first 100 chars):', sanitized.substring(0, 100));

                      try {
                        parsedArgs = JSON.parse(sanitized);
                        console.log('[Tool] Successfully parsed after sanitization');
                      } catch (sanitizeError) {
                        console.error('[Tool] Still failed after sanitization:', sanitizeError.message);
                        throw sanitizeError;
                      }
                    }
                  }

                  const toolUse = {
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: parsedArgs
                  };
                  console.log('[Tool] Executing OpenAI tool:', toolUse);

                  // Save tool_use for message history (OpenAI format)
                  // For the arguments, we need to ensure it's a valid JSON string
                  let argsString;
                  if (typeof toolCall.function.arguments === 'string') {
                    argsString = toolCall.function.arguments;
                  } else {
                    argsString = JSON.stringify(toolCall.function.arguments);
                  }

                  this.currentAssistantToolUses.push({
                    id: toolCall.id,
                    type: 'function',
                    function: {
                      name: toolCall.function.name,
                      arguments: argsString
                    }
                  });

                  // Update message to show we're still working
                  if (!fullResponse) {
                    this.updateMessage(assistantMsgId, '', '');
                  }

                  await this.executeTool(toolUse);
                } catch (e) {
                  console.error('[Tool] Failed to execute OpenAI tool call:', e);
                  console.error('[Tool] Tool call data:', toolCall);
                  console.error('[Tool] Arguments string:', toolCall.function.arguments);
                }
              }
            }
          } else {
            // Ollama format with tool calls
            thinking = json.message?.thinking || '';
            content = json.message?.content || '';

            if (json.message?.tool_calls) {
              // Ollama tool calls (complete JSON in one chunk)
              for (const toolCall of json.message.tool_calls) {
                const toolUse = {
                  id: `ollama_${Date.now()}_${Math.random()}`, // Generate ID for Ollama
                  name: toolCall.function.name,
                  input: toolCall.function.arguments
                };
                console.log('[Tool] Ollama tool call:', toolUse);

                // Save tool_use for message history (Ollama uses same format as OpenAI)
                this.currentAssistantToolUses.push({
                  id: toolUse.id,
                  type: 'function',
                  function: {
                    name: toolCall.function.name,
                    arguments: JSON.stringify(toolCall.function.arguments)
                  }
                });

                // Update message to show we're still working (keeps thinking animation alive)
                if (!fullResponse) {
                  this.updateMessage(assistantMsgId, '', thinking);
                }

                await this.executeTool(toolUse);
                hasToolCall = true;
              }
            }
          }

          // Debug: Log what we're receiving
          if (thinking) {
            console.log('Received thinking chunk:', thinking.substring(0, 50));
          }
          if (content) {
            console.log('Received content chunk:', content.substring(0, 50));
          }

          // Check if content contains <think> tags
          if (content && content.includes('<think>')) {
            console.warn('WARNING: Content contains <think> tags!', content.substring(0, 100));
          }

          // Accumulate thinking separately
          if (thinking && thinking.trim()) {
            fullThinking += thinking;
            lastThinkingTime = Date.now();
          }

          // Add content chunk (including spaces!)
          if (content) {
            // Switch to talking immediately when first real content arrives
            if (!hasStartedTalking && this.character) {
              console.log('First content received, switching to talking');
              this.character.setState('talking');
              hasStartedTalking = true;

              // For Read character, initialize streaming speech
              if (this.selectedCharacter === 'read' && this.character.speak) {
                this.speechBuffer = '';
                this.lastSpokenIndex = 0;
              }
            }

            fullResponse += content;

            // For Read character, speak in chunks as sentences complete
            if (this.selectedCharacter === 'read' && this.character.speak && hasStartedTalking) {
              this.speechBuffer = fullResponse;
              this.speakStreamingChunks();
            }

            this.updateMessage(assistantMsgId, fullResponse, fullThinking);
          } else if (fullThinking && !fullResponse) {
            // If only thinking so far, update to show thinking indicator
            this.updateMessage(assistantMsgId, fullResponse, fullThinking);
          }
        } catch (e) {
          // Skip malformed JSON
          console.warn('Failed to parse streaming response:', trimmed.substring(0, 100));
        }
      }
    }

    // Debug: Log the full response
    console.log('Full AI response:', fullResponse);

    // If Read character, speak any remaining text
    if (this.selectedCharacter === 'read' && this.character.speak && this.speechBuffer) {
      // Speak any final chunk that might not have been spoken yet
      this.speakStreamingChunks(true);
    }

    // Multi-turn tool calling: if there are pending tool results, send them back
    if (this.pendingToolResults.length > 0) {
      console.log(`[Tool] Round ${toolCallRound}: Continuing conversation with ${this.pendingToolResults.length} tool results`);
      console.log(`[Tool] Tool results:`, this.pendingToolResults.map(tr => `${tr.name}(${tr.id})`).join(', '));

      // Check for repeated tool calls (potential infinite loop)
      const currentToolSignature = this.pendingToolResults.map(tr => `${tr.name}:${JSON.stringify(tr.result.data)}`).join('|');
      if (this.previousToolCalls.includes(currentToolSignature)) {
        console.error('[Tool] LOOP DETECTED: Same tools with same results called again!');
        console.error('[Tool] Current tools:', currentToolSignature);
        console.error('[Tool] Previous calls:', this.previousToolCalls);

        // Stop the loop
        const messageDiv = document.getElementById(`ai-msg-${assistantMsgId}`);
        if (messageDiv) {
          const textDiv = messageDiv.querySelector('.ai-message-text');
          const currentContent = textDiv.innerHTML;
          textDiv.innerHTML = currentContent + '<br><br><em style="color: #ef4444;">[Stopped: Detected infinite loop - AI kept calling the same tools repeatedly]</em>';
        }
        return;
      }

      // Record this set of tool calls
      this.previousToolCalls.push(currentToolSignature);

      // Build tool result messages
      const toolResultMessages = this.buildToolResultMessages();

      // Build assistant message with tool_use blocks
      // For Anthropic, we need the structured tool_use blocks, not just text
      const isAnthropic = this.apiEndpoint.includes('anthropic');

      let assistantToolMessage;

      const isOpenAI = this.apiEndpoint.includes('openai') && !this.apiEndpoint.includes('/api/chat');

      if (isAnthropic && this.currentAssistantToolUses.length > 0) {
        // Anthropic format: content is array with tool_use blocks
        const assistantContent = [];

        // Add text content first if there is any
        if (fullResponse && fullResponse.trim()) {
          assistantContent.push({
            type: 'text',
            text: fullResponse
          });
        }

        // Add all tool_use blocks
        assistantContent.push(...this.currentAssistantToolUses);

        assistantToolMessage = {
          role: 'assistant',
          content: assistantContent
        };
      } else if (isOpenAI && this.currentAssistantToolUses.length > 0) {
        // OpenAI format: must include tool_calls array when tools were used
        console.log('[Tool] Building OpenAI assistant message with tool_calls:', this.currentAssistantToolUses);
        assistantToolMessage = {
          role: 'assistant',
          content: fullResponse || null,
          tool_calls: this.currentAssistantToolUses
        };
      } else if (fullResponse) {
        // For Ollama or if no tool uses, just add text
        assistantToolMessage = {
          role: 'assistant',
          content: fullResponse
        };
      }

      // Build temporary message history for this continuation ONLY
      // Don't save tool messages to persistent history
      const tempMessages = [
        ...this.messages.slice(-10).filter(m => {
          if (!m.content) return false;
          if (typeof m.content === 'string') return m.content.trim() !== '';
          if (Array.isArray(m.content)) return m.content.length > 0;
          return true;
        }).map(m => ({ role: m.role, content: m.content }))
      ];

      // Add assistant tool message
      if (assistantToolMessage) {
        tempMessages.push(assistantToolMessage);
      }

      // Add tool results
      toolResultMessages.forEach(msg => {
        tempMessages.push(msg);
      });

      // Clear pending results
      this.pendingToolResults = [];

      // Automatically continue the conversation with tool results
      console.log('[Tool] Automatically continuing conversation with tool results');
      console.log('[Tool] Temp messages:', tempMessages.length);
      console.log('[Tool] Messages being sent:', JSON.stringify(tempMessages, null, 2));

      // Keep character in thinking state during continuation
      if (this.character) {
        this.character.setState('thinking');
      }

      // Reuse the same assistant message ID instead of creating a new one
      // This prevents extra thinking dot animations
      this.updateMessage(assistantMsgId, ''); // Clear current content

      // Reset controller and call streamResponse with temp messages
      this.controller = null;

      try {
        // Increment round counter to prevent infinite loops
        await this.streamResponse('', assistantMsgId, tempMessages, toolCallRound + 1);
      } catch (error) {
        console.error('[Tool] Error in multi-turn continuation:', error);
        this.updateMessage(assistantMsgId, `Error continuing with tool results: ${error.message}`);
        // Set to idle on error
        if (this.character && this.selectedCharacter !== 'read') {
          this.character.setState('idle');
        }
      }

      return; // Exit to avoid double controller reset
    }

    this.controller = null;
  }

  cleanTextForSpeech(text) {
    if (!text) return '';

    console.log('[Speech] Original text:', text.substring(0, 200));

    let cleaned = text;

    // Now clean markdown and other stuff
    cleaned = cleaned
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, ' ')
      // Remove inline code
      .replace(/`[^`]+`/g, ' ')
      // Remove math formulas (both block and inline)
      .replace(/\$\$[\s\S]*?\$\$/g, ' formula ')
      .replace(/\$[^$\n]+\$/g, ' formula ')
      // Remove markdown headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove markdown formatting
      .replace(/[*_~]/g, '')
      // Remove markdown links but keep text: [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove emojis
      .replace(/[\u{1F000}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]/gu, '')
      // Clean up extra whitespace
      .replace(/\s+/g, ' ')
      .trim();

    console.log('[Speech] ✅ Final cleaned text:', cleaned.substring(0, 200));
    return cleaned;
  }

  speakStreamingChunks(isFinal = false) {
    if (!this.speechBuffer || !this.character || !this.character.speak) return;

    // Clean text (remove markdown, commands, math, and emojis)
    const cleanBuffer = this.cleanTextForSpeech(this.speechBuffer);

    // Find complete sentences (ending with . ! ? or newline)
    const sentenceRegex = /[^.!?\n]+[.!?\n]+/g;
    const textToProcess = cleanBuffer.slice(this.lastSpokenIndex);

    let match;
    let lastMatchEnd = 0;

    while ((match = sentenceRegex.exec(textToProcess)) !== null) {
      const sentence = match[0].trim();
      lastMatchEnd = match.index + match[0].length;

      // Only speak if sentence has actual content (not just whitespace/punctuation)
      if (sentence.length > 3 && /[a-zA-Z0-9]/.test(sentence)) {
        // Queue this sentence for speaking
        console.log('[Speech] Queueing sentence:', sentence.substring(0, 80));
        if (this.character && this.character.speak) {
          this.character.speak(sentence);
        }
      }
    }

    // Update index to avoid re-speaking
    if (lastMatchEnd > 0) {
      this.lastSpokenIndex += lastMatchEnd;
    }

    // If this is the final call and there's remaining text, speak it
    if (isFinal && textToProcess.slice(lastMatchEnd).trim().length > 0) {
      const remaining = textToProcess.slice(lastMatchEnd).trim();
      if (remaining && this.character && this.character.speak) {
        this.character.speak(remaining);
      }
    }
  }

  buildSystemPrompt() {
    // Debug: Log current board state
    console.log('Building system prompt - Board state:');
    console.log('- Nodes:', this.wallboard.nodes.length);
    console.log('- Connections:', this.wallboard.connectionManager.connections.length);

    const boardInfo = {
      currentBoard: this.wallboard.boards[this.wallboard.currentBoardId]?.name || 'Unknown',
      nodeCount: this.wallboard.nodes.length,
      nodes: this.wallboard.nodes.map(n => {
        const nodeType = n.data?.nodeType || n.type || 'markdown';
        const content = n.data?.content || n.content || '';
        return {
          id: n.id,
          title: this.wallboard.getNodeTitle(n),
          type: nodeType,
          content: content.substring(0, 100)
        };
      })
    };

    // Debug: Log node details
    console.log('Nodes being sent to AI:');
    boardInfo.nodes.forEach(n => {
      console.log(`  - Node ${n.id}: "${n.title}" [${n.type}] (${n.content.length} chars)`);
    });

    // Get connections with node titles - filter out invalid ones
    const connectionsWithTitles = this.wallboard.connectionManager.connections
      .map(c => {
        const fromNode = this.wallboard.nodes.find(n => n.id === c.start.nodeId);
        const toNode = this.wallboard.nodes.find(n => n.id === c.end.nodeId);

        // Only include if both nodes exist
        if (!fromNode || !toNode) {
          console.warn(`Orphaned connection found: ${c.start.nodeId} -> ${c.end.nodeId} (one or both nodes missing)`);
          return null;
        }

        return {
          fromId: c.start.nodeId,
          toId: c.end.nodeId,
          fromTitle: this.wallboard.getNodeTitle(fromNode),
          toTitle: this.wallboard.getNodeTitle(toNode)
        };
      })
      .filter(c => c !== null); // Remove invalid connections

    // Debug: Log connections
    console.log(`Valid connections: ${connectionsWithTitles.length}`);
    connectionsWithTitles.forEach(c => {
      console.log(`  - "${c.fromTitle}" (${c.fromId}) → "${c.toTitle}" (${c.toId})`);
    });

    // Base personality section
    const defaultPersonality = `You are Buddy, a friendly AI assistant integrated into QUIRK, a visual board/canvas application for organizing ideas and notes. You're represented by a cheerful cloud character and love helping people organize their thoughts visually!

**Your Personality:**
- Enthusiastic and encouraging about ideas
- Playful but helpful
- You love making connections between concepts
- You get excited when boards come together nicely
- Brief and to-the-point (you know people are busy!)`;

    // Apply custom prompt based on mode
    console.log('Custom Prompt:', this.customPrompt);
    console.log('Custom Prompt Mode:', this.customPromptMode);

    let personalitySection;
    if (this.customPrompt && this.customPromptMode === 'replace') {
      // Replace mode: Use only custom prompt
      console.log('Using REPLACE mode - custom prompt only');
      personalitySection = this.customPrompt;
    } else if (this.customPrompt && this.customPromptMode === 'append') {
      // Append mode: Add custom prompt after default
      console.log('Using APPEND mode - default + custom');
      personalitySection = `${defaultPersonality}

**Custom Instructions:**
${this.customPrompt}`;
    } else {
      // No custom prompt: Use default
      console.log('Using DEFAULT prompt only');
      personalitySection = defaultPersonality;
    }

    const fullPrompt = `${personalitySection}

Current board: "${boardInfo.currentBoard}"
Number of nodes: ${boardInfo.nodeCount}
${boardInfo.nodes.length > 0 ? `\nExisting nodes:\n${boardInfo.nodes.map(n => `- [${n.type}] [Node ${n.id}] "${n.title}": ${n.content}`).join('\n')}` : ''}
${connectionsWithTitles.length > 0 ? `\nNumber of connections: ${connectionsWithTitles.length}\nConnections:\n${connectionsWithTitles.map(c => `- "${c.fromTitle}" → "${c.toTitle}"`).join('\n')}` : 'No connections yet.'}

FORMATTING RULES:
- Use **markdown formatting** in your responses (bold with **, lists with -, etc.)
- Keep your responses concise and helpful
- Use line breaks between sections for readability
- Use **MathJax syntax** for math equations: \\\`$$ ... $$\\\` for block math and \\\`$ ... $\\\` for inline math. Do NOT use LaTeX \\\`\\\\[ ... \\\\]\\\` or \\\`\\\\( ... \\\\)\\\` syntax.

WORKFLOW BUILDING (Instruction + Script):
- Prefer **Instruction** nodes for plans/steps—keep them actionable and connect them. You can pull prior node content with \`{{Node Title}}\` and prior results with \`{{Node Title RESULT}}\`; the UI resolves these for you.
- Use **Script** nodes only when you truly need JS execution. Script content is plain JS (no fences). Use \`const inputs = quirk.inputs();\` to read upstream outputs and \`quirk.output(value);\` to emit results.
- When creating nodes via tools, set \`node_type\` to \`instruction\`, \`script\`, or \`markdown\` as appropriate. Don't wrap code in fences.
- Chain by connecting nodes; avoid spawning extra "Result" nodes—emit outputs from scripts and reference results via \`{{... RESULT}}\` where needed.

BOARD MANIPULATION:
You have access to powerful tools to manipulate the board:
- **create_node**: Create new nodes with titles and markdown content
- **edit_node**: Update existing node titles and content
- **delete_node**: Remove nodes from the board
- **connect_nodes**: Create connections between nodes
- **search_nodes**: Find nodes by searching titles and content
- **get_board_state**: Get complete board information
- **arrange_nodes**: Auto-arrange all nodes neatly
- **clear_board**: Remove all nodes (ask user first!)

When creating nodes, always use detailed, useful content with proper markdown formatting (lists, bold, code blocks, etc.). Never use placeholder text like "description here".

Example interaction:
User: "Create 3 nodes about Python"
You: "I'll create 3 nodes covering Python fundamentals."
[Tool calls automatically executed: create_node for each node]
You: "Created 3 nodes covering Python basics, popular libraries, and best practices!"`;

    console.log('=== FULL SYSTEM PROMPT ===');
    console.log(fullPrompt);
    console.log('=== END SYSTEM PROMPT ===');

    return fullPrompt;
  }

  normalizeNodeType(rawType) {
    const normalized = (rawType || '').toString().trim().toLowerCase();
    const type = normalized === 'html preview' ? 'html-preview' : normalized;
    const validTypes = new Set(['instruction', 'instruct', 'script', 'markdown', 'html-preview', 'system', 'save', 'image']);

    if (!type) return 'markdown';
    if (validTypes.has(type)) {
      return type === 'instruct' ? 'instruction' : type;
    }
    return 'markdown';
  }

  getSmartNodePosition() {
    // Reuse duplicate-style placement so AI nodes slot neatly without overlap
    if (typeof this.wallboard.getNextNodePosition === 'function') {
      return this.wallboard.getNextNodePosition();
    }
    // Fallback to viewport center
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    const canvasX = (viewportCenterX - this.wallboard.panX) / this.wallboard.zoom;
    const canvasY = (viewportCenterY - this.wallboard.panY) / this.wallboard.zoom;
    return { x: canvasX - 125, y: canvasY - 90 };
  }

  stopGeneration() {
    if (this.controller) {
      this.controller.abort();
      this.controller = null;
      this.setStatus('idle');
      if (this.character) this.character.setState('idle');
      this.toggleSendButton(false);
    }
  }

  addMessage(role, content) {
    const msgId = Date.now() + Math.random();

    // Always add to messages array to track all messages
    const message = { id: msgId, role, content: content || '', timestamp: Date.now() };
    this.messages.push(message);

    const messagesContainer = document.getElementById('aiChatMessages');

    // Hide welcome message on first message
    const welcome = messagesContainer.querySelector('.ai-welcome-message');
    if (welcome) {
      welcome.style.display = 'none';
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ai-message-${role}`;
    messageDiv.id = `ai-msg-${msgId}`;
    messageDiv.innerHTML = `
      <div class="ai-message-avatar">
        ${role === 'user' ? this.getUserAvatar() : this.getAssistantAvatar()}
      </div>
      <div class="ai-message-content">
        <div class="ai-message-text">${this.formatMessage(content, '')}</div>
      </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return msgId;
  }

  updateMessage(msgId, content, thinking = '') {
    const messageDiv = document.getElementById(`ai-msg-${msgId}`);
    if (messageDiv) {
      const textDiv = messageDiv.querySelector('.ai-message-text');
      textDiv.innerHTML = this.formatMessage(content, thinking);

      // Auto-scroll if near bottom
      const messagesContainer = document.getElementById('aiChatMessages');
      const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
      if (isNearBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }

    // Update message in history (it already exists from addMessage)
    const msg = this.messages.find(m => m.id === msgId);
    if (msg) {
      msg.content = content;
      msg.thinking = thinking;
    }
  }

  formatMessage(content, thinking = '') {
    let html = '';

    // Add thinking section if enabled and available
    if (this.showThinking && thinking && thinking.trim()) {
      const thinkingEscaped = thinking
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      html += `
        <div class="ai-thinking-section" data-expanded="false">
          <div class="ai-thinking-header" onclick="this.parentElement.dataset.expanded = this.parentElement.dataset.expanded === 'true' ? 'false' : 'true'">
            <svg class="ai-thinking-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
            </svg>
            <span>AI Thinking Process</span>
            <svg class="ai-thinking-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
          <div class="ai-thinking-content">${thinkingEscaped}</div>
        </div>
      `;
    }

    // If no content yet, show thinking dots
    if (!content || content.trim() === '') {
      if (thinking) {
        // Have thinking but no content yet
        return html + '<span class="ai-thinking-dots"><span>.</span><span>.</span><span>.</span></span>';
      }
      return '<span class="ai-thinking-dots"><span>.</span><span>.</span><span>.</span></span>';
    }

    // Remove <think> tags and their content (in case they appear in content)
    let formatted = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // Check if there's any actual content (don't trim yet, to preserve intentional spacing)
    if (!formatted || !formatted.trim()) {
      return html + '<span class="ai-thinking-dots"><span>.</span><span>.</span><span>.</span></span>';
    }

    // Normalize whitespace that can break markdown list parsing
    formatted = formatted
      .replace(/\r\n/g, '\n')                 // normalize newlines
      .replace(/[\u00a0\u202f\u2007]/g, ' ')   // NBSP variants -> space
      .replace(/[\u200b-\u200d\ufeff]/g, '');  // zero-width chars -> remove

    // Normalize common bullet characters to standard markdown markers
    formatted = formatted
      .split('\n')
      .map(line => line.replace(/^\s*[•‒–—−]\s+/u, '- '))
      .join('\n');

    // Use MarkdownRenderer for unified rendering (commands + math + markdown)
    try {
      if (typeof MarkdownRenderer !== 'undefined') {
        // Use the new unified renderer - handles commands, math, and markdown
        formatted = MarkdownRenderer.render(formatted);
      } else if (typeof MathRenderer !== 'undefined') {
        // Fallback to old MathRenderer
        formatted = MathRenderer.render(formatted);
      } else {
        // Final fallback to basic marked.parse
        formatted = marked.parse(formatted, {
          breaks: true,
          gfm: true
        });
      }

      // Sanitize with DOMPurify if available (AFTER rendering completes)
      if (typeof DOMPurify !== 'undefined') {
        formatted = DOMPurify.sanitize(formatted, {
          ADD_TAGS: ['span', 'div'],
          ADD_ATTR: ['class', 'style', 'aria-hidden']
        });
      }
    } catch (error) {
      console.error('Markdown rendering error:', error);

      // Fallback: escape HTML and convert newlines
      formatted = formatted
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
    }

    return html + formatted;
  }

  getUserAvatar() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>`;
  }

  getAssistantAvatar() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5"></path>
    </svg>`;
  }

  setStatus(status) {
    // Status is now handled by Buddy character
    // This method is kept for backward compatibility
  }

  toggleSendButton(isSending) {
    const btn = document.getElementById('aiSendBtn');
    const sendIcon = btn.querySelector('.ai-send-icon');
    const stopIcon = btn.querySelector('.ai-stop-icon');

    if (isSending) {
      sendIcon.style.display = 'none';
      stopIcon.style.display = 'block';
      btn.onclick = () => this.stopGeneration();
    } else {
      sendIcon.style.display = 'block';
      stopIcon.style.display = 'none';
      btn.onclick = () => this.handleSend();
    }
  }

  async openSettings() {
    // Ensure storage is ready
    await this.ensureStorageReady();

    // Load current API key from IndexedDB before showing modal
    if (this.wallboard.storage && this.provider !== 'ollama') {
      const savedKey = await this.wallboard.storage.getAPIKey(this.provider);
      this.apiKey = savedKey || '';

      // Update the API key input field with the loaded value
      const apiKeyInput = document.getElementById('aiApiKeyInput');
      if (apiKeyInput) {
        apiKeyInput.value = this.apiKey;
        // Apply readonly to prevent password manager interference
        apiKeyInput.setAttribute('readonly', 'true');
      }
    }

    // Update provider select to show current value
    const providerSelect = document.getElementById('aiProviderSelect');
    if (providerSelect) {
      providerSelect.value = this.provider;
    }

    // Update API key field visibility based on current provider
    await this.updateProviderUI(this.provider);

    // Populate endpoint and model fields with CURRENT saved values
    // (updateProviderUI sets defaults, but we want to show what's actually saved)
    const endpointInput = document.getElementById('aiEndpointInput');
    const modelInput = document.getElementById('aiModelInput');
    const temperatureInput = document.getElementById('aiTemperatureInput');
    const customPromptInput = document.getElementById('aiCustomPromptInput');
    if (endpointInput) {
      endpointInput.value = this.apiEndpoint;
    }
    if (modelInput) {
      modelInput.value = this.apiModel;
    }
    if (temperatureInput) {
      // Show empty if null (use model default), otherwise show the configured value
      temperatureInput.value = this.temperature !== null ? this.temperature : '';
    }
    if (customPromptInput) {
      customPromptInput.value = this.customPrompt;
    }

    document.getElementById('aiSettingsModal').style.display = 'flex';
  }

  closeSettings() {
    document.getElementById('aiSettingsModal').style.display = 'none';
  }

  showDefaultPrompt() {
    const defaultPrompt = `You are Buddy, a friendly AI assistant integrated into QUIRK, a visual board/canvas application for organizing ideas and notes. You're represented by a cheerful cloud character and love helping people organize their thoughts visually!

**Your Personality:**
- Enthusiastic and encouraging about ideas
- Playful but helpful
- You love making connections between concepts
- You get excited when boards come together nicely
- Brief and to-the-point (you know people are busy!)`;

    // Copy to clipboard and show notification
    navigator.clipboard.writeText(defaultPrompt).then(() => {
      alert('Default prompt copied to clipboard!\n\n' + defaultPrompt);
    }).catch(() => {
      alert('Default Prompt:\n\n' + defaultPrompt);
    });
  }

  async saveSettings() {
    // Ensure storage is ready
    await this.ensureStorageReady();

    const provider = document.getElementById('aiProviderSelect').value;
    const endpoint = document.getElementById('aiEndpointInput').value.trim();
    const model = document.getElementById('aiModelInput').value.trim();
    const temperatureInput = document.getElementById('aiTemperatureInput').value.trim();
    const customPrompt = document.getElementById('aiCustomPromptInput').value.trim();
    const customPromptMode = document.querySelector('input[name="promptMode"]:checked')?.value || 'append';
    const apiKey = document.getElementById('aiApiKeyInput').value.trim();
    const showThinking = document.getElementById('aiShowThinkingInput').checked;
    const selectElement = document.getElementById('aiCharacterSelect');
    const selectedCharacter = selectElement ? selectElement.value : this.selectedCharacter;

    console.log('Saving settings...');
    console.log('Provider:', provider);
    console.log('Selected character from dropdown:', selectedCharacter);

    // Save provider
    this.provider = provider;
    localStorage.setItem('ai_chat_provider', provider);

    // Save endpoint
    if (endpoint) {
      this.apiEndpoint = endpoint;
      localStorage.setItem('ai_chat_endpoint', endpoint);
    }

    // Save model
    if (model) {
      this.apiModel = model;
      localStorage.setItem('ai_chat_model', model);
      const modelInfo = document.getElementById('aiModelInfo');
      if (modelInfo) {
        modelInfo.textContent = model;
      }
    }

    // Save temperature
    if (temperatureInput !== '') {
      const temperature = parseFloat(temperatureInput);
      if (!isNaN(temperature) && temperature >= 0 && temperature <= 2) {
        this.temperature = temperature;
        localStorage.setItem('ai_chat_temperature', temperature.toString());
      }
    } else {
      // If empty, use null to indicate "use model default"
      this.temperature = null;
      localStorage.removeItem('ai_chat_temperature');
    }

    // Save custom prompt
    this.customPrompt = customPrompt;
    localStorage.setItem('ai_custom_prompt', customPrompt);
    this.customPromptMode = customPromptMode;
    localStorage.setItem('ai_custom_prompt_mode', customPromptMode);
    console.log('Saved custom prompt:', customPrompt);
    console.log('Saved custom prompt mode:', customPromptMode);

    // Save API key to IndexedDB (secure storage)
    if (this.wallboard.storage && provider !== 'ollama') {
      if (apiKey) {
        await this.wallboard.storage.saveAPIKey(provider, apiKey);
        this.apiKey = apiKey;
        console.log('API key saved to IndexedDB for provider:', provider);
        console.log('API key length:', apiKey.length);
      } else if (this.apiKey) {
        // Clear API key if field is empty
        await this.wallboard.storage.deleteAPIKey(provider);
        this.apiKey = '';
        console.log('API key removed from IndexedDB');
      }
    } else if (provider === 'ollama') {
      // Clear API key for Ollama
      this.apiKey = '';
      console.log('Provider is Ollama, no API key needed');
    }

    this.showThinking = showThinking;
    localStorage.setItem('ai_show_thinking', showThinking);

    // Switch character if changed
    if (selectedCharacter && selectedCharacter !== this.selectedCharacter) {
      console.log('Character changed, switching...');
      this.switchCharacter(selectedCharacter);
    } else {
      console.log('No character change needed');
    }

    this.closeSettings();
    Notifications.show('AI settings saved!');
  }

  clearChat() {
    if (confirm('Clear chat messages for this board?')) {
      // Clear messages array completely
      this.messages = [];

      // Clear from localStorage for current board
      const boardId = this.wallboard.currentBoardId;
      localStorage.removeItem(`ai_chat_history_${boardId}`);

      // Reset UI
      const messagesContainer = document.getElementById('aiChatMessages');
      messagesContainer.innerHTML = `
        <div class="ai-welcome-message">
          <div class="ai-welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h3>AI Board Assistant</h3>
          <p>Chat cleared. Ready to help!</p>
        </div>
      `;

      console.log(`Chat history cleared for board ${boardId}`);
    }
  }

  saveChatHistory() {
    const boardId = this.wallboard.currentBoardId;
    localStorage.setItem(`ai_chat_history_${boardId}`, JSON.stringify(this.messages.slice(-50))); // Save last 50 messages per board
  }

  loadChatHistory() {
    try {
      const boardId = this.wallboard.currentBoardId;
      const history = localStorage.getItem(`ai_chat_history_${boardId}`);

      if (history) {
        this.messages = JSON.parse(history);
        this.renderChatHistory();
      } else {
        // No history for this board, clear messages
        this.messages = [];
        this.renderWelcomeMessage();
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      this.messages = [];
      this.renderWelcomeMessage();
    }
  }

  renderChatHistory() {
    const messagesContainer = document.getElementById('aiChatMessages');
    messagesContainer.innerHTML = ''; // Clear existing messages

    if (this.messages.length > 0) {
      this.messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ai-message-${msg.role}`;
        messageDiv.id = `ai-msg-${msg.id}`;
        messageDiv.innerHTML = `
          <div class="ai-message-avatar">
            ${msg.role === 'user' ? this.getUserAvatar() : this.getAssistantAvatar()}
          </div>
          <div class="ai-message-content">
            <div class="ai-message-text">${this.formatMessage(msg.content, msg.thinking || '')}</div>
          </div>
        `;
        messagesContainer.appendChild(messageDiv);
      });
    } else {
      this.renderWelcomeMessage();
    }

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  renderWelcomeMessage() {
    const messagesContainer = document.getElementById('aiChatMessages');
    messagesContainer.innerHTML = `
      <div class="ai-welcome-message">
        <div class="ai-welcome-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <h3>AI Board Assistant</h3>
        <p>I can help you create, edit, and organize your boards. Try asking me to:</p>
        <ul>
          <li>Create a new board from scratch</li>
          <li>Add nodes with specific content</li>
          <li>Organize and arrange nodes</li>
          <li>Connect related ideas</li>
          <li>Brainstorm and expand on topics</li>
        </ul>
        <div class="ai-welcome-shortcut">Press <kbd>K</kbd> to open this panel anytime</div>
      </div>
    `;
  }

  // Method to handle board switches
  onBoardSwitch() {
    console.log('AI Chat: Board switched, reloading chat history');
    // Save current board's chat history before switching
    if (this.messages.length > 0) {
      this.saveChatHistory();
    }
    // Load new board's chat history
    this.loadChatHistory();
  }

  open() {
    this.isOpen = true;
    this.lastOpenTime = Date.now();
    const panel = document.getElementById('ai-chat-panel');
    panel.classList.add('ai-chat-open');

    // Clean up orphaned connections
    this.cleanupOrphanedConnections();

    // Focus input after animation
    setTimeout(() => {
      document.getElementById('aiChatInput').focus();
    }, 300);
  }

  cleanupOrphanedConnections() {
    const nodeIds = new Set(this.wallboard.nodes.map(n => n.id));
    const orphanedConnections = [];

    this.wallboard.connectionManager.connections.forEach((conn, index) => {
      if (!nodeIds.has(conn.start.nodeId) || !nodeIds.has(conn.end.nodeId)) {
        orphanedConnections.push(index);
      }
    });

    if (orphanedConnections.length > 0) {
      console.log(`Cleaning up ${orphanedConnections.length} orphaned connections`);

      // Remove in reverse order to maintain indices
      for (let i = orphanedConnections.length - 1; i >= 0; i--) {
        const index = orphanedConnections[i];
        const conn = this.wallboard.connectionManager.connections[index];
        console.log(`  Removing orphaned connection: ${conn.start.nodeId} -> ${conn.end.nodeId}`);
        this.wallboard.connectionManager.connections.splice(index, 1);
      }

      // Re-render connections
      this.wallboard.connectionManager.updateConnections();

      // Auto-save
      this.wallboard.autoSave();
    }
  }

  close() {
    this.isOpen = false;
    document.getElementById('ai-chat-panel').classList.remove('ai-chat-open');

    // Blur the input to ensure keyboard shortcuts work after closing
    const input = document.getElementById('aiChatInput');
    if (input) {
      input.blur();
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
}
