import { CONFIG } from './config.js';
import { TRANSLATIONS } from './translations.js';
import { Icons } from './icons.js';

// State Store
const state = {
  lang: localStorage.getItem('powerup_lang') || 'en',
  isLangOpen: false,
  tab: 'status', // 'status' | 'features' | 'manage'
  manageSubView: 'list', // 'list' | 'notes' | 'guide'
  auth: {
    loggedIn: false,
    key: '',
    me: {
      status: 'active',
      bound_hwid: null,
      device_model: null,
      device_os: null,
      expires_at: null,
      features: JSON.parse(JSON.stringify(CONFIG.DEFAULT_FEATURES))
    }
  },
  keyInput: '',
  loading: false,
  error: null,
  maintenance: {
    enabled: false,
    blocked: false,
    title: 'maintenance',
    message: "we're doing maintenance. everything is paused until we're back."
  },
  happLoading: false,
  happError: null,
  timerInterval: null
};

// Check local storage session
const savedSession = localStorage.getItem('powerup_session');
if (savedSession) {
  try {
    const parsed = JSON.parse(savedSession);
    if (parsed.key) {
      state.auth.loggedIn = true;
      state.auth.key = parsed.key;
      if (parsed.me) state.auth.me = { ...state.auth.me, ...parsed.me };
      if (parsed.features) state.auth.me.features = { ...state.auth.me.features, ...parsed.features };
    }
  } catch (e) {}
}

// Translation helper
function t(key) {
  const dict = TRANSLATIONS[state.lang] || TRANSLATIONS.en;
  return dict[key] || TRANSLATIONS.en[key] || key;
}

// Real Hardware Fingerprinting & Actual Device Identification
async function getRealClientDevice() {
  const ua = navigator.userAgent || '';
  let os = 'Unknown OS';
  let deviceName = 'Unknown Device';

  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/iPhone/i.test(ua)) os = 'iOS';
  else if (/iPad/i.test(ua)) os = 'iPadOS';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) {
    const m = ua.match(/Android (\d+(\.\d+)?)/);
    os = m ? `Android ${m[1]}` : 'Android';
  } else if (/Linux/i.test(ua)) os = 'Linux';

  let gpuRenderer = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const raw = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        gpuRenderer = raw.replace(/ANGLE \(\vert{}, Direct3D.*\vert{}\)/g, '').trim();
      }
    }
  } catch (e) {}

  if (/Android/i.test(ua)) {
    const modelMatch = ua.match(/;\s*([A-Za-z0-9\-\s\_]+)\s+Build\//);
    const model = modelMatch ? modelMatch[1].trim() : 'Android Device';
    deviceName = `${model} (${os})`;
  } else if (/Windows/i.test(ua)) {
    deviceName = gpuRenderer ? `Windows PC (${gpuRenderer})` : `Windows PC (${os})`;
  } else {
    deviceName = `${os} Device`;
  }

  let hwid = localStorage.getItem('powerup_hwid');
  if (!hwid) {
    const seed = (navigator.platform || '') + (navigator.hardwareConcurrency || 4) + gpuRenderer;
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = ((h << 5) - h) + seed.charCodeAt(i);
      h |= 0;
    }
    hwid = `PWUP-${Math.abs(h).toString(16).padStart(8, '0').slice(0, 8).toUpperCase()}`;
    localStorage.setItem('powerup_hwid', hwid);
  }

  return { hwid, device_model: deviceName, device_os: os };
}

function formatKey(val) {
  return (
    val
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 16)
      .match(/.{1,4}/g) ?? []
  ).join('-');
}

function formatCountdown(targetIso) {
  if (!targetIso) return '—';
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return '<span class="font-semibold text-accent-bad">expired</span>';
  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

async function checkMaintenance() {
  try {
    const res = await fetch('/api/maintenance');
    if (res.ok) {
      state.maintenance = await res.json();
      render();
    }
  } catch (e) {}
}

function initSSE() {
  try {
    const es = new EventSource('/api/events');
    es.addEventListener('maintenance', (e) => {
      try {
        state.maintenance = JSON.parse(e.data);
        render();
      } catch (err) {}
    });
    es.addEventListener('logout', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (!d.key || d.key === state.auth.key) logout();
      } catch (err) {}
    });
  } catch (e) {}
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;

  const isRtl = state.lang === 'ar';
  document.documentElement.setAttribute('lang', state.lang);
  document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  document.title = 'POWER UP — Client Portal';

  let html = '';

  // Ambient red glow background
  html += `
    <div aria-hidden="true" class="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050505]">
      <div class="absolute left-1/2 top-[-14%] h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-[#e50914]/[0.06] blur-[120px]"></div>
      <div class="absolute bottom-[-18%] right-[-12%] h-[480px] w-[480px] rounded-full bg-[#e50914]/[0.04] blur-[120px]"></div>
    </div>
  `;

  if (state.maintenance && state.maintenance.enabled) {
    html += `
      <div class="fixed inset-x-0 top-0 z-50 flex items-start justify-center gap-2 bg-[#fbbf24]/15 px-4 py-2.5 text-center text-[11px] text-[#fbbf24] backdrop-blur">
        <span><span class="font-bold uppercase">${t('maintenance_title')}</span> · ${state.maintenance.message || t('maintenance_body')}</span>
      </div>
    `;
  }

  if (!state.auth.loggedIn) {
    html += renderKeyGate();
  } else {
    html += renderDashboard();
  }

  root.innerHTML = html;
  attachEvents();
}

function renderKeyGate() {
  return `
    <main class="relative flex min-h-dvh flex-col items-center justify-center px-6">
      <div class="card flex w-full max-w-xs flex-col items-center gap-5 p-7 border-[#1f1f1f] bg-[#0a0a0a] shadow-[0_10px_40px_rgba(0,0,0,0.8)] animate-rise">
        
        <!-- شعار POWER UP المضيء المطابق لواجهة تسجيل الدخول -->
        <div style="font-size: 32px; font-weight: 900; color: #ffffff; line-height: 0.95; letter-spacing: 1.5px; text-align: center; text-transform: uppercase; filter: drop-shadow(0 0 12px rgba(229, 9, 20, 0.4));">
          POWER
          <span style="color: #e50914; display: block; font-size: 36px;">UP</span>
        </div>

        <p class="text-[11px] text-center text-[#8a8a8e] uppercase tracking-[0.15em] -mt-2">No account, no password. Your key only.</p>
        
        <form id="key-form" class="flex w-full flex-col gap-3">
          <input 
            id="key-input"
            type="text"
            placeholder="${CONFIG.KEY_PLACEHOLDER}" 
            spellcheck="false" 
            autocomplete="off" 
            autofocus 
            class="input text-center tracking-[0.1em] bg-black border-[#222] text-white focus:border-[#e50914]" 
            value="${state.keyInput}"
          />
          
          ${state.error ? `<p class="text-center text-xs text-[#e50914] animate-rise">${state.error}</p>` : ''}
          
          <button type="submit" class="btn w-full uppercase tracking-[0.15em] bg-[#e50914] text-white hover:bg-[#c40711]" ${state.loading ? 'disabled' : ''}>
            ${state.loading ? 'Authenticating...' : 'Unlock'}
          </button>
        </form>
      </div>
      
      <p class="mt-6 text-center text-[11px] text-[#777]">No key? Contact your seller.<br/>Time starts upon connection.</p>
    </main>
  `;
}

function renderDashboard() {
  const me = state.auth.me;

  return `
    <main class="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-32 pt-6">
      
      <!-- Header -->
      <div class="flex items-center justify-between gap-3 px-1 py-4">
        <div class="flex min-w-0 items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-white">
          <span class="h-2 w-2 shrink-0 rounded-full bg-[#10b981]"></span>
          ${me.status}
        </div>
        
        <div class="relative shrink-0">
          <button id="lang-btn" aria-label="language" class="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#121216] border border-[#222] text-[#ccc] hover:text-white transition-colors">
            ${Icons.languages(16)}
          </button>
          ${state.isLangOpen ? renderLangDropdown() : ''}
        </div>
      </div>

      <div class="flex flex-1 flex-col animate-rise">
        ${state.tab === 'status' ? renderStatusTab(me) : ''}
        ${state.tab === 'features' ? renderFeaturesTab(me) : ''}
        ${state.tab === 'manage' ? renderManageTab() : ''}
      </div>

    </main>
    ${renderBottomNav()}
  `;
}

function renderLangDropdown() {
  const languages = [{ code: 'ar', name: 'العربية' }, { code: 'en', name: 'English' }, { code: 'th', name: 'ไทย' }];
  return `
    <div id="lang-overlay" class="fixed inset-0 z-40 cursor-default"></div>
    <div class="absolute right-0 top-11 z-50 flex min-w-[156px] flex-col overflow-hidden rounded-[14px] border border-[#222] bg-[#121216] p-1 shadow-2xl animate-rise">
      ${languages.map(l => `
        <button data-lang="${l.code}" class="lang-select-btn flex items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold text-[#ccc] hover:bg-white/[0.05] hover:text-white transition-colors">
          <span>${l.name}</span>${l.code === state.lang ? Icons.check(14, 'text-[#e50914]') : ''}
        </button>
      `).join('')}
    </div>
  `;
}

function renderStatusTab(me) {
  const expiresCountdown = formatCountdown(me.expires_at);

  return `
    <div class="flex flex-1 flex-col items-center justify-between gap-8 py-4">
      <div class="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        
        <!-- الشعار المضيء في اللوحة الداخلية -->
        <div style="font-size: 42px; font-weight: 900; color: #ffffff; line-height: 0.95; letter-spacing: 2px; text-transform: uppercase; filter: drop-shadow(0 0 16px rgba(229, 9, 20, 0.5));">
          POWER
          <span style="color: #e50914; display: block; font-size: 48px;">UP</span>
        </div>

        <div class="mt-4 flex flex-col gap-2 bg-[#0a0a0a] border border-[#1f1f1f] p-4 rounded-2xl w-full">
          <p class="text-xs uppercase tracking-[0.15em] text-[#8a8a8e]">HWID: <span class="font-bold text-white">${me.bound_hwid || 'Not locked'}</span></p>
          <p class="text-xs uppercase tracking-[0.15em] text-[#8a8a8e]">Device: <span class="font-bold text-white">${me.device_model || 'Active'}</span></p>
          <p class="text-xs uppercase tracking-[0.15em] text-[#8a8a8e]">Expires: <span id="countdown-display" class="font-bold text-[#e50914]">${expiresCountdown}</span></p>
        </div>
      </div>

      <div class="w-full">
        <button id="happ-btn" class="btn w-full uppercase tracking-[0.15em] bg-[#e50914] text-white hover:bg-[#c40711]" ${state.happLoading ? 'disabled' : ''}>
          ${state.happLoading ? 'Connecting...' : `${Icons.arrowUpRight(15)}${t('add_to_happ')}`}
        </button>
      </div>
    </div>
  `;
}

function renderFeaturesTab(me) {
  const f = me.features;
  const marker = f.marker || { enabled: true, type: 'Power' };
  const aimpoint = f.aimpoint || { enabled: false };
  const aimLag = f.aimLag || { enabled: false, onFire: false, onScope: false };
  const gloo = f.gloo || { enabled: false, yawDeg: 180 };
  const fastRevive = f.fastRevive || { enabled: false };

  return `
    <div class="flex flex-col gap-4">
      <div class="px-1 text-sm font-bold uppercase tracking-[0.2em] text-white">${t('features_title')}</div>

      <!-- Marker Card -->
      <div class="card p-5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a8a8e]">Marker Type</span>
          <button type="button" data-toggle="marker" class="relative h-6 w-11 rounded-full transition-colors ${marker.enabled ? 'bg-[#e50914]' : 'bg-white/10'}">
            <span class="absolute top-0.5 h-5 w-5 rounded-full transition-all ${marker.enabled ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-gray-400'}"></span>
          </button>
        </div>
        <p class="feat-desc text-[11px] text-[#777] mt-2">${t('d_marker')}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          ${CONFIG.MARKER_TYPES.map(type => `
            <button data-marker-type="${type}" class="rounded-xl px-3 py-1.5 text-xs transition-colors ${marker.type === type ? 'bg-[#e50914] font-bold text-white' : 'bg-white/[0.04] text-[#8a8a8e] hover:text-white'}">${type}</button>
          `).join('')}
        </div>
      </div>

      <!-- Aimpoint Card -->
      <div class="card p-5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a8a8e]">Aimpoint (Neck Lock)</span>
          <button type="button" data-toggle="aimpoint" class="relative h-6 w-11 rounded-full transition-colors ${aimpoint.enabled ? 'bg-[#e50914]' : 'bg-white/10'}">
            <span class="absolute top-0.5 h-5 w-5 rounded-full transition-all ${aimpoint.enabled ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-gray-400'}"></span>
          </button>
        </div>
        <p class="feat-desc text-[11px] text-[#777] mt-2">${t('d_aimpoint')}</p>
      </div>

      <!-- Gloo Wall Card -->
      <div class="card p-5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a8a8e]">Gloo Rotation</span>
          <button type="button" data-toggle="gloo" class="relative h-6 w-11 rounded-full transition-colors ${gloo.enabled ? 'bg-[#e50914]' : 'bg-white/10'}">
            <span class="absolute top-0.5 h-5 w-5 rounded-full transition-all ${gloo.enabled ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-gray-400'}"></span>
          </button>
        </div>
        <p class="feat-desc text-[11px] text-[#777] mt-2">${t('d_gloo')}</p>
      </div>

      <!-- Fast Revive Card -->
      <div class="card p-5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a8a8e]">Fast Revive</span>
          <button type="button" data-toggle="fastRevive" class="relative h-6 w-11 rounded-full transition-colors ${fastRevive.enabled ? 'bg-[#e50914]' : 'bg-white/10'}">
            <span class="absolute top-0.5 h-5 w-5 rounded-full transition-all ${fastRevive.enabled ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-gray-400'}"></span>
          </button>
        </div>
        <p class="feat-desc text-[11px] text-[#777] mt-2">${t('d_revive')}</p>
      </div>
    </div>
  `;
}

function renderManageTab() {
  return `
    <div class="flex flex-1 flex-col gap-3">
      <div class="px-1 text-sm font-bold uppercase tracking-[0.2em] text-white">Management</div>

      <button id="unbind-hwid-btn" class="w-full text-left">
        <div class="card flex items-center justify-between p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl hover:border-[#e50914]/50 transition-colors">
          <span class="text-sm text-white">Reset Device Lock (Unbind HWID)</span>
          ${Icons.chevronRight(16, 'text-[#777]}')}
        </div>
      </button>

      <div class="mt-auto pt-6">
        <button id="logout-btn" class="w-full text-left">
          <div class="card flex items-center justify-between p-4 bg-[#0a0a0a] border border-[#e50914]/30 rounded-2xl hover:border-[#e50914]">
            <span class="text-sm text-[#e50914] font-bold">${t('log_out')}</span>
            ${Icons.chevronRight(16, 'text-[#e50914]}')}
          </div>
        </button>
      </div>
    </div>
  `;
}

function renderBottomNav() {
  const tabs = [
    { id: 'status', label: t('nav_home'), icon: Icons.skull(18) },
    { id: 'features', label: t('nav_features'), icon: Icons.slidersHorizontal(18) },
    { id: 'manage', label: t('nav_manage'), icon: Icons.settings(18) }
  ];

  return `
    <nav class="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-3">
      <div class="pointer-events-auto flex items-stretch gap-1 rounded-[20px] bg-[#0a0a0a]/90 border border-[#1f1f1f] p-1.5 backdrop-blur-xl shadow-2xl">
        ${tabs.map(item => `
          <button data-nav-tab="${item.id}" class="flex w-[72px] flex-col items-center justify-center gap-1 rounded-[14px] py-2 transition-all ${state.tab === item.id ? 'bg-[#e50914] text-white font-bold shadow-lg shadow-[#e50914]/30' : 'text-[#8a8a8e] hover:text-white'}">
            ${item.icon}
            <span class="text-[9.5px] uppercase tracking-[0.08em]">${item.label}</span>
          </button>
        `).join('')}
      </div>
    </nav>
  `;
}

function attachEvents() {
  const keyInput = document.getElementById('key-input');
  if (keyInput) {
    keyInput.addEventListener('input', (e) => {
      state.keyInput = formatKey(e.target.value);
      keyInput.value = state.keyInput;
      state.error = null;
    });
  }

  const keyForm = document.getElementById('key-form');
  if (keyForm) {
    keyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = state.keyInput.trim();
      if (!val) { state.error = 'Enter your key'; render(); return; }

      state.loading = true;
      render();

      try {
        const devInfo = await getRealClientDevice();
        const res = await fetch('/api/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: val, hwid: devInfo.hwid, device_model: devInfo.device_model, device_os: devInfo.device_os })
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          state.auth.loggedIn = true;
          state.auth.key = val;
          if (data.me) state.auth.me = { ...state.auth.me, ...data.me };
          localStorage.setItem('powerup_session', JSON.stringify({ key: val, me: state.auth.me, features: state.auth.me.features }));
        } else {
          state.error = data.error || 'Invalid key';
        }
      } catch (err) {
        state.error = 'Network error';
      } finally {
        state.loading = false;
        render();
      }
    });
  }

  const langBtn = document.getElementById('lang-btn');
  if (langBtn) langBtn.addEventListener('click', () => { state.isLangOpen = !state.isLangOpen; render(); });

  document.querySelectorAll('.lang-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.lang = btn.getAttribute('data-lang');
      localStorage.setItem('powerup_lang', state.lang);
      state.isLangOpen = false;
      render();
    });
  });

  document.querySelectorAll('[data-nav-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.getAttribute('data-nav-tab');
      render();
    });
  });

  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-toggle');
      const f = state.auth.me.features;
      if (field === 'marker') f.marker.enabled = !f.marker.enabled;
      else if (field === 'aimpoint') f.aimpoint.enabled = !f.aimpoint.enabled;
      else if (field === 'gloo') f.gloo.enabled = !f.gloo.enabled;
      else if (field === 'fastRevive') f.fastRevive.enabled = !f.fastRevive.enabled;
      render();
      saveFeatures(f);
    });
  });

  document.querySelectorAll('[data-marker-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.auth.me.features.marker.type = btn.getAttribute('data-marker-type');
      render();
      saveFeatures(state.auth.me.features);
    });
  });

  const unbindBtn = document.getElementById('unbind-hwid-btn');
  if (unbindBtn) {
    unbindBtn.addEventListener('click', async () => {
      if (!confirm('Unbind device lock?')) return;
      await fetch('/api/unbind-hwid', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: state.auth.key }) });
      logout();
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

async function saveFeatures(f) {
  localStorage.setItem('powerup_session', JSON.stringify({ key: state.auth.key, me: state.auth.me, features: f }));
  try {
    await fetch('/api/features', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ features: f, key: state.auth.key }) });
  } catch (e) {}
}

function logout() {
  localStorage.removeItem('powerup_session');
  state.auth.loggedIn = false;
  state.auth.key = '';
  render();
}

checkMaintenance();
initSSE();
render();
