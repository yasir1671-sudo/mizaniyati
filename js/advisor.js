// الاقتراحات: قدّيش لازم تخفّف من الثانويات (مطاعم، هدايا…) مشان تشتري غرض بموعده أو أبكر
import { buildPlan } from './planner.js';
import { addMonths, currentMonth, monthsBetween, todayISO } from './dates.js';
import { budgetFor, itemMonth, dailyAllowance, cashMonth } from './calc.js';
import { isEssential, restOfMonth, overrideFrom } from './month.js';

export const MAX_CUT = 0.5;
const STEPS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];

export function discretionary(state) {
  return state.categories.filter((c) => c.type === 'expense' && !isEssential(c));
}

/*
 * نسخة من البيانات فيها تخفيض f على الثانويات لشهور معيّنة.
 * هالشهر: التخفيض على باقي الشهر (والأساسيات بتضل كاملة). الشهور الجاية: على الميزانية كلها.
 */
export function withCuts(state, f, months, { today = todayISO() } = {}) {
  const key0 = today.slice(0, 7);
  const mb = { ...(state.settings.monthBudgets || {}) };
  const cuts = [];
  for (const m of months) {
    if (m === key0) {
      const R = restOfMonth(state, today);
      const allocs = {};
      for (const x of R.cats) {
        allocs[x.c.id] = x.essential ? x.need : Math.floor(x.need * (1 - f));
        if (!x.essential && x.need >= 1 && allocs[x.c.id] < x.need - 0.5) cuts.push({ month: m, c: x.c, from: Math.round(x.need), to: allocs[x.c.id], rest: true });
      }
      mb[m] = { ...(mb[m] || {}), ...overrideFrom(R, allocs) };
    } else {
      const o = { ...(mb[m] || {}) };
      for (const c of discretionary(state)) {
        const from = budgetFor(state, c, m);
        if (from < 1) continue;
        const to = Math.floor(from * (1 - f));
        o[c.id] = to;
        cuts.push({ month: m, c, from, to, rest: false });
      }
      mb[m] = o;
    }
  }
  return { state: { ...state, settings: { ...state.settings, monthBudgets: mb } }, cuts, monthBudgets: mb };
}

// تجميع التخفيض لكل فئة (أول شهر بيمثّل الباقي)
export function cutsByCategory(cuts) {
  const seen = new Map();
  for (const x of cuts) {
    const prev = seen.get(x.c.id);
    if (!prev || (prev.rest && !x.rest)) seen.set(x.c.id, x);
  }
  return [...seen.values()].filter((x) => x.from - x.to >= 1).sort((a, b) => (b.from - b.to) - (a.from - a.to));
}

function monthsRange(from, to) {
  const n = Math.max(0, monthsBetween(from, to));
  return Array.from({ length: n + 1 }, (_, i) => addMonths(from, i));
}

// أقل تخفيض بيخلّي كل الأغراض بموعدها (target لكل غرض)
function searchCut(state, targets, months) {
  const ok = (P) => targets.every(({ id, by }) => { const s = P.schedule.get(id); return s?.month && s.month <= by; });
  for (const f of STEPS) {
    const W = withCuts(state, f, months);
    const P = buildPlan(W.state);
    if (ok(P)) return { f, W, P };
  }
  return null;
}

/*
 * اقتراحات لقائمة المشتريات:
 * 1) غرض متأخر عن موعده: قدّيش تخفّف لحتى يلحق.
 * 2) غرضين متأخرين: تخفيض واحد بيخلّيهن يلحقوا سوا.
 * 3) غرض بلا موعد بعيد: تخفيض بيقرّبه.
 */
export function purchaseSuggestions(state, { limit = 3, onlyId = null } = {}) {
  const start = currentMonth();
  const P0 = buildPlan(state);
  const wants = state.planItems.filter((it) => it.kind === 'want' && it.status !== 'bought' && !it.confirmed && (!onlyId || it.id === onlyId));
  const out = [];
  const late = [];
  for (const it of wants) {
    const s = P0.schedule.get(it.id);
    const want = itemMonth(it);
    if (!s || s.status === 'norate') continue;
    if (want && (s.status === 'late' || s.status === 'beyond')) late.push({ it, s, by: want < start ? start : want });
  }
  late.sort((a, b) => (a.it.priority || 2) - (b.it.priority || 2) || a.by.localeCompare(b.by));

  for (const x of late.slice(0, 2)) {
    const months = monthsRange(start, x.by);
    const r = searchCut(state, [{ id: x.it.id, by: x.by }], months);
    if (r) {
      out.push({ kind: 'onTime', items: [x.it], from: x.s.month || null, to: r.P.schedule.get(x.it.id).month, f: r.f, months, cuts: cutsByCategory(r.W.cuts), monthBudgets: r.W.monthBudgets });
    } else {
      // ما بيلحق حتى بـ 50%: شوف قدّيش بيقرّب
      const W = withCuts(state, MAX_CUT, months);
      const P = buildPlan(W.state);
      const to = P.schedule.get(x.it.id)?.month;
      if (to && (!x.s.month || to < x.s.month)) out.push({ kind: 'closer', items: [x.it], from: x.s.month || null, to, f: MAX_CUT, months, cuts: cutsByCategory(W.cuts), monthBudgets: W.monthBudgets });
    }
  }
  if (!onlyId && late.length >= 2) {
    const pair = late.slice(0, 2);
    const by = pair.map((x) => x.by).sort().at(-1);
    const months = monthsRange(start, by);
    const r = searchCut(state, pair.map((x) => ({ id: x.it.id, by: x.by })), months);
    if (r) out.push({ kind: 'together', items: pair.map((x) => x.it), to: by, f: r.f, months, cuts: cutsByCategory(r.W.cuts), monthBudgets: r.W.monthBudgets });
  }
  // غرض بلا موعد، مخطط بعد كم شهر: تخفيض الربع بيقرّبه؟
  for (const it of wants) {
    if (out.length >= limit) break;
    if (itemMonth(it) || late.some((x) => x.it.id === it.id)) continue;
    const s = P0.schedule.get(it.id);
    if (!s?.month || s.month <= start) continue;
    const months = monthsRange(start, addMonths(s.month, -1));
    const W = withCuts(state, 0.25, months);
    const to = buildPlan(W.state).schedule.get(it.id)?.month;
    if (to && to < s.month) out.push({ kind: 'sooner', items: [it], from: s.month, to, f: 0.25, months, cuts: cutsByCategory(W.cuts), monthBudgets: W.monthBudgets });
  }
  return out.filter((x) => x.cuts.length).slice(0, limit);
}

// شو بيتغيّر بين حالتين (قبل وبعد): مصروف اليوم، مصاري الشهر، والمشتريات اللي بتتأخر
export function impact(state, next, { today = todayISO() } = {}) {
  const a0 = dailyAllowance(state, today);
  const a1 = dailyAllowance(next, today);
  const c0 = cashMonth(state, today);
  const c1 = cashMonth(next, today);
  const P0 = buildPlan(state);
  const P1 = buildPlan(next);
  const delayed = [];
  for (const it of state.planItems) {
    if (it.kind !== 'want' || it.status === 'bought') continue;
    const s0 = P0.schedule.get(it.id);
    const s1 = P1.schedule.get(it.id);
    if (!s0?.month || !s1) continue;
    if (s1.status === 'beyond') delayed.push({ it, from: s0.month, to: null });
    else if (s1.month && s1.month > s0.month) delayed.push({ it, from: s0.month, to: s1.month });
  }
  return { a0, a1, c0, c1, P0, P1, delayed, end0: P0.endBalance, end1: P1.endBalance };
}

// مصروف زيادة بشهر جاي (شو لو؟): قدّيش تخفّف بهالشهر لحتى ما يتأخر شي وما يصير رصيد سالب
export function cutForExtra(state, probe, month) {
  const P0 = buildPlan(state);
  const base = new Map([...P0.schedule].filter(([, s]) => s.month).map(([id, s]) => [id, s.month]));
  const okPlan = (P) => P.rows.every((r, i) => r.balance >= Math.min(-0.5, P0.rows[i].balance))
    && [...base].every(([id, m]) => { const s = P.schedule.get(id); return s?.month && s.month <= m; });
  for (const f of STEPS) {
    const W = withCuts(state, f, [month]);
    const P = buildPlan(W.state, { extra: [probe] });
    if (okPlan(P)) return { f, cuts: cutsByCategory(W.cuts), monthBudgets: W.monthBudgets, P };
  }
  return null;
}
