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

// دالة العداد بالأيام والساعات تماماً كما طلبتها
function formatCountdown(targetIso) {
  if (!targetIso) return '3649D 18H';
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return 'EXPIRED';
  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  if (days > 0) return `${days}D ${hours}H`;
  const mins = Math.floor((sec % 3600) / 60);
  return `${hours}H ${mins}M`;
}

async function getRealClientDevice() {
  const ua = navigator.userAgent || '';
  let os = 'Android';
  let deviceName = 'Android Device';
  if (/Windows/i.test(ua)) { os = 'Windows'; deviceName = 'Windows PC'; }
  let hwid = localStorage.getItem('powerup_hwid');
  if (!hwid) {
    hwid = `PWUP-${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
    localStorage.setItem('powerup_hwid', hwid);
  }
  return { hwid, device_model: deviceName, device_os: os };
}

function formatKey(val) {
  return (val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 19).match(/.{1,4}/g) ?? []).join('-');
}

function render() {
  const root = document.getElementById('app');
  if (!root) return;

  const isRtl = state.lang === 'ar';
  document.documentElement.setAttribute('lang', state.lang);
  document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  document.title = 'POWER UP — Client Portal';

  let html = '';
  if (!state.auth.loggedIn) {
    html = renderKeyGate();
  } else {
    html = renderDashboard();
  }
  root.innerHTML = html;
  attachEvents();
}

function renderKeyGate() {
  return `
    <main class="relative flex min-h-dvh flex-col items-center justify-center px-6 w-full">
      <div class="card flex w-full max-w-xs flex-col items-center gap-5 p-7 border-[#1f1f1f] bg-[#09090b] shadow-[0_20px_40px_rgba(0,0,0,0.8)] rounded-[28px]">
        
        <img src="logo.png" alt="POWER UP" style="max-width: 210px; width: 100%; height: auto; object-fit: contain; filter: drop-shadow(0 0 20px rgba(229, 9, 20, 0.4));" />

        <p class="text-[11.5px] text-center text-[#71717a] tracking-[0.5px]">No account, no password. Your key only.</p>
        
        <form id="key-form" class="flex w-full flex-col gap-3">
          <span class="text-[11px] font-bold text-[#a1a1aa] uppercase tracking-[1.5px] text-left">Access Key</span>
          <div class="flex items-center bg-[#050505] border border-[#27272a] rounded-[16px] p-1">
            <button type="button" id="paste-btn" class="bg-[#18181b] text-[#d4d4d8] border-none rounded-[12px] px-3 py-2.5 text-[11px] font-bold cursor-pointer">Paste</button>
            <input 
              id="key-input"
              type="text"
              placeholder="PWUP-XXXX-XXXX-XXXX" 
              spellcheck="false" 
              autocomplete="off" 
              autofocus 
              class="w-full bg-transparent border-none text-white text-center text-[11.5px] font-semibold tracking-[1.5px] outline-none" 
              value="${state.keyInput}"
              maxlength="19"
            />
          </div>
          
          ${state.error ? `<p class="text-center text-xs text-[#e50914]">${state.error}</p>` : ''}
          
          <button type="submit" class="w-full bg-[#e50914] text-white font-extrabold uppercase tracking-[2px] py-4 rounded-[16px] text-[13px] cursor-pointer shadow-[0_8px_24px_rgba(229,9,20,0.3)] mt-2" ${state.loading ? 'disabled' : ''}>
            ${state.loading ? 'Authenticating...' : 'Unlock'}
          </button>
        </form>
      </div>
      
      <p class="mt-6 text-center text-[10.5px] text-[#52525b] leading-relaxed">No key? Contact your seller.<br/>Time starts upon connection.</p>
    </main>
  `;
}

function renderDashboard() {
  const me = state.auth.me;
  const expiresText = formatCountdown(me.expires_at);

  return `
    <main class="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-32 pt-6 w-full items-center">
      
      <div class="flex w-full items-center justify-between px-1 py-4">
        <div class="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[2px] text-[#10b981]">
          <span class="h-2 w-2 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981]"></span>
          CONNECTED
        </div>
        
        <button id="lang-btn" class="flex h-10 w-10 items-center justify-center rounded-full bg-[#0a0a0a] border border-[#1f1f1f] text-[#ccc]">
          ${Icons.languages(18)}
        </button>
      </div>

      <div class="flex flex-1 flex-col items-center justify-center w-full my-auto text-center gap-5">
        <img src="logo.png" alt="POWER UP" style="max-width: 210px; width: 100%; height: auto; object-fit: contain; filter: drop-shadow(0 0 20px rgba(229, 9, 20, 0.4));" />

        <div class="w-full max-w-[320px] bg-[#0a0a0a] border border-[#1f1f1f] rounded-[20px] p-3.5 flex justify-between items-center box-sizing">
          <span class="text-[12px] font-bold tracking-[1.5px] text-[#ddd] mx-auto">${state.auth.key}</span>
          <button id="copy-key-btn" class="bg-transparent border-none text-[#77] cursor-pointer">${Icons.copy(16)}</button>
        </div>

        <div class="w-full max-w-[320px]">
          <button id="happ-btn" class="w-full bg-[#e50914] text-white border-none rounded-[16px] p-4 text-[13px] font-extrabold tracking-[2px] uppercase cursor-pointer shadow-[0_8px_24px_rgba(229,9,20,0.25)]">
            ADD SUBSCRIPTION
          </button>
        </div>

        <p class="text-[11px] uppercase tracking-[2px] text-[#666]">
          EXPIRES IN <span class="text-white font-bold">${expiresText}</span>
        </p>
      </div>

    </main>
    ${renderBottomNav()}
  `;
}

function renderBottomNav() {
  const tabs = [
    { id: 'status', label: t('nav_home'), icon: Icons.skull(18) },
    { id: 'features', label: t('nav_features'), icon: Icons.slidersHorizontal(18) },
    { id: 'manage', label: t('nav_manage'), icon: Icons.settings(18) }
  ];

  return `
    <nav class="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-3">
      <div class="pointer-events-auto flex items-stretch gap-1.5 rounded-[24px] bg-[#0a0a0a]/95 border border-[#1f1f1f] p-1.5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
        ${tabs.map(item => `
          <button data-nav-tab="${item.id}" class="flex w-[84px] flex-col items-center justify-center gap-1 rounded-[18px] py-2.5 transition-all ${state.tab === item.id ? 'bg-[#1a1a1a] border border-[#333] text-white font-bold' : 'text-[#777]'}">
            ${item.icon}
            <span class="text-[9px] uppercase tracking-[1px] font-extrabold">${item.label}</span>
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

  const pasteBtn = document.getElementById('paste-btn');
  if (pasteBtn && keyInput) {
    pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          state.keyInput = formatKey(text);
          keyInput.value = state.keyInput;
        }
      } catch (e) {}
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
          localStorage.setItem('powerup_session', JSON.stringify({ key: val, me: state.auth.me }));
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

  const copyKeyBtn = document.getElementById('copy-key-btn');
  if (copyKeyBtn) {
    copyKeyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(state.auth.key);
      alert('Key copied successfully');
    });
  }

  const happBtn = document.getElementById('happ-btn');
  if (happBtn) {
    happBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/happ?key=${encodeURIComponent(state.auth.key)}`);
        const data = await res.json();
        if (data.deepLink) {
          window.location.href = data.deepLink;
        } else {
          const subUrl = `https://${window.location.host}/api/happ?key=${encodeURIComponent(state.auth.key)}`;
          window.location.href = `happ://import?data=${encodeURIComponent(btoa(subUrl))}`;
        }
      } catch (e) {
        const subUrl = `https://${window.location.host}/api/happ?key=${encodeURIComponent(state.auth.key)}`;
        window.location.href = `happ://import?data=${encodeURIComponent(btoa(subUrl))}`;
      }
    });
  }

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('powerup_session');
      state.auth.loggedIn = false;
      state.auth.key = '';
      render();
    });
  }
}

render();
