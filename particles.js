// Particle system for background animation
class ParticleSystem {
  static create() {
    const particleContainer = document.getElementById("particles");
    for (let i = 0; i < 15; i++) {
      const particle = document.createElement("div");
      particle.className = "particle";
      particle.style.left = Math.random() * window.innerWidth + "px";
      particle.style.animationDelay = Math.random() * 20 + "s";
      particle.style.animationDuration = 15 + Math.random() * 10 + "s";
      particleContainer.appendChild(particle);
    }
  }
}
