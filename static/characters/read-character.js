// Read - The Expressive Robot Reader
class ReadCharacter extends Character {
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
    this.speechSynthesis = window.speechSynthesis;
    this.currentUtterance = null;
    this.isSpeaking = false; // Track if actually speaking
    this.audioContext = null;
    this.analyser = null;
    this.audioVolume = 0; // Current audio volume level
    this.speechQueue = []; // Queue for streaming speech
    this.isProcessingQueue = false;

    // Global mouse tracking
    this.shouldFollowMouse = true;
    this.currentMouseOffset = { x: 0, y: 0 };

    // Define Read's states
    this.states = {
      idle: {
        leftEye: { cx: 160, cy: 190, r: 16, scaleY: 1 },  // Round circles - consistent size
        rightEye: { cx: 240, cy: 190, r: 16, scaleY: 1 },
        mouth: 'M 188 240 Q 200 243 212 240',  // Slight smile curve
        antennaGlow: 0.3
      },
      thinking: {
        leftEye: { cx: 160, cy: 188, r: 16, scaleY: 0.5 },  // Squished and looking up slightly - consistent size
        rightEye: { cx: 240, cy: 188, r: 16, scaleY: 0.5 },
        mouth: 'M 190 242 Q 200 238 210 242',  // Narrower, slight curve up (pondering)
        antennaGlow: 0.8,
        animation: 'thinking'
      },
      talking: {
        eyeExpressions: [
          { // Round (normal) - consistent size
            left: { cx: 160, cy: 190, r: 16, scaleY: 1 },
            right: { cx: 240, cy: 190, r: 16, scaleY: 1 },
            duration: 4000
          },
          { // Arched down (happy) - consistent size
            left: { cx: 160, cy: 190, r: 16, scaleY: 0.5 },
            right: { cx: 240, cy: 190, r: 16, scaleY: 0.5 },
            duration: 3500
          },
          { // Round - consistent size
            left: { cx: 160, cy: 190, r: 16, scaleY: 1 },
            right: { cx: 240, cy: 190, r: 16, scaleY: 1 },
            duration: 3000
          },
          { // Slightly squished - consistent size
            left: { cx: 160, cy: 190, r: 16, scaleY: 0.7 },
            right: { cx: 240, cy: 190, r: 16, scaleY: 0.7 },
            duration: 3800
          }
        ],
        antennaGlow: 1.0
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

        <!-- Gradients -->
        <defs>
          <linearGradient id="bodyGradient-${this.containerId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#1e293b;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
          </linearGradient>

          <radialGradient id="eyeGlow-${this.containerId}">
            <stop offset="0%" class="accent-stop-1" style="stop-opacity:0.6" />
            <stop offset="100%" class="accent-stop-2" style="stop-opacity:0" />
          </radialGradient>

          <filter id="glow-${this.containerId}">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Main body - medium width -->
        <rect x="127" y="150" width="145" height="130" rx="35" ry="35"
              fill="url(#bodyGradient-${this.containerId})"
              stroke="#334155"
              stroke-width="3"/>

        <!-- Eye areas with colored glow - smaller -->
        <ellipse cx="162" cy="190" rx="25" ry="20" fill="url(#eyeGlow-${this.containerId})" opacity="0.5"/>
        <ellipse cx="238" cy="190" rx="25" ry="20" fill="url(#eyeGlow-${this.containerId})" opacity="0.5"/>

        <!-- Eyes - Circles that can morph to arches - much bigger -->
        <circle id="${this.containerId}-leftEye" cx="160" cy="190" r="16"
                class="accent-fill"/>
        <circle id="${this.containerId}-rightEye" cx="240" cy="190" r="16"
                class="accent-fill"/>

        <!-- Mouth area -->
        <g id="${this.containerId}-mouthGroup">
          <!-- Mouth glow -->
          <path id="${this.containerId}-mouthGlow" d="M 188 240 Q 200 243 212 240"
                class="accent-stroke"
                stroke-width="5"
                fill="none"
                opacity="0.3"
                stroke-linecap="round"
                filter="url(#glow-${this.containerId})"/>
          <!-- Main mouth -->
          <path id="${this.containerId}-mouth" d="M 188 240 Q 200 243 212 240"
                class="accent-stroke"
                stroke-width="3"
                fill="none"
                stroke-linecap="round"/>
        </g>
        </circle>
        <circle cx="250" cy="175" r="3" class="accent-fill" opacity="0.6">
          <animate attributeName="opacity" values="0.3;0.8;0.3" dur="3s" begin="1.5s" repeatCount="indefinite"/>
        </circle>
      </svg>

      <!-- Processing indicators overlay -->
      <svg viewBox="110 135 210 150" width="${this.config.width}" height="${this.config.height}"
           style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 100;"
           xmlns="http://www.w3.org/2000/svg">
        <g id="${this.containerId}-thinkingIndicators">
          <!-- Rotating loading circles - theme color -->
          <circle class="thinking-circle accent-fill" cx="285" cy="180" r="3" opacity="0"/>
          <circle class="thinking-circle accent-fill" cx="290" cy="190" r="3" opacity="0"/>
          <circle class="thinking-circle accent-fill" cx="285" cy="200" r="3" opacity="0"/>
        </g>
      </svg>
    `;

    this.svg = document.getElementById(`${this.containerId}-svg`);

    // Set up global mouse tracking
    this.setupGlobalMouseTracking();

    this.setState('idle');
  }

  setupGlobalMouseTracking() {
    // Global mouse handler that always tracks
    this.globalMouseHandler = (e) => {
      if (!this.svg) return;

      const rect = this.svg.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const mouseX = e.clientX;
      const mouseY = e.clientY;

      const dx = mouseX - centerX;
      const dy = mouseY - centerY;

      const maxOffset = 10;
      const offsetX = Math.max(-maxOffset, Math.min(maxOffset, dx / 8));
      const offsetY = Math.max(-maxOffset, Math.min(maxOffset, dy / 8));

      this.currentMouseOffset = { x: offsetX, y: offsetY };

      // Apply mouse offset to eyes if should follow
      if (this.shouldFollowMouse) {
        this.applyMouseOffsetToEyes();
      }
    };

    document.addEventListener('mousemove', this.globalMouseHandler);
  }

  applyMouseOffsetToEyes() {
    const leftEye = document.getElementById(`${this.containerId}-leftEye`);
    const rightEye = document.getElementById(`${this.containerId}-rightEye`);

    if (!leftEye || !rightEye) return;

    const state = this.states[this.currentState];
    if (!state) return;

    let baseLeft, baseRight;

    if (this.currentState === 'talking' && state.eyeExpressions) {
      // Use current expression from talking state
      const exprIndex = this.currentEyeExpressionIndex || 0;
      baseLeft = state.eyeExpressions[exprIndex].left;
      baseRight = state.eyeExpressions[exprIndex].right;
    } else {
      baseLeft = state.leftEye;
      baseRight = state.rightEye;
    }

    if (baseLeft && baseRight) {
      // Apply mouse offset to circle positions
      leftEye.setAttribute('cx', baseLeft.cx + this.currentMouseOffset.x);
      leftEye.setAttribute('cy', baseLeft.cy + this.currentMouseOffset.y);
      rightEye.setAttribute('cx', baseRight.cx + this.currentMouseOffset.x);
      rightEye.setAttribute('cy', baseRight.cy + this.currentMouseOffset.y);
    }
  }

  applyState(stateConfig) {
    if (!this.svg) return;

    const leftEye = document.getElementById(`${this.containerId}-leftEye`);
    const rightEye = document.getElementById(`${this.containerId}-rightEye`);
    const mouth = document.getElementById(`${this.containerId}-mouth`);
    const antenna = document.getElementById(`${this.containerId}-antenna`);

    if (this.currentState === 'talking') {
      this.stopThinkingAnimation();
      this.stopIdleAnimation();
      this.startTalkingAnimation(stateConfig);
    } else if (this.currentState === 'thinking') {
      this.stopTalkingAnimation();
      this.stopIdleAnimation();
      this.startThinkingAnimation(stateConfig, leftEye, rightEye, mouth, antenna);
    } else if (this.currentState === 'idle') {
      this.stopTalkingAnimation();
      this.stopThinkingAnimation();
      this.startIdleAnimation(stateConfig, leftEye, rightEye, mouth, antenna);
    } else {
      this.stopTalkingAnimation();
      this.stopThinkingAnimation();
      this.stopIdleAnimation();

      if (typeof anime !== 'undefined') {
        anime.timeline()
          .add({
            targets: [leftEye, rightEye, mouth],
            opacity: [1, 0.3, 1],
            duration: 200,
            easing: 'easeInOutQuad',
            begin: () => {
              if (stateConfig.leftEye) {
                leftEye.setAttribute('cx', stateConfig.leftEye.cx);
                leftEye.setAttribute('cy', stateConfig.leftEye.cy);
                leftEye.setAttribute('r', stateConfig.leftEye.r);
                leftEye.style.transform = `scaleY(${stateConfig.leftEye.scaleY})`;
                leftEye.style.transformOrigin = `${stateConfig.leftEye.cx}px ${stateConfig.leftEye.cy}px`;
              }
              if (stateConfig.rightEye) {
                rightEye.setAttribute('cx', stateConfig.rightEye.cx);
                rightEye.setAttribute('cy', stateConfig.rightEye.cy);
                rightEye.setAttribute('r', stateConfig.rightEye.r);
                rightEye.style.transform = `scaleY(${stateConfig.rightEye.scaleY})`;
                rightEye.style.transformOrigin = `${stateConfig.rightEye.cx}px ${stateConfig.rightEye.cy}px`;
              }
              if (stateConfig.mouth) mouth.setAttribute('d', stateConfig.mouth);
            }
          });

        anime({
          targets: antenna,
          opacity: stateConfig.antennaGlow || 0.3,
          duration: 300,
          easing: 'easeInOutQuad'
        });
      } else {
        if (stateConfig.leftEye) {
          leftEye.setAttribute('cx', stateConfig.leftEye.cx);
          leftEye.setAttribute('cy', stateConfig.leftEye.cy);
          leftEye.setAttribute('r', stateConfig.leftEye.r);
          leftEye.style.transform = `scaleY(${stateConfig.leftEye.scaleY})`;
          leftEye.style.transformOrigin = `${stateConfig.leftEye.cx}px ${stateConfig.leftEye.cy}px`;
        }
        if (stateConfig.rightEye) {
          rightEye.setAttribute('cx', stateConfig.rightEye.cx);
          rightEye.setAttribute('cy', stateConfig.rightEye.cy);
          rightEye.setAttribute('r', stateConfig.rightEye.r);
          rightEye.style.transform = `scaleY(${stateConfig.rightEye.scaleY})`;
          rightEye.style.transformOrigin = `${stateConfig.rightEye.cx}px ${stateConfig.rightEye.cy}px`;
        }
        if (stateConfig.mouth) mouth.setAttribute('d', stateConfig.mouth);
        antenna.style.opacity = stateConfig.antennaGlow || 0.3;
      }
    }
  }

  startIdleAnimation(stateConfig, leftEye, rightEye, mouth, antenna) {
    this.stopIdleAnimation();

    if (typeof anime === 'undefined') return;

    // Enable mouse following
    this.shouldFollowMouse = true;

    // Set initial state
    leftEye.setAttribute('cx', stateConfig.leftEye.cx);
    leftEye.setAttribute('cy', stateConfig.leftEye.cy);
    leftEye.setAttribute('r', stateConfig.leftEye.r);
    leftEye.style.transform = `scaleY(${stateConfig.leftEye.scaleY})`;
    leftEye.style.transformOrigin = `${stateConfig.leftEye.cx}px ${stateConfig.leftEye.cy}px`;

    rightEye.setAttribute('cx', stateConfig.rightEye.cx);
    rightEye.setAttribute('cy', stateConfig.rightEye.cy);
    rightEye.setAttribute('r', stateConfig.rightEye.r);
    rightEye.style.transform = `scaleY(${stateConfig.rightEye.scaleY})`;
    rightEye.style.transformOrigin = `${stateConfig.rightEye.cx}px ${stateConfig.rightEye.cy}px`;

    mouth.setAttribute('d', stateConfig.mouth);

    // Gentle floating with slight rotation for more life
    this.idleAnimation = anime({
      targets: this.svg,
      translateY: [-3, 3],
      rotate: [-1, 1],
      duration: 3000,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine'
    });

    // Occasional blink
    const blink = () => {
      if (!this.idleAnimation) return;

      anime({
        targets: [leftEye, rightEye],
        opacity: [1, 0, 1],
        duration: 150,
        easing: 'linear'
      });

      this.idleBlinkTimer = setTimeout(blink, 4000 + Math.random() * 3000);
    };

    this.idleBlinkTimer = setTimeout(blink, 2500);

    // Antenna pulse
    anime({
      targets: antenna,
      opacity: [0.3, 0.6, 0.3],
      duration: 2000,
      loop: true,
      easing: 'easeInOutSine'
    });
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

    if (typeof anime !== 'undefined' && this.svg) {
      anime({
        targets: this.svg,
        translateY: 0,
        rotate: 0,
        duration: 400,
        easing: 'easeOutQuad'
      });
    }
  }

  startThinkingAnimation(stateConfig, leftEye, rightEye, mouth, antenna) {
    this.stopThinkingAnimation();

    if (typeof anime === 'undefined') return;

    // Disable mouse following during thinking - eyes will dart around
    this.shouldFollowMouse = false;

    // Set initial state
    leftEye.setAttribute('cx', stateConfig.leftEye.cx);
    leftEye.setAttribute('cy', stateConfig.leftEye.cy);
    leftEye.setAttribute('r', stateConfig.leftEye.r);
    leftEye.style.transform = `scaleY(${stateConfig.leftEye.scaleY})`;
    leftEye.style.transformOrigin = `${stateConfig.leftEye.cx}px ${stateConfig.leftEye.cy}px`;

    rightEye.setAttribute('cx', stateConfig.rightEye.cx);
    rightEye.setAttribute('cy', stateConfig.rightEye.cy);
    rightEye.setAttribute('r', stateConfig.rightEye.r);
    rightEye.style.transform = `scaleY(${stateConfig.rightEye.scaleY})`;
    rightEye.style.transformOrigin = `${stateConfig.rightEye.cx}px ${stateConfig.rightEye.cy}px`;

    mouth.setAttribute('d', stateConfig.mouth);

    const thinkingIndicators = document.getElementById(`${this.containerId}-thinkingIndicators`);

    // Show thinking indicators
    if (thinkingIndicators) {
      const circles = thinkingIndicators.querySelectorAll('.thinking-circle');

      circles.forEach((circle, index) => {
        setTimeout(() => {
          circle.setAttribute('opacity', '1');
        }, index * 150);
      });

      // Rotating animation
      this.thinkingIndicatorAnimation = anime({
        targets: circles,
        translateY: (el, i) => [-5 - i * 2, 5 + i * 2],
        duration: 1200,
        delay: anime.stagger(100),
        direction: 'alternate',
        loop: true,
        easing: 'easeInOutSine'
      });
    }

    // Head tilt while thinking - looks more engaged
    this.thinkingAnimation = anime({
      targets: this.svg,
      rotate: [-5, 5],
      translateY: [-3, 3],
      duration: 3000,
      direction: 'alternate',
      loop: true,
      easing: 'easeInOutSine'
    });

    // Eye darting animation - looks like processing/thinking
    const eyeDartExpressions = [
      { left: { cx: 162, cy: 188 }, right: { cx: 242, cy: 188 } }, // Looking right
      { left: { cx: 158, cy: 188 }, right: { cx: 238, cy: 188 } }, // Looking left
      { left: { cx: 160, cy: 186 }, right: { cx: 240, cy: 186 } }, // Looking up
      { left: { cx: 160, cy: 188 }, right: { cx: 240, cy: 188 } }, // Center
    ];

    let dartIndex = 3; // Start at center
    const dartEyes = () => {
      if (!this.thinkingAnimation) return;

      // Randomly pick a direction
      dartIndex = Math.floor(Math.random() * eyeDartExpressions.length);
      const dart = eyeDartExpressions[dartIndex];

      anime({
        targets: leftEye,
        cx: dart.left.cx,
        cy: dart.left.cy,
        duration: 150,
        easing: 'easeOutQuad'
      });

      anime({
        targets: rightEye,
        cx: dart.right.cx,
        cy: dart.right.cy,
        duration: 150,
        easing: 'easeOutQuad'
      });

      this.thinkingEyeTimer = setTimeout(dartEyes, 400 + Math.random() * 600);
    };

    // Start eye darting after a delay
    this.thinkingEyeTimer = setTimeout(dartEyes, 500);

    // Mouth occasionally shifts slightly
    const mouthShiftFrames = [
      'M 190 242 Q 200 238 210 242',
      'M 188 242 Q 200 240 212 242',
      'M 192 242 Q 200 237 208 242'
    ];

    let mouthIndex = 0;
    const shiftMouth = () => {
      if (!this.thinkingAnimation) return;

      mouthIndex = (mouthIndex + 1) % mouthShiftFrames.length;
      mouth.setAttribute('d', mouthShiftFrames[mouthIndex]);

      this.thinkingMouthTimer = setTimeout(shiftMouth, 2000 + Math.random() * 1000);
    };

    this.thinkingMouthTimer = setTimeout(shiftMouth, 1500);

    // Make antenna glow brighter - faster pulse for active thinking
    anime({
      targets: antenna,
      opacity: [0.6, 1, 0.6],
      duration: 800,
      loop: true,
      easing: 'easeInOutSine'
    });
  }

  stopThinkingAnimation() {
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

    if (this.thinkingMouthTimer) {
      clearTimeout(this.thinkingMouthTimer);
      this.thinkingMouthTimer = null;
    }

    // Re-enable mouse following when done thinking
    this.shouldFollowMouse = true;

    const thinkingIndicators = document.getElementById(`${this.containerId}-thinkingIndicators`);
    if (thinkingIndicators) {
      const circles = thinkingIndicators.querySelectorAll('.thinking-circle');
      circles.forEach(circle => {
        circle.setAttribute('opacity', '0');
      });
    }

    if (typeof anime !== 'undefined' && this.svg) {
      anime({
        targets: this.svg,
        translateY: 0,
        rotate: 0,
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
    const antenna = document.getElementById(`${this.containerId}-antenna`);

    // Initialize tracking
    this.currentEyeExpressionIndex = 0;
    this.shouldFollowMouse = true;
    this.lookAwayOffset = { x: 0, y: 0 };

    // Set initial eyes
    leftEye.setAttribute('cx', stateConfig.eyeExpressions[0].left.cx);
    leftEye.setAttribute('cy', stateConfig.eyeExpressions[0].left.cy);
    leftEye.setAttribute('r', stateConfig.eyeExpressions[0].left.r);
    leftEye.style.transform = `scaleY(${stateConfig.eyeExpressions[0].left.scaleY})`;
    leftEye.style.transformOrigin = `${stateConfig.eyeExpressions[0].left.cx}px ${stateConfig.eyeExpressions[0].left.cy}px`;

    rightEye.setAttribute('cx', stateConfig.eyeExpressions[0].right.cx);
    rightEye.setAttribute('cy', stateConfig.eyeExpressions[0].right.cy);
    rightEye.setAttribute('r', stateConfig.eyeExpressions[0].right.r);
    rightEye.style.transform = `scaleY(${stateConfig.eyeExpressions[0].right.scaleY})`;
    rightEye.style.transformOrigin = `${stateConfig.eyeExpressions[0].right.cx}px ${stateConfig.eyeExpressions[0].right.cy}px`;

    if (typeof anime !== 'undefined') {
      // Make antenna glow actively
      anime({
        targets: antenna,
        opacity: [0.8, 1, 0.8],
        duration: 500,
        loop: true,
        easing: 'easeInOutSine'
      });

      // Occasionally decide to look away while talking (like a person would)
      const toggleLookBehavior = () => {
        if (!this.isTalking) return;

        if (Math.random() > 0.6) {
          // Look away
          this.shouldFollowMouse = false;
          this.lookAwayOffset = {
            x: (Math.random() - 0.5) * 15,
            y: (Math.random() - 0.5) * 12
          };
          // Apply the look away offset
          const expr = stateConfig.eyeExpressions[this.currentEyeExpressionIndex];
          leftEye.setAttribute('cx', expr.left.cx + this.lookAwayOffset.x);
          leftEye.setAttribute('cy', expr.left.cy + this.lookAwayOffset.y);
          rightEye.setAttribute('cx', expr.right.cx + this.lookAwayOffset.x);
          rightEye.setAttribute('cy', expr.right.cy + this.lookAwayOffset.y);
        } else {
          // Follow mouse
          this.shouldFollowMouse = true;
        }

        this.eyeLookAwayTimer = setTimeout(toggleLookBehavior, 2000 + Math.random() * 3000);
      };

      toggleLookBehavior();

      // Cycle through eye expressions
      const animateEyes = () => {
        if (!this.isTalking) return;

        this.currentEyeExpressionIndex = (this.currentEyeExpressionIndex + 1) % stateConfig.eyeExpressions.length;
        const eyeExpr = stateConfig.eyeExpressions[this.currentEyeExpressionIndex];

        // Update eye size and scaleY
        leftEye.setAttribute('r', eyeExpr.left.r);
        leftEye.style.transform = `scaleY(${eyeExpr.left.scaleY})`;
        leftEye.style.transformOrigin = `${eyeExpr.left.cx}px ${eyeExpr.left.cy}px`;

        rightEye.setAttribute('r', eyeExpr.right.r);
        rightEye.style.transform = `scaleY(${eyeExpr.right.scaleY})`;
        rightEye.style.transformOrigin = `${eyeExpr.right.cx}px ${eyeExpr.right.cy}px`;

        // Position will be handled by global mouse tracker or look away offset
        if (!this.shouldFollowMouse) {
          leftEye.setAttribute('cx', eyeExpr.left.cx + this.lookAwayOffset.x);
          leftEye.setAttribute('cy', eyeExpr.left.cy + this.lookAwayOffset.y);
          rightEye.setAttribute('cx', eyeExpr.right.cx + this.lookAwayOffset.x);
          rightEye.setAttribute('cy', eyeExpr.right.cy + this.lookAwayOffset.y);
        }

        // Wait before next change
        this.eyeAnimationTimer = setTimeout(animateEyes, eyeExpr.duration);
      };

      // Start eye animation cycle
      this.eyeAnimationTimer = setTimeout(animateEyes, stateConfig.eyeExpressions[0].duration);

      // AMAZING Real-time waveform with smooth curves
      const mouthGlow = document.getElementById(`${this.containerId}-mouthGlow`);
      let debugFrameCount = 0;
      const animateMouth = () => {
        if (!this.isTalking) return;

        // Debug every 60 frames (about once per second)
        if (debugFrameCount++ % 60 === 0) {
          console.log('👄 Mouth frame | isTalking:', this.isTalking, '| isSpeaking:', this.isSpeaking, '| audioVolume:', this.audioVolume.toFixed(3));
        }

        // Simple: use audioVolume directly (updated by timer during speech)
        const volume = this.audioVolume;
        const threshold = 0.05;

        if (volume > threshold) {
          // Narrower and taller mouth
          const centerX = 200;
          const centerY = 240;
          const width = 15; // Narrower mouth
          const curve = volume * 20; // More dramatic/taller opening

          // Create a simple curve that opens downward
          const path = `M ${centerX - width} ${centerY} Q ${centerX} ${centerY + curve}, ${centerX + width} ${centerY}`;

          mouth.setAttribute('d', path);
          mouthGlow.setAttribute('d', path);

          // Dynamic styling - thicker when louder
          const lineWidth = 3 + volume * 3;
          mouth.setAttribute('stroke-width', lineWidth);
          mouthGlow.setAttribute('stroke-width', lineWidth + 3);
          mouthGlow.setAttribute('opacity', 0.3 + volume * 0.6);
        } else {
          // Closed mouth - narrower straight line
          const flatPath = 'M 185 240 L 215 240';
          mouth.setAttribute('d', flatPath);
          mouthGlow.setAttribute('d', flatPath);
          mouth.setAttribute('stroke-width', 3);
          mouthGlow.setAttribute('stroke-width', 6);
          mouthGlow.setAttribute('opacity', 0.3);
        }

        this.mouthAnimationTimer = requestAnimationFrame(animateMouth);
      };

      animateMouth();

      // Lively bounce with subtle rotation - more expressive and engaging
      this.talkingAnimation = anime({
        targets: this.svg,
        translateY: [
          { value: -1, duration: 400 },
          { value: 1, duration: 400 }
        ],
        rotate: [
          { value: -0.8, duration: 500 },
          { value: 0.8, duration: 500 }
        ],
        direction: 'alternate',
        loop: true,
        easing: 'easeInOutSine'
      });
    }
  }

  stopTalkingAnimation() {
    if (!this.isTalking) return;

    this.isTalking = false;

    // Stop speech synthesis
    this.stopSpeech();

    // Clear timers
    if (this.eyeAnimationTimer) {
      clearTimeout(this.eyeAnimationTimer);
      this.eyeAnimationTimer = null;
    }

    if (this.eyeLookAwayTimer) {
      clearTimeout(this.eyeLookAwayTimer);
      this.eyeLookAwayTimer = null;
    }

    if (this.mouthAnimationTimer) {
      clearTimeout(this.mouthAnimationTimer);
      this.mouthAnimationTimer = null;
    }

    if (this.talkingAnimation) {
      this.talkingAnimation.pause();
      this.talkingAnimation = null;
    }

    // Smoothly transition eyes back to idle state
    const leftEye = document.getElementById(`${this.containerId}-leftEye`);
    const rightEye = document.getElementById(`${this.containerId}-rightEye`);
    const idleState = this.states.idle;

    if (typeof anime !== 'undefined' && leftEye && rightEye && idleState) {
      // Animate eyes smoothly to idle position
      anime({
        targets: leftEye,
        cx: idleState.leftEye.cx,
        cy: idleState.leftEye.cy,
        r: idleState.leftEye.r,
        duration: 400,
        easing: 'easeOutQuad',
        complete: () => {
          leftEye.style.transform = `scaleY(${idleState.leftEye.scaleY})`;
          leftEye.style.transformOrigin = `${idleState.leftEye.cx}px ${idleState.leftEye.cy}px`;
        }
      });

      anime({
        targets: rightEye,
        cx: idleState.rightEye.cx,
        cy: idleState.rightEye.cy,
        r: idleState.rightEye.r,
        duration: 400,
        easing: 'easeOutQuad',
        complete: () => {
          rightEye.style.transform = `scaleY(${idleState.rightEye.scaleY})`;
          rightEye.style.transformOrigin = `${idleState.rightEye.cx}px ${idleState.rightEye.cy}px`;

          // Re-enable mouse following after animation completes
          this.shouldFollowMouse = true;
        }
      });
    } else {
      // Fallback without animation
      this.shouldFollowMouse = true;
    }

    this.lookAwayOffset = { x: 0, y: 0 };

    // Smoothly reset mouth to idle smile
    const mouth = document.getElementById(`${this.containerId}-mouth`);
    const mouthGlow = document.getElementById(`${this.containerId}-mouthGlow`);
    if (mouth && mouthGlow && typeof anime !== 'undefined') {
      // Animate mouth back to idle shape
      anime({
        targets: mouth,
        opacity: [1, 0.5, 1],
        duration: 300,
        easing: 'easeInOutQuad',
        begin: () => {
          mouth.setAttribute('d', 'M 188 240 Q 200 243 212 240');
          mouth.setAttribute('stroke-width', '3');
          mouthGlow.setAttribute('d', 'M 188 240 Q 200 243 212 240');
          mouthGlow.setAttribute('stroke-width', '5');
          mouthGlow.setAttribute('opacity', '0.3');
        }
      });
    } else if (mouth && mouthGlow) {
      mouth.setAttribute('d', 'M 188 240 Q 200 243 212 240');
      mouth.setAttribute('stroke-width', '3');
      mouthGlow.setAttribute('d', 'M 188 240 Q 200 243 212 240');
      mouthGlow.setAttribute('stroke-width', '5');
      mouthGlow.setAttribute('opacity', '0.3');
    }

    if (typeof anime !== 'undefined' && this.svg) {
      anime({
        targets: this.svg,
        translateX: 0,
        translateY: 0,
        rotate: 0,
        duration: 400,
        easing: 'easeOutQuad'
      });
    }
  }

  // Speech synthesis methods
  speak(text, clearQueue = false) {
    if (!this.speechSynthesis) {
      console.warn('Speech synthesis not supported');
      return;
    }

    if (!text || text.trim().length === 0) return;

    console.log('📢 speak() called:', text.substring(0, 50), '| Queue:', this.speechQueue.length, '| Processing:', this.isProcessingQueue, '| Speaking:', this.isSpeaking);

    // If clearQueue is true, stop current speech and clear queue
    if (clearQueue) {
      this.stopSpeech();
      this.speechQueue = [];
    }

    // Add to queue
    this.speechQueue.push(text);

    // Start processing if not already
    if (!this.isProcessingQueue) {
      console.log('✅ Starting queue processing');
      this.processNextInQueue();
    } else {
      console.log('⏳ Queue already processing, item queued');
    }
  }

  processNextInQueue() {
    console.log('🔄 processNextInQueue() | Queue:', this.speechQueue.length, '| Processing:', this.isProcessingQueue, '| Speaking:', this.isSpeaking, '| synth.speaking:', this.speechSynthesis.speaking);

    // If queue is empty or already speaking, do nothing
    if (this.speechQueue.length === 0) {
      console.log('✋ Queue empty, stopping processing');
      this.isProcessingQueue = false;
      return;
    }

    if (this.isSpeaking || this.speechSynthesis.speaking) {
      // Wait a bit and try again
      console.log('⏸️ Still speaking, waiting... Queue length:', this.speechQueue.length);
      setTimeout(() => this.processNextInQueue(), 100);
      return;
    }

    console.log('▶️ Processing next item in queue');
    this.isProcessingQueue = true;
    const text = this.speechQueue.shift();
    console.log('🎤 About to speak:', text.substring(0, 50));

    // Wait a moment for voices to load if needed
    const speakWithVoice = () => {
      // Create utterance
      this.currentUtterance = new SpeechSynthesisUtterance(text);

      // Configure voice (awesome robot voice)
      const voices = this.speechSynthesis.getVoices();
      console.log('Available voices:', voices.length);

      // Find best British voice - prefer UK English voices
      const roboticVoice = voices.find(voice =>
        voice.lang.startsWith('en-GB') && voice.name.includes('Male')
      ) || voices.find(voice =>
        voice.name.includes('Google UK English Male') ||
        voice.name.includes('Daniel') ||
        voice.name.includes('British') ||
        voice.name.includes('UK')
      ) || voices.find(voice =>
        voice.lang.startsWith('en-GB')
      ) || voices.find(voice => voice.lang.startsWith('en'));

      if (roboticVoice) {
        console.log('Using voice:', roboticVoice.name);
        this.currentUtterance.voice = roboticVoice;
      } else {
        console.log('Using default voice');
      }

      // Awesome robot voice settings
      this.currentUtterance.rate = 1.15;  // Slightly faster for robot feel
      this.currentUtterance.pitch = 0.7;  // Lower pitch for deeper robot voice
      this.currentUtterance.volume = 1.0; // Full volume

      // Event handlers
      this.currentUtterance.onstart = () => {
        console.log('Speech started');
        this.isSpeaking = true;
        this.audioVolume = 1.0;

        // Timer-based animation since onboundary events don't work reliably
        // Update volume every 50ms to simulate speech
        this.speechAnimationInterval = setInterval(() => {
          if (this.isSpeaking) {
            // Vary volume to simulate natural speech
            this.audioVolume = 0.6 + Math.random() * 0.4;
          }
        }, 50);
      };

      this.currentUtterance.onboundary = (event) => {
        // This may or may not fire depending on browser
        console.log('🔤 Word boundary event');
      };

      this.currentUtterance.onend = () => {
        console.log('✅ Speech ended, queue length:', this.speechQueue.length);
        this.isSpeaking = false;
        this.audioVolume = 0;

        // Clear animation interval
        if (this.speechAnimationInterval) {
          clearInterval(this.speechAnimationInterval);
          this.speechAnimationInterval = null;
        }

        // Process next in queue with slightly longer delay to avoid interruption
        if (this.speechQueue.length > 0) {
          console.log('⏭️ Moving to next sentence in queue');
          setTimeout(() => this.processNextInQueue(), 150);
        } else {
          console.log('🏁 Queue empty, setting to idle');
          this.isProcessingQueue = false;
          this.setState('idle');
        }
      };

      this.currentUtterance.onerror = (error) => {
        // "interrupted" errors are common and usually not a problem - the queue handles it
        if (error.error === 'interrupted') {
          console.log('⚠️ Speech interrupted | Queue:', this.speechQueue.length, '| Was speaking:', this.isSpeaking);
        } else {
          console.error('❌ Speech synthesis error:', error.error, error.message);
        }

        this.isSpeaking = false;
        this.audioVolume = 0;

        // Clear animation interval
        if (this.speechAnimationInterval) {
          clearInterval(this.speechAnimationInterval);
          this.speechAnimationInterval = null;
        }

        // Try to continue with next item even after error
        if (this.speechQueue.length > 0) {
          console.log('🔄 Continuing with next item after error');
          setTimeout(() => this.processNextInQueue(), 150);
        } else {
          console.log('❌ Error occurred with empty queue, going idle');
          this.isProcessingQueue = false;
          this.setState('idle');
        }
      };

      // Speak!
      console.log('Starting speech synthesis:', text.substring(0, 50) + '...');
      this.setState('talking');
      this.isSpeaking = true; // Set immediately to prevent race conditions
      this.speechSynthesis.speak(this.currentUtterance);
    };

    // Check if voices are loaded
    const voices = this.speechSynthesis.getVoices();
    if (voices.length === 0) {
      // Voices not loaded yet, wait for them
      console.log('Waiting for voices to load...');
      this.speechSynthesis.addEventListener('voiceschanged', () => {
        speakWithVoice();
      }, { once: true });
    } else {
      speakWithVoice();
    }
  }

  stopSpeech() {
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
    }
    this.currentUtterance = null;
    this.isSpeaking = false;
    this.audioVolume = 0;
    this.speechQueue = [];
    this.isProcessingQueue = false;
  }

  destroy() {
    this.stopTalkingAnimation();
    this.stopThinkingAnimation();
    this.stopIdleAnimation();
    this.stopSpeech();

    // Clean up global mouse handler
    if (this.globalMouseHandler) {
      document.removeEventListener('mousemove', this.globalMouseHandler);
      this.globalMouseHandler = null;
    }

    super.destroy();
  }
}
