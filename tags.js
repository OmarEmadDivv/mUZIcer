// Minimal metadata readers: ID3v2 (mp3) and MP4/M4A atoms.
// Returns { title, artist, album, art (Blob) } – any field may be missing.

const str = (b, p, n) => { let s = ''; for (let i = 0; i < n && p + i < b.length; i++) s += String.fromCharCode(b[p + i]); return s; };
const u32 = (b, p) => ((b[p] << 24) >>> 0) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3];
const syncsafe = (b, p) => (b[p] << 21) | (b[p + 1] << 14) | (b[p + 2] << 7) | b[p + 3];

export async function readTags(file) {
  const out = {};
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (str(head, 0, 3) === 'ID3') {
      const size = syncsafe(head, 6);
      const buf = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
      parseId3(buf, head[3], head[5], out);
    } else if (str(head, 4, 4) === 'ftyp') {
      await parseMp4(file, out);
    }
  } catch (e) {
    console.warn('tag read failed', e);
  }
  if (!out.artist && out.albumArtist) out.artist = out.albumArtist;
  return out;
}

export function titleFromFilename(name) {
  let base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  base = base.replace(/^\d{1,3}[\s.\-]+(?=\D)/, '');
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { title: base || name, artist: '' };
}

/* ---------- ID3v2 ---------- */

function decodeText(b, enc) {
  try {
    if (enc === 0) return new TextDecoder('windows-1252').decode(b);
    if (enc === 3) return new TextDecoder('utf-8').decode(b);
    if (enc === 2) return new TextDecoder('utf-16be').decode(b);
    // enc 1: UTF-16 with BOM
    if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
    return new TextDecoder('utf-16le').decode(b[0] === 0xff && b[1] === 0xfe ? b.subarray(2) : b);
  } catch {
    return '';
  }
}

function textFrame(d) {
  return decodeText(d.subarray(1), d[0]).split('\0')[0].trim();
}

function picFrame(d, v22) {
  const enc = d[0];
  let p = 1;
  let mime;
  if (v22) {
    mime = str(d, 1, 3).toUpperCase() === 'PNG' ? 'image/png' : 'image/jpeg';
    p = 4;
  } else {
    const end = d.indexOf(0, p);
    if (end < 0) return null;
    mime = str(d, p, end - p).toLowerCase() || 'image/jpeg';
    p = end + 1;
  }
  p++; // picture type
  if (enc === 1 || enc === 2) {
    while (p + 1 < d.length && !(d[p] === 0 && d[p + 1] === 0)) p += 2;
    p += 2;
  } else {
    while (p < d.length && d[p] !== 0) p++;
    p++;
  }
  if (!mime.includes('/')) mime = 'image/' + mime;
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if (p >= d.length) return null;
  return new Blob([d.slice(p)], { type: mime });
}

function parseId3(b, ver, flags, out) {
  let p = 0;
  if (flags & 0x40 && ver >= 3) p = ver === 4 ? syncsafe(b, 0) : u32(b, 0) + 4;
  const idLen = ver === 2 ? 3 : 4;
  const hdr = ver === 2 ? 6 : 10;
  while (p + hdr <= b.length) {
    const id = str(b, p, idLen);
    if (!/^[A-Z0-9]+$/.test(id)) break;
    const size = ver === 2 ? (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5]
      : ver === 4 ? syncsafe(b, p + 4) : u32(b, p + 4);
    if (size <= 0 || p + hdr + size > b.length) break;
    let data = b.subarray(p + hdr, p + hdr + size);
    if (ver === 4 && b[p + 9] & 0x01) data = data.subarray(4); // data length indicator
    p += hdr + size;
    switch (id) {
      case 'TIT2': case 'TT2': out.title = out.title || textFrame(data); break;
      case 'TPE1': case 'TP1': out.artist = out.artist || textFrame(data); break;
      case 'TPE2': case 'TP2': out.albumArtist = out.albumArtist || textFrame(data); break;
      case 'TALB': case 'TAL': out.album = out.album || textFrame(data); break;
      case 'APIC': if (!out.art) out.art = picFrame(data, false); break;
      case 'PIC': if (!out.art) out.art = picFrame(data, true); break;
    }
  }
}

/* ---------- MP4 / M4A ---------- */

async function parseMp4(file, out) {
  let pos = 0;
  const n = file.size;
  while (pos + 8 <= n) {
    const h = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
    let size = h.getUint32(0);
    const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
    if (size === 1) size = Number(h.getBigUint64(8));
    else if (size === 0) size = n - pos;
    if (size < 8) break;
    if (type === 'moov') {
      const moov = new Uint8Array(await file.slice(pos + 8, pos + size).arrayBuffer());
      walkAtoms(moov, 0, moov.length, out, 'moov');
      return;
    }
    pos += size;
  }
}

function walkAtoms(b, start, end, out, parent) {
  const utf8 = (v) => new TextDecoder('utf-8').decode(v).trim();
  let p = start;
  while (p + 8 <= end) {
    const size = u32(b, p);
    const type = str(b, p + 4, 4);
    if (size < 8 || p + size > end) break;
    const cs = p + 8;
    const ce = p + size;
    if (type === 'udta' || type === 'ilst') walkAtoms(b, cs, ce, out, type);
    else if (type === 'meta') walkAtoms(b, cs + 4, ce, out, type);
    else if (parent === 'ilst' && str(b, cs + 4, 4) === 'data') {
      const dsize = Math.min(u32(b, cs), ce - cs);
      const dtype = u32(b, cs + 8) & 0xffffff;
      const val = b.subarray(cs + 16, cs + dsize);
      if (type === '\xa9nam') out.title = utf8(val);
      else if (type === '\xa9ART') out.artist = utf8(val);
      else if (type === 'aART') out.albumArtist = utf8(val);
      else if (type === '\xa9alb') out.album = utf8(val);
      else if (type === 'covr' && !out.art) out.art = new Blob([val.slice()], { type: dtype === 14 ? 'image/png' : 'image/jpeg' });
    }
    p += size;
  }
}
