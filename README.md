# QUIRK - Visual Knowledge Management with AI

A fast, intuitive visual knowledge base that lets you create, connect, and organize markdown notes with smooth drag-and-drop interactions. Now with **AI Chat** and **JavaScript Execution** powered by Claude, GPT, or local LLMs.

<img width="1469" height="849" alt="image" src="https://github.com/user-attachments/assets/14869423-f34f-4c84-8394-2503bd084ae2" />

**Live Demo**: [Try QUIRK online](https://quirk.uk?board=https://raw.githubusercontent.com/al4669/quirk/refs/heads/main/examples/godot.json)

---

## Features

### Core Features
- 🔒 **Privacy First** - Your data never leaves your device
- 🏠 **Local Storage** - Works completely offline, no account required
- ✨ **Visual Node Interface** - Drag and drop markdown cards
- 🔗 **Smart Connections** - Draw relationships between ideas
- 📝 **Full Markdown** - Rich text with syntax highlighting
- 🖼️ **Images & Code** - Support for images via URL and code blocks
- 🎨 **16 Beautiful Themes** - Customize individual nodes or global workspace
- 🌐 **GitHub Sharing** - Load and share board templates
- 📤 **Own Your Data** - Export as standard markdown files
- ⚡ **Zero Setup** - Just open index.html in any browser

### AI Features
- 🤖 **AI Chat Assistant** - Create and organize nodes with natural language
- 🧠 **Multi-Provider Support** - Claude, GPT, Ollama, or any OpenAI-compatible API
- 💬 **Streaming Responses** - Real-time AI interaction
- 🎭 **Animated Characters** - Buddy (cloud) or Read (robot with voice)
- 🔐 **Secure API Keys** - Stored locally in IndexedDB

### Execution System
- ⚙️ **JavaScript Execution** - Run code blocks in nodes
- 🔄 **Data Pipelines** - Connect nodes to create workflows
- 🌊 **Data Flow API** - Pass data between nodes with `quirk.inputs()`
- 🤖 **LLM Integration** - Call Claude/GPT from code via `quirk.llm()`
- 🔁 **Cycle Detection** - Handle graph cycles intelligently
- ✅ **Visual Feedback** - See execution status in real-time

---

## Quick Start

### Option 1: Online (Instant)
1. Visit [quirk.uk](https://quirk.uk)
2. Click "Markdown" to add your first note
3. Press **K** to open AI Chat

### Option 2: Run Locally with AI (Recommended)

#### Step 1: Start the Server
```bash
go run server.go
```

#### Step 2: Open Browser
```
http://localhost:8080
```

#### Step 3: Configure AI
- Press **K** to open AI Chat
- Click Settings (⚙️)
- Choose provider:
  - **Ollama** (local, free)
  - **Claude** (cloud, requires API key)
  - **OpenAI** (cloud, requires API key)

---

## AI Setup Guide

### Using Ollama (Local, Free)

**1. Install Ollama:**
```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Or visit https://ollama.com
```

**2. Run a model:**
```bash
ollama pull llama3.2
ollama serve
```

**3. Configure in QUIRK:**
- Press **K** → Settings
- Provider: Ollama (Local)
- Endpoint: `http://localhost:11434/api/chat`
- Model: `llama3.2`

### Using Claude (Cloud)

**1. Get API Key:**
- Visit https://console.anthropic.com
- Create account and get API key

**2. Configure in QUIRK:**
- Press **K** → Settings
- Provider: Claude (Anthropic)
- Enter your API key
- Endpoint: `http://localhost:8080/api/anthropic` (uses local proxy)
- Model: `claude-sonnet-4-5-20250929`

**3. Start the proxy server:**
```bash
go run server.go
```

The Go proxy bypasses CORS restrictions - it's completely local and secure.

### Using OpenAI (Cloud)

Same as Claude, but:
- Get API key from https://platform.openai.com/api-keys
- Provider: OpenAI
- Endpoint: `http://localhost:8080/api/openai`
- Model: `gpt-4` or `gpt-3.5-turbo`

---

## AI Chat Examples

Press **K** to open chat, then try:

**Create a project structure:**
> "Create a board for a web app with nodes for frontend, backend, database, and deployment. Connect them."

**Brainstorm:**
> "Generate 10 startup ideas in the AI space with descriptions"

**Organize:**
> "Arrange these nodes in a mind map with the main topic centered"

**Learn:**
> "Create a React learning path from beginner to advanced"

---

## Execution System Quick Start

### 1. Simple JavaScript Node

Create a markdown node:
```markdown
# Hello World

```js
const message = "Hello from QUIRK!";
quirk.output(message);
```
```

Right-click → **Run from here ▶️**

### 2. Data Pipeline

**Node 1: Generate Data**
```markdown
# Data Source

```js
const data = [1, 2, 3, 4, 5];
quirk.output(data);
```
```

**Node 2: Process Data** (connect from Node 1)
```markdown
# Double Values

```js
const inputs = quirk.inputs();
const doubled = inputs[0].map(x => x * 2);
quirk.output(doubled);
```
```

### 3. AI-Powered Node

```markdown
# AI Analyzer

```js
const inputs = quirk.inputs();
const data = inputs[0];

const prompt = `Analyze this data: ${JSON.stringify(data)}`;
const analysis = await quirk.llm(prompt);

quirk.output(analysis);
```
```

---

## Keyboard Shortcuts

### Canvas Navigation
- **Mouse Wheel** - Zoom in/out
- **Drag Canvas** - Pan around
- **Double-click** node - Edit mode

### Node Operations
- **Drag** from content - Create connection
- **Alt + Drag** - Cut connections
- **Delete** - Remove selected node
- **Escape** - Cancel action

### AI & Special
- **K** - Toggle AI Chat
- **Right-click** node → Run - Execute code

---

## Execution API Reference

### `quirk.inputs()`
Get outputs from connected upstream nodes.
```js
const [data1, data2] = quirk.inputs();
```

### `quirk.output(value)`
Set output for this node (available to downstream nodes).
```js
quirk.output({ result: 42, status: 'success' });
```

### `quirk.llm(prompt, config?)`
Call LLM API (Claude/GPT).
```js
const response = await quirk.llm('Explain quantum computing');
quirk.output(response);
```

### `quirk.nodes()`
Get all nodes in the board.
```js
const allNodes = quirk.nodes();
```

### `quirk.getNode(id)`
Get specific node by ID.
```js
const node = quirk.getNode(42);
```

---

## Example Workflows

### Data Processing Pipeline
```
[CSV Data] → [Parse] → [Filter] → [Transform] → [Visualize]
```

### AI Content Generation
```
[Topic] → [Generate Outline (AI)] → [Write Content (AI)] → [Format]
```

### Iterative Refinement
```
[Draft Text] → [Improve (AI)] → [Evaluate] → (loop back)
```
System detects cycles and allows up to 10 iterations.

---

## Privacy & Security

### Zero Data Collection
- No telemetry, analytics, or tracking
- No accounts or passwords
- No external servers (except your chosen LLM provider)

### Local-First Architecture
- All data stored in browser IndexedDB
- Works completely offline (except AI calls)
- API keys stored securely in IndexedDB
- Execution happens client-side

### What Gets Sent Where
- **To Ollama**: Prompts (stays on your machine)
- **To Claude/OpenAI**: Prompts + API key (direct to provider via local proxy)
- **To QUIRK servers**: Nothing (we don't have servers)

The Go proxy server runs on **your machine** and only forwards requests to AI providers. It never logs or stores your data.

---

## Export & Sharing

### Export Options
- **Export for GitHub** - Clean JSON for sharing
- **Export Board as ZIP** - Markdown files
- **Export All Boards** - Complete backup

### GitHub Sharing
1. Export board as JSON
2. Upload to GitHub repo
3. Share link: `quirk.uk?board=your-github-raw-url`
4. Others get their own local copy

Perfect for templates, tutorials, and knowledge bases!

---

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

---

## Development

No build process! Just edit and refresh.

```bash
# Run local server for development
python -m http.server 8000
# or
npx serve
```

**Architecture:**
- `app.js` - Main application logic
- `ai-chat.js` - AI chat system
- `execution-manager.js` - Code execution pipeline
- `connection-manager.js` - Visual connections
- `server.go` - Local proxy for Claude/OpenAI APIs

---

## Troubleshooting

### AI Chat Issues

**"API key required"**
- Add your API key in Settings (⚙️)
- Make sure provider matches (Claude/OpenAI/Ollama)

**"Failed to fetch"**
- For Claude/OpenAI: Run `go run server.go` first
- For Ollama: Run `ollama serve`

**"CORS error"**
- Use the Go proxy server (`go run server.go`)
- Endpoints should be `http://localhost:8080/api/anthropic` or `/api/openai`

### Execution Issues

**"No executable code blocks found"**
- Use ` ```js ` or ` ```javascript ` code blocks

**"Max iterations reached"**
- Cycle detected, increase limit in console:
  ```js
  wallboard.executionManager.maxIterations = 20;
  ```

**Browser asking to save password**
- This is normal (API key field is type="password")
- Tell browser to never save for localhost:8080

---

## Contributing

We welcome contributions! Key areas:
- Mobile/touch improvements
- Accessibility enhancements
- Additional export formats
- Performance optimizations

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT License - Your data, your code, your freedom.

---

## Why QUIRK?

In a world where every app wants to harvest your data:

- **Your thoughts remain private** - No cloud required
- **No subscriptions** - Free forever
- **No vendor lock-in** - Standard markdown exports
- **Built by developers** - For people who value digital sovereignty
- **AI without compromise** - Use local LLMs or choose your provider

QUIRK proves you can have a modern, polished app with AI features without sacrificing privacy or control.

---

**Get started: Press `K` for AI Chat • Right-click nodes to Run • Export anytime**
