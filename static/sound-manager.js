// Sound manager for playing audio with variations using Howler.js
class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
  }

  /**
   * Load a sound file
   * @param {string} name - Name to identify the sound
   * @param {string} path - Path to the sound file
   */
  loadSound(name, path) {
    this.sounds[name] = new Howl({
      src: [path],
      volume: 0.5,
      preload: true
    });
  }

  /**
   * Play a sound with optional variations
   * @param {string} name - Name of the sound to play
   * @param {object} options - Playback options
   * @param {number} options.rate - Playback rate (0.5 to 2.0, default: 1.0)
   * @param {number} options.volume - Volume (0.0 to 1.0, default: 0.5)
   */
  play(name, options = {}) {
    if (!this.enabled || !this.sounds[name]) return;

    const sound = this.sounds[name];

    // Set playback rate for variation
    const rate = options.rate || 1.0;
    sound.rate(rate);

    // Set volume
    const volume = options.volume !== undefined ? options.volume : 0.5;
    sound.volume(volume);

    // Play the sound
    sound.play();
  }

  /**
   * Play snap sound with random variation
   */
  playSnap() {
    // Random rate variation between 0.85 and 1.15 for subtle pitch variation
    const rate = 0.85 + Math.random() * 0.3;

    // Random volume variation between 0.4 and 0.6
    const volume = 0.4 + Math.random() * 0.2;

    this.play('snap', { rate, volume });
  }

  /**
   * Enable/disable all sounds
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }
}

// Create global sound manager instance
const soundManager = new SoundManager();

// Load sounds
soundManager.loadSound('snap', 'static/sounds/snap.wav');
