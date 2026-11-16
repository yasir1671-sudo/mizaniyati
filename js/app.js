// تشغيل التطبيق: التنقّل بين الصفحات، الشريط السفلي، التحديث، والشغل بدون نت
import { store } from './store.js';
import { h, icon, toast, haptic } from './ui.js';
import { setHideAmounts } from './money.js';
import { refreshRates } from './rates.js';
import { renderHome } from './views/home.js';
import { renderActivity } from './views/activity.js';
import { renderReportsPage } from './views/reports.js';
import { renderPlanHub, renderPlanMonth, renderPlanYear, renderPlanItems, renderPlanGoals, planActions, resetPlanMonth } from './views/plan.js';
import { renderBills, billsActions } from './views/bills.js';
import { renderMoneyHub, renderDebts, renderZakat, moneyActions } from './views/money.js';
import { renderSettings, renderCategories, categoriesActions } from './views/settings.js';
import { openAddSheet } from './keypad.js';
import { openOnboarding } from './onboarding.js';

/* كل صفحة: لأي تبويب بتنتمي، ومين أبوها (للصفحات الفرعية اللي إلها زر رجوع) */
const ROUTES = {
  home: { tab: 'home', render: renderHome },
  activity: { tab: 'activity', render: renderActivity },
  'activity/reports': { tab: 'activity', parent: 'activity', title: 'تحليل المصاريف', render: renderReportsPage },
  plan: { tab: 'plan', render: renderPlanHub },
  'plan/month': { tab: 'plan', parent: 'plan', title: 'ميزانية الشهر', render: renderPlanMonth, onEnter: resetPlanMonth },
  'plan/bills': { tab: 'plan', parent: 'plan', title: 'الاشتراكات والفواتير', render: renderBills, actions: billsActions },
  'plan/year': { tab: 'plan', parent: 'plan', title: 'السنة الجاية', render: renderPlanYear, actions: planActions.year },
  'plan/items': { tab: 'plan', parent: 'plan', title: 'المشتريات والالتزامات', render: renderPlanItems, actions: planActions.items },
  'plan/goals': { tab: 'plan', parent: 'plan', title: 'الأهداف والادخار', render: renderPlanGoals, actions: planActions.goals },
  money: { tab: 'money', render: renderMoneyHub },
  'money/debts': { tab: 'money', parent: 'money', title: 'الديون', render: renderDebts, actions: moneyActions.debts },
  'money/zakat': { tab: 'money', parent: 'money', title: 'الزكاة', render: renderZakat },
  settings: { tab: 'home', parent: 'home', title: 'الإعدادات', render: renderSettings },
  'settings/categories': { tab: 'home', parent: 'settings', title: 'الفئات', render: renderCategories, actions: categoriesActions },
};

const TABS = [
  { id: 'home', label: 'الرئيسية', icon: 'home' },
  { id: 'activity', label: 'السجل', icon: 'list' },
  { id: 'add' },
  { id: 'plan', label: 'الخطة', icon: 'plan' },
  { id: 'money', label: 'المال', icon: 'wallet' },
];

const viewEl = document.getElementById('view');
const tabsEl = document.getElementById('tabs');
const scrollMemory = new Map();
let routeStack = [];
let current = 'home';
let lastDay = new Date().toDateString();

const parsePath = () => {
  const p = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  return ROUTES[p] ? p : 'home';
};

// تبويب: منبدّل بدون ما نكبّر السجل. صفحة فرعية: منضيفها للسجل مشان زر الرجوع
function go(path) {
  if (!ROUTES[path]) return;
  routeStack = [path];
  if (parsePath() === path && location.hash) { navigateTo(path, 'tab-in'); return; }
  location.replace(`#/${path}`);
}
function open(path) {
  if (!ROUTES[path]) return;
  location.hash = `#/${path}`;
}
function back() {
  const parent = ROUTES[current]?.parent || 'home';
  if (routeStack.length > 1) history.back();
  else { routeStack = [parent]; location.replace(`#/${parent}`); }
}
const ctx = { go, open, back, refresh: () => render() };

window.addEventListener('hashchange', () => {
  const path = parsePath();
  let dir = 'tab-in';
  if (routeStack.length > 1 && routeStack[routeStack.length - 2] === path) { routeStack.pop(); dir = 'back'; }
  else if (routeStack[routeStack.length - 1] !== path) {
    if (ROUTES[path].parent) { routeStack.push(path); dir = 'fwd'; } else routeStack = [path];
  }
  navigateTo(path, dir);
});

function navigateTo(path, dir) {
  scrollMemory.set(current, window.scrollY);
  current = path;
  if (dir !== 'back') ROUTES[path].onEnter?.();
  render({ dir, scroll: dir === 'back' ? (scrollMemory.get(path) || 0) : 0 });
}

function render({ dir = null, scroll = null } = {}) {
  const y = window.scrollY;
  setHideAmounts(store.state.settings.hideAmounts);
  const route = ROUTES[current];
  let page;
  try {
    const content = route.render(ctx);
    if (route.parent) {
      page = h('div', { class: 'page' },
        h('header', { class: 'subhead' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'رجوع', onclick: () => { haptic('tap'); back(); } }, icon('chevR', 22)),
          h('h1', null, route.title),
          route.actions ? route.actions(ctx) : null),
        content);
    } else {
      page = h('div', { class: 'page' }, content);
    }
  } catch (err) {
    console.error(err);
    page = h('div', { class: 'page' }, h('div', { class: 'empty' },
      h('p', null, 'صار خطأ بعرض هالصفحة.'),
      h('p', { class: 'muted' }, String(err?.message || err))));
  }
  if (dir) page.classList.add(dir);
  viewEl.replaceChildren(page);
  for (const b of tabsEl.querySelectorAll('.tab')) {
    if (b.dataset.id === route.tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  window.scrollTo(0, scroll ?? y);
}

function buildTabs() {
  tabsEl.replaceChildren(...TABS.map((t) => {
    if (t.id === 'add') {
      return h('button', { class: 'fab', type: 'button', 'aria-label': 'إضافة عملية', onclick: () => { haptic('select'); openAddSheet(); } }, icon('plus', 28, { stroke: 2.4 }));
    }
    return h('button', {
      class: 'tab', type: 'button', 'data-id': t.id,
      onclick: () => { haptic('tap'); if (ROUTES[current].tab === t.id && current === t.id) window.scrollTo({ top: 0, behavior: 'smooth' }); else go(t.id); },
    }, icon(t.icon, 24), h('span', null, t.label));
  }));
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
window.addEventListener('store-error', () => toast('ما انحفظت البيانات. ممكن ذاكرة المتصفح ممتلئة.', { kind: 'warn' }));
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__installPrompt = e;
  if (current === 'settings') render();
});
window.addEventListener('appinstalled', () => {
  window.__installPrompt = null;
  if (current === 'settings') render();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const day = new Date().toDateString();
  if (day !== lastDay) { lastDay = day; render(); }
  refreshRates().catch(() => {});
});

buildTabs();
current = parsePath();
routeStack = ROUTES[current].parent ? [ROUTES[current].parent, current] : [current];
render({ dir: 'tab-in', scroll: 0 });
setTimeout(() => refreshRates().catch(() => {}), 1500);
if (!store.state.settings.onboarded) setTimeout(() => openOnboarding(), 400);
registerSW();
