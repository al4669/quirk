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

  // Check if a node has actual code to execute
  hasExecutableCode(node) {
    if (!node.data || !node.data.content) return false;
    const codeBlocks = this.extractCodeBlocks(node.data.content);
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

  // Extract JavaScript code blocks from markdown
  extractCodeBlocks(markdown) {
    const codeBlockRegex = /```(?:js|javascript)\n([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = codeBlockRegex.exec(markdown)) !== null) {
      blocks.push(match[1].trim());
    }

    return blocks;
  }

  // Extract instruct blocks from markdown
  extractInstructBlocks(markdown) {
    const instructBlockRegex = /```instruct\n([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = instructBlockRegex.exec(markdown)) !== null) {
      blocks.push(match[1].trim());
    }

    return blocks;
  }

  // Get remaining text content (excluding code and instruct blocks)
  getTextContent(markdown) {
    if (!markdown) return '';
    // Remove all code blocks
    let text = markdown.replace(/```(?:js|javascript)\n[\s\S]*?```/g, '');
    // Remove all instruct blocks
    text = text.replace(/```instruct\n[\s\S]*?```/g, '');
    return text.trim();
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
        // Reference to node content
        value = targetNode.data?.content || '';
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

    // Topological sort using Kahn's algorithm
    const sortedNodes = this.topologicalSort(nodes);

    // Execute nodes in order
    for (const node of sortedNodes) {
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

      // Execute node
      await this.executeSingleNode(node);

      // If error occurred, stop pipeline
      if (this.executionState[node.id]?.status === 'error') {
        throw new Error(`Node execution failed: ${node.title || node.id}`);
      }
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
      // Extract instruct blocks first
      const instructBlocks = this.extractInstructBlocks(node.data.content);

      if (instructBlocks.length > 0) {
        // Has instruct blocks - concatenate and send ONLY those to LLM
        console.log(`Node ${node.id} has ${instructBlocks.length} instruct block(s) - sending to LLM`);

        // Concatenate instruct blocks
        const instructPrompt = instructBlocks.join('\n\n');

        // Resolve template variables in instruct prompt
        let resolvedPrompt = this.resolveTemplateVariables(instructPrompt, node.id);

        // Strip markdown links from the prompt to prevent LLM from seeing/reproducing them
        resolvedPrompt = this.stripMarkdownLinks(resolvedPrompt);

        // Get upstream data to include in LLM context
        const inputs = this.getUpstreamNodeIds(node.id).map(id => {
          const state = this.executionState[id];
          return state?.result;
        }).filter(r => r !== undefined && r !== null);

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

        console.log(`Calling LLM with instruct blocks from node ${node.id}...`);

        // Get text content (markdown without blocks) and strip links
        let textContent = this.getTextContent(node.data.content);
        textContent = this.stripMarkdownLinks(textContent);

        // Create result node immediately for LLM output
        console.log(`Creating result node for LLM node ${node.id} (${node.title})...`);
        const resultNode = this.createResultNode(node, '_Generating response..._');
        console.log(`Result node created:`, resultNode ? resultNode.id : 'NULL');

        // Call LLM with streaming
        const llmOutput = await this.callLLMStreaming(prompt, (chunk) => {
          // Update result node as content streams in
          if (resultNode) {
            this.updateResultNodeContent(resultNode, chunk);
          }
        });

        // For instruct blocks, use ONLY the LLM output as the final result
        // Don't append original text content (which may contain links/connections)
        let finalOutput = llmOutput;

        // Update result node with final LLM output only
        if (resultNode) {
          this.updateResultNodeContent(resultNode, finalOutput);
        }

        // Store result for next node
        this.executionState[node.id] = this.executionState[node.id] || {};
        this.executionState[node.id].result = finalOutput;

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

      // No instruct blocks - check for code blocks
      const codeBlocks = this.extractCodeBlocks(node.data.content);

      if (codeBlocks.length === 0) {
        // No code blocks and no instruct blocks - treat as pass-through
        console.log(`Node ${node.id} has no code or instruct blocks - treating as pass-through`);

        // Get input from upstream nodes
        const inputs = this.getUpstreamNodeIds(node.id).map(id => {
          const state = this.executionState[id];
          return state?.result;
        }).filter(r => r !== undefined && r !== null);

        // Pass input content forward (first input if available)
        const passThroughContent = inputs.length > 0 ? inputs[0] : null;

        this.executionState[node.id] = this.executionState[node.id] || {};
        this.executionState[node.id].result = passThroughContent;

        const executionTime = Date.now() - startTime;
        this.setNodeExecutionState(node.id, 'success', {
          result: passThroughContent,
          lastRun: Date.now(),
          executionTime
        });
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
          (async function() {
            ${resolvedCode}
          })()
        `;

        // Execute code with context
        const func = new Function('quirk', asyncCode);
        lastResult = await func(context);
      }

      // Only set output if explicitly called via quirk.output()
      // Don't auto-capture console.log or last expression result
      // Get final result ONLY if output was explicitly set
      const result = context.__outputSet ? this.executionState[node.id]?.result : undefined;

      // Set success state
      const executionTime = Date.now() - startTime;
      this.setNodeExecutionState(node.id, 'success', {
        result,
        lastRun: Date.now(),
        executionTime
      });

      console.log(`✅ Node ${node.id} executed successfully in ${executionTime}ms`);

      // Create/update result node for code execution with quirk.output()
      if (result !== undefined && result !== null) {
        // Always create or reuse result node for debugging
        const resultNode = this.createResultNode(node);
        if (resultNode) {
          // Format result content
          let resultContent = '';
          if (typeof result === 'object') {
            resultContent = '```json\n' + JSON.stringify(result, null, 2) + '\n```';
          } else if (typeof result === 'string') {
            resultContent = result;
          } else {
            resultContent = String(result);
          }
          this.updateResultNodeContent(resultNode, resultContent);
        }
      }

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
    }
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

      return existingResultNode;
    }

    console.log(`[createResultNode] No existing result node found - creating new one for node ${sourceNode.id}...`);

    // Calculate position (offset from source node)
    const offsetX = 300;
    const offsetY = 0;
    const position = {
      x: sourceNode.position.x + offsetX,
      y: sourceNode.position.y + offsetY
    };

    // Create node using wallboard's method
    const resultNode = this.wallboard.nodeOperationsManager.createNode(
      'markdown',
      { content: initialContent },
      position
    );

    // Set the title to "Result"
    resultNode.title = expectedResultTitle;

    // Render the node visually on the canvas
    this.wallboard.renderNode(resultNode);

    // Update the DOM to show the new title
    const nodeTypeEl = document.getElementById(`type-${resultNode.id}`);
    if (nodeTypeEl) {
      nodeTypeEl.textContent = expectedResultTitle.toUpperCase();
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

    // Update the data
    resultNode.data.content = content;
    resultNode.data.html = typeof MarkdownRenderer !== 'undefined'
      ? MarkdownRenderer.render(content)
      : marked.parse(content);

    // Update the DOM - render properly like wallboard does
    const contentEl = document.getElementById(`content-${resultNode.id}`);
    if (contentEl) {
      // Use the wallboard's renderNodeContent to get properly wrapped HTML
      if (this.wallboard && this.wallboard.renderNodeContent) {
        const renderedContent = this.wallboard.renderNodeContent(resultNode);
        contentEl.innerHTML = typeof Sanitization !== 'undefined'
          ? Sanitization.sanitize(renderedContent)
          : renderedContent;
      } else {
        // Fallback: wrap in markdown-content div manually
        contentEl.innerHTML = `<div class="markdown-content">${resultNode.data.html}</div>`;
      }

      // Re-enable checkboxes
      if (this.wallboard.nodeContentManager) {
        this.wallboard.nodeContentManager.enableCheckboxes(contentEl, resultNode);
      } else if (this.wallboard.enableCheckboxes) {
        this.wallboard.enableCheckboxes(contentEl, resultNode);
      }

      // Process links
      if (this.wallboard.linkManager) {
        this.wallboard.linkManager.processNodeLinks(resultNode.id, content, false);
      }

      // Apply syntax highlighting to code blocks
      if (typeof Prism !== 'undefined') {
        const codeBlocks = contentEl.querySelectorAll('pre code');
        codeBlocks.forEach(block => {
          Prism.highlightElement(block);
        });
      }
    }

    // Auto-save periodically (but not on every chunk to avoid performance issues)
    if (!this._saveTimeout) {
      this._saveTimeout = setTimeout(() => {
        this.wallboard.autoSave();
        this._saveTimeout = null;
      }, 1000);
    }
  }

  // Create execution context (quirk API)
  createExecutionContext(node) {
    const self = this;
    const context = {
      __outputSet: false,
      __consoleOutput: [], // Capture console.log output

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
        context.__outputSet = true;
        self.executionState[node.id] = self.executionState[node.id] || {};
        self.executionState[node.id].result = value;

        // Immediately create/update the Result node
        const resultNode = self.createResultNode(node);
        if (resultNode) {
          // Format result content
          let resultContent = '';
          if (typeof value === 'object') {
            resultContent = '```json\n' + JSON.stringify(value, null, 2) + '\n```';
          } else if (typeof value === 'string') {
            resultContent = value;
          } else {
            resultContent = String(value);
          }
          self.updateResultNodeContent(resultNode, resultContent);
        }
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
      }
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
                onChunk(filtered);
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
                    onChunk(filtered);
                  }
                } else {
                  // OpenAI format
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullResponse += delta;
                    // Filter out <think></think> tags before displaying
                    const filtered = fullResponse.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                    onChunk(filtered);
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

      // Auto-remove success state after 3 seconds
      setTimeout(() => {
        nodeElement.classList.remove('execution-success');
      }, 3000);
    } else if (status === 'error') {
      nodeElement.classList.add('execution-error');
    }

    // Update or create status badge
    this.updateStatusBadge(nodeId, status, data);
  }

  // Update execution status badge on node
  updateStatusBadge(nodeId, status, data) {
    const nodeElement = document.getElementById(`node-${nodeId}`);
    if (!nodeElement) return;

    // Find or create badge container
    let badge = nodeElement.querySelector('.execution-status-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'execution-status-badge';
      nodeElement.appendChild(badge);
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
      badge.style.display = 'flex';
    } else if (status === 'success') {
      const time = data.executionTime ? `${data.executionTime}ms` : '';
      badge.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" fill="rgba(16, 185, 129, 0.1)"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
      `;
      badge.title = `Success ${time}`;
      badge.style.display = 'flex';

      // Auto-hide after 3 seconds
      setTimeout(() => {
        badge.style.display = 'none';
      }, 3000);
    } else if (status === 'error') {
      badge.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" fill="rgba(239, 68, 68, 0.1)"/>
          <path d="M15 9l-6 6M9 9l6 6"/>
        </svg>
      `;
      badge.title = `Error: ${data.error || 'Unknown error'}`;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
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
      const badge = nodeEl.querySelector('.execution-status-badge');
      if (badge) {
        badge.style.display = 'none';
      }
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
