// الزكاة: المال الزكوي، النصاب (ذهب أو فضة)، الحول، وأسعار المعادن
import { h, fill, openSheet, toast, field, segmented } from './ui.js';
import { store, uid } from './store.js';
import { CURRENCIES, fmt, parseAmount, rateOf, toUSD, roundTo } from './money.js';
import { todayISO, addDays } from './dates.js';
import { accountBalances, debtRemaining } from './calc.js';

export const NISAB_GRAMS = { gold: 85, silver: 595 };
export const ZAKAT_RATE = 0.025;
export const LUNAR_YEAR_DAYS = 354;
export const KARATS = [24, 22, 21, 18];
const OUNCE_GRAMS = 31.1034768;
const cleanNum = (n) => String(+Number(n).toPrecision(8));

export function computeZakat(state) {
  const z = state.zakat;
  const missing = new Set();
  const bal = accountBalances(state);
  let cash = 0;
  for (const a of state.accounts) {
    const v = bal.get(a.id) || 0;
    if (v <= 0) continue;
    const u = toUSD(state, v, a.currency);
    if (Number.isFinite(u)) cash += u; else missing.add(a.currency);
  }
  let receivables = 0;
  let payables = 0;
  for (const debt of state.debts) {
    const r = debtRemaining(debt);
    if (r < 0.005) continue;
    const u = toUSD(state, r, debt.currency);
    if (!Number.isFinite(u)) { missing.add(debt.currency); continue; }
    if (debt.direction === 'theyOwe') receivables += u; else payables += u;
  }
  const goldPrice = state.metals.gold.perGram;
  const silverPrice = state.metals.silver.perGram;
  const pureGold = ((Number(z.goldGrams) || 0) * (Number(z.goldKarat) || 24)) / 24;
  const silverGrams = Number(z.silverGrams) || 0;
  const gold = goldPrice ? pureGold * goldPrice : 0;
  const silver = silverPrice ? silverGrams * silverPrice : 0;
  const stocks = Number(z.stocks) || 0;
  const other = Number(z.other) || 0;
  const total = cash + (z.includeReceivables ? receivables : 0) + gold + silver + stocks + other - (z.deductPayables ? payables : 0);
  const basisPrice = z.basis === 'gold' ? goldPrice : silverPrice;
  const nisab = basisPrice ? NISAB_GRAMS[z.basis] * basisPrice : null;
  const due = nisab != null && total >= nisab ? total * ZAKAT_RATE : 0;
  return {
    cash, receivables, payables, gold, silver, stocks, other, total, nisab, due,
    missing: [...missing],
    priceMissing: !basisPrice || (pureGold > 0 && !goldPrice) || (silverGrams > 0 && !silverPrice),
  };
}

// موعد الزكاة الجاية = آخر حول + سنة هجرية (354 يوم تقريباً)
export function zakatDueDate(state) {
  const last = state.zakat.lastDate;
  return last ? addDays(last, LUNAR_YEAR_DAYS) : null;
}

let metalsInFlight = false;
let metalsTried = false;

// سعر الأونصة من نفس مصدر العملات المجاني (xau / xag)، بنحوّله لغرام
export async function refreshMetals({ force = false } = {}) {
  const m = store.state.metals;
  const autos = ['gold', 'silver'].filter((k) => m[k].mode === 'auto');
  if (!autos.length || metalsInFlight) return { ok: true, updated: [] };
  const fresh = autos.every((k) => m[k].perGram && Date.now() - (m[k].at || 0) < 12 * 3600 * 1000);
  if (!force && (fresh || metalsTried)) return { ok: true, skipped: true };
  if (!navigator.onLine) return { ok: false, reason: 'offline' };
  metalsInFlight = true;
  metalsTried = true;
  const urls = [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    'https://latest.currency-api.pages.dev/v1/currencies/usd.json',
  ];
  try {
    for (const url of urls) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
        const j = await r.json();
        clearTimeout(timer);
        const perOunceInv = { gold: Number(j.usd?.xau), silver: Number(j.usd?.xag) };
        const updated = [];
        store.update((s) => {
          for (const k of autos) {
            const v = perOunceInv[k];
            if (v > 0) { s.metals[k] = { ...s.metals[k], perGram: 1 / v / OUNCE_GRAMS, at: Date.now() }; updated.push(k); }
          }
        });
        if (updated.length) return { ok: true, updated };
      } catch {
        clearTimeout(timer);
      }
    }
    return { ok: false, reason: 'network' };
  } finally {
    metalsInFlight = false;
  }
}

/* ---------- سعر غرام الذهب أو الفضة ---------- */
export function openMetalForm(kind) {
  const label = kind === 'gold' ? 'الذهب' : 'الفضة';
  const cur = store.state.metals[kind];
  const d = { mode: cur.mode, price: cur.perGram ? cleanNum(roundTo(cur.perGram, 3)) : '' };
  openSheet(`سعر غرام ${label}`, (body, close) => {
    let err = null;
    function render() {
      err = h('p', { class: 'form-error', role: 'alert' });
      fill(body, [
        segmented([{ value: 'auto', label: 'تلقائي من النت' }, { value: 'manual', label: 'أنا بحدده' }], d.mode, (v) => { d.mode = v; render(); }, 'طريقة تحديد السعر'),
        field(`سعر غرام ${label} الصافي (عيار 24) بالدولار`, h('input', { type: 'text', inputmode: 'decimal', value: d.price, placeholder: 'اكتب السعر', oninput: (e) => { d.price = e.target.value; } })),
        h('p', { class: 'hint' }, d.mode === 'auto' ? 'بيتحدّث من السعر العالمي لما تفتح قسم الزكاة.' : 'خليه يدوي إذا بدك تعتمد سعر السوق عندك.'),
        err,
        h('button', { class: 'btn block', type: 'button', onclick: save }, 'حفظ السعر'),
      ]);
    }
    function save() {
      const n = parseAmount(d.price);
      if (d.mode === 'manual' && !(n > 0)) { err.textContent = 'اكتب السعر.'; return; }
      store.update((s) => {
        s.metals[kind] = { ...s.metals[kind], mode: d.mode, ...(n > 0 ? { perGram: n, at: Date.now() } : {}) };
      });
      close();
      if (d.mode === 'auto') {
        refreshMetals({ force: true }).then((res) => toast(res.ok && res.updated?.includes(kind) ? `تحدّث سعر ${label}` : 'ما قدرت جيب السعر هلّق.'));
      } else {
        toast('انحفظ السعر');
      }
    }
    render();
  });
}

/* ---------- دفعت الزكاة ---------- */
export function openZakatPayForm(amountUSD, dueDate) {
  const st = store.state;
  const def = st.accounts.find((a) => a.id === st.settings.defaultAccountId) || st.accounts[0];
  const d = { accountId: def?.id || '', amount: '', touched: false, date: todayISO() };
  openSheet('دفعت الزكاة', (body, close) => {
    let err = null;
    function render() {
      const s = store.state;
      const acc = s.accounts.find((a) => a.id === d.accountId);
      const cur = acc?.currency || 'USD';
      const rate = rateOf(s, cur);
      if (!d.touched) d.amount = rate ? cleanNum(roundTo(amountUSD * rate, CURRENCIES[cur].decimals)) : '';
      err = h('p', { class: 'form-error', role: 'alert' });
      fill(body, [
        h('p', { class: 'hint' }, `زكاتك المحسوبة ${fmt(amountUSD)}. رح تنسجل كمصروف بفئة «صدقة وزكاة»، وما بتأثر على مصروف اليوم.`),
        field('من محفظة', h('select', { value: d.accountId, onchange: (e) => { d.accountId = e.target.value; d.touched = false; render(); } },
          s.accounts.map((a) => h('option', { value: a.id }, `${a.name} (${CURRENCIES[a.currency].symbol})`)))),
        field(`المبلغ بـ ${CURRENCIES[cur].name}`, h('input', { type: 'text', inputmode: 'decimal', value: d.amount, oninput: (e) => { d.amount = e.target.value; d.touched = true; } })),
        field('التاريخ', h('input', { type: 'date', value: d.date, onchange: (e) => { d.date = e.target.value; } })),
        err,
        h('button', { class: 'btn violet block', type: 'button', onclick: save }, 'تم، دفعتها'),
      ]);
    }
    function save() {
      const s = store.state;
      const acc = s.accounts.find((a) => a.id === d.accountId);
      const amount = parseAmount(d.amount);
      if (!acc) { err.textContent = 'اختار المحفظة.'; return; }
      if (!(amount > 0)) { err.textContent = 'اكتب المبلغ.'; return; }
      const usd = toUSD(s, amount, acc.currency);
      if (!Number.isFinite(usd)) { err.textContent = `حدد سعر ${CURRENCIES[acc.currency].name} أول.`; return; }
      store.update((x) => {
        const txId = uid('tx');
        // إذا كانت مضافة للخطة كالتزام، منعلّمها «دفعتها»
        const planned = dueDate ? x.planItems.find((i) => i.zakatFor === dueDate && i.status !== 'bought') : null;
        if (planned) Object.assign(planned, { status: 'bought', boughtUSD: usd, boughtMonth: d.date.slice(0, 7), boughtAt: d.date, txId });
        x.transactions.push({
          id: txId, type: 'expense', date: d.date, accountId: acc.id, amount, categoryId: 'cat_charity',
          note: 'زكاة المال', usd, noDaily: true, createdAt: Date.now(), ...(planned ? { planItemId: planned.id } : {}),
        });
        // الحول الجاي بيبلّش من موعد هالزكاة، مشان يضل نفس التاريخ كل سنة
        x.zakat.lastDate = dueDate || d.date;
      });
      close();
      toast('تقبّل الله. انسجلت الزكاة.');
    }
    render();
  });
}
