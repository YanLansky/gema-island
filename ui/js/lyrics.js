// Lirik: membersihkan judul, mencari di LRCLIB lewat Rust, membaca format LRC,
// dan menentukan baris mana yang sedang dinyanyikan.

const NOISE = [
  /\((official|lyrics?|lirik|audio|video|music video|mv|hd|hq|4k|visualizer|live|remaster(ed)?( \d{4})?|explicit|clean)[^)]*\)/gi,
  /\[(official|lyrics?|lirik|audio|video|music video|mv|hd|hq|4k|visualizer|live|remaster(ed)?( \d{4})?|explicit|clean)[^\]]*\]/gi,
  /\b(official (music )?video|official audio|lyric video|video lirik|lirik video|visualizer)\b/gi,
  /\s[|｜]\s.*$/g,
  /#\w+/g,
];

export function cleanTitle(t = '') {
  let s = t;
  for (const re of NOISE) s = s.replace(re, ' ');
  s = s.replace(/\s*[\(\[](feat|ft|featuring|prod)\.?\s[^\)\]]*[\)\]]/gi, ' ');
  s = s.replace(/\s(feat|ft|featuring)\.?\s.*$/i, ' ');
  return s.replace(/\s{2,}/g, ' ').replace(/[\s\-–—:]+$/, '').trim();
}

export function cleanArtist(a = '') {
  return a
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/\s*(official|channel|music)$/i, '')
    .split(/\s*(,|&| x | feat\.? | ft\.? )\s*/i)[0]
    .trim();
}

// "Artis - Judul" (umum di YouTube dan bot Discord) → { artist, title }
export function splitArtistTitle(title, artist) {
  const t = cleanTitle(title);
  const by = t.match(/^(.+?)\s+(?:by|oleh)\s+(.+)$/i);
  if (by) return { artist: cleanArtist(by[2]), title: cleanTitle(by[1]), altArtist: cleanArtist(artist || '') };
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) {
    const a = cleanArtist(artist || '');
    // Kalau artis dari pemutar cuma nama channel, percayai bagian depan judul
    return { artist: m[1].trim(), title: cleanTitle(m[2]), altArtist: a };
  }
  return { artist: cleanArtist(artist || ''), title: t };
}

export function parseLRC(text = '') {
  const out = [];
  let offset = 0;
  const off = text.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (off) offset = parseInt(off[1], 10);
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const s of stamps) {
      const frac = s[3] ? parseInt(s[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      const t = parseInt(s[1], 10) * 60000 + parseInt(s[2], 10) * 1000 + frac - offset;
      out.push({ t, text: words });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export function indexAt(lines, ms) {
  if (!lines || !lines.length || ms < lines[0].t - 300) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid].t <= ms) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const norm = (x = '') =>
  x
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

// Seberapa mirip dua teks (0–1), dipakai untuk mencocokkan judul dan artis
function similar(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return Math.min(x.length, y.length) / Math.max(x.length, y.length) * 0.4 + 0.6;
  const grams = (s) => new Set(Array.from({ length: Math.max(1, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const A = grams(x);
  const B = grams(y);
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return (2 * hit) / (A.size + B.size);
}

function score(c, want) {
  let s = 0;
  if (c.syncedLyrics) s += 100;
  else if (c.plainLyrics) s += 20;
  else return -999;
  if (c.instrumental) s -= 50;
  const titleSim = Math.max(...want.titles.map((t) => similar(c.trackName, t)));
  if (titleSim < 0.5) return -500; // judul terlalu berbeda: pasti lagu lain
  s += Math.round(titleSim * 60) - 30;
  const artistSim = want.artists.length ? Math.max(...want.artists.map((a) => similar(c.artistName, a))) : 0;
  s += Math.round(artistSim * 30);
  if (want.duration > 0 && c.duration) {
    const d = Math.abs(c.duration - want.duration);
    if (want.trustDuration) s += d <= 2 ? 30 : d <= 5 ? 18 : d <= 10 ? 4 : -35;
    else s += d <= 3 ? 20 : d <= 8 ? 8 : 0; // durasi dari bot Discord belum tentu tepat
  }
  return s;
}

const cache = new Map();
export let lastLookup = null;

/**
 * Cari lirik. invoke = window.__TAURI__.core.invoke.
 * trustDuration=false untuk lagu dari Discord (durasinya hasil tebakan dari pesan bot).
 * Mengembalikan { synced, plain, instrumental, source, searched, error }.
 */
export async function findLyrics(invoke, { title, artist, album, durationMs, trustDuration = true }) {
  const parsed = splitArtistTitle(title, artist);
  const titles = [...new Set([parsed.title, cleanTitle(title)].filter(Boolean))];
  const artists = [...new Set([parsed.artist, parsed.altArtist, cleanArtist(artist || '')].filter(Boolean))];

  // Judul "A - B" bisa berarti "Artis - Judul" atau "Judul - Artis"
  const dash = cleanTitle(title).match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) {
    titles.push(cleanTitle(dash[1]));
    artists.push(dash[2].trim());
  }
  const want = { titles, artists, duration: durationMs > 0 ? durationMs / 1000 : 0, trustDuration };
  const key = `${titles[0]}|${artists[0] || ''}|${Math.round(want.duration)}`.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const job = (async () => {
    const seen = new Set();
    const candidates = [];
    let errors = 0;
    let calls = 0;
    const add = (r) => {
      for (const c of Array.isArray(r) ? r : r ? [r] : []) {
        const id = c.id ?? `${c.trackName}|${c.artistName}|${c.duration}`;
        if (!seen.has(id)) {
          seen.add(id);
          candidates.push(c);
        }
      }
    };
    const call = async (cmd, args) => {
      calls++;
      try {
        add(await invoke(cmd, args));
      } catch (e) {
        errors++;
        console.warn('lirik:', cmd, e);
      }
    };
    const good = () => candidates.some((c) => score(c, want) >= 130);

    // 1) Cocok persis (judul + artis + durasi) — hanya kalau durasinya bisa dipercaya
    if (trustDuration && parsed.artist) {
      await call('lyrics_get', { track: parsed.title, artist: parsed.artist, album: album || null, duration: want.duration || null });
    }
    // 2) Pencarian dengan berbagai pasangan judul/artis
    const plans = [];
    for (const a of artists.slice(0, 3)) plans.push({ q: null, track: titles[0], artist: a });
    if (dash) plans.push({ q: null, track: cleanTitle(dash[1]), artist: dash[2].trim() });
    plans.push({ q: null, track: titles[0], artist: null });
    plans.push({ q: `${artists[0] || ''} ${titles[0]}`.trim(), track: null, artist: null });
    if (cleanTitle(title) !== titles[0]) plans.push({ q: cleanTitle(title), track: null, artist: null });
    for (const p of plans) {
      if (good()) break;
      await call('lyrics_search', p);
    }

    candidates.sort((a, b) => score(b, want) - score(a, want));
    const best = candidates[0];
    const searched = `${titles[0]}${artists[0] ? ' — ' + artists[0] : ''}`;
    const info = { searched, candidates: candidates.length, calls, errors };
    if (!best || score(best, want) < 75) {
      return {
        synced: null,
        plain: null,
        instrumental: false,
        source: null,
        ...info,
        error: errors === calls && calls > 0 ? 'Tidak bisa menghubungi LRCLIB (cek koneksi internet)' : null,
        nearest: best ? `${best.artistName} — ${best.trackName}` : null,
      };
    }
    return {
      synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : null,
      plain: best.plainLyrics || null,
      instrumental: !!best.instrumental,
      source: `${best.artistName} — ${best.trackName}`,
      ...info,
    };
  })();

  cache.set(key, job);
  const res = await job;
  lastLookup = res;
  if (!res.synced && !res.plain) setTimeout(() => cache.delete(key), 60_000); // coba lagi nanti
  return res;
}
