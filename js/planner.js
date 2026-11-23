// المخطِّط: توزيع المشتريات والالتزامات على 12 شهر حسب الفائض، والأهداف
import { toUSD } from './money.js';
import { addMonths, currentMonth, monthsBetween, monthLabel, monthsText, todayISO } from './dates.js';
import { store } from './store.js';
import { expectedIncome, budgetTotals, debtRemaining, isCashAware, cashMonth, dailyAllowance, savingsFor, itemMonth, isReserved, linkedDebtIds } from './calc.js';

export const HORIZON = 12;

export function itemUSD(state, it) {
  if (it.status === 'bought' && Number.isFinite(it.boughtUSD)) return it.boughtUSD;
  return toUSD(state, Number(it.amount) || 0, it.currency || 'USD');
}

// الأهم أول، بعدين الأقرب موعداً، بعدين الأقدم
function wantOrder(a, b) {
  return (a.priority || 2) - (b.priority || 2)
    || (a.date || itemMonth(a) || '9999-99').localeCompare(b.date || itemMonth(b) || '9999-99')
    || (a.createdAt || 0) - (b.createdAt || 0);
}

/*
 * لكل شهر: الفائض = الدخل − المعيشة (ثابت + يومي) − الادخار − الالتزامات − المشتريات.
 * الفائض بيتراكم من شهر لشهر. كل غرض بينحط بأول شهر بيكون فيه المتراكم بيكفيه،
 * بشرط ما يصير المتراكم بالسالب بأي شهر بعده (مشان ما ياكل مصاري التزام جاي).
 */
// الخطة بتنحسب مرة وحدة لكل نسخة من البيانات (كانت تنحسب كذا مرة بكل رسمة)
let memo = null;
export function buildPlan(state, { extra = [] } = {}) {
  const useMemo = !extra.length && state === store.state;
  const stamp = `${store.version}|${currentMonth()}|${todayISO()}`;
  if (useMemo && memo && memo.stamp === stamp) return memo.result;
  const result = computePlan(state, extra);
  if (useMemo) memo = { stamp, result };
  return result;
}

function computePlan(state, extra) {
  const start = currentMonth();
  const months = Array.from({ length: HORIZON }, (_, i) => addMonths(start, i));
  const index = new Map(months.map((m, i) => [m, i]));
  const rows = months.map((m) => ({
    month: m, income: expectedIncome(state, m).usd, debtIn: 0, debtOut: 0,
    living: budgetTotals(state, m).total, savings: savingsFor(state, m), commitments: 0, purchases: 0, entries: [],
  }));
  const items = [...(state.planItems || []), ...extra];
  const schedule = new Map();
  const linked = linkedDebtIds(state);

  // الديون اللي إلها موعد: اللي إلك بتدخل بشهرها، واللي عليك بتنخصم متل الالتزام
  // (الدين المربوط بهدف رايح للهدف، فما بيدخل بالفائض)
  for (const debt of state.debts || []) {
    const rem = debtRemaining(debt);
    if (rem < 0.005 || !debt.due || (debt.direction === 'theyOwe' && linked.has(debt.id))) continue;
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
    if (debt.direction === 'theyOwe' && linked.has(debt.id)) continue;
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
    } else if (isReserved(it)) {
      // الالتزام والغرض المثبّت: محجوزين بشهرهم قبل أي غرض تاني
      const m = itemMonth(it) || start;
      const overdue = m < start;
      const i = overdue ? 0 : index.get(m);
      if (i == null) { schedule.set(it.id, { status: 'later', month: m }); continue; }
      rows[i].commitments += usd;
      rows[i].entries.push({ it, usd, kind: it.kind === 'commitment' ? 'commitment' : 'confirmed' });
      schedule.set(it.id, { status: overdue ? 'overdue' : it.kind === 'commitment' ? 'ok' : 'confirmed', month: months[i] });
    }
  }

  /*
   * هالشهر على المصاري الفعلية: بدل الدخل المتوقع منحط اللي معك هلّق + الجاي،
   * ومنحجز مصروف باقي الأيام والفواتير والادخار والالتزامات. اللي بيبقى بيروح للمشتريات.
   */
  let startPool = Math.max(0, Number(state.settings.plannerStart) || 0);
  let cashMode = false;
  if (isCashAware(state)) {
    const today = todayISO();
    const c = cashMonth(state, today);
    const a = dailyAllowance(state, today);
    const flexReserve = Math.max(0, a.perDay * a.daysLeft - a.todaySpent);
    const extra0 = extra
      .filter((it) => isReserved(it) && (!itemMonth(it) || itemMonth(it) <= start))
      .reduce((s, it) => s + (Number.isFinite(itemUSD(state, it)) ? itemUSD(state, it) : 0), 0);
    Object.assign(rows[0], {
      cashMode: true, cash: c, flexReserve,
      income: c.spendable + c.incomeComing, debtIn: c.debtIn, debtOut: c.debtOut,
      living: flexReserve + c.bills, savings: c.savingsLeft, commitments: c.commits + extra0, purchases: 0,
    });
    startPool = 0;
    cashMode = true;
  }
  const surplus = rows.map((r) => r.income + r.debtIn - r.living - r.savings - r.commitments - r.purchases - r.debtOut);
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
    const late = Boolean(itemMonth(w)) && months[k] > itemMonth(w);
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

  return { months, rows, schedule, startPool, endBalance: balance, totals, cashMode };
}

// «5 كانون الأول» إذا في يوم، و«كانون الأول 2026» إذا شهر بس
export function itemWhen(it) {
  if (it.date) {
    const [y, m, d] = it.date.split('-').map(Number);
    const sameYear = y === Number(currentMonth().slice(0, 4));
    return `${d} ${monthLabel(`${y}-${String(m).padStart(2, '0')}`, { year: !sameYear })}`;
  }
  return it.month ? monthLabel(it.month) : '';
}

export function scheduleText(it, s) {
  if (!s) return '';
  const cur = currentMonth();
  const when0 = itemWhen(it);
  switch (s.status) {
    case 'bought': return it.kind === 'commitment' ? `دفعته بـ ${monthLabel(s.month)}` : `اشتريته بـ ${monthLabel(s.month)}`;
    case 'norate': return 'بدها سعر صرف مشان تنحسب';
    case 'beyond': return when0 ? `بدك ياه ${when0}، بس ما بيلحق خلال السنة بالخطة الحالية` : 'ما بيلحق خلال السنة بالخطة الحالية';
    case 'later': return `لازم ${when0}، بعد السنة`;
    case 'overdue': return it.kind === 'commitment' ? `فات موعده (${when0})، لسّا ما اندفع` : `فات موعده (${when0})، لسّا ما انشترى`;
    case 'confirmed': return `مثبّت ${when0}، مبلغه محجوز${s.month === cur ? ' من مصاري هالشهر' : ''}`;
    default: break;
  }
  if (it.kind === 'commitment') return s.month === cur ? `لازم هالشهر${it.date ? `، ${when0}` : ''}` : `لازم ${when0}`;
  // «late» يعني الخطة شايفة إن المصاري بتكفيه بعد الموعد اللي بدك ياه (مش إنه الموعد فات)
  if (s.status === 'late') return `بدك ياه ${when0}، بس مصاريك ما بتكفّيه قبل ${monthLabel(s.month)}`;
  let when;
  if (s.month === cur) when = 'فيك تشتريه هالشهر';
  else when = `بـ ${monthLabel(s.month)}، بعد ${monthsText(s.wait)}`;
  return when0 ? `${when}، وبدك ياه ${when0}` : when;
}

export function statusClass(s) {
  if (!s) return '';
  if (s.status === 'late' || s.status === 'overdue') return 'warn';
  if (s.status === 'beyond' || s.status === 'norate') return 'bad';
  if (s.status === 'confirmed') return 'good';
  return '';
}

/* ---------- الأهداف ---------- */
/*
 * الباقي للهدف = المطلوب − اللي جمعته − الديون المربوطة فيه (مضمونة، رايحة إله).
 * إذا الهدف بياخد من الفائض، الفائض المتوقع لموعده بيغطّي جزء، والباقي بس بينقسم على الشهور.
 */
export function goalMonthly(goal, start = currentMonth(), { linkedUSD = 0, surplusUSD = 0 } = {}) {
  const remainingRaw = Math.max(0, (Number(goal.target) || 0) - (Number(goal.saved) || 0));
  const remaining = Math.max(0, remainingRaw - linkedUSD);
  const base = { remainingRaw, linkedUSD: Math.min(linkedUSD, remainingRaw), surplusUse: 0, monthlyPlain: 0 };
  if (remaining < 0.005) return { ...base, remaining: 0, monthsLeft: 0, monthly: 0, done: remainingRaw < 0.005, covered: remainingRaw >= 0.005, overdue: false };
  const overdue = goal.deadline < start;
  const monthsLeft = overdue ? 1 : monthsBetween(start, goal.deadline) + 1;
  const surplusUse = Math.min(remaining, Math.max(0, surplusUSD));
  const left = remaining - surplusUse;
  return {
    ...base, remaining, monthsLeft, surplusUse, monthlyPlain: remaining / monthsLeft,
    monthly: left / monthsLeft, done: false, covered: left < 0.5, overdue,
  };
}

// الديون اللي إلك والمربوطة بالهدف (الباقي منها بالدولار)
export function goalLinked(state, g) {
  const list = [];
  let usd = 0;
  for (const id of g.linkedDebtIds || []) {
    const debt = state.debts.find((x) => x.id === id && x.direction === 'theyOwe');
    if (!debt) continue;
    const u = toUSD(state, debtRemaining(debt), debt.currency);
    if (!Number.isFinite(u) || u < 0.005) continue;
    usd += u;
    list.push({ debt, usd: u });
  }
  return { usd, list };
}

/*
 * الفائض اللي فيك تسحبه بآخر كل شهر بلا ما تمس مشتريات جاية = أقل رصيد خطة من هالشهر لآخر السنة.
 * بعد السنة منكمّل بمعدل الفائض الشهري.
 */
export function surplusCurve(state) {
  const P = buildPlan(state);
  const n = P.rows.length;
  const avail = new Array(n);
  let min = Infinity;
  for (let j = n - 1; j >= 0; j--) { min = Math.min(min, P.rows[j].balance); avail[j] = min; }
  // معدل الفائض بعد السنة: الوسيط (مشان دين راجع مرة وحدة أو غرض كبير ما يخربطوا التقدير)
  const frees = P.rows.slice(1).map((r) => r.free + r.purchases + r.commitments - r.debtIn + r.debtOut).sort((a, b) => a - b);
  const avgFree = frees.length ? frees[Math.floor(frees.length / 2)] : 0;
  return { P, avail, avgFree, start: P.months[0] };
}
export function surplusAt(curve, monthKey, buffer = 0) {
  const i = monthsBetween(curve.start, monthKey);
  const n = curve.avail.length;
  let v;
  if (i < 0) v = curve.avail[0];
  else if (i < n) v = curve.avail[i];
  else v = curve.avail[n - 1] + Math.max(0, curve.avgFree) * (i - n + 1);
  return Math.max(0, v - buffer);
}

export function goalsSummary(state) {
  const savings = Number(state.settings.savingsTarget) || 0;
  const buffer = Math.max(0, Number(state.settings.buffer) || 0);
  const curve = surplusCurve(state);
  const start = currentMonth();
  // الفائض بيتوزّع على الأهداف حسب الأقرب موعداً
  let used = 0;
  const sorted = [...state.goals].sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const list = sorted.map((g) => {
    const linked = goalLinked(state, g);
    const surplus = g.useSurplus ? Math.max(0, surplusAt(curve, g.deadline, buffer) - used) : 0;
    const x = goalMonthly(g, start, { linkedUSD: linked.usd, surplusUSD: surplus });
    // إيمتى بيكمل إذا حطيت فيه الفائض بس
    let doneBy = null;
    if (g.useSurplus && x.remaining > 0.005) {
      for (let j = 0; j < 60 && !doneBy; j++) {
        const m = addMonths(start, j);
        if (surplusAt(curve, m, buffer) - used >= x.remaining - 0.5) doneBy = m;
      }
    }
    if (g.useSurplus) used += x.surplusUse;
    return { g, linked, doneBy, ...x };
  });
  const need = list.reduce((sum, x) => sum + x.monthly, 0);
  // أقصى شي فيك تدّخره بالشهر إذا ما اشتريت ولا غرض: الدخل − المعيشة − الالتزامات
  const p = curve.P;
  const capacity = p.rows.reduce((sum, r) => sum + (r.income + r.debtIn - r.living - r.commitments - r.debtOut), 0) / HORIZON;
  return { savings, need, list, invest: Math.max(0, savings - need), gap: Math.max(0, need - savings), capacity, buffer, surplusUsed: used, curve };
}

// الدفعة اللي بترجع من دين مربوط بهدف بتنضاف للهدف لحالها
export function creditGoalForDebt(s, debtId, usd) {
  if (!(usd > 0)) return null;
  const g = (s.goals || []).find((x) => (x.linkedDebtIds || []).includes(debtId));
  if (!g) return null;
  g.saved = Math.round(((Number(g.saved) || 0) + usd) * 100) / 100;
  return { goalId: g.id, usd, name: g.name };
}
export function uncreditGoal(s, credit) {
  if (!credit) return;
  const g = (s.goals || []).find((x) => x.id === credit.goalId);
  if (g) g.saved = Math.max(0, Math.round(((Number(g.saved) || 0) - credit.usd) * 100) / 100);
}

export function emergencySuggestion(state) {
  const { total } = budgetTotals(state);
  return { monthly: total, three: total * 3, six: total * 6 };
}
