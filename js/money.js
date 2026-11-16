// العملات والتحويل والتنسيق. كل الأسعار محفوظة كـ «كم وحدة بالدولار الواحد».
export const CURRENCIES = {
  USD: { code: 'USD', name: 'دولار', symbol: '$', decimals: 2, prefix: true },
  TRY: { code: 'TRY', name: 'ليرة تركية', symbol: '₺', decimals: 2, prefix: false },
  SYP: { code: 'SYP', name: 'ليرة سورية', symbol: 'ل.س', decimals: 0, prefix: false },
};
export const CODES = Object.keys(CURRENCIES);

const LRI = '⁦';
const PDI = '⁩';

export function rateOf(state, code) {
  if (code === 'USD') return 1;
  const r = state.rates?.[code]?.rate;
  return typeof r === 'number' && r > 0 ? r : null;
}
export function toUSD(state, amount, code) {
  const r = rateOf(state, code);
  return r ? amount / r : NaN;
}
export function fromUSD(state, usd, code) {
  const r = rateOf(state, code);
  return r ? usd * r : NaN;
}

export function roundTo(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

const nfCache = new Map();
function nf(min, max) {
  const key = `${min}-${max}`;
  if (!nfCache.has(key)) nfCache.set(key, new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max }));
  return nfCache.get(key);
}

// trim=true يشيل الأصفار بالآخر (للأسعار)، وإلا الكسور بتنكتب كاملة (للمبالغ)
export function fmtNumber(n, decimals = 2, trim = false) {
  if (!Number.isFinite(n)) return '—';
  const rounded = roundTo(n, decimals);
  if (trim) return nf(0, decimals).format(rounded);
  const isInt = Number.isInteger(rounded);
  return nf(isInt ? 0 : decimals, isInt ? 0 : decimals).format(rounded);
}

// رقم معزول الاتجاه مشان ما يتخربط جوّا الجملة العربية
export function numText(n, decimals = 4) {
  return LRI + fmtNumber(n, decimals, true) + PDI;
}

// وضع الخصوصية: بيخفي كل المبالغ (لما تفرجي التطبيق لحدا)
let hideAmounts = false;
export function setHideAmounts(v) { hideAmounts = Boolean(v); }

export function fmt(amount, code = 'USD', { sign = false, reveal = false } = {}) {
  const c = CURRENCIES[code] || { symbol: code, decimals: 2, prefix: false };
  if (!Number.isFinite(amount)) return '—';
  if (hideAmounts && !reveal) return c.prefix ? `${LRI}${c.symbol}••••${PDI}` : `${LRI}••••${PDI} ${c.symbol}`;
  const tiny = 0.5 / 10 ** c.decimals;
  const s = amount < 0 && Math.abs(amount) >= tiny ? '−' : (sign && amount >= tiny ? '+' : '');
  const body = fmtNumber(Math.abs(amount), c.decimals);
  return c.prefix ? `${LRI}${s}${c.symbol}${body}${PDI}` : `${LRI}${s}${body}${PDI} ${c.symbol}`;
}

export function rateText(rate, code) {
  if (!rate) return 'ما في سعر';
  return `${numText(rate, rate < 10 ? 4 : 2)} ${CURRENCIES[code].symbol}`;
}

export function toLatinDigits(s) {
  return String(s)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

export function parseAmount(v) {
  if (typeof v === 'number') return v;
  const s = toLatinDigits(v ?? '').replace(/[,\s]/g, '');
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
