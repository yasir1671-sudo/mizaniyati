// الرئيسية: مصروف اليوم، الإدخال السريع، المستحقات، الاختصارات، ملخص الشهر
import { h, icon, toast, haptic, swipeable } from '../ui.js';
import { incomeStatus, recurringStatus, SOURCE_CATEGORY } from '../income.js';
import { badge } from '../icons.js';
import { store, uid, catLabel, catIcon, catTint } from '../store.js';
import { CURRENCIES, fmt, rateOf, toUSD } from '../money.js';
import { todayISO, monthLabel, daysText, daysUntil, longDate } from '../dates.js';
import { dailyAllowance, plan, monthStats, netWorth, sortTx, debtRemaining } from '../calc.js';
import { parseQuick, parseMulti } from '../parse.js';
import { openVoice, reviewText } from '../voice.js';
import { openRateForm, INCOME_KINDS } from '../forms.js';
import { openAddSheet } from '../keypad.js';
import { group, txRow, bar, cashCard } from '../components.js';
import { buildPlan } from '../planner.js';
import { computeZakat, zakatDueDate } from '../zakat.js';
import { openOnboarding } from '../onboarding.js';
import { toggleHideAmounts } from '../pin.js';

let introPlayed = false;

export function renderHome({ open }) {
  const st = store.state;
  const today = todayISO();
  const key = today.slice(0, 7);
  const a = dailyAllowance(st, today);
  const p = plan(st, key);
  const ms = monthStats(st, key);
  const P = buildPlan(st);

  return [
    greeting(st, open),
    hero(a),
    quickAdd(),
    frequentChips(st),
    dueCard(st, key),
    cashCard(st, key, { compact: true }),
    rateBanners(st),
    zakatBanner(st, open),
    backupBanner(st, open),
    tiles(st, P, open),
    monthCard(ms, p, key, open),
    budgetsCard(st, ms, open),
    upcomingCard(st, P, key, open),
    recentCard(st, open),
  ];
}

/* ---------- الترحيب ---------- */
function greeting(st, open) {
  const hr = new Date().getHours();
  const hello = hr >= 4 && hr < 12 ? 'صباح الخير' : 'مسا الخير';
  const name = (st.settings.name || '').trim();
  const hidden = st.settings.hideAmounts;
  return h('header', { class: 'greet' },
    h('div', null,
      h('small', null, longDate(todayISO())),
      h('strong', null, name ? `${hello} يا ${name}` : hello)),
    h('div', { class: 'head-actions' },
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': hidden ? 'أظهر المبالغ' : 'خبّي المبالغ', 'aria-pressed': String(hidden),
        onclick: () => toggleHideAmounts(),
      }, icon(hidden ? 'eyeOff' : 'eye', 20)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'الإعدادات', onclick: () => open('settings') }, icon('sliders', 20))));
}

/* ---------- حلقة مصروف اليوم ---------- */
function ring(fraction, over, animate) {
  const NS = 'http://www.w3.org/2000/svg';
  const r = 64;
  const C = 2 * Math.PI * r;
  const id = `rg${Math.random().toString(36).slice(2, 7)}`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 150 150');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${over ? '#FF8A7A' : '#4AD6A0'}"/><stop offset="1" stop-color="${over ? '#E0485A' : '#1C98A6'}"/>
    </linearGradient></defs>
    <circle class="ring-track" cx="75" cy="75" r="${r}" fill="none" stroke-width="12"/>
    <circle class="ring-fill" cx="75" cy="75" r="${r}" fill="none" stroke="url(#${id})" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${animate ? C : C * (1 - fraction)}"/>`;
  if (animate) {
    const fill = svg.querySelector('.ring-fill');
    requestAnimationFrame(() => requestAnimationFrame(() => fill.setAttribute('stroke-dashoffset', String(C * (1 - fraction)))));
  }
  return svg;
}

function hero(a) {
  if (a.source === 'none') {
    return h('section', { class: 'hero-card' },
      h('div', { class: 'hero-empty' },
        badge('sparkle', 'mint', 56),
        h('h2', null, 'خلّينا نجهّز خطتك'),
        h('p', null, 'دقيقة وحدة: دخلك، وقدّيش بدك تدّخر، وبنوزّع لك الميزانية. بعدها بيطلع لك هون قدّيش فيك تصرف كل يوم.'),
        h('button', { class: 'btn', type: 'button', onclick: () => openOnboarding() }, icon('sparkle', 18), 'يلا نبلّش')));
  }
  const over = a.left < 0;
  const fraction = a.perDay > 0 ? Math.max(0, Math.min(1, a.left / a.perDay)) : 0;
  const value = fmt(Math.abs(a.left));
  const animate = !introPlayed;
  introPlayed = true;
  const stat = (name, tint, label, val) => h('div', { class: 'hero-stat' }, badge(name, tint, 34), h('div', null, h('small', null, label), h('b', null, val)));
  return h('section', { class: `hero-card${over ? ' over' : ''}`, 'aria-label': 'مصروف اليوم' },
    h('div', { class: 'ring-wrap' },
      ring(fraction, over, animate),
      h('div', { class: 'ring-center' },
        h('small', null, over ? 'تجاوزت اليوم' : 'باقي لك اليوم'),
        h('strong', { class: value.length > 9 ? 'long' : '' }, value),
        h('span', null, `من ${fmt(a.perDay)}`))),
    h('div', { class: 'hero-stats' },
      stat('arrowDown', 'coral', 'صرفت اليوم', fmt(a.todaySpent)),
      stat('calendar', a.monthLeft < 0 ? 'coral' : 'teal', a.monthLeft < 0 ? 'تجاوزت الشهر' : 'باقي للشهر', fmt(Math.abs(a.monthLeft))),
      stat('flag', 'gold', 'ضل بالشهر', daysText(a.daysLeft))));
}

/* ---------- الإدخال السريع ---------- */
function quickAdd() {
  const addBtn = h('button', { class: 'quick-add', type: 'submit', 'aria-label': 'أضف', hidden: true }, icon('check', 20, { stroke: 2.4 }));
  const input = h('input', {
    type: 'text', class: 'quick-input', placeholder: 'احكي أو اكتب: 50 أكل و20 قهوة',
    enterkeyhint: 'done', autocomplete: 'off', 'aria-label': 'إدخال سريع: اكتب مصروفك',
    oninput: (e) => { addBtn.hidden = !e.target.value.trim(); },
  });
  return h('section', { class: 'quick-wrap' },
    h('form', { class: 'quick', onsubmit: (e) => { e.preventDefault(); submitQuick(input); } },
      h('button', { class: 'quick-mic', type: 'button', 'aria-label': 'سجّل بالصوت', onclick: () => { haptic('select'); openVoice(); } }, icon('mic', 22, { stroke: 2 })),
      input,
      addBtn),
    h('p', { class: 'quick-hint' }, 'اضغط المايك واحكي متل ما بتحكي: «صرفت 50 تركي مواصلات و30 قهوة».'));
}

function addTx(tx, label) {
  store.update((s) => { s.transactions.push(tx); });
  haptic('success');
  toast(label, { action: 'تراجع', onAction: () => store.update((s) => { s.transactions = s.transactions.filter((t) => t.id !== tx.id); }) });
}

function submitQuick(input) {
  const st = store.state;
  // جملة فيها كذا مبلغ أو سياق: منعرضها للمراجعة. مبلغ واحد واضح: بينضاف فوراً
  const multi = parseMulti(input.value, st);
  if (multi.length > 1 || (multi.length === 1 && !multi[0].matched)) { reviewText(input.value); return; }
  const r = parseQuick(input.value, st);
  if (!r.ok) {
    if (r.reason === 'empty') { input.focus(); return; }
    if (r.reason === 'no-account') { toast(`ما عندك محفظة بـ ${CURRENCIES[r.currency].name}. ضيفها من المال.`, { kind: 'warn' }); return; }
    openAddSheet({ note: r.note });
    return;
  }
  const rate = rateOf(st, r.currency);
  if (!rate) {
    openAddSheet({ type: r.type, amount: r.amount, accountId: r.accountId, categoryId: r.categoryId, note: r.note });
    return;
  }
  const c = st.categories.find((x) => x.id === r.categoryId);
  addTx({
    id: uid('tx'), type: r.type, date: todayISO(), accountId: r.accountId, amount: r.amount,
    categoryId: r.categoryId, note: r.note, usd: r.amount / rate, createdAt: Date.now(),
  }, `انضاف ${fmt(r.amount, r.currency)} على ${catLabel(c)}`);
}

// أكتر شي بتسجّله: كبسة وحدة بتضيفه
function frequentChips(st) {
  const since = Date.now() - 75 * 86400000;
  const counts = new Map();
  for (const t of st.transactions) {
    if (t.type !== 'expense' || t.planItemId || t.noDaily || (t.createdAt || 0) < since) continue;
    const k = `${t.categoryId}|${t.amount}|${t.accountId}|${t.note || ''}`;
    const e = counts.get(k) || { t, n: 0 };
    e.n += 1;
    counts.set(k, e);
  }
  const top = [...counts.values()].filter((e) => e.n >= 2).sort((a, b) => b.n - a.n).slice(0, 5);
  if (!top.length) return null;
  return h('div', { class: 'freq', role: 'list', 'aria-label': 'تكرار سريع' }, top.map(({ t }) => {
    const c = st.categories.find((x) => x.id === t.categoryId);
    const acc = st.accounts.find((x) => x.id === t.accountId);
    const label = c?.private ? catLabel(c) : (t.note || catLabel(c));
    return h('button', {
      type: 'button', role: 'listitem',
      onclick: () => {
        const rate = rateOf(store.state, acc?.currency || 'USD');
        if (!rate) { openAddSheet({ amount: t.amount, accountId: t.accountId, categoryId: t.categoryId, note: t.note }); return; }
        addTx({ ...t, id: uid('tx'), date: todayISO(), usd: t.amount / rate, createdAt: Date.now() }, `انضاف ${fmt(t.amount, acc?.currency)} ${label}`);
      },
    }, badge(catIcon(c), catTint(c), 24), label, h('b', null, fmt(t.amount, acc?.currency || 'USD')));
  }));
}

/* ---------- مستحقات الشهر: دفعات دخل وصل وقتها، واشتراكات قرّب تجديدها ---------- */
function dismiss(id, label) {
  store.update((s) => { s.settings.dismissed = { ...(s.settings.dismissed || {}), [id]: true }; });
  toast(`انشال تذكير ${label}`, {
    action: 'تراجع',
    onAction: () => store.update((s) => { const x = { ...(s.settings.dismissed || {}) }; delete x[id]; s.settings.dismissed = x; }),
  });
}

function dueCard(st, key) {
  const today = todayISO();
  const day = Number(today.slice(8, 10));
  const rows = [];
  const accFor = (cur) => st.accounts.find((x) => x.id === st.settings.defaultAccountId && x.currency === cur) || st.accounts.find((x) => x.currency === cur && !x.savings);

  // دفعات الدخل: بتطلع من يوم قبل موعدها، وبتختفي لما تسجّلها (أو تسحبها)
  for (const { source: s, parts } of incomeStatus(st, key).list) {
    const k = INCOME_KINDS[s.kind] || INCOME_KINDS.other;
    for (const p of parts) {
      if (p.done || p.day > day + 1) continue;
      const multi = parts.length > 1;
      const partial = p.gotUSD > 0.5;
      const title = multi ? `وصلت الدفعة ${p.index + 1} من «${s.name}»؟` : `وصل «${s.name}»؟`;
      let when;
      if (p.day === day) when = 'متوقعة اليوم';
      else if (p.day === day + 1) when = 'متوقعة بكرة';
      else when = `كانت متوقعة ${p.day} بالشهر`;
      const sub = partial ? `وصل جزء، باقي ${fmt(p.remaining, s.currency)}` : `${when}، ${fmt(p.remaining, s.currency)}`;
      const id = `src:${s.id}:${key}:${p.index}`;
      rows.push(swipeable(h('div', { class: 'row' },
        badge(k.icon, 'mint', 40),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), h('span', { class: 'row-sub wrap' }, sub)),
        h('button', {
          class: 'btn small', type: 'button',
          onclick: () => openAddSheet({ type: 'income', amount: Math.round(p.remaining * 100) / 100, accountId: accFor(s.currency)?.id, categoryId: SOURCE_CATEGORY[s.kind] || 'inc_other', note: s.name, sourceId: s.id }),
        }, 'سجّل')), () => dismiss(id, s.name)));
    }
  }

  // الاشتراكات والفواتير الدورية: قبل الموعد بيوم
  for (const { r, dueDay, diff, show } of recurringStatus(st, today)) {
    if (!show) continue;
    let sub;
    if (diff === 1) sub = `بيتجدد بكرة (${dueDay} بالشهر)`;
    else if (diff === 0) sub = 'بيتجدد اليوم';
    else sub = `متأخر ${daysText(-diff)}`;
    const c = st.categories.find((x) => x.id === r.categoryId);
    const id = `rec:${r.id}:${key}`;
    rows.push(swipeable(h('div', { class: 'row' },
      badge(r.icon || catIcon(c), r.tint || catTint(c), 40),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, `تجديد «${r.name}»`), h('span', { class: `row-sub ${diff < 0 ? 'warn' : ''}`.trim() }, `${sub}، ${fmt(r.amount, r.currency)}`)),
      h('button', {
        class: 'btn secondary small', type: 'button',
        onclick: () => openAddSheet({ type: 'expense', amount: r.amount, accountId: r.accountId || accFor(r.currency)?.id, categoryId: r.categoryId, note: r.name, recurringId: r.id }),
      }, 'دفعته')), () => dismiss(id, r.name)));
  }
  if (!rows.length) return null;
  return group('مستحقات هالشهر', rows.slice(0, 5), { action: rows.length ? h('span', { class: 'muted', style: { fontSize: '11.5px' } }, 'اسحب لتزيل') : null });
}

/* ---------- تنبيهات ---------- */
function bannerEl(iconName, text, btnLabel, onclick, cls = '') {
  return h('div', { class: `banner ${cls}`.trim() },
    h('span', { class: 'banner-ic' }, icon(iconName, 22)),
    h('p', null, text),
    btnLabel ? h('button', { class: 'btn small', type: 'button', onclick }, btnLabel) : null);
}

function rateBanners(st) {
  const needed = new Set(st.accounts.map((a) => a.currency));
  needed.delete('USD');
  return [...needed].filter((c) => !rateOf(st, c)).map((c) => bannerEl('info', `حدد سعر ${CURRENCIES[c].name} مشان تنحسب مصاريفها بالدولار.`, 'حدد السعر', () => openRateForm(c)));
}

function zakatBanner(st, open) {
  const due = zakatDueDate(st);
  if (!due) return null;
  const left = daysUntil(due);
  if (left > 30) return null;
  const Z = computeZakat(st);
  if (!(Z.due > 0)) return null;
  let when;
  if (left > 0) when = `بعد ${daysText(left)}`;
  else if (left === 0) when = 'اليوم';
  else when = `من ${daysText(-left)}`;
  return bannerEl('moon', `زكاتك مستحقة ${when}: ${fmt(Z.due)}.`, 'التفاصيل', () => open('money/zakat'), 'gold-banner');
}

function backupBanner(st, open) {
  if (st.transactions.length < 10) return null;
  const last = st.settings.lastBackupAt || 0;
  if (Date.now() - last < 14 * 86400000) return null;
  return bannerEl('shield', last ? 'صار لك أكتر من أسبوعين ما حفظت نسخة احتياطية.' : 'بياناتك على هالموبايل بس. احفظ نسخة احتياطية.', 'احفظ', () => open('settings'), 'warn-banner');
}

/* ---------- اختصارات لكل الميزات ---------- */
function tiles(st, P, open) {
  const planned = st.planItems.filter((i) => i.status !== 'bought');
  let theyOwe = 0;
  let iOwe = 0;
  for (const d of st.debts) {
    const u = toUSD(st, debtRemaining(d), d.currency);
    if (!Number.isFinite(u)) continue;
    if (d.direction === 'theyOwe') theyOwe += u; else iOwe += u;
  }
  const zDue = zakatDueDate(st);
  let zakatSub = 'احسب زكاتك';
  if (zDue) { const left = daysUntil(zDue); zakatSub = left >= 0 ? `بعد ${daysText(left)}` : 'مستحقة'; }
  let debtSub = 'ما في ديون';
  if (theyOwe > 0.005) debtSub = `إلك ${fmt(theyOwe)}`;
  else if (iOwe > 0.005) debtSub = `عليك ${fmt(iOwe)}`;
  const tile = (iconName, tint, title, sub, path) => h('button', { class: 'tile', type: 'button', onclick: () => { haptic('tap'); open(path); } },
    badge(iconName, tint, 38), h('div', null, h('b', null, title), h('small', null, sub)));
  return h('section', { class: 'tiles', 'aria-label': 'اختصارات' },
    tile('trend', 'blue', 'السنة', P.totals.income > 0 ? `آخر السنة ${fmt(P.endBalance)}` : 'خطة 12 شهر', 'plan/year'),
    tile('bag', 'violet', 'المشتريات', planned.length ? `${planned.length} بالخطة` : 'ضيف غرض', 'plan/items'),
    tile('target', 'gold', 'الأهداف', st.goals.length ? `${st.goals.length} هدف` : 'ادّخر لشي', 'plan/goals'),
    tile('people', 'pink', 'الديون', debtSub, 'money/debts'),
    tile('moon', 'amber', 'الزكاة', zakatSub, 'money/zakat'),
    tile('chart', 'teal', 'التحليل', 'وين راحت المصاري', 'activity/reports'));
}

/* ---------- الشهر ---------- */
function monthCard(ms, p, key, open) {
  const incRatio = p.income > 0 ? ms.income / p.income : 0;
  const expRatio = p.total > 0 ? ms.expense / p.total : 0;
  const expState = expRatio > 1 ? 'over' : expRatio >= 0.85 ? 'warn' : '';
  return h('section', { class: 'group' },
    h('div', { class: 'group-head' },
      h('h2', null, monthLabel(key)),
      h('button', { class: 'link-btn', type: 'button', onclick: () => open('activity/reports') }, 'التحليل', icon('chevL', 16))),
    h('div', { class: 'duo' },
      h('div', null,
        h('small', null, 'الدخل اللي وصل'),
        h('b', { class: 'amount income' }, fmt(ms.income)),
        p.income > 0 ? bar(incRatio) : null,
        h('span', null, p.income > 0 ? `من ${fmt(p.income)} متوقع` : 'ما في دخل متوقع')),
      h('div', null,
        h('small', null, 'المصروف'),
        h('b', { class: `amount ${expState === 'over' ? 'over' : ''}`.trim() }, fmt(ms.expense)),
        p.total > 0 ? bar(expRatio, expState) : null,
        h('span', null, p.total > 0 ? `من ميزانية ${fmt(p.total)}` : 'ما في ميزانية'))),
    p.savings > 0 ? h('p', { class: 'row-note' }, `خطتك تشيل ${fmt(p.savings)} ادخار هالشهر.`) : null);
}

function budgetsCard(st, ms, open) {
  const items = st.categories
    .filter((c) => c.type === 'expense' && ((c.budget || 0) > 0 || (ms.byCat.get(c.id) || 0) > 0))
    .map((c) => ({ c, spent: ms.byCat.get(c.id) || 0 }))
    .sort((x, y) => (y.spent / (y.c.budget || 1)) - (x.spent / (x.c.budget || 1)))
    .slice(0, 4);
  if (!items.length) return null;
  return group('الميزانية', items.map(({ c, spent }) => {
    const b = c.budget || 0;
    const ratio = b ? spent / b : 0;
    const state = !b ? '' : ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : '';
    return h('div', { class: 'row' },
      badge(catIcon(c), catTint(c), 40),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, catLabel(c)),
        b ? bar(ratio, state) : null),
      h('span', { class: 'row-end' },
        h('span', { class: `amount ${state}`.trim() }, fmt(spent)),
        b ? h('span', { class: 'row-sub' }, `من ${fmt(b)}`) : null));
  }), { action: h('button', { class: 'link-btn', type: 'button', onclick: () => open('plan/month') }, 'عدّل', icon('chevL', 16)) });
}

function upcomingCard(st, P, key, open) {
  const entries = P.rows.slice(0, 3).flatMap((r) => r.entries
    .filter((e) => e.kind !== 'bought' && e.kind !== 'debtDone')
    .map((e) => ({ ...e, month: r.month })));
  if (!entries.length) return null;
  const when = (e, word) => (e.month === key ? `${word} هالشهر` : `${word} بـ ${monthLabel(e.month, { year: false })}`);
  return group('جاية قريباً', entries.slice(0, 4).map((e) => {
    let sub;
    let path = 'plan/items';
    if (e.kind === 'commitment') sub = e.it.month < key ? 'التزام فات موعده' : when(e, 'التزام');
    else if (e.kind === 'debtIn') { sub = when(e, 'دين راجع إلك'); path = 'money/debts'; }
    else if (e.kind === 'debtOut') { sub = when(e, 'دين لازم تسدّه'); path = 'money/debts'; }
    else sub = e.month === key ? 'فيك تشتريه هالشهر' : `مخطط بـ ${monthLabel(e.month, { year: false })}`;
    const tint = e.kind === 'debtIn' ? 'blue' : e.kind === 'debtOut' || e.kind === 'commitment' ? 'coral' : 'violet';
    return h('button', { class: 'row', type: 'button', onclick: () => open(path) },
      badge(e.it.icon || 'bag', tint, 40),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, e.it.name),
        h('span', { class: 'row-sub' }, sub)),
      h('span', { class: 'row-end' }, h('span', { class: `amount ${e.kind === 'debtIn' ? 'income' : ''}`.trim() }, fmt(e.usd, 'USD', { sign: e.kind === 'debtIn' }))));
  }));
}

function recentCard(st, open) {
  const recent = sortTx(st.transactions).slice(0, 5);
  if (!recent.length) {
    return h('section', { class: 'group' },
      h('div', { class: 'empty small' }, h('p', null, 'لسّا ما سجّلت شي. اكتب أول مصروف بالخانة فوق، أو اضغط زر + تحت.')));
  }
  return group('آخر العمليات', recent.map((t) => txRow(t, st, { showDate: true })), {
    action: h('button', { class: 'link-btn', type: 'button', onclick: () => open('activity') }, 'السجل', icon('chevL', 16)),
  });
}

// للاستعمال من أماكن تانية (الملخّص)
export { netWorth };
