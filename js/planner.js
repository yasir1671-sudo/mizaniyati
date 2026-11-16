// المخطِّط: توزيع المشتريات والالتزامات على 12 شهر حسب الفائض، والأهداف
import { toUSD } from './money.js';
import { addMonths, currentMonth, monthsBetween, monthLabel, monthsText } from './dates.js';
import { expectedIncome, budgetTotals, debtRemaining } from './calc.js';

export const HORIZON = 12;

export function itemUSD(state, it) {
  if (it.status === 'bought' && Number.isFinite(it.boughtUSD)) return it.boughtUSD;
  return toUSD(state, Number(it.amount) || 0, it.currency || 'USD');
}

// الأهم أول، بعدين الأقرب موعداً، بعدين الأقدم
function wantOrder(a, b) {
  return (a.priority || 2) - (b.priority || 2)
    || (a.month || '9999-99').localeCompare(b.month || '9999-99')
    || (a.createdAt || 0) - (b.createdAt || 0);
}

/*
 * لكل شهر: الفائض = الدخل − المعيشة (ثابت + يومي) − الادخار − الالتزامات − المشتريات.
 * الفائض بيتراكم من شهر لشهر. كل غرض بينحط بأول شهر بيكون فيه المتراكم بيكفيه،
 * بشرط ما يصير المتراكم بالسالب بأي شهر بعده (مشان ما ياكل مصاري التزام جاي).
 */
export function buildPlan(state, { extra = [] } = {}) {
  const start = currentMonth();
  const months = Array.from({ length: HORIZON }, (_, i) => addMonths(start, i));
  const index = new Map(months.map((m, i) => [m, i]));
  const { fixed, flex } = budgetTotals(state);
  const savings = Number(state.settings.savingsTarget) || 0;
  const rows = months.map((m) => ({
    month: m, income: expectedIncome(state, m).usd, debtIn: 0, debtOut: 0,
    living: fixed + flex, savings, commitments: 0, purchases: 0, entries: [],
  }));
  const items = [...(state.planItems || []), ...extra];
  const schedule = new Map();

  // الديون اللي إلها موعد: اللي إلك بتدخل بشهرها، واللي عليك بتنخصم متل الالتزام
  for (const debt of state.debts || []) {
    const rem = debtRemaining(debt);
    if (rem < 0.005 || !debt.due) continue;
    const usd = toUSD(state, rem, debt.currency);
    if (!Number.isFinite(usd)) continue;
    const i = debt.due < start ? 0 : index.get(debt.due);
    if (i == null) continue;
    const entry = { it: { name: debt.person, icon: '🤝' }, usd, debtId: debt.id };
    if (debt.direction === 'theyOwe') { rows[i].debtIn += usd; rows[i].entries.push({ ...entry, kind: 'debtIn' }); }
    else { rows[i].debtOut += usd; rows[i].entries.push({ ...entry, kind: 'debtOut' }); }
  }
  // الدفعات اللي صارت فعلاً بشهر من شهور الخطة بتنحسب بشهرها (متل الأغراض اللي انشترت)
  for (const debt of state.debts || []) {
    for (const p of debt.payments || []) {
      const i = index.get(String(p.date || '').slice(0, 7));
      if (i == null) continue;
      const usd = toUSD(state, Number(p.amount) || 0, debt.currency);
      if (!Number.isFinite(usd)) continue;
      if (debt.direction === 'theyOwe') rows[i].debtIn += usd; else rows[i].debtOut += usd;
      rows[i].entries.push({ it: { name: debt.person, icon: '🤝' }, usd, debtId: debt.id, kind: 'debtDone', inflow: debt.direction === 'theyOwe' });
    }
  }

  for (const it of items) {
    const usd = itemUSD(state, it);
    if (!Number.isFinite(usd)) { schedule.set(it.id, { status: 'norate' }); continue; }
    if (it.status === 'bought') {
      const i = index.get(it.boughtMonth);
      if (i != null) { rows[i].purchases += usd; rows[i].entries.push({ it, usd, kind: 'bought' }); }
      schedule.set(it.id, { status: 'bought', month: it.boughtMonth });
    } else if (it.kind === 'commitment') {
      const overdue = Boolean(it.month) && it.month < start;
      const i = overdue ? 0 : index.get(it.month);
      if (i == null) { schedule.set(it.id, { status: 'later', month: it.month }); continue; }
      rows[i].commitments += usd;
      rows[i].entries.push({ it, usd, kind: 'commitment' });
      schedule.set(it.id, { status: overdue ? 'overdue' : 'ok', month: months[i] });
    }
  }

  const surplus = rows.map((r) => r.income + r.debtIn - r.living - r.savings - r.commitments - r.purchases - r.debtOut);
  const startPool = Math.max(0, Number(state.settings.plannerStart) || 0);
  const alloc = new Array(HORIZON).fill(0);
  const wants = items.filter((it) => it.kind === 'want' && it.status !== 'bought' && !schedule.has(it.id)).sort(wantOrder);

  for (const w of wants) {
    const cost = itemUSD(state, w);
    const remaining = [];
    let cum = startPool;
    for (let j = 0; j < HORIZON; j++) { cum += surplus[j] - alloc[j]; remaining.push(cum); }
    const suffixMin = new Array(HORIZON);
    let min = Infinity;
    for (let j = HORIZON - 1; j >= 0; j--) { min = Math.min(min, remaining[j]); suffixMin[j] = min; }
    const k = suffixMin.findIndex((v) => v >= cost - 0.005);
    if (k === -1) { schedule.set(w.id, { status: 'beyond' }); continue; }
    alloc[k] += cost;
    rows[k].purchases += cost;
    rows[k].entries.push({ it: w, usd: cost, kind: 'want' });
    const late = Boolean(w.month) && months[k] > w.month;
    schedule.set(w.id, { status: late ? 'late' : 'ok', month: months[k], wait: k });
  }

  let balance = startPool;
  for (let j = 0; j < HORIZON; j++) {
    rows[j].free = surplus[j] - alloc[j];
    balance += rows[j].free;
    rows[j].balance = balance;
  }
  const totals = rows.reduce((t, r) => ({
    income: t.income + r.income + r.debtIn,
    living: t.living + r.living,
    savings: t.savings + r.savings,
    spend: t.spend + r.commitments + r.purchases + r.debtOut,
  }), { income: 0, living: 0, savings: 0, spend: 0 });

  return { months, rows, schedule, startPool, endBalance: balance, totals };
}

export function scheduleText(it, s) {
  if (!s) return '';
  const cur = currentMonth();
  switch (s.status) {
    case 'bought': return it.kind === 'commitment' ? `دفعته بـ ${monthLabel(s.month)}` : `اشتريته بـ ${monthLabel(s.month)}`;
    case 'norate': return 'بدها سعر صرف مشان تنحسب';
    case 'beyond': return 'ما بيلحق خلال السنة بالخطة الحالية';
    case 'later': return `لازم بـ ${monthLabel(s.month)}، بعد السنة`;
    case 'overdue': return `فات موعده (${monthLabel(it.month)})`;
    default: break;
  }
  if (it.kind === 'commitment') return s.month === cur ? 'لازم هالشهر' : `لازم بـ ${monthLabel(s.month)}`;
  const when = s.month === cur ? 'فيك تشتريه هالشهر' : `بـ ${monthLabel(s.month)}، بعد ${monthsText(s.wait)}`;
  return s.status === 'late' ? `${when}. متأخر عن موعدك` : when;
}

export function statusClass(s) {
  if (!s) return '';
  if (s.status === 'late' || s.status === 'overdue') return 'warn';
  if (s.status === 'beyond' || s.status === 'norate') return 'bad';
  return '';
}

/* ---------- الأهداف ---------- */
export function goalMonthly(goal, start = currentMonth()) {
  const remaining = Math.max(0, (Number(goal.target) || 0) - (Number(goal.saved) || 0));
  if (remaining < 0.005) return { remaining: 0, monthsLeft: 0, monthly: 0, done: true, overdue: false };
  const overdue = goal.deadline < start;
  const monthsLeft = overdue ? 1 : monthsBetween(start, goal.deadline) + 1;
  return { remaining, monthsLeft, monthly: remaining / monthsLeft, done: false, overdue };
}

export function goalsSummary(state) {
  const savings = Number(state.settings.savingsTarget) || 0;
  const list = state.goals.map((g) => ({ g, ...goalMonthly(g) }));
  const need = list.reduce((sum, x) => sum + x.monthly, 0);
  // أقصى شي فيك تدّخره بالشهر إذا ما اشتريت ولا غرض: الدخل − المعيشة − الالتزامات
  const p = buildPlan(state);
  const capacity = p.rows.reduce((sum, r) => sum + (r.income + r.debtIn - r.living - r.commitments - r.debtOut), 0) / HORIZON;
  return { savings, need, list, invest: Math.max(0, savings - need), gap: Math.max(0, need - savings), capacity };
}

export function emergencySuggestion(state) {
  const { total } = budgetTotals(state);
  return { monthly: total, three: total * 3, six: total * 6 };
}
