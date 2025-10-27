# Character System

An extensible character system for creating animated UI avatars.

## Overview

The character system is built on a base class that can be extended to create custom animated characters for use in UI elements like chat interfaces, status indicators, and more.

## Architecture

### Base Class: `Character`

All characters extend from the `Character` base class (`character-base.js`), which provides:
- Container management
- State management
- Animation lifecycle
- Cleanup methods

### Example Character: `BuddyCharacter`

Buddy is a gentle cloud companion that demonstrates the full capabilities of the character system:
- Multiple states (idle, thinking, talking)
- Smooth animations
- Expression variations
- Talking animation with eye blinking and mouth movement

## Creating Your Own Character

### 1. Extend the Base Class

```javascript
class MyCharacter extends Character {
  constructor(containerId, config = {}) {
    super(containerId, {
      width: 80,
      height: 80,
      // Your custom config
      ...config
    });

    // Define your character's states
    this.states = {
      idle: {
        // State configuration
      },
      active: {
        // State configuration
      }
    };
  }

  render() {
    // Render your character's SVG
    this.container.innerHTML = `
      <svg id="${this.containerId}-svg" viewBox="0 0 400 400"
           width="${this.config.width}" height="${this.config.height}">
        <!-- Your SVG elements -->
      </svg>
    `;

    this.svg = document.getElementById(`${this.containerId}-svg`);
    this.setState('idle');
  }

  applyState(stateConfig) {
    // Apply the state configuration to your character
    // This is where you animate your character based on the state
  }
}
```

### 2. Use Your Character

```javascript
// In your application code
const myChar = new MyCharacter('characterContainer', {
  width: 60,
  height: 60
});

// Change states
myChar.setState('active');
myChar.setState('idle');

// Clean up when done
myChar.destroy();
```

## State System

States define different visual configurations for your character. Each state should contain the data needed to render that particular appearance/animation.

Example state definition:
```javascript
this.states = {
  idle: {
    eyeType: 'open',
    mouthShape: 'smile',
    color: '#blue'
  },
  excited: {
    eyeType: 'wide',
    mouthShape: 'bigSmile',
    color: '#yellow'
  }
};
```

## Animation Integration

The system supports anime.js for smooth animations. Key patterns:

### Fade Transitions
```javascript
anime({
  targets: element,
  opacity: [1, 0.3, 1],
  duration: 200,
  easing: 'easeInOutQuad',
  begin: () => {
    // Change SVG path while faded
    element.setAttribute('d', newPath);
  }
});
```

### Looping Animations
```javascript
this.animation = anime({
  targets: this.svg,
  translateY: [-2, 2],
  duration: 1000,
  direction: 'alternate',
  loop: true,
  easing: 'easeInOutSine'
});
```

## Integration Example: AI Chat

See `ai-chat.js` for a complete integration example:

```javascript
// Initialize character
this.buddy = new BuddyCharacter('buddyCharacter', {
  width: 60,
  height: 60,
  showShadow: false
});

// Update based on application state
this.buddy.setState('thinking');  // When AI is thinking
this.buddy.setState('talking');   // When AI is responding
this.buddy.setState('idle');      // When idle
```

## Best Practices

1. **Use CSS Custom Properties**: Respect the parent theme by using `currentColor` and CSS variables
2. **Clean Animations**: Always clean up animations in the `destroy()` method
3. **Smooth Transitions**: Use fade-in/fade-out when changing SVG paths to avoid visual glitches
4. **Responsive Sizing**: Use viewBox for scalability and accept width/height in config
5. **State Validation**: Check if state exists before applying
6. **Timer Management**: Clear all timers and intervals in cleanup

## File Structure

```
characters/
├── character-base.js       # Base class
├── buddy-character.js      # Example: Buddy the cloud
├── your-character.js       # Your custom character
└── README.md              # This file
```

## Contributing

To add a new character to the system:

1. Create a new file: `your-character.js`
2. Extend the `Character` class
3. Implement `render()` and `applyState()`
4. Define your character's states
5. Document any special configuration options

## Examples of Character Ideas

- **Robot Assistant**: Mechanical movements, LED indicators
- **Pet Companion**: Animal with various moods
- **Weather Icon**: Sun/cloud that changes with conditions
- **Loading Spinner**: Abstract shapes with smooth animations
- **Emoji Face**: Simple expression changes
- **Plant Character**: Growing/wilting based on activity

## License

Part of the QUIRK project.
