import { CONFIG } from './config.js';
import { TRANSLATIONS } from './translations.js';
import { Icons } from './icons.js';

const state = {
  lang: localStorage.getItem('powerup_lang') || 'en',
  isLangOpen: false,
  tab: 'status',
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
  maintenance: { enabled: false, blocked: false, title: 'maintenance', message: '' }
};

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

function t(key) {
  const dict = TRANSLATIONS[state.lang] || TRANSLATIONS.en;
  return dict[key] || TRANSLATIONS.en[key] || key;
}

function formatCountdown(targetIso) {
  if (!targetIso) return '3649D 18H';
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return 'EXPIRED';
  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${mins}M`;
  return `${mins}M`;
}

async function getRealClientDevice() {
  let hwid = localStorage.getItem('powerup_hwid');
  if (!hwid) {
    hwid = `PWUP-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
    localStorage.setItem('powerup_hwid', hwid);
  }
  return { hwid, device_model: 'Android Device', device_os: 'Android' };
}

function formatKey(val) {
  return (val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 19).match(/.{1,4}/g) ?? []).join('-');
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;

  if (!state.auth.loggedIn) {
    root.innerHTML = renderKeyGate();
  } else {
    root.innerHTML = renderDashboard();
  }
  attachEvents();
}

function renderKeyGate() {
  return `
    <div style="background: #09090b; border: 1px solid #1f1f23; border-radius: 28px; padding: 32px 20px; width: 100%; max-width: 380px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8); text-align: center; display: flex; flex-direction: column; align-items: center;">
      <img src="logo.png" alt="POWER UP" style="max-width: 190px; width: 100%; height: auto; margin-bottom: 20px; object-fit: contain; filter: drop-shadow(0 0 20px rgba(229, 9, 20, 0.4));" onerror="this.onerror=null; this.style.display='none';" />
      <p style="font-size: 11.5px; color: #71717a; margin-bottom: 24px; letter-spacing: 0.5px;">No account, no password. Your key only.</p>
      
      <form id="key-form" style="width: 100%; display: flex; flex-direction: column; align-items: center;">
        <span style="font-size: 11px; color: #a1a1aa; margin-bottom: 8px; display: block; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 1.5px; width: 100%;">Access Key</span>
        
        <div style="position: relative; display: flex; align-items: center; background: #050505; border: 1px solid #27272a; border-radius: 16px; padding: 6px; margin-bottom: 24px; width: 100%;">
          <button type="button" id="paste-btn" style="background: #18181b; color: #d4d4d8; border: none; border-radius: 12px; padding: 10px 14px; font-size: 11px; cursor: pointer; font-weight: 700; flex-shrink: 0;">Paste</button>
          <input 
            id="key-input"
            type="text"
            placeholder="PWUP-XXXX-XXXX-XXXX" 
            spellcheck="false" 
            autocomplete="off" 
            autofocus 
            style="width: 100%; background: transparent; border: none; outline: none; color: #ffffff; font-size: 11.5px; padding: 8px; text-align: center; font-weight: 600; letter-spacing: 1.5px;"
            value="${state.keyInput}"
            maxlength="19"
          />
        </div>
        
        ${state.error ? `<p style="color: #e50914; font-size: 12px; margin-bottom: 12px;">${state.error}</p>` : ''}
        
        <button type="submit" style="width: 100%; background: #e50914; border: none; border-radius: 16px; padding: 16px; color: #ffffff; font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; box-shadow: 0 8px 24px rgba(229, 9, 20, 0.3); margin-bottom: 20px;" ${state.loading ? 'disabled' : ''}>
          ${state.loading ? 'Authenticating...' : 'Unlock'}
        </button>
      </form>
      
      <p style="font-size: 10.5px; color: #52525b; line-height: 1.6; text-align: center; margin-top: 10px;">No key? Contact your seller.<br/>Time starts upon connection.</p>
    </div>
  `;
}

function renderDashboard() {
  const me = state.auth.me;
  const expiresCountdown = formatCountdown(me.expires_at);

  return `
    <div style="width: 100%; max-width: 380px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 16px;">
      <div style="width: 100%; display: flex; justify-content: flex-start; align-items: center; padding: 0 4px;">
        <span style="color: #10b981; font-weight: 800; font-size: 11px; letter-spacing: 2px;">● CONNECTED</span>
      </div>
      
      <img src="logo.png" alt="POWER UP" style="max-width: 190px; width: 100%; height: auto; object-fit: contain; filter: drop-shadow(0 0 20px rgba(229, 9, 20, 0.4));" onerror="this.onerror=null; this.style.display='none';" />

      <div style="width: 100%; background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 16px; padding: 14px 18px; display: flex; justify-content: center; align-items: center;">
        <span style="font-size: 11.5px; font-weight: 700; letter-spacing: 1.5px; color: #dddddd;">${state.auth.key}</span>
      </div>

      <div style="width: 100%;">
        <button id="happ-btn" style="width: 100%; background: #e50914; color: #ffffff; border: none; border-radius: 16px; padding: 16px; font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; box-shadow: 0 8px 24px rgba(229, 9, 20, 0.3);">
          OPEN HAPP VPN
        </button>
      </div>

      <!-- زر تحميل Happ VPN (Google Play) -->
      <a href="https://play.google.com/store/apps/details?id=com.happ.proxy" target="_blank" style="width: 100%; display: flex; justify-content: space-between; align-items: center; background: rgba(15, 15, 15, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 16px 20px; color: #22c55e; text-decoration: none; font-size: 12.5px; font-weight: 700; font-family: inherit; transition: background 0.2s;">
        <span>Happ VPN (Google Play)</span>
        <span style="font-size: 14px;">↗</span>
      </a>

      <!-- زر تحميل Happ VPN (App Store) -->
      <a href="https://apps.apple.com/us/app/happ-proxy-utility/id6504287215" target="_blank" style="width: 100%; display: flex; justify-content: space-between; align-items: center; background: rgba(15, 15, 15, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 16px 20px; color: #ffffff; text-decoration: none; font-size: 12.5px; font-weight: 700; font-family: inherit; transition: background 0.2s;">
        <span>Happ VPN (App Store)</span>
        <span style="font-size: 14px;">↗</span>
      </a>

      <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #666666; margin-top: 4px;">
        EXPIRES IN <span style="color: #ffffff; font-weight: 700;">${expiresCountdown}</span>
      </p>

      <div style="margin-top: 10px;">
        <button id="logout-btn" style="background: transparent; border: 1px solid #e50914; color: #e50914; padding: 10px 20px; border-radius: 12px; cursor: pointer; font-weight: bold; font-family: inherit;">Log out</button>
      </div>
    </div>
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

  const pasteBtn = document.getElementById('paste-btn');
  if (pasteBtn && keyInput) {
    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
