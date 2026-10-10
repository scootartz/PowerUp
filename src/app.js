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
  },
  keyInput: '',
  loading: false,
  error: null,
  happLoading: false
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
  if (!targetIso) return '—';
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

function render() {
  const root = document.getElementById('app');
  if (!root) return;

  const isRtl = state.lang === 'ar';
  document.documentElement.setAttribute('lang', state.lang);
  document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  document.title = 'POWER UP — Client Portal';

  if (!state.auth.loggedIn) return; // الواجهة الأولى لـ index.html

  root.innerHTML = `
    <main class="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-32 pt-6 items-center justify-between">
      
      <!-- شريط علوي مطابق للصورة حرفياً (CONNECTED + زر الترجمة) -->
      <div class="w-full flex items-center justify-between px-1 py-4">
        <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#10b981]">
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
    </main>
  `;
  attachEvents();
}

function renderStatusTab(me) {
  const expiresText = formatCountdown(me.expires_at);

  return `
    <div class="w-full flex flex-col items-center justify-center gap-6 text-center animate-rise">
      
      <!-- استخدام شعار logo.png المطابق تماماً للطلب -->
      <img src="logo.png" alt="POWER UP" class="max-w-[200px] w-full h-auto object-contain my-4 drop-shadow-[0_0_15px_rgba(229,9,20,0.3)]" />

      <!-- إطار المفتاح مع زر النسخ -->
      <div class="flex items-center justify-between w-full max-w-[320px] bg-[#0a0a0a] border border-[#1f1f1f] px-4 py-3 rounded-2xl">
        <span class="text-xs font-semibold tracking-[0.15em] text-[#ccc]">${state.auth.key || 'PWUP-XXXX-XXXX-XXXX'}</span>
        <button id="copy-key-btn" class="text-[#8a8a8e] hover:text-white transition-colors">
          ${Icons.copy(16)}
        </button>
      </div>

      <!-- زر ADD SUBSCRIPTION / إضافة اشتراك أو ربط بـ Happ -->
      <div class="w-full max-w-[320px] mt-2">
        <button id="happ-btn" class="w-full bg-[#e50914] hover:c40711 text-white font-bold py-3.5 px-6 rounded-2xl uppercase tracking-[0.15em] text-xs transition-transform active:scale-[0.99] shadow-lg shadow-[#e50914]/20">
          ${t('add_to_happ')}
        </button>
      </div>

      <!-- عداد انتهاء الصلاحية أسفل الزر تماماً كالصورة -->
      <p class="text-[11px] uppercase tracking-[0.2em] text-[#777] mt-1">
        EXPIRES IN <span class="text-white font-semibold">${expiresText}</span>
      </p>
    </div>
  `;
}

function renderFeaturesTab(me) {
  const f = me.features.marker || { enabled: true, type: 'Power' };
  return `
    <div class="w-full flex flex-col gap-4 animate-rise">
      <div class="px-1 text-xs font-bold uppercase tracking-[0.2em] text-white text-left">${t('features_title')}</div>
      <div class="card p-5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl text-left">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-[0.15em] text-[#8a8a8e]">Marker Type</span>
          <button type="button" data-toggle="marker" class="relative h-6 w-11 rounded-full transition-colors ${f.enabled ? 'bg-[#e50914]' : 'bg-white/10'}">
            <span class="absolute top-0.5 h-5 w-5 rounded-full transition-all ${f.enabled ? 'left-[calc(100%-1.375rem)] bg-white' : 'left-0.5 bg-gray-400'}"></span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderManageTab() {
  return `
    <div class="w-full flex flex-col gap-3 animate-rise text-left">
      <div class="px-1 text-xs font-bold uppercase tracking-[0.2em] text-white">Management</div>
      <button id="unbind-hwid-btn" class="card p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-2xl text-sm text-white hover:border-[#e50914]/50 transition-colors">
        Reset Device Lock (Unbind HWID)
      </button>
      <button id="logout-btn" class="card p-4 bg-[#0a0a0a] border border-[#e50914]/30 rounded-2xl text-sm text-[#e50914] font-bold hover:border-[#e50914] transition-colors">
        ${t('log_out')}
      </button>
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
    <nav class="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 pointer-events-none">
      <div class="pointer-events-auto flex items-stretch gap-1 rounded-[24px] bg-[#0a0a0a]/95 border border-[#1f1f1f] p-1.5 backdrop-blur-xl shadow-2xl">
        ${tabs.map(item => `
          <button data-nav-tab="${item.id}" class="flex w-[82px] flex-col items-center justify-center gap-1 rounded-[18px] py-2.5 transition-all ${state.tab === item.id ? 'bg-[#1a1a1a] text-white font-bold border border-[#333] shadow-lg' : 'text-[#8a8a8e] hover:text-white'}">
            ${item.icon}
            <span class="text-[9.5px] uppercase tracking-[0.1em]">${item.label}</span>
          </button>
        `).join('')}
      </div>
    </nav>
  `;
}

function attachEvents() {
  const langBtn = document.getElementById('lang-toggle-icon');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      state.lang = state.lang === 'en' ? 'ar' : 'en';
      localStorage.setItem('powerup_lang', state.lang);
      render();
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
      render();
    });
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('powerup_session');
      state.auth.loggedIn = false;
      location.reload();
    });
  }
}

// تشغيل الواجهة عند اكتمال التحميل
document.addEventListener('DOMContentLoaded', () => {
  const keyInput = document.getElementById('access-key-input');
  const unlockBtn = document.getElementById('unlock-btn');

  if (unlockBtn) {
    unlockBtn.addEventListener('click', async () => {
      const val = keyInput ? keyInput.value.trim() : '';
      if (!val) return;

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
          location.reload();
        } else {
          alert(data.error || 'Invalid key');
        }
      } catch (err) {
        alert('Network error');
      }
    });
  }

  if (state.auth.loggedIn) {
    render();
  }
});
