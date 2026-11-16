// قطع مشتركة بين الصفحات
import { h, icon, toast, haptic } from './ui.js';
import { badge } from './icons.js';
import { fmt } from './money.js';
import { dayLabel, currentMonth, todayISO, daysText } from './dates.js';
import { store, catLabel, catIcon, catTint } from './store.js';
import { openTxForm, switchRow } from './forms.js';
import { isCashAware, cashMonth, dailyAllowance } from './calc.js';
import { openDebtForm, debtTxTitle } from './debts.js';

export function group(title, children, { action = null, cls = '' } = {}) {
  return h('section', { class: `group ${cls}`.trim() },
    title ? h('div', { class: 'group-head' }, h('h2', null, title), action) : null,
    h('div', { class: 'rows' }, children));
}

export function statRow(label, value, sub, cls = '') {
  return h('div', { class: 'row' },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, label),
      sub ? h('span', { class: 'row-sub' }, sub) : null),
    h('span', { class: 'row-end' }, h('span', { class: `amount ${cls}`.trim() }, value)));
}

export function bar(ratio, state = '') {
  return h('span', { class: `bar ${state}`.trim(), 'aria-hidden': 'true' },
    h('i', { style: { width: `${Math.max(0, Math.min(100, ratio * 100))}%` } }));
}

// صف قابل للضغط مع سهم
export function navRow({ iconName, tint, title, sub, end, onclick }) {
  return h('button', { class: 'row', type: 'button', onclick },
    iconName ? badge(iconName, tint, 40) : null,
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, title),
      sub ? h('span', { class: 'row-sub wrap' }, sub) : null),
    end ? h('span', { class: 'row-end' }, end) : null,
    h('span', { class: 'chev' }, icon('chevL', 18)));
}

/* ---------- مصاري الشهر الفعلية ---------- */
function cashLine(label, value, { sub, cls = '', valueCls = '', end } = {}) {
  return h('div', { class: `row ${cls}`.trim() },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, label), sub ? h('span', { class: 'row-sub wrap' }, sub) : null),
    end || null,
    h('span', { class: 'row-end' }, h('span', { class: `amount ${valueCls}`.trim() }, value)));
}

export function cashCard(st, key, { compact = false } = {}) {
  if (key !== currentMonth()) return null;
  const on = isCashAware(st);
  const toggle = switchRow('احسب على المصاري اللي معي فعلاً', 'مصروف اليوم ما بيطلع أكتر من اللي معك بالمحافظ والجاي هالشهر. مفيد إذا بلّشت بنص الشهر أو الراتب تأخر.',
    on, (v) => store.update((s) => { s.settings.cashAware = v; }));
  if (!on) return compact ? null : group('طريقة الحساب', [toggle]);
  const today = todayISO();
  const c = cashMonth(st, today);
  const a = dailyAllowance(st, today);
  if (compact && !a.cashLimited) return null;
  const set = (fn, msg) => { const before = JSON.stringify(st.settings); store.update(fn); haptic('select'); toast(msg, { action: 'تراجع', onAction: () => store.update((s) => { s.settings = JSON.parse(before); }) }); };
  const rows = [
    cashLine('معك هلّق بالمحافظ', fmt(c.spendable), { sub: c.savingsHeld > 0.5 ? `وبمحافظ الادخار ${fmt(c.savingsHeld)} (ما بتنحسب)` : null }),
    c.incomeComing > 0.5 ? cashLine('دخل لسّا جاي هالشهر', fmt(c.incomeComing, 'USD', { sign: true }), {
      valueCls: 'income',
      end: h('button', { class: 'btn secondary small', type: 'button', onclick: () => set((s) => { s.settings.settledMonths = { ...(s.settings.settledMonths || {}), [key]: true }; }, 'اعتبرنا دخل هالشهر وصل كله') }, 'وصل كله'),
    }) : null,
    c.debtIn > 0.5 ? cashLine('ديون راجعة إلك', fmt(c.debtIn, 'USD', { sign: true }), { valueCls: 'income' }) : null,
    c.bills > 0.5 ? cashLine('فواتير ثابتة باقية', fmt(-c.bills)) : null,
    c.commits + c.debtOut > 0.5 ? cashLine('التزامات وديون هالشهر', fmt(-(c.commits + c.debtOut))) : null,
    c.savingsLeft > 0.5 ? cashLine('ادخار هالشهر', fmt(-c.savingsLeft), {
      end: h('button', { class: 'btn secondary small', type: 'button', onclick: () => set((s) => { s.settings.monthSavings = { ...(s.settings.monthSavings || {}), [key]: 0 }; }, 'هالشهر بلا ادخار') }, 'بلا ادخار هالشهر'),
    }) : null,
    cashLine(c.pool >= 0 ? 'بيكفيك لآخر الشهر' : 'ناقصك لآخر الشهر', fmt(Math.abs(c.pool)), { cls: 'total', valueCls: c.pool < 0 ? 'over' : '' }),
  ];
  const extra = Math.max(0, c.pool - Math.max(0, a.perDay * a.daysLeft - a.todaySpent));
  rows.push(h('p', { class: `row-note ${a.cashLimited ? 'warn-note' : ''}`.trim() }, a.cashLimited
    ? `مصروف اليوم انحسب على المصاري اللي معك: ${fmt(a.perDay)} باليوم لـ ${daysText(a.daysLeft)}، لأنها أقل من الميزانية (${fmt(a.budgetPerDay)}).`
    : `المصاري اللي معك بتكفي ميزانية باقي الشهر، وبيبقى ${fmt(extra)} للمشتريات أو الادخار.`));
  if (c.missing.length) rows.push(h('p', { class: 'row-note bad' }, 'في محفظة ما إلها سعر صرف، فما انحسبت.'));
  if (!compact) rows.push(toggle);
  return group('مصاري الشهر الفعلية', rows);
}

export function emptyState(iconName, text, action) {
  return h('div', { class: 'empty' }, badge(iconName, 'mint', 56), h('p', null, text), action || null);
}

export function txRow(t, st, { showDate = false } = {}) {
  const acc = st.accounts.find((a) => a.id === t.accountId);
  const cur = acc?.currency || 'USD';
  let iconName = 'tag';
  let tint = 'slate';
  let title;
  let sub;
  let amount;
  let sub2 = null;
  let cls = '';
  let onclick = () => openTxForm({ tx: t });

  if (t.type === 'debt') {
    const debt = st.debts.find((x) => x.id === t.debtId);
    iconName = 'exchange';
    tint = 'violet';
    title = debtTxTitle(t, debt);
    sub = t.initial ? acc?.name || '' : `دفعة، ${acc?.name || ''}`;
    amount = fmt(t.flow === 'in' ? t.amount : -t.amount, cur, { sign: true });
    cls = t.flow === 'in' ? 'income' : '';
    onclick = () => { if (debt) openDebtForm(debt); };
  } else if (t.type === 'transfer') {
    const to = st.accounts.find((a) => a.id === t.toAccountId);
    const exchange = to && to.currency !== cur;
    iconName = 'swap';
    tint = 'teal';
    title = exchange ? 'تصريف' : 'تحويل';
    sub = `${acc?.name ?? '؟'} ← ${to?.name ?? '؟'}`;
    amount = fmt(t.amount, cur);
    if (exchange) sub2 = fmt(t.toAmount, to.currency);
  } else {
    const c = st.categories.find((x) => x.id === t.categoryId);
    iconName = catIcon(c);
    tint = catTint(c);
    title = catLabel(c);
    // ملاحظة الفئة الخاصة كمان بتنخفى
    sub = c?.private ? acc?.name || '' : t.note || acc?.name || '';
    amount = fmt(t.type === 'expense' ? -t.amount : t.amount, cur, { sign: true });
    cls = t.type === 'income' ? 'income' : '';
    if (cur !== 'USD' && Number.isFinite(t.usd)) sub2 = `≈ ${fmt(t.usd, 'USD')}`;
  }
  if (showDate) sub = sub ? `${dayLabel(t.date)}، ${sub}` : dayLabel(t.date);

  return h('button', { class: 'row', type: 'button', onclick },
    badge(iconName, tint, 40),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, title),
      sub ? h('span', { class: 'row-sub' }, sub) : null),
    h('span', { class: 'row-end' },
      h('span', { class: `amount ${cls}`.trim() }, amount),
      sub2 ? h('span', { class: 'row-sub' }, sub2) : null));
}
