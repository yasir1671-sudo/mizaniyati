// باقي الشهر: توزيع المصاري اللي معك (الأساسيات أول)، وخريطة الشهر يوم بيوم
import { daysInMonth, parseISO, addMonths, iso } from './dates.js';
import { cashMonth, budgetFor, budgetTotals, dailyAllowance, monthOverride, itemMonth, sortTx, fixedNeed, monthStats } from './calc.js';
import { recurringStatus, sourceParts } from './income.js';

export const isEssential = (c) => Boolean(c.fixed || c.essential);

// مصروف كل فئة يومية هالشهر (بلا مشتريات الخطة والزكاة، متل مصروف اليوم)
export function flexSpent(state, key) {
  const m = new Map();
  for (const t of state.transactions) {
    if (t.type !== 'expense' || !t.date.startsWith(key) || t.planItemId || t.noDaily) continue;
    m.set(t.categoryId, (m.get(t.categoryId) || 0) + (Number(t.usd) || 0));
  }
  return m;
}

/*
 * قدّيش بدها كل فئة لآخر الشهر، وكيف بيكفيها اللي معك:
 * الأساسيات (مواصلات، بقالة…) بتاخد أول، والثانويات (مطاعم، هدايا…) من اللي بيبقى.
 * base: 'current' = الميزانية المعتمدة هالشهر، 'original' = الأصلية (للاقتراح الجديد).
 * extraUSD: مصروف زيادة منجرّبه (شو لو؟).
 */
export function restOfMonth(state, today, { extraUSD = 0, base = 'current' } = {}) {
  const key = today.slice(0, 7);
  const d = parseISO(today);
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  const daysLeft = dim - d.getDate() + 1;
  const share = daysLeft / dim;
  const cash = cashMonth(state, today);
  const spentMap = flexSpent(state, key);
  const override = base === 'current' ? monthOverride(state, key) : null;
  // الثابتة (فواتير، صدقة ثابتة…): بشهر ناقص بتنحسب على الأيام الباقية، وفيك تعدّلها
  const recs = recurringStatus(state, today);
  const ms = monthStats(state, key);
  const pool0 = cash.pool + cash.bills - extraUSD;
  const fixed = state.categories.filter((c) => c.type === 'expense' && c.fixed).map((c) => {
    const F = fixedNeed(state, c, today, { prorate: base === 'original' ? true : null, recs, ms });
    return { c, budget: base === 'original' ? F.budget : budgetFor(state, c, key), spent: F.spent, prepaid: F.prepaid, unpaidUSD: F.unpaidUSD, need: F.need, alloc: 0, essential: true, fixed: true };
  }).filter((x) => x.budget > 0 || x.spent > 0 || x.need > 0.5);
  const fixedNeedSum = fixed.reduce((s, x) => s + x.need, 0);
  let fixedAvail = Math.max(0, pool0);
  for (const x of fixed) { x.alloc = Math.min(Math.round(x.need * 100) / 100, Math.max(0, fixedAvail)); fixedAvail -= x.alloc; }
  const pool = pool0 - fixedNeedSum;

  const cats = state.categories.filter((c) => c.type === 'expense' && !c.fixed).map((c) => {
    const budget = base === 'original' ? Number(c.budget) || 0 : budgetFor(state, c, key);
    const spent = spentMap.get(c.id) || 0;
    // الميزانية الاستثنائية أصلاً لباقي الشهر، والأصلية بتنقسم على الأيام الباقية
    const need = override && override[c.id] != null
      ? Math.max(0, budget - spent)
      : Math.min(Math.max(0, budget - spent), budget * share);
    return { c, budget, spent, need, alloc: 0, essential: isEssential(c) };
  }).filter((x) => x.budget > 0 || x.spent > 0);

  const ess = cats.filter((x) => x.essential);
  const disc = cats.filter((x) => !x.essential);
  const sum = (list, k) => list.reduce((s, x) => s + x[k], 0);
  const essNeed = sum(ess, 'need');
  const discNeed = sum(disc, 'need');
  let avail = Math.max(0, pool);
  const essScale = essNeed > 0 ? Math.min(1, avail / essNeed) : 1;
  // تقريب لتحت لأرقام صحيحة (مع سماحية صغيرة مشان 26.998 ما تصير 26)
  const part = (need, scale) => Math.max(0, Math.floor(need * scale + 0.05));
  for (const x of ess) x.alloc = part(x.need, essScale);
  avail -= sum(ess, 'alloc');
  const discScale = discNeed > 0 ? Math.min(1, Math.max(0, avail) / discNeed) : 1;
  for (const x of disc) x.alloc = part(x.need, discScale);
  avail -= sum(disc, 'alloc');

  return {
    key, dim, daysLeft, share, pool, pool0, cash, cats, ess, disc, fixed, fixedNeed: fixedNeedSum,
    essNeed, discNeed, need: essNeed + discNeed,
    essAlloc: sum(ess, 'alloc'), discAlloc: sum(disc, 'alloc'),
    leftover: Math.max(0, avail), shortage: Math.max(0, essNeed + discNeed - Math.max(0, pool)),
    essShort: essNeed > Math.max(0, pool) + 0.5,
  };
}

// الميزانية الاستثنائية من التوزيع: المصروف لهلّق + المخصص لباقي الشهر
export function overrideFrom(R, allocs = null) {
  const out = {};
  const val = (x) => (allocs && allocs[x.c.id] != null ? Number(allocs[x.c.id]) || 0 : x.alloc);
  for (const x of R.cats) out[x.c.id] = Math.round((x.spent + Math.max(0, val(x))) * 100) / 100;
  // الثابتة: اللي اندفع + اللي «مدفوع من قبل» + المحجوز لباقي الشهر
  for (const x of R.fixed || []) out[x.c.id] = Math.round((x.spent + x.prepaid + Math.max(0, val(x))) * 100) / 100;
  return out;
}

// بدها ترتيب؟ المصاري اللي معك أقل من ميزانية باقي الشهر الأصلية
export function needsMonthPlan(state, today) {
  if (monthOverride(state, today.slice(0, 7))) return false;
  const R = restOfMonth(state, today, { base: 'original' });
  return R.need > 0.5 && R.shortage > 0.5;
}

/* ---------- خريطة الشهر ---------- */
const dayOf = (s) => Number(s.slice(8, 10));

export function monthMap(state, today) {
  const key = today.slice(0, 7);
  const d0 = parseISO(today);
  const y = d0.getFullYear();
  const m0 = d0.getMonth();
  const dim = daysInMonth(y, m0);
  const td = d0.getDate();
  const cash = cashMonth(state, today);
  const a = dailyAllowance(state, today);
  const days = Array.from({ length: dim }, (_, i) => ({
    day: i + 1, date: iso(new Date(y, m0, i + 1)), past: i + 1 < td, isToday: i + 1 === td,
    spent: 0, income: 0, tx: [], events: [], bal: null,
  }));
  const undated = [];
  const at = (day) => days[Math.max(1, Math.min(dim, day)) - 1];

  // اللي صار: مصروف ودخل كل يوم
  for (const t of sortTx(state.transactions)) {
    if (!t.date.startsWith(key)) continue;
    const cell = days[dayOf(t.date) - 1];
    if (!cell) continue;
    cell.tx.push(t);
    if (t.type === 'expense') cell.spent += Number(t.usd) || 0;
    else if (t.type === 'income') cell.income += Number(t.usd) || 0;
  }

  // الدخل الجاي بمواعيده (اللي تأخر بينحط اليوم)
  for (const { source: s, parts } of cash.income.list) {
    for (const p of parts) {
      if (p.done) continue;
      const late = p.day < td;
      at(late ? td : p.day).events.push({
        kind: 'income', name: parts.length > 1 ? `${s.name}، الدفعة ${p.index + 1}` : s.name,
        usd: p.remainingUSD, late, source: s, part: p, sign: 1,
      });
    }
  }
  // الاشتراكات: المدفوعة بتطلع بيومها للعلم، والباقية بموعدها
  for (const x of recurringStatus(state, today)) {
    if (x.paid) at(x.dueDay).events.push({ kind: 'billPaid', name: x.r.name, usd: x.usd, rec: x.r, sign: 0, prepaid: x.prepaid });
  }
  for (const b of cash.billItems) {
    if (b.day == null) { undated.push({ kind: 'billBudget', name: b.name, usd: b.usd, cat: b.cat, sign: -1 }); continue; }
    const late = b.day < td;
    at(late ? td : b.day).events.push({ kind: 'bill', name: b.name, usd: b.usd, rec: b.rec, cat: b.cat, late, sign: -1 });
  }
  // الالتزامات والمشتريات المثبّتة
  for (const { it, usd } of cash.reserved) {
    const has = it.date && it.date.startsWith(key);
    if (!has && itemMonth(it) === key) { undated.push({ kind: it.kind === 'commitment' ? 'commit' : 'buy', name: it.name, usd, it, sign: -1 }); continue; }
    const day = has ? dayOf(it.date) : td;
    const late = !has || day < td;
    at(late ? td : day).events.push({ kind: it.kind === 'commitment' ? 'commit' : 'buy', name: it.name, usd, it, late, sign: -1 });
  }
  for (const { debt, usd } of cash.debtsDue) {
    undated.push({ kind: debt.direction === 'theyOwe' ? 'debtIn' : 'debtOut', name: debt.person, usd, debt, sign: debt.direction === 'theyOwe' ? 1 : -1 });
  }
  if (cash.savingsLeft > 0.5) undated.push({ kind: 'save', name: 'ادخار هالشهر', usd: cash.savingsLeft, sign: -1 });

  // المصاري يوم بيوم: اللي بلا يوم بينخصم من اليوم (احتياط)، والديون الراجعة بآخر الشهر
  let bal = cash.spendable;
  for (const e of undated) if (e.sign < 0) bal -= e.usd;
  let runOut = null;
  for (let i = td; i <= dim; i++) {
    const cell = days[i - 1];
    for (const e of cell.events) bal += e.sign * e.usd;
    bal -= i === td ? Math.max(0, a.left) : a.perDay;
    if (i === dim) for (const e of undated) if (e.sign > 0) bal += e.usd;
    cell.bal = bal;
    cell.allow = i === td ? Math.max(0, a.left) : a.perDay;
    if (runOut == null && bal < -0.5) runOut = i;
  }
  let nextIncome = null;
  if (runOut != null) {
    for (let i = runOut; i <= dim && !nextIncome; i++) {
      const e = days[i - 1].events.find((x) => x.kind === 'income' && !x.late);
      if (e) nextIncome = { day: i, e };
    }
  }

  // أول الشهر الجاي: قدّيش بدك لحتى يوصل أول دخل
  const nextKey = addMonths(key, 1);
  const [ny, nm] = nextKey.split('-').map(Number);
  let firstIncomeDay = null;
  for (const s of state.incomeSources) {
    if (s.kind === 'debt' || (s.schedule === 'once' && s.month !== nextKey)) continue;
    const first = sourceParts(s)[0]?.day;
    if (first && (firstIncomeDay == null || first < firstIncomeDay)) firstIncomeDay = first;
  }
  const nextPerDay = budgetTotals(state, nextKey).flex / daysInMonth(ny, nm - 1);
  const bridgeDays = firstIncomeDay ? Math.max(0, firstIncomeDay - 1) : 0;

  return {
    key, dim, td, days, undated, cash, a, runOut, nextIncome, endBal: bal,
    next: { key: nextKey, firstIncomeDay, bridgeDays, need: Math.ceil(nextPerDay * bridgeDays) },
  };
}
