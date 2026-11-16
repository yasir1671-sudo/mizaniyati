// الدخل الجاي بمواعيده (دفعات)، والاشتراكات والفواتير الدورية
import { toUSD } from './money.js';
import { todayISO, currentMonth, daysInMonth } from './dates.js';

export const SOURCE_CATEGORY = { salary: 'inc_salary', stocks: 'inc_stocks', extra: 'inc_extra', other: 'inc_other', debt: 'inc_debt' };

// دفعات المصدر: إذا ما في تقسيم، دفعة وحدة بيوم الوصول
export function sourceParts(s) {
  const parts = s.parts?.length ? s.parts : [{ day: s.day || 1, amount: Number(s.amount) || 0 }];
  return parts
    .map((p) => ({ day: Math.max(1, Math.min(31, Number(p.day) || 1)), amount: Number(p.amount) || 0 }))
    .sort((a, b) => a.day - b.day);
}

/*
 * شو وصل وشو باقي من كل مصدر دخل بهالشهر.
 * الدخل المربوط بالمصدر (sourceId) بينحسب إله، والدخل بنفس فئة المصدر بدون ربط كمان
 * (مشان إذا سجّلت الراتب من زر + بيختفي التذكير).
 */
export function incomeStatus(state, key = currentMonth()) {
  const settled = Boolean(state.settings.settledMonths?.[key]);
  const dismissed = state.settings.dismissed || {};
  const sources = state.incomeSources.filter((s) => s.kind !== 'debt' && (s.schedule !== 'once' || s.month === key));
  const received = new Map(sources.map((s) => [s.id, 0]));
  const unlinked = [];
  for (const t of state.transactions) {
    if (t.type !== 'income' || !t.date.startsWith(key)) continue;
    if (t.sourceId && received.has(t.sourceId)) received.set(t.sourceId, received.get(t.sourceId) + (Number(t.usd) || 0));
    else unlinked.push(t);
  }
  for (const t of unlinked) {
    const s = sources.find((x) => SOURCE_CATEGORY[x.kind] === t.categoryId);
    if (s) received.set(s.id, received.get(s.id) + (Number(t.usd) || 0));
  }
  let comingUSD = 0;
  const list = sources.map((s) => {
    let left = received.get(s.id) || 0;
    const parts = sourceParts(s).map((p, index) => {
      const usd = toUSD(state, p.amount, s.currency);
      const partUSD = Number.isFinite(usd) ? usd : 0;
      const got = Math.min(left, partUSD);
      left -= got;
      const remainingUSD = Math.max(0, partUSD - got);
      const isDismissed = Boolean(dismissed[`src:${s.id}:${key}:${index}`]);
      const done = remainingUSD < 0.5 || isDismissed || settled;
      // الباقي بعملة المصدر (للتعبئة بلوحة الإضافة)
      const remaining = partUSD > 0 ? (p.amount * remainingUSD) / partUSD : p.amount;
      return { ...p, index, usd: partUSD, gotUSD: got, remainingUSD, remaining, done, dismissed: isDismissed };
    });
    const remainingUSD = parts.filter((p) => !p.done).reduce((x, p) => x + p.remainingUSD, 0);
    comingUSD += remainingUSD;
    return { source: s, parts, receivedUSD: received.get(s.id) || 0, remainingUSD };
  });
  return { list, comingUSD, settled };
}

// الاشتراكات والفواتير: بتطلع قبل موعدها بيوم، ولحتى تندفع أو تنزاح
export function recurringStatus(state, today = todayISO()) {
  const key = today.slice(0, 7);
  const [y, m] = key.split('-').map(Number);
  const dim = daysInMonth(y, m - 1);
  const day = Number(today.slice(8, 10));
  const dismissed = state.settings.dismissed || {};
  return (state.recurring || []).filter((r) => r.active !== false).map((r) => {
    const dueDay = Math.min(Number(r.day) || 1, dim);
    const paid = state.transactions.some((t) => t.recurringId === r.id && t.date.startsWith(key));
    const isDismissed = Boolean(dismissed[`rec:${r.id}:${key}`]);
    const diff = dueDay - day;
    return { r, dueDay, paid, dismissed: isDismissed, diff, show: !paid && !isDismissed && diff <= 1 };
  });
}
