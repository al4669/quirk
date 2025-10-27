// Buddy - The Gentle Cloud Companion
class BuddyCharacter extends Character {
  constructor(containerId, config = {}) {
    super(containerId, {
      width: 80,
      height: 80,
      showShadow: false,
      ...config
    });

    this.talkingAnimation = null;
    this.isTalking = false;
    this.eyeAnimationTimer = null;
    this.mouthAnimationTimer = null;
    this.talkingSoundInterval = null;
    this.currentTalkingAudio = null; // Track current playing audio

    // Define Buddy's states
    this.states = {
      idle: {
        leftEye: 'M 172 195 Q 179 201 186 195',
        rightEye: 'M 214 195 Q 221 201 228 195',
        mouth: 'M 182 230 Q 200 238 218 230',
        cheekOpacity: 0.6
      },
      thinking: {
        leftEye: 'M 170 193 Q 177 190 184 193',  // Squinted, looking up-right
        rightEye: 'M 216 190 Q 223 187 230 190', // Squinted, looking up-right
        mouth: 'M 190 232 L 210 232',  // Straight line (neutral/pondering)
        cheekOpacity: 0.4,
        animation: 'thinking' // Special flag for thinking animation
      },
      talking: {
        mouthFrames: [
          'M 185 230 Q 200 232 215 230',  // Closed
          'M 185 230 Q 200 237 215 230 Q 200 233 185 230',  // Small oval
          'M 185 230 Q 200 232 215 230',  // Closed
          'M 185 232 Q 200 240 215 232 Q 200 235 185 232',  // Medium oval
          'M 185 230 Q 200 232 215 230',  // Closed
          'M 185 233 Q 200 243 215 233 Q 200 237 185 233',  // Larger oval
        ],
        eyeExpressions: [
          { // Friendly and attentive
            left: 'M 172 190 Q 179 185 186 190',
            right: 'M 214 190 Q 221 185 228 190',
            duration: 2500
          },
          { // Slightly squinted/happy
            left: 'M 172 190 Q 179 185 186 190',
            right: 'M 214 190 Q 221 185 228 190',
            duration: 2000
          },
          { // Content/relaxed
            left: 'M 172 195 Q 179 199 186 195',
            right: 'M 214 195 Q 221 199 228 195',
            duration: 3000
          },
          { // Blink
            left: 'M 172 195 L 186 195',
            right: 'M 214 195 L 228 195',
            duration: 150
          }
        ],
        cheekOpacity: 0.7
      }
    };
  }

  render() {
    this.container.style.position = 'relative';
    this.container.innerHTML = `
      <svg id="${this.containerId}-svg" viewBox="110 135 210 150" width="${this.config.width}" height="${this.config.height}"
           xmlns="http://www.w3.org/2000/svg" style="display: block; position: relative; z-index: 1;">
        <!-- Background (transparent) -->
        <rect x="110" y="135" width="210" height="150" fill="transparent"/>

        ${this.config.showShadow ? `
        <!-- Shadow -->
        <ellipse cx="200" cy="330" rx="70" ry="10" fill="#d0d5db" opacity="0.3"/>
        ` : ''}

        <!-- Gradients -->
        <defs>
          <radialGradient id="cloudGradient-${this.containerId}" cx="50%" cy="40%">
            <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
            <stop offset="60%" style="stop-color:#f8fafc;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#f1f5f9;stop-opacity:1" />
          </radialGradient>

          <!-- Soft shadow gradient -->
          <radialGradient id="cloudShadow-${this.containerId}" cx="50%" cy="70%">
            <stop offset="0%" style="stop-color:#e2e8f0;stop-opacity:0.4" />
            <stop offset="100%" style="stop-color:#cbd5e1;stop-opacity:0" />
          </radialGradient>
        </defs>

        <!-- Main cloud body - rounder, softer, more cloud-like -->
        <path d="M 200 270
                 C 170 270, 140 255, 130 230
                 C 125 215, 128 200, 138 185
                 C 142 165, 160 150, 180 148
                 C 188 135, 205 128, 222 135
                 C 240 130, 258 135, 268 148
                 C 285 152, 298 165, 302 182
                 C 308 195, 308 210, 305 225
                 C 300 245, 280 265, 255 270
                 C 238 272, 218 272, 200 270 Z"
              fill="url(#cloudGradient-${this.containerId})"
              stroke="#cbd5e1"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              opacity="1"/>

        <!-- Subtle inner shadow for depth -->
        <ellipse cx="215" cy="235" rx="45" ry="20"
                 fill="url(#cloudShadow-${this.containerId})"
                 opacity="0.3"/>

        <!-- Eyes - softer and more expressive -->
        <path id="${this.containerId}-leftEye" d="M 172 195 Q 179 201 186 195"
              stroke="#64748b"
              stroke-width="3"
              fill="none"
              stroke-linecap="round"/>
        <path id="${this.containerId}-rightEye" d="M 214 195 Q 221 201 228 195"
              stroke="#64748b"
              stroke-width="3"
              fill="none"
              stroke-linecap="round"/>

        <!-- Rosy cheeks - softer color -->
        <circle id="${this.containerId}-leftCheek" cx="155" cy="215" r="12" fill="#fecdd3" opacity="0.6"/>
        <circle id="${this.containerId}-rightCheek" cx="245" cy="215" r="12" fill="#fecdd3" opacity="0.6"/>

        <!-- Mouth - gentle smile -->
        <path id="${this.containerId}-mouth" d="M 182 230 Q 200 238 218 230"
              stroke="#94a3b8"
              stroke-width="2.5"
              fill="none"
              stroke-linecap="round"/>
      </svg>

      <!-- Thinking indicators overlay (rendered after main SVG so they appear on top) -->
      <svg viewBox="110 135 210 150" width="${this.config.width}" height="${this.config.height}"
           style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 100;"
           xmlns="http://www.w3.org/2000/svg">
        <g id="${this.containerId}-thinkingIndicators">
          <text class="thinking-mark" x="285" y="175" font-size="45" font-weight="bold"
                fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" opacity="0">?</text>
          <text class="thinking-mark" x="298" y="155" font-size="52" font-weight="bold"
                fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" opacity="0">?</text>
          <text class="thinking-mark" x="290" y="198" font-size="48" font-weight="bold"
                fill="#94a3b8" text-anchor="middle" dominant-baseline="middle" opacity="0">?</text>
        </g>
      </svg>
    `;

    this.svg = document.getElementById(`${this.containerId}-svg`);
    this.setState('idle');
  }

  applyState(stateConfig) {
    if (!this.svg) return;

    const leftEye = document.getElementById(`${this.containerId}-leftEye`);
    const rightEye = document.getElementById(`${this.containerId}-rightEye`);
    const mouth = document.getElementById(`${this.containerId}-mouth`);
    const leftCheek = document.getElementById(`${this.containerId}-leftCheek`);
    const rightCheek = document.getElementById(`${this.containerId}-rightCheek`);

    if (this.currentState === 'talking') {
      this.stopThinkingAnimation();
      this.stopIdleAnimation();
      this.startTalkingAnimation(stateConfig);
    } else if (this.currentState === 'thinking') {
      this.stopTalkingAnimation();
      this.stopIdleAnimation();
      this.startThinkingAnimation(stateConfig, leftEye, rightEye, mouth, leftCheek, rightCheek);
    } else if (this.currentState === 'idle') {
      this.stopTalkingAnimation();
      this.stopThinkingAnimation();
      this.startIdleAnimation(stateConfig, leftEye, rightEye, mouth, leftCheek, rightCheek);
    } else {
      this.stopTalkingAnimation();
      this.stopThinkingAnimation();
      this.stopIdleAnimation();

      // Fade transition
      if (typeof anime !== 'undefined') {
        anime.timeline()
          .add({
            targets: [leftEye, rightEye, mouth],
            opacity: [1, 0.3, 1],
            duration: 200,
            easing: 'easeInOutQuad',
            begin: () => {
              if (stateConfig.leftEye) leftEye.setAttribute('d', stateConfig.leftEye);
              if (stateConfig.rightEye) rightEye.setAttribute('d', stateConfig.rightEye);
              if (stateConfig.mouth) mouth.setAttribute('d', stateConfig.mouth);
            }
          });

        anime({
          targets: [leftCheek, rightCheek],
          opacity: stateConfig.cheekOpacity || 0.5,
          duration: 300,
          easing: 'easeInOutQuad'
        });
      } else {
        // Fallback without anime
        if (stateConfig.leftEye) leftEye.setAttribute('d', stateConfig.leftEye);
        if (stateConfig.rightEye) rightEye.setAttribute('d', stateConfig.rightEye);
        if (stateConfig.mouth) mouth.setAttribute('d', stateConfig.mouth);
        leftCheek.style.opacity = stateConfig.cheekOpacity || 0.5;
        rightCheek.style.opacity = stateConfig.cheekOpacity || 0.5;
      }
    }
  }

  startIdleAnimation(stateConfig, leftEye, rightEye, mouth, leftCheek, rightCheek) {
    this.stopIdleAnimation();

    if (typeof anime === 'undefined') return;

    // Set initial state
    leftEye.setAttribute('d', stateConfig.leftEye);
    rightEye.setAttribute('d', stateConfig.rightEye);
    mouth.setAttribute('d', stateConfig.mouth);

    // Gentle floating/breathing animation
    this.idleAnimation = anime({
      targets: this.svg,
      translateY: [-4, 4],
      scale: [0.98, 1.02],
      duration: 3000,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine'
    });

    // Occasional blinking
    const blink = () => {
      if (!this.idleAnimation) return;

      anime({
        targets: [leftEye, rightEye],
        opacity: [1, 0, 1],
        duration: 200,
        easing: 'easeInOutQuad'
      });

      // Random interval between blinks (2-5 seconds)
      this.idleBlinkTimer = setTimeout(blink, 2000 + Math.random() * 3000);
    };

    // Start blinking after a random delay
    this.idleBlinkTimer = setTimeout(blink, 1000 + Math.random() * 2000);

    // Subtle mouth movement (like gentle breathing)
    const mouthFrames = [
      'M 182 230 Q 200 238 218 230',
      'M 182 231 Q 200 237 218 231',
      'M 182 230 Q 200 236 218 230',
    ];

    let mouthIndex = 0;
    const animateMouth = () => {
      if (!this.idleAnimation) return;

      const frame = mouthFrames[mouthIndex];

      anime({
        targets: mouth,
        opacity: [1, 0.8, 1],
        duration: 800,
        easing: 'easeInOutQuad',
        begin: () => {
          mouth.setAttribute('d', frame);
        }
      });

      mouthIndex = (mouthIndex + 1) % mouthFrames.length;
      this.idleMouthTimer = setTimeout(animateMouth, 2000 + Math.random() * 1500);
    };

    animateMouth();
  }

  stopIdleAnimation() {
    if (this.idleAnimation) {
      this.idleAnimation.pause();
      this.idleAnimation = null;
    }

    if (this.idleBlinkTimer) {
      clearTimeout(this.idleBlinkTimer);
      this.idleBlinkTimer = null;
    }

    if (this.idleMouthTimer) {
      clearTimeout(this.idleMouthTimer);
      this.idleMouthTimer = null;
    }

    // Reset position
    if (typeof anime !== 'undefined' && this.svg) {
      anime({
        targets: this.svg,
        translateY: 0,
        scale: 1,
        duration: 400,
        easing: 'easeOutQuad'
      });
    }
  }

  playThinkingSound() {
    // Pick a random hmm sound (1-5)
    const soundNumber = Math.floor(Math.random() * 5) + 1;
    const soundPath = `./static/characters/sounds/buddy/hmm/${soundNumber}.mp3`;

    // Create and play audio with random pitch variation
    const audio = new Audio(soundPath);

    // Random pitch between 0.9 and 1.1 (subtle variation)
    const randomPitch = 0.9 + Math.random() * 0.2;
    audio.playbackRate = randomPitch;

    // Set volume (adjust as needed)
    audio.volume = 0.5;

    // Play the sound
    audio.play().catch(err => {
      console.log('Could not play thinking sound:', err);
    });
  }

  playTalkingSound() {
    // Only play if no sound is currently playing
    if (this.currentTalkingAudio && !this.currentTalkingAudio.paused) {
      return;
    }

    // Pick a random talking sound (1-8)
    const soundNumber = Math.floor(Math.random() * 8) + 1;
    const soundPath = `./static/characters/sounds/buddy/talking/${soundNumber}.mp3`;

    // Create new audio element
    const audio = new Audio(soundPath);

    // More varied pitch for talking (0.85 to 1.15 for more character)
    const randomPitch = 0.85 + Math.random() * 0.3;
    audio.playbackRate = randomPitch;

    // Slightly quieter than thinking sounds
    audio.volume = 0.4;

    // Store reference to current audio
    this.currentTalkingAudio = audio;

    // Play the sound
    audio.play().catch(err => {
      // Silently fail
    });
  }

  startTalkingSounds() {
    this.stopTalkingSounds();
    this.shouldPlaySounds = true; // New flag to control sounds independently

    // Play sounds at intervals (Undertale-style but better)
    // Wait for each sound to finish before playing next
    const playSound = () => {
      if (!this.shouldPlaySounds) return; // Use separate flag for sounds

      this.playTalkingSound();

      // Random interval between 100-180ms for natural speech rhythm
      const nextDelay = 100 + Math.random() * 80;
      this.talkingSoundInterval = setTimeout(playSound, nextDelay);
    };

    // Start after a tiny delay
    this.talkingSoundInterval = setTimeout(playSound, 50);
  }

  stopTalkingSounds() {
    this.shouldPlaySounds = false; // Stop playing new sounds

    if (this.talkingSoundInterval) {
      clearTimeout(this.talkingSoundInterval);
      this.talkingSoundInterval = null;
    }

    // Stop current talking audio
    if (this.currentTalkingAudio) {
      this.currentTalkingAudio.pause();
      this.currentTalkingAudio.currentTime = 0;
      this.currentTalkingAudio = null;
    }
  }

  startThinkingAnimation(stateConfig, leftEye, rightEye, mouth, leftCheek, rightCheek) {
    this.stopThinkingAnimation();

    if (typeof anime === 'undefined') return;

    // Play a random thinking sound with random pitch
    this.playThinkingSound();

    // Set initial state
    leftEye.setAttribute('d', stateConfig.leftEye);
    rightEye.setAttribute('d', stateConfig.rightEye);
    mouth.setAttribute('d', stateConfig.mouth);

    const thinkingIndicators = document.getElementById(`${this.containerId}-thinkingIndicators`);

    // Show thinking indicators with staggered animation
    if (thinkingIndicators) {
      const marks = thinkingIndicators.querySelectorAll('.thinking-mark');

      // Animate each question mark popping in
      marks.forEach((mark, index) => {
        // Reset and show immediately with simple fade
        setTimeout(() => {
          mark.setAttribute('opacity', '1');
          console.log('Showing mark', index);
        }, index * 200);
      });

      // Continuous floating animation for the question marks
      this.thinkingIndicatorAnimation = anime({
        targets: marks,
        translateY: (el, i) => {
          return [-3 - i * 2, 3 + i * 2];
        },
        duration: 1500,
        delay: anime.stagger(100),
        direction: 'alternate',
        loop: true,
        easing: 'easeInOutSine'
      });
    }

    // Gentle floating animation
    this.thinkingAnimation = anime({
      targets: this.svg,
      translateY: [-3, 3],
      duration: 2000,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine'
    });

    // Thinking eye variations - looking around while pondering
    const eyeLookFrames = [
      { left: 'M 170 193 Q 177 190 184 193', right: 'M 216 190 Q 223 187 230 190' }, // Looking up-right (default)
      { left: 'M 172 192 Q 179 189 186 192', right: 'M 214 192 Q 221 189 228 192' }, // Looking up
      { left: 'M 168 193 Q 175 190 182 193', right: 'M 218 192 Q 225 189 232 192' }, // Looking up-left slightly
      { left: 'M 172 195 Q 179 192 186 195', right: 'M 214 195 Q 221 192 228 195' }, // Back to center-up
    ];

    let eyeIndex = 0;
    const animateThinkingEyes = () => {
      if (!this.thinkingAnimation) return;

      const frame = eyeLookFrames[eyeIndex];

      anime({
        targets: [leftEye, rightEye],
        opacity: [1, 0.8, 1],
        duration: 300,
        easing: 'easeInOutQuad',
        begin: () => {
          leftEye.setAttribute('d', frame.left);
          rightEye.setAttribute('d', frame.right);
        }
      });

      eyeIndex = (eyeIndex + 1) % eyeLookFrames.length;
      this.thinkingEyeTimer = setTimeout(animateThinkingEyes, 1500 + Math.random() * 1000);
    };

    animateThinkingEyes();
  }

  stopThinkingAnimation() {
    console.log('stopThinkingAnimation called');

    if (this.thinkingAnimation) {
      this.thinkingAnimation.pause();
      this.thinkingAnimation = null;
    }

    if (this.thinkingIndicatorAnimation) {
      this.thinkingIndicatorAnimation.pause();
      this.thinkingIndicatorAnimation = null;
    }

    if (this.thinkingEyeTimer) {
      clearTimeout(this.thinkingEyeTimer);
      this.thinkingEyeTimer = null;
    }

    // Hide thinking indicators INSTANTLY when thinking stops
    const thinkingIndicators = document.getElementById(`${this.containerId}-thinkingIndicators`);
    console.log('thinkingIndicators element:', thinkingIndicators);

    if (thinkingIndicators) {
      const marks = thinkingIndicators.querySelectorAll('.thinking-mark');
      console.log('Found marks to hide:', marks.length);

      marks.forEach((m, i) => {
        console.log(`Setting mark ${i} opacity to 0, current opacity:`, m.getAttribute('opacity'));
        m.setAttribute('opacity', '0');
      });
      console.log('Hiding question marks - DONE');
    } else {
      console.log('No thinkingIndicators element found!');
    }

    // Reset position
    if (typeof anime !== 'undefined' && this.svg) {
      anime({
        targets: this.svg,
        translateY: 0,
        duration: 400,
        easing: 'easeOutQuad'
      });
    }
  }

  startTalkingAnimation(stateConfig) {
    if (this.isTalking) return;
    this.isTalking = true;

    const leftEye = document.getElementById(`${this.containerId}-leftEye`);
    const rightEye = document.getElementById(`${this.containerId}-rightEye`);
    const mouth = document.getElementById(`${this.containerId}-mouth`);
    const leftCheek = document.getElementById(`${this.containerId}-leftCheek`);
    const rightCheek = document.getElementById(`${this.containerId}-rightCheek`);

    // Start the talking sounds!
    this.startTalkingSounds();

    // Set initial eyes
    leftEye.setAttribute('d', stateConfig.eyeExpressions[0].left);
    rightEye.setAttribute('d', stateConfig.eyeExpressions[0].right);

    if (typeof anime !== 'undefined') {
      anime({
        targets: [leftCheek, rightCheek],
        opacity: stateConfig.cheekOpacity,
        duration: 300,
        easing: 'easeInOutQuad'
      });

      // Eye animation cycle
      let eyeIndex = 0;
      const animateEyes = () => {
        if (!this.isTalking) return;

        const eyeExpr = stateConfig.eyeExpressions[eyeIndex];

        anime({
          targets: [leftEye, rightEye],
          opacity: [1, 0.3, 1],
          duration: eyeExpr.duration < 300 ? 100 : 200,
          easing: 'easeInOutQuad',
          begin: () => {
            leftEye.setAttribute('d', eyeExpr.left);
            rightEye.setAttribute('d', eyeExpr.right);
          }
        });

        this.eyeAnimationTimer = setTimeout(() => {
          if (!this.isTalking) return;

          // Random chance to blink (20%)
          if (Math.random() < 0.2 && eyeIndex !== 3) {
            eyeIndex = 3; // Blink
          } else {
            eyeIndex = (eyeIndex + 1) % 3;
          }

          animateEyes();
        }, eyeExpr.duration);
      };

      animateEyes();

      // Mouth animation cycle
      let frameIndex = 0;
      const animateMouth = () => {
        if (!this.isTalking) return;

        const currentFrame = stateConfig.mouthFrames[frameIndex];

        anime({
          targets: mouth,
          opacity: [1, 0.7, 1],
          duration: 100,
          easing: 'easeInOutQuad',
          begin: () => {
            mouth.setAttribute('d', currentFrame);
          }
        });

        frameIndex = (frameIndex + 1) % stateConfig.mouthFrames.length;

        const nextDelay = 120 + Math.random() * 80;
        this.mouthAnimationTimer = setTimeout(animateMouth, nextDelay);
      };

      animateMouth();

      // Gentle bobbing
      this.talkingAnimation = anime({
        targets: this.svg,
        translateY: [
          { value: -2, duration: 200 },
          { value: 1, duration: 150 },
          { value: -1, duration: 180 },
          { value: 2, duration: 160 },
          { value: 0, duration: 200 }
        ],
        scale: [
          { value: 1.01, duration: 200 },
          { value: 0.995, duration: 150 },
          { value: 1.005, duration: 180 },
          { value: 0.998, duration: 160 },
          { value: 1, duration: 200 }
        ],
        easing: 'easeInOutSine',
        loop: true
      });
    }
  }

  stopTalkingAnimation() {
    if (!this.isTalking) return;

    this.isTalking = false;

    // Let Buddy finish his current thought - delay before stopping sounds
    if (this.stopSoundsTimeout) {
      clearTimeout(this.stopSoundsTimeout);
    }
    this.stopSoundsTimeout = setTimeout(() => {
      this.stopTalkingSounds();
    }, 800); // Give Buddy 800ms to finish

    // Clear timers
    if (this.eyeAnimationTimer) {
      clearTimeout(this.eyeAnimationTimer);
      this.eyeAnimationTimer = null;
    }

    if (this.mouthAnimationTimer) {
      clearTimeout(this.mouthAnimationTimer);
      this.mouthAnimationTimer = null;
    }

    // Stop bobbing
    if (this.talkingAnimation) {
      this.talkingAnimation.pause();
      this.talkingAnimation = null;
    }

    // Reset position
    if (typeof anime !== 'undefined' && this.svg) {
      anime({
        targets: this.svg,
        translateY: 0,
        scale: 1,
        duration: 400,
        easing: 'easeOutQuad'
      });
    }
  }

  destroy() {
    this.stopTalkingAnimation();
    this.stopThinkingAnimation();
    this.stopIdleAnimation();
    this.stopTalkingSounds();

    // Clean up the delayed stop timeout
    if (this.stopSoundsTimeout) {
      clearTimeout(this.stopSoundsTimeout);
      this.stopSoundsTimeout = null;
    }

    super.destroy();
  }
}
