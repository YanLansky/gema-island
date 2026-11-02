// Jembatan Discord: bot pribadimu tersambung ke Discord langsung dari Lansky Island,
// membaca pesan "Now Playing" dari bot musik (Jockie, dll.), lalu memberi
// tahu island lagu apa yang sedang diputar di voice channel.
// Token hanya dipakai di laptopmu dan dikirim langsung ke Discord.

const GATEWAY = 'wss://gateway.discord.gg/?v=10&encoding=json';
// GUILDS | GUILD_VOICE_STATES | GUILD_MESSAGES | MESSAGE_CONTENT
const INTENTS = (1 << 0) | (1 << 7) | (1 << 9) | (1 << 15);

const TIME_RE = /(?<![\d:])(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?![\d:])/g;
const PLAY_RE = /(now playing|started playing|playing now|currently playing|sekarang memutar|sedang memutar|memutar sekarang|mulai memutar|▶️?|🎶|🎵|🎧)/i;
const STOP_RE = /(stopped|disconnected|left the voice|queue (has )?(ended|finished|concluded|is empty)|nothing (is )?playing|cleared the queue|antrian (habis|selesai)|berhenti)/i;
const PAUSE_RE = /(?<!un)\bpaused\b|\bdijeda\b/i;
const RESUME_RE = /\b(resumed|unpaused|dilanjutkan)\b/i;
const GENERIC_RE = /^(now playing|playing|currently playing|started playing|sekarang memutar|sedang memutar|music|musik|track|song|lagu)\s*[:!.]?$/i;

function toMs(h, m, s) {
  return ((parseInt(h || '0', 10) * 60 + parseInt(m, 10)) * 60 + parseInt(s, 10)) * 1000;
}

function stripMd(s = '') {
  return s
    .replace(/<a?:\w+:\d+>/g, '') // emoji khusus server
    .replace(/<[@#&!]+\d+>/g, '')
    .replace(/[*_~`|>]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Ambil semua teks dari pesan beserta embed-nya. */
export function messageText(msg) {
  const parts = [];
  if (msg.content) parts.push(msg.content);
  for (const e of msg.embeds || []) {
    if (e.author?.name) parts.push(e.author.name);
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    for (const f of e.fields || []) parts.push(`${f.name}: ${f.value}`);
    if (e.footer?.text) parts.push(e.footer.text);
  }
  for (const c of msg.components || []) {
    // Komponen V2 (container/teks) dipakai sebagian bot musik baru
    const walk = (n) => {
      if (!n) return;
      if (typeof n.content === 'string') parts.push(n.content);
      (n.components || []).forEach(walk);
    };
    walk(c);
  }
  return parts.join('\n');
}

/**
 * Tebak lagu dari pesan bot musik. Format tiap bot berbeda, jadi ini sengaja
 * longgar: cari tautan [Judul](url), teks tebal, "oleh/by", dan durasi.
 */
export function parseNowPlaying(msg) {
  const text = messageText(msg);
  if (!text.trim()) return null;
  const firstLines = text.split('\n').slice(0, 4).join('\n');

  if (STOP_RE.test(firstLines) && !PLAY_RE.test(firstLines)) return { kind: 'stop', raw: text };
  if (RESUME_RE.test(firstLines)) return { kind: 'resume', raw: text };
  if (PAUSE_RE.test(firstLines)) return { kind: 'pause', raw: text };

  let title = '';
  let artist = '';
  let url = '';

  const link = text.match(/\[([^\]\n]{2,200})\]\((https?:\/\/[^)\s]+)\)/);
  if (link) {
    title = stripMd(link[1]);
    url = link[2];
  }
  if (!title) {
    const bolds = [...text.matchAll(/\*\*([^*\n]{2,200})\*\*/g)].map((m) => stripMd(m[1])).filter((b) => b && !GENERIC_RE.test(b) && !/requested|diminta|queue|antrian/i.test(b));
    if (bolds.length) title = bolds[0];
  }
  if (!title) {
    for (const e of msg.embeds || []) {
      const t = stripMd(e.title || '');
      if (t && !GENERIC_RE.test(t) && !STOP_RE.test(t)) {
        title = t;
        url = url || e.url || '';
        break;
      }
    }
  }
  if (!title) {
    const m = text.match(/(?:now playing|playing|memutar)\s*[:\-–]\s*(.+)/i);
    if (m) title = stripMd(m[1].split('\n')[0]);
  }
  if (!title) return null;

  // Jangan anggap pesan biasa sebagai "now playing" kecuali ada petunjuk kuat
  const hasHint = PLAY_RE.test(text) || !!url || (msg.embeds || []).some((e) => e.thumbnail || e.image);
  if (!hasHint) return null;

  // Artis: "Judul by Artis", kolom Artist/Author, atau nama author embed.
  // "Requested by <nama>" itu orang yang meminta lagu, bukan penyanyinya.
  const REQ_BEFORE = /(request(?:ed)?|added|queued|enqueued|played|asked|diminta|ditambahkan|diputar|dari permintaan)\s*$/i;
  for (const m of text.matchAll(/\b(by|oleh)\s+\*{0,2}([^\n*•·|\[\]()<>]+)/gi)) {
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    if (REQ_BEFORE.test(before)) continue;
    const a = stripMd(m[2]).replace(/\s*\(.*$/, '').trim();
    if (!a || a.startsWith('@') || /^<@/.test(m[2]) || /requested|diminta/i.test(a)) continue;
    artist = a;
    break;
  }
  if (!artist) {
    for (const e of msg.embeds || []) {
      const f = (e.fields || []).find((f) => /^(artist|artis|author|uploader|channel|penyanyi)$/i.test(stripMd(f.name)));
      if (f) {
        artist = stripMd(f.value);
        break;
      }
    }
  }
  if (!artist) {
    const a = stripMd(msg.embeds?.[0]?.author?.name || '');
    if (a && !GENERIC_RE.test(a) && !PLAY_RE.test(a) && a.toLowerCase() !== (msg.author?.username || '').toLowerCase()) artist = a;
  }
  title = title.replace(/\s*-\s*YouTube$/i, '').trim();
  // Banyak bot menulis "Judul by Artis" dalam satu teks; pisahkan
  const byIn = title.match(/^(.+?)\s+(?:by|oleh)\s+(.+)$/i);
  if (byIn) {
    if (!artist || artist.toLowerCase() === byIn[2].trim().toLowerCase()) {
      title = byIn[1].trim();
      artist = byIn[2].trim();
    }
  }

  // Durasi dan posisi ("1:23 / 3:45", "Duration: 3:45", "[3:45]")
  let durationMs = 0;
  let positionMs = null;
  const pair = text.match(/((?:\d{1,2}:)?\d{1,2}:\d{2})\s*(?:\/|of|dari)\s*((?:\d{1,2}:)?\d{1,2}:\d{2})/i);
  if (pair) {
    const p = pair[1].split(':').reverse();
    const d = pair[2].split(':').reverse();
    positionMs = toMs(p[2], p[1], p[0]);
    durationMs = toMs(d[2], d[1], d[0]);
  } else {
    const all = [...text.matchAll(TIME_RE)].map((m) => toMs(m[1], m[2], m[3]));
    if (all.length) durationMs = Math.max(...all);
  }
  if (durationMs > 6 * 3600 * 1000) durationMs = 0;
  if (positionMs != null && (positionMs > durationMs || positionMs < 0)) positionMs = null;

  const thumb = msg.embeds?.find((e) => e.thumbnail?.url || e.image?.url);
  return {
    kind: 'play',
    title,
    artist,
    url,
    durationMs,
    positionMs,
    art: thumb?.thumbnail?.url || thumb?.image?.url || null,
    raw: text,
  };
}

export class DiscordBridge {
  constructor({ onTrack, onStatus, onDebug }) {
    this.onTrack = onTrack;
    this.onStatus = onStatus;
    this.onDebug = onDebug;
    this.cfg = null;
    this.ws = null;
    this.seq = null;
    this.sessionId = null;
    this.resumeUrl = null;
    this.hbTimer = null;
    this.acked = true;
    this.retry = 0;
    this.closedByUs = false;
    this.botUser = null;
    this.guilds = new Map(); // id -> name
    this.voice = new Map(); // guildId -> Map(userId -> channelId)
    this.msgTrack = new Map(); // messageId -> trackKey
    this.current = null; // { guildId, botId, messageId }
  }

  configure(cfg) {
    const prev = this.cfg;
    this.cfg = cfg;
    const changed = !prev || prev.token !== cfg.token || prev.enabled !== cfg.enabled;
    if (!changed) return;
    this.stop();
    if (cfg.enabled && cfg.token) this.connect();
    else this.status('off', cfg.enabled ? 'Token bot belum diisi' : 'Nonaktif');
  }

  status(state, detail = '') {
    this.state = { state, detail, bot: this.botUser?.username || null, guilds: [...this.guilds.values()] };
    this.onStatus?.(this.state);
  }

  stop() {
    this.closedByUs = true;
    clearInterval(this.hbTimer);
    clearTimeout(this.retryTimer);
    if (this.ws) {
      try {
        this.ws.close(1000);
      } catch {}
    }
    this.ws = null;
    this.seq = null;
    this.sessionId = null;
  }

  connect(resume = false) {
    this.closedByUs = false;
    const url = resume && this.resumeUrl ? `${this.resumeUrl}/?v=10&encoding=json` : GATEWAY;
    this.status('connecting', 'Menyambung ke Discord…');
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      this.status('error', String(e));
      return this.scheduleReconnect(false);
    }
    this.ws = ws;
    ws.onmessage = (ev) => this.handle(JSON.parse(ev.data), resume);
    ws.onclose = (ev) => this.closed(ev);
    ws.onerror = () => {};
  }

  send(op, d) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ op, d }));
  }

  heartbeat() {
    if (!this.acked) {
      // Koneksi "zombie": tidak ada balasan, sambung ulang
      try {
        this.ws.close(4900);
      } catch {}
      return;
    }
    this.acked = false;
    this.send(1, this.seq);
  }

  handle(p, resume) {
    if (p.s != null) this.seq = p.s;
    switch (p.op) {
      case 10: {
        clearInterval(this.hbTimer);
        const iv = p.d.heartbeat_interval;
        this.acked = true;
        setTimeout(() => this.heartbeat(), Math.random() * iv);
        this.hbTimer = setInterval(() => this.heartbeat(), iv);
        if (resume && this.sessionId) {
          this.send(6, { token: this.cfg.token, session_id: this.sessionId, seq: this.seq });
        } else {
          this.send(2, {
            token: this.cfg.token,
            intents: INTENTS,
            properties: { os: 'windows', browser: 'lansky-island', device: 'lansky-island' },
          });
        }
        break;
      }
      case 11:
        this.acked = true;
        break;
      case 1:
        this.send(1, this.seq);
        break;
      case 7:
        try {
          this.ws.close(4901);
        } catch {}
        break;
      case 9:
        this.sessionId = null;
        setTimeout(() => {
          try {
            this.ws.close(4902);
          } catch {}
        }, 1500 + Math.random() * 2000);
        break;
      case 0:
        this.dispatch(p.t, p.d);
        break;
    }
  }

  closed(ev) {
    clearInterval(this.hbTimer);
    if (this.closedByUs) return;
    const fatal = {
      4004: 'Token bot salah. Salin ulang token dari Discord Developer Portal.',
      4010: 'Shard tidak valid.',
      4011: 'Sharding diperlukan.',
      4012: 'Versi API tidak valid.',
      4013: 'Intents tidak valid.',
      4014: 'Aktifkan "Message Content Intent" dan "Server Members"/"Presence" tidak perlu; cukup Message Content di Developer Portal → Bot.',
    };
    if (fatal[ev.code]) {
      this.status('error', fatal[ev.code]);
      return;
    }
    const canResume = ![4007, 4009].includes(ev.code) && !!this.sessionId;
    this.scheduleReconnect(canResume);
  }

  scheduleReconnect(resume) {
    const wait = Math.min(30000, 1000 * 2 ** this.retry) + Math.random() * 500;
    this.retry = Math.min(this.retry + 1, 5);
    this.status('connecting', `Terputus, mencoba lagi dalam ${Math.round(wait / 1000)} detik…`);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(resume), wait);
  }

  dispatch(t, d) {
    switch (t) {
      case 'READY':
        this.retry = 0;
        this.sessionId = d.session_id;
        this.resumeUrl = d.resume_gateway_url;
        this.botUser = d.user;
        this.status('ready', 'Tersambung');
        break;
      case 'RESUMED':
        this.retry = 0;
        this.status('ready', 'Tersambung');
        break;
      case 'GUILD_CREATE': {
        this.guilds.set(d.id, d.name);
        const vm = new Map();
        for (const v of d.voice_states || []) if (v.channel_id) vm.set(v.user_id, v.channel_id);
        this.voice.set(d.id, vm);
        this.status('ready', 'Tersambung');
        break;
      }
      case 'GUILD_DELETE':
        this.guilds.delete(d.id);
        this.voice.delete(d.id);
        break;
      case 'VOICE_STATE_UPDATE': {
        if (!d.guild_id) break;
        let vm = this.voice.get(d.guild_id);
        if (!vm) this.voice.set(d.guild_id, (vm = new Map()));
        if (d.channel_id) vm.set(d.user_id, d.channel_id);
        else vm.delete(d.user_id);
        // Bot musik keluar dari voice, atau kamu keluar → lagu dianggap berhenti
        const c = this.current;
        if (c && c.guildId === d.guild_id && !d.channel_id && (d.user_id === c.botId || d.user_id === this.cfg.userId)) {
          this.current = null;
          this.onTrack?.({ kind: 'stop', reason: 'voice' });
        }
        break;
      }
      case 'MESSAGE_CREATE':
      case 'MESSAGE_UPDATE':
        this.onMessage(d, t === 'MESSAGE_UPDATE');
        break;
    }
  }

  isMusicBot(author) {
    if (!author || !author.bot) return false;
    if (this.botUser && author.id === this.botUser.id) return false;
    const names = (this.cfg.botNames || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const n = `${author.username || ''} ${author.global_name || ''}`.toLowerCase();
    if (names.some((x) => n.includes(x))) return true;
    return !!this.cfg.autoDetect;
  }

  sharesVoice(guildId, botId) {
    const me = (this.cfg.userId || '').trim();
    if (!me) return true;
    const vm = this.voice.get(guildId);
    if (!vm) return false;
    const mine = vm.get(me);
    if (!mine) return false;
    const bot = vm.get(botId);
    return !bot || bot === mine; // kalau status voice bot belum diketahui, tetap izinkan
  }

  onMessage(m, isUpdate) {
    if (!m.guild_id) return;
    if (isUpdate && !m.author) {
      // Pembaruan parsial: hanya proses kalau ini pesan lagu yang sedang aktif
      if (!this.msgTrack.has(m.id)) return;
      m.author = { bot: true, id: this.current?.botId, username: '' };
    } else if (!this.isMusicBot(m.author)) return;

    const parsed = parseNowPlaying(m);
    if (!parsed) return;
    if (!this.sharesVoice(m.guild_id, m.author.id)) {
      this.onDebug?.({ note: 'Diabaikan: kamu tidak berada di voice channel yang sama dengan bot ini.', raw: parsed.raw, at: Date.now() });
      return;
    }
    this.onDebug?.({ note: `Dari ${m.author.username || 'bot'} (${parsed.kind})`, parsed: { ...parsed, raw: undefined }, raw: parsed.raw, at: Date.now() });

    if (parsed.kind !== 'play') {
      if (this.current && this.current.guildId === m.guild_id) this.onTrack?.({ kind: parsed.kind });
      return;
    }
    const key = `${parsed.title}|${parsed.artist}`.toLowerCase();
    const sameMsg = this.msgTrack.get(m.id) === key;
    this.msgTrack.set(m.id, key);
    if (this.msgTrack.size > 200) this.msgTrack.delete(this.msgTrack.keys().next().value);

    this.current = { guildId: m.guild_id, botId: m.author.id, messageId: m.id };
    const sentAt = Date.parse(isUpdate ? m.edited_timestamp || m.timestamp || '' : m.timestamp || '') || Date.now();
    if (isUpdate && sameMsg) {
      // Pesan yang sama diedit: hanya selaraskan posisi kalau bot menuliskannya
      if (parsed.positionMs != null) this.onTrack?.({ kind: 'sync', positionMs: parsed.positionMs, at: sentAt });
      return;
    }
    this.onTrack?.({
      kind: 'play',
      title: parsed.title,
      artist: parsed.artist,
      durationMs: parsed.durationMs,
      positionMs: parsed.positionMs || 0,
      startedAt: sentAt,
      art: parsed.art,
      url: parsed.url,
      guild: this.guilds.get(m.guild_id) || '',
    });
  }
}
