// الرئيسية: مصروف اليوم، الإدخال السريع، ملخص الشهر
import { h, toast } from '../ui.js';
import { store, uid } from '../store.js';
import { CURRENCIES, fmt, rateOf } from '../money.js';
import { todayISO, longDate, monthLabel, daysText } from '../dates.js';
import { dailyAllowance, plan, monthStats, netWorth, sortTx } from '../calc.js';
import { parseQuick } from '../parse.js';
import { rosette } from '../rosette.js';
import { openTxForm, openRateForm } from '../forms.js';
import { group, statRow, txRow, bar } from '../components.js';
import { buildPlan } from '../planner.js';
import { setPlanSection } from './plan.js';
import { setWalletSection } from './wallets.js';
import { computeZakat, zakatDueDate } from '../zakat.js';
import { daysUntil } from '../dates.js';

let introPlayed = false;

export function renderHome({ go }) {
  const st = store.state;
  const today = todayISO();
  const key = today.slice(0, 7);
  const a = dailyAllowance(st, today);
  const p = plan(st, key);
  const ms = monthStats(st, key);
  const nw = netWorth(st);

  return h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', null, longDate(today))),
    hero(a, go),
    allowanceNote(a, go),
    quickAdd(),
    rateBanners(st),
    zakatBanner(st, go),
    backupBanner(st, go),
    group(monthLabel(key, { year: false }), [
      statRow('الدخل اللي وصل', fmt(ms.income), p.income > 0 ? `من ${fmt(p.income)} متوقع` : null, 'income'),
      statRow('المصروف', fmt(ms.expense), p.total > 0 ? `من ميزانية ${fmt(p.total)}` : null),
      statRow('الادخار المخطط', fmt(p.savings), null),
      h('button', { class: 'row', type: 'button', onclick: () => go('wallets') },
        h('span', { class: 'row-main' },
          h('span', { class: 'row-title' }, 'مجموع اللي معك'),
          nw.missing.length > 0 ? h('span', { class: 'row-sub' }, 'في عملة ما إلها سعر صرف') : null),
        h('span', { class: 'row-end' }, h('span', { class: 'amount' }, fmt(nw.usd)))),
    ]),
    upcomingGroup(st, key, go),
    categoriesGroup(st, ms),
    recentGroup(st, go));
}

function hero(a, go) {
  if (a.source === 'none') {
    return h('section', { class: 'hero', 'aria-label': 'مصروف اليوم' },
      rosette(0),
      h('div', { class: 'hero-text' },
        h('p', { class: 'hero-label' }, 'لسّا ما في خطة للشهر'),
        h('p', { class: 'hero-sub' }, 'حط دخلك وميزانيتك، وهون رح يطلع لك قدّيش فيك تصرف كل يوم.'),
        h('button', { class: 'btn small', type: 'button', onclick: () => go('plan') }, 'حدد دخلك وميزانيتك')));
  }
  const over = a.left < 0;
  const fraction = a.perDay > 0 ? Math.max(0, Math.min(1, a.left / a.perDay)) : 0;
  const value = fmt(Math.abs(a.left));
  const animate = !introPlayed;
  introPlayed = true;
  return h('section', { class: `hero${over ? ' over' : ''}`, 'aria-label': 'مصروف اليوم' },
    rosette(fraction, { animate }),
    h('div', { class: 'hero-text' },
      h('p', { class: 'hero-label' }, over ? 'تجاوزت مصروف اليوم بـ' : 'باقي لك تصرف اليوم'),
      h('p', { class: `hero-value${value.length > 9 ? ' long' : ''}` }, value),
      h('p', { class: 'hero-sub' }, `من أصل ${fmt(a.perDay)} لليوم`)));
}

function allowanceNote(a, go) {
  if (a.source === 'none') return null;
  if (a.monthLeft < 0) return h('p', { class: 'hero-note bad' }, `تجاوزت ميزانية الشهر بـ ${fmt(-a.monthLeft)}.`);
  return h('p', { class: 'hero-note' },
    `باقي من ميزانية الشهر ${fmt(a.monthLeft)} لـ ${daysText(a.daysLeft)}.`,
    a.source === 'income' ? h('button', { class: 'link-btn', type: 'button', onclick: () => go('plan') }, 'حدد ميزانية الفئات') : null);
}

function quickAdd() {
  const input = h('input', {
    type: 'text', class: 'quick-input', placeholder: 'اكتب مصروفك: 50 أكل',
    enterkeyhint: 'send', autocomplete: 'off', 'aria-label': 'إدخال سريع للمصروف',
  });
  const form = h('form', { class: 'quick', onsubmit: (e) => { e.preventDefault(); submitQuick(input); } },
    input,
    h('button', { class: 'btn violet', type: 'submit' }, 'أضف'));
  return h('section', { class: 'quick-wrap' },
    form,
    h('div', { class: 'quick-more' },
      h('button', { class: 'link-btn', type: 'button', onclick: () => openTxForm({ type: 'expense' }) }, 'مصروف بالتفصيل'),
      h('button', { class: 'link-btn', type: 'button', onclick: () => openTxForm({ type: 'income' }) }, 'تسجيل دخل'),
      h('button', { class: 'link-btn', type: 'button', onclick: () => openTxForm({ type: 'transfer' }) }, 'تحويل أو تصريف')));
}

function submitQuick(input) {
  const st = store.state;
  const r = parseQuick(input.value, st);
  if (!r.ok) {
    if (r.reason === 'empty') { input.focus(); return; }
    if (r.reason === 'no-account') { toast(`ما عندك محفظة بـ ${CURRENCIES[r.currency].name}. ضيفها من المحافظ.`); return; }
    openTxForm({ prefill: { note: r.note } });
    toast('ما لقيت مبلغ. كمّل التفاصيل هون.');
    return;
  }
  const rate = rateOf(st, r.currency);
  if (!rate) {
    openTxForm({ type: r.type, prefill: { amount: r.amount, accountId: r.accountId, categoryId: r.categoryId, note: r.note } });
    toast('حط سعر الصرف وكمّل.');
    return;
  }
  const tx = {
    id: uid('tx'), type: r.type, date: todayISO(), accountId: r.accountId, amount: r.amount,
    categoryId: r.categoryId, note: r.note, usd: r.amount / rate, createdAt: Date.now(),
  };
  store.update((s) => { s.transactions.push(tx); });
  const cat = st.categories.find((c) => c.id === tx.categoryId);
  toast(`انضاف ${fmt(tx.amount, r.currency)} على ${cat?.name ?? 'أخرى'}`, {
    action: 'تراجع',
    onAction: () => store.update((s) => { s.transactions = s.transactions.filter((t) => t.id !== tx.id); }),
  });
}

function rateBanners(st) {
  const needed = new Set(st.accounts.map((a) => a.currency));
  needed.delete('USD');
  return [...needed].filter((c) => !rateOf(st, c)).map((c) => h('div', { class: 'banner' },
    h('p', null, `حدد سعر ${CURRENCIES[c].name} مشان تنحسب مصاريفها بالدولار.`),
    h('button', { class: 'btn small', type: 'button', onclick: () => openRateForm(c) }, 'حدد السعر')));
}

function backupBanner(st, go) {
  if (st.transactions.length < 10) return null;
  const last = st.settings.lastBackupAt || 0;
  if (Date.now() - last < 14 * 24 * 3600 * 1000) return null;
  return h('div', { class: 'banner' },
    h('p', null, last ? 'صار لك أكتر من أسبوعين ما حفظت نسخة احتياطية.' : 'بياناتك على هالموبايل بس. احفظ نسخة احتياطية.'),
    h('button', { class: 'btn small', type: 'button', onclick: () => go('more') }, 'احفظ نسخة'));
}

// أقرب التزامات ومشتريات من الخطة (هالشهر والشهرين الجايين)
function upcomingGroup(st, key, go) {
  const hasItems = st.planItems.some((i) => i.status !== 'bought');
  const hasDebts = st.debts.some((d) => d.due);
  if (!hasItems && !hasDebts) return null;
  const P = buildPlan(st);
  const entries = P.rows.slice(0, 3).flatMap((r) => r.entries
    .filter((e) => e.kind !== 'bought' && e.kind !== 'debtDone')
    .map((e) => ({ ...e, month: r.month })));
  if (!entries.length) return null;
  const openItems = () => { setPlanSection('items'); go('plan'); };
  const openDebts = () => { setWalletSection('debts'); go('wallets'); };
  const when = (e, word) => (e.month === key ? `${word} هالشهر` : `${word} بـ ${monthLabel(e.month, { year: false })}`);
  return group('جاية قريباً', entries.slice(0, 4).map((e) => {
    let sub;
    if (e.kind === 'commitment') sub = e.it.month < key ? 'التزام فات موعده' : when(e, 'التزام');
    else if (e.kind === 'debtIn') sub = when(e, 'دين راجع إلك');
    else if (e.kind === 'debtOut') sub = when(e, 'دين لازم تسدّه');
    else sub = e.month === key ? 'فيك تشتريه هالشهر' : `مخطط بـ ${monthLabel(e.month, { year: false })}`;
    const isDebt = e.kind === 'debtIn' || e.kind === 'debtOut';
    return h('button', { class: 'row', type: 'button', onclick: isDebt ? openDebts : openItems },
      h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, e.it.icon || '🛍️'),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, e.it.name),
        h('span', { class: 'row-sub' }, sub)),
      h('span', { class: 'row-end' }, h('span', { class: `amount ${e.kind === 'debtIn' ? 'income' : ''}`.trim() }, fmt(e.usd, 'USD', { sign: e.kind === 'debtIn' }))));
  }), { action: hasItems ? h('button', { class: 'link-btn', type: 'button', onclick: openItems }, 'كل المشتريات') : null });
}

// تذكير الزكاة قبل الحول بشهر، أو إذا صارت مستحقة
function zakatBanner(st, go) {
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
  return h('div', { class: 'banner' },
    h('p', null, `زكاتك مستحقة ${when}: ${fmt(Z.due)}.`),
    h('button', { class: 'btn small', type: 'button', onclick: () => { setWalletSection('zakat'); go('wallets'); } }, 'التفاصيل'));
}

function categoriesGroup(st, ms) {
  const items = st.categories
    .filter((c) => c.type === 'expense' && ((c.budget || 0) > 0 || (ms.byCat.get(c.id) || 0) > 0))
    .map((c) => ({ c, spent: ms.byCat.get(c.id) || 0 }))
    .sort((x, y) => y.spent - x.spent || (y.c.budget || 0) - (x.c.budget || 0));
  if (!items.length) return null;
  return group('الفئات هالشهر', items.map(({ c, spent }) => {
    const b = c.budget || 0;
    const ratio = b ? spent / b : 0;
    const state = !b ? '' : ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : '';
    return h('div', { class: 'row' },
      h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, c.icon),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, c.name),
        b ? bar(ratio, state) : null),
      h('span', { class: 'row-end' },
        h('span', { class: `amount ${state}`.trim() }, fmt(spent)),
        b ? h('span', { class: 'row-sub' }, `من ${fmt(b)}`) : null));
  }));
}

function recentGroup(st, go) {
  const recent = sortTx(st.transactions).slice(0, 5);
  if (!recent.length) {
    return h('section', { class: 'group' },
      h('div', { class: 'empty small' }, h('p', null, 'لسّا ما سجّلت شي. اكتب أول مصروف بالخانة فوق.')));
  }
  return group('آخر العمليات', recent.map((t) => txRow(t, st, { showDate: true })), {
    action: h('button', { class: 'link-btn', type: 'button', onclick: () => go('tx') }, 'كل العمليات'),
  });
}
