// تشغيل التطبيق: الأقسام، الثيم، التحديث، وعامل الخدمة (offline)
import { store } from './store.js';
import { h, icon, toast } from './ui.js';
import { renderHome } from './views/home.js';
import { renderTransactions } from './views/transactions.js';
import { renderPlan } from './views/plan.js';
import { renderWallets } from './views/wallets.js';
import { renderMore } from './views/more.js';
import { refreshRates } from './rates.js';

const TABS = [
  { id: 'home', label: 'الرئيسية', icon: 'home', render: renderHome },
  { id: 'tx', label: 'العمليات', icon: 'list', render: renderTransactions },
  { id: 'plan', label: 'الخطة', icon: 'plan', render: renderPlan },
  { id: 'wallets', label: 'المال', icon: 'wallet', render: renderWallets },
  { id: 'more', label: 'المزيد', icon: 'more', render: renderMore },
];

const viewEl = document.getElementById('view');
const tabsEl = document.getElementById('tabs');
const themeMeta = document.getElementById('theme-color');
let current = 'home';
let lastDay = new Date().toDateString();

function go(id) {
  if (!TABS.some((t) => t.id === id)) return;
  current = id;
  render(true);
}

function render(toTop = false) {
  const y = window.scrollY;
  applyTheme();
  const tab = TABS.find((t) => t.id === current);
  try {
    viewEl.replaceChildren(tab.render({ go }));
  } catch (err) {
    console.error(err);
    viewEl.replaceChildren(h('div', { class: 'empty' },
      h('p', null, 'صار خطأ بعرض هالصفحة.'),
      h('p', { class: 'muted' }, String(err?.message || err))));
  }
  for (const b of tabsEl.children) {
    if (b.dataset.id === current) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  window.scrollTo(0, toTop ? 0 : y);
}

function buildTabs() {
  tabsEl.replaceChildren(...TABS.map((t) => h('button', { class: 'tab', type: 'button', 'data-id': t.id, onclick: () => go(t.id) },
    icon(t.icon, 24), h('span', null, t.label))));
}

function applyTheme() {
  const t = store.state.settings.theme;
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
  if (paper && themeMeta) themeMeta.setAttribute('content', paper);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local && !location.search.includes('sw')) return; // وقت التطوير منشتغل بدون كاش
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => toast('في نسخة جديدة من التطبيق.', {
      action: 'حدّث', duration: 0, onAction: () => worker.postMessage('SKIP_WAITING'),
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
  }).catch((e) => console.warn('SW register failed', e));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}

store.subscribe(() => render());
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
window.addEventListener('store-error', () => toast('ما انحفظت البيانات. ممكن ذاكرة المتصفح ممتلئة.'));
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__installPrompt = e;
  if (current === 'more') render();
});
window.addEventListener('appinstalled', () => {
  window.__installPrompt = null;
  if (current === 'more') render();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const day = new Date().toDateString();
  if (day !== lastDay) { lastDay = day; render(); }
  refreshRates().catch(() => {});
});

buildTabs();
render(true);
// منأخّر جلب الأسعار شوي مشان ما يقطع حركة النقشة بأول فتحة
setTimeout(() => refreshRates().catch(() => {}), 1500);
registerSW();
