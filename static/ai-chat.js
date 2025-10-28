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
    this.controller = null;
    this.lastOpenTime = 0;
    this.character = null; // Current character instance (Buddy or Read)

    this.init();
  }

  getDefaultEndpoint(provider) {
    switch(provider) {
      case 'anthropic': return 'http://localhost:8080/api/anthropic';
      case 'openai': return 'http://localhost:8080/api/openai';
      default: return 'http://localhost:11434/api/chat';
    }
  }

  getDefaultModel(provider) {
    switch(provider) {
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
      <div class="ai-settings-modal" id="aiSettingsModal" style="display: none;">
        <div class="ai-settings-content">
          <h3>AI Chat Settings</h3>

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
            <input type="password" id="aiApiKeyInput" value="${this.apiKey || ''}" placeholder="sk-ant-... or sk-..." autocomplete="off">
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

    // Provider selection handler
    document.getElementById('aiProviderSelect').addEventListener('change', async (e) => {
      await this.updateProviderUI(e.target.value);
    });

    // Clear chat
    document.getElementById('aiChatClear').addEventListener('click', () => this.clearChat());
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
      }
    } else if (apiKeyInput) {
      apiKeyInput.value = '';
    }

    // Update default endpoint and model
    endpointInput.value = this.getDefaultEndpoint(provider);
    modelInput.value = this.getDefaultModel(provider);

    // Update hints
    switch(provider) {
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

  async streamResponse(userMessage, assistantMsgId) {
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

    // Build message history - only include if there are saved messages
    const messages = [
      { role: 'system', content: systemPrompt },
      // Only include recent history if messages array is not empty, and filter out empty messages
      ...(this.messages.length > 0 ? this.messages.slice(-10).filter(m => m.content && m.content.trim()).map(m => ({ role: m.role, content: m.content })) : []),
      { role: 'user', content: userMessage }
    ];

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
        stream: true,
        temperature: 0.7,
      };

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
        stream: true,
        temperature: 0.7,
      };
    } else {
      // Ollama native API
      requestBody = {
        model: this.apiModel,
        messages: messages,
        stream: true,
        temperature: 0.7,
        think: true // Enable thinking for better responses
      };
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

          // Extract thinking and content based on provider
          let thinking = '';
          let content = '';

          if (isAnthropic) {
            // Anthropic format
            if (json.type === 'content_block_delta') {
              content = json.delta?.text || '';
            } else if (json.type === 'content_block_start') {
              // Start of content block, no content yet
              continue;
            }
          } else if (isOpenAI) {
            // OpenAI format
            content = json.choices?.[0]?.delta?.content || '';
          } else {
            // Ollama format
            thinking = json.message?.thinking || '';
            content = json.message?.content || '';
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

    // Debug: Log the full response before executing commands
    console.log('Full AI response:', fullResponse);

    // Execute any board commands found in the response
    await this.executeCommandsFromResponse(fullResponse);

    // If Read character, speak any remaining text
    if (this.selectedCharacter === 'read' && this.character.speak && this.speechBuffer) {
      // Speak any final chunk that might not have been spoken yet
      this.speakStreamingChunks(true);
    }

    this.controller = null;
  }

  cleanTextForSpeech(text) {
    if (!text) return '';

    console.log('[Speech] Original text:', text.substring(0, 200));

    // AGGRESSIVE: Split on [[ and ]], only keep parts outside commands
    const parts = [];
    let currentPos = 0;

    while (true) {
      // Find next [[
      const startIdx = text.indexOf('[[', currentPos);

      if (startIdx === -1) {
        // No more commands, add rest of text
        parts.push(text.substring(currentPos));
        break;
      }

      // Add text before [[
      parts.push(text.substring(currentPos, startIdx));

      // Find matching ]]
      const endIdx = text.indexOf(']]', startIdx);

      if (endIdx === -1) {
        // No closing ]], skip rest of text
        console.log('[Speech] ⚠️ Unclosed command at pos', startIdx);
        break;
      }

      // Log and skip the command
      const command = text.substring(startIdx, endIdx + 2);
      console.log('[Speech] 🚫 Skipping command:', command.substring(0, 60) + (command.length > 60 ? '...' : ''));

      // Move past the ]]
      currentPos = endIdx + 2;
    }

    // Join parts and clean
    let cleaned = parts.join(' ');
    console.log('[Speech] After command removal:', cleaned.substring(0, 200));

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
      nodes: this.wallboard.nodes.map(n => ({
        id: n.id,
        title: this.wallboard.getNodeTitle(n),
        content: n.content ? n.content.substring(0, 100) : ''
      }))
    };

    // Debug: Log node details
    console.log('Nodes being sent to AI:');
    boardInfo.nodes.forEach(n => {
      console.log(`  - Node ${n.id}: "${n.title}" (${n.content.length} chars)`);
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

    return `You are Buddy, a friendly AI assistant integrated into QUIRK, a visual board/canvas application for organizing ideas and notes. You're represented by a cheerful cloud character and love helping people organize their thoughts visually!

**Your Personality:**
- Enthusiastic and encouraging about ideas
- Playful but helpful
- You love making connections between concepts
- You get excited when boards come together nicely
- Brief and to-the-point (you know people are busy!)

Current board: "${boardInfo.currentBoard}"
Number of nodes: ${boardInfo.nodeCount}
${boardInfo.nodes.length > 0 ? `\nExisting nodes:\n${boardInfo.nodes.map(n => `- [Node ${n.id}] "${n.title}": ${n.content}`).join('\n')}` : ''}
${connectionsWithTitles.length > 0 ? `\nNumber of connections: ${connectionsWithTitles.length}\nConnections:\n${connectionsWithTitles.map(c => `- "${c.fromTitle}" → "${c.toTitle}"`).join('\n')}` : 'No connections yet.'}

FORMATTING RULES:
- Use **markdown formatting** in your responses (bold with **, lists with -, etc.)
- Keep your responses concise and helpful
- Use line breaks between sections for readability

BOARD COMMANDS:
You can perform actions by including special commands in your response. Commands MUST end with ]] (two closing square brackets).

Available commands:
- [[CREATE_NODE:Title Here|Content goes here]] - Create a new node
- [[EDIT_NODE:nodeId|New content]] - Edit a node's content
- [[DELETE_NODE:nodeId]] - Delete a node
- [[CONNECT_NODES:fromNodeId|toNodeId]] - Connect two nodes
- [[ARRANGE_NODES]] - Auto-arrange all nodes
- [[CLEAR_BOARD]] - Clear the board (ask first!)

CRITICAL COMMAND RULES:
1. Commands MUST end with ]] (double closing square brackets) NOT }}
2. Commands MUST be on their own line
3. Use the exact format shown above - [[COMMAND_NAME:args]]
4. For CREATE_NODE, use this exact format: [[CREATE_NODE:Title|Content]]
5. Always use real, descriptive content - never placeholders

CONTENT RULES:
1. Node content should be detailed and useful with proper spacing
2. Use markdown in node content (lists, bold, etc.) for better formatting
3. Add line breaks between items in lists for readability
4. Never use vague text like "description here" or "content"

Example:
User: "Create 3 nodes about Python"
You: "I'll create 3 nodes about Python:

[[CREATE_NODE:Python Basics|Introduction to Python programming language, including syntax, variables, and core concepts]]
[[CREATE_NODE:Python Libraries|Popular libraries:
- NumPy for numerical computing
- Pandas for data analysis
- Requests for HTTP]]
[[CREATE_NODE:Python Best Practices|Key practices:
- Follow PEP 8 style guide
- Use virtual environments
- Write tests with pytest]]

Created **3 nodes** covering Python fundamentals, libraries, and best practices!"`;
  }

  async executeCommandsFromResponse(response) {
    // Extract and execute commands
    // Match [[COMMAND:args]] where args can contain anything including ] but not ]]
    // Use negative lookahead to match ] not followed by another ]
    const commandRegex = /\[\[([A-Z_]+)(?::((?:[^\]]|\](?!\]))+?))?\]\]/g;
    let match;
    let commandsExecuted = 0;

    console.log('Extracting commands from response...');

    while ((match = commandRegex.exec(response)) !== null) {
      const [fullMatch, command, args] = match;
      console.log(`Found command: ${command}`);
      console.log(`  Full match: "${fullMatch}"`);
      console.log(`  Args: "${args}"`);

      try {
        await this.executeCommand(command, args);
        commandsExecuted++;
      } catch (error) {
        console.error(`Failed to execute command ${command}:`, error);
      }
    }

    if (commandsExecuted > 0) {
      console.log(`Executed ${commandsExecuted} command(s)`);
    } else {
      console.log('No commands found in response');
    }
  }

  async executeCommand(command, args) {
    console.log(`Executing command: ${command}`, args);

    switch (command) {
      case 'CREATE_NODE':
        try {
          const parts = args.split('|');
          if (parts.length < 2) {
            console.warn('CREATE_NODE requires title|content format');
            return;
          }
          const title = parts[0].trim();
          const content = parts.slice(1).join('|').trim(); // Handle content with | in it

          // Create node at a smart position
          const position = this.getSmartNodePosition();
          const newNode = this.wallboard.nodeOperationsManager.createNode('markdown', { content }, position);

          if (newNode) {
            newNode.title = title;
            newNode.content = content;

            // Debug: Log the actual content being set
            console.log(`Creating node with title: "${title}"`);
            console.log(`Content length: ${content.length} chars`);
            console.log(`Content: "${content}"`);
            console.log(`Content (escaped):`, JSON.stringify(content));

            // Remove the node and re-render with proper title
            const nodeEl = document.getElementById(`node-${newNode.id}`);
            if (nodeEl) {
              nodeEl.remove();
            }

            this.wallboard.renderNode(newNode);
            this.wallboard.autoSave();
            console.log(`Created node: "${title}"`);
          }
        } catch (error) {
          console.error('CREATE_NODE error:', error);
        }
        break;

      case 'EDIT_NODE':
        try {
          const parts = args.split('|');
          if (parts.length < 2) {
            console.warn('EDIT_NODE requires nodeId|content format');
            return;
          }
          const nodeId = parseInt(parts[0].trim());
          const newContent = parts.slice(1).join('|').trim();

          const node = this.wallboard.getNodeById(nodeId);
          if (node) {
            node.content = newContent;
            node.data = node.data || {};
            node.data.content = newContent;

            // Re-render the node
            const nodeEl = document.getElementById(`node-${nodeId}`);
            if (nodeEl) {
              nodeEl.remove();
            }
            this.wallboard.renderNode(node);
            this.wallboard.autoSave();
            console.log(`Edited node ${nodeId}`);
          } else {
            console.warn(`Node ${nodeId} not found`);
          }
        } catch (error) {
          console.error('EDIT_NODE error:', error);
        }
        break;

      case 'DELETE_NODE':
        try {
          const nodeId = parseInt(args.trim());
          this.wallboard.removeNode(nodeId);
          console.log(`Deleted node ${nodeId}`);
        } catch (error) {
          console.error('DELETE_NODE error:', error);
        }
        break;

      case 'CONNECT_NODES':
        try {
          const [fromId, toId] = args.split('|').map(id => parseInt(id.trim()));

          // Check if both nodes exist
          const fromNode = this.wallboard.getNodeById(fromId);
          const toNode = this.wallboard.getNodeById(toId);

          if (fromNode && toNode) {
            this.wallboard.connectionManager.createConnection(
              { nodeId: fromId },
              { nodeId: toId }
            );
            console.log(`Connected node ${fromId} to ${toId}`);
          } else {
            console.warn(`Cannot connect: node ${fromId} or ${toId} not found`);
          }
        } catch (error) {
          console.error('CONNECT_NODES error:', error);
        }
        break;

      case 'ARRANGE_NODES':
        this.wallboard.autoArrangeNodes(true);
        console.log('Auto-arranged nodes');
        break;

      case 'CLEAR_BOARD':
        this.wallboard.clearBoard();
        console.log('Cleared board');
        break;

      default:
        console.warn(`Unknown command: ${command}`);
    }
  }

  getSmartNodePosition() {
    // Always place at viewport center so user can see it
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    // Convert to canvas coordinates using direct formula
    // Canvas has transform: translate(panX, panY) scale(zoom)
    // So: canvasPos = (screenPos - panX) / zoom
    const canvasX = (viewportCenterX - this.wallboard.panX) / this.wallboard.zoom;
    const canvasY = (viewportCenterY - this.wallboard.panY) / this.wallboard.zoom;

    return {
      x: canvasX - 125, // Center the node (assuming ~250px width)
      y: canvasY - 90   // Center the node (assuming ~180px height)
    };
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

    // Pre-process: ensure list items are on their own lines
    // Match "- " that's not at the start of a line or after a newline
    formatted = formatted.replace(/([^\n])-\s+/g, '$1\n- ');

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
    if (endpointInput) {
      endpointInput.value = this.apiEndpoint;
    }
    if (modelInput) {
      modelInput.value = this.apiModel;
    }

    document.getElementById('aiSettingsModal').style.display = 'flex';
  }

  closeSettings() {
    document.getElementById('aiSettingsModal').style.display = 'none';
  }

  async saveSettings() {
    // Ensure storage is ready
    await this.ensureStorageReady();

    const provider = document.getElementById('aiProviderSelect').value;
    const endpoint = document.getElementById('aiEndpointInput').value.trim();
    const model = document.getElementById('aiModelInput').value.trim();
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
      this.wallboard.connectionManager.renderConnections();

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
