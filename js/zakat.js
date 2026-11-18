// الزكاة: المال الزكوي، النصاب (ذهب أو فضة)، الحول، وأسعار المعادن
import { h, fill, openSheet, toast, field, segmented, selectButton, dateButton } from './ui.js';
import { accountOpts } from './forms.js';
import { store, uid } from './store.js';
import { CURRENCIES, fmt, parseAmount, rateOf, toUSD, roundTo } from './money.js';
import { todayISO, addDays, iso } from './dates.js';
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

/*
 * الحول التلقائي: منحسب مالك الزكوي يوم بيوم من أول ما بلّشت تسجّل (بأسعار اليوم).
 * أول ما يوصل النصاب بيبلّش الحول، وإذا نزل تحته بينلغى، وبيرجع يبلّش لما يرجع يوصل.
 * التاريخ اللي بتحطه بإيدك (آخر زكاة، أو قبل ما تبلّش بالتطبيق) بيُعتمد إذا المال ما نزل بعده.
 */
let hawlMemo = null;
export function hawlStatus(state) {
  const stamp = `${store.version}|${todayISO()}`;
  const mine = state === store.state;
  if (mine && hawlMemo?.stamp === stamp) return hawlMemo.result;
  const result = computeHawl(state);
  if (mine) hawlMemo = { stamp, result };
  return result;
}

function computeHawl(state) {
  const Z = computeZakat(state);
  const today = todayISO();
  const z = state.zakat;
  const manual = z.lastDate || null;
  if (Z.nisab == null) return { known: false, Z, manual };
  const constant = Z.gold + Z.silver + Z.stocks + Z.other;
  const created = state.createdAt ? iso(new Date(state.createdAt)) : today;
  let start = [created, ...state.transactions.map((t) => t.date), ...state.debts.map((d) => d.date).filter(Boolean)].sort()[0] || today;
  if (start > today) start = today;

  const bal = new Map(state.accounts.map((a) => [a.id, Number(a.opening) || 0]));
  const add = (id, v) => { if (bal.has(id)) bal.set(id, bal.get(id) + v); };
  const txs = state.transactions.filter((t) => t.date <= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // الديون بتاريخها: الدين بيبلّش بتاريخه، والدفعات بتنقصه
  const debts = state.debts.map((d) => ({
    from: d.date || start, theyOwe: d.direction === 'theyOwe', cur: d.currency, amount: Number(d.amount) || 0,
    payments: (d.payments || []).map((p) => ({ date: p.date || start, amount: Number(p.amount) || 0 })),
  }));
  let ti = 0;
  let aboveSince = null;
  let droppedOn = null;
  let everAbove = false;
  const series = [];
  for (let day = start; day <= today; day = addDays(day, 1)) {
    while (ti < txs.length && txs[ti].date <= day) {
      const t = txs[ti++];
      if (t.type === 'expense') add(t.accountId, -t.amount);
      else if (t.type === 'income') add(t.accountId, t.amount);
      else if (t.type === 'transfer') { add(t.accountId, -t.amount); add(t.toAccountId, t.toAmount); }
      else if (t.type === 'debt') add(t.accountId, t.flow === 'in' ? t.amount : -t.amount);
    }
    let recv = 0;
    let pay = 0;
    for (const d of debts) {
      if (d.from > day) continue;
      const paid = d.payments.reduce((s, p) => s + (p.date <= day ? p.amount : 0), 0);
      const u = toUSD(state, Math.max(0, d.amount - paid), d.cur);
      if (!Number.isFinite(u)) continue;
      if (d.theyOwe) recv += u; else pay += u;
    }
    let cash = 0;
    for (const a of state.accounts) {
      const v = bal.get(a.id) || 0;
      if (v <= 0) continue;
      const u = toUSD(state, v, a.currency);
      if (Number.isFinite(u)) cash += u;
    }
    const w = cash + (z.includeReceivables ? recv : 0) + constant - (z.deductPayables ? pay : 0);
    series.push({ date: day, w });
    if (w >= Z.nisab) { if (!aboveSince) aboveSince = day; everAbove = true; }
    else { if (aboveSince) droppedOn = day; aboveSince = null; }
  }
  const above = Z.total >= Z.nisab;
  if (above && !aboveSince) aboveSince = today;
  let hawlStart = null;
  let reason = null;
  if (above) {
    if (aboveSince === start) {
      // فوق النصاب من أول ما بلّشت: التاريخ اليدوي إذا في، وإلا من أول التسجيل
      if (manual) { hawlStart = manual; reason = 'manual'; } else { hawlStart = start; reason = 'fromStart'; }
    } else if (manual && manual > aboveSince) {
      hawlStart = manual; reason = 'manual';
    } else {
      hawlStart = aboveSince; reason = 'auto';
    }
  }
  // التاريخ اليدوي انلغى إذا المال نزل تحت النصاب بعده
  const manualVoided = Boolean(manual) && Boolean(droppedOn) && droppedOn > manual && (!hawlStart || hawlStart !== manual);
  return {
    known: true, Z, start, above, aboveSince, droppedOn, everAbove, manual, manualVoided,
    hawlStart, reason, due: hawlStart ? addDays(hawlStart, LUNAR_YEAR_DAYS) : null, series,
  };
}

// موعد الزكاة الجاية = بداية الحول + سنة هجرية (354 يوم تقريباً)
export function zakatDueDate(state) {
  const H = hawlStatus(state);
  if (H.known) return H.due;
  return state.zakat.lastDate ? addDays(state.zakat.lastDate, LUNAR_YEAR_DAYS) : null;
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
        field('من محفظة', selectButton({ value: d.accountId, options: accountOpts(), title: 'المحفظة', onChange: (v) => { d.accountId = v; d.touched = false; render(); } })),
        field(`المبلغ بـ ${CURRENCIES[cur].name}`, h('input', { type: 'text', inputmode: 'decimal', value: d.amount, oninput: (e) => { d.amount = e.target.value; d.touched = true; } })),
        field('التاريخ', dateButton({ value: d.date, onChange: (v) => { d.date = v; render(); } })),
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
