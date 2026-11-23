// ترتيب ذكي: الفئات حسب ترتيبك وكثرة الاستعمال، والأغراض اللي بتشتريها كتير بكل فئة
import { normalizeAr } from './parse.js';

const DAY = 86400000;

// قدّيش استعملت كل فئة بآخر 90 يوم
export function catUsage(state, days = 90) {
  const since = Date.now() - days * DAY;
  const m = new Map();
  for (const t of state.transactions) {
    if (!t.categoryId || (t.createdAt || 0) < since) continue;
    m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1);
  }
  return m;
}

/*
 * ترتيب الفئات بلوحة الإضافة: بالبداية متل ما رتّبتها، ومع الاستعمال الأكتر استعمالاً بيطلع أول.
 * إذا طفيت «حسب الاستعمال» بيضل ترتيبك بس.
 */
export function orderedCats(state, type) {
  const cats = state.categories.filter((c) => c.type === type);
  if (state.settings.catSortUsage === false) return cats;
  const use = catUsage(state);
  const idx = new Map(cats.map((c, i) => [c.id, i]));
  return [...cats].sort((a, b) => (use.get(b.id) || 0) - (use.get(a.id) || 0) || idx.get(a.id) - idx.get(b.id));
}

// الأغراض اللي بتتكرر بفئة (ملاحظة + مبلغ): «خبز ₺20»، «قهوة ₺60»
export function frequentItems(state, categoryId, { limit = 6, days = 150 } = {}) {
  if (!categoryId) return [];
  const since = Date.now() - days * DAY;
  const groups = new Map();
  for (const t of state.transactions) {
    if (t.categoryId !== categoryId || !t.note || (t.createdAt || 0) < since || t.planItemId) continue;
    const k = `${normalizeAr(t.note)}|${t.amount}|${t.accountId}`;
    const g = groups.get(k) || { note: t.note.trim(), amount: t.amount, accountId: t.accountId, n: 0, last: 0 };
    g.n += 1;
    g.last = Math.max(g.last, t.createdAt || 0);
    groups.set(k, g);
  }
  // نفس الغرض بأكتر من سعر: منخلّي الأكتر تكراراً
  const byNote = new Map();
  for (const g of groups.values()) {
    const k = normalizeAr(g.note);
    const cur = byNote.get(k);
    if (!cur || g.n > cur.n || (g.n === cur.n && g.last > cur.last)) byNote.set(k, { ...g, total: (cur?.total || 0) + g.n });
    else cur.total = (cur.total || cur.n) + g.n;
  }
  return [...byNote.values()].sort((a, b) => (b.total || b.n) - (a.total || a.n) || b.last - a.last).slice(0, limit);
}
