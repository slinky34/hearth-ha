// Hearth server: serves the built UI, proxies a small allowlist of Home Assistant
// API calls, stores family data (members, chores, meals, settings) as JSON, and
// manages the photo folder. No npm dependencies so the add-on image stays tiny.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createMockHA } from './mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8099);
const IN_ADDON = Boolean(process.env.SUPERVISOR_TOKEN);
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(ROOT, 'dist'));
const DATA_DIR = path.resolve(process.env.DATA_DIR || (IN_ADDON ? '/data' : path.join(ROOT, '.data')));
const STORE_FILE = path.join(DATA_DIR, 'hearth.json');
const VERSION = process.env.HEARTH_VERSION || '0.15.14';

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
// Optional: Immich (photos). Talks to its API directly with an API key.
const IMMICH = {
  url: String(process.env.IMMICH_URL || options.immich_url || '').trim().replace(/\/+$/, '').replace(/\/api$/, ''),
  key: String(process.env.IMMICH_API_KEY || options.immich_api_key || '').trim(),
};
// Optional: Frigate NVR API (unauthenticated port, e.g. http://ccab4aaf-frigate:5000 for the HA add-on).
const FRIGATE_URL = String(process.env.FRIGATE_URL || options.frigate_url || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
// Optional: Grocy's own API (for the Grocy add-on without the HA integration). Found automatically if it's an add-on.
const GROCY = {
  url: String(process.env.GROCY_URL || options.grocy_url || '').trim().replace(/\/+$/, '').replace(/\/api$/, ''),
  key: String(process.env.GROCY_API_KEY || options.grocy_api_key || '').trim(),
};
const BAR = {
  url: String(process.env.BAR_ASSISTANT_URL || options.bar_assistant_url || '').trim().replace(/\/+$/, ''),
  token: String(process.env.BAR_ASSISTANT_TOKEN || options.bar_assistant_token || '').trim(),
  barId: String(process.env.BAR_ASSISTANT_BAR_ID || options.bar_assistant_bar_id || '').trim(),
};

// Optional: an access key for the direct port (8099). Ingress traffic is already behind the HA login.
const ACCESS_KEY = String(process.env.HEARTH_ACCESS_KEY || options.access_key || '').trim();

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
  'ai_task.generate_data',
  'waze_travel_time.get_travel_times',
  'tts.speak',
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
  'scene', 'script', 'sensor', 'binary_sensor', 'climate', 'person', 'camera', 'event', 'tts', 'number',
];
const haOrigin = () => (haBase ? haBase.replace(/\/api$/, '') : null);

// ---------- JSON store ----------
const STORE_KEYS = new Set(['members', 'chores', 'completions', 'meals', 'settings', 'timers', 'rewards', 'redemptions', 'notes']);
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
  '.webmanifest': 'application/manifest+json',
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

// ---------- access control ----------
// Requests through HA ingress come from the Supervisor's ingress proxy, after HA checked the login.
const INGRESS_IP = '172.30.32.2';
const remoteIp = (req) => String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
const viaIngress = (req) => IN_ADDON && remoteIp(req) === INGRESS_IP;
const sha = (s) => crypto.createHash('sha256').update(s).digest();
const KEY_COOKIE = 'hearth_key';
const keyToken = ACCESS_KEY ? sha(`hearth:${ACCESS_KEY}`).toString('hex') : '';
const sameSecret = (a, b) => crypto.timingSafeEqual(sha(String(a)), sha(String(b)));

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function keyPage(res, wrong) {
  res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hearth</title><style>body{font-family:system-ui,sans-serif;background:#faf7f2;color:#2b2420;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#fff;padding:28px;border-radius:16px;box-shadow:0 4px 24px #0001;max-width:340px;width:calc(100% - 32px)}
h1{margin:0 0 8px;font-size:22px}p{margin:0 0 16px;color:#6b625b;font-size:15px}input,button{font:inherit;font-size:17px;width:100%;box-sizing:border-box;padding:12px;border-radius:10px}
input{border:1px solid #d8d0c8;margin-bottom:12px}button{border:0;background:#e8743b;color:#fff;font-weight:600}.e{color:#c0392b}</style></head>
<body><form method="get" action=""><h1>🏡 Hearth</h1><p>Enter the access key from the Hearth add-on's Configuration tab. This screen remembers it.</p>
${wrong ? `<p class="e">${esc('That key is not right.')}</p>` : ''}<input name="key" type="password" autocomplete="current-password" autofocus required>
<button type="submit">Unlock</button></form></body></html>`);
}

/** Returns true when the request may continue; otherwise it has already answered. */
function checkAccess(req, res, url, p) {
  // Never answer pages or API calls for another website (stops other sites from driving Hearth).
  const fetchSite = req.headers['sec-fetch-site'];
  const origin = req.headers.origin;
  if (p.startsWith('/api/') || p.startsWith('/photos/')) {
    if (fetchSite === 'cross-site') return send(res, 403, { error: 'Cross-site request refused' }), false;
    // (Ingress rewrites Host, so this only applies to the direct port.)
    if (origin && !viaIngress(req)) {
      let host = '';
      try { host = new URL(origin).host; } catch { /* bad or "null" origin */ }
      const hosts = [req.headers.host, ...String(req.headers['x-forwarded-host'] || '').split(',')].map((h) => String(h || '').trim()).filter(Boolean);
      if (!hosts.includes(host)) return send(res, 403, { error: 'Cross-site request refused' }), false;
    }
    // Changes must come from Hearth's own page: browsers won't let other sites add this header.
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-hearth'] !== '1')
      return send(res, 403, { error: 'Missing X-Hearth header' }), false;
  }
  if (!ACCESS_KEY || viaIngress(req)) return true;
  const given = url.searchParams.get('key');
  if (given != null && req.method === 'GET' && !p.startsWith('/api/')) {
    if (!sameSecret(given, ACCESS_KEY)) return keyPage(res, true), false;
    url.searchParams.delete('key');
    res.writeHead(302, {
      'Set-Cookie': `${KEY_COOKIE}=${keyToken}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Strict`,
      Location: url.pathname + (url.search || ''),
      'Cache-Control': 'no-store',
    });
    res.end();
    return false;
  }
  const c = cookies(req)[KEY_COOKIE];
  if (c && sameSecret(c, keyToken)) return true;
  if (p.startsWith('/api/') || p.startsWith('/photos/')) return send(res, 401, { error: 'Access key needed' }), false;
  return keyPage(res, false), false;
}

// Kiosk PIN: kept on the server only, checked here, with a short lockout after repeated misses.
const pinFails = new Map();
function pinLocked(ip) {
  const f = pinFails.get(ip);
  return f && f.until > Date.now();
}
function pinMiss(ip) {
  const f = pinFails.get(ip) ?? { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) {
    f.until = Date.now() + 60000 * Math.min(10, f.n - 4);
  }
  pinFails.set(ip, f);
}
const storedPin = () => String(store.data.settings?.kioskPin || '');
const pinOk = (pin) => Boolean(storedPin()) && sameSecret(String(pin ?? ''), storedPin());
/** The store as the browser sees it: the PIN itself never leaves the server. */
function publicStore() {
  const s = store.data.settings;
  if (!s) return store;
  const { kioskPin, ...rest } = s;
  return { rev: store.rev, data: { ...store.data, settings: { ...rest, kioskPin: '', hasKioskPin: Boolean(kioskPin) } } };
}

/** Which entities the Home screen and announcements may act on (picked in Settings). */
function allowedTarget(svc, body) {
  const s = store.data.settings ?? {};
  const id = body?.entity_id;
  if (typeof id !== 'string') return false;
  if (svc === 'tts.speak') return id === s.tts?.engine && body.media_player_entity_id === s.tts?.speaker;
  return Array.isArray(s.controls) && s.controls.includes(id);
}
const TARGET_GUARDED = new Set(['light.toggle', 'switch.toggle', 'fan.toggle', 'input_boolean.toggle', 'scene.turn_on', 'script.turn_on', 'tts.speak']);

/** Refuses uploads when the disk is nearly full. */
async function roomFor(dir, bytes) {
  try {
    const st = await fsp.statfs(dir);
    return st.bavail * st.bsize - bytes > 500_000_000;
  } catch {
    return true;
  }
}

/** HA-served artwork path, checked after the URL is normalized (so ../ tricks can't escape). */
function haImageUrl(raw) {
  const origin = haOrigin();
  if (!origin || typeof raw !== 'string' || !raw.startsWith('/api/') || raw.includes('\\')) return null;
  let u;
  try {
    u = new URL(origin + raw);
  } catch {
    return null;
  }
  const base = new URL(origin);
  const prefix = base.pathname.replace(/\/+$/, '');
  if (u.origin !== base.origin) return null;
  const rest = u.pathname.slice(prefix.length);
  if (!u.pathname.startsWith(prefix + '/') || !/^\/api\/(media_player_proxy|image_proxy|media_source)\/[^/]/.test(rest)) return null;
  return u;
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
  if (!checkAccess(req, res, url, p)) return;

  if (p === '/api/mock/ring' && mock) {
    mock.ring();
    return send(res, 200, { ok: true });
  }
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
    if (mock) return send(res, 404, 'No image');
    const target = haImageUrl(url.searchParams.get('path') || '');
    if (!target) return send(res, 400, 'Bad path');
    const img = await fetch(target, { headers: { Authorization: `Bearer ${haToken}` }, signal: AbortSignal.timeout(15000) });
    if (!img.ok) return send(res, img.status, 'Image unavailable');
    return send(res, 200, Buffer.from(await img.arrayBuffer()), { 'Content-Type': img.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'max-age=3600' });
  }
  // --- Bar Assistant (cocktails) ---
  // --- Magic Import: save a flyer photo where HA's AI Task can read it (media source "local") ---
  if (p === '/api/import/image' && m === 'POST') {
    const name = safePhotoName(url.searchParams.get('name') || 'import.jpg') || 'import.jpg';
    const buf = await readBody(req, 15_000_000);
    const dir = IN_ADDON ? '/media/hearth-import' : path.join(DATA_DIR, 'import');
    await fsp.mkdir(dir, { recursive: true });
    if (!(await roomFor(dir, buf.length))) return send(res, 507, { error: 'The disk is almost full' });
    const file = `${Date.now()}-${name.replace(/[^\w.-]+/g, '_')}`;
    await fsp.writeFile(path.join(dir, file), buf);
    // Clean up imports older than a day.
    for (const f of await fsp.readdir(dir).catch(() => [])) {
      const t = Number(f.split('-')[0]);
      if (t && Date.now() - t > 864e5) fsp.rm(path.join(dir, f), { force: true }).catch(() => undefined);
    }
    return send(res, 200, { media_id: `media-source://media_source/local/hearth-import/${file}` });
  }

  // --- Live camera (MJPEG) through HA's camera_proxy_stream ---
  match = p.match(/^\/api\/ha\/camera_stream\/(camera\.[a-z0-9_]+)$/);
  if (match && m === 'GET') {
    if (mock) return send(res, 200, mock.cameraSnapshot(match[1]), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    const ctrl = new AbortController();
    req.on('close', () => ctrl.abort());
    const r = await fetch(`${haBase}/camera_proxy_stream/${match[1]}`, { headers: { Authorization: `Bearer ${haToken}` }, signal: ctrl.signal });
    if (!r.ok || !r.body) return send(res, r.status || 502, 'Stream unavailable');
    res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'multipart/x-mixed-replace', 'Cache-Control': 'no-store' });
    try {
      for await (const chunk of r.body) res.write(chunk);
    } catch {
      /* viewer closed */
    }
    return res.end();
  }

  // --- Frigate ---
  if (p === '/api/frigate/status' && m === 'GET') return send(res, 200, await frigateStatus(url.searchParams.has('recheck')));
  if (p === '/api/frigate/events' && m === 'GET') {
    const labels = (url.searchParams.get('labels') || '').split(',').filter((x) => /^[a-z_]+$/.test(x));
    const cameras = (url.searchParams.get('cameras') || '').split(',').filter((x) => /^[\w-]+$/.test(x));
    if (mock) return send(res, 200, mock.frigateEvents(labels));
    const fb = await resolveFrigate();
    if (!fb) return send(res, 404, { error: 'Frigate is not set up' });
    const q = new URLSearchParams({ limit: '24', has_snapshot: '1', include_thumbnails: '0' });
    if (labels.length) q.set('labels', labels.join(','));
    if (cameras.length) q.set('cameras', cameras.join(','));
    const r = await fetch(`${fb}/api/events?${q}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return send(res, 502, { error: `Frigate: ${r.status}` });
    const list = await r.json();
    return send(res, 200, list.map((e) => ({ id: e.id, camera: e.camera, label: e.label, sub_label: Array.isArray(e.sub_label) ? e.sub_label[0] : e.sub_label, start: e.start_time, end: e.end_time, score: e.top_score ?? e.data?.top_score ?? e.score })));
  }
  // Frigate's own cameras: list, latest still, and live MJPEG (lower latency than going through HA).
  if (p === '/api/frigate/cameras' && m === 'GET') {
    if (mock) return send(res, 200, ['front_door', 'driveway', 'backyard']);
    const fb = await resolveFrigate();
    if (!fb) return send(res, 200, []);
    try {
      const r = await fetch(`${fb}/api/config`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return send(res, 200, []);
      const cfg = await r.json();
      // Every camera in Frigate's config (a camera switched off at runtime is still a camera you may want).
      let names = Object.keys(cfg.cameras || {});
      if (!names.length) {
        // Fall back to the live stats, which list running cameras.
        const st = await fetch(`${fb}/api/stats`, { signal: AbortSignal.timeout(8000) }).then((x) => (x.ok ? x.json() : {})).catch(() => ({}));
        names = Object.keys(st.cameras || {});
      }
      return send(res, 200, names);
    } catch {
      return send(res, 200, []);
    }
  }
  match = p.match(/^\/api\/frigate\/(live|latest)\/([\w-]{1,64})$/);
  if (match && m === 'GET') {
    const [, kind, cam] = match;
    const h = Math.min(1080, Math.max(120, parseInt(url.searchParams.get('h') || '480', 10) || 480));
    const fps = Math.min(15, Math.max(1, parseInt(url.searchParams.get('fps') || '8', 10) || 8));
    if (mock) return send(res, 200, mock.cameraSnapshot(`camera.${cam}`), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    const fb = await resolveFrigate();
    if (!fb) return send(res, 404, 'Frigate is not set up');
    if (kind === 'latest') {
      const r = await fetch(`${fb}/api/${cam}/latest.jpg?h=${h}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
      if (!r?.ok) return send(res, r?.status || 502, 'Unavailable');
      return send(res, 200, Buffer.from(await r.arrayBuffer()), { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
    }
    const ctrl = new AbortController();
    req.on('close', () => ctrl.abort());
    const r = await fetch(`${fb}/api/${cam}?fps=${fps}&h=${h}`, { signal: ctrl.signal }).catch(() => null);
    if (!r?.ok || !r.body) return send(res, r?.status || 502, 'Stream unavailable');
    res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'multipart/x-mixed-replace;boundary=frame', 'Cache-Control': 'no-store' });
    try {
      for await (const chunk of r.body) res.write(chunk);
    } catch {
      /* viewer closed */
    }
    return res.end();
  }
  match = p.match(/^\/api\/frigate\/(thumbnail|snapshot)\/([\w.-]{5,80})$/);
  if (match && m === 'GET') {
    if (mock) return send(res, 200, mock.cameraSnapshot('event'), { 'Content-Type': 'image/svg+xml' });
    const fb = await resolveFrigate();
    if (!fb) return send(res, 404, 'Not set up');
    const path_ = match[1] === 'thumbnail' ? `thumbnail.jpg` : `snapshot.jpg?bbox=1`;
    const r = await fetch(`${fb}/api/events/${match[2]}/${path_}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return send(res, r.status, 'Unavailable');
    return send(res, 200, Buffer.from(await r.arrayBuffer()), { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400' });
  }

  // --- Doorbell / camera snapshot ---
  match = p.match(/^\/api\/ha\/camera\/(camera\.[a-z0-9_]+)$/);
  if (match && m === 'GET') {
    if (mock) return send(res, 200, mock.cameraSnapshot(match[1]), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    const r = await fetch(`${haBase}/camera_proxy/${match[1]}`, { headers: { Authorization: `Bearer ${haToken}` }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return send(res, r.status, 'Camera unavailable');
    return send(res, 200, Buffer.from(await r.arrayBuffer()), { 'Content-Type': r.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'no-store' });
  }

  // --- Immich (photos) ---
  if (p === '/api/immich/status' && m === 'GET') return send(res, 200, await immichStatus());
  if (p === '/api/immich/albums' && m === 'GET') {
    if (!IMMICH.url) return mock ? send(res, 200, mock.immichAlbums()) : send(res, 404, { error: 'Immich is not set up' });
    const [own, shared] = await Promise.all([immich('/albums'), immich('/albums?shared=true').catch(() => [])]);
    const seen = new Set();
    const list = [...own, ...shared]
      .filter((a) => !seen.has(a.id) && seen.add(a.id))
      .map((a) => ({ id: a.id, name: a.albumName, count: a.assetCount ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return send(res, 200, list);
  }
  match = p.match(/^\/api\/immich\/asset\/([0-9a-f-]{8,64})$/i);
  if (match && m === 'GET') {
    if (!IMMICH.url) return mock ? send(res, 200, mock.immichArt(match[1]), { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' }) : send(res, 404, 'Not set up');
    const r = await fetch(`${IMMICH.url}/api/assets/${match[1]}/thumbnail?size=preview`, {
      headers: { 'x-api-key': IMMICH.key },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return send(res, r.status, 'Photo unavailable');
    return send(res, 200, Buffer.from(await r.arrayBuffer()), { 'Content-Type': r.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'max-age=86400' });
  }
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

  // --- Grocy (direct API, for the add-on without the HA integration) ---
  if (p === '/api/grocy/status' && m === 'GET') return send(res, 200, await grocyStatus());
  if (p === '/api/grocy/data' && m === 'GET') {
    try {
      return send(res, 200, await grocyData());
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  if (p === '/api/grocy/shopping' && m === 'POST') {
    const b = await readJson(req);
    const note = String(b.note || '').trim().slice(0, 200);
    if (!note) return send(res, 400, { error: 'Empty item' });
    try {
      await grocyApi('POST', '/objects/shopping_list', { note, amount: 1, shopping_list_id: 1 });
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  match = p.match(/^\/api\/grocy\/shopping\/(\d+)$/);
  if (match && m === 'PUT') {
    const b = await readJson(req);
    try {
      await grocyApi('PUT', `/objects/shopping_list/${match[1]}`, { done: b.done ? 1 : 0 });
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }
  match = p.match(/^\/api\/grocy\/chores\/(\d+)\/execute$/);
  if (match && m === 'POST') {
    try {
      await grocyApi('POST', `/chores/${match[1]}/execute`, {});
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 502, { error: e.message });
    }
  }

  // Which entities belong to an integration (Grocy's sensor names vary).
  match = p.match(/^\/api\/integration_entities\/(grocy)$/);
  if (match && m === 'GET') return send(res, 200, await integrationEntities(match[1]).catch(() => []));

  // --- what's connected (Settings → Integrations) ---
  if (p === '/api/integrations' && m === 'GET') {
    const [domains, states, targets, grocyEnts, grocyDirect] = await Promise.all([
      loadedDomains().catch(() => new Set()),
      ha('GET', '/states').catch(() => ({ data: [] })),
      notifyTargets().catch(() => []),
      integrationEntities('grocy').catch(() => []),
      grocyStatus().catch(() => ({ configured: false, ok: false })),
    ]);
    const st = Array.isArray(states.data) ? states.data : [];
    const count = (d) => st.filter((x) => x.entity_id.startsWith(d + '.')).length;
    return send(res, 200, {
      mode,
      domains: [...domains],
      counts: { calendar: count('calendar'), todo: count('todo'), weather: count('weather'), media_player: count('media_player'), notify: targets.length },
      grocy: domains.has('grocy') || grocyEnts.length > 0 || st.some((x) => x.entity_id.startsWith('sensor.grocy_')) || grocyDirect.ok,
      grocyDirect,
      taskmate: domains.has('taskmate') || st.some((x) => x.entity_id.endsWith('_overview') && Array.isArray(x.attributes?.children)),
      barAssistant: await barStatus(),
      immich: await immichStatus(),
      frigate: await frigateStatus(),
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
    if (TARGET_GUARDED.has(svc) && !allowedTarget(svc, body))
      return send(res, 403, { error: `Add ${body?.entity_id || 'that entity'} in Settings first` });
    const qs = url.searchParams.has('return_response') ? '?return_response' : '';
    const r = await ha('POST', `/services/${match[1]}/${match[2]}${qs}`, body);
    return send(res, r.status, r.data);
  }

  // --- store ---
  if (p === '/api/store' && m === 'GET') return send(res, 200, publicStore());
  if (p === '/api/pin/check' && m === 'POST') {
    const ip = remoteIp(req);
    if (pinLocked(ip)) return send(res, 429, { error: 'Too many tries. Wait a minute.' });
    const b = await readJson(req);
    if (!storedPin()) return send(res, 200, { ok: true });
    if (pinOk(b.pin)) {
      pinFails.delete(ip);
      return send(res, 200, { ok: true });
    }
    pinMiss(ip);
    return send(res, 200, { ok: false });
  }
  if (p === '/api/pin/set' && m === 'POST') {
    const ip = remoteIp(req);
    if (pinLocked(ip)) return send(res, 429, { error: 'Too many tries. Wait a minute.' });
    const b = await readJson(req);
    const pin = String(b.pin ?? '');
    if (!/^\d{0,8}$/.test(pin)) return send(res, 400, { error: 'Digits only, up to 8' });
    // Changing an existing PIN needs the current one, except from Home Assistant itself (ingress, signed in).
    if (storedPin() && !viaIngress(req) && !pinOk(b.current)) {
      pinMiss(ip);
      return send(res, 403, { error: 'The current PIN is not right' });
    }
    store.data.settings = { ...(store.data.settings ?? {}), kioskPin: pin };
    store.rev += 1;
    persist();
    return send(res, 200, { rev: store.rev, hasKioskPin: Boolean(pin) });
  }
  match = p.match(/^\/api\/store\/([a-z]+)$/);
  if (match && m === 'PUT') {
    if (!STORE_KEYS.has(match[1])) return send(res, 400, { error: 'Unknown key' });
    const body = await readJson(req);
    if (match[1] === 'settings') {
      // The PIN only changes through /api/pin/set; keep the stored one.
      const v = body.value && typeof body.value === 'object' ? { ...body.value } : {};
      delete v.hasKioskPin;
      v.kioskPin = storedPin();
      body.value = v;
    }
    store.data[match[1]] = body.value;
    store.rev += 1;
    persist();
    return send(res, 200, { rev: store.rev });
  }

  // --- photos ---
  if (p === '/api/photos' && m === 'GET') {
    const files = (await listPhotos()).sort();
    try {
      files.push(...(await immichPhotoIds()).map((id) => `immich:${id}`));
    } catch (e) {
      console.warn('[hearth] Immich photos:', e.message);
    }
    return send(res, 200, files);
  }
  if (p === '/api/photos' && m === 'POST') {
    const original = safePhotoName(url.searchParams.get('name'));
    if (!original) return send(res, 400, { error: 'Unsupported file type' });
    const buf = await readBody(req, 30_000_000);
    if (!(await roomFor(PHOTO_DIR, buf.length))) return send(res, 507, { error: 'The disk is almost full' });
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
  if (file !== DIST_DIR && !file.startsWith(DIST_DIR + path.sep)) return send(res, 403, 'Forbidden');
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



// ---------- what HA has installed ----------
// Loaded integrations (websocket works from inside an add-on; REST is the fallback).
let domainsCache = { at: 0, set: new Set() };
async function loadedDomains() {
  if (Date.now() - domainsCache.at < 60000) return domainsCache.set;
  let list = null;
  try {
    list = await haWs('config_entries/get');
  } catch {
    const r = await ha('GET', '/config/config_entries/entry').catch(() => null);
    list = r?.data;
  }
  const set = new Set((Array.isArray(list) ? list : []).filter((e) => e.state === 'loaded').map((e) => e.domain));
  domainsCache = { at: Date.now(), set };
  return set;
}

// Entities an integration created, from the entity registry (names can be anything, even translated).
const regCache = {};
async function integrationEntities(platform) {
  const c = regCache[platform];
  if (c && Date.now() - c.at < 5 * 60000) return c.list;
  let list = [];
  try {
    const reg = await haWs('config/entity_registry/list');
    list = (Array.isArray(reg) ? reg : []).filter((e) => e.platform === platform && !e.disabled_by).map((e) => ({ entity_id: e.entity_id, key: String(e.unique_id || '') }));
  } catch {
    const r = await ha('POST', '/template', { template: `{{ integration_entities('${platform}') | list | tojson }}` }).catch(() => null);
    if (Array.isArray(r?.data)) list = r.data.map((id) => ({ entity_id: id, key: '' }));
  }
  regCache[platform] = { at: Date.now(), list };
  return list;
}

let homeLoc = null;

// ---------- Grocy (direct API) ----------
let grocyBase = GROCY.url;
let grocyNote = '';
let grocyCheckedAt = 0;
async function probeGrocy(base) {
  try {
    const r = await fetch(`${base}/api/system/info`, { headers: GROCY.key ? { 'GROCY-API-KEY': GROCY.key } : {}, signal: AbortSignal.timeout(4000) });
    // 401 still means "this is Grocy" (the key is missing or wrong).
    return r.ok ? 'ok' : r.status === 401 ? 'auth' : String(r.status);
  } catch (e) {
    return e.cause?.code || e.message;
  }
}
let grocyTried = [];
async function resolveGrocy() {
  if (mock) return '';
  if (Date.now() - grocyCheckedAt < (grocyBase ? 10 * 60000 : 60000)) return grocyBase;
  grocyCheckedAt = Date.now();
  grocyNote = '';
  grocyTried = [];
  if (GROCY.url) return (grocyBase = GROCY.url);
  if (!IN_ADDON) return (grocyBase = '');
  // Candidates: what the Supervisor reports (if it lets us look), plus the usual Grocy add-on hostname.
  const candidates = [];
  try {
    const sup = (path_) =>
      fetch(`http://supervisor${path_}`, { headers: { Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}` }, signal: AbortSignal.timeout(5000) }).then((r) => {
        if (!r.ok) throw new Error(`Supervisor ${r.status}`);
        return r.json();
      });
    const list = (await sup('/addons'))?.data?.addons ?? [];
    for (const a of list.filter((x) => /grocy/i.test(x.slug))) {
      if (a.state !== 'started') {
        grocyTried.push(`${a.name} is ${a.state}`);
        continue;
      }
      const info = (await sup(`/addons/${a.slug}/info`).catch(() => null))?.data;
      const ports = [...Object.keys(info?.network || {}).map((k) => parseInt(k, 10)), 80, 9192, info?.ingress_port].filter(Boolean);
      candidates.push({ name: a.name, host: a.slug.replace(/_/g, '-'), ports });
    }
  } catch (e) {
    grocyTried.push(e.message);
  }
  candidates.push({ name: 'Grocy', host: 'a0d7b954-grocy', ports: [80, 9192, 1337] });
  const seen = new Set();
  for (const c of candidates) {
    for (const port of c.ports) {
      const base = `http://${c.host}:${port}`;
      if (seen.has(base)) continue;
      seen.add(base);
      const r = await probeGrocy(base);
      if (r === 'ok' || r === 'auth') {
        grocyNote = `Found the ${c.name} add-on.`;
        return (grocyBase = base);
      }
      grocyTried.push(`${c.host}:${port} ${r}`);
    }
  }
  return (grocyBase = '');
}
async function grocyApi(method, path_, body) {
  const base = await resolveGrocy();
  if (!base) throw new Error('Grocy is not set up');
  const r = await fetch(`${base}/api${path_}`, {
    method,
    headers: { 'GROCY-API-KEY': GROCY.key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (r.status === 401) throw new Error('Grocy rejected the API key');
  if (!r.ok) throw new Error(`Grocy answered ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
async function grocyStatus() {
  if (mock) return { configured: false, ok: false };
  const base = await resolveGrocy();
  if (!base) return { configured: false, ok: false, tried: IN_ADDON ? grocyTried.join(', ') : undefined };
  if (!GROCY.key)
    return { configured: true, ok: false, needsKey: true, error: `${grocyNote || 'Found Grocy.'} Create an API key in Grocy (wrench icon → Manage API keys), paste it into “Grocy API key” on the Hearth add-on's Configuration tab, and restart Hearth.` };
  const r = await probeGrocy(base);
  if (r === 'ok') return { configured: true, ok: true, note: grocyNote || undefined };
  grocyCheckedAt = 0;
  return { configured: true, ok: false, error: r === 'auth' ? 'Grocy rejected the API key. Check “Grocy API key” on the Configuration tab.' : `Can't reach Grocy at ${base} (${r}).` };
}
/** Shopping list, chores, expiring food, and meal plan in the same shapes the HA integration gives. */
async function grocyData() {
  const [shop, products, chores, volatile, plan, recipes, sections] = await Promise.all([
    grocyApi('GET', '/objects/shopping_list').catch(() => []),
    grocyApi('GET', '/objects/products').catch(() => []),
    grocyApi('GET', '/chores').catch(() => []),
    grocyApi('GET', '/stock/volatile?due_soon_days=5').catch(() => ({})),
    grocyApi('GET', '/objects/meal_plan').catch(() => []),
    grocyApi('GET', '/objects/recipes').catch(() => []),
    grocyApi('GET', '/objects/meal_plan_sections').catch(() => []),
  ]);
  const productName = new Map((products || []).map((p) => [Number(p.id), p.name]));
  const recipeName = new Map((recipes || []).map((x) => [Number(x.id), x.name]));
  const sectionName = new Map((sections || []).map((x) => [Number(x.id), x.name]));
  const today = new Date();
  const from = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 21 * 86400000).toISOString().slice(0, 10);
  return {
    shopping: (shop || []).map((i) => ({ id: Number(i.id), name: productName.get(Number(i.product_id)) || i.note || `Item ${i.id}`, amount: Number(i.amount) || 1, done: Number(i.done) === 1 })),
    chores: (chores || []).map((c) => ({ id: Number(c.chore_id ?? c.id), name: c.chore_name ?? c.name ?? `Chore ${c.chore_id}`, due: c.next_estimated_execution_time || undefined })),
    expiring: [...(volatile?.expired_products || []), ...(volatile?.overdue_products || []), ...(volatile?.due_products || [])].map((p) => ({
      id: Number(p.product_id ?? p.id),
      name: p.product?.name ?? productName.get(Number(p.product_id)) ?? `Product ${p.product_id}`,
      date: String(p.best_before_date ?? '').slice(0, 10),
      amount: Number(p.amount) || 1,
    })),
    meals: (plan || [])
      .filter((m) => m.day >= from && m.day <= to)
      .map((m) => ({
        day: String(m.day).slice(0, 10),
        name: recipeName.get(Number(m.recipe_id)) || productName.get(Number(m.product_id)) || m.note || 'Meal',
        section: String(sectionName.get(Number(m.section_id)) || '').toLowerCase(),
      })),
  };
}

// ---------- Frigate ----------
// The configured address is tried first. If it fails (or none is set), look for a Frigate add-on on this
// Home Assistant: ask the Supervisor which add-ons run, then try the usual add-on hostnames.
let frigateBase = FRIGATE_URL;
let frigateNote = '';
let frigateErr = '';
let frigateCheckedAt = 0;
const FRIGATE_HOSTS = ['ccab4aaf-frigate', 'ccab4aaf-frigate-fa', 'ccab4aaf-frigate-beta', 'ccab4aaf-frigate-fa-beta'];

async function probeFrigate(base) {
  try {
    const r = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(4000) });
    return r.ok ? 'ok' : String(r.status);
  } catch (e) {
    return e.cause?.code || e.message;
  }
}

async function frigateAddons() {
  if (!IN_ADDON) return [];
  try {
    const r = await fetch('http://supervisor/addons', { headers: { Authorization: `Bearer ${process.env.SUPERVISOR_TOKEN}` }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return [];
    const list = (await r.json()).data?.addons ?? [];
    return list.filter((a) => /frigate/i.test(a.slug) && a.state === 'started').map((a) => ({ name: a.name, host: a.slug.replace(/_/g, '-') }));
  } catch {
    return [];
  }
}

async function resolveFrigate(force = false) {
  if (mock) return '';
  if (!force && Date.now() - frigateCheckedAt < (frigateErr ? 60000 : 10 * 60000)) return frigateBase;
  frigateCheckedAt = Date.now();
  frigateNote = '';
  frigateErr = '';
  let configuredResult = '';
  if (FRIGATE_URL) {
    configuredResult = await probeFrigate(FRIGATE_URL);
    if (configuredResult === 'ok') return (frigateBase = FRIGATE_URL);
  }
  if (IN_ADDON) {
    const found = await frigateAddons();
    const tried = new Set();
    for (const c of [...found, ...FRIGATE_HOSTS.map((host) => ({ name: 'Frigate', host }))]) {
      if (tried.has(c.host)) continue;
      tried.add(c.host);
      const base = `http://${c.host}:5000`;
      if (base === FRIGATE_URL) continue;
      if ((await probeFrigate(base)) === 'ok') {
        frigateNote = FRIGATE_URL
          ? `${FRIGATE_URL} didn't answer, so Hearth is using the ${c.name} add-on at ${base}. Update the address on the Configuration tab to match.`
          : `Found the ${c.name} add-on at ${base}.`;
        return (frigateBase = base);
      }
    }
  }
  frigateBase = FRIGATE_URL;
  if (FRIGATE_URL) {
    frigateErr =
      configuredResult === '401'
        ? `Frigate asked for a login. Use its internal port 5000 (not 8971), e.g. http://<frigate-ip>:5000.`
        : `Can't reach Frigate at ${FRIGATE_URL} (${configuredResult})${IN_ADDON ? ', and no Frigate add-on was found on this Home Assistant' : ''}. If Frigate runs on another machine, use http://<its IP>:5000, and make sure port 5000 is published.`;
  }
  return frigateBase;
}

async function frigateStatus(force = false) {
  if (mock) return { configured: true, ok: true };
  const base = await resolveFrigate(force);
  if (!base) return { configured: false, ok: false };
  if (frigateErr) return { configured: true, ok: false, error: frigateErr };
  const r = await probeFrigate(base);
  if (r !== 'ok') {
    frigateCheckedAt = 0;
    return { configured: true, ok: false, error: `Can't reach Frigate at ${base} (${r}).` };
  }
  return { configured: true, ok: true, url: base, note: frigateNote || undefined };
}

// ---------- Immich ----------
async function immich(path_, body) {
  const res = await fetch(`${IMMICH.url}/api${path_}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-api-key': IMMICH.key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw Object.assign(new Error('Immich sent back a web page instead of data. Check the address (e.g. http://192.168.1.20:2283).'), { status: 502 });
  }
  if (res.status === 401) throw Object.assign(new Error('Immich rejected the API key. Create a new one in Immich (Account settings → API keys).'), { status: 502 });
  if (!res.ok) throw Object.assign(new Error(`Immich: ${data?.message || res.status}`), { status: 502 });
  return data;
}
async function immichStatus() {
  if (!IMMICH.url) return mock ? { configured: true, ok: true } : { configured: false, ok: false };
  if (!IMMICH.key) return { configured: true, ok: false, error: 'Add your Immich API key in the add-on options.' };
  try {
    await immich('/albums');
    return { configured: true, ok: true };
  } catch (e) {
    console.warn('[hearth] Immich:', e.message);
    return { configured: true, ok: false, error: e.cause?.code ? `Can't reach Immich (${e.cause.code}). Check the address.` : e.message };
  }
}
let immichCache = { key: '', at: 0, ids: [] };
/** Image ids from the albums (and favorites) chosen in Settings → Photos. Cached for 10 minutes. */
async function immichPhotoIds() {
  const cfg = store.data.settings?.immich ?? {};
  const albums = Array.isArray(cfg.albums) ? cfg.albums : [];
  if ((!IMMICH.url && !mock) || (!albums.length && !cfg.favorites)) return [];
  if (!IMMICH.url) return mock.immichAssets(albums, cfg.favorites);
  const key = JSON.stringify([albums, !!cfg.favorites]);
  if (immichCache.key === key && Date.now() - immichCache.at < 10 * 60000) return immichCache.ids;
  const ids = new Set();
  const search = async (filter) => {
    for (let page = 1; page <= 5 && ids.size < 3000; page++) {
      const r = await immich('/search/metadata', { ...filter, type: 'IMAGE', size: 500, page });
      (r.assets?.items ?? []).forEach((a) => ids.add(a.id));
      if (!r.assets?.nextPage) break;
    }
  };
  for (const id of albums) {
    const album = await immich(`/albums/${id}`).catch(() => null);
    const assets = (album?.assets ?? []).filter((a) => a.type === 'IMAGE');
    if (assets.length) assets.forEach((a) => ids.add(a.id));
    else if (album?.assetCount) await search({ albumIds: [id] });
  }
  if (cfg.favorites) await search({ isFavorite: true });
  immichCache = { key, at: Date.now(), ids: [...ids] };
  return immichCache.ids;
}

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

// Same rules as the app: one-off date or weekdays; weekly rotation (weeks start Monday).
const choreDue = (c, d) => (c.date ? c.date === localKey(d) : !c.days?.length || c.days.includes(d.getDay()));
const choreAssignee = (c, d) =>
  c.rotate?.length ? c.rotate[Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5 + 3) / 7) % c.rotate.length] : c.memberId;

const notifySettings = () => store.data.settings?.notify ?? {};
const fmtClock = (d) => {
  const h24 = store.data.settings?.clock24;
  return h24 ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : `${d.getHours() % 12 || 12}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
};

function tickRewards() {
  const n = notifySettings();
  if (!n.targets?.length) return;
  for (const r of store.data.redemptions ?? []) {
    if (r.status !== 'pending' || sent.has(`reward:${r.id}`) || Date.now() - r.at > 3600000) continue;
    sent.add(`reward:${r.id}`);
    const who = (store.data.members ?? []).find((m) => m.id === r.memberId)?.name ?? 'Someone';
    sendNotify(n.targets, '⭐ Reward request', `${who} wants: ${r.title} (${r.cost} stars). Approve it on the Rewards screen.`);
  }
}

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

// Sleep mode: turn a tablet's screen (e.g. Fully Kiosk "switch.<tablet>_screen") off at bedtime, on in the morning.
async function tickSleep() {
  const sl = store.data.settings?.sleep;
  if (!sl?.enabled || !sl.screenEntity || !ENTITY_RE.test(sl.screenEntity)) return;
  const domain = sl.screenEntity.split('.')[0];
  if (!['switch', 'light', 'input_boolean'].includes(domain)) return;
  const now = new Date();
  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const action = hhmm === sl.start ? 'turn_off' : hhmm === sl.end ? 'turn_on' : null;
  const key = `sleep:${localKey(now)}:${action}`;
  if (!action || sent.has(key)) return;
  sent.add(key);
  try {
    await ha('POST', `/services/${domain}/${action}`, { entity_id: sl.screenEntity });
    console.log(`[hearth] sleep mode: ${action} ${sl.screenEntity}`);
  } catch (e) {
    console.warn('[hearth] sleep mode:', e.message);
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
          const left = (store.data.chores ?? []).filter((c) => choreDue(c, now) && choreAssignee(c, now) === m.id && !done.has(c.id));
          return left.length ? `${m.name}: ${left.map((c) => c.title).join(', ')}` : null;
        })
        .filter(Boolean);
      if (lines.length) sendNotify(n.targets, '🧹 Chores left today', lines.join('\n'));
    }
  }
  if (sent.size > 2000) sent.clear();
}

setInterval(tickTimers, 5000);
setInterval(tickRewards, 10000);
setInterval(() => tickMinute().catch(() => undefined), 60000);
setInterval(() => tickSleep().catch(() => undefined), 20000);

server.listen(PORT, () => {
  console.log(`[hearth] v${VERSION} listening on :${PORT} (mode: ${mode})`);
  if (mode === 'demo') console.log('[hearth] No Home Assistant configured: serving demo data. Set HA_URL + HA_TOKEN to connect.');
});
