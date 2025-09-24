# QUIRK - Visual Knowledge Management

A fast, intuitive visual knowledge base that lets you create, connect, and organize markdown notes with smooth drag-and-drop interactions.


**Live Demo**: [Try QUIRK online](https://quirk.uk)

## Features

🔒 **Privacy First** - Your data never leaves your device  
🏠 **Local Storage** - Works completely offline, no account required  
✨ **Visual Node Interface** - Drag and drop markdown cards  
🔗 **Smart Connections** - Draw relationships between ideas  
📝 **Full Markdown** - Rich text with syntax highlighting  
🖼️ **Images & Code** - Support for images via URL and code blocks  
🎨 **16 Beautiful Themes** - Customize individual nodes or global workspace  
📤 **Own Your Data** - Export as standard markdown files  
⚡ **Zero Setup** - Just open index.html in any browser  
🚀 **Scales Smoothly** - Handles hundreds of nodes without performance loss

## Quick Start

1. **Try Online**: Visit [quirk.uk](https://quirk.uk) for instant access
2. **Or Download**: Clone this repo or download as ZIP and open `index.html`
3. **Create**: Click "Markdown" to add your first note
4. **Connect**: Drag from any note content to another to create connections
5. **Customize**: Use the theme selector to personalize your workspace

## Keyboard Shortcuts

- `Drag` from card content → Create connections
- `Alt + Drag` → Cut connections  
- `Mouse Wheel` → Zoom in/out
- `Drag Canvas` → Pan around
- `Delete` → Remove selected node
- `Escape` → Cancel connection/cutting mode
- `Double-click` node content → Edit mode
- `Double-click` node type → Rename node type

## Privacy & Data

QUIRK is designed with privacy as the foundation:

- **No data collection** - Zero telemetry, analytics, or tracking
- **Local storage only** - Your notes are stored in your browser's localStorage
- **Works offline** - No internet connection required after initial load
- **No accounts** - No sign-up, no passwords, no user profiles
- **Standard exports** - Your data exports as regular markdown files
- **Self-hostable** - Run entirely from your own server or filesystem

Even when using quirk.uk, your data never leaves your browser. The server only delivers the application files.

## Architecture

QUIRK is built with vanilla JavaScript and a clean, modular architecture:

- **app.js** - Main wallboard class and node management
- **connection-manager.js** - Visual connection system with smooth bezier curves
- **export-manager.js** - Import/export functionality with ZIP support
- **app.css** - Responsive styling with CSS custom properties and hardware acceleration

No frameworks, no build process, no dependencies beyond standard web APIs.

## Browser Compatibility

- Chrome 80+
- Firefox 75+ 
- Safari 13+
- Edge 80+

## Development

No build process needed! Just edit the files and refresh your browser.

For development, consider running a local server:
```bash
python -m http.server 8000
# or
npx serve
```

## Multiple Boards

Create separate boards for different projects:
- Switch between boards via the dropdown
- Each board maintains its own nodes and connections
- Import/export individual boards or everything at once
- Rename and delete boards as needed

## Export & Import

Your data belongs to you:
- Export current board as ZIP with markdown files
- Export all boards as complete backup
- Import previously exported boards
- Connection relationships preserved in JSON metadata
- Standard markdown format ensures future compatibility

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas where help is especially appreciated:
- Mobile/touch improvements
- Accessibility enhancements
- Additional export formats
- Keyboard navigation
- Performance optimizations

## License

MIT License - see [LICENSE](LICENSE) for details.

## Why QUIRK?

In a world where every app wants to harvest your data, QUIRK takes a different approach:

- Your thoughts remain private
- No subscriptions or vendor lock-in
- Works forever, even if quirk.uk goes offline
- Built by developers, for people who value digital sovereignty

QUIRK proves you can have a modern, polished app experience without sacrificing privacy or control over your data.