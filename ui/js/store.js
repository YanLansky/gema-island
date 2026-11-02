// Pengaturan disimpan di laptopmu (penyimpanan lokal WebView), tidak dikirim ke mana pun.

export const DEFAULTS = {
  mode: 'dynamic', // 'dynamic' (pil melayang) atau 'notch' (menempel di tepi atas)
  scale: 100, // 75–130 (%)
  hideFullscreen: true,
  mascot: true,
  lyricsPill: true, // tampilkan baris lirik di island saat lagu berjalan
  trackToast: true, // kartu kecil saat lagu berganti
  accentFromArt: true,
  clock24: true,
  discord: {
    enabled: false,
    token: '',
    botNames: 'Jockie',
    autoDetect: false,
    userId: '',
    priority: 'discord', // 'discord' atau 'system'
    offsetMs: 600, // bot musik biasanya sedikit terlambat dari pesan "Now Playing"
  },
};

const KEY = 'lansky.settings.v1';

function merge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') out[k] = merge(base[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return merge(DEFAULTS, raw ? JSON.parse(raw) : {});
  } catch {
    return merge(DEFAULTS, {});
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

// Tauri API (ada saat berjalan sebagai aplikasi; tidak ada saat dibuka di browser biasa)
export const tauri = window.__TAURI__ || null;
export const invoke = (cmd, args) => (tauri ? tauri.core.invoke(cmd, args) : Promise.reject(new Error('mode pratinjau')));
export const listen = (ev, fn) => (tauri ? tauri.event.listen(ev, fn) : Promise.resolve(() => {}));
export const emit = (ev, payload) => (tauri ? tauri.event.emit(ev, payload) : Promise.resolve());
