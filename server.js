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

function generateRandomKey(prefix = 'PWUP') {
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
  } else if (/Android/i.test(ua)) {
    const v = ua.match(/Android (\d+(\.\d+)?)/);
    os = v ? `Android ${v[1]}` : 'Android';
    model = 'Android Device';
  }

  return { os, model };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ==========================================
  // CLIENT API ENDPOINTS
  // ==========================================

  if (pathname === '/api/maintenance' && req.method === 'GET') {
    return sendJson(res, 200, db.getMaintenance());
  }

  if (pathname === '/api/redeem' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const rawKey = (body.key || '').trim();
    const key = rawKey.toUpperCase();

    if (!rawKey) {
      return sendJson(res, 400, { error: 'enter your full key' });
    }

    const ua = req.headers['user-agent'] || '';
    const serverDev = detectServerDevice(ua);
    const clientHwid = (body.hwid || '').trim() || `PWUP-${crypto.createHash('md5').update(ua + (req.socket.remoteAddress || '')).digest('hex').slice(0, 8).toUpperCase()}`;
    const clientDeviceModel = (body.device_model || '').trim() || serverDev.model;
    const clientDeviceOs = (body.device_os || '').trim() || serverDev.os;

    let keyRecord = db.findKey(key);

    if (!keyRecord) {
      keyRecord = {
        key: key.startsWith('PWUP') ? key : `PWUP-${key}`,
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

    if (keyRecord.status === 'revoked') {
      return sendJson(res, 400, { error: 'this license key has been revoked' });
    }

    if (new Date(keyRecord.expires_at).getTime() < Date.now()) {
      return sendJson(res, 400, { error: 'this license key has expired' });
    }

    if (!keyRecord.bound_hwid) {
      db.updateKey(key, {
        bound_hwid: clientHwid,
        device_model: clientDeviceModel,
        device_os: clientDeviceOs
      });
    } else {
      if (keyRecord.bound_hwid !== clientHwid) {
        return sendJson(res, 403, { 
          error: `key is locked to another device (${keyRecord.device_model || 'other device'}).` 
        });
      }
    }

    return sendJson(res, 200, {
      ok: true,
      me: {
        status: 'active',
        bound_hwid: keyRecord.bound_hwid,
        device_model: keyRecord.device_model,
        device_os: keyRecord.device_os,
        expires_at: keyRecord.expires_at,
        features: keyRecord.features || db.get().global_features
      }
    });
  }

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

  if (pathname === '/api/happ' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    const key = body.key || 'PWUP-TEST-1234';
    const nodes = db.get().nodes;

    const configData = {
      version: '1.7',
      client: 'POWER UP',
      key: key,
      created_at: new Date().toISOString(),
      nodes: nodes.map(n => ({
        name: `${n.flag} ${n.name}`,
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

    const encoded = Buffer.from(JSON.stringify(configData)).toString('base64');
    return sendJson(res, 200, {
      ok: true,
      deepLink: `happ://import?data=${encodeURIComponent(encoded)}`,
      config: configData
    });
  }

  if (pathname === '/api/unbind-hwid' && req.method === 'POST') {
    const body = await parseJsonBody(req);
    if (body.key) {
      db.updateKey(body.key, { bound_hwid: null, device_model: null, device_os: null });
      return sendJson(res, 200, { ok: true, message: 'Device lock removed.' });
    }
    return sendJson(res, 400, { error: 'key required' });
  }

  // ==========================================
  // BACKEND ADMIN API ENDPOINTS (متصلة بقاعدة البيانات بدقة)
  // ==========================================
  if (pathname === '/api/admin/overview' || pathname === '/api/admin/stats') {
    const data = db.get();
    const totalKeys = data.keys.length;
    const activeKeys = data.keys.filter(k => k.status === 'active').length;
    return sendJson(res, 200, {
      totalKeys,
      activeKeys,
      total_keys: totalKeys,
      maintenance: data.maintenance,
      nodes: data.nodes
    });
  }

  if (pathname === '/api/admin/keys' && req.method === 'GET') {
    const data = db.get();
    return sendJson(res, 200, { keys: data.keys });
  }

  // دعم مساري توليد المفاتيح لتعمل لوحة التحكم بدون ريفرش أو أخطاء
  if (pathname === '/api/admin/keys' || pathname === '/api/admin/keys/generate') {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const count = Math.min(Math.max(parseInt(body.count, 10) || 1, 1), 50);
      const durationDays = parseInt(body.days, 10) || 30;
      const note = body.note || 'Generated from Admin Panel';
      const prefix = (body.prefix || 'PWUP').trim().toUpperCase();

      const createdKeys = [];
      for (let i = 0; i < count; i++) {
        const newKeyStr = generateRandomKey(prefix);
        const newKeyObj = {
          key: newKeyStr,
          status: 'active',
          bound_hwid: null,
          device_model: null,
          device_os: null,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + durationDays * 24 * 3600 * 1000).toISOString(),
          note: note,
          features: db.get().global_features
        };
        db.addKey(newKeyObj); // الحفظ الفعلي في قاعدة البيانات
        createdKeys.push(newKeyObj);
      }

      return sendJson(res, 200, { ok: true, keys: createdKeys, key: createdKeys[0] });
    }
  }

  const deleteKeyMatch = pathname.match(/^\/api\/admin\/keys\/([^/]+)$/);
  if (deleteKeyMatch && req.method === 'DELETE') {
    const targetKey = decodeURIComponent(deleteKeyMatch[1]);
    db.deleteKey(targetKey); // الحذف الفعلي من قاعدة البيانات
    return sendJson(res, 200, { ok: true });
  }

  // ==========================================
  // STATIC ASSET & PAGE ROUTING
  // ==========================================
  let filePath;
  if (pathname === '/' || pathname === '/index.html') {
    filePath = path.join(ROOT_DIR, 'index.html');
  } else if (pathname === '/admin' || pathname === '/admin.html' || pathname === '/Control-panel-xyz987.html') {
    const p1 = path.join(ROOT_DIR, 'Control-panel-xyz987.html');
    const p2 = path.join(ROOT_DIR, 'public', 'Control-panel-xyz987.html');
    filePath = fs.existsSync(p1) ? p1 : p2;
  } else if (pathname.startsWith('/src/')) {
    filePath = path.join(ROOT_DIR, pathname);
  } else {
    const cleanPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
    const pubPath = path.join(ROOT_DIR, 'public', cleanPath);
    const rootPath = path.join(ROOT_DIR, cleanPath);
    
    if (fs.existsSync(pubPath)) {
      filePath = pubPath;
    } else if (fs.existsSync(rootPath)) {
      filePath = rootPath;
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
  console.log(`🚀 POWER UP System running on port ${PORT}`);
});
