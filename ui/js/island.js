// Lansky Island: otak tampilan island.
// Menggabungkan sumber lagu (media Windows + bot Discord), lirik,
// animasi pegas, robot mata, dan area klik yang dikirim ke Rust.

import { Spring, Animator, PRESETS } from './spring.js';
import { findLyrics, indexAt, splitArtistTitle } from './lyrics.js';
import { DiscordBridge } from './discord.js';
import { Mascot } from './mascot.js';
import { loadSettings, saveSettings, invoke, listen, emit, tauri } from './store.js';

const WIN_W = 820;
const $ = (id) => document.getElementById(id);
const shell = $('shell');
const island = $('island');
const layers = Object.fromEntries([...document.querySelectorAll('.layer')].map((l) => [l.dataset.view, l]));

// ---------- Ikon (garis sederhana buatan sendiri) ----------
const svg = (p, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="currentColor" aria-hidden="true">${p}</svg>`;
const ICON = {
  play: svg('<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>'),
  pause: svg('<rect x="6.5" y="5" width="4" height="14" rx="1.3"/><rect x="13.5" y="5" width="4" height="14" rx="1.3"/>'),
  next: svg('<path d="M5 6.2v11.6a.8.8 0 0 0 1.25.66L14 13.3v4.5a.8.8 0 0 0 1.25.66l7.5-5.8a.8.8 0 0 0 0-1.32l-7.5-5.8A.8.8 0 0 0 14 6.2v4.5L6.25 5.54A.8.8 0 0 0 5 6.2z" transform="translate(-1.5 0)"/>'),
  prev: svg('<path d="M19 6.2v11.6a.8.8 0 0 1-1.25.66L10 13.3v4.5a.8.8 0 0 1-1.25.66l-7.5-5.8a.8.8 0 0 1 0-1.32l7.5-5.8A.8.8 0 0 1 10 6.2v4.5l7.75-5.16A.8.8 0 0 1 19 6.2z" transform="translate(1.5 0)"/>'),
  music: svg('<path d="M9 17.5a2.5 2.5 0 1 1-2.5-2.5c.36 0 .7.07 1 .2V6.3a1 1 0 0 1 .76-.97l9-2.2A1 1 0 0 1 18.5 4.1V15.5a2.5 2.5 0 1 1-2.5-2.5c.36 0 .7.07 1 .2V8.1l-8 1.95z"/>'),
  today: svg('<path d="M7 2.8a.9.9 0 0 1 1.8 0V4h6.4V2.8a.9.9 0 0 1 1.8 0V4H18a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1zM4.8 9.5V18c0 .66.54 1.2 1.2 1.2h12c.66 0 1.2-.54 1.2-1.2V9.5z"/>'),
  gear: svg('<path d="M10.3 2.6a1.8 1.8 0 0 1 3.4 0l.3.9a1.8 1.8 0 0 0 2.4 1l.9-.4a1.8 1.8 0 0 1 2.4 2.4l-.4.9a1.8 1.8 0 0 0 1 2.4l.9.3a1.8 1.8 0 0 1 0 3.4l-.9.3a1.8 1.8 0 0 0-1 2.4l.4.9a1.8 1.8 0 0 1-2.4 2.4l-.9-.4a1.8 1.8 0 0 0-2.4 1l-.3.9a1.8 1.8 0 0 1-3.4 0l-.3-.9a1.8 1.8 0 0 0-2.4-1l-.9.4a1.8 1.8 0 0 1-2.4-2.4l.4-.9a1.8 1.8 0 0 0-1-2.4l-.9-.3a1.8 1.8 0 0 1 0-3.4l.9-.3a1.8 1.8 0 0 0 1-2.4l-.4-.9A1.8 1.8 0 0 1 6.7 4.1l.9.4a1.8 1.8 0 0 0 2.4-1zM12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>'),
  vol: svg('<path d="M11 5.2v13.6a.9.9 0 0 1-1.5.67L5.7 16H3.5A1.5 1.5 0 0 1 2 14.5v-5A1.5 1.5 0 0 1 3.5 8h2.2l3.8-3.47A.9.9 0 0 1 11 5.2z"/><path d="M15 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  mute: svg('<path d="M11 5.2v13.6a.9.9 0 0 1-1.5.67L5.7 16H3.5A1.5 1.5 0 0 1 2 14.5v-5A1.5 1.5 0 0 1 3.5 8h2.2l3.8-3.47A.9.9 0 0 1 11 5.2z"/><path d="M15.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  bolt: svg('<path d="M13.2 2.5 5.6 13.1a.6.6 0 0 0 .5.95H11l-1.3 7.2a.4.4 0 0 0 .72.3l7.9-10.9a.6.6 0 0 0-.49-.95H13l1-6.9a.4.4 0 0 0-.8-.3z"/>'),
  battery: svg('<rect x="2" y="7" width="17" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="20" y="10" width="2" height="4" rx="1"/><rect x="4" y="9" width="8" height="6" rx="1.2"/>'),
};

document.querySelector('[data-act="prev"]').innerHTML = ICON.prev;
document.querySelector('[data-act="next"]').innerHTML = ICON.next;
document.querySelector('.tabbar [data-tab="music"]').innerHTML = ICON.music;
document.querySelector('.tabbar [data-tab="today"]').innerHTML = ICON.today;
$('gear').innerHTML = ICON.gear;

// ---------- Keadaan ----------
let S = loadSettings();
const st = {
  view: 'idle',
  hover: false,
  expanded: false,
  tab: 'music',
  fullscreen: false,
  power: null,
  sys: null,
  sysArt: null,
  disc: null,
  trackKey: null,
  lyr: { key: null, status: 'none', lines: null, plain: null, idx: -1 },
  pillText: '',
  hud: null,
  toastUntil: 0,
  pausedSince: 0,
  discordStatus: { state: 'off', detail: 'Nonaktif' },
  lowWarned: 100,
};

// ---------- Pegas geometri ----------
const sw = new Spring(132, PRESETS.bouncy);
const sh = new Spring(32, PRESETS.bouncy);
const sr = new Spring(16, PRESETS.smooth);
const sy = new Spring(8, PRESETS.smooth);
const so = new Spring(1, PRESETS.smooth);
const lyrY = new Spring(0, PRESETS.gentle);
const anim = new Animator(applyFrame);
anim.add(sw, sh, sr, sy, so, lyrY);

const lyricsList = $('lyricsList');

function applyFrame() {
  const s = S.scale / 100;
  const w = sw.value;
  const h = Math.max(0, sh.value);
  shell.style.zoom = s;
  shell.style.width = `${w}px`;
  shell.style.height = `${h}px`;
  shell.style.left = `${WIN_W / 2 / s - w / 2}px`;
  shell.style.top = `${sy.value}px`;
  // Sedikit "kenyal": saat melebar cepat island agak memipih, lalu kembali
  const k = Math.max(-0.05, Math.min(0.05, sw.velocity / 14000));
  const away = (1 - so.value) * -46;
  shell.style.transform = `translateY(${away}px) scale(${1 + k * 0.35}, ${1 - k})`;
  shell.style.opacity = Math.max(0, Math.min(1, so.value * 1.4));
  const r = Math.max(0, Math.min(sr.value, h / 2));
  island.style.borderRadius = S.mode === 'notch' ? `0 0 ${r}px ${r}px` : `${r}px`;
  lyricsList.style.transform = `translateY(${lyrY.value}px)`;
}

function measureText(t) {
  const m = $('measure');
  m.textContent = t;
  return m.offsetWidth;
}

function geometry(view) {
  const notch = S.mode === 'notch';
  const y = notch ? 0 : 8;
  let g;
  switch (view) {
    case 'idle':
      g = notch ? { w: 190, h: 32, r: 13 } : { w: 132, h: 32, r: 16 };
      break;
    case 'compact': {
      let w = notch ? 250 : 236;
      if (st.pillText) w = Math.max(w, Math.min(560, measureText(st.pillText) + 92));
      g = { w, h: 34, r: notch ? 14 : 17 };
      break;
    }
    case 'toast':
      g = { w: 384, h: 74, r: notch ? 24 : 28 };
      break;
    case 'hud':
      g = { w: 300, h: 40, r: notch ? 16 : 20 };
      break;
    case 'expanded':
      g = { w: 620, h: 240, r: notch ? 30 : 36 };
      break;
    case 'hidden':
    default:
      g = notch ? { w: 190, h: 32, r: 13 } : { w: 132, h: 32, r: 16 };
      return { ...g, y, o: 0 };
  }
  return { ...g, y, o: 1 };
}

// ---------- Area klik untuk Rust ----------
let rectTimer = null;
function sendRects(g, union = true) {
  const s = S.scale / 100;
  const pad = 6;
  let w = g.w;
  let h = g.y + g.h;
  if (union) {
    w = Math.max(w, sw.value);
    h = Math.max(h, sy.value + sh.value);
  }
  let rects = [{ x: WIN_W / 2 - (w * s) / 2 - pad, y: 0, w: w * s + pad * 2, h: h * s + pad }];
  if (g.o === 0) rects = [{ x: WIN_W / 2 - 110, y: 0, w: 220, h: 5 }]; // sentuh tepi atas untuk memunculkan
  currentRects = rects;
  if (tauri) invoke('set_hit_rects', { rects }).catch(() => {});
}
let currentRects = [];

// ---------- Memilih tampilan ----------
function computeView() {
  const now = Date.now();
  if (st.fullscreen && S.hideFullscreen && !st.hover) return 'hidden';
  if (st.expanded) return 'expanded';
  if (st.hud && now < st.hud.until) return 'hud';
  const t = currentTrack();
  if (t && now < st.toastUntil) return 'toast';
  if (t && (t.playing || now - st.pausedSince < 4 * 60 * 1000)) return 'compact';
  return 'idle';
}

function setView(force = false) {
  const view = computeView();
  const g = geometry(view);
  const changed = view !== st.view;
  if (!changed && !force) {
    // Lebar compact bisa berubah mengikuti baris lirik
    if (view === 'compact' && Math.abs(sw.target - g.w) > 1) {
      sw.set(g.w, PRESETS.bouncy);
      layers.compact.style.width = `${g.w}px`;
      sendRects(g);
      anim.kick();
    }
    return;
  }
  const growing = g.w * g.h > sw.target * sh.target;
  const p = growing ? PRESETS.bouncy : PRESETS.smooth;
  sw.set(g.w, p);
  sh.set(g.h, growing ? { stiffness: p.stiffness * 0.9, damping: p.damping + 1 } : p);
  sr.set(g.r, PRESETS.smooth);
  sy.set(g.y, PRESETS.smooth);
  so.set(g.o, PRESETS.smooth);
  st.view = view;

  for (const [name, el] of Object.entries(layers)) {
    const on = name === view;
    if (on) {
      el.style.width = `${g.w}px`;
      el.style.height = `${g.h}px`;
    }
    el.classList.toggle('on', on);
  }
  shell.classList.toggle('away', view === 'hidden');
  mascot.setVisible(view === 'idle');
  if (view === 'expanded') renderExpanded();
  sendRects(g);
  clearTimeout(rectTimer);
  rectTimer = setTimeout(() => sendRects(geometry(st.view), false), 650);
  anim.kick();
}

// ---------- Sumber lagu ----------
function appName(id = '') {
  const s = id.toLowerCase();
  if (s.includes('spotify')) return 'Spotify';
  if (s.includes('chrome')) return 'Chrome';
  if (s.includes('msedge') || s.includes('edge')) return 'Edge';
  if (s.includes('firefox')) return 'Firefox';
  if (s.includes('opera')) return 'Opera';
  if (s.includes('brave')) return 'Brave';
  if (s.includes('applemusic') || s.includes('apple music')) return 'Apple Music';
  if (s.includes('zunemusic') || s.includes('mediaplayer')) return 'Media Player';
  if (s.includes('youtube')) return 'YouTube Music';
  const last = id.split(/[!\\/]/).pop() || id;
  return last.replace(/\.exe$/i, '') || 'Pemutar';
}

function discPos(d, now = Date.now()) {
  return d.playing ? d.anchorPos + (now - d.anchorAt) : d.anchorPos;
}

function discActive(d) {
  if (!d || !d.active) return false;
  const pos = discPos(d);
  if (d.durationMs > 0) return pos < d.durationMs + 4000;
  return Date.now() - d.anchorAt < 15 * 60 * 1000;
}

function currentTrack() {
  const d = discActive(st.disc) ? st.disc : null;
  const sys = st.sys && st.sys.active ? st.sys : null;
  const useDisc = d && (S.discord.priority === 'discord' || !sys || !sys.playing);
  if (useDisc) {
    return {
      source: 'discord',
      key: `d:${d.title}|${d.artist}|${d.startedAt}`,
      lyricKey: `d:${d.title}|${d.artist}`,
      title: d.title,
      artist: d.artist,
      album: '',
      art: d.art,
      playing: d.playing,
      durationMs: d.durationMs,
      pos: () => discPos(d),
      canSeek: false,
      app: `Discord${d.guild ? ' · ' + d.guild : ''}`,
    };
  }
  if (sys) {
    const art = st.sysArt && st.sysArt.track_key === sys.track_key ? st.sysArt.data_url : null;
    return {
      source: 'system',
      key: sys.track_key,
      lyricKey: sys.track_key,
      title: sys.title,
      artist: sys.artist,
      album: sys.album,
      art,
      playing: sys.playing,
      durationMs: sys.duration_ms,
      pos: () => (sys.playing ? sys.position_ms + (Date.now() - sys.sent_at) : sys.position_ms),
      canSeek: sys.duration_ms > 0,
      app: appName(sys.app),
    };
  }
  return null;
}

// ---------- Warna aksen dari sampul ----------
function accentFrom(img) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 24;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 24, 24);
    const d = x.getImageData(0, 0, 24, 24).data;
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max ? (max - min) / max : 0;
      const light = max / 255;
      const score = sat * (light > 0.25 ? 1 : 0.2) * (light < 0.95 ? 1 : 0.5);
      if (score > bestScore) { bestScore = score; best = [r, g, b]; }
    }
    if (!best || bestScore < 0.18) return null;
    // Cerahkan supaya terbaca di atas hitam
    const [r, g, b] = best;
    const m = Math.max(r, g, b) || 1;
    const f = Math.max(1, 200 / m);
    return `rgb(${Math.min(255, r * f) | 0}, ${Math.min(255, g * f) | 0}, ${Math.min(255, b * f) | 0})`;
  } catch {
    return null;
  }
}

const PLACEHOLDER_ART =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="#1d1e22"/><path d="M17 26.5a3 3 0 1 1-3-3c.35 0 .69.06 1 .17V13.4l11-2.6v12.7a3 3 0 1 1-2-2.83v-6.5l-7 1.66z" fill="#5b5e68"/></svg>');

let lastArt = null;
function setArt(src) {
  const url = src || PLACEHOLDER_ART;
  if (url === lastArt) return;
  lastArt = url;
  for (const id of ['artMini', 'artToast', 'artBig']) $(id).src = url;
  if (!src || !S.accentFromArt) {
    document.documentElement.style.setProperty('--accent', '#8fa8ff');
    return;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const a = accentFrom(img);
    document.documentElement.style.setProperty('--accent', a || '#8fa8ff');
  };
  img.src = url;
}

// ---------- Lirik ----------
async function loadLyrics(t) {
  const key = t.lyricKey;
  st.lyr = { key, status: 'loading', lines: null, plain: null, idx: -1 };
  setPillLine('');
  renderLyrics();
  let r;
  if (!tauri) r = demoLyrics();
  else {
    try {
      r = await findLyrics(invoke, {
        title: t.title,
        artist: t.artist,
        album: t.album,
        durationMs: t.durationMs,
        trustDuration: t.source !== 'discord',
      });
    } catch (e) {
      r = { synced: null, plain: null, error: String(e) };
    }
    // Catatan pencarian terakhir, ditampilkan di Pengaturan untuk memeriksa
    const info = {
      at: Date.now(),
      source: t.source,
      title: t.title,
      artist: t.artist,
      searched: r.searched || '',
      found: r.source || null,
      nearest: r.nearest || null,
      candidates: r.candidates ?? 0,
      error: r.error || null,
      kind: r.synced ? 'synced' : r.plain ? 'plain' : 'none',
    };
    try {
      localStorage.setItem('lansky.lyrics.last', JSON.stringify(info));
    } catch {}
    emit('lyrics-debug', info);
  }
  if (st.lyr.key !== key) return;
  st.lyr = {
    key,
    status: r.synced ? 'synced' : r.plain ? 'plain' : r.instrumental ? 'instrumental' : 'none',
    lines: r.synced,
    plain: r.plain,
    idx: -1,
    searched: r.searched || '',
    error: r.error || null,
  };
  renderLyrics();
  tick();
}

function renderLyrics() {
  const L = st.lyr;
  const msg = $('lyricsMsg');
  lyricsList.innerHTML = '';
  lyricsList.classList.toggle('plain', L.status === 'plain');
  lyrY.jump(0);
  msg.textContent =
    L.status === 'loading' ? 'Mencari lirik…' :
    L.status === 'none' ? (L.error ? L.error : `Lirik tidak ditemukan${L.searched ? `\nDicari: ${L.searched}` : ''}`) :
    L.status === 'instrumental' ? 'Instrumental ♪' : '';
  if (L.status === 'synced') {
    const frag = document.createDocumentFragment();
    L.lines.forEach((ln, i) => {
      const p = document.createElement('p');
      p.textContent = ln.text || '♪';
      p.dataset.i = i;
      frag.appendChild(p);
    });
    lyricsList.appendChild(frag);
    lyrY.jump(40);
  } else if (L.status === 'plain') {
    const frag = document.createDocumentFragment();
    L.plain.split(/\r?\n/).forEach((t) => {
      const p = document.createElement('p');
      p.textContent = t || ' ';
      frag.appendChild(p);
    });
    lyricsList.appendChild(frag);
  }
  applyFrame();
}

function updateLyricIndex(pos) {
  const L = st.lyr;
  if (L.status !== 'synced') return;
  const idx = indexAt(L.lines, pos + 200);
  if (idx === L.idx) return;
  const prev = L.idx;
  L.idx = idx;
  const ps = lyricsList.children;
  if (prev >= 0 && ps[prev]) ps[prev].classList.remove('now');
  for (const el of lyricsList.querySelectorAll('.near')) el.classList.remove('near');
  if (idx >= 0 && ps[idx]) {
    ps[idx].classList.add('now');
    if (ps[idx + 1]) ps[idx + 1].classList.add('near');
    if (ps[idx - 1]) ps[idx - 1].classList.add('near');
    const box = $('lyrics').clientHeight || 180;
    const el = ps[idx];
    lyrY.set(box * 0.4 - (el.offsetTop + el.offsetHeight / 2), PRESETS.gentle);
  } else {
    lyrY.set(40, PRESETS.gentle);
  }
  anim.kick();
  setPillLine(idx >= 0 ? L.lines[idx].text || '♪' : '');
}

function setPillLine(text) {
  const t = S.lyricsPill && st.lyr.status === 'synced' ? text : '';
  if (t === st.pillText) return;
  st.pillText = t;
  const box = $('pillLyric');
  const cur = box.querySelector('.cur');
  const old = box.querySelector('.old');
  old.textContent = cur.textContent;
  old.style.transition = 'none';
  old.style.opacity = '1';
  old.style.transform = 'none';
  old.style.filter = 'none';
  cur.textContent = t;
  cur.classList.add('enter');
  void box.offsetWidth;
  old.style.transition = '';
  old.style.opacity = '';
  old.style.transform = '';
  old.style.filter = '';
  cur.classList.remove('enter');
  setView();
}

// ---------- Isi tampilan ----------
function fmt(ms) {
  if (!(ms >= 0) || !isFinite(ms)) return '0:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

let lastTitleKey = '';
function renderTrackInfo(t) {
  island.classList.toggle('playing', !!t?.playing);
  island.classList.toggle('paused', !!t && !t.playing);
  island.classList.toggle('discord', t?.source === 'discord');
  island.classList.toggle('no-seek', !t?.canSeek);
  document.querySelector('[data-act="toggle"]').innerHTML = t?.playing ? ICON.pause : ICON.play;
  if (!t) return;
  setArt(t.art);
  const tk = `${t.title}|${t.artist}|${t.app}`;
  if (tk !== lastTitleKey) {
    lastTitleKey = tk;
    const disp = t.source === 'discord' ? splitArtistTitle(t.title, t.artist) : { title: t.title, artist: t.artist };
    const shownTitle = t.source === 'discord' && !t.artist ? disp.title || t.title : t.title;
    const shownArtist = t.source === 'discord' && !t.artist ? disp.artist : t.artist;
    const span = $('npTitle').querySelector('span');
    span.textContent = shownTitle;
    $('npArtist').textContent = shownArtist || '';
    $('toastTitle').textContent = shownTitle;
    $('toastArtist').textContent = shownArtist || t.app;
    $('npSource').innerHTML = `<i class="dot"></i>${escapeHtml(t.app)}`;
    requestAnimationFrame(() => {
      const box = $('npTitle');
      const over = span.scrollWidth - box.clientWidth;
      box.classList.toggle('marquee', over > 4);
      box.style.setProperty('--mqx', `${-(over + 40)}px`);
      box.style.setProperty('--mq', `${Math.max(6, (over + 40) / 22)}s`);
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderProgress(t) {
  if (!t || st.view !== 'expanded') return;
  const pos = Math.max(0, t.pos());
  const dur = t.durationMs;
  $('tNow').textContent = fmt(pos);
  $('tLeft').textContent = dur > 0 ? `-${fmt(Math.max(0, dur - pos))}` : '';
  const pct = dur > 0 ? Math.min(100, (pos / dur) * 100) : 0;
  $('seekFill').style.width = `${pct}%`;
  $('seekKnob').style.left = `${pct}%`;
}

function renderToday() {
  const now = new Date();
  const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: !S.clock24 });
  $('bigClock').textContent = timeFmt.format(now);
  $('todayDate').textContent = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const chips = [];
  const p = st.power;
  if (p && p.has_battery) chips.push(`<span class="${p.percent <= 20 && !p.plugged ? 'warn' : ''}">${p.plugged ? '⚡' : '🔋'} ${p.percent}%${p.charging ? ' · mengisi' : ''}</span>`);
  const ds = st.discordStatus;
  if (S.discord.enabled) {
    const cls = ds.state === 'ready' ? 'ok' : ds.state === 'error' ? 'warn' : '';
    const label = ds.state === 'ready' ? `Discord tersambung${ds.bot ? ' · ' + escapeHtml(ds.bot) : ''}` : ds.state === 'error' ? 'Discord bermasalah' : 'Discord menyambung…';
    chips.push(`<span class="${cls}">● ${label}</span>`);
  }
  const t = currentTrack();
  if (t) chips.push(`<span>♪ ${escapeHtml(t.title).slice(0, 40)}</span>`);
  $('todayChips').innerHTML = chips.join('');
}

function renderMiniClock() {
  const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: !S.clock24 });
  $('miniClock').textContent = timeFmt.format(new Date());
}

function renderExpanded() {
  const t = currentTrack();
  if (!t && st.tab === 'music' && !st.tabPinned) st.tab = 'today';
  selectTab(st.tab, true);
  renderTrackInfo(t);
  renderProgress(t);
  renderToday();
  if (!t) {
    $('npTitle').querySelector('span').textContent = 'Tidak ada yang diputar';
    $('npArtist').textContent = 'Putar lagu di Spotify, YouTube, atau lewat bot Discord';
    $('npSource').innerHTML = '';
    lastTitleKey = '';
    setArt(null);
  }
}

const TAB_ORDER = ['music', 'today'];
function selectTab(tab, silent = false) {
  const prevI = TAB_ORDER.indexOf(st.tab);
  const nextI = TAB_ORDER.indexOf(tab);
  st.tab = tab;
  for (const p of document.querySelectorAll('.page')) {
    const i = TAB_ORDER.indexOf(p.dataset.tab);
    p.classList.toggle('on', p.dataset.tab === tab);
    p.classList.toggle('left', i < nextI);
  }
  for (const b of document.querySelectorAll('.tabbar [data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
  if (!silent && prevI !== nextI) st.tabPinned = true;
}

// ---------- Detak utama (ringan, 4x per detik) ----------
function tick() {
  const now = Date.now();
  const t = currentTrack();

  if ((t?.key || null) !== st.trackKey) {
    const hadTrack = !!st.trackKey;
    st.trackKey = t?.key || null;
    if (t) {
      if (st.lyr.key !== t.lyricKey) loadLyrics(t);
      if (S.trackToast && (hadTrack || t.playing) && !st.expanded) st.toastUntil = now + 2600;
    } else {
      st.lyr = { key: null, status: 'none', lines: null, plain: null, idx: -1 };
      setPillLine('');
    }
    lastTitleKey = '';
  }
  if (t && !t.playing && !st.pausedSince) st.pausedSince = now;
  if (t && t.playing) st.pausedSince = 0;

  renderTrackInfo(t);
  if (t) {
    const pos = t.pos();
    updateLyricIndex(pos);
    renderProgress(t);
  }
  if (st.view === 'expanded' && st.tab === 'today') renderToday();
  if (st.view === 'idle') renderMiniClock();
  setView();
}

let tickTimer = null;
function scheduleTick() {
  clearTimeout(tickTimer);
  const t = currentTrack();
  tick();
  const fast = (t && t.playing) || st.view === 'expanded' || (st.hud && Date.now() < st.hud.until) || Date.now() < st.toastUntil;
  tickTimer = setTimeout(scheduleTick, fast ? 250 : 1000);
}

// ---------- Kursor ----------
let hoverT = null;
let leaveT = null;
function onPointer({ x, y, inside }) {
  const s = S.scale / 100;
  mascot.look(x - WIN_W / 2, y - (sy.value + sh.value / 2) * s);
  if (inside === st.hover) return;
  st.hover = inside;
  clearTimeout(hoverT);
  clearTimeout(leaveT);
  if (inside) {
    // Muncul dulu kalau sedang bersembunyi, lalu terbuka
    setView();
    hoverT = setTimeout(() => {
      st.expanded = true;
      st.tabPinned = false;
      st.tab = currentTrack() ? 'music' : 'today';
      st.toastUntil = 0;
      setView();
      scheduleTick();
    }, st.view === 'hidden' ? 350 : 110);
  } else {
    leaveT = setTimeout(() => {
      st.expanded = false;
      setView();
    }, 260);
  }
}

// ---------- Interaksi ----------
document.querySelectorAll('.ctl').forEach((b) =>
  b.addEventListener('click', async () => {
    const act = b.dataset.act;
    if (st.sys && act === 'toggle') {
      st.sys.playing = !st.sys.playing;
      st.sys.sent_at = Date.now();
      tick();
    }
    invoke('media_control', { action: act, positionMs: null }).catch(() => {});
  })
);

$('seek').addEventListener('click', (e) => {
  const t = currentTrack();
  if (!t || !t.canSeek) return;
  const r = e.currentTarget.getBoundingClientRect();
  const ms = Math.round(((e.clientX - r.left) / r.width) * t.durationMs);
  if (st.sys) {
    st.sys.position_ms = ms;
    st.sys.sent_at = Date.now();
  }
  st.lyr.idx = -2;
  invoke('media_control', { action: 'seek', positionMs: ms }).catch(() => {});
  tick();
});

lyricsList.addEventListener('click', (e) => {
  const p = e.target.closest('p[data-i]');
  const t = currentTrack();
  if (!p || !t || st.lyr.status !== 'synced') return;
  const lineT = st.lyr.lines[+p.dataset.i].t;
  if (t.source === 'discord' && st.disc) {
    // Klik baris = "baris ini sedang dinyanyikan sekarang" → atur ulang sinkron
    st.disc.anchorPos += lineT - discPos(st.disc);
  } else if (t.canSeek) {
    st.sys.position_ms = lineT;
    st.sys.sent_at = Date.now();
    invoke('media_control', { action: 'seek', positionMs: Math.max(0, lineT) }).catch(() => {});
  }
  st.lyr.idx = -2;
  tick();
});

document.querySelectorAll('[data-off]').forEach((b) =>
  b.addEventListener('click', () => {
    const off = +b.dataset.off;
    if (st.disc) st.disc.anchorPos += off;
    S.discord.offsetMs = (S.discord.offsetMs || 0) + off;
    saveSettings(S);
    st.lyr.idx = -2;
    tick();
  })
);

document.querySelectorAll('.tabbar [data-tab]').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
$('gear').addEventListener('click', () => invoke('open_settings').catch(() => {}));

let wheelAcc = 0;
let volCache = null;
island.addEventListener(
  'wheel',
  async (e) => {
    e.preventDefault();
    // Geser horizontal di island terbuka = pindah tab
    if (st.view === 'expanded' && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      wheelAcc += e.deltaX;
      if (Math.abs(wheelAcc) > 60) {
        const i = TAB_ORDER.indexOf(st.tab) + Math.sign(wheelAcc);
        if (TAB_ORDER[i]) selectTab(TAB_ORDER[i]);
        wheelAcc = 0;
      }
      return;
    }
    // Scroll vertikal = volume
    if (!tauri) return;
    try {
      if (!volCache) volCache = await invoke('get_volume');
      const step = e.deltaY < 0 ? 0.04 : -0.04;
      volCache = await invoke('set_volume', { level: Math.max(0, Math.min(1, volCache.level + step)) });
      showHud(volCache.muted || volCache.level === 0 ? 'mute' : 'vol', volCache.level);
      clearTimeout(island._vt);
      island._vt = setTimeout(() => (volCache = null), 2000);
    } catch {}
  },
  { passive: false }
);

function showHud(icon, value, label) {
  if (st.expanded) return;
  st.hud = { until: Date.now() + 1500 };
  $('hudIcon').innerHTML = ICON[icon] || '';
  $('hudFill').style.width = `${Math.round(value * 100)}%`;
  $('hudFill').style.background = icon === 'battery' && value <= 0.2 ? '#ff5a5f' : icon === 'bolt' ? '#4ade80' : '';
  $('hudVal').textContent = label || `${Math.round(value * 100)}`;
  setView();
  scheduleTick();
}

// ---------- Mode & pengaturan ----------
function applySettings() {
  document.body.classList.toggle('notch', S.mode === 'notch');
  document.body.classList.toggle('dynamic', S.mode !== 'notch');
  document.body.classList.toggle('no-mascot', !S.mascot);
  setView(true);
  applyFrame();
}

// ---------- Discord ----------
const bridge = new DiscordBridge({
  onTrack(ev) {
    const now = Date.now();
    const off = S.discord.offsetMs || 0;
    if (ev.kind === 'play') {
      st.disc = {
        active: true,
        title: ev.title,
        artist: ev.artist,
        art: ev.art,
        guild: ev.guild,
        durationMs: ev.durationMs,
        startedAt: ev.startedAt,
        playing: true,
        anchorPos: (ev.positionMs || 0) + off,
        anchorAt: Math.min(ev.startedAt, now),
      };
    } else if (!st.disc) {
      return;
    } else if (ev.kind === 'stop') {
      st.disc.active = false;
    } else if (ev.kind === 'pause') {
      st.disc.anchorPos = discPos(st.disc);
      st.disc.anchorAt = now;
      st.disc.playing = false;
    } else if (ev.kind === 'resume') {
      st.disc.anchorAt = now;
      st.disc.playing = true;
    } else if (ev.kind === 'sync') {
      st.disc.anchorPos = ev.positionMs + off;
      st.disc.anchorAt = ev.at;
    }
    st.lyr.idx = -2;
    scheduleTick();
  },
  onStatus(s) {
    st.discordStatus = s;
    emit('discord-status', s);
  },
  onDebug(d) {
    try {
      localStorage.setItem('lansky.discord.last', JSON.stringify(d));
    } catch {}
    emit('discord-debug', d);
  },
});

// ---------- Robot ----------
const mascot = new Mascot($('mascot'));

// ---------- Sambungan ke Rust ----------
if (tauri) {
  listen('media', (e) => {
    st.sys = e.payload;
    scheduleTick();
  });
  listen('media-art', (e) => {
    st.sysArt = e.payload;
    scheduleTick();
  });
  listen('pointer', (e) => onPointer(e.payload));
  listen('fullscreen', (e) => {
    st.fullscreen = !!e.payload;
    setView();
  });
  listen('power', (e) => {
    const prev = st.power;
    const p = e.payload;
    st.power = p;
    mascot.setPower(p);
    if (prev && p.has_battery) {
      if (p.plugged && !prev.plugged) showHud('bolt', p.percent / 100, `${p.percent}%`);
      if (!p.plugged && p.percent <= 20 && st.lowWarned > 20) { st.lowWarned = 20; showHud('battery', p.percent / 100, `${p.percent}%`); }
      if (!p.plugged && p.percent <= 10 && st.lowWarned > 10) { st.lowWarned = 10; showHud('battery', p.percent / 100, `${p.percent}%`); }
      if (p.plugged) st.lowWarned = 100;
    }
  });
  listen('settings-changed', () => {
    S = loadSettings();
    bridge.configure({ ...S.discord });
    applySettings();
    scheduleTick();
  });
  listen('discord-request-status', () => emit('discord-status', st.discordStatus));
  listen('discord-reconnect', () => {
    bridge.cfg = null;
    bridge.configure({ ...S.discord });
  });
  invoke('power_status').then((p) => {
    st.power = p;
    mascot.setPower(p);
  }).catch(() => {});
} else {
  startPreview();
}

applySettings();
bridge.configure({ ...S.discord });
scheduleTick();

// ---------- Mode pratinjau (dibuka di browser biasa, tanpa aplikasi) ----------
function demoLyrics() {
  // Lirik contoh karangan sendiri, hanya untuk pratinjau tampilan
  const lines = [
    'Lampu kota mulai menyala pelan',
    'Kutulis namamu di kaca jendela',
    'Hujan turun, tapi kita tetap tertawa',
    'Suara temanku di voice channel',
    'Lagu yang sama, di kota berbeda',
    'Island kecil ikut bernyanyi',
    'Baris demi baris menyala',
    'Sampai pagi datang menyapa',
  ];
  return { synced: lines.map((text, i) => ({ t: 2000 + i * 3200, text })), plain: null, instrumental: false };
}

function startPreview() {
  document.body.classList.add('preview');
  const started = Date.now();
  st.sys = {
    active: true,
    app: 'Pratinjau',
    title: 'Lampu Kota',
    artist: 'Lansky Island (contoh)',
    album: '',
    playing: true,
    position_ms: 0,
    duration_ms: 30000,
    track_key: 'demo',
    sent_at: started,
  };
  setInterval(() => {
    // Ulangi lagu contoh setiap 30 detik
    const pos = st.sys.playing ? st.sys.position_ms + (Date.now() - st.sys.sent_at) : st.sys.position_ms;
    if (pos > 30000) {
      st.sys.position_ms = 0;
      st.sys.sent_at = Date.now();
      st.lyr.idx = -2;
    }
  }, 500);
  // Koordinat kursor relatif ke panggung island (bisa diskalakan di halaman pratinjau)
  const local = (e) => {
    const r = $('stage').getBoundingClientRect();
    const k = r.width / WIN_W || 1;
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  };
  const hit = (p) => currentRects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const p = local(e);
    onPointer({ ...p, inside: hit(p) });
  });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const p = local(e);
    onPointer({ ...p, inside: hit(p) });
  });
  invokeOverride();
  window.lanskyDemo = demoApi();
}

function demoApi() {
  const song = (title, artist, ms = 30000) => {
    st.disc = null;
    st.sys = { ...st.sys, active: true, title, artist, track_key: `demo:${title}`, playing: true, position_ms: 0, sent_at: Date.now(), duration_ms: ms };
    st.lyr.key = null;
    scheduleTick();
  };
  return {
    setMode(m) {
      S.mode = m;
      applySettings();
    },
    volume() {
      const v = 0.3 + Math.random() * 0.6;
      showHud(v < 0.05 ? 'mute' : 'vol', v);
    },
    charge() {
      mascot.setPower({ has_battery: true, plugged: true, charging: true, percent: 72 });
      showHud('bolt', 0.72, '72%');
    },
    lowBattery() {
      mascot.setPower({ has_battery: true, plugged: false, charging: false, percent: 14 });
      showHud('battery', 0.14, '14%');
    },
    stop() {
      st.sys.active = false;
      st.disc = null;
      st.pausedSince = 0;
      mascot.setPower({ has_battery: true, plugged: true, charging: false, percent: 80 });
      scheduleTick();
    },
    nextSong() {
      const list = [['Lampu Kota', 'Lansky Island (contoh)'], ['Hujan Sore', 'Band Contoh'], ['Senja di Voice Channel', 'Teman Discord']];
      const i = (list.findIndex((x) => x[0] === st.sys.title) + 1) % list.length;
      song(list[i][0], list[i][1]);
    },
    discord() {
      st.sys.active = false;
      st.disc = { active: true, title: 'Band Contoh - Hujan Sore', artist: '', art: null, guild: 'Server Teman', durationMs: 30000, startedAt: Date.now(), playing: true, anchorPos: 0, anchorAt: Date.now() };
      st.lyr.key = null;
      scheduleTick();
    },
    play() {
      song('Lampu Kota', 'Lansky Island (contoh)');
    },
  };
}

function invokeOverride() {
  // Tombol pemutar di pratinjau
  document.querySelectorAll('.ctl').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.act === 'next' || b.dataset.act === 'prev') {
        st.sys.position_ms = 0;
        st.sys.sent_at = Date.now();
        st.lyr.idx = -2;
      }
    })
  );
  $('seek').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    st.sys.position_ms = Math.round(((e.clientX - r.left) / r.width) * st.sys.duration_ms);
    st.sys.sent_at = Date.now();
    st.lyr.idx = -2;
    tick();
  });
  lyricsList.addEventListener('click', (e) => {
    const p = e.target.closest('p[data-i]');
    if (!p) return;
    st.sys.position_ms = st.lyr.lines[+p.dataset.i].t;
    st.sys.sent_at = Date.now();
    st.lyr.idx = -2;
    tick();
  });
}
