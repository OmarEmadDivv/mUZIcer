import { db } from './db.js';
import { readTags, titleFromFilename } from './tags.js';

/* ================= helpers ================= */
const $ = (s) => document.querySelector(s);
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t) => { if (!isFinite(t) || t < 0) t = 0; const m = Math.floor(t / 60); const s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; };
const fmtLong = (t) => { const m = Math.round(t / 60); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`; };
const fmtSize = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const shuffled = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

const P_ = (d, fill) => `<path d="${d}"${fill ? ' fill="currentColor" stroke="none"' : ''}/>`;
const ICONS = {
  plus: P_('M12 5v14M5 12h14'),
  play: P_('M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z', true),
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  next: P_('M5 6.2v11.6a1 1 0 0 0 1.5.86l8.6-5.8a1 1 0 0 0 0-1.72L6.5 5.34A1 1 0 0 0 5 6.2z', true) + '<rect x="16.5" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none"/>',
  prev: P_('M19 6.2v11.6a1 1 0 0 1-1.5.86l-8.6-5.8a1 1 0 0 1 0-1.72l8.6-5.8A1 1 0 0 1 19 6.2z', true) + '<rect x="5" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none"/>',
  shuffle: P_('M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5'),
  repeat: P_('M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3'),
  heart: P_('M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z'),
  'heart-fill': P_('M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z', true),
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  'chev-down': P_('M6 9l6 6 6-6'),
  'chev-left': P_('M15 18l-6-6 6-6'),
  'chev-right': P_('M9 18l6-6-6-6'),
  music: P_('M9 18V5l12-2v13') + '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  list: P_('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'),
  search: '<circle cx="11" cy="11" r="7"/>' + P_('M20 20l-3.5-3.5'),
  sort: P_('M3 6h18M6 12h12M10 18h4'),
  trash: P_('M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6'),
  edit: P_('M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'),
  minus: P_('M5 12h14'),
  check: P_('M20 6L9 17l-5-5'),
  x: P_('M18 6L6 18M6 6l12 12'),
  queue: P_('M3 6h13M3 12h13M3 18h8M17 14v8M21 18h-8'),
  share: P_('M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13'),
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

const EXT_TYPES = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac', aif: 'audio/aiff', aiff: 'audio/aiff', ogg: 'audio/ogg', opus: 'audio/ogg' };
const guessType = (name) => EXT_TYPES[(name.split('.').pop() || '').toLowerCase()] || 'audio/mpeg';

/* ================= state ================= */
const S = { songs: [], playlists: [], tab: 'songs', query: '', sort: local.get('sort', 'recent'), playlist: null };
const P = { context: [], ctx: '', queue: [], idx: -1, shuffle: local.get('shuffle', false), repeat: local.get('repeat', 'off'), resumeAt: 0 };
const audio = $('#audio');
const seek = $('#seek');
const artUrls = new Map();
const artData = new Map();
let curUrl = null;
let loadedId = null;
let seeking = false;

const songById = (id) => S.songs.find((s) => s.id === id);
const curId = () => P.queue[P.idx];
const SORT_LABEL = { recent: 'Recently added', title: 'Title', artist: 'Artist' };

function artUrl(s) {
  if (!s?.art) return null;
  let u = artUrls.get(s.id);
  if (!u) { u = URL.createObjectURL(s.art); artUrls.set(s.id, u); }
  return u;
}
const artInner = (s) => { const u = artUrl(s); return u ? `<img src="${u}" alt="">` : icon('music'); };
const artHtml = (s, cls = 'art') => `<div class="${cls}">${artInner(s)}</div>`;

/* ================= library views ================= */
function sorted(list) {
  const a = list.slice();
  if (S.sort === 'title') a.sort((x, y) => x.title.localeCompare(y.title));
  else if (S.sort === 'artist') a.sort((x, y) => (x.artist || '~').localeCompare(y.artist || '~') || x.title.localeCompare(y.title));
  else a.sort((x, y) => y.addedAt - x.addedAt);
  return a;
}
function filtered(list) {
  const q = S.query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((s) => `${s.title} ${s.artist} ${s.album}`.toLowerCase().includes(q));
}
function contextList(ctx) {
  if (ctx === 'songs') return filtered(sorted(S.songs));
  if (ctx === 'liked') return filtered(sorted(S.songs.filter((s) => s.liked)));
  if (ctx.startsWith('pl:')) {
    const pl = S.playlists.find((p) => p.id === ctx.slice(3));
    return pl ? pl.songIds.map(songById).filter(Boolean) : [];
  }
  return [];
}
function ctxLabel(ctx) {
  if (ctx === 'songs') return 'All songs';
  if (ctx === 'liked') return 'Liked songs';
  if (ctx?.startsWith('pl:')) return S.playlists.find((p) => p.id === ctx.slice(3))?.name || 'Playlist';
  return 'Queue';
}

function rowHtml(s, ctx) {
  const sub = `${s.liked ? icon('heart-fill', 'mini-heart') : ''}${esc(s.artist || 'Unknown artist')}${s.duration ? ' · ' + fmt(s.duration) : ''}`;
  return `<li class="row${s.id === loadedId ? ' playing' : ''}" data-action="play" data-id="${s.id}" data-ctx="${ctx}">
    ${artHtml(s)}
    <div class="meta"><div class="t">${esc(s.title)}</div><div class="s">${sub}</div></div>
    <button class="icon-btn more" data-action="menu" data-id="${s.id}" data-ctx="${ctx}" aria-label="More">${icon('dots')}</button>
  </li>`;
}

const emptyHtml = (title, text, withImport) => `<div class="empty">${icon('music', 'big')}<h2>${title}</h2><p>${text}</p>${withImport ? `<button class="btn primary" data-action="import">${icon('plus')} Import audio</button>` : ''}</div>`;

function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab));
  const main = $('#main');
  if (S.tab === 'playlists') {
    if (S.playlist && S.playlists.some((p) => p.id === S.playlist)) return renderPlaylist();
    S.playlist = null;
    return renderPlaylists();
  }
  const ctx = S.tab;
  const liked = ctx === 'liked';
  $('#title').textContent = liked ? 'Liked' : 'Songs';
  if (!S.songs.length) {
    main.innerHTML = emptyHtml('Your library is empty', 'Tap + to import songs from the Files app: iCloud Drive, On My iPhone, or anything you saved there.', true);
    return;
  }
  if (liked && !S.songs.some((s) => s.liked)) {
    main.innerHTML = emptyHtml('No liked songs yet', 'Tap the heart on any song to add it here.', false);
    return;
  }
  main.innerHTML = `
    <div class="toolbar">
      <label class="search">${icon('search')}<input id="q" type="search" placeholder="Search songs, artists, albums" value="${esc(S.query)}" enterkeyhint="search" autocomplete="off"></label>
      <button class="icon-btn" data-action="sort" aria-label="Sort">${icon('sort')}</button>
    </div>
    <div class="list-head"><span id="count"></span><span>${SORT_LABEL[S.sort]}</span></div>
    <div class="actions">
      <button class="btn primary" data-action="play-all" data-ctx="${ctx}">${icon('play')} Play</button>
      <button class="btn" data-action="shuffle-all" data-ctx="${ctx}">${icon('shuffle')} Shuffle</button>
    </div>
    <ul class="list" id="list"></ul>`;
  const q = $('#q');
  q.addEventListener('input', () => { S.query = q.value; renderList(ctx); });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') q.blur(); });
  renderList(ctx);
}

function renderList(ctx) {
  const list = contextList(ctx);
  $('#list').innerHTML = list.map((s) => rowHtml(s, ctx)).join('') || '<li class="none">No matches</li>';
  let txt = plural(list.length, 'song');
  if (ctx === 'songs' && !S.query) txt += ' · ' + fmtSize(S.songs.reduce((a, s) => a + (s.size || 0), 0));
  $('#count').textContent = txt;
}

function renderPlaylists() {
  $('#title').textContent = 'Playlists';
  $('#main').innerHTML = `
    <ul class="list">
      <li class="row" data-action="new-playlist"><div class="art add">${icon('plus')}</div><div class="meta"><div class="t">New playlist</div></div></li>
      ${S.playlists.map((p) => {
        const songs = p.songIds.map(songById).filter(Boolean);
        return `<li class="row" data-action="open-playlist" data-id="${p.id}">${artHtml(songs.find((s) => s.art))}
          <div class="meta"><div class="t">${esc(p.name)}</div><div class="s">${plural(songs.length, 'song')}</div></div>${icon('chev-right', 'chev')}</li>`;
      }).join('')}
    </ul>`;
}

function renderPlaylist() {
  const p = S.playlists.find((x) => x.id === S.playlist);
  const ctx = 'pl:' + p.id;
  const songs = contextList(ctx);
  const dur = songs.reduce((a, s) => a + (s.duration || 0), 0);
  $('#title').textContent = '';
  $('#main').innerHTML = `
    <button class="back" data-action="back">${icon('chev-left')} Playlists</button>
    <div class="pl-hero">
      ${artHtml(songs.find((s) => s.art), 'art hero')}
      <h2>${esc(p.name)}</h2>
      <div class="s">${plural(songs.length, 'song')}${dur ? ' · ' + fmtLong(dur) : ''}</div>
      <div class="actions">
        <button class="btn primary" data-action="play-all" data-ctx="${ctx}">${icon('play')} Play</button>
        <button class="btn" data-action="shuffle-all" data-ctx="${ctx}">${icon('shuffle')} Shuffle</button>
        <button class="icon-btn" data-action="pl-menu" data-id="${p.id}" aria-label="Playlist options">${icon('dots')}</button>
      </div>
    </div>
    <ul class="list" id="list">${songs.map((s) => rowHtml(s, ctx)).join('') || `<li class="none">Empty playlist.<br><button class="btn" data-action="pl-add" data-id="${p.id}">${icon('plus')} Add songs</button></li>`}</ul>`;
}

function highlightRows() {
  document.querySelectorAll('.row[data-id]').forEach((r) => r.classList.toggle('playing', r.dataset.id === loadedId));
}

/* ================= sheets / dialogs ================= */
function sheet({ title, subtitle, art, items = [], body = '', onMount }) {
  const w = $('#sheet');
  w.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet" role="dialog" aria-modal="true">
    <div class="grabber"></div>
    ${title ? `<div class="sheet-head">${art !== undefined ? artHtml(art) : ''}<div class="meta"><div class="t">${esc(title)}</div>${subtitle ? `<div class="s">${esc(subtitle)}</div>` : ''}</div></div>` : ''}
    ${body}
    ${items.map((it, i) => `<button class="sheet-item${it.danger ? ' danger' : ''}" data-i="${i}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`).join('')}
  </div>`;
  w.classList.remove('hidden');
  void w.offsetWidth;
  w.classList.add('open');
  w.querySelector('.sheet-backdrop').onclick = closeSheet;
  w.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { closeSheet(); items[+b.dataset.i].fn(); }; });
  onMount?.(w);
}
function closeSheet() {
  const w = $('#sheet');
  w.classList.remove('open');
  setTimeout(() => { if (!w.classList.contains('open')) { w.classList.add('hidden'); w.innerHTML = ''; } }, 260);
}
function formSheet({ title, fields, submit = 'Save', onSubmit }) {
  const body = `<form class="sheet-form">
    ${fields.map((f) => `<label><span>${esc(f.label)}</span><input name="${f.key}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" autocomplete="off"></label>`).join('')}
    <div class="form-actions"><button type="button" class="btn" data-cancel>Cancel</button><button type="submit" class="btn primary">${esc(submit)}</button></div>
  </form>`;
  sheet({
    title, body,
    onMount(w) {
      const form = w.querySelector('form');
      form.querySelector('input')?.focus();
      form.querySelector('[data-cancel]').onclick = closeSheet;
      form.onsubmit = (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(form)); closeSheet(); onSubmit(v); };
    },
  });
}
const confirmSheet = (title, label, fn) => sheet({ title, items: [{ label, icon: 'trash', danger: true, fn }, { label: 'Cancel', icon: 'x', fn: () => {} }] });

let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

/* ================= song actions ================= */
function songMenu(id, ctx) {
  const s = songById(id);
  if (!s) return;
  const items = [
    { label: 'Play next', icon: 'next', fn: () => playNext(id) },
    { label: 'Add to queue', icon: 'queue', fn: () => addToQueue(id) },
    { label: s.liked ? 'Remove from Liked' : 'Add to Liked', icon: s.liked ? 'heart-fill' : 'heart', fn: () => toggleLike(id) },
    { label: 'Add to playlist…', icon: 'list', fn: () => pickPlaylist(id) },
    { label: 'Edit info…', icon: 'edit', fn: () => editSong(id) },
  ];
  if (ctx?.startsWith('pl:')) items.push({ label: 'Remove from this playlist', icon: 'minus', fn: () => removeFromPlaylist(ctx.slice(3), id) });
  items.push({ label: 'Delete from library', icon: 'trash', danger: true, fn: () => confirmSheet(`Delete “${s.title}” from your library?`, 'Delete song', () => deleteSong(id)) });
  sheet({ title: s.title, subtitle: s.artist, art: s, items });
}

async function saveSong(s) { await db.put('songs', s); }

async function toggleLike(id) {
  const s = songById(id);
  s.liked = !s.liked;
  await saveSong(s);
  toast(s.liked ? 'Added to Liked' : 'Removed from Liked');
  render();
  if (id === loadedId) updateNowPlaying();
}

function editSong(id) {
  const s = songById(id);
  formSheet({
    title: 'Edit info',
    fields: [{ key: 'title', label: 'Title', value: s.title }, { key: 'artist', label: 'Artist', value: s.artist }, { key: 'album', label: 'Album', value: s.album }],
    async onSubmit(v) {
      s.title = v.title.trim() || s.title;
      s.artist = v.artist.trim();
      s.album = v.album.trim();
      await saveSong(s);
      render();
      if (id === loadedId) updateNowPlaying();
    },
  });
}

async function deleteSong(id) {
  const wasCurrent = id === loadedId;
  const wasPlaying = wasCurrent && !audio.paused;
  S.songs = S.songs.filter((s) => s.id !== id);
  await db.del('songs', id);
  await db.del('files', id);
  for (const p of S.playlists) {
    if (p.songIds.includes(id)) { p.songIds = p.songIds.filter((x) => x !== id); await db.put('playlists', p); }
  }
  const before = P.queue.slice(0, P.idx).filter((x) => x === id).length;
  P.queue = P.queue.filter((x) => x !== id);
  P.context = P.context.filter((x) => x !== id);
  P.idx -= before;
  if (P.idx >= P.queue.length) P.idx = P.queue.length ? 0 : -1;
  if (artUrls.has(id)) { URL.revokeObjectURL(artUrls.get(id)); artUrls.delete(id); }
  artData.delete(id);
  if (wasCurrent) {
    audio.pause();
    loadedId = null;
    if (P.idx >= 0) loadAndPlay(wasPlaying);
  }
  updateNowPlaying();
  updatePlayState();
  saveSession();
  render();
  toast('Deleted');
}

/* ================= playlists ================= */
async function createPlaylist(name, firstSongId) {
  const pl = { id: uid(), name: name.trim() || 'New playlist', songIds: firstSongId ? [firstSongId] : [], createdAt: Date.now() };
  S.playlists.push(pl);
  await db.put('playlists', pl);
  return pl;
}
function newPlaylistForm(songId) {
  formSheet({
    title: 'New playlist', submit: 'Create',
    fields: [{ key: 'name', label: 'Name', placeholder: 'My playlist' }],
    async onSubmit(v) {
      const pl = await createPlaylist(v.name, songId);
      if (songId) toast('Added to ' + pl.name);
      else { S.tab = 'playlists'; S.playlist = pl.id; }
      render();
    },
  });
}
function pickPlaylist(songId) {
  sheet({
    title: 'Add to playlist',
    items: [{ label: 'New playlist…', icon: 'plus', fn: () => newPlaylistForm(songId) },
      ...S.playlists.map((p) => ({ label: p.name, icon: 'list', fn: () => addToPlaylist(p.id, songId) }))],
  });
}
async function addToPlaylist(pid, sid) {
  const p = S.playlists.find((x) => x.id === pid);
  if (p.songIds.includes(sid)) return toast('Already in ' + p.name);
  p.songIds.push(sid);
  await db.put('playlists', p);
  toast('Added to ' + p.name);
  if (S.tab === 'playlists') render();
}
async function removeFromPlaylist(pid, sid) {
  const p = S.playlists.find((x) => x.id === pid);
  p.songIds = p.songIds.filter((x) => x !== sid);
  await db.put('playlists', p);
  render();
}
function playlistMenu(pid) {
  const p = S.playlists.find((x) => x.id === pid);
  sheet({
    title: p.name,
    items: [
      { label: 'Add songs…', icon: 'plus', fn: () => addSongsSheet(pid) },
      { label: 'Rename…', icon: 'edit', fn: () => formSheet({ title: 'Rename playlist', fields: [{ key: 'name', label: 'Name', value: p.name }], async onSubmit(v) { p.name = v.name.trim() || p.name; await db.put('playlists', p); render(); } }) },
      { label: 'Delete playlist', icon: 'trash', danger: true, fn: () => confirmSheet(`Delete “${p.name}”? Songs stay in your library.`, 'Delete playlist', async () => {
        S.playlists = S.playlists.filter((x) => x.id !== pid); await db.del('playlists', pid); S.playlist = null; render();
      }) },
    ],
  });
}
function addSongsSheet(pid) {
  const p = S.playlists.find((x) => x.id === pid);
  if (!S.songs.length) return toast('Import some songs first');
  const body = `<div class="pick-list">${sorted(S.songs).map((s) => `<label class="pick"><input type="checkbox" value="${s.id}" ${p.songIds.includes(s.id) ? 'checked' : ''}>${artHtml(s)}<span class="meta"><span class="t">${esc(s.title)}</span><span class="s">${esc(s.artist || 'Unknown artist')}</span></span><span class="check">${icon('check')}</span></label>`).join('')}</div>
    <div class="form-actions sticky"><button class="btn primary" data-done>Done</button></div>`;
  sheet({
    title: 'Add to ' + p.name, body,
    onMount(w) {
      w.querySelector('[data-done]').onclick = async () => {
        const checked = [...w.querySelectorAll('input:checked')].map((i) => i.value);
        const set = new Set(checked);
        p.songIds = [...p.songIds.filter((id) => set.has(id)), ...checked.filter((id) => !p.songIds.includes(id))];
        await db.put('playlists', p);
        closeSheet();
        render();
      };
    },
  });
}

/* ================= import ================= */
async function shrinkArt(blob, max = 512) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (sc === 1 && blob.size < 250000) return blob;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * sc);
    c.height = Math.round(img.naturalHeight * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || blob), 'image/jpeg', 0.86));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
function probeDuration(blob) {
  return new Promise((resolve) => {
    const a = new Audio();
    const u = URL.createObjectURL(blob);
    let done = false;
    const fin = (v) => { if (done) return; done = true; URL.revokeObjectURL(u); a.removeAttribute('src'); resolve(isFinite(v) && v > 0 ? v : 0); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => fin(a.duration);
    a.onerror = () => fin(0);
    setTimeout(() => fin(0), 6000);
    a.src = u;
  });
}

async function importFiles(files) {
  let ok = 0, skipped = 0, failed = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    toast(`Importing ${i + 1} of ${files.length}…`, 0);
    if (S.songs.some((s) => s.fileName === f.name && s.size === f.size)) { skipped++; continue; }
    try {
      const tags = await readTags(f);
      const fb = titleFromFilename(f.name);
      const blob = new Blob([await f.arrayBuffer()], { type: f.type || guessType(f.name) });
      const [duration, art] = await Promise.all([probeDuration(blob), tags.art ? shrinkArt(tags.art) : null]);
      const song = {
        id: uid(), title: tags.title || fb.title, artist: tags.artist || fb.artist || '', album: tags.album || '',
        art, duration, size: f.size, fileName: f.name, addedAt: Date.now() + i, liked: false,
      };
      await db.put('files', blob, song.id);
      await db.put('songs', song);
      S.songs.push(song);
      ok++;
    } catch (err) {
      console.error('import failed', f.name, err);
      failed++;
    }
  }
  let msg = `Imported ${plural(ok, 'song')}`;
  if (skipped) msg += ` · ${skipped} already in library`;
  if (failed) msg += ` · ${failed} failed`;
  toast(msg, 3500);
  try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
  if (S.tab === 'playlists' && !S.playlist) S.tab = 'songs';
  render();
}

/* ================= playback ================= */
// iOS only lets an <audio> element start playing on its own after it has played once during a tap.
// On the first tap we play a short silent clip to unlock it, so later async play() calls work.
function silentWavUrl() {
  const n = 800, b = new ArrayBuffer(44 + n), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true); new Uint8Array(b, 44).fill(128);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
const SILENT = silentWavUrl();
let unlocked = false;
function unlock() {
  if (unlocked) return;
  unlocked = true;
  if (loadedId) return;
  audio.src = SILENT;
  audio.play().then(() => { if (audio.src === SILENT) audio.pause(); }).catch(() => {});
}
document.addEventListener('touchend', unlock, true);
document.addEventListener('click', unlock, true);

function playFrom(ctx, id, opts = {}) {
  const list = contextList(ctx).map((s) => s.id);
  if (!list.length) return;
  if (opts.shuffle !== undefined) { P.shuffle = opts.shuffle; local.set('shuffle', P.shuffle); updateModes(); }
  P.context = list;
  P.ctx = ctx;
  let start = id ? list.indexOf(id) : P.shuffle ? Math.floor(Math.random() * list.length) : 0;
  if (start < 0) start = 0;
  if (P.shuffle) { P.queue = [list[start], ...shuffled(list.filter((_, i) => i !== start))]; P.idx = 0; }
  else { P.queue = list.slice(); P.idx = start; }
  P.resumeAt = 0;
  loadAndPlay();
}

let loadToken = 0;
async function loadAndPlay(autoplay = true) {
  const id = curId();
  const s = songById(id);
  if (!s) return;
  const token = ++loadToken;
  const blob = await db.get('files', id);
  if (token !== loadToken) return;
  if (!blob) { toast(`Audio file missing for “${s.title}”`); return; }
  if (curUrl) URL.revokeObjectURL(curUrl);
  curUrl = URL.createObjectURL(blob);
  loadedId = id;
  audio.src = curUrl;
  if (P.resumeAt) {
    const t = P.resumeAt;
    P.resumeAt = 0;
    audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = t; } catch { /* ignore */ } }, { once: true });
  }
  updateNowPlaying();
  highlightRows();
  saveSession();
  if (autoplay) { try { await audio.play(); } catch (err) { console.warn('play failed', err); } }
  updatePlayState();
}

function toggle() {
  if (!curId()) { if (S.songs.length) playFrom(S.tab === 'liked' ? 'liked' : 'songs'); return; }
  if (loadedId !== curId()) { loadAndPlay(); return; }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}
function next(auto = false) {
  if (!P.queue.length) return;
  if (auto && P.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
  if (P.idx < P.queue.length - 1) P.idx++;
  else if (P.repeat === 'all' || !auto) P.idx = 0;
  else { audio.pause(); audio.currentTime = 0; updatePlayState(); return; }
  P.resumeAt = 0;
  loadAndPlay();
}
function prev() {
  if (!P.queue.length) return;
  if (audio.currentTime > 3 || (P.idx === 0 && P.repeat !== 'all')) { audio.currentTime = 0; return; }
  P.idx = P.idx > 0 ? P.idx - 1 : P.queue.length - 1;
  P.resumeAt = 0;
  loadAndPlay();
}
function toggleShuffle() {
  P.shuffle = !P.shuffle;
  local.set('shuffle', P.shuffle);
  const cur = curId();
  if (cur) {
    if (P.shuffle) { P.queue = [cur, ...shuffled(P.queue.filter((_, i) => i !== P.idx))]; P.idx = 0; }
    else { P.queue = P.context.length ? P.context.slice() : P.queue; P.idx = Math.max(0, P.queue.indexOf(cur)); }
    saveSession();
  }
  updateModes();
  toast(P.shuffle ? 'Shuffle on' : 'Shuffle off', 1200);
}
function cycleRepeat() {
  P.repeat = { off: 'all', all: 'one', one: 'off' }[P.repeat];
  local.set('repeat', P.repeat);
  updateModes();
  toast({ off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' }[P.repeat], 1200);
}
function playNext(id) {
  if (!curId()) { P.queue = [id]; P.context = [id]; P.ctx = ''; P.idx = 0; loadAndPlay(); return; }
  P.queue.splice(P.idx + 1, 0, id);
  saveSession();
  toast('Playing next');
}
function addToQueue(id) {
  if (!curId()) return playNext(id);
  P.queue.push(id);
  saveSession();
  toast('Added to queue');
}
function showQueue() {
  const upcoming = P.queue.slice(P.idx + 1, P.idx + 61).map((id, i) => ({ s: songById(id), i: P.idx + 1 + i })).filter((x) => x.s);
  if (!upcoming.length) return toast('Nothing up next');
  sheet({
    title: 'Up next', subtitle: ctxLabel(P.ctx),
    items: upcoming.map(({ s, i }) => ({ label: `${s.title}${s.artist ? ' · ' + s.artist : ''}`, icon: 'music', fn: () => { P.idx = i; P.resumeAt = 0; loadAndPlay(); } })),
  });
}

/* ================= now playing UI ================= */
function updateNowPlaying() {
  const s = songById(curId());
  const mini = $('#mini');
  if (!s) { mini.classList.add('hidden'); document.body.classList.remove('has-mini'); closeNow(); return; }
  mini.classList.remove('hidden');
  document.body.classList.add('has-mini');
  $('#miniArt').innerHTML = artInner(s);
  $('#miniTitle').textContent = s.title;
  $('#miniArtist').textContent = s.artist || 'Unknown artist';
  $('#nowArt').innerHTML = artInner(s);
  $('#nowTitle').textContent = s.title;
  $('#nowArtist').textContent = s.artist || 'Unknown artist';
  $('#nowCtx').textContent = ctxLabel(P.ctx);
  const u = artUrl(s);
  $('#nowBg').style.backgroundImage = u ? `url("${u}")` : '';
  const like = $('#nowLike');
  like.innerHTML = icon(s.liked ? 'heart-fill' : 'heart');
  like.classList.toggle('on', !!s.liked);
  if (!loadedId && s.duration) {
    const p = Math.min(1, (P.resumeAt || 0) / s.duration);
    $('#miniBar').style.width = p * 100 + '%';
    seek.value = Math.round(p * 1000);
    $('#tCur').textContent = fmt(P.resumeAt || 0);
    $('#tDur').textContent = fmt(s.duration);
    setFill();
  }
  setMediaMeta(s);
}

function updatePlayState() {
  const playing = !!loadedId && !audio.paused;
  const ic = icon(playing ? 'pause' : 'play');
  $('#miniPlay').innerHTML = ic;
  $('#nowPlay').innerHTML = ic;
  document.body.classList.toggle('is-playing', playing);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}
function updateModes() {
  $('#btnShuffle').classList.toggle('on', P.shuffle);
  const r = $('#btnRepeat');
  r.classList.toggle('on', P.repeat !== 'off');
  r.classList.toggle('one', P.repeat === 'one');
}
const setFill = () => seek.style.setProperty('--p', seek.value / 10 + '%');
function updateProgress() {
  if (!loadedId) return;
  const d = audio.duration, t = audio.currentTime;
  const p = isFinite(d) && d > 0 ? t / d : 0;
  $('#miniBar').style.width = p * 100 + '%';
  if (!seeking) { seek.value = Math.round(p * 1000); $('#tCur').textContent = fmt(t); setFill(); }
  $('#tDur').textContent = fmt(isFinite(d) ? d : songById(loadedId)?.duration || 0);
}
function openNow() { $('#now').classList.add('open'); $('#now').setAttribute('aria-hidden', 'false'); document.body.classList.add('now-open'); }
function closeNow() { $('#now').classList.remove('open'); $('#now').setAttribute('aria-hidden', 'true'); document.body.classList.remove('now-open'); }

seek.addEventListener('input', () => {
  seeking = true;
  const d = isFinite(audio.duration) ? audio.duration : songById(curId())?.duration || 0;
  $('#tCur').textContent = fmt((seek.value / 1000) * d);
  setFill();
});
seek.addEventListener('change', () => {
  const frac = seek.value / 1000;
  if (loadedId && isFinite(audio.duration)) audio.currentTime = frac * audio.duration;
  else { const s = songById(curId()); if (s?.duration) P.resumeAt = frac * s.duration; }
  seeking = false;
  updatePosition();
});

// swipe down to close the full player
(() => {
  const el = $('#now');
  let y0 = null, dy = 0;
  el.addEventListener('touchstart', (e) => { if (e.target.closest('#seek, .controls')) return; y0 = e.touches[0].clientY; dy = 0; el.style.transition = 'none'; }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); el.style.transform = `translateY(${dy}px)`; }, { passive: true });
  el.addEventListener('touchend', () => { if (y0 == null) return; el.style.transition = ''; el.style.transform = ''; if (dy > 120) closeNow(); y0 = null; });
})();

/* ================= media session (lock screen / Control Center) ================= */
const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
async function setMediaMeta(s) {
  if (!('mediaSession' in navigator)) return;
  let artwork = [{ src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }];
  if (s.art) {
    try {
      let d = artData.get(s.id);
      if (!d) { d = await blobToDataURL(s.art); artData.set(s.id, d); }
      artwork = [{ src: d, sizes: '512x512', type: s.art.type || 'image/jpeg' }];
    } catch { /* keep default */ }
  }
  if (curId() !== s.id) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist || '', album: s.album || '', artwork });
}
function updatePosition() {
  const ms = navigator.mediaSession;
  if (!ms?.setPositionState) return;
  const d = audio.duration;
  if (!isFinite(d) || d <= 0) return;
  try { ms.setPositionState({ duration: d, playbackRate: audio.playbackRate || 1, position: Math.min(audio.currentTime, d) }); } catch { /* ignore */ }
}
if ('mediaSession' in navigator) {
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* unsupported */ } };
  h('play', () => toggle());
  h('pause', () => audio.pause());
  h('previoustrack', prev);
  h('nexttrack', () => next(false));
  h('seekto', (d) => { audio.currentTime = d.seekTime; updatePosition(); });
}

/* ================= audio events ================= */
let lastSave = 0;
audio.addEventListener('play', () => { updatePlayState(); updatePosition(); });
audio.addEventListener('pause', () => { updatePlayState(); updatePosition(); saveSession(); });
audio.addEventListener('ended', () => next(true));
audio.addEventListener('seeked', updatePosition);
audio.addEventListener('timeupdate', () => {
  updateProgress();
  const now = Date.now();
  if (now - lastSave > 5000) { lastSave = now; saveSession(); }
});
audio.addEventListener('loadedmetadata', () => {
  updatePosition();
  const s = songById(loadedId);
  if (s && !s.duration && isFinite(audio.duration)) { s.duration = audio.duration; saveSong(s); }
});
audio.addEventListener('error', () => {
  if (!loadedId || audio.src === SILENT) return;
  const s = songById(loadedId);
  toast(`Can't play “${s?.title || 'this file'}”. This format isn't supported on this device.`, 3500);
});

function saveSession() {
  local.set('session', { queue: P.queue, context: P.context, idx: P.idx, ctx: P.ctx, t: loadedId ? audio.currentTime || 0 : P.resumeAt || 0 });
}
function restoreSession() {
  const ss = local.get('session', null);
  if (!ss?.queue?.length) return;
  const ok = (id) => !!songById(id);
  const cur = ss.queue[ss.idx];
  P.queue = ss.queue.filter(ok);
  P.context = (ss.context || []).filter(ok);
  P.ctx = ss.ctx || '';
  P.idx = Math.max(0, P.queue.indexOf(cur));
  if (!P.queue.length) { P.idx = -1; return; }
  P.resumeAt = ok(cur) ? ss.t || 0 : 0;
}

/* ================= events ================= */
$('#file').addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) importFiles(files);
});

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    if (S.tab === tab.dataset.tab && !S.playlist) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    S.tab = tab.dataset.tab; S.playlist = null; S.query = '';
    render(); window.scrollTo(0, 0);
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, ctx } = el.dataset;
  switch (action) {
    case 'import': $('#file').click(); break;
    case 'play': playFrom(ctx, id); break;
    case 'menu': songMenu(id, ctx); break;
    case 'play-all': playFrom(ctx, null, { shuffle: false }); break;
    case 'shuffle-all': playFrom(ctx, null, { shuffle: true }); break;
    case 'toggle': toggle(); break;
    case 'next': next(false); break;
    case 'prev': prev(); break;
    case 'shuffle': toggleShuffle(); break;
    case 'repeat': cycleRepeat(); break;
    case 'open-now': openNow(); break;
    case 'close-now': closeNow(); break;
    case 'like-current': if (curId()) toggleLike(curId()); break;
    case 'now-menu': {
      const cid = curId();
      if (!cid) break;
      const s = songById(cid);
      sheet({
        title: s.title, subtitle: s.artist, art: s,
        items: [
          { label: 'Up next', icon: 'queue', fn: showQueue },
          { label: 'Add to playlist…', icon: 'list', fn: () => pickPlaylist(cid) },
          { label: 'Edit info…', icon: 'edit', fn: () => editSong(cid) },
        ],
      });
      break;
    }
    case 'sort':
      sheet({
        title: 'Sort by',
        items: Object.entries(SORT_LABEL).map(([k, label]) => ({ label, icon: S.sort === k ? 'check' : '', fn: () => { S.sort = k; local.set('sort', k); render(); } })),
      });
      break;
    case 'new-playlist': newPlaylistForm(null); break;
    case 'open-playlist': S.playlist = id; render(); window.scrollTo(0, 0); break;
    case 'back': S.playlist = null; render(); break;
    case 'pl-menu': playlistMenu(id); break;
    case 'pl-add': addSongsSheet(id); break;
    case 'install-close': $('#install').classList.add('hidden'); local.set('installDismissed', true); break;
  }
});

/* ================= boot ================= */
async function boot() {
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  try {
    [S.songs, S.playlists] = await Promise.all([db.all('songs'), db.all('playlists')]);
  } catch (e) {
    console.error(e);
    toast('Could not open storage on this device', 5000);
  }
  S.playlists.sort((a, b) => a.createdAt - b.createdAt);
  restoreSession();
  render();
  updateNowPlaying();
  updatePlayState();
  updateModes();

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !standalone && !local.get('installDismissed', false)) $('#install').classList.remove('hidden');

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW failed', e));
  }
}
boot();
