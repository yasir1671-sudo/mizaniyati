// كل الحسابات: الأرصدة، إحصاءات الشهر، الخطة، ومصروف اليوم
import { toUSD } from './money.js';
import { daysInMonth, parseISO } from './dates.js';
import { incomeStatus, recurringStatus } from './income.js';

export function sortTx(list) {
  return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
}

export function accountBalances(state) {
  const b = new Map(state.accounts.map((a) => [a.id, Number(a.opening) || 0]));
  const add = (id, v) => { if (b.has(id)) b.set(id, b.get(id) + v); };
  for (const t of state.transactions) {
    if (t.type === 'expense') add(t.accountId, -t.amount);
    else if (t.type === 'income') add(t.accountId, t.amount);
    else if (t.type === 'transfer') { add(t.accountId, -t.amount); add(t.toAccountId, t.toAmount); }
    else if (t.type === 'debt') add(t.accountId, t.flow === 'in' ? t.amount : -t.amount);
  }
  return b;
}

// الديون: الباقي = المبلغ ناقص مجموع الدفعات (بعملة الدين)
export function debtPaid(debt) {
  return (debt.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}
export function debtRemaining(debt) {
  return Math.max(0, (Number(debt.amount) || 0) - debtPaid(debt));
}

export function netWorth(state) {
  const b = accountBalances(state);
  let usd = 0;
  const missing = new Set();
  for (const a of state.accounts) {
    const v = b.get(a.id);
    if (!v) continue;
    const u = toUSD(state, v, a.currency);
    if (Number.isFinite(u)) usd += u;
    else missing.add(a.currency);
  }
  return { usd, missing: [...missing] };
}

export function monthTx(state, key) {
  return state.transactions.filter((t) => t.date.startsWith(key));
}

export function monthStats(state, key) {
  let income = 0;
  let expense = 0;
  const byCat = new Map();
  for (const t of monthTx(state, key)) {
    const v = Number(t.usd) || 0;
    if (t.type === 'income') income += v;
    else if (t.type === 'expense') {
      expense += v;
      byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + v);
    }
  }
  return { income, expense, byCat };
}

export function sourceUSDForMonth(state, src, key) {
  if (src.schedule === 'once' && src.month !== key) return 0;
  return toUSD(state, Number(src.amount) || 0, src.currency);
}

export function expectedIncome(state, key) {
  let usd = 0;
  const missing = new Set();
  for (const s of state.incomeSources) {
    const v = sourceUSDForMonth(state, s, key);
    if (Number.isFinite(v)) usd += v;
    else missing.add(s.currency);
  }
  return { usd, missing: [...missing] };
}

// ميزانية الفئة بشهر معيّن: الاستثنائية لهالشهر إذا في، وإلا الأصلية
export function monthOverride(state, key) {
  const o = key ? state.settings.monthBudgets?.[key] : null;
  return o && typeof o === 'object' ? o : null;
}
export function budgetFor(state, c, key) {
  const o = monthOverride(state, key);
  if (o && o[c.id] != null) return Math.max(0, Number(o[c.id]) || 0);
  return Number(c.budget) || 0;
}

export function budgetTotals(state, key = null) {
  let fixed = 0;
  let flex = 0;
  for (const c of state.categories) {
    if (c.type !== 'expense') continue;
    const b = budgetFor(state, c, key);
    if (c.fixed) fixed += b; else flex += b;
  }
  return { fixed, flex, total: fixed + flex };
}

export function plan(state, key) {
  const income = expectedIncome(state, key).usd;
  const savings = savingsFor(state, key);
  const { fixed, flex, total } = budgetTotals(state, key);
  return { income, savings, fixed, flex, total, free: income - savings - total };
}

// الأغراض المثبّتة بتنحجز متل الالتزام بشهرها (date بيوم، أو month بس)
export function itemMonth(it) {
  return (it.date && it.date.slice(0, 7)) || it.month || null;
}
export function isReserved(it) {
  return it.status !== 'bought' && (it.kind === 'commitment' || (it.kind === 'want' && it.confirmed));
}

// الديون المربوطة بهدف ما بتنحسب دخل للمعيشة: مصاريها رايحة للهدف
export function linkedDebtIds(state) {
  const set = new Set();
  for (const g of state.goals || []) for (const id of g.linkedDebtIds || []) set.add(id);
  return set;
}

/*
 * الفواتير الثابتة الباقية هالشهر: الاشتراكات اللي ما اندفعت (بمواعيدها)،
 * أو باقي ميزانية الفئة الثابتة إذا أكبر. الاشتراك «المدفوع من قبل» بينحسب كأنه انصرف.
 */
/*
 * قدّيش لازم ينحجز لفئة ثابتة لآخر الشهر:
 * - ميزانية استثنائية إلها: المبلغ اللي حطيته.
 * - شهر ناقص (في ميزانية استثنائية بس مو لهالفئة) أو اقتراح جديد: الميزانية على الأيام الباقية.
 * - شهر عادي: الميزانية كلها ناقص اللي اندفع.
 * والاشتراك اللي ما اندفع بيضل محجوز بكل الأحوال.
 */
export function fixedNeed(state, c, today, { prorate = null, recs = null, ms = null } = {}) {
  const key = today.slice(0, 7);
  const d = parseISO(today);
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  const share = (dim - d.getDate() + 1) / dim;
  const o = monthOverride(state, key);
  const R = recs || recurringStatus(state, today);
  const mine = R.filter((x) => x.r.categoryId === c.id);
  const unpaid = mine.filter((x) => !x.paid);
  const unpaidUSD = unpaid.reduce((s, x) => s + x.usd, 0);
  const prepaid = mine.filter((x) => x.prepaid).reduce((s, x) => s + x.usd, 0);
  const spent = (ms || monthStats(state, key)).byCat.get(c.id) || 0;
  const base = Number(c.budget) || 0;
  // أول شهر بلّشت فيه بالنص: «تكملة شهر» بس، فالثابتة على الأيام من يوم ما بلّشت
  const started = state.createdAt ? new Date(state.createdAt) : null;
  const startKey = started ? `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, '0')}` : null;
  const startShare = startKey === key && started.getDate() > 1 ? (dim - started.getDate() + 1) / dim : null;
  const rest = Math.max(0, base - spent - prepaid);
  let fromBudget;
  if (!prorate && o && o[c.id] != null) fromBudget = Math.max(0, Number(o[c.id]) - spent - prepaid);
  else if (prorate || (o && o[c.id] == null)) fromBudget = Math.min(rest, base * share);
  else if (startShare != null) fromBudget = Math.min(rest, base * startShare);
  else fromBudget = rest;
  return { spent, prepaid, unpaid, unpaidUSD, need: Math.max(unpaidUSD, fromBudget), budget: base };
}

export function billsLeft(state, today) {
  const ms = monthStats(state, today.slice(0, 7));
  const recs = recurringStatus(state, today);
  const items = [];
  let total = 0;
  for (const c of state.categories) {
    if (c.type !== 'expense' || !c.fixed) continue;
    const F = fixedNeed(state, c, today, { recs, ms });
    for (const x of F.unpaid) items.push({ kind: 'bill', name: x.r.name, usd: x.usd, day: x.dueDay, rec: x.r, cat: c });
    if (F.need - F.unpaidUSD > 0.5) items.push({ kind: 'billBudget', name: c.name, usd: F.need - F.unpaidUSD, day: null, cat: c });
    total += F.need;
  }
  return { total, items };
}

// مصروف اليوم = (ميزانية المصروف اليومي − اللي انصرف قبل اليوم) ÷ الأيام الباقية، ناقص مصروف اليوم
export function dailyAllowance(state, today) {
  const key = today.slice(0, 7);
  const d = parseISO(today);
  const daysLeft = daysInMonth(d.getFullYear(), d.getMonth()) - d.getDate() + 1;
  const p = plan(state, key);
  let pool;
  let source;
  if (p.flex > 0) { pool = p.flex; source = 'budget'; }
  else if (p.income > 0) { pool = Math.max(0, p.income - p.savings - p.fixed); source = 'income'; }
  else { pool = 0; source = 'none'; }

  const fixedCats = new Set(state.categories.filter((c) => c.fixed).map((c) => c.id));
  let before = 0;
  let todaySpent = 0;
  for (const t of state.transactions) {
    // المصاريف الثابتة ومشتريات الخطة ما بتدخل بمصروف اليوم
    if (t.type !== 'expense' || !t.date.startsWith(key) || fixedCats.has(t.categoryId) || t.planItemId || t.noDaily) continue;
    if (t.date < today) before += Number(t.usd) || 0;
    else if (t.date === today) todaySpent += Number(t.usd) || 0;
  }
  const budgetPerDay = Math.max(0, pool - before) / daysLeft;
  let perDay = budgetPerDay;
  let monthLeft = pool - before - todaySpent;
  let cashLimited = false;
  let cash = null;
  // على المصاري الفعلية: ما فيك تصرف أكتر من اللي معك (والجاي هالشهر)، حتى لو الميزانية أكبر
  if (isCashAware(state)) {
    cash = cashMonth(state, today);
    const cashPerDay = Math.max(0, cash.pool + todaySpent) / daysLeft;
    if (source === 'none' || cashPerDay < budgetPerDay - 0.005) {
      perDay = cashPerDay;
      monthLeft = cash.pool;
      cashLimited = true;
      if (source === 'none') source = 'cash';
    }
  }
  return { pool, source, perDay, budgetPerDay, left: perDay - todaySpent, todaySpent, before, daysLeft, monthLeft, cashLimited, cash };
}

/* ---------- المصاري الفعلية لهالشهر ---------- */
export function savingsFor(state, key) {
  const o = state.settings.monthSavings?.[key];
  return o != null ? Number(o) || 0 : Number(state.settings.savingsTarget) || 0;
}

// منحسب على الكاش إذا المستخدم شغّلها، أو تلقائياً إذا عنده أرصدة أو دخل مسجّل
export function isCashAware(state) {
  if (state.settings.cashAware === true) return true;
  if (state.settings.cashAware === false) return false;
  return state.accounts.some((a) => Number(a.opening)) || state.transactions.some((t) => t.type === 'income' || t.type === 'debt');
}

/*
 * معك هلّق (المحافظ العادية) + الجاي هالشهر (دخل ما وصل، ديون راجعة)
 * − فواتير ثابتة باقية − التزامات الشهر − ديون عليك − ادخار باقي = اللي بيكفيك لآخر الشهر
 */
export function cashMonth(state, today) {
  const key = today.slice(0, 7);
  const bal = accountBalances(state);
  let spendable = 0;
  let savingsHeld = 0;
  const missing = new Set();
  for (const a of state.accounts) {
    const v = bal.get(a.id) || 0;
    const u = toUSD(state, v, a.currency);
    if (!Number.isFinite(u)) { if (v) missing.add(a.currency); continue; }
    if (a.savings) savingsHeld += u; else spendable += u;
  }
  const inc = incomeStatus(state, key);
  const linked = linkedDebtIds(state);
  let debtIn = 0;
  let debtOut = 0;
  const debtsDue = [];
  for (const d of state.debts) {
    if (!d.due || d.due > key) continue;
    const r = debtRemaining(d);
    if (r < 0.005) continue;
    const u = toUSD(state, r, d.currency);
    if (!Number.isFinite(u)) continue;
    if (d.direction === 'theyOwe') {
      if (linked.has(d.id)) continue;
      debtIn += u;
    } else debtOut += u;
    debtsDue.push({ debt: d, usd: u });
  }
  const B = billsLeft(state, today);
  const bills = B.total;
  let commits = 0;
  const reserved = [];
  for (const it of state.planItems) {
    const m = itemMonth(it);
    if (!isReserved(it) || !m || m > key) continue;
    const u = toUSD(state, Number(it.amount) || 0, it.currency);
    if (!Number.isFinite(u)) continue;
    commits += u;
    reserved.push({ it, usd: u });
  }
  const savingIds = new Set(state.accounts.filter((a) => a.savings).map((a) => a.id));
  let saved = 0;
  for (const t of state.transactions) {
    if (t.type !== 'transfer' || !t.date.startsWith(key) || !savingIds.has(t.toAccountId) || savingIds.has(t.accountId)) continue;
    const to = state.accounts.find((a) => a.id === t.toAccountId);
    const u = toUSD(state, Number(t.toAmount) || 0, to?.currency);
    if (Number.isFinite(u)) saved += u;
  }
  const savingsLeft = Math.max(0, savingsFor(state, key) - saved);
  const coming = inc.comingUSD + debtIn;
  const pool = spendable + coming - bills - commits - debtOut - savingsLeft;
  return {
    key, spendable, savingsHeld, coming, incomeComing: inc.comingUSD, debtIn, bills, commits, debtOut,
    savingsLeft, saved, pool, settled: inc.settled, missing: [...missing],
    billItems: B.items, reserved, debtsDue, income: inc,
  };
}
