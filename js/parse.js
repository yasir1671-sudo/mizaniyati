// الإدخال السريع: «50 أكل»، «200 تركي مواصلات»، «قبضت الراتب 600»
import { toLatinDigits } from './money.js';

export function normalizeAr(s) {
  return String(s)
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim();
}

const INCOME_WORDS = new Set(['راتب', 'الراتب', 'دخل', 'قبضت', 'استلمت', 'وصلني', 'اجاني', 'اجتني', 'ربح', 'ارباح', 'سداد', 'رجعلي']);
const NOTE_DROP = /^(\$|₺|دولار|دولارات|بالدولار|ترك|تركي|تركيه|بالتركي|سوري|سوريه|بالسوري|ليره|ليرات|بالليره|ل\.?س\.?|tl|usd|try|syp|الف|الاف|مليون|ب|على|عل)$/;

function variants(tok) {
  const out = [tok];
  const noConj = tok.replace(/^[وف](?=..)/, '');
  out.push(noConj);
  out.push(noConj.replace(/^[بلك]?ال(?=..)/, ''));
  out.push(noConj.replace(/^[بل](?=...)/, ''));
  return [...new Set(out)];
}

function aliasesOf(c) {
  return [...(c.aliases || []), ...String(c.name).split(/\s+/)].map(normalizeAr).filter((a) => a.length >= 2);
}

function matchCategory(tokens, cats) {
  let prefix = null;
  for (const tok of tokens) {
    for (const v of variants(tok)) {
      if (v.length < 2) continue;
      for (const c of cats) {
        for (const a of aliasesOf(c)) {
          if (v === a) return { cat: c, token: tok };
          if (!prefix && a.length >= 3 && v.length > a.length && v.startsWith(a)) prefix = { cat: c, token: tok };
        }
      }
    }
  }
  return prefix;
}

function liraGuess(state) {
  const curOf = new Map(state.accounts.map((a) => [a.id, a.currency]));
  let best = null;
  for (const t of state.transactions) {
    const c = curOf.get(t.accountId);
    if (c && c !== 'USD' && (!best || (t.createdAt || 0) > (best.createdAt || 0))) best = { c, createdAt: t.createdAt };
  }
  if (best) return best.c;
  const def = curOf.get(state.settings.defaultAccountId);
  return def && def !== 'USD' ? def : 'SYP';
}

/* ======================= الأرقام المحكية ======================= */
// كلها بعد التطبيع (ة→ه، أ→ا، ئ→ي)
const NUM_WORDS = {
  unit: { واحد: 1, وحده: 1, اتنين: 2, اثنين: 2, تنين: 2, ثنين: 2, تلاته: 3, ثلاثه: 3, تلات: 3, ثلاث: 3, تلت: 3, اربعه: 4, اربع: 4, خمسه: 5, خمس: 5, سته: 6, ست: 6, سبعه: 7, سبع: 7, تمانيه: 8, ثمانيه: 8, تمن: 8, ثمان: 8, تسعه: 9, تسع: 9, عشره: 10, عشر: 10 },
  teen: { احدعش: 11, احدعشر: 11, اطنعش: 12, اتنعش: 12, اثنعش: 12, تلطعش: 13, تلتعش: 13, ثلطعش: 13, اربعطعش: 14, اربعتعش: 14, خمسطعش: 15, خمستعش: 15, ستطعش: 16, ستعش: 16, سبعطعش: 17, سبعتعش: 17, تمنطعش: 18, تمنتعش: 18, تسعطعش: 19, تسعتعش: 19 },
  ten: { عشرين: 20, تلاتين: 30, ثلاثين: 30, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, تمانين: 80, ثمانين: 80, تسعين: 90 },
  hundred: { ميه: 100, مايه: 100, مية: 100, ميتين: 200, متين: 200, مييتين: 200, تلتميه: 300, تلاتميه: 300, ثلاثميه: 300, اربعميه: 400, خمسميه: 500, ستميه: 600, سبعميه: 700, تمنميه: 800, ثمانميه: 800, تسعميه: 900 },
  thousand: { الف: 1000, الفين: 2000 },
  mult: { الاف: 1000, تلاف: 1000, الوف: 1000, مليون: 1000000, ملايين: 1000000 },
  frac: { نص: 0.5, نصف: 0.5, ربع: 0.25 },
};
function classifyNum(w) {
  for (const [kind, map] of Object.entries(NUM_WORDS)) if (w in map) return { kind, value: map[w] };
  return null;
}
function readNumber(words, start) {
  let total = 0;
  let cur = 0;
  let any = false;
  let j = start;
  while (j < words.length) {
    const w = normalizeAr(words[j]);
    const hasWa = j > start && w.length > 2 && w.startsWith('و');
    const core = hasWa ? w.slice(1) : w;
    const t = classifyNum(core);
    if (!t) break;
    if (t.kind === 'frac' && !any) break; // «نص» لحالها مو رقم
    if (any && !hasWa) {
      const isMultiplier = t.kind === 'mult' || (t.kind === 'thousand' && t.value === 1000) || (t.kind === 'hundred' && t.value === 100 && cur > 0 && cur < 10);
      if (!isMultiplier) break;
    }
    if (t.kind === 'unit' || t.kind === 'teen' || t.kind === 'ten' || t.kind === 'frac') cur += t.value;
    else if (t.kind === 'hundred') cur = t.value === 100 && cur > 0 && cur < 10 ? cur * 100 : cur + t.value;
    else if (t.kind === 'thousand') { total += t.value === 1000 ? (cur || 1) * 1000 : t.value; cur = 0; }
    else if (t.kind === 'mult') { total += (cur || 1) * t.value; cur = 0; }
    any = true;
    j += 1;
  }
  return any ? { value: total + cur, end: j } : null;
}
// «مية وخمسين تركي» ← «150 تركي»
export function wordsToDigits(text) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  while (i < words.length) {
    const r = readNumber(words, i);
    if (r) { out.push(String(r.value)); i = r.end; } else { out.push(words[i]); i += 1; }
  }
  return out.join(' ');
}

/* ======================= جمل كاملة بكذا عملية ======================= */
const STARTERS = new Set(['صرفت', 'دفعت', 'اشتريت', 'اشترينا', 'جبت', 'جبنا', 'وصل', 'وصلني', 'وصلت', 'قبضت', 'استلمت', 'عزمت', 'رحت', 'رحنا', 'اخدت', 'حطيت', 'سددت', 'رجعلي', 'دفعنا', 'كمان', 'بعدين']);
const STOP = new Set(['صرفت', 'دفعت', 'اشتريت', 'اشترينا', 'جبت', 'جبنا', 'اليوم', 'هلق', 'مبارح', 'امبارح', 'ب', 'بـ', 'على', 'عل', 'و', 'من', 'في', 'ع', 'كمان', 'بعدين', 'حق', 'سعر', 'حقه', 'حقها', 'وصلني', 'قبضت', 'استلمت', 'دخل', 'كلها', 'كله', 'يعني', 'تقريبا', 'شي']);
// كلمات بتحدد سياق الجملة كلها (عزيمة أو طبخة يعني أكل)
const CONTEXT = { عزمت: 'cat_food', عزيمه: 'cat_food', طبخه: 'cat_food', طبخ: 'cat_food', غدا: 'cat_food', عشا: 'cat_food', فطور: 'cat_food', سفره: 'cat_transport', مشوار: 'cat_transport' };
const WEAK_UNDER = { cat_food: ['cat_grocery', 'cat_snacks'] };

function detectCurrency(norm) {
  const t = ` ${norm} `;
  if (/\$|دولار|usd/.test(t)) return 'USD';
  if (/₺|ترك|\stl\s|\stry\s/.test(t)) return 'TRY';
  if (/سوري|\sل\.?\s?س\.?\s|\ssyp\s/.test(t)) return 'SYP';
  if (/لير/.test(t)) return 'LIRA';
  return null;
}

export function parseMulti(text, state) {
  const latin = wordsToDigits(toLatinDigits(String(text || '')));
  const rawWords = latin.replace(/[،,؛;.!؟?\n]+/g, ' ، ').split(/\s+/).filter(Boolean);
  // نقسم لجمل: عند الفواصل، أو عند فعل جديد بعد ما صار في رقم
  const clauses = [];
  let curClause = [];
  let hasNum = false;
  for (const w of rawWords) {
    const n = normalizeAr(w).replace(/^و(?=..)/, '');
    if (w === '،') { if (curClause.length) clauses.push(curClause); curClause = []; hasNum = false; continue; }
    if (hasNum && STARTERS.has(n)) { clauses.push(curClause); curClause = []; hasNum = false; }
    curClause.push(w);
    if (/\d/.test(w)) hasNum = true;
  }
  if (curClause.length) clauses.push(curClause);

  // السياق: جمل بلا أرقام (متل «عزمت أخوي عمر على طبخة») والعملة إذا انذكرت مرة وحدة
  let contextCat = null;
  const globalCurs = new Set();
  for (const c of clauses) {
    const norm = normalizeAr(c.join(' '));
    const cur = detectCurrency(norm);
    if (cur) globalCurs.add(cur);
    for (const w of c) { const k = normalizeAr(w).replace(/^و(?=..)/, ''); if (CONTEXT[k]) contextCat = CONTEXT[k]; }
  }
  const globalCur = globalCurs.size === 1 ? [...globalCurs][0] : null;

  const def = state.accounts.find((a) => a.id === state.settings.defaultAccountId) || state.accounts[0];
  const items = [];
  const isNum = (w) => /^\d[\d,]*(\.\d+)?$/.test(w);
  const allAliases = new Set(state.categories.flatMap((c) => aliasesOf(c)));
  // كلمة بتبلّش بـ «و» بتفصل بين عمليتين («مواصلات 50 وأكل 30»)، إلا إذا الكلمة نفسها معروفة متل «وجبة»
  const isConnector = (w) => {
    const n = normalizeAr(w);
    return n === 'و' || (n.length > 2 && n.startsWith('و') && !allAliases.has(n));
  };
  for (const raw of clauses) {
    // «و20» ← «و» + «20»
    const clause = raw.flatMap((w) => { const m = w.match(/^و(\d.*)$/); return m ? ['و', m[1]] : [w]; });
    const numIdx = clause.map((w, i) => (isNum(w) ? i : -1)).filter((i) => i >= 0);
    if (!numIdx.length) continue;
    const clauseNorm = normalizeAr(clause.join(' '));
    const clauseCur = detectCurrency(clauseNorm);
    let prevEnd = 0;
    numIdx.forEach((ni) => {
      // الكلمات بعد الرقم لحتى رقم تاني أو «و»، وقبله من آخر عملية
      const after = [];
      for (let j = ni + 1; j < clause.length && !isNum(clause[j]) && !isConnector(clause[j]); j++) after.push(clause[j]);
      const before = clause.slice(prevEnd, ni);
      prevEnd = ni + 1 + after.length;
      let amount = Number(clause[ni].replace(/,/g, ''));
      const next = normalizeAr(clause[ni + 1] || '');
      if (/^(الف|الاف)$/.test(next)) amount *= 1000;
      if (!(amount > 0)) return;
      const segment = [...before, clause[ni], ...after];
      const segNorm = normalizeAr(segment.join(' '));
      const toTokens = (ws) => ` ${normalizeAr(ws.join(' '))} `.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
      // الفئة من الكلمات بعد الرقم أول، وإذا ما في من اللي قبله
      const tokens = [...toTokens(after), ...toTokens(before)];
      const incomeHint = tokens.some((t) => INCOME_WORDS.has(t)) || [...clauseNorm.split(/\s+/)].some((t) => INCOME_WORDS.has(t));
      const cats = state.categories.filter((c) => c.type === (incomeHint ? 'income' : 'expense'));
      let match = matchCategory(tokens, cats);
      if (!match && !incomeHint) match = matchCategory(tokens, state.categories.filter((c) => c.type === 'income'));
      let categoryId = match?.cat.id || null;
      let type = match ? match.cat.type : incomeHint ? 'income' : 'expense';
      if (type === 'expense' && contextCat && (!categoryId || (WEAK_UNDER[contextCat] || []).includes(categoryId))) categoryId = contextCat;
      if (!categoryId) categoryId = type === 'income' ? 'inc_other' : 'cat_other';
      let cur = detectCurrency(segNorm) || clauseCur || globalCur;
      if (cur === 'LIRA') cur = liraGuess(state);
      let account = def;
      if (cur) account = def && def.currency === cur ? def : state.accounts.find((a) => a.currency === cur && !a.savings) || state.accounts.find((a) => a.currency === cur);
      if (!account) account = def;
      // منشيل الملاحظة بس إذا كانت اسم الفئة نفسه («مواصلات»)، أما «فروج» أو «صدور دجاج» بتضل
      const catName = state.categories.find((c) => c.id === categoryId)?.name || '';
      const catWords = new Set(catName.split(/\s+/).map((w) => normalizeAr(w).replace(/^و(?=..)/, '')));
      const noteWords = segment
        .filter((w, i) => !/\d/.test(w) && !STOP.has(normalizeAr(w).replace(/^و(?=..)/, '')) && !NOTE_DROP.test(normalizeAr(w)) && !(i === 0 && STARTERS.has(normalizeAr(w))))
        .map((w) => (isConnector(w) && allAliases.has(normalizeAr(w).slice(1)) ? w.slice(1) : w));
      // إذا الملاحظة بس اسم الفئة («مواصلات») منخليها فاضية
      const note = noteWords.every((w) => catWords.has(normalizeAr(w))) ? '' : noteWords.join(' ').replace(/\s+/g, ' ').trim();
      items.push({ type, amount, accountId: account.id, currency: account.currency, categoryId, note, matched: Boolean(match) || Boolean(contextCat && type === 'expense') });
    });
  }
  return items;
}

export function parseQuick(text, state) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  const latin = toLatinDigits(raw);
  const m = latin.match(/\d[\d,]*(?:\.\d+)?/);
  if (!m) return { ok: false, reason: 'no-amount', note: raw };

  let amount = Number(m[0].replace(/,/g, ''));
  const nextWord = normalizeAr(latin.slice(m.index + m[0].length)).split(/\s+/)[0] || '';
  if (/^(الف|الاف|k)$/.test(nextWord)) amount *= 1000;
  else if (/^مليون/.test(nextWord)) amount *= 1e6;
  if (!(amount > 0)) return { ok: false, reason: 'no-amount', note: raw };

  const norm = ` ${normalizeAr(latin)} `;
  let currency = null;
  if (/\$|دولار|usd/.test(norm)) currency = 'USD';
  else if (/₺|ترك|\stl\s|\stry\s/.test(norm)) currency = 'TRY';
  else if (/سوري|\sل\.?\s?س\.?\s|\ssyp\s/.test(norm)) currency = 'SYP';
  else if (/لير/.test(norm)) currency = liraGuess(state);

  const tokens = norm.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const incomeHint = tokens.some((t) => INCOME_WORDS.has(t));
  const expenseCats = state.categories.filter((c) => c.type === 'expense');
  const incomeCats = state.categories.filter((c) => c.type === 'income');
  const match = incomeHint
    ? matchCategory(tokens, incomeCats)
    : matchCategory(tokens, expenseCats) || matchCategory(tokens, incomeCats);
  const type = match ? match.cat.type : incomeHint ? 'income' : 'expense';
  const categoryId = match?.cat.id || (type === 'income' ? 'inc_other' : 'cat_other');

  const def = state.accounts.find((a) => a.id === state.settings.defaultAccountId) || state.accounts[0];
  let account = def;
  if (currency) account = def && def.currency === currency ? def : state.accounts.find((a) => a.currency === currency);
  if (!account) return { ok: false, reason: 'no-account', currency, amount, note: raw };

  let note = `${latin.slice(0, m.index)} ${latin.slice(m.index + m[0].length)}`
    .split(/\s+/)
    .filter((w) => w && !NOTE_DROP.test(normalizeAr(w)))
    .join(' ')
    .trim();
  if (match && normalizeAr(note) === match.token) note = '';

  return { ok: true, type, amount, currency: account.currency, accountId: account.id, categoryId, note };
}
