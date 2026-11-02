// Jendela pengaturan. Setiap perubahan langsung disimpan dan dikabarkan ke island.

import { loadSettings, saveSettings, invoke, listen, emit } from './store.js';

const $ = (id) => document.getElementById(id);
let S = loadSettings();

function save() {
  saveSettings(S);
  emit('settings-changed', null);
}

function bindSwitch(id, get, set) {
  const el = $(id);
  el.checked = !!get();
  el.addEventListener('change', () => {
    set(el.checked);
    save();
  });
}

function bindSeg(id, get, set) {
  const el = $(id);
  const paint = () => el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === get()));
  paint();
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    set(b.dataset.v);
    paint();
    save();
  });
}

function bindText(id, get, set, { debounce = 400, onCommit } = {}) {
  const el = $(id);
  el.value = get() ?? '';
  let t;
  el.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      set(el.value);
      save();
      onCommit?.();
    }, debounce);
  });
}

// Umum
invoke('get_autostart').then((v) => ($('autostart').checked = !!v)).catch(() => {});
$('autostart').addEventListener('change', (e) => invoke('set_autostart', { enabled: e.target.checked }).catch(() => (e.target.checked = !e.target.checked)));
invoke('app_version').then((v) => ($('ver').textContent = `v${v}`)).catch(() => {});

bindSeg('mode', () => S.mode, (v) => (S.mode = v));
const scale = $('scale');
scale.value = S.scale;
$('scaleLbl').textContent = `${S.scale}%`;
scale.addEventListener('input', () => {
  S.scale = +scale.value;
  $('scaleLbl').textContent = `${S.scale}%`;
  save();
});
bindSwitch('hideFullscreen', () => S.hideFullscreen, (v) => (S.hideFullscreen = v));
bindSwitch('clock24', () => S.clock24, (v) => (S.clock24 = v));

// Musik
bindSwitch('lyricsPill', () => S.lyricsPill, (v) => (S.lyricsPill = v));
bindSwitch('trackToast', () => S.trackToast, (v) => (S.trackToast = v));
bindSwitch('accentFromArt', () => S.accentFromArt, (v) => (S.accentFromArt = v));
bindSwitch('mascot', () => S.mascot, (v) => (S.mascot = v));

// Discord
bindSwitch('dEnabled', () => S.discord.enabled, (v) => (S.discord.enabled = v));
bindText('dToken', () => S.discord.token, (v) => (S.discord.token = v.trim()), { debounce: 700 });
bindText('dBots', () => S.discord.botNames, (v) => (S.discord.botNames = v));
bindText('dUser', () => S.discord.userId, (v) => (S.discord.userId = v.replace(/\D/g, '')));
bindText('dOffset', () => S.discord.offsetMs, (v) => (S.discord.offsetMs = parseInt(v, 10) || 0));
bindSeg('dPriority', () => S.discord.priority, (v) => (S.discord.priority = v));
bindSwitch('dAuto', () => S.discord.autoDetect, (v) => (S.discord.autoDetect = v));

$('dShow').addEventListener('click', () => {
  const el = $('dToken');
  el.type = el.type === 'password' ? 'text' : 'password';
  $('dShow').textContent = el.type === 'password' ? 'Lihat' : 'Sembunyikan';
});
$('dReconnect').addEventListener('click', () => emit('discord-reconnect', null));

const LABEL = { off: 'Nonaktif', connecting: 'Menyambung…', ready: 'Tersambung', error: 'Bermasalah' };
function paintStatus(s) {
  const el = $('dStatus');
  el.className = `status ${s.state}`;
  let text = LABEL[s.state] || s.state;
  if (s.state === 'ready' && s.bot) text += ` sebagai ${s.bot}`;
  el.textContent = text;
  el.title = s.detail || '';
  if (s.state === 'error' && s.detail) el.textContent = `${LABEL.error}: ${s.detail}`;
  if (s.state === 'ready' && s.guilds && !s.guilds.length) {
    el.textContent += ' · belum ada server';
    el.title = 'Undang bot ke servermu lewat langkah 5–6 di panduan.';
  }
}
listen('discord-status', (e) => paintStatus(e.payload));
emit('discord-request-status', null);

function paintLast(d) {
  if (!d) return;
  const when = new Date(d.at).toLocaleTimeString('id-ID');
  const parsed = d.parsed ? `\nTerbaca: ${d.parsed.kind === 'play' ? `${d.parsed.title}${d.parsed.artist ? ' — ' + d.parsed.artist : ''}${d.parsed.durationMs ? ` (${Math.round(d.parsed.durationMs / 1000)} dtk)` : ''}` : d.parsed.kind}` : '';
  $('dLast').textContent = `[${when}] ${d.note || ''}${parsed}\n\n${d.raw || ''}`;
}
try {
  paintLast(JSON.parse(localStorage.getItem('lansky.discord.last') || 'null'));
} catch {}
listen('discord-debug', (e) => paintLast(e.payload));
function paintLyrics(l) {
  if (!l) return;
  const when = new Date(l.at).toLocaleTimeString('id-ID');
  const res = l.kind === 'synced' ? `Ketemu (tersinkron): ${l.found}` : l.kind === 'plain' ? `Ketemu (tanpa waktu): ${l.found}` : l.error ? `Gagal: ${l.error}` : 'Tidak ketemu';
  $('lLast').textContent = [
    `[${when}] Sumber: ${l.source === 'discord' ? 'Discord' : 'laptop'}`,
    `Judul asli: ${l.title}${l.artist ? ' | Artis: ' + l.artist : ''}`,
    `Dicari sebagai: ${l.searched || '-'}`,
    `Hasil: ${res}`,
    l.nearest ? `Paling mirip (ditolak): ${l.nearest}` : '',
    `Kandidat diperiksa: ${l.candidates}`,
  ].filter(Boolean).join('\n');
}
try {
  paintLyrics(JSON.parse(localStorage.getItem('lansky.lyrics.last') || 'null'));
} catch {}
listen('lyrics-debug', (e) => paintLyrics(e.payload));
$('dCopy').addEventListener('click', async () => {
  const text = `${$('dLast').textContent}\n\n--- Lirik ---\n${$('lLast').textContent}`;
  try {
    await navigator.clipboard.writeText(text);
    $('dCopy').textContent = 'Tersalin';
    setTimeout(() => ($('dCopy').textContent = 'Salin semua'), 1500);
  } catch {}
});

$('quit').addEventListener('click', () => invoke('quit_app'));
