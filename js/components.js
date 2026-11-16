// قطع مشتركة بين الصفحات
import { h } from './ui.js';
import { fmt } from './money.js';
import { dayLabel } from './dates.js';
import { openTxForm } from './forms.js';
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

export function txRow(t, st, { showDate = false } = {}) {
  const acc = st.accounts.find((a) => a.id === t.accountId);
  const cur = acc?.currency || 'USD';
  let iconText;
  let title;
  let sub;
  let amount;
  let sub2 = null;
  let cls = '';
  let onclick = () => openTxForm({ tx: t });

  if (t.type === 'debt') {
    const debt = st.debts.find((x) => x.id === t.debtId);
    iconText = '🤝';
    title = debtTxTitle(t, debt);
    sub = t.initial ? acc?.name || '' : `دفعة، ${acc?.name || ''}`;
    amount = fmt(t.flow === 'in' ? t.amount : -t.amount, cur, { sign: true });
    cls = t.flow === 'in' ? 'income' : '';
    onclick = () => { if (debt) openDebtForm(debt); };
  } else if (t.type === 'transfer') {
    const to = st.accounts.find((a) => a.id === t.toAccountId);
    const exchange = to && to.currency !== cur;
    iconText = '⇄';
    title = exchange ? 'تصريف' : 'تحويل';
    sub = `${acc?.name ?? '؟'} ← ${to?.name ?? '؟'}`;
    amount = fmt(t.amount, cur);
    if (exchange) sub2 = fmt(t.toAmount, to.currency);
  } else {
    const c = st.categories.find((x) => x.id === t.categoryId);
    iconText = c?.icon || '•';
    title = c?.name || 'بدون فئة';
    sub = t.note || acc?.name || '';
    amount = fmt(t.type === 'expense' ? -t.amount : t.amount, cur, { sign: true });
    cls = t.type === 'income' ? 'income' : '';
    if (cur !== 'USD' && Number.isFinite(t.usd)) sub2 = `≈ ${fmt(t.usd, 'USD')}`;
  }
  if (showDate) sub = sub ? `${dayLabel(t.date)}، ${sub}` : dayLabel(t.date);

  return h('button', { class: 'row', type: 'button', onclick },
    h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, iconText),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, title),
      sub ? h('span', { class: 'row-sub' }, sub) : null),
    h('span', { class: 'row-end' },
      h('span', { class: `amount ${cls}`.trim() }, amount),
      sub2 ? h('span', { class: 'row-sub' }, sub2) : null));
}
