import { CONFIG } from './config.js';
import { TRANSLATIONS } from './translations.js';
import { Icons } from './icons.js';

const state = {
  lang: localStorage.getItem('powerup_lang') || 'en',
  tab: 'status', // 'status' | 'features' | 'manage'
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

async function getRealClientDevice() {
  const ua = navigator.userAgent || '';
  let os = 'Unknown OS';
  let deviceName = 'Unknown Device';

  if (/Android/i.test(ua)) {
    const m = ua.match(/Android (\d+(\.\d+)?)/);
    os = m ? `Android ${m[1]}` : 'Android';
    const modelMatch = ua.match(/;\s*([A-Za-z0-9\-\s\_]+)\s+Build\//);
    deviceName = `${modelMatch ? modelMatch[1].trim() : 'Android Device'} (${os})`;
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

function formatKey(val) {
  return (val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16).match(/.{1,4}/g) ?? []).join('-');
}

function formatCountdown(targetIso) {
  if (!targetIso) return '2h 38m';
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
    <div class="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-between px-5 pt-5 pb-28 bg-[#050505] text-[#cacaca]">
      
      <!-- شريط علوي مطابق للصورة حرفياً (CONNECTED + زر الترجمة) -->
      <div class="w-full flex items-center justify-between px-2 py-3 z-10">
        <div class="flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-[#10b981]">
          <span class="h-2 w-2 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]"></span>
          CONNECTED
        </div>
        
        <button id="lang-toggle-icon" class="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#0a0a0a] border border-[#1f1f1f] text-[#ccc] hover:text-white transition-colors">
          ${Icons.languages(16)}
        </button>
      </div>

      <!-- محتوى التبويبات المتغيرة -->
      <div class="w-full flex-1 flex flex-col items-center justify-center my-auto">
        ${state.tab === 'status' ? renderStatusTab(state.auth.me) : ''}
        ${state.tab === 'features' ? renderFeaturesTab(state.auth.me) : ''}
        ${state.tab === 'manage' ? renderManageTab() : ''}
      </div>

      <!-- شريط التنقل السفلي المطابق للصورة تماماً -->
      ${renderBottomNav()}
    </div>
  `;
  attachDashboardEvents();
}

function renderStatusTab(me) {
  const expiresText = formatCountdown(me.expires_at);

  return `
    <div class="w-full flex flex-col items-center justify-center gap-6 text-center animate-rise">
      <!-- شعار logo.png النظيفة والمضيئة -->
      <img src="logo.png" alt="POWER UP" class="max-w-[210px] w-full h-auto object-contain my-3 drop-shadow-[0_0_15px_rgba(229,9,20,0.35)]" />

      <!-- إطار المفتاح مع زر النسخ المطابق للصورة -->
      <div class="flex items-center justify-between w-full max-w-[320px] bg-[#0a0a0a] border border-[#1f1f1f] px-4 py-3 rounded-2xl shadow-inner">
        <span class="text-xs font-semibold tracking-[0.15em] text-[#ccc]">${state.auth.key || 'AMHK-80E1-9AB2-12A8'}</span>
        <button id="copy-key-btn" class="text-[#8a8a8e] hover:text-white transition-colors">
          ${Icons.copy(16)}
        </button>
      </div>

      <!-- زر ADD SUBSCRIPTION الأحمر البارز -->
      <div class="w-full max-w-[320px] mt-1">
        <button id="happ-btn" class="w-full bg-[#e50914] hover:bg-[#c40711] text-white font-bold py-4 px-6 rounded-2xl uppercase tracking-[0.18em] text-xs transition-transform active:scale-[0.99] shadow-lg shadow-[#e50914]/25">
          ADD SUBSCRIPTION
        </button>
      </div>

      <!-- العداد أسفل الزر تماماً -->
      <p class="text-[11px] uppercase tracking-[0.2em] text-[#777] mt-1">
        EXPIRES IN <span class="text-white font-semibold">${expiresText}</span>
      </p>
    </div>
  `;
}

function renderFeaturesTab(me) {
  const f = me.features;
  const marker = f.marker || { enabled: true, type: 'Phantom' };
  const aimpoint = f.aimpoint || { enabled: false };
  const aimLag = f.aimLag || { enabled: false };
  const gloo = f.gloo || { enabled: false };
  const fastRevive = f.fastRevive || { enabled: false };

  const markerTypes = ['Phantom', 'Dreamland', 'Ice Wall', 'Moco', 'Clu', 'Shirou', 'Iris', 'Dreki'];

  return `
    <div class="w-full flex flex-col gap-4 animate-rise px-1 text-left max-h-[70vh] overflow-y-auto pb-4">
      <div class="text-xs font-bold uppercase tracking-[0.2em] text-white px-1">FEATURES</div>

      <!-- Marker Type Card -->
      <div class="card p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-[0.15em] text-[#8a8a8e]">Marker Type</span>
          <button type="button" data-toggle="marker" class="relative h-6 w-11 rounded-full transition-colors ${marker.enabled ? 'bg-[#e50914]' : 'bg-white/10'}">
            <span class="absolute top-0.5 h-5 w-5 rounded-full transition-all ${marker.enabled ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-gray-400'}"></span>
          </button>
        </div>
        <p class="text-[10.5px] text-[#777] mt-1.5">Marks every enemy on your screen. Pick the mark you see.</p>
        <div class="mt-3 flex flex-wrap gap-1.5">
          ${markerTypes.map(type => `
            <button data-marker-type="${type}" class="rounded-xl px-2.5 py-1 text-[11px] transition-colors ${marker.type === type ? 'bg-[#e50914] font-bold text-white' : 'bg-white/[0.04] text-[#8a8a8e] hover:text-white'}">${type}</button>
          `).join('')}
        </div>
      </div>

      <!-- Aimpoint Card -->
      <div class="card p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-[0.15em] text-[#8a8a8e]">Aimpoint</span>
          <button type="button" data-toggle="aimpoint" class="relative h-6 w-11 rounded-full transition-colors ${aimpoint.enabled ? 'bg-[#e50914]' : 'bg-white/10'}">
            <span class="absolute top-0.5 h-5 w-5 rounded-full transition-all ${aimpoint.enabled ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-gray-400'}"></span>
          </button>
        </div>
        <p class="text-[10.5px] text-[#777] mt-1.5">Moves your aim assist from the chest to the neck, so body shots land as headshots.</p>
      </div>

      <!-- Aim Lag Card -->
      <div class="card p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-[0.15em] text-[#8a8a8e]">Aim Lag</span>
          <button type="button" data-toggle="aimLag" class="relative h-6 w-11 rounded-full transition-colors ${aimLag.enabled ? 'bg-[#e50914]' : 'bg-white/10'}">
            <span class="absolute top-0.5 h-5 w-5 rounded-full transition-all ${aimLag.enabled ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-gray-400'}"></span>
          </button>
        </div>
        <p class="text-[10.5px] text-[#777] mt-1.5">Freezes the enemy in place for a moment while you fire or scope, so they are easier to hit.</p>
      </div>

      <!-- Gloo Rotation Card -->
      <div class="card p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-[0.15em] text-[#8a8a8e]">Gloo Rotation</span>
          <button type="button" data-toggle="gloo" class="relative h-6 w-11 rounded-full transition-colors ${gloo.enabled ? 'bg-[#e50914]' : 'bg-white/10'}">
            <span class="absolute top-0.5 h-5 w-5 rounded-full transition-all ${gloo.enabled ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-gray-400'}"></span>
          </button>
        </div>
        <p class="text-[10.5px] text-[#777] mt-1.5">Turns your gloo wall to the angle you set instead of the way you threw it.</p>
      </div>

      <!-- Fast Revive Card -->
      <div class="card p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-[0.15em] text-[#8a8a8e]">Fast Revive</span>
          <button type="button" data-toggle="fastRevive" class="relative h-6 w-11 rounded-full transition-colors ${fastRevive.enabled ? 'bg-[#e50914]' : 'bg-white/10'}">
            <span class="absolute top-0.5 h-5 w-5 rounded-full transition-all ${fastRevive.enabled ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-gray-400'}"></span>
          </button>
        </div>
        <p class="text-[10.5px] text-[#777] mt-1.5">Picks a knocked teammate up in about 100 ms instead of 3 seconds.</p>
      </div>
    </div>
  `;
}

function renderManageTab() {
  return `
    <div class="w-full flex flex-col gap-3 animate-rise px-1 text-left">
      <div class="text-xs font-bold uppercase tracking-[0.2em] text-white px-1">MANAGEMENT</div>
      <button id="unbind-hwid-btn" class="card p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl text-xs font-semibold text-white hover:border-[#e50914]/50 transition-colors">
        Reset Device Lock (Unbind HWID)
      </button>
      <button id="logout-btn" class="card p-4 bg-[#0a0a0a] border border-[#e50914]/30 rounded-2xl text-xs font-bold text-[#e50914] hover:border-[#e50914] transition-colors">
        Log out
      </button>
    </div>
  `;
}

function renderBottomNav() {
  const tabs = [
    { id: 'status', label: 'HOME', icon: Icons.skull(18) },
    { id: 'features', label: 'FEATURES', icon: Icons.slidersHorizontal(18) },
    { id: 'manage', label: 'MANAGE', icon: Icons.settings(18) }
  ];

  return `
    <nav class="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 pointer-events-none">
      <div class="pointer-events-auto flex items-stretch gap-1 rounded-[24px] bg-[#0a0a0a]/95 border border-[#1f1f1f] p-1.5 backdrop-blur-xl shadow-2xl">
        ${tabs.map(item => `
          <button data-nav-tab="${item.id}" class="flex w-[86px] flex-col items-center justify-center gap-1 rounded-[18px] py-2.5 transition-all ${state.tab === item.id ? 'bg-[#18181b] text-white font-bold border border-[#333] shadow-md' : 'text-[#8a8a8e] hover:text-white'}">
            ${item.icon}
            <span class="text-[9.5px] uppercase tracking-[0.1em]">${item.label}</span>
          </button>
        `).join('')}
      </div>
    </nav>
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

  document.querySelectorAll('[data-nav-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.tab = btn.getAttribute('data-nav-tab');
      renderDashboard();
    });
  });

  document.querySelectorAll('[data-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.getAttribute('data-toggle');
      const f = state.auth.me.features;
      if (field === 'marker') f.marker.enabled = !f.marker.enabled;
      else if (field === 'aimpoint') f.aimpoint.enabled = !f.aimpoint.enabled;
      else if (field === 'aimLag') f.aimLag.enabled = !f.aimLag.enabled;
      else if (field === 'gloo') f.gloo.enabled = !f.gloo.enabled;
      else if (field === 'fastRevive') f.fastRevive.enabled = !f.fastRevive.enabled;
      renderDashboard();
      saveFeatures(f);
    });
  });

  document.querySelectorAll('[data-marker-type]').forEach(btn => {
    btn.addEventListener('click', () => {
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

// تشغيل واجهة تسجيل الدخول الأصلية أو لوحة التحكم بناءً على حالة الجلسة
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

  // إذا كان مسجلاً للدخول مسبقاً، اعرض اللوحة مباشرة
  if (state.auth.loggedIn) {
    renderDashboard();
  }
});
