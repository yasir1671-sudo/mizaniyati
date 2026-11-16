// كل الحسابات: الأرصدة، إحصاءات الشهر، الخطة، ومصروف اليوم
import { toUSD } from './money.js';
import { daysInMonth, parseISO } from './dates.js';

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

export function budgetTotals(state) {
  let fixed = 0;
  let flex = 0;
  for (const c of state.categories) {
    if (c.type !== 'expense') continue;
    const b = Number(c.budget) || 0;
    if (c.fixed) fixed += b; else flex += b;
  }
  return { fixed, flex, total: fixed + flex };
}

export function plan(state, key) {
  const income = expectedIncome(state, key).usd;
  const savings = Number(state.settings.savingsTarget) || 0;
  const { fixed, flex, total } = budgetTotals(state);
  return { income, savings, fixed, flex, total, free: income - savings - total };
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
  const perDay = Math.max(0, pool - before) / daysLeft;
  return { pool, source, perDay, left: perDay - todaySpent, todaySpent, before, daysLeft, monthLeft: pool - before - todaySpent };
}
