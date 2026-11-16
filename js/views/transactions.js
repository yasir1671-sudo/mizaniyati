// العمليات: كل شهر لحاله، مجمّعة حسب اليوم
import { h, icon, segmented } from '../ui.js';
import { store } from '../store.js';
import { fmt } from '../money.js';
import { currentMonth, addMonths, monthLabel, dayLabel } from '../dates.js';
import { monthTx, monthStats, sortTx } from '../calc.js';
import { txRow } from '../components.js';
import { openTxForm } from '../forms.js';
import { renderReports } from './reports.js';

let month = null;
let filter = 'all';
let mode = 'list';
const MODES = [{ value: 'list', label: 'القائمة' }, { value: 'reports', label: 'التقارير' }];
const FILTERS = [
  { value: 'all', label: 'الكل' },
  { value: 'expense', label: 'مصاريف' },
  { value: 'income', label: 'دخل' },
  { value: 'transfer', label: 'تحويلات' },
];

export function renderTransactions({ go }) {
  const st = store.state;
  month ||= currentMonth();
  const ms = monthStats(st, month);
  const net = ms.income - ms.expense;
  const list = sortTx(monthTx(st, month).filter((t) => filter === 'all' || t.type === filter));
  const rerender = () => go('tx');

  const head = [
    h('header', { class: 'page-head' },
      h('h1', null, 'العمليات'),
      h('button', { class: 'btn small', type: 'button', onclick: () => openTxForm() }, icon('plus', 18), 'عملية')),
    h('div', { class: 'section-tabs' }, segmented(MODES, mode, (v) => { mode = v; rerender(); }, 'عرض العمليات')),
    h('div', { class: 'month-nav' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'الشهر السابق', onclick: () => { month = addMonths(month, -1); rerender(); } }, icon('chevR')),
      h('strong', null, monthLabel(month)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'الشهر التالي', onclick: () => { month = addMonths(month, 1); rerender(); } }, icon('chevL'))),
  ];
  if (mode === 'reports') return h('div', { class: 'page' }, head, renderReports(month));

  const page = h('div', { class: 'page' },
    head,
    h('section', { class: 'group strip' },
      h('div', null, h('span', null, 'الدخل'), h('strong', { class: 'amount income' }, fmt(ms.income))),
      h('div', null, h('span', null, 'المصروف'), h('strong', { class: 'amount' }, fmt(ms.expense))),
      h('div', null, h('span', null, 'الصافي'), h('strong', { class: `amount ${net < 0 ? 'over' : 'income'}` }, fmt(net, 'USD', { sign: true })))),
    h('div', { class: 'filter-wrap' }, segmented(FILTERS, filter, (v) => { filter = v; rerender(); }, 'نوع العمليات')));

  if (!list.length) {
    page.append(h('div', { class: 'empty' },
      h('p', null, filter === 'all' ? `ما في عمليات بـ ${monthLabel(month)}.` : 'ما في عمليات من هالنوع بهالشهر.'),
      h('button', { class: 'btn', type: 'button', onclick: () => openTxForm() }, 'سجّل عملية')));
    return page;
  }

  const byDay = new Map();
  for (const t of list) {
    if (!byDay.has(t.date)) byDay.set(t.date, []);
    byDay.get(t.date).push(t);
  }
  for (const [date, items] of byDay) {
    const dayExpense = items.filter((t) => t.type === 'expense').reduce((sum, t) => sum + (Number(t.usd) || 0), 0);
    page.append(h('section', { class: 'group' },
      h('div', { class: 'group-head' },
        h('h2', null, dayLabel(date)),
        dayExpense > 0 ? h('span', { class: 'muted amount' }, fmt(-dayExpense)) : null),
      h('div', { class: 'rows' }, items.map((t) => txRow(t, st)))));
  }
  return page;
}
