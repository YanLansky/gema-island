// Teman kecil: sepasang mata robot yang muncul saat island sepi.
// Melirik mengikuti kursor, berkedip, mengantuk kalau lama ditinggal,
// marah saat baterai hampir habis, dan senang saat charger dicolok.

export class Mascot {
  constructor(el) {
    this.el = el;
    this.mood = 'normal';
    this.temp = null; // ekspresi sementara { mood, until }
    this.lastMove = Date.now();
    this.power = null;
    this.visible = false;
    this.scheduleBlink();
    setInterval(() => this.refresh(), 5000);
  }

  scheduleBlink() {
    clearTimeout(this.blinkT);
    this.blinkT = setTimeout(() => {
      if (this.visible && !['sleepy', 'happy'].includes(this.current())) {
        this.el.classList.add('blink');
        setTimeout(() => this.el.classList.remove('blink'), 130);
        // Kadang berkedip dua kali
        if (Math.random() < 0.25) setTimeout(() => {
          this.el.classList.add('blink');
          setTimeout(() => this.el.classList.remove('blink'), 110);
        }, 260);
      }
      this.scheduleBlink();
    }, 2500 + Math.random() * 4000);
  }

  setVisible(v) {
    this.visible = v;
    if (v) this.refresh();
  }

  /** Posisi kursor relatif terhadap tengah island (piksel). */
  look(dx, dy) {
    const wasSleepy = this.current() === 'sleepy';
    this.lastMove = Date.now();
    if (wasSleepy) this.flash('happy', 1600);
    const lx = Math.max(-4, Math.min(4, dx / 60));
    const ly = Math.max(-2.5, Math.min(2.5, dy / 50));
    this.el.style.setProperty('--lx', lx.toFixed(2));
    this.el.style.setProperty('--ly', ly.toFixed(2));
  }

  setPower(p) {
    const prev = this.power;
    this.power = p;
    if (prev && p.plugged && !prev.plugged) this.flash('happy', 3000);
    this.refresh();
  }

  flash(mood, ms) {
    this.temp = { mood, until: Date.now() + ms };
    this.refresh();
    clearTimeout(this.tempT);
    this.tempT = setTimeout(() => this.refresh(), ms + 20);
  }

  current() {
    if (this.temp && Date.now() < this.temp.until) return this.temp.mood;
    const p = this.power;
    if (p && p.has_battery && !p.plugged && p.percent <= 20) return p.percent <= 10 ? 'angry flash' : 'angry';
    if (p && p.has_battery && p.plugged && p.percent >= 100) return 'full';
    const h = new Date().getHours();
    const idle = Date.now() - this.lastMove;
    if (idle > 3 * 60 * 1000 || ((h >= 23 || h < 5) && idle > 30 * 1000)) return 'sleepy';
    return 'normal';
  }

  refresh() {
    const m = this.current();
    if (m === this.mood) return;
    this.el.classList.remove(...this.mood.split(' '));
    if (m !== 'normal') this.el.classList.add(...m.split(' '));
    this.mood = m;
  }
}
