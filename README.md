# QUIRK — local-first visual knowledge boards with AI

Drag markdown cards, connect ideas, run JavaScript, and ask an LLM to help. Everything lives on your machine; AI calls go only to the provider you choose. No plugin chaos.

<img width="1469" height="849" alt="QUIRK board" src="https://github.com/user-attachments/assets/14869423-f34f-4c84-8394-2503bd084ae2" />

**Try it now:** [quirk.uk](https://quirk.uk?board=https://raw.githubusercontent.com/al4669/quirk/refs/heads/main/examples/godot.json)

---

## Why use QUIRK?
- Local-first: works offline, data stays in your browser (IndexedDB)
- Focused: AI chat + runnable nodes are built-in, no plugin wrangling
- Reliable: minimal stack (static HTML + tiny Go proxy), no cloud dependencies
- Portable: export boards as JSON or markdown ZIPs, share via raw GitHub URLs
- Friendly to power users: JavaScript execution, data flow between nodes, Claude/GPT/Ollama support

---

## Use it for…
- Notes that need structure: break big ideas into linked cards and see the map.
- Project/workflow boards: tasks, dependencies, owners, and checkpoints as a graph.
- Client packs: deliver SOPs, policies, specs, and timelines as a single linked board you can export to markdown.
- Research and writing: outlines → drafts → revisions with AI filling and connecting steps.
- Light automation: run small JS snippets between nodes to transform data or call your LLM.

---

## Quick start

### 1) Fastest: online
1. Open [quirk.uk](https://quirk.uk)
2. Click **Markdown** to drop your first card
3. Press **K** for AI chat

### 2) Local with AI (recommended)
1. Start the local proxy (needed for Claude/OpenAI):
   ```bash
   go run server.go
   ```
2. Visit `http://localhost:8080`
3. Press **K** → ⚙️ Settings → pick your provider (Ollama, Claude, or OpenAI)

---

## AI setup (pick one)
- **Ollama (local, free)**  
  Install from https://ollama.com, then run:
  ```bash
  ollama pull llama3.2
  ollama serve
  ```
  Settings: Provider `Ollama`, Endpoint `http://localhost:11434/api/chat`, Model `llama3.2`

- **Claude (cloud)**  
  Get an API key from https://console.anthropic.com.  
  Run `go run server.go`, then use Provider `Claude`, Endpoint `http://localhost:8080/api/anthropic`, Model `claude-sonnet-4-5-20250929`

- **OpenAI (cloud)**  
  Get an API key from https://platform.openai.com.  
  Run `go run server.go`, then use Provider `OpenAI`, Endpoint `http://localhost:8080/api/openai`, Model `gpt-4` or `gpt-3.5-turbo`

Keys are stored locally in IndexedDB; nothing is sent anywhere else.

---

## Basic moves
- Pan/zoom: drag canvas / mouse wheel
- Edit a card: double-click
- Connect cards: drag from content to another card; Alt+drag cuts a link
- Run code in a card: right-click → **Run from here ▶️**
- Open AI chat: **K**

---

## HTML preview node
- Insert the **HTML Preview** template, paste HTML (or wrap it in ```html fences).
- Renders inline in a sandboxed iframe (scripts stripped; inline styles allowed).
- Buttons let you open the preview fullscreen or in a new tab; header maximize works too.

---

## Build something in 2 minutes
1. Add a markdown card with a list of ideas.
2. Press **K** and ask: “Make nodes for each idea and connect related ones.”
3. Add a code card to process data:
   ```markdown
   ```js
   const items = quirk.inputs()[0];
   const summary = await quirk.llm(`Summarize: ${items.join(", ")}`);
   quirk.output(summary);
   ```
   ```
4. Right-click the code card → **Run from here ▶️**

---

## Execution API (essentials)
- `const [data, meta] = quirk.inputs();` — pull upstream outputs (array by link order).
- `quirk.output(value);` — publish this node’s result for downstream nodes.
- `await quirk.llm(prompt, { system, maxTokens });` — call your configured model.
- `quirk.nodes()` / `quirk.getNode(id)` — inspect the current graph if you need topology.

Common patterns:
```js
// Pass-through with metadata
const [items] = quirk.inputs();
quirk.output({ items, count: items.length });

// AI helper
const outline = await quirk.llm('Create a 5-step outline for onboarding.');
quirk.output(outline);

// Transformation chain
const [rows] = quirk.inputs();
const cleaned = rows.filter(r => r.active);
quirk.output(cleaned);
```
Cycle-safe execution with live status indicators; default max iterations: 10.

---

## Export and share
- **Export board as JSON** for GitHub sharing  
  Link format: `quirk.uk?board=https://raw.githubusercontent.com/<user>/<repo>/<branch>/path.json`
- **Export as ZIP** to get per-node markdown files
- **Export all boards** for a full backup

---

## Troubleshooting (fast fixes)
- “API key required” → add key in ⚙️ Settings and match the provider
- “Failed to fetch” → for Claude/OpenAI run `go run server.go`; for Ollama run `ollama serve`
- CORS errors → use the local proxy endpoints above
- “No executable code blocks found” → use ```js fenced blocks

---

## Development
Static app; no build step.
```bash
python -m http.server 8000   # or: npx serve
```
Key files: `app.js` (core), `ai-chat.js`, `execution-manager.js`, `connection-manager.js`, `server.go` (proxy).

---

## License
MIT. Your data stays yours.
