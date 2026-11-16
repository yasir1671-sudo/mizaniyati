// السجل: عمليات كل شهر، مع بحث وفلترة
import { h, icon, fill, segmented } from '../ui.js';
import { store, catLabel } from '../store.js';
import { fmt } from '../money.js';
import { currentMonth, addMonths, monthLabel, dayLabel } from '../dates.js';
import { monthTx, monthStats, sortTx } from '../calc.js';
import { txRow, emptyState } from '../components.js';
import { openAddSheet } from '../keypad.js';
import { normalizeAr } from '../parse.js';

let month = null;
let filter = 'all';
let query = '';
const FILTERS = [
  { value: 'all', label: 'الكل' },
  { value: 'expense', label: 'مصاريف' },
  { value: 'income', label: 'دخل' },
  { value: 'transfer', label: 'تحويلات' },
];

export function renderActivity({ go, open }) {
  const st = store.state;
  month ||= currentMonth();
  const ms = monthStats(st, month);
  const net = ms.income - ms.expense;
  const rerender = () => go('activity');
  const listEl = h('div');
  const drawList = () => fill(listEl, listContent(st));
  const search = h('input', {
    type: 'search', placeholder: 'دوّر بملاحظة أو فئة', value: query, 'aria-label': 'بحث بالعمليات',
    oninput: (e) => { query = e.target.value; drawList(); },
  });
  drawList();
  return [
    h('header', { class: 'page-head' },
      h('h1', null, 'السجل'),
      h('div', { class: 'head-actions' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'تحليل المصاريف', onclick: () => open('activity/reports') }, icon('chart', 20)))),
    h('div', { class: 'search' }, icon('search', 18), search),
    h('div', { class: 'month-nav' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'الشهر السابق', onclick: () => { month = addMonths(month, -1); rerender(); } }, icon('chevR')),
      h('strong', null, monthLabel(month)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'الشهر التالي', onclick: () => { month = addMonths(month, 1); rerender(); } }, icon('chevL'))),
    h('section', { class: 'group strip' },
      h('div', null, h('span', null, 'الدخل'), h('strong', { class: 'amount income' }, fmt(ms.income))),
      h('div', null, h('span', null, 'المصروف'), h('strong', { class: 'amount' }, fmt(ms.expense))),
      h('div', null, h('span', null, 'الصافي'), h('strong', { class: `amount ${net < 0 ? 'over' : 'income'}` }, fmt(net, 'USD', { sign: true })))),
    h('div', { class: 'filter-wrap' }, segmented(FILTERS, filter, (v) => { filter = v; rerender(); }, 'نوع العمليات')),
    listEl,
  ];
}

function matches(t, st, q) {
  if (!q) return true;
  const c = st.categories.find((x) => x.id === t.categoryId);
  const acc = st.accounts.find((x) => x.id === t.accountId);
  const debt = t.debtId ? st.debts.find((x) => x.id === t.debtId) : null;
  const hay = normalizeAr([c?.private ? '' : t.note, catLabel(c), acc?.name, debt?.person, String(t.amount)].filter(Boolean).join(' '));
  return hay.includes(q);
}

function listContent(st) {
  const q = normalizeAr(query.trim());
  const list = sortTx(monthTx(st, month).filter((t) => {
    if (filter === 'transfer') { if (t.type !== 'transfer' && t.type !== 'debt') return false; }
    else if (filter !== 'all' && t.type !== filter) return false;
    return matches(t, st, q);
  }));
  if (!list.length) {
    if (q) return [emptyState('search', `ما لقيت شي بـ «${query.trim()}» بهالشهر.`)];
    return [emptyState('list', filter === 'all' ? `ما في عمليات بـ ${monthLabel(month)}.` : 'ما في عمليات من هالنوع بهالشهر.',
      h('button', { class: 'btn', type: 'button', onclick: () => openAddSheet() }, icon('plus', 18), 'سجّل عملية'))];
  }
  const byDay = new Map();
  for (const t of list) {
    if (!byDay.has(t.date)) byDay.set(t.date, []);
    byDay.get(t.date).push(t);
  }
  return [...byDay].map(([date, items]) => {
    const dayExpense = items.filter((t) => t.type === 'expense').reduce((sum, t) => sum + (Number(t.usd) || 0), 0);
    return h('section', { class: 'group' },
      h('div', { class: 'group-head' },
        h('h2', null, dayLabel(date)),
        dayExpense > 0 ? h('span', { class: 'muted amount' }, fmt(-dayExpense)) : null),
      h('div', { class: 'rows' }, items.map((t) => txRow(t, st))));
  });
}
