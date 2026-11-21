// Hearth server: serves the built UI, proxies a small allowlist of Home Assistant
// API calls, stores family data (members, chores, meals, settings) as JSON, and
// manages the photo folder. No npm dependencies so the add-on image stays tiny.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockHA } from './mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8099);
const IN_ADDON = Boolean(process.env.SUPERVISOR_TOKEN);
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(ROOT, 'dist'));
const DATA_DIR = path.resolve(process.env.DATA_DIR || (IN_ADDON ? '/data' : path.join(ROOT, '.data')));
const STORE_FILE = path.join(DATA_DIR, 'hearth.json');
const VERSION = process.env.HEARTH_VERSION || '0.9.1';

// Add-on options (set on the add-on's Configuration tab in Home Assistant).
let options = {};
try {
  options = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'options.json'), 'utf8'));
} catch {
  /* not running as an add-on */
}

// Photos can live in any folder under HA's /media or /share (photo_directory option).
function resolvePhotoDir() {
  if (process.env.PHOTO_DIR) return path.resolve(process.env.PHOTO_DIR);
  if (!IN_ADDON) return path.join(DATA_DIR, 'photos');
  const wanted = path.resolve(String(options.photo_directory || '/media/hearth'));
  if (['/media', '/share'].some((root) => wanted === root || wanted.startsWith(root + '/'))) return wanted;
  console.warn(`[hearth] photo_directory "${wanted}" must be inside /media or /share; using /media/hearth`);
  return '/media/hearth';
}
const PHOTO_DIR = resolvePhotoDir();
// Optional: your Mealie server's address, used only to show recipe photos.
const MEALIE_URL = String(process.env.MEALIE_URL || options.mealie_url || '').trim().replace(/\/+$/, '');
// Optional: Bar Assistant (cocktail recipes). Talks to its API directly with a personal access token.
const BAR = {
  url: String(process.env.BAR_ASSISTANT_URL || options.bar_assistant_url || '').trim().replace(/\/+$/, ''),
  token: String(process.env.BAR_ASSISTANT_TOKEN || options.bar_assistant_token || '').trim(),
  barId: String(process.env.BAR_ASSISTANT_BAR_ID || options.bar_assistant_bar_id || '').trim(),
};

fs.mkdirSync(DATA_DIR, { recursive: true });
try {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
} catch (e) {
  console.warn(`[hearth] can't create photo folder ${PHOTO_DIR}:`, e.message);
}

// ---------- Home Assistant connection ----------
let haBase = null;
let haToken = null;
let mode = 'demo';
if (IN_ADDON) {
  haBase = 'http://supervisor/core/api';
  haToken = process.env.SUPERVISOR_TOKEN;
  mode = 'addon';
} else if (process.env.HA_URL && process.env.HA_TOKEN) {
  haBase = process.env.HA_URL.replace(/\/+$/, '') + '/api';
  haToken = process.env.HA_TOKEN;
  mode = 'remote';
}
const mock = haBase ? null : createMockHA();

async function ha(method, apiPath, body) {
  if (mock) return mock.handle(method, apiPath, body);
  const res = await fetch(haBase + apiPath, {
    method,
    headers: { Authorization: `Bearer ${haToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  return { status: res.status, data };
}

// One-off Home Assistant websocket command (for things REST can't do, like browsing media).
async function haWs(type, payload = {}) {
  if (mock) return mock.ws(type, payload);
  if (typeof WebSocket === 'undefined') throw new Error('This Node version has no WebSocket support');
  const url = IN_ADDON ? 'ws://supervisor/core/websocket' : haBase.replace(/^http/, 'ws') + '/websocket';
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(url);
    const timer = setTimeout(() => {
      sock.close();
      reject(new Error('Home Assistant did not answer in time'));
    }, 20000);
    const done = (fn, v) => {
      clearTimeout(timer);
      try { sock.close(); } catch { /* closed */ }
      fn(v);
    };
    sock.onerror = () => done(reject, new Error('Could not connect to Home Assistant'));
    sock.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.type === 'auth_required') sock.send(JSON.stringify({ type: 'auth', access_token: haToken }));
      else if (msg.type === 'auth_invalid') done(reject, new Error('Home Assistant rejected the token'));
      else if (msg.type === 'auth_ok') sock.send(JSON.stringify({ id: 1, type, ...payload }));
      else if (msg.type === 'result' && msg.id === 1)
        msg.success ? done(resolve, msg.result) : done(reject, new Error(msg.error?.message || 'Request failed'));
    };
  });
}

// Only these services can be called through Hearth. Locks, alarms, and covers
// (garage doors) are deliberately left out so a wall tablet can't open the house.
const SERVICES = new Set([
  'calendar.create_event',
  'todo.get_items',
  'todo.add_item',
  'todo.update_item',
  'todo.remove_item',
  'todo.remove_completed_items',
  'weather.get_forecasts',
  'media_player.media_play_pause',
  'media_player.media_play',
  'media_player.media_pause',
  'media_player.media_next_track',
  'media_player.media_previous_track',
  'media_player.volume_set',
  'media_player.volume_mute',
  'media_player.shuffle_set',
  'media_player.repeat_set',
  'music_assistant.get_library',
  'music_assistant.search',
  'music_assistant.play_media',
  'light.toggle',
  'switch.toggle',
  'fan.toggle',
  'input_boolean.toggle',
  'scene.turn_on',
  'script.turn_on',
  'grocy.add_generic',
  'grocy.update_generic',
  'grocy.execute_chore',
  'mealie.get_mealplan',
  'mealie.get_recipe',
  'mealie.get_recipes',
  'mealie.set_mealplan',
]);
// Extra checks for services that could otherwise touch more than intended.
const SERVICE_GUARDS = {
  'grocy.add_generic': (b) => b.entity_type === 'shopping_list',
  'grocy.update_generic': (b) => b.entity_type === 'shopping_list',
};
const ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;
// Domains Hearth may read and list.
const ENTITY_DOMAINS = [
  'calendar', 'todo', 'weather', 'media_player', 'light', 'switch', 'fan', 'input_boolean',
  'scene', 'script', 'sensor', 'binary_sensor', 'climate',
];
const haOrigin = () => (haBase ? haBase.replace(/\/api$/, '') : null);

// ---------- JSON store ----------
const STORE_KEYS = new Set(['members', 'chores', 'completions', 'meals', 'settings', 'timers']);
let store = { rev: 0, data: {} };
try {
  store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
} catch {
  /* first run */
}
let writeQueue = Promise.resolve();
function persist() {
  const snapshot = JSON.stringify(store);
  writeQueue = writeQueue
    .then(async () => {
      const tmp = STORE_FILE + '.tmp';
      await fsp.writeFile(tmp, snapshot);
      await fsp.rename(tmp, STORE_FILE);
    })
    .catch((e) => console.error('[hearth] store write failed', e));
}

// ---------- helpers ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};
const PHOTO_RE = /\.(jpe?g|png|gif|webp|avif)$/i;

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, 1_000_000);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function safePhotoName(name) {
  const base = path.basename(String(name || ''));
  return PHOTO_RE.test(base) && !base.startsWith('.') ? base : null;
}

/** Resolves a photo path relative to PHOTO_DIR (subfolders allowed), refusing anything outside it. */
function photoPath(rel) {
  const r = String(rel || '');
  if (!PHOTO_RE.test(r) || r.split('/').some((seg) => !seg || seg.startsWith('.'))) return null;
  const full = path.resolve(PHOTO_DIR, r);
  return full.startsWith(PHOTO_DIR + path.sep) ? full : null;
}

/** Lists photos in PHOTO_DIR and its subfolders (a few levels deep), as relative paths. */
async function listPhotos(dir = PHOTO_DIR, prefix = '', depth = 0, out = []) {
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('@')) continue; // skip hidden / NAS metadata folders
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory() && depth < 4) await listPhotos(path.join(dir, e.name), rel, depth + 1, out);
    else if (e.isFile() && PHOTO_RE.test(e.name)) out.push(rel);
    if (out.length >= 5000) break;
  }
  return out;
}

async function streamFile(res, file, cache) {
  const st = await fsp.stat(file);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': cache,
  });
  fs.createReadStream(file).pipe(res);
}

// ---------- routes ----------
async function route(req, res) {
  const url = new URL(req.url, 'http://local');
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, { error: 'Bad path' });
  }
  const m = req.method;

  if (p === '/api/status') return send(res, 200, { mode, version: VERSION, photoDir: PHOTO_DIR });

  // --- Home Assistant proxy ---
  if (p === '/api/ha/calendars' && m === 'GET') {
    const r = await ha('GET', '/calendars');
    return send(res, r.status, r.data);
  }
  let match = p.match(/^\/api\/ha\/calendars\/([^/]+)$/);
  if (match && m === 'GET') {
    if (!ENTITY_RE.test(match[1])) return send(res, 400, { error: 'Bad entity' });
    const q = new URLSearchParams({
      start: url.searchParams.get('start') || '',
      end: url.searchParams.get('end') || '',
    });
    const r = await ha('GET', `/calendars/${match[1]}?${q}`);
    return send(res, r.status, r.data);
  }
  match = p.match(/^\/api\/ha\/states\/([^/]+)$/);
  if (match && m === 'GET') {
    if (!ENTITY_RE.test(match[1]) || !ENTITY_DOMAINS.includes(match[1].split('.')[0]))
      return send(res, 400, { error: 'Bad entity' });
    const r = await ha('GET', `/states/${match[1]}`);
    return send(res, r.status, r.data);
  }
  if (p === '/api/ha/entities' && m === 'GET') {
    const r = await ha('GET', '/states');
    if (r.status !== 200 || !Array.isArray(r.data)) return send(res, r.status, r.data);
    const list = r.data
      .filter((s) => ENTITY_DOMAINS.includes(s.entity_id.split('.')[0]))
      .map((s) => ({ entity_id: s.entity_id, name: s.attributes?.friendly_name || s.entity_id }));
    return send(res, 200, list);
  }
  // Full states for several domains at once, e.g. ?domains=media_player,light
  if (p === '/api/ha/states' && m === 'GET') {
    const want = (url.searchParams.get('domains') || '').split(',').filter((d) => ENTITY_DOMAINS.includes(d));
    const ids = (url.searchParams.get('ids') || '').split(',').filter((id) => ENTITY_RE.test(id));
    const r = await ha('GET', '/states');
    if (r.status !== 200 || !Array.isArray(r.data)) return send(res, r.status, r.data);
    const list = r.data.filter(
      (s) => ENTITY_DOMAINS.includes(s.entity_id.split('.')[0]) && (want.includes(s.entity_id.split('.')[0]) || ids.includes(s.entity_id)),
    );
    return send(res, 200, list);
  }
  // Album art for a media player (HA serves it behind auth, so proxy it).
  match = p.match(/^\/api\/ha\/media_image\/(media_player\.[a-z0-9_]+)$/);
  if (match && m === 'GET') {
    if (mock) return send(res, 200, mock.albumArt(match[1]), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=60' });
    const st = await ha('GET', `/states/${match[1]}`);
    const pic = st.data?.attributes?.entity_picture;
    if (!pic) return send(res, 404, 'No artwork');
    if (/^https?:\/\//.test(pic)) {
      res.writeHead(302, { Location: pic, 'Cache-Control': 'no-store' });
      return res.end();
    }
    const img = await fetch(haOrigin() + pic, { headers: { Authorization: `Bearer ${haToken}` }, signal: AbortSignal.timeout(15000) });
    if (!img.ok) return send(res, img.status, 'Artwork unavailable');
    const buf = Buffer.from(await img.arrayBuffer());
    return send(res, 200, buf, { 'Content-Type': img.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'max-age=300' });
  }
  // Edit / delete calendar events (HA only offers these over the websocket API).
  match = p.match(/^\/api\/ha\/calendar_event\/(update|delete)$/);
  if (match && m === 'POST') {
    const b = await readJson(req);
    if (!ENTITY_RE.test(b.entity_id || '') || !String(b.entity_id).startsWith('calendar.') || !b.uid)
      return send(res, 400, { error: 'Bad event' });
    const payload = {
      entity_id: b.entity_id,
      uid: String(b.uid),
      ...(b.recurrence_id ? { recurrence_id: String(b.recurrence_id) } : {}),
    };
    if (match[1] === 'update') {
      const e = b.event || {};
      payload.event = {
        summary: String(e.summary || '').slice(0, 500),
        dtstart: e.dtstart,
        dtend: e.dtend,
        ...(e.location ? { location: String(e.location) } : {}),
        ...(e.description ? { description: String(e.description) } : {}),
      };
    }
    await haWs(`calendar/event/${match[1]}`, payload);
    return send(res, 200, { ok: true });
  }

  // Browse a media player's library (playlists, albums -> tracks), like HA's media browser.
  match = p.match(/^\/api\/ha\/browse\/(media_player\.[a-z0-9_]+)$/);
  if (match && m === 'GET') {
    const id = url.searchParams.get('id');
    const type = url.searchParams.get('type');
    const result = await haWs('media_player/browse_media', {
      entity_id: match[1],
      ...(id ? { media_content_id: id } : {}),
      ...(type ? { media_content_type: type } : {}),
    });
    return send(res, 200, result);
  }
  // Artwork that HA serves behind its own login (relative /api/... thumbnails).
  if (p === '/api/ha/image' && m === 'GET') {
    const path_ = url.searchParams.get('path') || '';
    if (!/^\/api\/(media_player_proxy|image_proxy|media_source)\//.test(path_)) return send(res, 400, 'Bad path');
    if (mock) return send(res, 404, 'No image');
    const img = await fetch(haOrigin() + path_, { headers: { Authorization: `Bearer ${haToken}` }, signal: AbortSignal.timeout(15000) });
    if (!img.ok) return send(res, img.status, 'Image unavailable');
    return send(res, 200, Buffer.from(await img.arrayBuffer()), { 'Content-Type': img.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'max-age=3600' });
  }
  // --- Bar Assistant (cocktails) ---
  if (p === '/api/bar/status' && m === 'GET') return send(res, 200, await barStatus());
  if (p === '/api/bar/cocktails' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!BAR.url) return mock ? send(res, 200, mock.cocktails(q)) : send(res, 404, { error: 'Bar Assistant is not set up' });
    const params = new URLSearchParams({ per_page: '60', include: 'images,ingredients' });
    if (q) params.set('filter[name]', q);
    const r = await bar(`/cocktails?${params}`);
    return send(res, 200, (r.data ?? []).map(cocktailSummary));
  }
  match = p.match(/^\/api\/bar\/cocktails\/([\w-]{1,120})$/);
  if (match && m === 'GET') {
    if (!BAR.url) return mock ? send(res, 200, mock.cocktail(match[1])) : send(res, 404, { error: 'Bar Assistant is not set up' });
    const r = await bar(`/cocktails/${match[1]}`);
    return send(res, 200, cocktailFull(r.data ?? r));
  }
  if (p === '/api/bar/image' && m === 'GET') {
    const u = url.searchParams.get('u') || '';
    if (u.startsWith('mock:') && mock) return send(res, 200, mock.cocktailArt(u.slice(5)), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' });
    if (!BAR.url || new URL(u, BAR.url).origin !== new URL(BAR.url).origin) return send(res, 400, 'Bad image');
    const img = await fetch(new URL(u, BAR.url), { headers: { Authorization: `Bearer ${BAR.token}` }, signal: AbortSignal.timeout(15000) });
    if (!img.ok) return send(res, img.status, 'No photo');
    return send(res, 200, Buffer.from(await img.arrayBuffer()), { 'Content-Type': img.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'max-age=86400' });
  }

  // --- place suggestions for event locations (Photon / OpenStreetMap), biased to home ---
  if (p === '/api/places' && m === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 120);
    if (q.length < 3) return send(res, 200, []);
    if (mock) return send(res, 200, mock.places(q));
    if (!homeLoc) {
      const c = await ha('GET', '/config').catch(() => null);
      homeLoc = c?.data?.latitude != null ? { lat: c.data.latitude, lon: c.data.longitude } : {};
    }
    const params = new URLSearchParams({ q, limit: '6' });
    if (homeLoc.lat != null) {
      params.set('lat', String(homeLoc.lat));
      params.set('lon', String(homeLoc.lon));
    }
    try {
      const r = await fetch(`https://photon.komoot.io/api/?${params}`, {
        headers: { 'User-Agent': `Hearth-HomeAssistant-addon/${VERSION}` },
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json();
      const out = (data.features ?? []).map((f) => {
        const pr = f.properties ?? {};
        const street = [pr.housenumber, pr.street].filter(Boolean).join(' ');
        const label = pr.name || street || pr.city || q;
        const sub = [pr.name ? street : '', pr.city && pr.city !== label ? pr.city : '', pr.state, pr.country]
          .filter(Boolean)
          .join(', ');
        return { label, sub };
      });
      return send(res, 200, out);
    } catch {
      return send(res, 200, []);
    }
  }

  // --- what's connected (Settings → Integrations) ---
  if (p === '/api/integrations' && m === 'GET') {
    const [entries, states, targets] = await Promise.all([
      ha('GET', '/config/config_entries/entry').catch(() => ({ data: [] })),
      ha('GET', '/states').catch(() => ({ data: [] })),
      notifyTargets().catch(() => []),
    ]);
    const domains = new Set((Array.isArray(entries.data) ? entries.data : []).filter((e) => e.state === 'loaded').map((e) => e.domain));
    const st = Array.isArray(states.data) ? states.data : [];
    const count = (d) => st.filter((x) => x.entity_id.startsWith(d + '.')).length;
    return send(res, 200, {
      mode,
      domains: [...domains],
      counts: { calendar: count('calendar'), todo: count('todo'), weather: count('weather'), media_player: count('media_player'), notify: targets.length },
      grocy: domains.has('grocy') || st.some((x) => x.entity_id.startsWith('sensor.grocy_')),
      taskmate: domains.has('taskmate') || st.some((x) => x.entity_id.endsWith('_overview') && Array.isArray(x.attributes?.children)),
      barAssistant: await barStatus(),
      mealieImages: Boolean(MEALIE_URL) || Boolean(mock),
    });
  }

  // Mealie integration's config entry id (needed for every mealie.* service).
  if (p === '/api/ha/mealie' && m === 'GET') {
    const r = await ha('GET', '/config/config_entries/entry?domain=mealie');
    const entry = Array.isArray(r.data) ? r.data.find((e) => e.state === 'loaded') ?? r.data[0] : null;
    return send(res, 200, { entry_id: entry?.entry_id ?? null, images: Boolean(MEALIE_URL || mock) });
  }
  // Recipe photos, fetched from Mealie (its media endpoints are public) so https/mixed-content isn't an issue.
  match = p.match(/^\/api\/mealie\/image\/([\w-]{1,64})$/);
  if (match && m === 'GET') {
    if (mock) return send(res, 200, mock.recipeArt(match[1]), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' });
    if (!MEALIE_URL) return send(res, 404, 'Set mealie_url in the add-on options to show recipe photos');
    try {
      const img = await fetch(`${MEALIE_URL}/api/media/recipes/${match[1]}/images/min-original.webp`, { signal: AbortSignal.timeout(15000) });
      if (!img.ok) return send(res, img.status, 'No photo');
      const buf = Buffer.from(await img.arrayBuffer());
      return send(res, 200, buf, { 'Content-Type': img.headers.get('content-type') || 'image/webp', 'Cache-Control': 'max-age=86400' });
    } catch (e) {
      return send(res, 502, 'Mealie unreachable');
    }
  }
  // Music Assistant's config entry id (needed for music_assistant.get_library).
  if (p === '/api/ha/music_assistant' && m === 'GET') {
    const r = await ha('GET', '/config/config_entries/entry?domain=music_assistant');
    const entry = Array.isArray(r.data) ? r.data.find((e) => e.state === 'loaded') ?? r.data[0] : null;
    return send(res, 200, { entry_id: entry?.entry_id ?? null });
  }
  // Phones and other notify targets available in HA.
  if (p === '/api/ha/notify_targets' && m === 'GET') {
    return send(res, 200, await notifyTargets());
  }
  if (p === '/api/notify/test' && m === 'POST') {
    const body = await readJson(req);
    const targets = await notifyTargets();
    if (!targets.includes(body.target)) return send(res, 400, { error: 'Unknown notify target' });
    const r = await sendNotify([body.target], 'Hearth', 'Test notification from your family display 👋');
    return send(res, r ? 200 : 502, { ok: r });
  }
  match = p.match(/^\/api\/ha\/services\/([a-z_]+)\/([a-z_]+)$/);
  if (match && m === 'POST') {
    const svc = `${match[1]}.${match[2]}`;
    if (!SERVICES.has(svc)) return send(res, 403, { error: `Service ${svc} not allowed` });
    const body = await readJson(req);
    if (SERVICE_GUARDS[svc] && !SERVICE_GUARDS[svc](body)) return send(res, 403, { error: `That use of ${svc} isn't allowed` });
    const qs = url.searchParams.has('return_response') ? '?return_response' : '';
    const r = await ha('POST', `/services/${match[1]}/${match[2]}${qs}`, body);
    return send(res, r.status, r.data);
  }

  // --- store ---
  if (p === '/api/store' && m === 'GET') return send(res, 200, store);
  match = p.match(/^\/api\/store\/([a-z]+)$/);
  if (match && m === 'PUT') {
    if (!STORE_KEYS.has(match[1])) return send(res, 400, { error: 'Unknown key' });
    const body = await readJson(req);
    store.data[match[1]] = body.value;
    store.rev += 1;
    persist();
    return send(res, 200, { rev: store.rev });
  }

  // --- photos ---
  if (p === '/api/photos' && m === 'GET') {
    const files = (await listPhotos()).sort();
    return send(res, 200, files);
  }
  if (p === '/api/photos' && m === 'POST') {
    const original = safePhotoName(url.searchParams.get('name'));
    if (!original) return send(res, 400, { error: 'Unsupported file type' });
    const buf = await readBody(req, 30_000_000);
    const name = `${Date.now()}-${original.replace(/[^\w.-]+/g, '_')}`;
    await fsp.writeFile(path.join(PHOTO_DIR, name), buf);
    return send(res, 200, { name });
  }
  match = p.match(/^\/api\/photos\/(.+)$/);
  if (match && m === 'DELETE') {
    const file = photoPath(match[1]);
    if (!file) return send(res, 400, { error: 'Bad name' });
    await fsp.rm(file, { force: true });
    return send(res, 200, { ok: true });
  }
  match = p.match(/^\/photos\/(.+)$/);
  if (match && m === 'GET') {
    const file = photoPath(match[1]);
    if (!file) return send(res, 404, 'Not found');
    try {
      return await streamFile(res, file, 'public, max-age=86400');
    } catch {
      return send(res, 404, 'Not found');
    }
  }

  if (p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });

  // --- static UI with SPA fallback ---
  if (m !== 'GET' && m !== 'HEAD') return send(res, 405, 'Method not allowed');
  let file = path.normalize(path.join(DIST_DIR, p));
  if (!file.startsWith(DIST_DIR)) return send(res, 403, 'Forbidden');
  try {
    if ((await fsp.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    await fsp.access(file);
  } catch {
    file = path.join(DIST_DIR, 'index.html');
  }
  try {
    const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    return await streamFile(res, file, cache);
  } catch {
    return send(res, 404, 'UI not built. Run `npm run build`, or use `npm run dev` for development.');
  }
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    console.error('[hearth]', req.method, req.url, e);
    if (!res.headersSent) send(res, e.status || 502, { error: e.message || String(e) });
  });
});



let homeLoc = null;

// ---------- Bar Assistant ----------
// Bar Assistant installs differ: the API may live at /api, /bar/api (behind Salt Rim), or the address itself.
let barBase = null;
async function barApiBase() {
  if (barBase) return barBase;
  const root = BAR.url.replace(/\/api$/, '');
  const candidates = [...new Set([BAR.url.endsWith('/api') ? BAR.url : null, `${root}/api`, `${root}/bar/api`, root].filter(Boolean))];
  const tried = [];
  for (const base of candidates) {
    try {
      const r = await fetch(`${base}/server/version`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('json')) {
        barBase = base;
        console.log(`[hearth] Bar Assistant API found at ${base}`);
        return base;
      }
      tried.push(`${base} (${r.status}, not the API)`);
    } catch (e) {
      tried.push(`${base} (${e.cause?.code || e.message})`);
    }
  }
  throw Object.assign(new Error(`Couldn’t find the Bar Assistant API. Check the address. Tried: ${tried.join('; ')}`), { status: 502 });
}
let barIdCache = BAR.barId || null;
async function barFetch(path_, withBar) {
  const base = await barApiBase();
  const res = await fetch(base + path_, {
    headers: {
      Authorization: `Bearer ${BAR.token}`,
      Accept: 'application/json',
      ...(withBar && barIdCache ? { 'Bar-Assistant-Bar-Id': barIdCache } : {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error('Bar Assistant sent back a web page instead of data. Check the address.'), { status: 502 });
  }
  if (res.status === 401) throw Object.assign(new Error('Bar Assistant rejected the token. Create a new personal access token and paste it into the add-on options.'), { status: 502 });
  if (res.status === 403) throw Object.assign(new Error('The Bar Assistant token isn’t allowed to read cocktails. Create a token with read access.'), { status: 502 });
  if (!res.ok) throw Object.assign(new Error(`Bar Assistant: ${data?.message || res.status}`), { status: 502 });
  return data;
}
async function bar(path_) {
  if (!barIdCache) {
    const bars = await barFetch('/bars', false);
    barIdCache = String(bars.data?.[0]?.id ?? '');
    if (!barIdCache) throw Object.assign(new Error('No bars found in Bar Assistant. Create one (or join one) in Bar Assistant first.'), { status: 502 });
  }
  return barFetch(path_, true);
}
/** Connection check for Settings / Recipes. */
async function barStatus() {
  if (!BAR.url) return mock ? { configured: true, ok: true } : { configured: false, ok: false };
  if (!BAR.token) return { configured: true, ok: false, error: 'Add your Bar Assistant API token in the add-on options.' };
  try {
    await bar('/cocktails?per_page=1');
    return { configured: true, ok: true, base: barBase, bar: barIdCache };
  } catch (e) {
    console.warn('[hearth] Bar Assistant:', e.message);
    return { configured: true, ok: false, error: e.message };
  }
}
const barImage = (c) => {
  const img = c.images?.[0] ?? c.main_image ?? null;
  const u = img?.url || img?.thumb_url || c.image_url || null;
  return u ? `api/bar/image?u=${encodeURIComponent(u)}` : null;
};
const cocktailSummary = (c) => ({ id: String(c.slug || c.id), name: c.name, description: c.description || null, image: barImage(c) });
const cocktailFull = (c) => ({
  ...cocktailSummary(c),
  garnish: c.garnish || null,
  glass: c.glass?.name || null,
  method: c.method?.name || null,
  instructions: c.instructions || '',
  ingredients: (c.ingredients ?? []).map((i) => ({
    name: i.ingredient?.name ?? i.name ?? '',
    amount: i.amount ?? null,
    amount_max: i.amount_max ?? null,
    units: i.units ?? i.unit ?? '',
    optional: Boolean(i.optional),
    note: i.note || null,
  })),
});

// ---------- notifications (runs in the add-on, so phones get one alert, not one per tablet) ----------
const pad2 = (n) => String(n).padStart(2, '0');
const localKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const sent = new Set();

async function notifyTargets() {
  const r = await ha('GET', '/services');
  if (r.status !== 200 || !Array.isArray(r.data)) return [];
  const n = r.data.find((d) => d.domain === 'notify');
  return Object.keys(n?.services ?? {})
    .filter((s) => s !== 'send_message' && /^[a-z0-9_]+$/.test(s))
    .map((s) => `notify.${s}`)
    .sort();
}

async function sendNotify(targets, title, message) {
  let ok = false;
  for (const t of targets) {
    const [domain, svc] = String(t).split('.');
    if (domain !== 'notify' || !/^[a-z0-9_]+$/.test(svc || '')) continue;
    try {
      const r = await ha('POST', `/services/notify/${svc}`, { title, message });
      ok = ok || r.status < 300;
      if (r.status >= 300) console.warn(`[hearth] notify.${svc} failed: ${r.status}`);
    } catch (e) {
      console.warn(`[hearth] notify.${svc} failed:`, e.message);
    }
  }
  return ok;
}

const notifySettings = () => store.data.settings?.notify ?? {};
const fmtClock = (d) => {
  const h24 = store.data.settings?.clock24;
  return h24 ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : `${d.getHours() % 12 || 12}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

function tickTimers() {
  const n = notifySettings();
  if (!n.targets?.length || n.timers === false) return;
  for (const t of store.data.timers ?? []) {
    if (t.pausedLeft != null || t.endsAt > Date.now()) continue;
    const key = `timer:${t.id}:${t.endsAt}`;
    if (sent.has(key) || Date.now() - t.endsAt > 5 * 60000) continue;
    sent.add(key);
    sendNotify(n.targets, '⏰ Timer done', `${t.label || 'Timer'} is done`);
  }
}

async function tickMinute() {
  const n = notifySettings();
  if (!n.targets?.length) return;
  const now = new Date();

  // Event reminders N minutes ahead.
  const ahead = Number(n.eventMinutes) || 0;
  if (ahead > 0) {
    try {
      const cals = await ha('GET', '/calendars');
      const hidden = new Set(store.data.settings?.hiddenCalendars ?? []);
      const end = new Date(now.getTime() + (ahead + 1) * 60000);
      for (const c of Array.isArray(cals.data) ? cals.data : []) {
        if (hidden.has(c.entity_id)) continue;
        const q = new URLSearchParams({ start: now.toISOString(), end: end.toISOString() });
        const r = await ha('GET', `/calendars/${c.entity_id}?${q}`);
        for (const e of Array.isArray(r.data) ? r.data : []) {
          if (!e.start?.dateTime) continue; // skip all-day events
          const start = new Date(e.start.dateTime);
          const mins = (start - now) / 60000;
          if (mins <= 0 || mins > ahead) continue;
          const key = `event:${c.entity_id}:${e.uid ?? e.summary}:${start.getTime()}`;
          if (sent.has(key)) continue;
          sent.add(key);
          sendNotify(n.targets, `📅 ${e.summary || 'Event'}`, `${fmtClock(start)}${e.location ? ` · ${e.location}` : ''} (in ${Math.round(mins)} min)`);
        }
      }
    } catch (e) {
      console.warn('[hearth] reminder check failed:', e.message);
    }
  }

  // Daily "chores left" nudge at a set time.
  if (n.choreTime && `${pad2(now.getHours())}:${pad2(now.getMinutes())}` === n.choreTime) {
    const key = `chores:${localKey(now)}`;
    if (!sent.has(key)) {
      sent.add(key);
      const done = new Set(store.data.completions?.[localKey(now)] ?? []);
      const lines = (store.data.members ?? [])
        .map((m) => {
          const left = (store.data.chores ?? []).filter(
            (c) => c.memberId === m.id && (!c.days?.length || c.days.includes(now.getDay())) && !done.has(c.id),
          );
          return left.length ? `${m.name}: ${left.map((c) => c.title).join(', ')}` : null;
        })
        .filter(Boolean);
      if (lines.length) sendNotify(n.targets, '🧹 Chores left today', lines.join('\n'));
    }
  }
  if (sent.size > 2000) sent.clear();
}

setInterval(tickTimers, 5000);
setInterval(() => tickMinute().catch(() => undefined), 60000);

server.listen(PORT, () => {
  console.log(`[hearth] v${VERSION} listening on :${PORT} (mode: ${mode})`);
  if (mode === 'demo') console.log('[hearth] No Home Assistant configured: serving demo data. Set HA_URL + HA_TOKEN to connect.');
});
