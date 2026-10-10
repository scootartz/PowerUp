import { CONFIG } from './config.js';
import { TRANSLATIONS } from './translations.js';
import { Icons } from './icons.js';

const state = {
  lang: localStorage.getItem('powerup_lang') || 'en',
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
  }
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
  if (!targetIso) return '3649d 23h';
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return 'EXPIRED';
  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function renderDashboard() {
  const root = document.getElementById('app');
  if (!root) return;

  const isRtl = state.lang === 'ar';
  document.documentElement.setAttribute('lang', state.lang);
  document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  document.title = 'POWER UP — Client Portal';

  root.innerHTML = `
    <div style="background-color: #050505; color: #cacaca; min-height: 100vh; width: 100%; display: flex; flex-direction: column; justify-content: space-between; align-items: center; padding: 20px 16px 110px 16px; box-sizing: border-box; font-family: 'JetBrains Mono', monospace, sans-serif;">
      
      <!-- الشريط العلوي: مؤشر الاتصال يساراً، وزر الترجمة الدائري يميناً -->
      <div style="width: 100%; max-width: 400px; display: flex; justify-content: space-between; align-items: center; padding: 10px 4px;">
        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; letter-spacing: 2px; color: #10b981;">
          <span style="height: 8px; width: 8px; border-radius: 50%; background-color: #10b981; box-shadow: 0 0 8px #10b981;"></span>
          ${state.lang === 'ar' ? 'متصل' : 'CONNECTED'}
        </div>
        
        <button id="lang-toggle-icon" style="background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 50%; width: 42px; height: 42px; color: #cccccc; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.6);" title="Change Language">
          ${Icons.languages(20)}
        </button>
      </div>

      <!-- محتوى التبويبات -->
      <div style="width: 100%; max-width: 400px; margin: auto 0; display: flex; flex-direction: column; align-items: center;">
        ${state.tab === 'status' ? renderStatusTab(state.auth.me) : ''}
        ${state.tab === 'features' ? renderFeaturesTab(state.auth.me) : ''}
        ${state.tab === 'manage' ? renderManageTab() : ''}
      </div>

      <!-- شريط التنقل السفلي -->
      ${renderBottomNav()}
    </div>
  `;
  attachDashboardEvents();
}

function renderStatusTab(me) {
  const expiresText = formatCountdown(me.expires_at);

  return `
    <div style="width: 100%; display: flex; flex-direction: column; align-items: center; gap: 22px; text-align: center;">
      <img src="logo.png" alt="POWER UP" style="max-width: 200px; width: 100%; height: auto; object-fit: contain; margin: 10px 0; filter: drop-shadow(0 0 15px rgba(229, 9, 20, 0.35));" />

      <div style="width: 100%; max-width: 320px; background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 20px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box;">
        <span style="font-size: 12px; font-weight: 700; letter-spacing: 1.5px; color: #dddddd;">${state.auth.key || 'PWUP-R2ZW-PEY6-7BKB'}</span>
        <button id="copy-key-btn" style="background: transparent; border: none; color: #777777; cursor: pointer; display: flex; align-items: center;">
          ${Icons.copy(16)}
        </button>
      </div>

      <div style="width: 100%; max-width: 320px;">
        <button id="happ-btn" style="width: 100%; background: #e50914; color: #ffffff; border: none; border-radius: 16px; padding: 16px; font-size: 13px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; box-shadow: 0 8px 24px rgba(229, 9, 20, 0.25);">
          ${state.lang === 'ar' ? 'إضافة اشتراك' : 'ADD SUBSCRIPTION'}
        </button>
      </div>

      <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #666666; margin-top: -4px;">
        ${state.lang === 'ar' ? 'ينتهي خلال' : 'EXPIRES IN'} <span style="color: #ffffff; font-weight: 700;">${expiresText}</span>
      </p>
    </div>
  `;
}

function renderFeaturesTab(me) {
  const f = me.features || {};
  const marker = f.marker || { enabled: true, type: 'Phantom' };
  const aimpoint = f.aimpoint || { enabled: false };
  const aimLag = f.aimLag || { enabled: false };
  const gloo = f.gloo || { enabled: false };
  const fastRevive = f.fastRevive || { enabled: false };

  const markerTypes = ['Phantom', 'Dreamland', 'Ice Wall', 'Moco', 'Clu', 'Shirou', 'Iris', 'Dreki'];

  return `
    <div style="width: 100%; display: flex; flex-direction: column; gap: 14px; text-align: left; max-height: 68vh; overflow-y: auto; padding-right: 4px;">
      <div style="font-size: 12px; font-weight: 800; letter-spacing: 2px; color: #ffffff; margin-bottom: 4px;">${state.lang === 'ar' ? 'الميزات' : 'FEATURES'}</div>

      <div style="background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 18px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #8a8a8e;">MARKER TYPE</span>
          <button type="button" data-toggle="marker" style="width: 44px; height: 24px; border-radius: 12px; background: ${marker.enabled ? '#e50914' : '#222222'}; border: none; position: relative; cursor: pointer;">
            <span style="width: 18px; height: 18px; border-radius: 50%; background: #ffffff; position: absolute; top: 3px; ${marker.enabled ? 'right: 3px;' : 'left: 3px;'}"></span>
          </button>
        </div>
        <p style="font-size: 10.5px; color: #666666; margin-top: 8px; line-height: 1.4;">Marks every enemy on your screen. Pick the mark you see.</p>
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;">
          ${markerTypes.map(type => `
            <button data-marker-type="${type}" style="border: none; border-radius: 10px; padding: 6px 12px; font-size: 10.5px; font-weight: 600; cursor: pointer; background: ${marker.type === type ? '#e50914' : '#141414'}; color: ${marker.type === type ? '#ffffff' : '#777777'};">${type}</button>
          `).join('')}
        </div>
      </div>

      <div style="background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 18px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #8a8a8e;">AIMPOINT</span>
          <button type="button" data-toggle="aimpoint" style="width: 44px; height: 24px; border-radius: 12px; background: ${aimpoint.enabled ? '#e50914' : '#222222'}; border: none; position: relative; cursor: pointer;">
            <span style="width: 18px; height: 18px; border-radius: 50%; background: #ffffff; position: absolute; top: 3px; ${aimpoint.enabled ? 'right: 3px;' : 'left: 3px;'}"></span>
          </button>
        </div>
        <p style="font-size: 10.5px; color: #666666; margin-top: 8px; line-height: 1.4;">Moves your aim assist from the chest to the neck, so body shots land as headshots.</p>
      </div>

      <div style="background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 18px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #8a8a8e;">AIM LAG</span>
          <button type="button" data-toggle="aimLag" style="width: 44px; height: 24px; border-radius: 12px; background: ${aimLag.enabled ? '#e50914' : '#222222'}; border: none; position: relative; cursor: pointer;">
            <span style="width: 18px; height: 18px; border-radius: 50%; background: #ffffff; position: absolute; top: 3px; ${aimLag.enabled ? 'right: 3px;' : 'left: 3px;'}"></span>
          </button>
        </div>
        <p style="font-size: 10.5px; color: #666666; margin-top: 8px; line-height: 1.4;">Freezes the enemy in place for a moment while you fire or scope, so they are easier to hit.</p>
      </div>

      <div style="background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 18px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #8a8a8e;">GLOO ROTATION</span>
          <button type="button" data-toggle="gloo" style="width: 44px; height: 24px; border-radius: 12px; background: ${gloo.enabled ? '#e50914' : '#222222'}; border: none; position: relative; cursor: pointer;">
            <span style="width: 18px; height: 18px; border-radius: 50%; background: #ffffff; position: absolute; top: 3px; ${gloo.enabled ? 'right: 3px;' : 'left: 3px;'}"></span>
          </button>
        </div>
        <p style="font-size: 10.5px; color: #666666; margin-top: 8px; line-height: 1.4;">Turns your gloo wall to the angle you set instead of the way you threw it.</p>
      </div>

      <div style="background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 18px; padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; font-weight: 700; letter-spacing: 1.5px; color: #8a8a8e;">FAST REVIVE</span>
          <button type="button" data-toggle="fastRevive" style="width: 44px; height: 24px; border-radius: 12px; background: ${fastRevive.enabled ? '#e50914' : '#222222'}; border: none; position: relative; cursor: pointer;">
            <span style="width: 18px; height: 18px; border-radius: 50%; background: #ffffff; position: absolute; top: 3px; ${fastRevive.enabled ? 'right: 3px;' : 'left: 3px;'}"></span>
          </button>
        </div>
        <p style="font-size: 10.5px; color: #666666; margin-top: 8px; line-height: 1.4;">Picks a knocked teammate up in about 100 ms instead of 3 seconds.</p>
      </div>
    </div>
  `;
}

function renderManageTab() {
  const discordLink = CONFIG.DISCORD_URL || 'https://discord.gg/srxteam';
  const happLink = CONFIG.HAPP_URL || 'happ://';

  return `
    <div style="width: 100%; display: flex; flex-direction: column; gap: 12px; text-align: left; max-height: 68vh; overflow-y: auto; padding-right: 4px;">
      <div style="font-size: 12px; font-weight: 800; letter-spacing: 2px; color: #ffffff; margin-bottom: 4px;">${state.lang === 'ar' ? 'الإدارة' : 'MANAGEMENT'}</div>
      
      <button id="unbind-hwid-btn" style="width: 100%; background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 16px; padding: 16px; color: #ffffff; font-size: 12px; font-weight: 600; text-align: left; cursor: pointer;">
        Reset Device Lock (Unbind HWID)
      </button>

      <a href="${discordLink}" target="_blank" style="text-decoration: none; width: 100%;">
        <div style="width: 100%; background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 16px; padding: 16px; color: #5865F2; font-size: 12px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box;">
          <span>Discord Community</span>
          <span>↗</span>
        </div>
      </a>

      <a href="${happLink}" target="_blank" style="text-decoration: none; width: 100%;">
        <div style="width: 100%; background: #0a0a0a; border: 1px solid #1f1f1f; border-radius: 16px; padding: 16px; color: #e50914; font-size: 12px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box;">
          <span>Open Happ VPN</span>
          <span>↗</span>
        </div>
      </a>
      
      <button id="logout-btn" style="width: 100%; background: #0a0a0a; border: 1px solid rgba(229, 9, 20, 0.3); border-radius: 16px; padding: 16px; color: #e50914; font-size: 12px; font-weight: 800; text-align: left; cursor: pointer;">
        ${state.lang === 'ar' ? 'تسجيل الخروج' : 'Log out'}
      </button>
    </div>
  `;
}

function renderBottomNav() {
  const tabs = [
    { id: 'status', label: state.lang === 'ar' ? 'الرئيسية' : 'HOME', icon: Icons.skull(18) },
    { id: 'features', label: state.lang === 'ar' ? 'الميزات' : 'FEATURES', icon: Icons.slidersHorizontal(18) },
    { id: 'manage', label: state.lang === 'ar' ? 'الإدارة' : 'MANAGE', icon: Icons.settings(18) }
  ];

  return `
    <div style="position: fixed; bottom: 20px; left: 0; right: 0; display: flex; justify-content: center; z-index: 50; pointer-events: none;">
      <div style="pointer-events: auto; background: rgba(10, 10, 10, 0.95); border: 1px solid #1f1f1f; border-radius: 24px; padding: 6px; display: flex; gap: 6px; backdrop-filter: blur(12px); box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
        ${tabs.map(item => `
          <button data-nav-tab="${item.id}" style="width: 84px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-radius: 18px; padding: 10px 0; border: ${state.tab === item.id ? '1px solid #333333' : 'none'}; background: ${state.tab === item.id ? '#1a1a1a' : 'transparent'}; color: ${state.tab === item.id ? '#ffffff' : '#777777'}; cursor: pointer;">
            ${item.icon}
            <span style="font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">${item.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function attachDashboardEvents() {
  const langBtn = document.getElementById('lang-toggle-icon');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      state.lang = state.lang === 'en' ? 'ar' : 'en';
      localStorage.setItem('powerup_lang', state.lang);
      renderDashboard();
    });
  }

  const copyBtn = document.getElementById('copy-key-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(state.auth.key);
      alert(state.lang === 'ar' ? 'تم نسخ المفتاح بنجاح' : 'Key copied successfully');
    });
  }

  const happBtn = document.getElementById('happ-btn');
  if (happBtn) {
    happBtn.addEventListener('click', () => {
      window.location.href = CONFIG.HAPP_URL || 'happ://';
    });
  }

  document.querySelectorAll('[data-nav-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.getAttribute('data-nav-tab');
      renderDashboard();
    });
  });

  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-toggle');
      if (!state.auth.me.features) state.auth.me.features = {};
      const f = state.auth.me.features;
      
      if (field === 'marker') f.marker = { ...f.marker, enabled: !f.marker?.enabled };
      else if (field === 'aimpoint') f.aimpoint = { ...f.aimpoint, enabled: !f.aimpoint?.enabled };
      else if (field === 'aimLag') f.aimLag = { ...f.aimLag, enabled: !f.aimLag?.enabled };
      else if (field === 'gloo') f.gloo = { ...f.gloo, enabled: !f.gloo?.enabled };
      else if (field === 'fastRevive') f.fastRevive = { ...f.fastRevive, enabled: !f.fastRevive?.enabled };
      
      renderDashboard();
      saveFeatures(f);
    });
  });

  document.querySelectorAll('[data-marker-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.auth.me.features) state.auth.me.features = {};
      if (!state.auth.me.features.marker) state.auth.me.features.marker = {};
      state.auth.me.features.marker.type = btn.getAttribute('data-marker-type');
      renderDashboard();
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
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
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
  location.reload();
}

document.addEventListener('DOMContentLoaded', () => {
  const keyInput = document.getElementById('access-key-input');
  const unlockBtn = document.getElementById('unlock-btn');

  if (keyInput) {
    keyInput.addEventListener('input', (e) => {
      keyInput.value = formatKey(e.target.value);
    });
  }

  if (unlockBtn) {
    unlockBtn.addEventListener('click', async () => {
      const val = keyInput ? keyInput.value.trim() : '';
      if (!val) {
        alert('Please enter your access key');
        return;
      }

      unlockBtn.textContent = 'Authenticating...';
      unlockBtn.disabled = true;

      try {
        const dev = await getRealClientDevice();
        const res = await fetch('/api/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: val, hwid: dev.hwid, device_model: dev.device_model, device_os: dev.device_os })
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          state.auth.loggedIn = true;
          state.auth.key = val;
          if (data.me) state.auth.me = { ...state.auth.me, ...data.me };
          localStorage.setItem('powerup_session', JSON.stringify({ key: val, me: state.auth.me }));
          renderDashboard();
        } else {
          alert(data.error || 'Invalid key');
          unlockBtn.textContent = 'Unlock';
          unlockBtn.disabled = false;
        }
      } catch (err) {
        alert('Network error');
        unlockBtn.textContent = 'Unlock';
        unlockBtn.disabled = false;
      }
    });
  }

  if (state.auth.loggedIn) {
    renderDashboard();
  }
});

function formatKey(val) {
  return (val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16).match(/.{1,4}/g) ?? []).join('-');
}

async function getRealClientDevice() {
  const ua = navigator.userAgent || '';
  let os = 'Unknown OS';
  let deviceName = 'Unknown Device';
  if (/Android/i.test(ua)) {
    os = 'Android';
    deviceName = 'Android Device';
  } else if (/Windows/i.test(ua)) {
    os = 'Windows';
    deviceName = 'Windows PC';
  }
  let hwid = localStorage.getItem('powerup_hwid');
  if (!hwid) {
    hwid = `PWUP-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
    localStorage.setItem('powerup_hwid', hwid);
  }
  return { hwid, device_model: deviceName, device_os: os };
}
