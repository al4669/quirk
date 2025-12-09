// Execution Manager - Handles node execution pipeline for QUIRK
class ExecutionManager {
  constructor(wallboard) {
    this.wallboard = wallboard;
    this.executionState = {}; // nodeId -> { status, result, error, lastRun, iterationCount, executionTime }
    this.isExecuting = false;
    this.currentPipeline = null;
    this.maxIterations = 10; // Default max iterations for cycles
    this.cycleWarningShown = false; // Track if user has been warned about cycles
    this.llmConfigPromise = this.loadLLMConfig();
    this.llmConfig = null;

    // Initialize config
    this.llmConfigPromise.then(config => {
      this.llmConfig = config;
    });
  }

  // Clear any stale "running" states (e.g., after refresh) so nodes don't stay stuck
  sanitizeExecutionStateOnLoad() {
    Object.keys(this.executionState || {}).forEach(id => {
      const state = this.executionState[id];
      if (state?.status === 'running') {
        this.executionState[id] = {
          ...state,
          status: 'idle',
          iterationCount: 0
        };
        delete this.executionState[id].error;
        delete this.executionState[id].errorStack;
      }
    });
  }

  // Load LLM configuration from localStorage (use AI chat settings)
  async loadLLMConfig() {
    // Use the same config as AI chat for consistency
    const provider = localStorage.getItem('ai_chat_provider') || 'ollama';
    const endpoint = localStorage.getItem('ai_chat_endpoint') || 'http://localhost:11434/api/chat';
    const model = localStorage.getItem('ai_chat_model') || 'qwen3:4b';

    // Load API key from IndexedDB
    let apiKey = '';
    if (this.wallboard && provider !== 'ollama') {
      // Wait for storage to be ready
      await this.ensureStorageReady();

      if (this.wallboard.storage) {
        apiKey = await this.wallboard.storage.getAPIKey(provider) || '';
      }
    }

    return {
      endpoint: endpoint,
      model: model,
      provider: provider,
      apiKey: apiKey,
      maxTokens: 4096
    };
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
      console.error('ExecutionManager: Storage failed to initialize after 5 seconds');
    }
  }

  // Save LLM configuration to localStorage (sync with AI chat settings)
  saveLLMConfig(config) {
    this.llmConfig = { ...this.llmConfig, ...config };

    // Sync with AI chat settings
    if (config.endpoint) {
      localStorage.setItem('ai_chat_endpoint', config.endpoint);
    }
    if (config.model) {
      localStorage.setItem('ai_chat_model', config.model);
    }
  }

  // Show LLM configuration dialog (same as AI chat settings)
  async showLLMConfigDialog() {
    // Ensure config is loaded
    if (!this.llmConfig) {
      await this.llmConfigPromise;
    }

    const dialog = document.createElement('div');
    dialog.className = 'export-dialog'; // Reuse export dialog styles
    dialog.innerHTML = `
      <div class="export-dialog-content" style="max-width: 500px;">
        <h3>LLM Configuration</h3>
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">
          These settings are shared with AI Chat. Use AI Chat Settings to configure API keys securely.
        </p>
        <div style="margin: 20px 0;">
          <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">API Endpoint</label>
          <input type="text" id="llm-endpoint" value="${this.llmConfig.endpoint}"
                 placeholder="http://localhost:11434/api/chat"
                 style="width: 100%; padding: 8px; background: var(--bg-secondary); color: var(--text); border: 1px solid var(--border); border-radius: 4px;">
          <small style="color: var(--text-tertiary); font-size: 12px; display: block; margin-top: 4px;">
            Ollama native: http://localhost:11434/api/chat<br>
            OpenAI-compatible: http://localhost:11434/v1/chat/completions<br>
            Anthropic: http://localhost:8080/api/anthropic<br>
            OpenAI: http://localhost:8080/api/openai
          </small>
        </div>
        <div style="margin: 20px 0;">
          <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">Model</label>
          <input type="text" id="llm-model" value="${this.llmConfig.model}"
                 placeholder="qwen3:4b"
                 style="width: 100%; padding: 8px; background: var(--bg-secondary); color: var(--text); border: 1px solid var(--border); border-radius: 4px;">
          <small style="color: var(--text-tertiary); font-size: 12px; display: block; margin-top: 4px;">
            Ollama: qwen3:4b, llama3.2, mistral, etc.<br>
            Anthropic: claude-sonnet-4-5-20250929, claude-3-5-sonnet-20241022<br>
            OpenAI: gpt-4, gpt-3.5-turbo
          </small>
        </div>
        <div style="margin: 20px 0; padding: 12px; background: var(--bg-tertiary); border-radius: 8px; border: 1px solid var(--border);">
          <strong style="color: var(--text); display: block; margin-bottom: 8px;">API Key Management</strong>
          <p style="color: var(--text-secondary); font-size: 13px; margin: 0;">
            API keys are now managed securely in AI Chat Settings. Open AI Chat and click the settings icon to add or update your API keys for Anthropic Claude or OpenAI.
          </p>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 20px;">
          <button class="export-btn" onclick="wallboard.executionManager.saveLLMConfigFromDialog(); this.closest('.export-dialog').remove();"
                  style="flex: 1;">Save</button>
          <button class="export-cancel" onclick="this.closest('.export-dialog').remove();"
                  style="flex: 1;">Cancel</button>
        </div>
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

  // Save LLM config from dialog inputs
  saveLLMConfigFromDialog() {
    const config = {
      endpoint: document.getElementById('llm-endpoint').value,
      model: document.getElementById('llm-model').value
    };
    this.saveLLMConfig(config);
    alert('LLM configuration saved and synced with AI Chat!');
  }

  // Main entry point: Execute from a specific node
  async executeFromNode(nodeId) {
    if (this.isExecuting) {
      alert('Execution already in progress. Please wait...');
      return;
    }

    const startNode = this.wallboard.getNodeById(nodeId);
    if (!startNode) {
      console.error('Start node not found:', nodeId);
      return;
    }

    this.isExecuting = true;
    this.cycleWarningShown = false;

    try {
      // Build execution graph
      const executionGraph = this.buildExecutionGraph(nodeId);
      const nodeCount = executionGraph.nodes.length;

      // Detect cycles
      const cycleInfo = this.detectCycles(executionGraph);

      if (cycleInfo.hasCycles && !this.cycleWarningShown) {
        const confirmed = confirm(
          `⚠️ Cycle detected in execution graph!\n\n` +
          `Cycling nodes: ${cycleInfo.cyclingNodes.map(id => this.wallboard.getNodeById(id)?.title || id).join(' → ')}\n\n` +
          `Execution will proceed with max ${this.maxIterations} iterations per node.\n\n` +
          `Continue?`
        );

        if (!confirmed) {
          this.isExecuting = false;
          return;
        }

        this.cycleWarningShown = true;
      }

      // Execute pipeline
      await this.executePipeline(executionGraph.nodes);

      console.log('✅ Pipeline execution complete!');
      this.notifyWorkflowComplete(nodeCount, startNode);
    } catch (error) {
      console.error('Pipeline execution failed:', error);
      alert(`Execution failed: ${error.message}`);
    } finally {
      this.isExecuting = false;
      this.currentPipeline = null;
    }
  }

  // Check if a node is executable (always true - all nodes can start execution)
  isNodeExecutable(node) {
    // All nodes can be execution starting points
    return true;
  }

  // Normalize node type (prefers explicit nodeType on data)
  getNodeType(node) {
    const explicit = node?.data?.nodeType || '';
    const fallback = node?.title || node?.type || '';
    return (explicit || fallback || '').toLowerCase();
  }

  // Check if a node has actual code to execute
  hasExecutableCode(node) {
    if (!node.data || !node.data.content) return false;
    const codeBlocks = this.extractCodeBlocks(node.data.content, this.getNodeType(node));
    return codeBlocks.length > 0;
  }

  // Check if a node is a result node (should be excluded from execution)
  // Only matches exact pattern "Node Name Result" (not "Node Name Result Old" etc)
  isResultNode(node) {
    if (!node.title) return false;

    // Must end with " Result" and nothing after it
    const trimmed = node.title.trim();
    return trimmed.endsWith(' Result') && trimmed.split(' Result').length === 2;
  }

  // Extract JavaScript code to execute for a node
  extractCodeBlocks(markdown, nodeType = '') {
    const type = (nodeType || '').toLowerCase();

    // Dedicated script nodes run their full content
    if (type === 'script') {
      const content = (markdown || '').trim();
      if (!content) return [];

      // If legacy fences exist, unwrap them
      const fenced = content.match(/^```(?:[a-zA-Z]+)?\n([\s\S]*?)```$/);
      const code = fenced ? fenced[1].trim() : content;
      return code ? [code] : [];
    }

    // Legacy fenced script blocks (kept for backwards compatibility)
    const codeBlockRegex = /```(?:script)\n([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = codeBlockRegex.exec(markdown)) !== null) {
      blocks.push(match[1].trim());
    }

    return blocks;
  }

  // Get remaining text content (excluding executable code)
  getTextContent(markdown, nodeType = '') {
    if (!markdown) return '';
    const type = (nodeType || '').toLowerCase();

    // Script nodes don't contribute plain text content
    if (type === 'script') return '';

    // Instruction nodes return their content verbatim
    if (type === 'instruction' || type === 'instruct') {
      return markdown.trim();
    }

    // Default: strip fenced code blocks
    return markdown.replace(/```[\s\S]*?```/g, '').trim();
  }

  // Strip markdown links to prevent LLM from seeing/reproducing them
  stripMarkdownLinks(text) {
    if (!text || typeof text !== 'string') return text;

    // Replace [text](url) with just text
    // This prevents the LLM from seeing node links like [Node Name](id:123)
    let cleaned = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    // Also strip wiki-style links [[NAME]]
    cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, '$1');

    return cleaned;
  }

  // Resolve template variables like {{Node Title}} or {{Node Title Result}}
  resolveTemplateVariables(text, currentNodeId, escapeForJS = false) {
    if (!text) return text;
    const allowedUpstream = this.getAllUpstreamNodeIds(currentNodeId);

    // Find all {{...}} patterns
    const variableRegex = /\{\{([^}]+)\}\}/g;

    return text.replace(variableRegex, (match, nodeTitleRaw) => {
      const nodeTitle = nodeTitleRaw.trim();

      // Check if it ends with " Result" or " RESULT" to reference execution output
      const isResultReference = nodeTitle.endsWith(' Result') ||
                                nodeTitle.endsWith(' RESULT') ||
                                nodeTitle.endsWith(' result');

      let targetTitle = nodeTitle;
      if (isResultReference) {
        // Remove " Result", " RESULT", or " result" suffix
        if (nodeTitle.toLowerCase().endsWith(' result')) {
          targetTitle = nodeTitle.slice(0, -7).trim();
        }
      }

      // Find the node by title
      const targetNode = this.wallboard.nodes.find(n =>
        n.title && n.title.toLowerCase() === targetTitle.toLowerCase()
      );

      if (!targetNode) {
        console.warn(`Template variable reference not found: ${nodeTitle}`);
        return match; // Keep original {{...}} if not found
      }

      // Enforce data-flow: only allow current node or upstream nodes
      if (!allowedUpstream.has(targetNode.id)) {
        console.warn(`Template variable reference not in upstream graph: ${nodeTitle}`);
        return match;
      }

      let value;
      if (isResultReference) {
        // Reference to execution result
        const state = this.executionState[targetNode.id];
        if (state && state.result !== undefined && state.result !== null) {
          value = typeof state.result === 'object'
            ? JSON.stringify(state.result, null, 2)
            : String(state.result);
        } else {
          console.warn(`No execution result found for: ${nodeTitle}`);
          return match; // Keep original if no result
        }
      } else {
        // Reference to node content (strip links/blocks)
        const rawContent = targetNode.data?.content || '';
        const textOnly = this.getTextContent(rawContent, this.getNodeType(targetNode));
        value = this.stripMarkdownLinks(textOnly);
      }

      // If escaping for JS, wrap in backticks for template literal
      if (escapeForJS) {
        // Escape backticks and ${} in the value
        value = value.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
        return '`' + value + '`';
      }

      return value;
    });
  }

  // Build execution graph starting from a node (BFS for topological order)
  buildExecutionGraph(startNodeId) {
    const visited = new Set();
    const nodes = [];
    const queue = [startNodeId];

    while (queue.length > 0) {
      const nodeId = queue.shift();

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = this.wallboard.getNodeById(nodeId);
      if (!node) continue;

      // Skip result nodes - they're terminal nodes for visualization only
      if (this.isResultNode(node)) {
        console.log(`Skipping Result node ${node.id} from execution graph`);
        continue;
      }

      // Add all nodes to the execution graph
      nodes.push(node);

      // Find downstream connections
      const downstreamNodeIds = this.getDownstreamNodeIds(nodeId);
      queue.push(...downstreamNodeIds.filter(id => !visited.has(id)));
    }

    return { nodes, startNodeId };
  }

  // Get downstream node IDs for a given node
  getDownstreamNodeIds(nodeId) {
    const connections = this.wallboard.connectionManager.connections;
    return connections
      .filter(conn => conn.start.nodeId === nodeId)
      .map(conn => conn.end.nodeId);
  }

  // Get upstream node IDs for a given node
  getUpstreamNodeIds(nodeId) {
    const connections = this.wallboard.connectionManager.connections;
    return connections
      .filter(conn => conn.end.nodeId === nodeId)
      .map(conn => conn.start.nodeId);
  }

  // Get all upstream node IDs (transitive) including the current node
  getAllUpstreamNodeIds(nodeId) {
    const visited = new Set();
    const stack = [nodeId];

    while (stack.length > 0) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);

      const directUpstream = this.getUpstreamNodeIds(current);
      directUpstream.forEach(id => {
        if (!visited.has(id)) {
          stack.push(id);
        }
      });
    }

    return visited;
  }

  // Lightweight browser notification helper
  showBrowserNotification(title, body) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const trigger = () => {
      try {
        new Notification(title, { body });
      } catch (e) {
        console.warn('Notification failed:', e);
      }
    };

    if (Notification.permission === 'granted') {
      trigger();
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          trigger();
        }
      });
    }
  }

  // Composite notifier: toast + browser notification if allowed
  notifyWorkflowComplete(nodeCount, startNode) {
    const message = `${nodeCount} node${nodeCount === 1 ? '' : 's'} finished from "${startNode.title || startNode.id}"`;
    if (typeof Notifications?.show === 'function') {
      Notifications.show(message, 'success');
    }
    this.showBrowserNotification('Workflow complete', message);
  }

  // Detect cycles in the execution graph
  detectCycles(executionGraph) {
    const { nodes } = executionGraph;
    const visited = new Set();
    const recursionStack = new Set();
    const cyclingNodes = [];

    const dfs = (nodeId) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const downstreamIds = this.getDownstreamNodeIds(nodeId);

      for (const downId of downstreamIds) {
        if (!visited.has(downId)) {
          if (dfs(downId)) {
            cyclingNodes.push(nodeId);
            return true;
          }
        } else if (recursionStack.has(downId)) {
          cyclingNodes.push(nodeId, downId);
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    let hasCycles = false;
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) {
          hasCycles = true;
        }
      }
    }

    return {
      hasCycles,
      cyclingNodes: [...new Set(cyclingNodes)]
    };
  }

  // Execute pipeline in topological order
  async executePipeline(nodes) {
    // Reset iteration counts
    nodes.forEach(node => {
      if (!this.executionState[node.id]) {
        this.executionState[node.id] = {};
      }
      this.executionState[node.id].iterationCount = 0;
    });

    // Build adjacency and indegree
    const nodeIds = nodes.map(n => n.id);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = {};
    const adjList = {};

    nodeIds.forEach(id => {
      inDegree[id] = 0;
      adjList[id] = [];
    });

    this.wallboard.connectionManager.connections.forEach(conn => {
      const from = conn.start.nodeId;
      const to = conn.end.nodeId;

      if (nodeIds.includes(from) && nodeIds.includes(to)) {
        adjList[from].push(to);
        inDegree[to]++;
      }
    });

    // Initial ready set
    let ready = nodeIds.filter(id => inDegree[id] === 0);
    const processed = new Set();

    while (ready.length > 0) {
      const batch = ready;
      ready = [];

      // Run current batch in parallel
      await Promise.all(batch.map(async (nodeId) => {
        const node = nodeMap.get(nodeId);
        if (!node) return;

        // Check iteration limit
        const state = this.executionState[node.id] || {};
        if (state.iterationCount >= this.maxIterations) {
          console.warn(`Max iterations (${this.maxIterations}) reached for node ${node.id}`);
          this.setNodeExecutionState(node.id, 'error', {
            error: `Max iterations (${this.maxIterations}) reached`,
            iterationCount: state.iterationCount
          });
          throw new Error(`Max iterations reached for node: ${node.title || node.id}`);
        }

        // Increment iteration count
        this.executionState[node.id].iterationCount = (state.iterationCount || 0) + 1;

        await this.executeSingleNode(node);

        if (this.executionState[node.id]?.status === 'error') {
          throw new Error(`Node execution failed: ${node.title || node.id}`);
        }
      }));

      // After batch completes, update dependencies
      batch.forEach(nodeId => {
        if (processed.has(nodeId)) return;
        processed.add(nodeId);
        adjList[nodeId].forEach(childId => {
          inDegree[childId]--;
          if (inDegree[childId] === 0) {
            ready.push(childId);
          }
        });
      });
    }
  }

  // Topological sort using Kahn's algorithm
  topologicalSort(nodes) {
    const nodeIds = nodes.map(n => n.id);
    const inDegree = {};
    const adjList = {};

    // Initialize
    nodeIds.forEach(id => {
      inDegree[id] = 0;
      adjList[id] = [];
    });

    // Build adjacency list and in-degree count
    this.wallboard.connectionManager.connections.forEach(conn => {
      const from = conn.start.nodeId;
      const to = conn.end.nodeId;

      if (nodeIds.includes(from) && nodeIds.includes(to)) {
        adjList[from].push(to);
        inDegree[to]++;
      }
    });

    // Queue of nodes with no incoming edges
    const queue = nodeIds.filter(id => inDegree[id] === 0);
    const sorted = [];

    while (queue.length > 0) {
      const nodeId = queue.shift();
      sorted.push(this.wallboard.getNodeById(nodeId));

      // Reduce in-degree for downstream nodes
      adjList[nodeId].forEach(downId => {
        inDegree[downId]--;
        if (inDegree[downId] === 0) {
          queue.push(downId);
        }
      });
    }

    // If sorted length < nodes length, there's a cycle
    // But we handle this with iteration limits
    return sorted;
  }

  // Execute a single node
  async executeSingleNode(node) {
    console.log(`Executing node: ${node.title || node.id}`);

    // Set running state
    this.setNodeExecutionState(node.id, 'running', {});

    const startTime = Date.now();

    try {
      const nodeType = this.getNodeType(node);
      const isInstructionNode = nodeType === 'instruction' || nodeType === 'instruct';
      const isImageNode = nodeType === 'image';
      const isSystemNode = nodeType === 'system';
      const getInputs = () => this.getUpstreamNodeIds(node.id)
        .map(id => {
          const state = this.executionState[id];
          return state?.result;
        }).filter(r => r !== undefined && r !== null);

      const handlePassThrough = () => {
        console.log(`Node ${node.id} has no executable content - treating as pass-through`);

        const inputs = getInputs();
        const passThroughContent = inputs.length > 0 ? inputs[0] : null;

        this.executionState[node.id] = this.executionState[node.id] || {};
        this.executionState[node.id].result = passThroughContent;
        this.setNodeResultContent(node, passThroughContent);

        const executionTime = Date.now() - startTime;
        this.setNodeExecutionState(node.id, 'success', {
          result: passThroughContent,
          lastRun: Date.now(),
          executionTime
        });
      };

      if (isSystemNode) {
        const inputs = getInputs();
        const upstreamIds = this.getUpstreamNodeIds(node.id);
        const sourceNodeId = upstreamIds[upstreamIds.length - 1];
        const upstreamNode = sourceNodeId ? this.wallboard.getNodeById(sourceNodeId) : null;
        const upstreamValue = inputs.length > 0
          ? inputs[inputs.length - 1]
          : (upstreamNode?.data?.resultContent ?? upstreamNode?.data?.content ?? null);

        if (upstreamValue === undefined || upstreamValue === null ||
            (typeof upstreamValue === 'string' && upstreamValue.trim() === '')) {
          const message = 'No upstream output to save.';
          this.executionState[node.id] = this.executionState[node.id] || {};
          this.executionState[node.id].result = message;
          this.setNodeResultContent(node, message);
          this.setNodeExecutionState(node.id, 'success', {
            result: message,
            lastRun: Date.now(),
            executionTime: Date.now() - startTime
          });
          return;
        }

        const saveInfo = this.saveUpstreamOutputToFile(node, upstreamValue, upstreamNode);

        this.executionState[node.id] = this.executionState[node.id] || {};
        this.executionState[node.id].result = upstreamValue;

        const heading = saveInfo.hasFence
          ? `Saved fenced ${saveInfo.language || 'code'} block to ${saveInfo.filename}`
          : `Saved markdown to ${saveInfo.filename}`;
        const resultDisplay = `${heading}\n\n${saveInfo.displayContent}`;

        this.setNodeResultContent(node, resultDisplay);

        const executionTime = Date.now() - startTime;
        this.setNodeExecutionState(node.id, 'success', {
          result: upstreamValue,
          lastRun: Date.now(),
          executionTime
        });
        return;
      }

      if (isInstructionNode) {
        const instructPrompt = (node.data.content || '').trim();

        if (!instructPrompt) {
          handlePassThrough();
          return;
        }

        console.log(`Node ${node.id} is an instruction node - sending content to LLM`);

        // Resolve template variables in instruct prompt
        let resolvedPrompt = this.resolveTemplateVariables(instructPrompt, node.id);

        // Strip markdown links from the prompt to prevent LLM from seeing/reproducing them
        resolvedPrompt = this.stripMarkdownLinks(resolvedPrompt);

        // Get upstream data to include in LLM context
        const inputs = getInputs();

        // Build LLM prompt with ONLY instruct content and optional inputs
        let prompt = resolvedPrompt;

        // If there are inputs, append them as context
        if (inputs.length > 0) {
          prompt += `\n\n## Input Data\n\n`;
          inputs.forEach((input, i) => {
            let inputStr = typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input);
            // Strip markdown links from input to prevent LLM from reproducing them
            inputStr = this.stripMarkdownLinks(inputStr);
            prompt += `Input ${i + 1}:\n${inputStr}\n\n`;
          });
        }

        console.log(`Calling LLM with instruction node ${node.id}...`);

        // Call LLM with streaming (no auto-created result nodes)
        let streamed = '';
        let flippedOnce = false;
        const llmOutput = await this.callLLMStreaming(prompt, (partial) => {
          streamed = partial;
          // Keep latest partial in execution state and live-render on result side
          this.executionState[node.id] = this.executionState[node.id] || {};
          this.executionState[node.id].result = partial;
          this.setNodeResultContent(node, partial, { keepSide: flippedOnce, skipBadge: true });
          flippedOnce = true;
        });

        // For instruction nodes, use ONLY the LLM output as the final result
        let finalOutput = llmOutput;

        // Store result for next node
        this.executionState[node.id] = this.executionState[node.id] || {};
        this.executionState[node.id].result = finalOutput;
        this.setNodeResultContent(node, finalOutput);

        const executionTime = Date.now() - startTime;
        this.setNodeExecutionState(node.id, 'success', {
          result: finalOutput,
          lastRun: Date.now(),
          executionTime
        });

        // Final save after streaming completes
        this.wallboard.autoSave();

        console.log(`✅ LLM call completed for node ${node.id} in ${executionTime}ms`);
        return;
      }

      if (isImageNode) {
        let prompt = (node.data.content || '').trim();
        const inputs = getInputs();
        if (!prompt && inputs.length > 0) {
          prompt = typeof inputs[0] === 'object' ? JSON.stringify(inputs[0], null, 2) : String(inputs[0]);
        }

        if (!prompt) {
          handlePassThrough();
          return;
        }

        // Append upstream context if present
        if (inputs.length > 0) {
          prompt += `\n\nContext:\n${inputs.map((input, i) => `Input ${i + 1}: ${typeof input === 'object' ? JSON.stringify(input, null, 2) : String(input)}`).join('\n')}`;
        }

        try {
          const imageDataUrl = await this.generateImageWithOpenAI(prompt);
          const markdownImage = `![Generated Image](${imageDataUrl})`;

          this.executionState[node.id] = this.executionState[node.id] || {};
          this.executionState[node.id].result = imageDataUrl;
          this.setNodeResultContent(node, markdownImage);

          const executionTime = Date.now() - startTime;
          this.setNodeExecutionState(node.id, 'success', {
            result: imageDataUrl,
            lastRun: Date.now(),
            executionTime
          });

          this.wallboard.autoSave();
          return;
        } catch (err) {
          console.error('Image generation failed:', err);
          this.setNodeExecutionState(node.id, 'error', {
            error: err.message,
            errorStack: err.stack
          });
          alert(`Image generation failed: ${err.message}`);
          return;
        }
      }

      // No instruction content - check for code blocks
      const codeBlocks = this.extractCodeBlocks(node.data.content, nodeType);

      if (codeBlocks.length === 0) {
        handlePassThrough();
        return;
      }

      // Create execution context
      const context = this.createExecutionContext(node);

      // Execute all code blocks in sequence
      let lastResult = undefined;
      for (const code of codeBlocks) {
        // Resolve template variables in code (with JS escaping)
        const resolvedCode = this.resolveTemplateVariables(code, node.id, true);

        // Create async function wrapper
        const asyncCode = `
          (async function(quirk, q) {
            ${resolvedCode}
          })(quirk, quirk.q)
        `;

        // Execute code with context
        const func = new Function('quirk', asyncCode);
        lastResult = await func(context);
      }

      // Wait for any async outputs to settle
      if (context.__pendingOutputs.length > 0) {
        await Promise.all(context.__pendingOutputs);
      }

      // Automatic result: prefer explicit output(), else last returned value
      let result = context.__outputSet ? this.executionState[node.id]?.result : lastResult;
      if (result !== undefined && result !== null) {
        this.executionState[node.id] = this.executionState[node.id] || {};
        this.executionState[node.id].result = result;
        // Final render on result side with badge
        this.setNodeResultContent(node, result, { keepSide: true, skipBadge: false });
      }

      // Set success state AFTER final render (only once)
      const executionTime = Date.now() - startTime;
      this.setNodeExecutionState(node.id, 'success', {
        result,
        lastRun: Date.now(),
        executionTime
      });

      console.log(`✅ Node ${node.id} executed successfully in ${executionTime}ms`);

      // Do not auto-create/update result nodes; rely on explicit nodes

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ Node ${node.id} execution failed:`, error);

      this.setNodeExecutionState(node.id, 'error', {
        error: error.message,
        errorStack: error.stack,
        lastRun: Date.now(),
        executionTime
      });

      throw error; // Re-throw to stop pipeline
    } finally {
      const state = this.executionState[node.id];
      if (state?.status === 'running') {
        const executionTime = Date.now() - startTime;
        this.setNodeExecutionState(node.id, 'error', {
          error: 'Execution did not complete (auto-recovered)',
          lastRun: Date.now(),
          executionTime
        });
      }
    }
  }

  // Find a non-overlapping position for a new node
  // Tries the initial position first, then searches for alternatives
  findNonOverlappingPosition(startX, startY, nodeWidth, nodeHeight, gap) {
    const position = { x: startX, y: startY };
    const maxAttempts = 20;
    let attempt = 0;

    // Helper function to check if two rectangles overlap
    const overlaps = (x1, y1, w1, h1, x2, y2, w2, h2) => {
      return !(x1 + w1 + gap < x2 || x2 + w2 + gap < x1 ||
               y1 + h1 + gap < y2 || y2 + h2 + gap < y1);
    };

    // Check if position overlaps with any existing nodes
    const hasOverlap = (x, y) => {
      return this.wallboard.nodes.some(node => {
        // Use graph layout manager to get actual node dimensions
        const existingSize = this.wallboard.graphLayoutManager.measureNodeDimensions(node.id);

        return overlaps(
          x, y, nodeWidth, nodeHeight,
          node.position.x, node.position.y, existingSize.width, existingSize.height
        );
      });
    };

    // Try initial position
    if (!hasOverlap(position.x, position.y)) {
      return position;
    }

    // Try positions in a spiral pattern: down, right, down-right, etc.
    const verticalStep = nodeHeight + gap;
    const horizontalStep = nodeWidth + gap;

    while (attempt < maxAttempts) {
      attempt++;

      // Try moving down
      const downY = startY + (verticalStep * attempt);
      if (!hasOverlap(startX, downY)) {
        return { x: startX, y: downY };
      }

      // Try moving right
      const rightX = startX + (horizontalStep * attempt);
      if (!hasOverlap(rightX, startY)) {
        return { x: rightX, y: startY };
      }

      // Try diagonal down-right
      if (!hasOverlap(rightX, downY)) {
        return { x: rightX, y: downY };
      }

      // Try left
      const leftX = startX - (horizontalStep * attempt);
      if (!hasOverlap(leftX, startY)) {
        return { x: leftX, y: startY };
      }

      // Try diagonal down-left
      if (!hasOverlap(leftX, downY)) {
        return { x: leftX, y: downY };
      }
    }

    // Fallback: return far below to avoid overlaps
    return { x: startX, y: startY + (verticalStep * maxAttempts) };
  }

  // Create a result node immediately (before execution completes)
  // Reuses existing result node if one exists
  createResultNode(sourceNode, initialContent = 'Generating...') {
    console.log(`[createResultNode] Called for node ${sourceNode.id} (${sourceNode.title})`);

    // Calculate expected result node title
    const sourceTitle = sourceNode.title || 'Node';
    const expectedResultTitle = `${sourceTitle} Result`;

    // Get downstream connections
    const downstreamIds = this.getDownstreamNodeIds(sourceNode.id);
    console.log(`[createResultNode] Downstream connections:`, downstreamIds);

    // First check: Look for existing result node in downstream connections
    let existingResultNode = downstreamIds
      .map(id => this.wallboard.getNodeById(id))
      .find(node => node && this.isResultNode(node));

    // Second check: If not found downstream, search ALL nodes by title
    // This handles cases where the result node exists but isn't connected
    if (!existingResultNode) {
      existingResultNode = this.wallboard.nodes.find(node =>
        this.isResultNode(node) &&
        node.title === expectedResultTitle
      );

      // If we found it by title but it's not connected, reconnect it
      if (existingResultNode) {
        console.log(`Found orphaned result node ${existingResultNode.id} by title - reconnecting...`);

        // Check if connection already exists before creating
        const connectionExists = this.wallboard.connectionManager.connections.some(conn =>
          conn.start.nodeId === sourceNode.id && conn.end.nodeId === existingResultNode.id
        );

        if (!connectionExists) {
          this.wallboard.connectionManager.createConnection(
            { nodeId: sourceNode.id },
            { nodeId: existingResultNode.id }
          );
          this.wallboard.connectionManager.updateConnections();
        }
      }
    }

    if (existingResultNode) {
      // Reuse existing result node
      console.log(`✓ [createResultNode] REUSING existing result node ${existingResultNode.id} (${existingResultNode.title}) for node ${sourceNode.id}`);

      // Update content to initial content
      this.updateResultNodeContent(existingResultNode, initialContent);

      // Apply emerald theme to existing result node
      this.wallboard.nodeThemes[existingResultNode.id] = 'emerald';
      this.wallboard.applyNodeTheme(existingResultNode.id);

      return existingResultNode;
    }

    console.log(`[createResultNode] No existing result node found - creating new one for node ${sourceNode.id}...`);

    // Calculate position below source node with collision detection
    const sourceSize = this.wallboard.graphLayoutManager.measureNodeDimensions(sourceNode.id);
    const verticalGap = 100; // Gap between source and result
    const horizontalGap = 50; // Minimum gap between adjacent nodes

    // Reserve space for maximum node size during streaming
    const maxNodeWidth = 400;
    const maxNodeHeight = 600;

    // Start position: directly below source node
    const startX = sourceNode.position.x;
    const startY = sourceNode.position.y + sourceSize.height + verticalGap;

    // Find non-overlapping position using collision detection
    const position = this.findNonOverlappingPosition(
      startX,
      startY,
      maxNodeWidth,
      maxNodeHeight,
      horizontalGap
    );

    // Create node at the calculated position
    const resultNode = this.wallboard.nodeOperationsManager.createNode(
      'markdown',
      { content: initialContent },
      position
    );

    // Set the title to "Result"
    resultNode.title = expectedResultTitle;

    // Render the node visually on the canvas
    this.wallboard.renderNode(resultNode);

    // Apply emerald theme to new result node
    this.wallboard.nodeThemes[resultNode.id] = 'emerald';
    this.wallboard.applyNodeTheme(resultNode.id);

    // Update the DOM to show the new title
    const nodeTypeEl = document.getElementById(`type-${resultNode.id}`);
    if (nodeTypeEl) {
      NodeRenderer.setNodeTypeLabel(nodeTypeEl, expectedResultTitle);
    }

    // Create connection from source node to result node
    this.wallboard.connectionManager.createConnection(
      { nodeId: sourceNode.id },
      { nodeId: resultNode.id }
    );

    // Update connections visually
    this.wallboard.connectionManager.updateConnections();

    console.log(`✅ [createResultNode] Created NEW result node ${resultNode.id} (${expectedResultTitle}) connected to node ${sourceNode.id}`);

    // Auto-save
    this.wallboard.autoSave();

    return resultNode;
  }

  // Update result node content during streaming
  updateResultNodeContent(resultNode, content) {
    if (!resultNode) return;
    this.setNodeResultContent(resultNode, content);
  }

  // Create execution context (quirk API)
  createExecutionContext(node) {
    const self = this;
    const context = {
      __outputSet: false,
      __consoleOutput: [], // Capture console.log output
      __pendingOutputs: [],

      // Get inputs from upstream nodes
      inputs: function() {
        const upstreamIds = self.getUpstreamNodeIds(node.id);
        return upstreamIds.map(id => {
          const state = self.executionState[id];
          if (state && state.result !== undefined) {
            return state.result;
          }
          // Fallback to node content
          const upstreamNode = self.wallboard.getNodeById(id);
          return upstreamNode?.data?.content || null;
        });
      },

      // Set output for this node
      output: function(value) {
        const assign = (val) => {
          context.__outputSet = true;
          self.executionState[node.id] = self.executionState[node.id] || {};
          self.executionState[node.id].result = val;
          self.setNodeResultContent(node, val);
          return val;
        };

        // Handle promise outputs gracefully
        if (value && typeof value.then === 'function') {
          const p = Promise.resolve(value).then(assign);
          context.__pendingOutputs.push(p);
          return p;
        }

        return assign(value);
      },

      // Override console.log to capture output
      console: {
        log: function(...args) {
          // Also log to real console
          window.console.log(...args);

          // Capture for output
          const output = args.map(arg => {
            if (typeof arg === 'object') {
              return JSON.stringify(arg, null, 2);
            }
            return String(arg);
          }).join(' ');

          context.__consoleOutput.push(output);
        }
      },

      // Call LLM API (uses streaming by default)
      llm: async function(prompt, config = {}) {
        // For now, use non-streaming in code blocks (streaming is for markdown nodes)
        // In the future, could support callbacks for streaming in code
        return await self.callLLM(prompt, config);
      },

      // Get all nodes (read-only)
      nodes: function() {
        return self.wallboard.nodes.map(n => ({
          id: n.id,
          title: n.title,
          content: n.data?.content,
          position: { ...n.position }
        }));
      },

      // Get specific node by ID
      getNode: function(id) {
        const n = self.wallboard.getNodeById(id);
        if (!n) return null;
        return {
          id: n.id,
          title: n.title,
          content: n.data?.content,
          position: { ...n.position }
        };
      },

      // Convenience alias object
      q: {}
    };

    // q.output -> set result
    context.q.output = (value) => {
      return context.output(value);
    };

    // q.save -> download content as a file (defaults to txt)
    context.q.save = (data, filename = null, ext = null) => {
      const resolveAndSave = (value) => {
        let raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

        // If the content is a fenced block, strip fences and infer extension
        let fenceExt = null;
        let fenceBody = null;
        const fenceMatch = raw.match(/```(\w+)\s*\n([\s\S]*?)\n```/);
        if (fenceMatch) {
          fenceExt = fenceMatch[1];
          fenceBody = fenceMatch[2];
          raw = fenceBody;
        }

        const hasExt = filename && filename.includes('.');

        // Detect extension from filename or ext hint, fallback to .txt
        const detectedExt = hasExt
          ? ''
          : (ext ? `.${ext.replace(/^\./, '')}` : '.txt');

        // If filename not provided, try to infer from markdown fence in content
        let inferredName = filename;
        if (!inferredName) {
          if (fenceExt) {
            inferredName = `${(node.title || `node-${node.id}`).toString().replace(/[<>:"/\\|?*]+/g, '-')}.${fenceExt}`;
          }
        }

        const resolvedExt = hasExt ? '' : detectedExt;
        const safeName = filename
          ? filename
          : inferredName
            ? inferredName
            : `${(node.title || `node-${node.id}`).toString().replace(/[<>:"/\\|?*]+/g, '-')}${resolvedExt}`;
        const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return safeName;
      };

      if (data && typeof data.then === 'function') {
        return Promise.resolve(data).then(resolveAndSave);
      }
      return resolveAndSave(data);
    };

    return context;
  }

  // Call LLM API with streaming (supports Ollama, Anthropic, OpenAI)
  async callLLMStreaming(prompt, onChunk, config = {}) {
    // Ensure config is loaded
    if (!this.llmConfig) {
      await this.llmConfigPromise;
    }

    const endpoint = config.endpoint || this.llmConfig.endpoint;
    const model = config.model || this.llmConfig.model;
    const apiKey = config.apiKey || this.llmConfig.apiKey;

    // Detect endpoint type
    const isOllamaNative = endpoint.includes('/api/chat');
    const isAnthropic = endpoint.includes('anthropic') && !isOllamaNative;
    const isOpenAI = (endpoint.includes('openai') || endpoint.includes('/v1/chat/completions')) && !isOllamaNative;

    try {
      // Build request body based on endpoint type
      let requestBody;
      let headers = {
        'Content-Type': 'application/json'
      };

      if (isOllamaNative) {
        // Ollama native API
        requestBody = {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          stream: true
        };
      } else if (isAnthropic) {
        // Anthropic via proxy
        if (!apiKey) {
          throw new Error('API key required for Anthropic. Please configure in LLM Config.');
        }
        requestBody = {
          apiKey: apiKey, // Proxy extracts this
          model: model,
          max_tokens: this.llmConfig.maxTokens || 4096,
          messages: [{ role: 'user', content: prompt }],
          stream: true
        };
      } else {
        // OpenAI-compatible API (OpenAI, llama.cpp, etc.)
        requestBody = {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          stream: true
        };

        if (apiKey) {
          requestBody.apiKey = apiKey; // For proxy
        }
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('LLM API error response:', errorText);
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
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
            if (isOllamaNative) {
              // Ollama native format
              const parsed = JSON.parse(trimmed);
              if (parsed.message && parsed.message.content) {
                fullResponse += parsed.message.content;
                // Filter out <think></think> tags before displaying
                const filtered = fullResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                onChunk && onChunk(filtered);
              }
            } else if (isOpenAI || isAnthropic) {
              // OpenAI/Anthropic format (SSE)
              if (trimmed.startsWith('data: ')) {
                const dataStr = trimmed.slice(6);
                if (dataStr === '[DONE]') continue;

                const parsed = JSON.parse(dataStr);

                if (isAnthropic) {
                  // Anthropic format
                  if (parsed.type === 'content_block_delta') {
                    fullResponse += parsed.delta?.text || '';
                    // Filter out <think></think> tags before displaying
                    const filtered = fullResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                    onChunk && onChunk(filtered);
                  }
                } else {
                  // OpenAI format
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullResponse += delta;
                    // Filter out <think></think> tags before displaying
                    const filtered = fullResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                    onChunk && onChunk(filtered);
                  }
                }
              }
            }
          } catch (parseError) {
            console.warn('Failed to parse streaming line:', trimmed, parseError);
          }
        }
      }

      // Return filtered response
      return fullResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    } catch (error) {
      console.error('LLM streaming call failed:', error);
      throw new Error(`LLM streaming failed: ${error.message}`);
    }
  }

  // Call LLM API without streaming (legacy, kept for compatibility)
  async callLLM(prompt, config = {}) {
    // Ensure config is loaded
    if (!this.llmConfig) {
      await this.llmConfigPromise;
    }

    const endpoint = config.endpoint || this.llmConfig.endpoint;
    const model = config.model || this.llmConfig.model;
    const apiKey = config.apiKey || this.llmConfig.apiKey;

    // Detect endpoint type
    const isOllamaNative = endpoint.includes('/api/chat');
    const isAnthropic = endpoint.includes('anthropic') && !isOllamaNative;
    const isOpenAI = (endpoint.includes('openai') || endpoint.includes('/v1/chat/completions')) && !isOllamaNative;

    try {
      // Build request body based on endpoint type
      let requestBody;
      let headers = {
        'Content-Type': 'application/json'
      };

      if (isOllamaNative) {
        // Ollama native API
        requestBody = {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          stream: false
        };
      } else if (isAnthropic) {
        // Anthropic via proxy
        if (!apiKey) {
          throw new Error('API key required for Anthropic. Please configure in LLM Config.');
        }
        requestBody = {
          apiKey: apiKey, // Proxy extracts this
          model: model,
          max_tokens: this.llmConfig.maxTokens || 4096,
          messages: [{ role: 'user', content: prompt }]
        };
      } else {
        // OpenAI-compatible API (OpenAI, llama.cpp, etc.)
        requestBody = {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          stream: false
        };

        if (apiKey) {
          requestBody.apiKey = apiKey; // For proxy
        }
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('LLM API error response:', errorText);
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Extract response based on endpoint type
      if (isOllamaNative) {
        return data.message?.content || data.response || '';
      } else if (isAnthropic) {
        return data.content?.[0]?.text || '';
      } else {
        // OpenAI-compatible
        return data.choices?.[0]?.message?.content || '';
      }
    } catch (error) {
      console.error('LLM API call failed:', error);
      throw new Error(`LLM API call failed: ${error.message}`);
    }
  }

  // Update node content with execution result (deprecated - now creates result nodes instead)
  updateNodeWithResult(nodeId, result) {
    // No longer modifying the original node content
    // Results are shown in separate "Result X" nodes
    // This method kept for backwards compatibility but does nothing
    return;
  }

  formatResultContent(value) {
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') {
      try {
        return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
      } catch (e) {
        return String(value);
      }
    }
    return String(value);
  }

  // Save upstream output to disk for system nodes
  saveUpstreamOutputToFile(node, upstreamValue, upstreamNode = null) {
    const raw = upstreamValue === undefined || upstreamValue === null
      ? ''
      : (typeof upstreamValue === 'string'
        ? upstreamValue
        : JSON.stringify(upstreamValue, null, 2));

    const trimmed = raw.trim();
    const fenceMatch = trimmed.match(/^```(\w+)?\s*\n([\s\S]*?)\n```$/);
    const hasFence = !!fenceMatch;
    const language = (fenceMatch?.[1] || '').trim();
    const body = fenceMatch?.[2] ?? raw;
    const extension = hasFence && language ? language.toLowerCase() : 'md';
    const extMap = { javascript: 'js', typescript: 'ts', python: 'py', shell: 'sh', bash: 'sh' };
    const normalizedExt = extMap[extension] || extension;

    const baseTitle = (upstreamNode?.title || upstreamNode?.type || node.title || node.type || 'output')
      .toString()
      .trim();
    const safeBase = baseTitle
      .replace(/[<>:"/\\|?*]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'output';

    const filename = `${safeBase}.${normalizedExt}`;
    this.downloadTextFile(body, filename);

    const displayContent = hasFence && language
      ? `\`\`\`${language}\n${body}\n\`\`\``
      : body;

    return {
      filename,
      displayContent,
      hasFence,
      language: language || null,
      extension
    };
  }

  // Trigger a text file download in the browser
  downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  setNodeResultContent(nodeOrId, value, options = {}) {
    const { keepSide = false, skipBadge = false, streaming = false } = options;
    const node = typeof nodeOrId === 'number'
      ? this.wallboard.getNodeById(nodeOrId)
      : nodeOrId;
    if (!node) return;

    const normalizedValue = value === undefined || value === null
      ? ''
      : String(value)
          .replace(/[\u00a0\u202f\u2007]/g, ' ')   // NBSP variants
          .replace(/[\u200b-\u200d\ufeff]/g, '')  // zero-width chars
          .trim();
    const hasValue = normalizedValue !== '';

    if (!hasValue) {
      delete node.data.resultContent;
      delete node.data.resultHtml;
      node.data.showingResult = false;
      this.wallboard.setNodeSide(node.id, 'content');
      if (this.executionState[node.id]) {
        delete this.executionState[node.id].result;
      }
      if (this._streamingFlipped) this._streamingFlipped.delete(node.id);
    } else {
      if (streaming) {
        // Lightweight streaming update: store plain content, skip markdown render
        node.data.resultContent = value;
        node.data.resultHtml = null;
        // Force showing result side during streaming (but only flip once)
        node.data.showingResult = true;
        this._streamingFlipped = this._streamingFlipped || new Set();
        if (!this._streamingFlipped.has(node.id)) {
          this._streamingFlipped.add(node.id);
          this.wallboard.setNodeSide(node.id, 'result');
        }
      } else {
        if (this._streamingFlipped) this._streamingFlipped.delete(node.id);
        const formatted = this.formatResultContent(value);
        node.data.resultContent = formatted;
        node.data.resultHtml = typeof MarkdownRenderer !== 'undefined'
          ? MarkdownRenderer.render(formatted)
          : marked.parse(formatted);
        if (this.wallboard.linkManager) {
          this.wallboard.linkManager.processNodeLinks(node.id, node.data.resultContent, false);
        }
        // Auto-flip to result side so streaming is visible (unless keepSide)
        if (!keepSide) {
          this.wallboard.setNodeSide(node.id, 'result');
         }
       }
    }

    const resultEl = document.getElementById(`result-content-${node.id}`);
    if (resultEl) {
      const cm = resultEl.querySelector('.text-editor')?._cmInstance;
      if (cm) {
        cm.setValue(node.data.resultContent || '');
      } else if (streaming) {
        const latest = node.data.resultContent || '';
        const MAX_STREAM_CHARS = 300;
        const displayText = latest.length > MAX_STREAM_CHARS
          ? '…' + latest.slice(-MAX_STREAM_CHARS)
          : latest;

        let body = resultEl.querySelector('.stream-text');
        if (!body) {
          body = document.createElement('pre');
          body.className = 'stream-text';
          body.style.whiteSpace = 'pre-wrap';
          body.style.margin = '0';
          body.style.fontFamily = 'inherit';
          resultEl.innerHTML = '';
          resultEl.appendChild(body);
        }

        body.textContent = displayText;
        resultEl.style.overflow = 'hidden';
        resultEl.style.maxHeight = `${resultEl.clientHeight || 200}px`;
        resultEl.style.scrollbarWidth = 'none';
        resultEl.style.msOverflowStyle = 'none';
        resultEl.scrollTop = 0;
      } else {
        const fullText = node.data.resultContent || '';
        const MAX_RENDER_CHARS = 3000;
        const shouldTruncate = fullText.length > MAX_RENDER_CHARS;
        if (shouldTruncate) {
          const displayText = '…' + fullText.slice(-MAX_RENDER_CHARS);
          let body = resultEl.querySelector('.stream-text');
          if (!body) {
            body = document.createElement('pre');
            body.className = 'stream-text';
            body.style.whiteSpace = 'pre-wrap';
            body.style.margin = '0';
            body.style.fontFamily = 'inherit';
            resultEl.innerHTML = '';
            resultEl.appendChild(body);
          }
          body.textContent = displayText;
          resultEl.style.overflow = 'auto';
          resultEl.style.maxHeight = '';
          resultEl.scrollTop = resultEl.scrollHeight;
        } else {
          resultEl.innerHTML = Sanitization.sanitize(this.wallboard.renderNodeContent(node, 'result'));
          this.wallboard.htmlPreviewManager?.hydrate(resultEl, node, 'result');
          setTimeout(() => {
            this.wallboard.enableCheckboxes(resultEl, node);
            if (typeof Prism !== 'undefined') {
              const codeBlocks = resultEl.querySelectorAll('pre code');
              codeBlocks.forEach(block => Prism.highlightElement(block));
            }
          }, 0);
        }
      }
    }

    const state = this.executionState[node.id] || {};
    if (!skipBadge) {
      this.updateStatusBadge(node.id, state.status || 'idle', state);
    }

    if (!streaming && resultEl && !resultEl.querySelector('.text-editor')) {
      const isNearBottom = resultEl.scrollHeight - resultEl.scrollTop - resultEl.clientHeight < 80;
      const wasEmpty = !hasValue;
      if (isNearBottom || wasEmpty) {
        resultEl.scrollTop = resultEl.scrollHeight;
      }
    }

    if (!streaming && !this._saveTimeout) {
      this._saveTimeout = setTimeout(() => {
        this.wallboard.autoSave();
        this._saveTimeout = null;
      }, 800);
    }
  }

  // Generate image via OpenAI Images API (basic support)
  async generateImageWithOpenAI(prompt) {
    // Ensure config is loaded
    if (!this.llmConfig) {
      await this.llmConfigPromise;
    }

    const baseEndpoint = (this.llmConfig.endpoint || '').toLowerCase();
    const apiKey = this.llmConfig.apiKey;

    if (!apiKey) {
      throw new Error('API key required for OpenAI image generation. Configure it in AI Chat Settings.');
    }

    // Derive image endpoint from configured endpoint; fallback to OpenAI public endpoint
    let imageEndpoint = this.llmConfig.endpoint || '';
    const isOpenAI = baseEndpoint.includes('openai.com');
    if (imageEndpoint.includes('/chat/completions')) {
      imageEndpoint = imageEndpoint.replace('/chat/completions', '/images/generations');
    } else if (!imageEndpoint.includes('/images/generations')) {
      // If configured endpoint is not clearly OpenAI, default to the official endpoint
      imageEndpoint = isOpenAI
        ? (imageEndpoint.endsWith('/') ? `${imageEndpoint}images/generations` : `${imageEndpoint}/images/generations`)
        : 'https://api.openai.com/v1/images/generations';
    }

    // Allow a dedicated image model override; otherwise default to OpenAI image model
    const imageModel = localStorage.getItem('ai_image_model') || 'gpt-image-1';

    const body = {
      model: imageModel,
      prompt,
      size: '1024x1024'
    };

    const response = await fetch(imageEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Image API error: ${response.status} ${response.statusText} - ${errText}`);
    }

    const result = await response.json();
    const item = result?.data?.[0] || {};
    const b64 = item.b64_json;
    const url = item.url;
    if (b64) {
      return `data:image/png;base64,${b64}`;
    }
    if (url) {
      return url;
    }
    throw new Error('Image API returned no image data.');
  }

  // Set node execution state and update UI
  setNodeExecutionState(nodeId, status, data = {}) {
    // Update state
    this.executionState[nodeId] = {
      ...this.executionState[nodeId],
      status,
      ...data
    };

    // Update visual state
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) return;

    // Remove all execution state classes
    nodeElement.classList.remove('executing', 'execution-success', 'execution-error');

    // Add appropriate class
    if (status === 'running') {
      nodeElement.classList.add('executing');
    } else if (status === 'success') {
      nodeElement.classList.add('execution-success');
    } else if (status === 'error') {
      nodeElement.classList.add('execution-error');
    }

    // Update or create status badge
    this.updateStatusBadge(nodeId, status, data);
  }

  // Update execution status badge on node
  updateStatusBadge(nodeId, status, data) {
    status = status || 'idle';
    data = data || {};
    const node = this.wallboard.getNodeById(nodeId);
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) return;

    // Find or create badge container
    let badge = nodeElement.querySelector('.execution-status-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'execution-status-badge';
      nodeElement.appendChild(badge);
    }

    const hasResult = !!node?.data?.resultContent;
    const shouldShow = status === 'running' || hasResult;

    if (!shouldShow) {
      badge.style.display = 'none';
      badge.onclick = null;
      badge.classList.remove('is-running', 'has-result');
      return;
    }

    // Update badge content based on status
      if (status === 'running') {
        badge.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" opacity="0.25"/>
            <path d="M12 2 A10 10 0 0 1 22 12" stroke-dasharray="32" stroke-dashoffset="0">
              <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
            </path>
          </svg>
        `;
        badge.title = 'Executing...';
        badge.onclick = (e) => {
          e.stopPropagation();
          const showingResult = this.wallboard.isShowingResult(nodeId);
          this.wallboard.setNodeSide(nodeId, showingResult ? 'content' : 'result');
        };
        badge.classList.add('is-running');
        badge.classList.remove('has-result');
        badge.style.display = 'flex';
        badge.style.pointerEvents = 'auto';
    } else if (status === 'error') {
      badge.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" fill="rgba(239, 68, 68, 0.1)"/>
          <path d="M15 9l-6 6M9 9l6 6"/>
        </svg>
      `;
      badge.title = `Error: ${data.error || 'Unknown error'}`;
      badge.onclick = null;
      badge.classList.remove('is-running');
      badge.classList.remove('has-result');
      badge.style.display = 'flex';
      badge.style.pointerEvents = 'auto';
    } else if (hasResult) {
      badge.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12a7 7 0 0 1 7-7h2" />
          <polyline points="10 4 14 4 14 8"></polyline>
          <path d="M19 12a7 7 0 0 1-7 7h-2"></path>
          <polyline points="14 20 10 20 10 16"></polyline>
        </svg>
      `;
      const showingResult = this.wallboard.isShowingResult(nodeId);
      badge.title = showingResult ? 'Back to content' : 'View result';
      badge.onclick = (e) => {
        e.stopPropagation();
        this.wallboard.toggleResultSide(nodeId);
      };
      badge.classList.remove('is-running');
      badge.classList.add('has-result');
      badge.style.display = 'flex';
      badge.style.pointerEvents = 'auto';
    }

    // Add iteration count if cycling
    if (data.iterationCount && data.iterationCount > 1) {
      badge.setAttribute('data-iterations', data.iterationCount);
    } else {
      badge.removeAttribute('data-iterations');
    }
  }

  // Clear all execution states
  clearExecutionStates() {
    // Clear state data
    this.executionState = {};

    // Remove visual states from all nodes
    document.querySelectorAll('.node').forEach(nodeEl => {
      nodeEl.classList.remove('executing', 'execution-success', 'execution-error');
      const nodeId = parseInt(nodeEl.id.replace('node-', ''), 10);
      this.updateStatusBadge(nodeId, 'idle', {});
    });
  }


  // Stop current execution
  stopExecution() {
    if (!this.isExecuting) {
      alert('No execution in progress.');
      return;
    }

    this.isExecuting = false;
    this.currentPipeline = null;

    // Clear running states
    Object.keys(this.executionState).forEach(nodeId => {
      if (this.executionState[nodeId].status === 'running') {
        this.setNodeExecutionState(nodeId, 'error', {
          error: 'Execution stopped by user'
        });
      }
    });

    alert('Execution stopped.');
  }
}
