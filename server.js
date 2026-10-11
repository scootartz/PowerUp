const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./data/db');
const interceptor = require('./src/engine/packet_interceptor');
const gameTunnel = require('./src/engine/game_tunnel');

// Start active UDP game tunnel
gameTunnel.start();

// Initialize interceptor with saved features
interceptor.setFeatures(db.get().global_features);

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// SSE Clients set
const sseClients = new Set();

function broadcastEvent(eventName, data) {
  for (const client of sseClients) {
    try {
      client.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

function generateRandomKey(prefix = 'PHTM') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const chunk = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${chunk()}-${chunk()}-${chunk()}`;
}

function detectServerDevice(ua = '') {
  let os = 'Unknown OS';
  let model = 'Unknown Device';

  if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows 10/11 64-bit';
    model = 'Windows PC';
  } else if (/iPhone/i.test(ua)) {
    const v = ua.match(/OS (\d+[_\.]\d+)/);
    os = v ? `iOS ${v[1].replace('_', '.')}` : 'iOS';
    model = `iPhone (${os})`;
  } else if (/iPad/i.test(ua)) {
    const v = ua.match(/OS (\d+[_\.]\d+)/);
    os = v ? `iPadOS ${v[1].replace('_', '.')}` : 'iPadOS';
    model = `iPad (${os})`;
  } else if (/Android/i.test(ua)) {
    const v = ua.match(/Android (\d+(\.\d+)?)/);
    os = v ? `Android ${v[1]}` : 'Android';
    const m = ua.match(/;\s*([A-Za-z0-9\-\s\_]+)\s+Build\//);
    model = m ? `${m[1].trim()} (${os})` : `Android Device (${os})`;
  }

  return { os, model };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Client Key Authentication / Redeem
  if (pathname === '/api/redeem' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const rawKey = (body.key || '').trim();
    const key = rawKey.toUpperCase();

    if (!rawKey) {
      return sendJson(res, 400, { error: 'enter your full key' });
    }

    const ua = req.headers['user-agent'] || '';
    const serverDev = detectServerDevice(ua);
    const clientHwid = (body.hwid || '').trim() || `PHTM-${crypto.createHash('md5').update(ua + (req.socket.remoteAddress || '')).digest('hex').slice(0, 8).toUpperCase()}`;
    const clientDeviceModel = (body.device_model || '').trim() || serverDev.model;
    const clientDeviceOs = (body.device_os || '').trim() || serverDev.os;

    let keyRecord = db.findKey(key);

    if (!keyRecord) {
      keyRecord = {
        key: key.startsWith('PHTM') ? key : `PHTM-${key.padEnd(4, 'X').slice(0, 4)}-CRACKED-KEY`,
        status: 'active',
        bound_hwid: clientHwid,
        device_model: clientDeviceModel,
        device_os: clientDeviceOs,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3650 * 24 * 3600 * 1000).toISOString(),
        note: 'Auto-Enrolled License',
        features: db.get().global_features
      };
      db.addKey(keyRecord);
    }

    if (!keyRecord.bound_hwid) {
      db.updateKey(key, { bound_hwid: clientHwid, device_model: clientDeviceModel, device_os: clientDeviceOs });
    }

    return sendJson(res, 200, {
      ok: true,
      me: {
        status: 'active',
        bound_hwid: keyRecord.bound_hwid || clientHwid,
        device_model: keyRecord.device_model || clientDeviceModel,
        device_os: keyRecord.device_os || clientDeviceOs,
        expires_at: keyRecord.expires_at,
        features: keyRecord.features && Object.keys(keyRecord.features).length > 0 ? keyRecord.features : db.get().global_features
      }
    });
  }

  // Features GET and PATCH
  if (pathname === '/api/features') {
    if (req.method === 'GET') {
      return sendJson(res, 200, { features: db.get().global_features });
    }
    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req);
      if (body.features) {
        db.update(data => {
          data.global_features = { ...data.global_features, ...body.features };
        });
        interceptor.setFeatures(db.get().global_features);
      }
      return sendJson(res, 200, { ok: true, features: db.get().global_features });
    }
  }

  // Happ Tunnel Config Generation & Subscription Endpoint
  if (pathname === '/api/happ') {
    const key = searchParams.get('key') || 'PHTM-POWERUP-KEY';
    const nodes = db.get().nodes;

    const configData = {
      version: '1.7',
      client: 'POWER UP',
      key: key,
      created_at: new Date().toISOString(),
      nodes: nodes.map(n => ({
        name: `${n.flag || '🌐'} ${n.name}`,
        address: n.host,
        port: n.port,
        ping: `${n.ping}ms`,
        status: n.status
      })),
      active_features: db.get().global_features,
      routing: {
        rules: [{ domain_suffix: ['freefiremobile.com', 'garena.com'], outbound: 'powerup-tunnel' }]
      }
    };

    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(configData, null, 2));
      return;
    }

    const encoded = Buffer.from(JSON.stringify(configData)).toString('base64');
    return sendJson(res, 200, {
      ok: true,
      deepLink: `happ://import?data=${encodeURIComponent(encoded)}`,
      config: configData
    });
  }

  // Reset / Unbind HWID
  if (pathname === '/api/unbind-hwid' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    if (body.key) {
      db.updateKey(body.key, { bound_hwid: null, device_model: null, device_os: null });
      return sendJson(res, 200, { ok: true, message: 'Device lock removed.' });
    }
    return sendJson(res, 400, { error: 'key required' });
  }

  // Static Assets & Pages Routing
  let filePath;
  if (pathname === '/admin' || pathname === '/admin/') {
    filePath = path.join(ROOT_DIR, 'public', 'admin.html');
  } else if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(ROOT_DIR, 'index.html');
  } else if (pathname.startsWith('/src/')) {
    filePath = path.join(ROOT_DIR, pathname);
  } else {
    const cleanPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    const pubPath = path.join(ROOT_DIR, 'public', cleanPath);
    if (fs.existsSync(pubPath)) {
      filePath = pubPath;
    } else {
      filePath = path.join(ROOT_DIR, 'index.html');
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n==============================================`);
  console.log(`🚀 POWER UP System running on port ${PORT}`);
  console.log(`==============================================\n`);
});
