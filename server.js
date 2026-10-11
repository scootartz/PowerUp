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

function detectServerDevice(ua = '') {
  let os = 'Unknown OS';
  let model = 'Unknown Device';

  if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows 10/11 64-bit';
    model = 'Windows PC';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    model = 'Android Device';
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

  // Client Key Authentication / Redeem & HWID Binding Logic
  if (pathname === '/api/redeem' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const rawKey = (body.key || '').trim();
    const key = rawKey.toUpperCase();

    if (!rawKey) {
      return sendJson(res, 400, { error: 'enter your full key' });
    }

    const ua = req.headers['user-agent'] || '';
    const serverDev = detectServerDevice(ua);
    const clientHwid = (body.hwid || '').trim() || 'AMHK-80E1-9AB2-12A8';

    let keyRecord = db.findKey(key);

    if (!keyRecord) {
      keyRecord = {
        key: key.startsWith('AMHK') ? key : `AMHK-${key}`,
        status: 'active',
        bound_hwid: clientHwid,
        device_model: body.device_model || serverDev.model,
        device_os: body.device_os || serverDev.os,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3650 * 24 * 3600 * 1000).toISOString(),
        features: db.get().global_features
      };
      db.addKey(keyRecord);
    }

    // التحقق من توافق HWID وإعطاء رسالة الخطأ المطابقة لـ AimHack
    if (keyRecord.bound_hwid && keyRecord.bound_hwid !== clientHwid) {
      return sendJson(res, 403, { 
        error: 'This key is locked to another phone. Reset the device on the site (once every 7 days), then refresh here.' 
      });
    }

    if (!keyRecord.bound_hwid) {
      db.updateKey(key, { bound_hwid: clientHwid });
    }

    return sendJson(res, 200, {
      ok: true,
      me: {
        status: 'active',
        bound_hwid: keyRecord.bound_hwid || clientHwid,
        expires_at: keyRecord.expires_at,
        features: keyRecord.features || db.get().global_features
      }
    });
  }

  // Features PATCH
  if (pathname === '/api/features' && req.method === 'PATCH') {
    const body = await parseJsonBody(req);
    if (body.features) {
      db.update(data => {
        data.global_features = { ...data.global_features, ...body.features };
      });
      interceptor.setFeatures(db.get().global_features);
    }
    return sendJson(res, 200, { ok: true, features: db.get().global_features });
  }

  // Happ Tunnel Config Generation (مع استثناء نطاق الموقع لمنع توقفه وتوجيه فري فاير للـ VPN)
  if (pathname === '/api/happ') {
    const key = searchParams.get('key') || 'AMHK-80E1-9AB2-12A8';
    const hostDomain = req.headers.host || 'localhost';

    const configData = {
      version: '1.7',
      client: 'AIMHACK',
      key: key,
      created_at: new Date().toISOString(),
      nodes: [
        { name: 'AIMHACK-VIP', address: hostDomain.split(':')[0], port: 443, ping: '24ms', status: 'online' }
      ],
      active_features: db.get().global_features,
      routing: {
        rules: [
          { domain_suffix: [hostDomain, 'railway.app', 'localhost'], outbound: 'direct' },
          { domain_suffix: ['freefiremobile.com', 'garena.com'], outbound: 'powerup-tunnel' }
        ]
      }
    };

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

  // Static Files Routing
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(ROOT_DIR, 'index.html');
  } else if (pathname.startsWith('/src/')) {
    filePath = path.join(ROOT_DIR, pathname);
  } else {
    filePath = path.join(ROOT_DIR, 'index.html');
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
  console.log(`🚀 POWER UP System running on port ${PORT}`);
});
