// المال: المحافظ وأسعار الصرف، الديون، الزكاة
import { h, icon, toast, fill, segmented } from '../ui.js';
import { store, uid } from '../store.js';
import { CURRENCIES, CODES, fmt, toUSD, rateText, parseAmount } from '../money.js';
import { relTime, currentMonth, monthLabel, longDate, hijriDate, daysUntil, daysText } from '../dates.js';
import { accountBalances, netWorth, debtRemaining, debtPaid } from '../calc.js';
import { group } from '../components.js';
import { openAccountForm, openTxForm, openRateForm } from '../forms.js';
import { refreshRates } from '../rates.js';
import { openDebtForm } from '../debts.js';
import { computeZakat, zakatDueDate, refreshMetals, openMetalForm, openZakatPayForm, NISAB_GRAMS, KARATS, ZAKAT_RATE } from '../zakat.js';

const SECTIONS = [
  { value: 'wallets', label: 'المحافظ' },
  { value: 'debts', label: 'الديون' },
  { value: 'zakat', label: 'الزكاة' },
];
let section = 'wallets';
export function setWalletSection(s) { section = s; }

export function renderWallets({ go }) {
  const views = { wallets: walletsSection, debts: debtsSection, zakat: zakatSection };
  return h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', null, 'المال')),
    h('div', { class: 'section-tabs' }, segmented(SECTIONS, section, (v) => { section = v; go('wallets'); }, 'أقسام المال')),
    views[section]());
}

function line(label, value, cls = '', valueCls = '') {
  return h('div', { class: `row ${cls}`.trim() },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, label)),
    h('span', { class: 'row-end' }, h('span', { class: `amount ${valueCls}`.trim() }, value)));
}

function debtTotals(st) {
  let theyOwe = 0;
  let iOwe = 0;
  for (const debt of st.debts) {
    const u = toUSD(st, debtRemaining(debt), debt.currency);
    if (!Number.isFinite(u)) continue;
    if (debt.direction === 'theyOwe') theyOwe += u; else iOwe += u;
  }
  return { theyOwe, iOwe };
}

/* ======================= المحافظ ======================= */
function walletsSection() {
  const st = store.state;
  const bal = accountBalances(st);
  const nw = netWorth(st);
  const dt = debtTotals(st);
  const missingNames = nw.missing.map((c) => CURRENCIES[c].name).join(' و');

  const accountRows = st.accounts.map((a) => {
    const v = bal.get(a.id) || 0;
    const usd = toUSD(st, v, a.currency);
    const isDefault = st.settings.defaultAccountId === a.id;
    return h('button', { class: 'row', type: 'button', onclick: () => openAccountForm(a) },
      h('span', { class: 'tx-icon cur', 'aria-hidden': 'true' }, CURRENCIES[a.currency].symbol),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, a.name),
        h('span', { class: 'row-sub' }, isDefault ? `${CURRENCIES[a.currency].name}، الافتراضية` : CURRENCIES[a.currency].name)),
      h('span', { class: 'row-end' },
        h('span', { class: `amount ${v < 0 ? 'over' : ''}`.trim() }, fmt(v, a.currency)),
        a.currency !== 'USD' ? h('span', { class: 'row-sub' }, Number.isFinite(usd) ? `≈ ${fmt(usd)}` : 'ما في سعر') : null));
  });
  if (!accountRows.length) accountRows.push(h('p', { class: 'row-note' }, 'ما في محافظ. ضيف محفظة لكل مكان فيه مصاري: كاش، بنك، محفظة إلكترونية.'));
  accountRows.push(h('div', { class: 'row-actions' },
    h('button', { class: 'btn secondary small', type: 'button', onclick: () => openTxForm({ type: 'transfer' }) }, icon('swap', 18), 'تحويل أو تصريف'),
    h('button', { class: 'btn secondary small', type: 'button', onclick: () => openAccountForm() }, icon('plus', 18), 'محفظة جديدة')));

  const rateRows = CODES.filter((c) => c !== 'USD').map((c) => {
    const r = st.rates[c] || { mode: 'manual' };
    const when = r.at ? `آخر تحديث ${relTime(r.at)}` : 'ما في سعر لسّا';
    return h('button', { class: 'row', type: 'button', onclick: () => openRateForm(c) },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, CURRENCIES[c].name),
        h('span', { class: 'row-sub' }, `${r.mode === 'auto' ? 'تلقائي' : 'يدوي'}، ${when}`)),
      h('span', { class: 'row-end' }, h('span', { class: `amount ${r.rate ? '' : 'warn'}`.trim() }, r.rate ? rateText(r.rate, c) : 'حدده')));
  });
  rateRows.push(h('div', { class: 'row-actions' },
    h('button', {
      class: 'btn secondary small', type: 'button',
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const res = await refreshRates({ force: true });
        if (!res.ok) toast(res.reason === 'offline' ? 'ما في نت هلّق.' : 'ما قدرت جيب الأسعار. جرّب بعدين.');
        else toast(res.updated.length ? 'تحدّثت الأسعار التلقائية' : 'ما في عملة على الوضع التلقائي.');
        if (document.contains(btn)) btn.disabled = false;
      },
    }, icon('refresh', 18), 'حدّث الأسعار التلقائية')));

  const hasDebts = dt.theyOwe > 0.005 || dt.iOwe > 0.005;
  return [
    h('section', { class: 'worth' },
      h('p', { class: 'muted' }, 'مجموع اللي معك بالدولار'),
      h('p', { class: 'worth-value' }, fmt(nw.usd)),
      hasDebts ? h('p', { class: 'muted' }, `ومع الديون: ${fmt(nw.usd + dt.theyOwe - dt.iOwe)}`) : null,
      nw.missing.length > 0 ? h('p', { class: 'muted bad' }, `ما انحسب رصيد ${missingNames} لأن ما في سعر صرف.`) : null),
    group('محافظك', accountRows),
    group('سعر الدولار الواحد', rateRows),
  ];
}

/* ======================= الديون ======================= */
function debtsSection() {
  const st = store.state;
  const cur = currentMonth();
  const dt = debtTotals(st);
  const open = st.debts.filter((d) => debtRemaining(d) > 0.005)
    .sort((a, b) => (a.due || '9999-99').localeCompare(b.due || '9999-99'));
  const theyOwe = open.filter((d) => d.direction === 'theyOwe');
  const iOwe = open.filter((d) => d.direction === 'iOwe');
  const closed = st.debts.filter((d) => debtRemaining(d) <= 0.005).slice(-5).reverse();

  const actions = h('div', { class: 'section-actions' },
    h('button', { class: 'btn small', type: 'button', onclick: () => openDebtForm(null, 'theyOwe') }, icon('plus', 18), 'دين إلك'),
    h('button', { class: 'btn secondary small', type: 'button', onclick: () => openDebtForm(null, 'iOwe') }, icon('plus', 18), 'دين عليك'));

  if (!st.debts.length) {
    return [actions, h('div', { class: 'empty' },
      h('p', null, 'سجّل المصاري اللي إلك عند الناس، واللي عليك. إذا حطيت موعد للدين، بيدخل بخطة السنة لحاله.'))];
  }

  const row = (debt) => {
    const rem = debtRemaining(debt);
    const paid = debtPaid(debt);
    const usd = toUSD(st, rem, debt.currency);
    let sub;
    let cls = '';
    if (!debt.due) sub = 'بلا موعد';
    else if (debt.due < cur && rem > 0.005) { sub = `فات موعده (${monthLabel(debt.due)})`; cls = 'warn'; }
    else sub = `${debt.direction === 'theyOwe' ? 'بيرجع' : 'لازم تسدّه'} بـ ${monthLabel(debt.due)}`;
    if (rem <= 0.005) { sub = debt.direction === 'theyOwe' ? 'رجع كامل' : 'انسدّ كامل'; cls = ''; }
    else if (paid > 0.005) sub += `، ${debt.direction === 'theyOwe' ? 'رجع' : 'سددت'} ${fmt(paid, debt.currency)}`;
    return h('button', { class: 'row', type: 'button', onclick: () => openDebtForm(debt) },
      h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, '🤝'),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, debt.person),
        h('span', { class: `row-sub wrap ${cls}`.trim() }, sub)),
      h('span', { class: 'row-end' },
        h('span', { class: 'amount' }, fmt(rem > 0.005 ? rem : debt.amount, debt.currency)),
        debt.currency !== 'USD' && rem > 0.005 && Number.isFinite(usd) ? h('span', { class: 'row-sub' }, `≈ ${fmt(usd)}`) : null));
  };

  return [
    actions,
    group('الخلاصة', [
      line('إلك عند الناس', fmt(dt.theyOwe), '', 'income'),
      line('عليك للناس', fmt(dt.iOwe)),
      line(dt.theyOwe >= dt.iOwe ? 'الصافي إلك' : 'الصافي عليك', fmt(Math.abs(dt.theyOwe - dt.iOwe)), 'total'),
    ]),
    theyOwe.length ? group('إلك عند الناس', theyOwe.map(row)) : null,
    iOwe.length ? group('عليك للناس', iOwe.map(row)) : null,
    closed.length ? group('خلصت', closed.map(row)) : null,
  ];
}

/* ======================= الزكاة ======================= */
function zakatSection() {
  const st = store.state;
  const z = st.zakat;
  refreshMetals().catch(() => {});

  // الأرقام المحسوبة بتتحدّث لحالها، والحقول ما بتنعاد رسمها (مشان ما يسكّر الكيبورد)
  const result = h('section', { class: 'zakat-result' });
  const breakdown = h('section', { class: 'group' });
  const refresh = () => {
    const s = store.state;
    const R = computeZakat(s);
    fill(result, resultContent(s, R));
    fill(breakdown, breakdownContent(s, R));
  };
  refresh();

  const commit = (mutator) => { store.update(mutator, { silent: true }); refresh(); };
  const numInput = (value, label, key) => h('input', {
    type: 'text', inputmode: 'decimal', class: 'inline-input', value: value ? String(value) : '', placeholder: '0', 'aria-label': label,
    onchange: (e) => { const n = parseAmount(e.target.value); commit((s) => { s.zakat[key] = n > 0 ? n : 0; }); },
  });
  const toggle = (label, key) => h('label', { class: 'check row-check' },
    h('input', { type: 'checkbox', checked: Boolean(z[key]), onchange: (e) => commit((s) => { s.zakat[key] = e.target.checked; }) }),
    label);

  const inputs = group('أموال تانية', [
    h('div', { class: 'row' },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'ذهب (غرام)'), h('span', { class: 'row-sub' }, 'للادخار أو التجارة')),
      h('select', { class: 'inline-select', value: String(z.goldKarat || 24), 'aria-label': 'عيار الذهب', onchange: (e) => commit((s) => { s.zakat.goldKarat = Number(e.target.value); }) },
        KARATS.map((k) => h('option', { value: String(k) }, `عيار ${k}`))),
      numInput(z.goldGrams, 'غرامات الذهب', 'goldGrams')),
    h('div', { class: 'row' },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'فضة (غرام)')),
      numInput(z.silverGrams, 'غرامات الفضة', 'silverGrams')),
    h('div', { class: 'row' },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'أسهم واستثمارات'), h('span', { class: 'row-sub' }, 'قيمتها السوقية اليوم')),
      h('span', { class: 'inline-money' }, '$', numInput(z.stocks, 'قيمة الأسهم بالدولار', 'stocks'))),
    h('div', { class: 'row' },
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'أموال تانية'), h('span', { class: 'row-sub' }, 'بضاعة تجارة، مصاري برا المحافظ')),
      h('span', { class: 'inline-money' }, '$', numInput(z.other, 'أموال تانية بالدولار', 'other'))),
    h('div', { class: 'row-block' },
      toggle('احسب الديون اللي إلك (المرجو رجوعها)', 'includeReceivables'),
      toggle('انقص الديون اللي عليك', 'deductPayables')),
  ]);

  return [result, breakdown, inputs, nisabGroup(st), hawlGroup(st),
    h('p', { class: 'section-note' }, 'هالحساب مساعد وتقريبي. بالحالات الخاصة متل ذهب الزينة، والأسهم طويلة الأجل، والديون الصعب رجوعها، اسأل أهل العلم.')];
}

function resultContent(st, R) {
  if (R.priceMissing) {
    return [h('div', { class: 'banner' },
      h('p', null, 'لازم سعر غرام الذهب أو الفضة مشان ينحسب النصاب. بيجي تلقائياً من النت، أو حطه بإيدك من قسم النصاب تحت.'))];
  }
  const above = R.due > 0;
  return [
    h('p', { class: 'muted' }, above ? 'زكاتك إذا حال الحول' : 'مالك هلّق'),
    h('p', { class: 'worth-value' }, above ? fmt(R.due) : 'أقل من النصاب'),
    h('p', { class: 'muted' }, above
      ? `${Math.round(ZAKAT_RATE * 1000) / 10}% من ${fmt(R.total)}. النصاب ${fmt(R.nisab)}.`
      : `مجموع مالك الزكوي ${fmt(R.total)}، والنصاب ${fmt(R.nisab)}. ما عليك زكاة هلّق.`),
  ];
}

function breakdownContent(st, R) {
  const z = st.zakat;
  const rows = [
    line('الكاش بالمحافظ', fmt(R.cash)),
    z.includeReceivables && R.receivables > 0.005 ? line('ديون إلك', fmt(R.receivables)) : null,
    R.gold > 0.005 ? line('الذهب', fmt(R.gold)) : null,
    R.silver > 0.005 ? line('الفضة', fmt(R.silver)) : null,
    R.stocks > 0.005 ? line('أسهم واستثمارات', fmt(R.stocks)) : null,
    R.other > 0.005 ? line('أموال تانية', fmt(R.other)) : null,
    z.deductPayables && R.payables > 0.005 ? line('ناقص ديون عليك', fmt(-R.payables)) : null,
    line('مجموع المال الزكوي', fmt(R.total), 'total'),
  ];
  if (R.missing.length) rows.push(h('p', { class: 'row-note bad' }, `ما انحسب اللي بـ ${R.missing.map((c) => CURRENCIES[c].name).join(' و')} لأن ما في سعر صرف.`));
  return [h('div', { class: 'group-head' }, h('h2', null, 'مالك الزكوي')), h('div', { class: 'rows' }, rows)];
}

function nisabGroup(st) {
  const z = st.zakat;
  const metalRow = (kind, label) => {
    const m = st.metals[kind];
    const when = m.at ? `${m.mode === 'auto' ? 'تلقائي' : 'يدوي'}، ${relTime(m.at)}` : 'ما في سعر لسّا';
    return h('button', { class: 'row', type: 'button', onclick: () => openMetalForm(kind) },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, `غرام ${label} الصافي`),
        h('span', { class: 'row-sub' }, when)),
      h('span', { class: 'row-end' }, h('span', { class: `amount ${m.perGram ? '' : 'warn'}`.trim() }, m.perGram ? fmt(m.perGram) : 'حدده')));
  };
  const nisabOf = (kind) => (st.metals[kind].perGram ? fmt(NISAB_GRAMS[kind] * st.metals[kind].perGram) : '—');
  return group('النصاب', [
    h('div', { class: 'row-block' },
      segmented([
        { value: 'gold', label: `ذهب ${NISAB_GRAMS.gold} غ` },
        { value: 'silver', label: `فضة ${NISAB_GRAMS.silver} غ` },
      ], z.basis, (v) => store.update((s) => { s.zakat.basis = v; }), 'النصاب'),
      h('p', { class: 'field-hint' }, `بالذهب ${nisabOf('gold')}، وبالفضة ${nisabOf('silver')}. في علماء بيعتمدوا الفضة لأنها أنفع للفقير، وعلماء بيعتمدوا الذهب. اختار حسب الفتوى اللي بتتبعها.`)),
    metalRow('gold', 'الذهب'),
    metalRow('silver', 'الفضة'),
  ]);
}

function hawlGroup(st) {
  const z = st.zakat;
  const due = zakatDueDate(st);
  const R = computeZakat(st);
  const rows = [
    h('div', { class: 'row-block' },
      h('label', { class: 'field' },
        h('span', { class: 'field-label' }, 'تاريخ آخر زكاة، أو اليوم اللي وصل فيه مالك للنصاب'),
        h('input', { type: 'date', value: z.lastDate || '', onchange: (e) => store.update((s) => { s.zakat.lastDate = e.target.value || null; }) }),
        z.lastDate ? h('span', { class: 'field-hint' }, hijriDate(z.lastDate)) : null)),
  ];
  if (due) {
    const left = daysUntil(due);
    let when;
    if (left > 0) when = `بعد ${daysText(left)}`;
    else if (left === 0) when = 'اليوم';
    else when = `مستحقة من ${daysText(-left)}`;
    rows.push(h('div', { class: 'row' },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, `الحول الجاي ${when}`),
        h('span', { class: 'row-sub wrap' }, `${longDate(due)} ${due.slice(0, 4)}، ${hijriDate(due)}`))));
    if (R.due > 0) {
      rows.push(h('div', { class: 'row-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => openZakatPayForm(R.due, due) }, 'دفعت الزكاة'),
        h('button', { class: 'btn secondary small', type: 'button', onclick: () => addToPlan(R.due, due) }, 'ضيفها للخطة')));
    }
  } else {
    rows.push(h('p', { class: 'row-note' }, 'حط التاريخ مشان نحسب لك موعد الزكاة الجاية بالهجري، ونذكّرك قبلها.'));
  }
  return group('الحول', rows);
}

function addToPlan(amountUSD, due) {
  const month = due.slice(0, 7);
  store.update((s) => {
    const existing = s.planItems.find((i) => i.zakatFor === due && i.status !== 'bought');
    if (existing) { existing.amount = Math.round(amountUSD * 100) / 100; return; }
    s.planItems.push({
      id: uid('item'), kind: 'commitment', name: 'زكاة المال', icon: '🤲', amount: Math.round(amountUSD * 100) / 100,
      currency: 'USD', priority: null, month: month < currentMonth() ? currentMonth() : month, note: '', status: 'planned',
      createdAt: Date.now(), zakatFor: due,
    });
  });
  toast(`انضافت الزكاة كالتزام بـ ${monthLabel(due.slice(0, 7))}`);
}
