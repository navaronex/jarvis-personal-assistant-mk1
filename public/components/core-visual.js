/**
 * Central Holographic Arc Reactor Core Visualizer
 * Canvas-based HUD renderer reacting to JARVIS system states:
 * - Preparado
 * - Escuchando
 * - Transcribiendo
 * - Pensando
 * - Hablando
 */

export class JarvisCoreVisual {
  constructor(canvas) {
    this.canvas = typeof canvas === "string" ? document.getElementById(canvas) : canvas;
    this.ctx = this.canvas.getContext("2d");
    this.state = "Preparado";
    this.audioLevel = 0;
    
    this.angle1 = 0;
    this.angle2 = 0;
    this.angle3 = 0;
    this.pulsePhase = 0;
    this.particles = [];

    this.initParticles();
    this.bindEvents();
    this.render = this.render.bind(this);
    requestAnimationFrame(this.render);
  }

  initParticles() {
    this.particles = [];
    const count = 36;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        angle: (Math.PI * 2 / count) * i,
        dist: 40 + Math.random() * 80,
        speed: 0.2 + Math.random() * 0.6,
        size: 1.5 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.7
      });
    }
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || 420;
    this.height = rect.height || 420;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
    this.baseRadius = Math.min(this.width, this.height) * 0.36;
  }

  setState(newState) {
    this.state = newState;
  }

  setAudioLevel(level) {
    this.audioLevel = Math.max(0, Math.min(1, level));
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Dynamic speeds and colors depending on state
    let speedMult = 1.0;
    let mainColor = "#00f0ff";
    let glowColor = "rgba(0, 240, 255, 0.4)";
    let ringColor = "#0088ff";

    switch (this.state) {
      case "Escuchando":
        speedMult = 1.8;
        mainColor = "#00ffa3";
        glowColor = "rgba(0, 255, 163, 0.55)";
        ringColor = "#00d0ff";
        break;
      case "Transcribiendo":
        speedMult = 2.4;
        mainColor = "#00d0ff";
        glowColor = "rgba(0, 208, 255, 0.5)";
        ringColor = "#3b82f6";
        break;
      case "Pensando":
        speedMult = 3.2;
        mainColor = "#ffb700";
        glowColor = "rgba(255, 183, 0, 0.6)";
        ringColor = "#ff7700";
        break;
      case "Hablando":
        speedMult = 2.0;
        mainColor = "#00f0ff";
        glowColor = "rgba(0, 240, 255, 0.6)";
        ringColor = "#7be5ff";
        break;
      default: // Preparado
        speedMult = 0.8;
        mainColor = "#00f0ff";
        glowColor = "rgba(0, 240, 255, 0.35)";
        ringColor = "#0066cc";
    }

    this.angle1 += 0.008 * speedMult;
    this.angle2 -= 0.013 * speedMult;
    this.angle3 += 0.02 * speedMult;
    this.pulsePhase += 0.04 * speedMult;

    const pulse = Math.sin(this.pulsePhase) * 5 + (this.audioLevel * 20);

    // 1. External HUD Ring with segmented ticks
    this.drawSegmentedRing(this.baseRadius + pulse, 32, 0.08, this.angle1, mainColor, 1.5, glowColor);

    // 2. Secondary Notched Ring
    this.drawNotchedRing(this.baseRadius - 22, this.angle2, ringColor);

    // 3. Floating Holographic Nodes / Particles
    this.drawParticles(mainColor, speedMult);

    // 4. Inner Orbit Dotted Track
    this.drawDottedRing(this.baseRadius - 55, this.angle3, mainColor);

    // 5. Central Glowing Arc Reactor Core
    this.drawArcCore(mainColor, glowColor, pulse);

    requestAnimationFrame(this.render);
  }

  drawSegmentedRing(radius, segments, arcLen, rotation, color, lineWidth, glow) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    ctx.rotate(rotation);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.shadowBlur = 12;
    ctx.shadowColor = glow;

    const step = (Math.PI * 2) / segments;
    for (let i = 0; i < segments; i++) {
      const start = i * step;
      ctx.beginPath();
      ctx.arc(0, 0, radius, start, start + arcLen);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawNotchedRing(radius, rotation, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    ctx.rotate(rotation);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;

    // Outer arcs
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 0.75);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, radius, Math.PI, Math.PI * 1.75);
    ctx.stroke();

    // 4 Cardinal tick marks
    ctx.fillStyle = color;
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i;
      ctx.fillRect(Math.cos(a) * (radius - 5), Math.sin(a) * (radius - 5), 10, 2);
    }
    ctx.restore();
  }

  drawDottedRing(radius, rotation, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    ctx.rotate(rotation);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.setLineDash([4, 6]);
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawParticles(color, speedMult) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    ctx.fillStyle = color;

    for (const p of this.particles) {
      p.angle += 0.005 * p.speed * speedMult;
      const x = Math.cos(p.angle) * p.dist;
      const y = Math.sin(p.angle) * p.dist;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawArcCore(color, glow, pulse) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.centerX, this.centerY);

    // Deep radial luminous bloom
    const coreR = 48 + pulse;
    const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, Math.max(12, coreR));
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.fill();

    // Sharp bright central ring
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 16;
    ctx.shadowColor = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 24 + (pulse * 0.3), 0, Math.PI * 2);
    ctx.stroke();

    // Futuristic triangular core geometry (Iron Man Mark VI style)
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 / 3) * i - Math.PI / 2;
      const x = Math.cos(a) * 15;
      const y = Math.sin(a) * 15;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }
}
