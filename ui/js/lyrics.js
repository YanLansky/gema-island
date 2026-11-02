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

function score(c, want) {
  let s = 0;
  if (c.syncedLyrics) s += 100;
  else if (c.plainLyrics) s += 20;
  if (c.instrumental) s -= 50;
  if (want.duration > 0 && c.duration) {
    const d = Math.abs(c.duration - want.duration);
    s += d <= 2 ? 40 : d <= 5 ? 25 : d <= 10 ? 5 : -40;
  }
  const norm = (x = '') => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (want.title && norm(c.trackName).includes(norm(want.title))) s += 15;
  if (want.artist && norm(c.artistName).includes(norm(want.artist))) s += 15;
  return s;
}

const cache = new Map();

/**
 * Cari lirik. invoke = window.__TAURI__.core.invoke.
 * Mengembalikan { synced: [{t,text}] | null, plain: string | null, instrumental, source }.
 */
export async function findLyrics(invoke, { title, artist, album, durationMs }) {
  const parsed = splitArtistTitle(title, artist);
  const want = { title: parsed.title, artist: parsed.artist, duration: durationMs > 0 ? durationMs / 1000 : 0 };
  const key = `${want.title}|${want.artist}|${Math.round(want.duration)}`.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const job = (async () => {
    const candidates = [];
    const tryCall = async (fn) => {
      try {
        const r = await fn();
        if (Array.isArray(r)) candidates.push(...r);
        else if (r) candidates.push(r);
      } catch (e) {
        console.warn('lirik:', e);
      }
    };

    if (want.artist) {
      await tryCall(() =>
        invoke('lyrics_get', { track: want.title, artist: want.artist, album: album || null, duration: want.duration || null })
      );
    }
    if (!candidates.some((c) => c.syncedLyrics)) {
      await tryCall(() => invoke('lyrics_search', { q: null, track: want.title, artist: want.artist || null }));
    }
    if (!candidates.some((c) => c.syncedLyrics) && parsed.altArtist && parsed.altArtist !== want.artist) {
      await tryCall(() => invoke('lyrics_search', { q: null, track: want.title, artist: parsed.altArtist }));
    }
    if (!candidates.some((c) => c.syncedLyrics)) {
      await tryCall(() => invoke('lyrics_search', { q: `${want.artist} ${want.title}`.trim(), track: null, artist: null }));
    }

    candidates.sort((a, b) => score(b, want) - score(a, want));
    const best = candidates[0];
    if (!best || score(best, want) < 20) return { synced: null, plain: null, instrumental: false, source: null };
    return {
      synced: best.syncedLyrics ? parseLRC(best.syncedLyrics) : null,
      plain: best.plainLyrics || null,
      instrumental: !!best.instrumental,
      source: `${best.artistName} — ${best.trackName}`,
    };
  })();

  cache.set(key, job);
  const res = await job;
  if (!res.synced && !res.plain) setTimeout(() => cache.delete(key), 60_000); // coba lagi nanti
  return res;
}
