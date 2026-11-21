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
const PHOTO_DIR = path.resolve(process.env.PHOTO_DIR || (IN_ADDON ? '/media/hearth' : path.join(DATA_DIR, 'photos')));
const STORE_FILE = path.join(DATA_DIR, 'hearth.json');
const VERSION = process.env.HEARTH_VERSION || '0.2.0';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(PHOTO_DIR, { recursive: true });

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

// Only these services can be called through Hearth.
const SERVICES = new Set([
  'calendar.create_event',
  'todo.get_items',
  'todo.add_item',
  'todo.update_item',
  'todo.remove_item',
  'todo.remove_completed_items',
  'weather.get_forecasts',
]);
const ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const ENTITY_DOMAINS = ['calendar', 'todo', 'weather'];

// ---------- JSON store ----------
const STORE_KEYS = new Set(['members', 'chores', 'completions', 'meals', 'settings']);
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

  if (p === '/api/status') return send(res, 200, { mode, version: VERSION });

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
  match = p.match(/^\/api\/ha\/services\/([a-z_]+)\/([a-z_]+)$/);
  if (match && m === 'POST') {
    const svc = `${match[1]}.${match[2]}`;
    if (!SERVICES.has(svc)) return send(res, 403, { error: `Service ${svc} not allowed` });
    const body = await readJson(req);
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
    const files = (await fsp.readdir(PHOTO_DIR)).filter((f) => safePhotoName(f)).sort();
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
    const name = safePhotoName(match[1]);
    if (!name) return send(res, 400, { error: 'Bad name' });
    await fsp.rm(path.join(PHOTO_DIR, name), { force: true });
    return send(res, 200, { ok: true });
  }
  match = p.match(/^\/photos\/(.+)$/);
  if (match && m === 'GET') {
    const name = safePhotoName(match[1]);
    if (!name) return send(res, 404, 'Not found');
    try {
      return await streamFile(res, path.join(PHOTO_DIR, name), 'public, max-age=86400');
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

server.listen(PORT, () => {
  console.log(`[hearth] v${VERSION} listening on :${PORT} (mode: ${mode})`);
  if (mode === 'demo') console.log('[hearth] No Home Assistant configured: serving demo data. Set HA_URL + HA_TOKEN to connect.');
});
