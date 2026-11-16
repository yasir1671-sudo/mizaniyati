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
