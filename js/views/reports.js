// التقارير: أرقام الشهر، المصروف حسب الفئة، وآخر 6 شهور
import { h, fill } from '../ui.js';
import { store } from '../store.js';
import { fmt } from '../money.js';
import { addMonths, currentMonth, monthLabel, MONTHS, SHORT_MONTHS, daysInMonth, todayISO, daysText } from '../dates.js';
import { monthStats, monthTx } from '../calc.js';
import { group, bar } from '../components.js';

let selected = null;
let showTable = false;

export function renderReports(month) {
  const st = store.state;
  const ms = monthStats(st, month);
  return [
    statsGroup(st, month, ms),
    categoryGroup(st, ms),
    trendGroup(st, month),
  ];
}

function line(label, value, sub, cls = '') {
  return h('div', { class: 'row' },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, label),
      sub ? h('span', { class: 'row-sub wrap' }, sub) : null),
    h('span', { class: 'row-end' }, h('span', { class: `amount ${cls}`.trim() }, value)));
}

function statsGroup(st, month, ms) {
  const prevKey = addMonths(month, -1);
  const prev = monthStats(st, prevKey);
  const cur = currentMonth();
  const [y, m] = month.split('-').map(Number);
  let days = 0;
  if (month < cur) days = daysInMonth(y, m - 1);
  else if (month === cur) days = Number(todayISO().slice(8, 10));

  let change = null;
  if (prev.expense > 0.005 && ms.expense > 0.005) {
    const pct = Math.round(((ms.expense - prev.expense) / prev.expense) * 100);
    change = pct === 0 ? `متل ${MONTHS[Number(prevKey.slice(5)) - 1]}` : `${pct > 0 ? 'أكتر' : 'أقل'} بـ ${Math.abs(pct)}% من ${MONTHS[Number(prevKey.slice(5)) - 1]}`;
  }

  const expenses = monthTx(st, month).filter((t) => t.type === 'expense');
  const biggest = expenses.reduce((best, t) => ((Number(t.usd) || 0) > (Number(best?.usd) || 0) ? t : best), null);
  const bigCat = biggest ? st.categories.find((c) => c.id === biggest.categoryId) : null;
  const net = ms.income - ms.expense;

  if (!expenses.length && ms.income < 0.005) {
    return h('div', { class: 'empty' }, h('p', null, `ما في عمليات بـ ${monthLabel(month)} مشان نعمل تقرير.`));
  }
  return group('أرقام الشهر', [
    line('المصروف', fmt(ms.expense), change),
    line('الدخل', fmt(ms.income), null, 'income'),
    line(net < 0 ? 'صرفت أكتر من دخلك بـ' : 'وفّرت من دخلك', fmt(Math.abs(net)), null, net < 0 ? 'over' : 'income'),
    days > 0 ? line('معدل الصرف باليوم', fmt(ms.expense / days), `على ${daysText(days)}`) : null,
    biggest ? line('أكبر مصروف', fmt(biggest.usd), [bigCat?.name, biggest.note].filter(Boolean).join('، ')) : null,
  ]);
}

function categoryGroup(st, ms) {
  const entries = [...ms.byCat.entries()].filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  const max = entries[0][1];
  const total = ms.expense || 1;
  return group('وين راحت المصاري', entries.map(([id, v]) => {
    const c = st.categories.find((x) => x.id === id);
    const share = Math.round((v / total) * 100);
    const budget = c?.budget || 0;
    let sub = `${share}% من المصروف`;
    if (budget) sub += `، من ميزانية ${fmt(budget)}`;
    return h('div', { class: 'row' },
      h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, c?.icon || '•'),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, c?.name || 'بدون فئة'),
        bar(v / max),
        h('span', { class: 'row-sub' }, sub)),
      h('span', { class: 'row-end' }, h('span', { class: `amount ${budget && v > budget ? 'over' : ''}`.trim() }, fmt(v))));
  }));
}

/* آخر 6 شهور: عمودين لكل شهر (دخل ومصروف). بالضغط على الشهر بتطلع أرقامه. */
function trendGroup(st, month) {
  const months = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5));
  const cols = months.map((m) => {
    const s = monthStats(st, m);
    return { m, inc: s.income, exp: s.expense };
  });
  const max = Math.max(...cols.map((c) => Math.max(c.inc, c.exp)));
  if (!(max > 0.005)) return null;
  if (!months.includes(selected)) selected = month;

  const wrap = h('section', { class: 'group' });
  const draw = () => {
    const sel = cols.find((c) => c.m === selected) || cols[cols.length - 1];
    const pct = (v) => `${Math.max(v > 0.005 ? 2 : 0, (v / max) * 100)}%`;
    const plot = h('div', { class: 'trend-plot' },
      h('span', { class: 'trend-max' }, fmt(max)),
      cols.map((c) => h('button', {
        class: 'trend-col', type: 'button', 'aria-pressed': String(c.m === selected),
        'aria-label': `${monthLabel(c.m)}: الدخل ${fmt(c.inc)}، المصروف ${fmt(c.exp)}`,
        onclick: () => { selected = c.m; draw(); },
      },
      h('span', { class: 'tb tb-inc', style: { height: pct(c.inc) } }),
      h('span', { class: 'tb tb-exp', style: { height: pct(c.exp) } }))));
    const labels = h('div', { class: 'trend-labels', 'aria-hidden': 'true' },
      cols.map((c) => h('span', { class: c.m === selected ? 'on' : '' }, SHORT_MONTHS[Number(c.m.slice(5)) - 1])));
    const net = sel.inc - sel.exp;
    fill(wrap, [
      h('div', { class: 'group-head' }, h('h2', null, 'آخر 6 شهور')),
      h('div', { class: 'legend', role: 'list', 'aria-label': 'دليل الألوان' },
        h('span', { role: 'listitem' }, h('i', { class: 'tb-inc', 'aria-hidden': 'true' }), 'الدخل'),
        h('span', { role: 'listitem' }, h('i', { class: 'tb-exp', 'aria-hidden': 'true' }), 'المصروف')),
      h('div', { class: 'trend' }, plot, labels),
      h('p', { class: 'trend-caption' },
        `${monthLabel(sel.m)}: الدخل ${fmt(sel.inc)}، المصروف ${fmt(sel.exp)}، `,
        h('span', { class: net < 0 ? 'bad' : '' }, `الصافي ${fmt(net, 'USD', { sign: true })}`)),
      h('div', { class: 'row-actions' },
        h('button', { class: 'link-btn', type: 'button', 'aria-expanded': String(showTable), onclick: () => { showTable = !showTable; draw(); } },
          showTable ? 'خبّي الجدول' : 'اعرضها كجدول')),
      showTable
        ? h('div', { class: 'rows' }, cols.slice().reverse().map((c) => line(monthLabel(c.m), fmt(c.inc - c.exp, 'USD', { sign: true }),
          `دخل ${fmt(c.inc)}، مصروف ${fmt(c.exp)}`, c.inc - c.exp < 0 ? 'over' : '')))
        : null,
    ]);
  };
  draw();
  return wrap;
}
