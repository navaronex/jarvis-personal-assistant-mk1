/** Procedural illustration, not a semantic graph or a measurement of model activity.
 * Positions live in 3D and are projected onto a 2D canvas. No external assets. */
export class JarvisCoreVisual {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = "Preparado";
    this.intensity = 0.65;
    this.time = 0;
    this.last = 0;
    this.frame = 0;
    this.motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    this.paused = this.motionQuery.matches;
    this.nodes = Array.from({ length: 180 }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / 180,
        a = i * 2.399963,
        r = Math.sqrt(1 - y * y);
      return {
        x: r * Math.cos(a),
        y: y * 0.9,
        z: r * Math.sin(a),
        warm: i % 7 === 0,
      };
    });
    this.links = [];
    for (let i = 0; i < this.nodes.length; i++)
      for (let j = i + 1; j < this.nodes.length; j++) {
        const a = this.nodes[i],
          b = this.nodes[j];
        if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.32)
          this.links.push([i, j]);
      }
    this.resize = () => {
      const r = canvas.getBoundingClientRect();
      this.w = r.width;
      this.h = r.height;
      const d = Math.min(devicePixelRatio || 1, 1.75);
      canvas.width = Math.round(this.w * d);
      canvas.height = Math.round(this.h * d);
      this.ctx?.setTransform(d, 0, 0, d, 0, 0);
      this.draw();
    };
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    this.visibility = () => this.schedule();
    document.addEventListener("visibilitychange", this.visibility);
    this.motionChange = () => {
      this.setPaused(this.motionQuery.matches);
      document.dispatchEvent(new Event("jarvis-motion-change"));
    };
    this.motionQuery.addEventListener("change", this.motionChange);
    this.tick = (t) => {
      this.frame = 0;
      if (!this.last || t - this.last >= 32) {
        const dt = this.last ? Math.min((t - this.last) / 1000, 0.06) : 0;
        this.time += dt;
        this.last = t;
        this.draw();
      }
      if (!this.paused && !document.hidden)
        this.frame = requestAnimationFrame(this.tick);
    };
    this.schedule();
  }
  setState(state) {
    this.state = state;
    this.draw();
  }
  setIntensity(value) {
    this.intensity = Math.max(0.1, Math.min(1, Number(value) || 0.65));
    this.draw();
  }
  setPaused(value) {
    this.paused = !!value;
    this.schedule();
  }
  schedule() {
    cancelAnimationFrame(this.frame);
    this.last = 0;
    this.frame = 0;
    if (!this.paused && !document.hidden && this.ctx)
      this.frame = requestAnimationFrame(this.tick);
    else this.draw();
  }
  draw() {
    const c = this.ctx;
    if (!c || !this.w || !this.h) return;
    const w = this.w,
      h = this.h,
      x = w / 2,
      y = h * 0.43,
      r = Math.min(h * 0.31, w < 740 ? w * 0.28 : w * 0.205),
      t = this.time;
    c.clearRect(0, 0, w, h);
    c.save();
    c.translate(x, y);
    const activity = this.state === "Preparado" ? 0.35 : 1;
    const pulse = 1 + Math.sin(t * 1.5) * 0.025 * activity;
    const halo = c.createRadialGradient(0, 0, 0, 0, 0, r * 1.9);
    halo.addColorStop(0, "#ff6d271b");
    halo.addColorStop(0.4, "#a7354415");
    halo.addColorStop(0.65, "#00b7ff0a");
    halo.addColorStop(1, "#03071200");
    c.fillStyle = halo;
    c.fillRect(-r * 2, -r * 2, r * 4, r * 4);
    c.globalAlpha = this.intensity;
    // Quiet reference marks and orbit: depth cues without decorative numeric telemetry.
    c.strokeStyle = "#24748770";
    c.lineWidth = 0.7;
    c.setLineDash([2, 9]);
    c.beginPath();
    c.ellipse(0, r * 0.14, r * 1.48, r * 0.39, -0.12, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * r * 1.24, Math.sin(a) * r * 1.24);
      c.lineTo(Math.cos(a) * r * 1.32, Math.sin(a) * r * 1.32);
      c.stroke();
    }
    // Warm plasma filaments within the cool network envelope.
    c.globalCompositeOperation = "lighter";
    for (let k = 0; k < 21; k++) {
      c.beginPath();
      for (let n = 0; n <= 100; n++) {
        const a = (n / 100) * Math.PI * 2;
        const wave =
          Math.sin(a * 3 + k * 0.71 + t * 0.32) * 0.09 +
          Math.sin(a * 7 - k + t * 0.2) * 0.045;
        const radius = r * (0.39 + k * 0.013 + wave) * pulse;
        const px = Math.cos(a) * radius,
          py = Math.sin(a) * radius * 0.92;
        if (n === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
      c.strokeStyle = k % 4 === 0 ? "#ffce8170" : "#ff692f32";
      c.lineWidth = k % 4 === 0 ? 1 : 0.7;
      c.stroke();
    }
    const angle = t * 0.075,
      ca = Math.cos(angle),
      sa = Math.sin(angle);
    const points = this.nodes.map((n) => {
      const xx = n.x * ca + n.z * sa,
        zz = n.z * ca - n.x * sa,
        scale = 2.9 / (2.9 - zz * 0.5);
      return { x: xx * r * scale, y: n.y * r * scale, z: zz, warm: n.warm };
    });
    for (const [i, j] of this.links) {
      const a = points[i],
        b = points[j];
      c.strokeStyle = a.warm ? "#ed5fc9" : "#00cce9";
      c.globalAlpha = this.intensity * (0.08 + (a.z + b.z + 2) * 0.05);
      c.lineWidth = 0.65;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    for (const p of points.sort((a, b) => a.z - b.z)) {
      c.globalAlpha = this.intensity * (0.4 + (p.z + 1) * 0.28);
      c.fillStyle = p.warm ? "#ffa7e3" : "#91f7ff";
      c.beginPath();
      c.arc(p.x, p.y, p.z > 0.3 ? 1.75 : 1, 0, Math.PI * 2);
      c.fill();
      if (p.z > 0.7) {
        c.globalAlpha = this.intensity * 0.12;
        c.beginPath();
        c.arc(p.x, p.y, 5, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = this.intensity;
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, r * 0.42);
    glow.addColorStop(0, "#ffe1af70");
    glow.addColorStop(0.18, "#ff9c4530");
    glow.addColorStop(1, "#ff650000");
    c.fillStyle = glow;
    c.fillRect(-r * 0.5, -r * 0.5, r, r);
    c.restore();
  }
  destroy() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.motionQuery.removeEventListener("change", this.motionChange);
  }
}
