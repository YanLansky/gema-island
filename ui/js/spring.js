// Animasi pegas (spring physics).
// Inilah rahasia gerakan yang "hidup": bukan durasi tetap, melainkan
// pegas yang punya kekakuan, redaman, dan sedikit memantul seperti
// Dynamic Island di iPhone. Nilai bisa diubah di tengah gerakan tanpa patah.

export class Spring {
  constructor(value = 0, { stiffness = 340, damping = 28, mass = 1, precision = 0.01 } = {}) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
    this.precision = precision;
  }

  set(target, opts) {
    this.target = target;
    if (opts) Object.assign(this, opts);
  }

  jump(value) {
    this.value = this.target = value;
    this.velocity = 0;
  }

  get done() {
    return Math.abs(this.velocity) < this.precision * 10 && Math.abs(this.target - this.value) < this.precision;
  }

  step(dt) {
    // Sub-langkah kecil supaya stabil walau frame melompat (layar 60/120/144 Hz)
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const force = -this.stiffness * (this.value - this.target);
      const damp = -this.damping * this.velocity;
      const acc = (force + damp) / this.mass;
      this.velocity += acc * h;
      this.value += this.velocity * h;
    }
    if (this.done) {
      this.value = this.target;
      this.velocity = 0;
    }
    return this.value;
  }
}

// Preset gerakan. "bouncy" dipakai saat island melebar, "smooth" saat menyusut.
export const PRESETS = {
  bouncy: { stiffness: 300, damping: 21 },
  smooth: { stiffness: 380, damping: 33 },
  snappy: { stiffness: 520, damping: 38 },
  gentle: { stiffness: 170, damping: 22 },
};

// Satu loop animasi untuk semua pegas; berhenti total saat semuanya diam
// supaya CPU 0% ketika island tidak bergerak.
export class Animator {
  constructor(onFrame) {
    this.springs = new Set();
    this.onFrame = onFrame;
    this.running = false;
    this.last = 0;
    this._tick = this._tick.bind(this);
  }

  add(...springs) {
    springs.forEach((s) => this.springs.add(s));
  }

  kick() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._tick);
  }

  _tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    let busy = false;
    for (const s of this.springs) {
      s.step(dt);
      if (!s.done) busy = true;
    }
    this.onFrame(dt);
    if (busy) requestAnimationFrame(this._tick);
    else this.running = false;
  }
}
