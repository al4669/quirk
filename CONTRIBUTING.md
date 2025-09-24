# Contributing to QUIRK

Thanks for your interest in improving QUIRK! This guide will help you get started with contributing to this privacy-first visual knowledge management tool.

## Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/[your-username]/quirk.git
   cd quirk
   ```

2. **Open in browser**
   ```bash
   # Option 1: Simple file open
   open index.html
   
   # Option 2: Local server (recommended)
   python -m http.server 8000
   # or
   npx serve
   ```

3. **Make your changes**
   - No build step required - just edit and refresh!
   - Test across different browsers
   - Verify both online and offline functionality

## Code Philosophy

QUIRK follows these principles:

- **Privacy First**: Never add features that compromise user data privacy
- **Local First**: Functionality should work without internet connection
- **Minimal Dependencies**: Keep external libraries lean and to the absolute minimum
- **Performance**: Maintain smooth 60fps interactions even with large boards
- **Simplicity**: Keep the interface intuitive and uncluttered

## Code Style

### JavaScript
- Use vanilla JavaScript (ES6+) - no frameworks
- Prefer `const` and `let` over `var`
- Use descriptive variable names
- Add comments for complex logic
- Use classes for major components (`Wallboard`, `ConnectionManager`, etc.)

### CSS
- Use CSS custom properties (variables) for theming
- Follow existing naming conventions (`--accent`, `--bg-secondary`, etc.)
- Prefer flexbox/grid over floats
- Use `transform3d()` for hardware acceleration
- Keep styles organized by component

### HTML
- Keep the single-file structure for simplicity
- Use semantic HTML elements
- Maintain accessibility attributes

## Architecture Overview

```
app.js              # Main application logic and node management
connection-manager.js # Visual connection system with bezier curves  
export-manager.js   # Import/export with ZIP and markdown support
app.css            # All styling with CSS custom properties
index.html         # Single-page application entry point
```

Key classes:
- `Wallboard` - Main application state and UI management
- `ConnectionManager` - Handles visual connections between nodes
- `ExportManager` - Manages data import/export functionality

## Testing Guidelines

Since QUIRK has no automated tests, manual testing is critical:

### Browser Testing
- Test in Chrome, Firefox, Safari, and Edge
- Verify both desktop and mobile layouts
- Test with different zoom levels

### Feature Testing
- Create/edit/delete nodes and connections
- Test drag and drop interactions  
- Verify keyboard shortcuts work
- Test export/import functionality
- Confirm themes apply correctly
- Test with large numbers of nodes (100+)

### Privacy Testing
- Verify no network requests after initial load
- Confirm localStorage is used correctly
- Test offline functionality

## Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Keep commits focused and atomic
   - Write clear commit messages
   - Test your changes thoroughly

3. **Submit pull request**
   - Describe what your change does and why
   - Include screenshots for UI changes
   - Reference any related issues

4. **Code review**
   - Respond to feedback constructively
   - Make requested changes in additional commits
   - Squash commits if requested

## Areas We Need Help

### High Priority
- **Mobile/Touch Support**: Better touch interactions for mobile devices
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- **Performance**: Optimize rendering for boards with 500+ nodes

### Medium Priority  
- **Additional Export Formats**: PDF export, OPML, other formats
- **Keyboard Navigation**: Full keyboard-only operation
- **Better Mobile UX**: Responsive design improvements

### Nice to Have
- **Plugin System**: Architecture for extending functionality
- **Advanced Search**: Full-text search across all nodes
- **Additional Node Types**: Video embeds, drawing canvas, etc.

## Reporting Issues

Use the issue templates when reporting bugs or requesting features. Include:

- **Browser version** and operating system
- **Steps to reproduce** the problem
- **Expected vs actual behavior**
- **Screenshots or screen recordings** if relevant
- **Console errors** if any

For privacy-related issues, please be extra thorough in your testing and reporting.

## Documentation

When adding features:
- Update the README.md if needed
- Add keyboard shortcuts to the shortcuts section
- Document any new export formats or features
- Consider adding examples to the `/examples` folder

## License

By contributing, you agree that your contributions will be licensed under the same MIT License that covers the project.