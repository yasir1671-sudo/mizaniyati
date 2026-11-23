// خريطة الشهر: كل يوم شو فيه (دخل، فاتورة، شراء مثبّت)، وقدّيش بيبقى معك يوم بيوم
import { h, icon, fill, haptic, openSheet } from '../ui.js';
import { openAddSheet } from '../keypad.js';
import { badge } from '../icons.js';
import { store, catLabel, catIcon, catTint } from '../store.js';
import { fmt } from '../money.js';
import { todayISO, monthLabel, longDate, daysText, MONTHS, addMonths, countText } from '../dates.js';
import { group, txRow, bar } from '../components.js';
import { monthMap, restOfMonth } from '../month.js';
import { openWhatIf } from '../whatif.js';
import { openItemForm } from '../forms.js';
import { openRecurringForm } from './bills.js';
import { monthBudgetBanner } from '../monthsheet.js';

const WEEK = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];
const EVENT = {
  income: { icon: 'arrowUp', tint: 'mint', label: 'دخل جاي' },
  bill: { icon: 'receipt', tint: 'teal', label: 'فاتورة' },
  billPaid: { icon: 'check', tint: 'slate', label: 'اندفع' },
  billBudget: { icon: 'receipt', tint: 'teal', label: 'باقي فواتير' },
  buy: { icon: 'pin', tint: 'violet', label: 'شراء مثبّت' },
  commit: { icon: 'pin', tint: 'coral', label: 'التزام' },
  debtIn: { icon: 'arrowUp', tint: 'blue', label: 'دين راجع إلك' },
  debtOut: { icon: 'arrowDown', tint: 'coral', label: 'دين عليك' },
  save: { icon: 'coins', tint: 'gold', label: 'ادخار' },
};

export const calendarActions = () => h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'شو لو؟', onclick: () => openWhatIf() }, icon('bulb', 20));

let selected = null;

function eventRow(e, open) {
  const k = EVENT[e.kind] || EVENT.bill;
  const tint = e.kind === 'bill' || e.kind === 'billBudget' ? (e.cat ? catTint(e.cat) : k.tint) : k.tint;
  const ic = e.it?.icon || (e.rec?.icon) || k.icon;
  let sub = k.label;
  if (e.late) sub = e.kind === 'income' ? 'كان متوقع قبل، لسّا ما وصل' : 'فات موعده، لسّا ما اندفع';
  if (e.kind === 'billPaid') sub = e.prepaid ? 'مدفوع من قبل' : 'اندفع هالشهر';
  let onclick = null;
  if (e.it) onclick = () => openItemForm(e.it);
  else if (e.rec) onclick = () => openRecurringForm(e.rec);
  else if (e.debt) onclick = () => open('money/debts');
  else if (e.kind === 'income') onclick = () => open('plan/month');
  const sign = e.sign > 0 ? 1 : e.sign < 0 ? -1 : 0;
  const body = [
    badge(ic, e.kind === 'billPaid' ? 'slate' : tint, 36),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, e.name), h('span', { class: `row-sub ${e.late ? 'warn' : ''}`.trim() }, sub)),
    h('span', { class: 'row-end' }, h('span', { class: `amount ${sign > 0 ? 'income' : ''} ${sign === 0 ? 'muted' : ''}`.trim() }, sign ? fmt(sign * e.usd, 'USD', { sign: true }) : fmt(e.usd))),
  ];
  return onclick ? h('button', { class: 'row', type: 'button', onclick }, body) : h('div', { class: 'row' }, body);
}

export function renderMonthMap({ open }) {
  const st = store.state;
  const today = todayISO();
  const M = monthMap(st, today);
  const c = M.cash;
  const monthName = MONTHS[Number(M.key.slice(5)) - 1];
  if (selected && !selected.startsWith(M.key)) selected = null;

  const out = [monthBudgetBanner(st)];

  // ملخص: معك، جاي، محجوز
  const reserved = c.bills + c.commits + c.debtOut + c.savingsLeft;
  out.push(h('section', { class: 'group strip' },
    h('div', null, h('span', null, 'معك هلّق'), h('strong', null, fmt(c.spendable))),
    h('div', null, h('span', null, 'جاي هالشهر'), h('strong', { class: 'income' }, fmt(c.coming))),
    h('div', null, h('span', null, 'محجوز'), h('strong', null, fmt(reserved)))));
  out.push(h('div', { class: 'duo' },
    h('div', null, h('small', null, 'مصروف اليوم'), h('b', null, fmt(M.a.perDay)), h('span', null, `لـ ${daysText(M.a.daysLeft)}${M.a.cashLimited ? '، على المصاري اللي معك' : ''}`)),
    h('div', null, h('small', null, 'بآخر الشهر بيبقى'), h('b', { class: M.endBal < -0.5 ? 'over' : '' }, fmt(Math.max(0, M.endBal))), h('span', null, M.endBal < -0.5 ? `ناقصك ${fmt(-M.endBal)}` : 'بعد كل شي محجوز'))));

  if (M.runOut) {
    const ni = M.nextIncome;
    out.push(h('div', { class: 'banner warn-banner' }, h('span', { class: 'banner-ic' }, icon('alert', 22)),
      h('p', null, `يوم ${M.runOut} ${monthName} ممكن تخلص المصاري اللي بإيدك${ni ? `، قبل ما يوصل «${ni.e.name}» يوم ${ni.day}` : ''}. خفّف شوي هالأيام، أو أجّل شي محجوز.`)));
  } else if (M.a.perDay > 0) {
    out.push(h('p', { class: 'section-note' }, 'المصاري بتكفيك يوم بيوم لآخر الشهر، إذا ضليت على مصروف اليوم.'));
  }

  // التقويم: كبسة على يوم بتفتح تفاصيله بنافذة
  const gridEl = h('div', { class: 'mm-grid' });
  const [y, m] = M.key.split('-').map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 1) % 7;
  const drawGrid = () => {
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(h('span'));
    for (const dd of M.days) {
      const kinds = [...new Set(dd.events.map((e) => e.kind))].slice(0, 3);
      const neg = !dd.past && dd.bal != null && dd.bal < -0.5;
      cells.push(h('button', {
        type: 'button', class: `mm-day${dd.past ? ' past' : ''}${dd.isToday ? ' today' : ''}${dd.date === selected ? ' on' : ''}${neg ? ' neg' : ''}`,
        'aria-label': `${dd.day} ${monthName}`, 'aria-pressed': String(dd.date === selected),
        onclick: () => { haptic('select'); selected = dd.date; drawGrid(); openDaySheet(dd); },
      },
      h('b', null, String(dd.day)),
      dd.past || dd.isToday
        ? (dd.spent > 0.5 ? h('small', null, Math.round(dd.spent)) : h('small', { class: 'nil' }, '·'))
        : h('small', { class: 'nil' }, ''),
      kinds.length ? h('span', { class: 'mm-dots' }, kinds.map((k) => h('i', { class: `k-${k}` }))) : null));
    }
    fill(gridEl, cells);
  };
  function openDaySheet(dd) {
    openSheet(dd.isToday ? `اليوم، ${longDate(dd.date)}` : longDate(dd.date), (body, close) => {
      const rows = [];
      if (dd.past || dd.isToday) {
        for (const t of dd.tx) rows.push(txRow(t, st));
        if (!dd.tx.length) rows.push(h('p', { class: 'row-note' }, dd.isToday ? 'لسّا ما سجّلت شي اليوم.' : 'ما سجّلت شي بهاليوم.'));
      }
      for (const e of dd.events) rows.push(eventRow(e, (p) => { close(); setTimeout(() => open(p), 300); }));
      const tiles = [];
      if (!dd.past) {
        tiles.push(h('div', { class: 'ba-tile' }, h('small', null, dd.isToday ? 'باقي لك تصرف اليوم' : 'مصروف هاليوم'), h('b', null, fmt(dd.allow)), h('span', null, 'على مصروف اليوم')));
        tiles.push(h('div', { class: `ba-tile ${dd.bal < -0.5 ? 'bad' : ''}`.trim() }, h('small', null, 'بآخر اليوم بيبقى معك'), h('b', null, fmt(dd.bal)), h('span', null, 'تقريباً، بعد المحجوز')));
      } else {
        const n = dd.tx.filter((t) => t.type === 'expense').length;
        tiles.push(h('div', { class: 'ba-tile' }, h('small', null, 'صرفت'), h('b', null, fmt(dd.spent)), h('span', null, n ? countText(n, ['مصروف واحد', 'مصروفين', 'مصاريف', 'مصروف']) : 'ولا مصروف')));
        if (dd.income > 0.5) tiles.push(h('div', { class: 'ba-tile' }, h('small', null, 'دخل'), h('b', { class: 'income' }, fmt(dd.income)), h('span', null, '')));
      }
      fill(body, [
        h('div', { class: `ba-grid${tiles.length === 1 ? ' one' : ''}` }, tiles),
        rows.length ? h('div', { class: 'rows sheet-rows', style: { marginTop: '12px' } }, rows) : null,
        dd.past || dd.isToday ? h('button', { class: 'btn secondary block', type: 'button', onclick: () => { close(); setTimeout(() => openAddSheet({ date: dd.date }), 300); } }, icon('plus', 18), 'سجّل مصروف بهاليوم') : null,
      ]);
    }, { onClose: () => { selected = null; drawGrid(); } });
  }
  drawGrid();
  out.push(h('section', { class: 'group mm-wrap' },
    h('div', { class: 'group-head' }, h('h2', null, monthLabel(M.key)), h('span', { class: 'muted', style: { fontSize: '11.5px' } }, 'اضغط على أي يوم')),
    h('div', { class: 'mm-legend', 'aria-hidden': 'true' },
      [['income', 'دخل'], ['bill', 'فاتورة'], ['buy', 'شراء مثبّت'], ['commit', 'التزام']].map(([k, label]) => h('span', null, h('i', { class: `k-${k}` }), label))),
    h('div', { class: 'mm-grid mm-week', 'aria-hidden': 'true' }, WEEK.map((w) => h('span', null, w))),
    gridEl,
    h('p', { class: 'mm-foot' }, 'الرقم تحت اليوم: قدّيش صرفت فيه. النقط: شو جاي.')));

  // الجاي هالشهر بالترتيب
  const agenda = [];
  for (const dd of M.days) {
    if (dd.past || dd.isToday) continue;
    const ev = dd.events.filter((e) => e.kind !== 'billPaid');
    if (!ev.length) continue;
    agenda.push(h('div', { class: 'agenda-day' }, h('span', null, longDate(dd.date)), h('span', { class: dd.bal < -0.5 ? 'bad' : '' }, `بيبقى ${fmt(dd.bal)}`)));
    for (const e of ev) agenda.push(eventRow(e, open));
  }
  if (agenda.length) out.push(group('الجاي هالشهر', agenda.slice(0, 16)));
  if (M.undated.length) {
    out.push(group('هالشهر، بلا يوم محدد', [
      ...M.undated.map((e) => eventRow(e, open)),
      h('p', { class: 'row-note' }, 'اللي عليك منهن انحسب من اليوم (احتياط)، والديون الراجعة بآخر الشهر.'),
    ]));
  }

  // الأساسيات محجوزة أول
  const R = restOfMonth(st, today);
  if (R.ess.length) {
    const rows = R.ess.filter((x) => x.need >= 0.5).map((x) => h('div', { class: 'row' },
      badge(catIcon(x.c), catTint(x.c), 36),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, catLabel(x.c)), bar(x.need > 0 ? x.alloc / x.need : 1, x.alloc < x.need - 0.5 ? 'warn' : '')),
      h('span', { class: 'row-end' }, h('span', { class: 'amount' }, fmt(x.alloc)), x.alloc < x.need - 0.5 ? h('span', { class: 'row-sub warn' }, `من ${fmt(x.need)}`) : null)));
    rows.push(h('p', { class: `row-note ${R.essShort ? 'bad' : ''}`.trim() }, R.essShort
      ? 'المصاري ما بتكفي الأساسيات كاملة لآخر الشهر.'
      : `الأساسيات محجوزة لـ ${daysText(R.daysLeft)}. الثانويات إلها ${fmt(R.discAlloc)}${R.discAlloc < R.discNeed - 0.5 ? ` من ${fmt(R.discNeed)}` : ''}.`));
    out.push(group('محجوز للأساسيات لآخر الشهر', rows));
  }

  // أول الشهر الجاي
  const nx = M.next;
  if (nx.firstIncomeDay) {
    const buffer = Number(st.settings.buffer) || 0;
    const nextName = MONTHS[Number(addMonths(M.key, 1).slice(5)) - 1];
    out.push(h('div', { class: 'banner' }, h('span', { class: 'banner-ic' }, icon('flag', 22)),
      h('p', null, nx.bridgeDays > 0
        ? `أول دخل بالشهر الجاي بيوصل ${nx.firstIncomeDay} ${nextName}، فخلّي معك تقريباً ${fmt(nx.need)} لأول ${daysText(nx.bridgeDays)}. (المحدد بالأهداف ${fmt(buffer)})`
        : `دخلك بيوصل أول يوم بـ ${nextName}، فما بدك تخلّي شي كبير لأول الشهر.`)));
  }
  return out;
}
