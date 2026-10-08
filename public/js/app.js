/* DjessTube — front (vanilla JS, aucune dépendance de build) */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svg = p => `<svg viewBox="0 0 24 24">${p}</svg>`;
const I = {
  heart: svg('<path d="M12 21s-7-4.4-9.3-9A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 9.3 6c-2.3 4.6-9.3 9-9.3 9z"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/>'),
  theatre: svg('<rect x="2" y="6" width="20" height="12" rx="2"/>'),
  loop: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
  ext: svg('<path d="M14 3h7v7M10 14L21 3M19 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>'),
  dl: svg('<path d="M12 3v12m0 0l-5-5m5 5l5-5M4 20h16"/>'),
  play: svg('<path d="M7 4v16l13-8z" fill="currentColor"/>'),
  pause: svg('<path d="M8 4v16M16 4v16" stroke-width="3.5"/>'),
  left: svg('<path d="M15 5l-7 7 7 7"/>'), right: svg('<path d="M9 5l7 7-7 7"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  hist: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'),
  shuffle: svg('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  install: svg('<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M12 7v7m0 0l-3-3m3 3l3-3"/>'),
};

/* ============ stockage ============ */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('dt:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('dt:' + k, JSON.stringify(v)); } catch { /* quota / privé */ } },
};
const S = {
  favs: LS.get('favs', []), later: LS.get('later', []), hist: LS.get('hist', []),
  searches: LS.get('searches', []), prog: LS.get('prog', {}),
  set: Object.assign({ theme: 'dark', accent: 'pink', autoplay: true, dlServer: '', speed: 1 }, LS.get('set', {})),
  queue: [], theatre: false, loop: false,
};
const save = k => LS.set(k, S[k === 'set' ? 'set' : k]);
const V = {}; // registre id → vidéo
const pick = v => ({ id: v.id, title: v.title, channel: v.channel, duration: v.duration, views: v.views, thumb: v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, live: v.live });
const reg = list => (list.forEach(v => { V[v.id] = Object.assign(V[v.id] || {}, v); }), list);
[...S.favs, ...S.later, ...S.hist].forEach(v => (V[v.id] = v));

/* ============ utilitaires ============ */
const fmtT = s => { if (!s) return ''; s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const fmtViews = v => { if (v == null || v === '') return ''; if (typeof v === 'string') return v.replace(/\s*(vues|views)/i, ' vues').replace(/ | /g, ' '); return v >= 1e6 ? (v / 1e6).toFixed(1).replace('.0', '') + ' M de vues' : v >= 1e3 ? Math.round(v / 1e3) + ' k vues' : v + ' vues'; };
const fmtSize = b => !b ? '' : b > 1e9 ? (b / 1e9).toFixed(1) + ' Go' : b > 1e6 ? Math.round(b / 1e6) + ' Mo' : Math.round(b / 1e3) + ' Ko';
const clean = t => (t || 'video').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
const YT_ID = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/))([\w-]{11})/;
const isUrl = s => /^(https?:\/\/|www\.)\S+$/i.test(s.trim());
const dlBase = () => (S.set.dlServer || '').replace(/\/+$/, '');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function api(path, opt) {
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Erreur ' + r.status);
  return j;
}
const searchCache = new Map();
async function searchVideos(q) {
  const k = q.toLowerCase();
  if (!searchCache.has(k)) searchCache.set(k, api('/api/search?q=' + encodeURIComponent(q)).then(reg));
  try { return await searchCache.get(k); } catch (e) { searchCache.delete(k); throw e; }
}

function toast(msg, action) {
  const el = document.createElement('div'); el.className = 'toast';
  el.innerHTML = `<span>${msg}</span>` + (action ? `<a href="${action.href}" ${action.target ? 'target="_blank" rel="noopener"' : ''}>${action.label}</a>` : '');
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 3600);
}

/* ============ thèmes / réglages ============ */
function applyTheme() {
  document.documentElement.dataset.theme = S.set.theme;
  document.documentElement.dataset.accent = S.set.accent;
  const c = { dark: '#09060f', amoled: '#000', light: '#f6f3fd' }[S.set.theme];
  $('meta[name=theme-color]').content = c;
}
function cycleTheme() {
  const order = ['dark', 'amoled', 'light'];
  S.set.theme = order[(order.indexOf(S.set.theme) + 1) % 3]; save('set'); applyTheme();
  toast('Thème : ' + { dark: 'sombre', amoled: 'AMOLED', light: 'clair' }[S.set.theme]);
}

/* ============ capacités serveur ============ */
let caps = { download: false, mode: 'cloud' };
async function loadCaps() {
  try { caps = await api(dlBase() + '/api/capabilities'); } catch { caps = { download: false, mode: 'cloud' }; }
}

/* ============ bibliothèque ============ */
const inList = (k, id) => S[k].some(v => v.id === id);
function toggleList(k, v) {
  if (inList(k, v.id)) S[k] = S[k].filter(x => x.id !== v.id);
  else S[k].unshift(pick(v));
  save(k); return inList(k, v.id);
}
function addHistory(v) {
  S.hist = [pick(v), ...S.hist.filter(x => x.id !== v.id)].slice(0, 120); save('hist');
}
function addQueue(v) {
  if (S.queue.some(x => x.id === v.id)) return toast('Déjà dans la file');
  S.queue.push(pick(v)); toast('Ajouté à la file d’attente'); refreshQueueTab();
}

/* ============ cartes ============ */
const CATS = [
  { e: '🔥', n: 'Tendances musique', q: 'musique nouveautés hits du moment', c: ['#ff2e88', '#ff7a59'] },
  { e: '🎤', n: 'Rap FR', q: 'rap français nouveautés clip', c: ['#8b5cf6', '#ec4899'] },
  { e: '🎮', n: 'Gaming', q: 'gaming meilleurs moments', c: ['#22d3ee', '#3b82f6'] },
  { e: '🎬', n: 'Bandes-annonces', q: 'bande annonce officielle film', c: ['#f59e0b', '#ef4444'] },
  { e: '😂', n: 'Humour', q: 'sketch humour drôle', c: ['#fbbf24', '#f97316'] },
  { e: '📚', n: 'Apprendre', q: 'comment apprendre tutoriel débutant', c: ['#10b981', '#22d3ee'] },
  { e: '⚽', n: 'Football', q: 'football meilleurs buts résumé', c: ['#22c55e', '#15803d'] },
  { e: '🎧', n: 'Lofi & chill', q: 'lofi chill beats to relax', c: ['#6366f1', '#a855f7'] },
  { e: '🍳', n: 'Cuisine', q: 'recette facile cuisine', c: ['#f97316', '#dc2626'] },
  { e: '🌍', n: 'Documentaires', q: 'documentaire complet français', c: ['#0ea5e9', '#14b8a6'] },
  { e: '🎙️', n: 'Podcasts', q: 'podcast interview français', c: ['#a855f7', '#6366f1'] },
  { e: '🏋️', n: 'Sport & fitness', q: 'séance sport fitness maison', c: ['#ef4444', '#f59e0b'] },
  { e: '🚗', n: 'Auto & moto', q: 'voiture test essai', c: ['#64748b', '#334155'] },
  { e: '🤖', n: 'Tech & IA', q: 'technologie intelligence artificielle actualité', c: ['#06b6d4', '#8b5cf6'] },
  { e: '🎨', n: 'Art & DIY', q: 'dessin diy créatif', c: ['#ec4899', '#f43f5e'] },
  { e: '✈️', n: 'Voyage', q: 'voyage vlog découverte', c: ['#38bdf8', '#2563eb'] },
];

function card(v, o = {}) {
  const fav = inList('favs', v.id), lat = inList('later', v.id);
  const pr = S.prog[v.id], pct = pr && pr.d ? Math.min(100, pr.t / pr.d * 100) : 0;
  const meta = [v.channel, fmtViews(v.views), v.published].filter(Boolean).join(' · ');
  const thumb = `<div class="thumb"><img loading="lazy" decoding="async" alt="" src="${esc(v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}">
      <div class="play"><i></i></div>
      ${v.live ? '<span class="badge live">LIVE</span>' : v.duration ? `<span class="badge">${fmtT(v.duration)}</span>` : ''}
      ${pct > 2 ? `<span class="bar" style="width:${pct}%"></span>` : ''}
      <div class="acts">
        <button data-act="fav" class="${fav ? 'on' : ''}" title="Favori" aria-label="Favori">${I.heart}</button>
        <button data-act="later" class="${lat ? 'on' : ''}" title="Regarder plus tard" aria-label="Plus tard">${I.clock}</button>
        <button data-act="queue" title="Ajouter à la file" aria-label="File">${I.plus}</button>
      </div></div>`;
  const i = `style="--i:${o.i || 0}"`;
  if (o.row) return `<div class="card row ${o.cur ? 'cur' : ''}" data-id="${v.id}" ${i}>${thumb}<div class="txt"><h3>${esc(v.title)}</h3><p>${esc(meta)}</p></div></div>`;
  return `<div class="card" data-id="${v.id}" ${i}>${thumb}<h3>${esc(v.title)}</h3><p>${esc(meta)}</p></div>`;
}
const skeletons = (n, row) => Array.from({ length: n }, () => `<div class="card skel ${row ? 'row' : ''}"><div class="thumb"></div><div class="txt" style="flex:1"><div class="l"></div><div class="l s"></div></div></div>`).join('');

document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  const c = e.target.closest('.card[data-id]');
  if (a && c) {
    e.preventDefault(); e.stopPropagation();
    const v = V[c.dataset.id]; if (!v) return;
    if (a.dataset.act === 'fav') { const on = toggleList('favs', v); a.classList.toggle('on', on); toast(on ? '❤ Ajouté aux favoris' : 'Retiré des favoris'); }
    if (a.dataset.act === 'later') { const on = toggleList('later', v); a.classList.toggle('on', on); toast(on ? '⏱ Ajouté à « plus tard »' : 'Retiré de « plus tard »'); }
    if (a.dataset.act === 'queue') addQueue(v);
    return;
  }
  if (c) { location.hash = '#/watch/' + c.dataset.id; return; }
  const chip = e.target.closest('[data-q]');
  if (chip) { e.preventDefault(); go(chip.dataset.q); }
}, true);

/* ============ recherche + suggestions ============ */
const qEl = $('#q'), sugg = $('#sugg');
let suggSel = -1;
function go(q) { qEl.value = q; sugg.hidden = true; submitSearch(q); }
function submitSearch(q) {
  q = q.trim(); if (!q) return;
  if (isUrl(q)) return openUrl(q);
  S.searches = [q, ...S.searches.filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 12); save('searches');
  location.hash = '#/search/' + encodeURIComponent(q);
}
function openUrl(u) {
  if (!/^https?:/i.test(u)) u = 'https://' + u;
  const m = YT_ID.exec(u);
  if (m) location.hash = '#/watch/' + m[1];
  else if (caps.download) location.hash = '#/url/' + encodeURIComponent(u);
  else toast('Seuls les liens YouTube marchent en ligne. Lance l’appli en local pour les autres sites.');
}
$('#searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const sel = $('.sugg button.sel', sugg);
  submitSearch(sel ? sel.dataset.v : qEl.value); qEl.blur(); sugg.hidden = true;
});
const loadSugg = debounce(async () => {
  const q = qEl.value.trim();
  let html = '';
  if (!q) {
    if (S.searches.length) html = '<h6>Recherches récentes</h6>' + S.searches.map(s => `<button type="button" data-v="${esc(s)}">${I.hist}<span>${esc(s)}</span><span class="x" data-del="${esc(s)}">${I.x}</span></button>`).join('');
  } else if (!isUrl(q)) {
    const hist = S.searches.filter(s => s.toLowerCase().includes(q.toLowerCase())).slice(0, 3);
    let list = [];
    try { list = await api('/api/suggest?q=' + encodeURIComponent(q)); } catch { /* ignore */ }
    if (qEl.value.trim() !== q) return;
    const seen = new Set(hist.map(s => s.toLowerCase()));
    html = hist.map(s => `<button type="button" data-v="${esc(s)}">${I.hist}<span>${esc(s)}</span></button>`).join('') +
      list.filter(s => !seen.has(s.toLowerCase())).map(s => `<button type="button" data-v="${esc(s)}">${I.search}<span>${esc(s)}</span></button>`).join('');
  }
  sugg.innerHTML = html; sugg.hidden = !html; suggSel = -1;
}, 170);
qEl.addEventListener('input', loadSugg);
qEl.addEventListener('focus', loadSugg);
qEl.addEventListener('keydown', e => {
  const items = $$('button', sugg); if (sugg.hidden || !items.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); suggSel = (suggSel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items.forEach((b, i) => b.classList.toggle('sel', i === suggSel)); qEl.value = items[suggSel].dataset.v;
  }
  if (e.key === 'Escape') sugg.hidden = true;
});
sugg.addEventListener('mousedown', e => {
  e.preventDefault();
  const del = e.target.closest('[data-del]');
  if (del) { S.searches = S.searches.filter(s => s !== del.dataset.del); save('searches'); loadSugg(); return; }
  const b = e.target.closest('button'); if (b) go(b.dataset.v);
});
document.addEventListener('click', e => { if (!e.target.closest('.search')) sugg.hidden = true; });
$('#btnPaste').onclick = async () => {
  try { const t = (await navigator.clipboard.readText()).trim(); if (!t) return toast('Presse-papiers vide'); qEl.value = t; submitSearch(t); }
  catch { toast('Autorise l’accès au presse-papiers, ou colle le lien dans la barre.'); qEl.focus(); }
};

/* ============ lecteur persistant ============ */
const box = $('#pbox'), dv = $('#dv');
let yt = null, ytReady = false, pending = null, cur = null, route = { name: 'home' }, relatedList = [], progTimer = null, sleepT = null;
function loadYT() {
  if (window.YT && YT.Player) return initYT();
  if ($('#ytapi')) return;
  const s = document.createElement('script'); s.id = 'ytapi'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
  window.onYouTubeIframeAPIReady = initYT;
}
function initYT() {
  if (yt) return;
  yt = new YT.Player('ytp', {
    width: '100%', height: '100%',
    playerVars: { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1, origin: location.origin },
    events: { onReady() { ytReady = true; if (pending) { yt.loadVideoById(pending); pending = null; } }, onStateChange: onYTState, onError: onYTError },
  });
}
function play(v, start) {
  cur = pick(v); V[cur.id] = Object.assign(V[cur.id] || {}, cur);
  dv.hidden = true; dv.pause(); dv.removeAttribute('src');
  $('#ytp').style.display = '';
  const pr = S.prog[v.id];
  const startSeconds = start ?? (pr && pr.d && pr.d - pr.t > 15 && pr.t > 8 ? Math.floor(pr.t) : 0);
  const arg = { videoId: v.id, startSeconds };
  if (ytReady) yt.loadVideoById(arg); else { pending = arg; loadYT(); }
  addHistory(cur);
  $('#miniTitle').textContent = cur.title || '';
  document.title = (cur.title || 'Lecture') + ' — DjessTube';
  setMediaSession(); layoutPlayer();
}
function playDirect(url, title) {
  if (yt && ytReady) yt.stopVideo();
  $('#ytp').style.display = 'none';
  dv.hidden = false; dv.src = dlBase() + '/api/stream?url=' + encodeURIComponent(url); dv.play().catch(() => {});
  cur = cur || { id: 'direct', title }; $('#miniTitle').textContent = title || '';
  layoutPlayer();
}
function onYTState(e) {
  const st = e.data;
  $('#miniPlay').innerHTML = st === 1 ? I.pause : I.play;
  if (st === 1) {
    try { yt.setPlaybackRate(S.set.speed || 1); } catch { /* ignore */ }
    clearInterval(progTimer);
    progTimer = setInterval(() => {
      if (!cur || !yt.getCurrentTime) return;
      const d = yt.getDuration(); if (!d) return;
      S.prog[cur.id] = { t: yt.getCurrentTime(), d }; save('prog');
    }, 5000);
  } else clearInterval(progTimer);
  if (st === 0) {
    if (cur) delete S.prog[cur.id]; save('prog');
    if (S.loop) { yt.seekTo(0); yt.playVideo(); } else nextVideo();
  }
}
function onYTError(e) {
  if (!cur) return;
  const link = { href: 'https://www.youtube.com/watch?v=' + cur.id, target: 1, label: 'Ouvrir sur YouTube' };
  if (caps.download) { toast('Lecture intégrée bloquée, bascule sur le lecteur direct…'); playDirect('https://www.youtube.com/watch?v=' + cur.id, cur.title); }
  else toast([100].includes(e.data) ? 'Vidéo privée ou supprimée.' : 'Cette vidéo bloque la lecture intégrée.', link);
}
function layoutPlayer() {
  const slot = $('#slot');
  if (route.name === 'watch' || route.name === 'url') {
    if (slot) {
      const r = slot.getBoundingClientRect();
      box.className = 'pbox';
      box.style.cssText = `top:${r.top + scrollY}px;left:${r.left + scrollX}px;width:${r.width}px;height:${r.height}px`;
      return;
    }
  }
  box.style.cssText = '';
  box.className = cur ? 'pbox mini' : 'pbox hidden';
}
addEventListener('resize', layoutPlayer);
setInterval(() => { if (route.name === 'watch' || route.name === 'url') layoutPlayer(); }, 350);
function togglePlay() {
  if (!dv.hidden) return dv.paused ? dv.play() : dv.pause();
  if (!yt || !ytReady) return;
  yt.getPlayerState() === 1 ? yt.pauseVideo() : yt.playVideo();
}
$('#miniPlay').onclick = togglePlay;
$('#miniPlay').innerHTML = I.pause;
$('#miniOpen').onclick = () => { if (cur) location.hash = '#/watch/' + cur.id; };
$('#miniClose').onclick = () => {
  if (yt && ytReady) yt.stopVideo(); dv.pause(); cur = null; clearInterval(progTimer);
  document.title = 'DjessTube'; layoutPlayer();
};
function nextVideo() {
  let v = S.queue.shift();
  if (!v && S.set.autoplay) v = relatedList.find(x => x.id !== (cur && cur.id));
  if (!v) return;
  refreshQueueTab();
  if (route.name === 'watch') location.hash = '#/watch/' + v.id; else play(v);
}
function setMediaSession() {
  if (!('mediaSession' in navigator) || !cur) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title || '', artist: cur.channel || '', artwork: [{ src: cur.thumb, sizes: '480x360', type: 'image/jpeg' }] });
  navigator.mediaSession.setActionHandler('play', togglePlay);
  navigator.mediaSession.setActionHandler('pause', togglePlay);
  navigator.mediaSession.setActionHandler('nexttrack', nextVideo);
}
function setSleep(min) {
  clearTimeout(sleepT);
  if (!min) return toast('Minuteur désactivé');
  sleepT = setTimeout(() => { if (yt && ytReady) yt.pauseVideo(); dv.pause(); toast('😴 Minuteur terminé — lecture en pause'); }, min * 60000);
  toast(`😴 Pause automatique dans ${min} min`);
}

/* ============ pages ============ */
const view = $('#view');
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Salut' : 'Bonsoir'; };
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#btnInstall') && ($('#btnInstall').hidden = false); });

function renderHome() {
  const cont = S.hist.filter(v => S.prog[v.id] && S.prog[v.id].d && S.prog[v.id].t > 8).slice(0, 12);
  view.innerHTML = `
  <section class="hero">
    <small>✨ ${greet()} — prêt à regarder ?</small>
    <h1>Regarde. <span class="grad">Écoute.</span><br>Télécharge.</h1>
    <p>Cherche une vidéo, colle un lien, garde tes favoris et récupère tes sons en MP3 ou tes vidéos en MP4. Sur ordi, tablette et téléphone.</p>
    <div class="hero-actions">
      <button class="btn pri" id="hPaste">${I.dl} Coller un lien</button>
      <button class="btn" id="hRandom">${I.shuffle} Surprends-moi</button>
      <a class="btn" href="#/library/favs">${I.heart} Mes favoris</a>
      <button class="btn" id="btnInstall" hidden>${I.install} Installer l’appli</button>
    </div>
  </section>
  ${cont.length ? `<div class="sec-head"><h2>▶ Reprendre</h2></div><div class="carousel">${cont.map((v, i) => card(v, { i })).join('')}</div>` : ''}
  <div id="rows"></div>`;
  if (installEvt) $('#btnInstall').hidden = false;
  $('#btnInstall').onclick = async () => { installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('#btnInstall').hidden = true; };
  $('#hPaste').onclick = () => $('#btnPaste').click();
  $('#hRandom').onclick = surprise;
  const rows = $('#rows');
  CATS.slice(0, 6).forEach((c, idx) => {
    const sec = document.createElement('section');
    sec.innerHTML = `<div class="sec-head"><h2>${c.e} ${c.n}</h2><div class="more"><a href="#/search/${encodeURIComponent(c.q)}">Tout voir</a><button data-s="-1" aria-label="Précédent">${I.left}</button><button data-s="1" aria-label="Suivant">${I.right}</button></div></div>
      <div class="carousel">${skeletons(6)}</div>`;
    rows.appendChild(sec);
    const car = $('.carousel', sec);
    sec.querySelectorAll('[data-s]').forEach(b => b.onclick = () => car.scrollBy({ left: b.dataset.s * car.clientWidth * .85, behavior: 'smooth' }));
    const io = new IntersectionObserver(async (en) => {
      if (!en[0].isIntersecting) return; io.disconnect();
      try { const r = await searchVideos(c.q); car.innerHTML = r.slice(0, 14).map((v, i) => card(v, { i })).join(''); }
      catch { car.innerHTML = `<div class="empty" style="flex:1">Impossible de charger cette catégorie 😕</div>`; }
    }, { rootMargin: '300px' });
    io.observe(sec);
  });
}
async function surprise() {
  toast('🎲 Je te trouve une pépite…');
  try {
    const c = CATS[Math.floor(Math.random() * CATS.length)];
    const r = (await searchVideos(c.q)).filter(v => !v.live); const v = r[Math.floor(Math.random() * r.length)];
    location.hash = '#/watch/' + v.id;
  } catch { toast('Oups, réessaie !'); }
}

let sFilter = 'all';
async function renderSearch(q) {
  view.innerHTML = `<div class="chips scroll" id="fchips"></div><div class="grid">${skeletons(12)}</div>`;
  qEl.value = q;
  let list;
  try { list = await searchVideos(q); } catch (e) { view.innerHTML = `<div class="empty"><b>😕</b>La recherche a échoué.<br><small>${esc(e.message)}</small></div>`; return; }
  const F = { all: 'Tout', short: 'Courtes (< 4 min)', mid: '4 – 20 min', long: 'Longues (> 20 min)', live: 'En direct' };
  const filt = v => sFilter === 'all' || (sFilter === 'live' ? v.live : sFilter === 'short' ? v.duration && v.duration < 240 : sFilter === 'mid' ? v.duration >= 240 && v.duration <= 1200 : v.duration > 1200);
  const draw = () => {
    $('#fchips').innerHTML = Object.entries(F).map(([k, n]) => `<button class="chip ${sFilter === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('') +
      `<button class="chip" id="playAll">▶ Tout lire</button>`;
    const l = list.filter(filt);
    $('.grid').innerHTML = l.length ? l.map((v, i) => card(v, { i })).join('') : '<div class="empty" style="grid-column:1/-1"><b>🔍</b>Rien avec ce filtre.</div>';
    $$('[data-f]').forEach(b => b.onclick = () => { sFilter = b.dataset.f; draw(); });
    $('#playAll').onclick = () => { S.queue = l.slice(1).map(pick); location.hash = '#/watch/' + l[0].id; };
  };
  draw();
}

function renderExplore() {
  view.innerHTML = `<div class="sec-head" style="margin-top:0"><h2>Explorer</h2></div>
    <div class="cats">${CATS.map((c, i) => `<button class="cat" data-q="${esc(c.q)}" style="--c1:${c.c[0]};--c2:${c.c[1]};animation:rise .5s ${i * 30}ms both"><span class="e">${c.e}</span>${c.n}</button>`).join('')}</div>`;
}

function renderLibrary(tab = 'favs') {
  const T = { favs: ['❤ Favoris', 'favs'], later: ['⏱ Plus tard', 'later'], hist: ['🕘 Historique', 'hist'] };
  const list = S[tab] || [];
  view.innerHTML = `<div class="chips">${Object.entries(T).map(([k, [n]]) => `<a class="chip ${k === tab ? 'on' : ''}" href="#/library/${k}">${n} <small>${S[k].length}</small></a>`).join('')}</div>
    ${list.length ? `<div class="hero-actions" style="margin:0 0 24px"><button class="btn pri sm" id="lPlay">${I.play} Tout lire</button><button class="btn sm" id="lShuf">${I.shuffle} Aléatoire</button><button class="btn sm" id="lClear">${I.trash} Vider</button></div>
    <div class="grid">${list.map((v, i) => card(v, { i })).join('')}</div>` :
    `<div class="empty"><b>${tab === 'favs' ? '❤' : tab === 'later' ? '⏱' : '🕘'}</b>${tab === 'favs' ? 'Aucun favori pour l’instant.<br>Survole une vidéo et clique sur le cœur.' : tab === 'later' ? 'Rien à regarder plus tard.' : 'Ton historique est vide.'}</div>`}`;
  if (!list.length) return;
  $('#lPlay').onclick = () => { S.queue = list.slice(1).map(pick); location.hash = '#/watch/' + list[0].id; };
  $('#lShuf').onclick = () => { const l = [...list].sort(() => Math.random() - .5); S.queue = l.slice(1); location.hash = '#/watch/' + l[0].id; };
  $('#lClear').onclick = () => { if (confirm('Vider cette liste ?')) { S[tab] = []; save(tab); renderLibrary(tab); } };
}

/* ---- page lecture */
let wToken = 0;
async function renderWatch(id, directUrl) {
  const token = ++wToken;
  const v0 = V[id] || { id, title: 'Chargement…', thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  if (directUrl) {
    // lien hors YouTube (mode local uniquement)
    view.innerHTML = `<div class="watch"><div><div class="slot" id="slot"></div><h1 id="wTitle">Chargement…</h1><div class="meta" id="wMeta"></div><div id="wDl"></div></div><div></div></div>`;
    try {
      const info = await api(dlBase() + '/api/info?url=' + encodeURIComponent(directUrl));
      if (token !== wToken) return;
      cur = null; playDirect(directUrl, info.title);
      $('#wTitle').textContent = info.title; $('#wMeta').textContent = [info.channel, fmtT(info.duration)].filter(Boolean).join(' · ');
      $('#wDl').innerHTML = dlPanel({ id: info.id, title: info.title, thumb: info.thumb, url: directUrl }, true);
      bindDl({ id: info.id, title: info.title, thumb: info.thumb, url: directUrl });
    } catch (e) { $('#wTitle').textContent = 'Lien illisible : ' + e.message; }
    layoutPlayer(); return;
  }
  if (!cur || cur.id !== id) { relatedList = []; play(v0); }
  const theatre = S.theatre;
  view.innerHTML = `<div class="watch ${theatre ? 'theatre' : ''}">
    <div class="main-col">
      <div class="slot" id="slot"></div>
      <h1 id="wTitle">${esc(v0.title)}</h1>
      <div class="meta" id="wMeta"></div>
      <div class="toolbar" id="wBar"></div>
      <div id="wDl" hidden></div>
      <div class="desc" id="wDesc" hidden></div><button class="desc-more" id="wMore" hidden>Afficher plus</button>
    </div>
    <div class="side-col">
      <div class="tabs"><button class="on" data-t="rel">Suggestions</button><button data-t="queue" id="tQueue">File (${S.queue.length})</button></div>
      <div class="list" id="wList">${skeletons(6, true)}</div>
    </div></div>`;
  layoutPlayer();
  paintBar(v0);
  const tabs = $$('.tabs button'); let tab = 'rel';
  tabs.forEach(b => b.onclick = () => { tab = b.dataset.t; tabs.forEach(x => x.classList.toggle('on', x === b)); paintList(); });
  window.paintList = paintList;
  function paintList() {
    const el = $('#wList'); if (!el) return;
    const l = tab === 'rel' ? relatedList : S.queue;
    el.innerHTML = l.length ? l.map((v, i) => card(v, { row: true, i, cur: cur && v.id === cur.id })).join('') :
      `<div class="empty">${tab === 'rel' ? 'Pas de suggestions' : 'La file est vide.<br>Ajoute des vidéos avec ＋'}</div>`;
    if (tab === 'queue' && l.length) el.insertAdjacentHTML('beforeend', `<button class="btn sm" id="qClear">${I.trash} Vider la file</button>`), $('#qClear').onclick = () => { S.queue = []; refreshQueueTab(); paintList(); };
  }
  // infos détaillées
  const infoP = api('/api/info?id=' + id);
  infoP.then(info => {
    if (token !== wToken) return;
    Object.assign(V[id] = V[id] || {}, pick({ ...v0, ...info, id }));
    const v = V[id]; if (cur && cur.id === id) { cur = pick(v); $('#miniTitle').textContent = v.title; document.title = v.title + ' — DjessTube'; setMediaSession(); }
    $('#wTitle').textContent = info.title;
    $('#wMeta').innerHTML = `<span class="ch"><span class="avatar">${esc((info.channel || '?')[0].toUpperCase())}</span>${esc(info.channel)}</span>${info.views ? `<span>${fmtViews(info.views)}</span>` : ''}${info.duration ? `<span>${fmtT(info.duration)}</span>` : ''}`;
    if (info.description) {
      const d = $('#wDesc'); d.hidden = false;
      d.innerHTML = esc(info.description).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
        .replace(/(^|\s)((?:\d{1,2}:)?\d{1,2}:\d{2})(?=\s|$|<)/gm, '$1<a data-seek="$2">$2</a>');
      if (info.description.length > 260) { $('#wMore').hidden = false; $('#wMore').onclick = () => { const o = d.classList.toggle('open'); $('#wMore').textContent = o ? 'Afficher moins' : 'Afficher plus'; }; }
      d.onclick = e => { const a = e.target.closest('[data-seek]'); if (!a) return; const p = a.dataset.seek.split(':').map(Number).reduce((x, y) => x * 60 + y); if (yt && ytReady) { yt.seekTo(p, true); scrollTo({ top: 0, behavior: 'smooth' }); } };
    }
    paintBar(v);
  }).catch(() => {});
  // suggestions (basées sur le vrai titre, donc après les infos si on ne le connaît pas encore)
  const related = t => {
    const key = (t || '').replace(/[\[\(【].*?[\]\)】]/g, '').replace(/[|\-–—:#"“”]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ') || 'musique';
    searchVideos(key).then(l => { if (token !== wToken) return; relatedList = l.filter(x => x.id !== id).slice(0, 15); if (tab === 'rel') paintList(); }).catch(() => { relatedList = []; paintList(); });
  };
  if (V[id] && V[id].title && V[id].title !== 'Chargement…') related(V[id].title);
  else infoP.then(i => related(i.title)).catch(() => related(v0.channel));
  paintList();
}
function refreshQueueTab() { const t = $('#tQueue'); if (t) t.textContent = `File (${S.queue.length})`; if (window.paintList && $('.tabs .on[data-t=queue]')) window.paintList(); }

function paintBar(v) {
  const bar = $('#wBar'); if (!bar) return;
  const f = inList('favs', v.id), l = inList('later', v.id);
  bar.innerHTML = `
    <button class="btn pri sm" data-b="dl">${I.dl} Télécharger</button>
    <button class="btn sm ${f ? 'on' : ''}" data-b="fav">${I.heart} ${f ? 'Favori' : 'Favoris'}</button>
    <button class="btn sm ${l ? 'on' : ''}" data-b="later">${I.clock} Plus tard</button>
    <button class="btn sm" data-b="queue">${I.plus} File</button>
    <button class="btn sm" data-b="share">${I.share} Partager</button>
    <button class="btn sm ${S.theatre ? 'on' : ''}" data-b="theatre">${I.theatre} Cinéma</button>
    <button class="btn sm ${S.loop ? 'on' : ''}" data-b="loop">${I.loop} Boucle</button>
    <select id="selSpeed" title="Vitesse">${[.5, .75, 1, 1.25, 1.5, 1.75, 2].map(s => `<option value="${s}" ${s === (S.set.speed || 1) ? 'selected' : ''}>${s}×</option>`).join('')}</select>
    <select id="selSleep" title="Minuteur de sommeil"><option value="0">😴 Minuteur</option><option>15</option><option>30</option><option>60</option><option>90</option></select>
    <a class="btn sm" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${v.id}">${I.ext} YouTube</a>`;
  $$('#selSleep option').forEach(o => { if (+o.value > 0) o.textContent = `😴 ${o.value} min`; });
  $$('[data-b]', bar).forEach(b => b.onclick = () => barAction(b.dataset.b, v));
  $('#selSpeed').onchange = e => { S.set.speed = +e.target.value; save('set'); if (yt && ytReady) yt.setPlaybackRate(S.set.speed); dv.playbackRate = S.set.speed; };
  $('#selSleep').onchange = e => setSleep(+e.target.value);
}
function barAction(a, v) {
  if (a === 'fav') { const on = toggleList('favs', v); toast(on ? '❤ Ajouté aux favoris' : 'Retiré des favoris'); paintBar(v); }
  if (a === 'later') { const on = toggleList('later', v); toast(on ? '⏱ Ajouté à « plus tard »' : 'Retiré'); paintBar(v); }
  if (a === 'queue') addQueue(v);
  if (a === 'theatre') { S.theatre = !S.theatre; $('.watch').classList.toggle('theatre', S.theatre); paintBar(v); setTimeout(layoutPlayer, 30); }
  if (a === 'loop') { S.loop = !S.loop; paintBar(v); toast(S.loop ? '🔁 Lecture en boucle' : 'Boucle désactivée'); }
  if (a === 'share') {
    const url = 'https://www.youtube.com/watch?v=' + v.id;
    if (navigator.share) navigator.share({ title: v.title, url }).catch(() => {});
    else navigator.clipboard.writeText(url).then(() => toast('🔗 Lien copié')).catch(() => toast(url));
  }
  if (a === 'dl') {
    const p = $('#wDl'); p.hidden = !p.hidden;
    if (!p.hidden) { p.innerHTML = dlPanel(v); bindDl(v); p.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
}

/* ============ téléchargements ============ */
const JOBS = [];
const MAX_MP3_SEC = 25 * 60;
function dlPanel(v, direct) {
  if (caps.download) {
    return `<div class="dl-card"><h3>Télécharger <em>serveur · qualité max</em></h3><div class="dl-grid">
      <button class="dl mp3" data-dl="s-mp3">🎵 MP3<small>192 kbps</small></button>
      <div class="dl mp4"><button data-dl="s-mp4" style="text-align:left;color:#fff;font:inherit;font-weight:700">🎬 MP4<small style="display:block;font-weight:500;opacity:.88;font-size:12.5px">vidéo + son</small></button>
        <select id="sQual"><option value="best">Qualité max</option><option>1080</option><option>720</option><option>480</option><option>360</option></select></div>
      </div><p class="hint">Les fichiers sont aussi gardés dans le dossier <code>downloads</code> du serveur.</p></div>`;
  }
  return `<div class="dl-card"><h3>Télécharger <em>direct dans ton navigateur</em></h3><div id="fmtBox"><p class="hint">Analyse des formats…</p></div></div>`;
}
async function bindDl(v) {
  const p = $('#wDl'); if (!p) return;
  $$('[data-dl]', p).forEach(b => b.onclick = () => startServerJob(v, b.dataset.dl === 's-mp3' ? 'mp3' : 'mp4', $('#sQual') ? $('#sQual').value : 'best'));
  if (caps.download) return;
  const box = $('#fmtBox');
  try {
    const f = await api('/api/formats?id=' + v.id);
    const hd = (f.video || []).filter(x => x.height >= 480);
    box.innerHTML = `<div class="dl-grid">
      ${f.audio ? `<button class="dl mp3" data-c="mp3">🎵 MP3<small>192 kbps · converti ici</small></button>
      <button class="dl m4a" data-c="m4a">🎧 M4A<small>audio d’origine ${fmtSize(f.audio.size)}</small></button>` : ''}
      ${f.muxed ? `<button class="dl mp4" data-c="mp4">🎬 MP4 360p<small>vidéo + son</small></button>` : ''}
      ${hd.length && f.audio ? `<div class="dl hd"><button data-c="hd" style="text-align:left;color:#fff;font:inherit;font-weight:700">✨ MP4 HD<small style="display:block;font-weight:500;opacity:.9;font-size:12.5px">fusion dans ton navigateur</small></button>
        <select id="hdSel">${hd.map(x => `<option value="${x.itag}" data-h="${x.height}">${x.height}p${x.size ? ' · ' + fmtSize(x.size) : ''}</option>`).join('')}</select></div>` : ''}
      </div><p class="hint">Le fichier est reconstitué dans ton navigateur : garde cet onglet ouvert pendant le téléchargement. Pour la qualité maximale et les autres sites, lance DjessTube en local ou renseigne ton serveur dans les <b>Paramètres</b>.</p>`;
    $$('[data-c]', box).forEach(b => b.onclick = () => {
      const k = b.dataset.c, sel = $('#hdSel');
      startCloudJob(v, f, k, k === 'hd' ? { itag: +sel.value, height: +sel.selectedOptions[0].dataset.h } : null);
    });
    if (!box.querySelector('.dl')) box.innerHTML = '<p class="hint err">Aucun format téléchargeable pour cette vidéo.</p>';
  } catch (e) {
    box.innerHTML = `<p class="hint err">Téléchargement indisponible pour cette vidéo (${esc(e.message)}).</p><p class="hint">YouTube refuse parfois les requêtes venant d’un hébergeur. Lance DjessTube en local (<code>run.bat</code>) ou indique l’adresse de ton serveur dans les Paramètres.</p>`;
  }
}

function newJob(v, kind, label) {
  const j = { id: Math.random().toString(36).slice(2), title: v.title, thumb: v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, kind, label: label || 'En attente…', progress: 0, status: 'run' };
  JOBS.unshift(j); badge(); toast('Téléchargement lancé', { href: '#/downloads', label: 'Voir' });
  return j;
}
function upd(j, p) { Object.assign(j, p); const el = document.getElementById('job-' + j.id); if (el) el.outerHTML = jobHtml(j); badge(); }
function badge() { const n = JOBS.filter(j => j.status === 'run').length, b = $('#dlCount'); b.hidden = !n; b.textContent = n; }
function jobHtml(j) {
  const ico = j.kind === 'mp3' ? '🎵' : j.kind === 'm4a' ? '🎧' : '🎬';
  return `<div class="job ${j.status}" id="job-${j.id}"><img src="${esc(j.thumb)}" alt="">
    <div class="info"><b><span class="tag ${j.kind}">${j.kind.toUpperCase()}</span>${esc(j.title)}</b>
    <div class="pb"><div style="width:${Math.max(j.progress, 3)}%"></div></div>
    <span class="${j.status === 'err' ? 'err' : ''}">${j.status === 'done' ? '✔ Terminé' : esc(j.label)}</span></div>
    ${j.status === 'done' ? `<button class="btn sm pri" data-save="${j.id}">${I.dl} Enregistrer</button>` : ''}</div>`;
}
function renderDownloads() {
  view.innerHTML = `<div class="sec-head" style="margin-top:0"><h2>Téléchargements</h2></div>
    ${JOBS.length ? JOBS.map(jobHtml).join('') : `<div class="empty"><b>⬇️</b>Aucun téléchargement pour l’instant.<br>Ouvre une vidéo et clique sur « Télécharger ».</div>`}
    <p class="hint" style="margin-top:20px">Mode actuel : <b>${caps.download ? 'serveur (yt-dlp + ffmpeg)' : 'navigateur'}</b>${S.set.dlServer ? ` — serveur : <code>${esc(S.set.dlServer)}</code>` : ''}</p>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-save]'); if (!b) return;
  const j = JOBS.find(x => x.id === b.dataset.save); if (j && j.blob) saveBlob(j.blob, j.fileName); else if (j && j.href) location.href = j.href;
});
function saveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
}

/* ---- mode serveur (yt-dlp) */
async function startServerJob(v, kind, quality) {
  const j = newJob(v, kind, 'Démarrage…');
  const url = v.url || 'https://www.youtube.com/watch?v=' + v.id;
  try {
    const r = await api(dlBase() + '/api/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, kind, quality, title: v.title }) });
    for (;;) {
      await sleep(700);
      const s = await api(dlBase() + '/api/job/' + r.id);
      if (s.status === 'error') throw new Error((s.error || '').slice(0, 140));
      if (s.status === 'done') { upd(j, { status: 'done', progress: 100, href: dlBase() + '/api/file/' + r.id, fileName: s.file }); location.href = dlBase() + '/api/file/' + r.id; toast('✅ Téléchargement terminé'); return; }
      upd(j, { progress: s.progress || 0, label: s.status === 'converting' ? 'Conversion…' : `${s.progress || 0}% · ${s.speed || ''} · ${s.eta || ''}` });
    }
  } catch (e) { upd(j, { status: 'err', label: 'Erreur : ' + e.message }); toast('❌ ' + e.message); }
}

/* ---- mode navigateur (sans serveur) */
async function chunk(id, itag, start) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`/api/media?id=${id}&itag=${itag}&start=${start}`);
      if (r.ok) return { data: new Uint8Array(await r.arrayBuffer()), total: +r.headers.get('X-Total') };
    } catch { /* retry */ }
    await sleep(700 * (t + 1));
  }
  throw new Error('le serveur a refusé le flux');
}
async function fetchStream(id, itag, onP) {
  const first = await chunk(id, itag, 0), size = first.data.length, total = first.total || size;
  const parts = [first.data]; let got = size; onP(got / total);
  const starts = []; for (let s = size; s < total; s += size) starts.push(s);
  const res = new Array(starts.length); let k = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (k < starts.length) { const i = k++; const c = await chunk(id, itag, starts[i]); res[i] = c.data; got += c.data.length; onP(Math.min(1, got / total)); }
  }));
  return new Blob([...parts, ...res]);
}
const loaded = {};
function loadScript(src) {
  return loaded[src] || (loaded[src] = new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('chargement impossible : ' + src)); document.head.appendChild(s); }));
}
async function toMp3(blob, onP) {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js');
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer()); ctx.close && ctx.close();
  const ch = Math.min(2, buf.numberOfChannels), enc = new lamejs.Mp3Encoder(ch, buf.sampleRate, 192);
  const i16 = f => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const x = Math.max(-1, Math.min(1, f[i])); o[i] = x < 0 ? x * 0x8000 : x * 0x7fff; } return o; };
  const L = i16(buf.getChannelData(0)), R = ch > 1 ? i16(buf.getChannelData(1)) : null, out = [], B = 1152 * 12;
  for (let i = 0, n = 0; i < L.length; i += B, n++) {
    const d = R ? enc.encodeBuffer(L.subarray(i, i + B), R.subarray(i, i + B)) : enc.encodeBuffer(L.subarray(i, i + B));
    if (d.length) out.push(d);
    if (n % 30 === 0) { onP(i / L.length); await sleep(0); }
  }
  out.push(enc.flush());
  return new Blob(out, { type: 'audio/mpeg' });
}
async function mergeHD(vBlob, aBlob, onLabel) {
  await loadScript('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js');
  const blobURL = async (url, type) => URL.createObjectURL(new Blob([await (await fetch(url)).arrayBuffer()], { type }));
  const ff = new FFmpegWASM.FFmpeg();
  onLabel('Chargement du moteur de fusion (≈30 Mo, une fois)…');
  const core = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ff.load({
    coreURL: await blobURL(core + '/ffmpeg-core.js', 'text/javascript'),
    wasmURL: await blobURL(core + '/ffmpeg-core.wasm', 'application/wasm'),
    classWorkerURL: await blobURL('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/814.ffmpeg.js', 'text/javascript'),
  });
  onLabel('Fusion vidéo + son…');
  await ff.writeFile('v.mp4', new Uint8Array(await vBlob.arrayBuffer()));
  await ff.writeFile('a.m4a', new Uint8Array(await aBlob.arrayBuffer()));
  await ff.exec(['-i', 'v.mp4', '-i', 'a.m4a', '-c', 'copy', '-movflags', '+faststart', 'out.mp4']);
  const data = await ff.readFile('out.mp4'); ff.terminate();
  return new Blob([data.buffer], { type: 'video/mp4' });
}
async function startCloudJob(v, f, kind, hd) {
  if ((kind === 'mp3') && v.duration > MAX_MP3_SEC) return toast('Trop long pour la conversion MP3 ici (> 25 min) — choisis M4A.');
  const jk = kind === 'hd' ? 'mp4' : kind;
  const j = newJob(v, jk, 'Téléchargement…');
  const name = clean(v.title);
  try {
    let blob, ext;
    const prog = (a, b, t) => p => upd(j, { progress: a + p * (b - a), label: `${t} ${Math.round(p * 100)}%` });
    if (kind === 'm4a') { blob = await fetchStream(v.id, f.audio.itag, prog(0, 100, 'Audio')); ext = 'm4a'; }
    else if (kind === 'mp4') { blob = await fetchStream(v.id, 18, prog(0, 100, 'Vidéo')); ext = 'mp4'; }
    else if (kind === 'mp3') {
      const a = await fetchStream(v.id, f.audio.itag, prog(0, 60, 'Audio'));
      upd(j, { label: 'Conversion en MP3…' });
      blob = await toMp3(a, p => upd(j, { progress: 60 + p * 40, label: `Conversion MP3 ${Math.round(p * 100)}%` })); ext = 'mp3';
    } else {
      const vb = await fetchStream(v.id, hd.itag, prog(0, 55, `Vidéo ${hd.height}p`));
      const ab = await fetchStream(v.id, f.audio.itag, prog(55, 70, 'Audio'));
      blob = await mergeHD(vb, ab, l => upd(j, { progress: 75, label: l })); ext = 'mp4';
    }
    upd(j, { status: 'done', progress: 100, blob, fileName: `${name}.${ext}` });
    saveBlob(blob, `${name}.${ext}`); toast('✅ Terminé : ' + name.slice(0, 40));
  } catch (e) { upd(j, { status: 'err', label: 'Erreur : ' + (e.message || e) }); toast('❌ ' + (e.message || e)); }
}

/* ============ modales ============ */
const modal = $('#modal');
function openModal(html) { modal.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`; modal.hidden = false; }
function closeModal() { modal.hidden = true; modal.innerHTML = ''; }
modal.addEventListener('mousedown', e => { if (e.target === modal) closeModal(); });

function openSettings() {
  const sw = { pink: 'linear-gradient(135deg,#ff2e88,#8b5cf6)', ocean: 'linear-gradient(135deg,#22d3ee,#3b82f6)', sunset: 'linear-gradient(135deg,#ff6a3d,#ff2e88)', forest: 'linear-gradient(135deg,#34d399,#10b981)', gold: 'linear-gradient(135deg,#fbbf24,#ef4444)' };
  openModal(`<h2>Paramètres <button id="mClose" aria-label="Fermer">${I.x}</button></h2>
    <div class="set"><label>Thème</label><div class="seg">${[['dark', '🌙 Sombre'], ['amoled', '⚫ AMOLED'], ['light', '☀️ Clair']].map(([k, n]) => `<button data-th="${k}" class="${S.set.theme === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div class="set"><label>Couleur</label><div class="seg">${Object.entries(sw).map(([k, g]) => `<button class="sw ${S.set.accent === k ? 'on' : ''}" data-ac="${k}" style="background:${g}" aria-label="${k}"></button>`).join('')}</div></div>
    <div class="set"><button class="toggle ${S.set.autoplay ? 'on' : ''}" id="tAuto" style="width:100%">Lecture automatique de la suite<i></i></button></div>
    <div class="set"><label>Serveur de téléchargement (optionnel)</label>
      <input class="input" id="dlSrv" placeholder="http://localhost:5000" value="${esc(S.set.dlServer)}">
      <p class="hint">Mode actuel : <b>${caps.download ? 'serveur (yt-dlp)' : 'navigateur'}</b>. Renseigne l’adresse d’une instance DjessTube lancée en local (<code>run.bat</code>) pour du MP3 192 kbps et du MP4 jusqu’à 4K, même depuis la version en ligne.</p></div>
    <div class="set"><label>Données</label><div class="seg">
      <button id="bExp">⬆ Exporter</button><button id="bImp">⬇ Importer</button><button id="bClr">🗑 Effacer l’historique</button></div></div>
    <p class="hint">DjessTube · fait avec ♥ — tes données restent dans ton navigateur.</p>`);
  $('#mClose').onclick = closeModal;
  $$('[data-th]').forEach(b => b.onclick = () => { S.set.theme = b.dataset.th; save('set'); applyTheme(); openSettings(); });
  $$('[data-ac]').forEach(b => b.onclick = () => { S.set.accent = b.dataset.ac; save('set'); applyTheme(); openSettings(); });
  $('#tAuto').onclick = e => { S.set.autoplay = !S.set.autoplay; save('set'); e.currentTarget.classList.toggle('on', S.set.autoplay); };
  $('#dlSrv').onchange = async e => { S.set.dlServer = e.target.value.trim(); save('set'); await loadCaps(); toast(caps.download ? '✅ Serveur connecté' : 'Serveur injoignable ou sans yt-dlp'); openSettings(); };
  $('#bClr').onclick = () => { S.hist = []; S.searches = []; S.prog = {}; ['hist', 'searches', 'prog'].forEach(save); toast('Historique effacé'); };
  $('#bExp').onclick = () => saveBlob(new Blob([JSON.stringify({ favs: S.favs, later: S.later, hist: S.hist, set: S.set }, null, 1)], { type: 'application/json' }), 'djesstube-sauvegarde.json');
  $('#bImp').onclick = () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
    i.onchange = async () => { try { const d = JSON.parse(await i.files[0].text()); ['favs', 'later', 'hist'].forEach(k => { if (Array.isArray(d[k])) { S[k] = d[k]; save(k); } }); if (d.set) { Object.assign(S.set, d.set); save('set'); applyTheme(); } toast('✅ Sauvegarde importée'); } catch { toast('Fichier invalide'); } };
    i.click();
  };
}
function openHelp() {
  const K = [['/', 'Aller à la recherche'], ['Espace / K', 'Lecture / pause'], ['N', 'Vidéo suivante'], ['F', 'Ajouter aux favoris'], ['T', 'Mode cinéma'], ['L', 'Boucle'], ['D', 'Panneau de téléchargement'], ['M', 'Changer de thème'], ['G puis H', 'Accueil'], ['?', 'Cette aide']];
  openModal(`<h2>Raccourcis clavier <button id="mClose">${I.x}</button></h2><div class="keys">${K.map(([k, d]) => `<span>${k.split(' ').map(x => x === 'puis' ? ' puis ' : `<kbd>${x}</kbd>`).join('')}</span><span>${d}</span>`).join('')}</div>`);
  $('#mClose').onclick = closeModal;
}
$('#btnSettings').onclick = $('#btnSettingsM').onclick = openSettings;
$('#btnHelp').onclick = openHelp;
$('#btnTheme').onclick = cycleTheme;

let gKey = 0;
addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.target.matches('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase(), onWatch = route.name === 'watch' && cur;
  if (k === '/') { e.preventDefault(); qEl.focus(); qEl.select(); }
  else if (k === '?') openHelp();
  else if (k === 'm') cycleTheme();
  else if (k === 'g') gKey = Date.now();
  else if (k === 'h' && Date.now() - gKey < 1200) location.hash = '#/';
  else if (onWatch && k === 'f') barAction('fav', V[cur.id] || cur);
  else if (onWatch && k === 't') barAction('theatre', cur);
  else if (onWatch && k === 'l') barAction('loop', cur);
  else if (onWatch && k === 'd') barAction('dl', V[cur.id] || cur);
  else if (cur && (k === ' ' || k === 'k') && document.activeElement.tagName !== 'BUTTON') { e.preventDefault(); togglePlay(); }
  else if (cur && k === 'n') nextVideo();
});

/* ============ routeur ============ */
function router() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const name = parts[0] || 'home', arg = decodeURIComponent(parts.slice(1).join('/') || '');
  route = { name, arg };
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === (name === 'search' || name === 'watch' || name === 'url' ? 'home' : name)));
  if (name !== 'watch' && name !== 'url') document.title = cur ? (cur.title + ' — DjessTube') : 'DjessTube';
  scrollTo(0, 0);
  if (name === 'search' && arg) renderSearch(arg);
  else if (name === 'watch' && arg) renderWatch(arg);
  else if (name === 'url' && arg) renderWatch(null, arg);
  else if (name === 'explore') renderExplore();
  else if (name === 'library') renderLibrary(arg || 'favs');
  else if (name === 'downloads') renderDownloads();
  else { route = { name: 'home' }; renderHome(); }
  layoutPlayer();
}
addEventListener('hashchange', router);
addEventListener('offline', () => toast('📡 Tu es hors-ligne'));
addEventListener('online', () => toast('✅ De retour en ligne'));

/* ============ démarrage ============ */
applyTheme();
loadCaps().then(router);
router();
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && location.hostname !== 'localhost') navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
