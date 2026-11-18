// المال: المحافظ وأسعار الصرف، ومنها للديون والزكاة
import { h, icon, toast, fill, segmented, haptic, openPicker, dateButton } from '../ui.js';
import { badge } from '../icons.js';
import { store, uid } from '../store.js';
import { CURRENCIES, CODES, fmt, toUSD, rateText, parseAmount } from '../money.js';
import { relTime, currentMonth, monthLabel, longDate, hijriDate, daysUntil, daysText, shortDate } from '../dates.js';
import { accountBalances, netWorth, debtRemaining, debtPaid } from '../calc.js';
import { group, emptyState, bar } from '../components.js';
import { openAccountForm, openTxForm, openRateForm, live } from '../forms.js';
import { refreshRates } from '../rates.js';
import { openDebtForm } from '../debts.js';
import { computeZakat, zakatDueDate, hawlStatus, refreshMetals, openMetalForm, openZakatPayForm, NISAB_GRAMS, KARATS, ZAKAT_RATE, LUNAR_YEAR_DAYS } from '../zakat.js';

const CUR_TINT = { USD: 'mint', TRY: 'coral', SYP: 'gold' };

export const moneyActions = {
  debts: () => h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'دين جديد', onclick: () => openDebtForm(null, 'theyOwe') }, icon('plus', 20)),
};

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

function hubHead(iconName, tint, title, sub, end, onclick) {
  return h('button', { class: 'hub-card', type: 'button', onclick: () => { haptic('tap'); onclick(); } },
    badge(iconName, tint, 46),
    h('span', { class: 'row-main' }, h('b', null, title), h('span', { class: 'row-sub wrap' }, sub)),
    end ? h('span', { class: 'hub-val' }, end) : null,
    h('span', { class: 'chev' }, icon('chevL', 20)));
}

/* ======================= لوحة المال ======================= */
export function renderMoneyHub({ open }) {
  const st = store.state;
  const bal = accountBalances(st);
  const nw = netWorth(st);
  const dt = debtTotals(st);
  const hasDebts = dt.theyOwe > 0.005 || dt.iOwe > 0.005;

  const wallets = h('div', { class: 'wallets', role: 'list', 'aria-label': 'المحافظ' },
    st.accounts.map((a) => {
      const v = bal.get(a.id) || 0;
      const usd = toUSD(st, v, a.currency);
      return h('button', { class: 'wallet', type: 'button', role: 'listitem', style: { '--tint': `var(--x, ${tintOf(a.currency)})` }, onclick: () => openAccountForm(a) },
        h('div', { class: 'w-top' },
          h('span', { class: 'w-name' }, a.name),
          badge(a.currency === 'USD' ? 'cash' : a.currency === 'TRY' ? 'coins' : 'bank', CUR_TINT[a.currency] || 'slate', 32)),
        h('div', null,
          h('div', { class: `w-bal ${v < 0 ? 'bad' : ''}`.trim() }, fmt(v, a.currency)),
          h('div', { class: 'w-sub' }, a.currency === 'USD' ? (st.settings.defaultAccountId === a.id ? 'الافتراضية' : 'دولار') : (Number.isFinite(usd) ? `≈ ${fmt(usd)}` : 'ما في سعر صرف'))));
    }),
    h('button', { class: 'wallet add', type: 'button', role: 'listitem', onclick: () => openAccountForm() }, icon('plus', 26), h('span', null, 'محفظة جديدة')));

  // الزكاة
  const zDue = zakatDueDate(st);
  const Z = computeZakat(st);
  let zakatSub = 'احسب زكاتك من مالك وذهبك';
  let zakatEnd = null;
  if (!Z.priceMissing) {
    if (Z.due > 0) { zakatSub = zDue ? `الحول ${daysUntil(zDue) >= 0 ? `بعد ${daysText(daysUntil(zDue))}` : 'مستحق'}` : 'فوق النصاب'; zakatEnd = fmt(Z.due); }
    else zakatSub = 'مالك أقل من النصاب هلّق';
  }

  const rateRows = CODES.filter((c) => c !== 'USD').map((c) => {
    const r = st.rates[c] || { mode: 'manual' };
    const when = r.at ? `آخر تحديث ${relTime(r.at)}` : 'ما في سعر لسّا';
    return h('button', { class: 'row', type: 'button', onclick: () => openRateForm(c) },
      badge(c === 'TRY' ? 'coins' : 'bank', CUR_TINT[c], 40),
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
        if (!res.ok) toast(res.reason === 'offline' ? 'ما في نت هلّق.' : 'ما قدرت جيب الأسعار. جرّب بعدين.', { kind: 'warn' });
        else toast(res.updated.length ? 'تحدّثت الأسعار' : 'ما في عملة على الوضع التلقائي.');
        if (document.contains(btn)) btn.disabled = false;
      },
    }, icon('refresh', 18), 'حدّث الأسعار')));

  return [
    h('header', { class: 'page-head' }, h('h1', null, 'مالك')),
    h('section', { class: 'worth' },
      h('p', { class: 'muted' }, 'مجموع اللي معك بالدولار'),
      h('p', { class: 'worth-value' }, fmt(nw.usd)),
      hasDebts ? h('p', { class: 'muted' }, `ومع الديون ${fmt(nw.usd + dt.theyOwe - dt.iOwe)}`) : null,
      nw.missing.length ? h('p', { class: 'muted bad' }, `في عملة ما إلها سعر صرف، فما انحسبت.`) : null),
    wallets,
    h('div', { class: 'section-actions' },
      h('button', { class: 'btn secondary small', type: 'button', onclick: () => openTxForm({ type: 'transfer' }) }, icon('swap', 18), 'تحويل أو تصريف')),
    h('section', { class: 'group' },
      hubHead('people', 'pink', 'الديون', hasDebts ? `إلك ${fmt(dt.theyOwe)}، وعليك ${fmt(dt.iOwe)}` : 'سجّل اللي إلك عند الناس واللي عليك', null, () => open('money/debts'))),
    h('section', { class: 'group' },
      hubHead('moon', 'gold', 'الزكاة', zakatSub, zakatEnd, () => open('money/zakat'))),
    group('سعر الدولار الواحد', rateRows),
  ];
}

function tintOf(cur) {
  return { USD: '#3DD39A', TRY: '#EC7A66', SYP: '#D9B45A' }[cur] || '#8C95AA';
}

/* ======================= الديون ======================= */
export function renderDebts() {
  const st = store.state;
  const cur = currentMonth();
  const dt = debtTotals(st);
  const open = st.debts.filter((d) => debtRemaining(d) > 0.005).sort((a, b) => (a.due || '9999-99').localeCompare(b.due || '9999-99'));
  const theyOwe = open.filter((d) => d.direction === 'theyOwe');
  const iOwe = open.filter((d) => d.direction === 'iOwe');
  const closed = st.debts.filter((d) => debtRemaining(d) <= 0.005).slice(-5).reverse();
  const actions = h('div', { class: 'section-actions' },
    h('button', { class: 'btn small', type: 'button', onclick: () => openDebtForm(null, 'theyOwe') }, icon('arrowUp', 18), 'دين إلك'),
    h('button', { class: 'btn secondary small', type: 'button', onclick: () => openDebtForm(null, 'iOwe') }, icon('arrowDown', 18), 'دين عليك'));
  if (!st.debts.length) return [actions, emptyState('people', 'سجّل المصاري اللي إلك عند الناس، واللي عليك. إذا حطيت موعد للدين، بيدخل بخطة السنة لحاله.')];

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
      badge(debt.direction === 'theyOwe' ? 'arrowUp' : 'arrowDown', rem <= 0.005 ? 'slate' : debt.direction === 'theyOwe' ? 'mint' : 'coral', 42),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, debt.person), h('span', { class: `row-sub wrap ${cls}`.trim() }, sub)),
      h('span', { class: 'row-end' },
        h('span', { class: `amount ${debt.direction === 'theyOwe' && rem > 0.005 ? 'income' : ''}`.trim() }, fmt(rem > 0.005 ? rem : debt.amount, debt.currency)),
        debt.currency !== 'USD' && rem > 0.005 && Number.isFinite(usd) ? h('span', { class: 'row-sub' }, `≈ ${fmt(usd)}`) : null));
  };
  return [
    actions,
    h('div', { class: 'duo' },
      h('div', null, h('small', null, 'إلك عند الناس'), h('b', { class: 'amount income' }, fmt(dt.theyOwe))),
      h('div', null, h('small', null, 'عليك للناس'), h('b', { class: 'amount' }, fmt(dt.iOwe)))),
    theyOwe.length ? group('إلك عند الناس', theyOwe.map(row)) : null,
    iOwe.length ? group('عليك للناس', iOwe.map(row)) : null,
    closed.length ? group('خلصت', closed.map(row)) : null,
  ];
}

/* ======================= الزكاة ======================= */
export function renderZakat() {
  const st = store.state;
  const z = st.zakat;
  refreshMetals().catch(() => {});
  // الأرقام المحسوبة بتتحدّث لحالها، والحقول ما بتنعاد رسمها (مشان ما يسكّر الكيبورد)
  const result = h('section');
  const breakdown = h('section', { class: 'group' });
  const refresh = () => {
    const s = store.state;
    const R = computeZakat(s);
    fill(result, resultContent(R));
    fill(breakdown, breakdownContent(s, R));
  };
  refresh();
  const commit = (mutator) => { store.update(mutator, { silent: true }); refresh(); };
  const numInput = (value, label, key) => h('input', {
    type: 'text', inputmode: 'decimal', class: 'inline-input', value: value ? String(value) : '', placeholder: '0', 'aria-label': label,
    onchange: (e) => { const n = parseAmount(e.target.value); commit((s) => { s.zakat[key] = n > 0 ? n : 0; }); },
  });
  const toggle = (label, key) => h('label', { class: 'switch-row' },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, label)),
    h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: Boolean(z[key]), onchange: (e) => { haptic('select'); commit((s) => { s.zakat[key] = e.target.checked; }); } }), h('i')));

  const inputs = group('أموال تانية', [
    h('div', { class: 'row' },
      badge('ring', 'gold', 40),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'ذهب (غرام)'), h('span', { class: 'row-sub' }, 'للادخار أو التجارة')),
      live((refresh) => h('button', {
        type: 'button', class: 'chip', 'aria-label': 'عيار الذهب',
        onclick: () => openPicker({
          title: 'عيار الذهب', value: Number(store.state.zakat.goldKarat || 24),
          options: KARATS.map((k) => ({ value: k, label: `عيار ${k}`, sub: k === 24 ? 'صافي' : `${Math.round((k / 24) * 1000) / 10}% ذهب` })),
          onPick: (v) => { commit((s) => { s.zakat.goldKarat = v; }); refresh(); },
        }),
      }, `عيار ${store.state.zakat.goldKarat || 24}`, icon('chevD', 14))),
      numInput(z.goldGrams, 'غرامات الذهب', 'goldGrams')),
    h('div', { class: 'row' }, badge('coins', 'slate', 40), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'فضة (غرام)')), numInput(z.silverGrams, 'غرامات الفضة', 'silverGrams')),
    h('div', { class: 'row' }, badge('trend', 'blue', 40), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'أسهم واستثمارات'), h('span', { class: 'row-sub' }, 'قيمتها اليوم')), h('span', { class: 'inline-money' }, '$', numInput(z.stocks, 'قيمة الأسهم بالدولار', 'stocks'))),
    h('div', { class: 'row' }, badge('store', 'amber', 40), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'أموال تانية'), h('span', { class: 'row-sub' }, 'بضاعة تجارة، مصاري برا المحافظ')), h('span', { class: 'inline-money' }, '$', numInput(z.other, 'أموال تانية بالدولار', 'other'))),
    toggle('احسب الديون اللي إلك (المرجو رجوعها)', 'includeReceivables'),
    toggle('انقص الديون اللي عليك', 'deductPayables'),
  ]);
  return [result, breakdown, inputs, nisabGroup(st), hawlGroup(st),
    h('p', { class: 'section-note' }, 'هالحساب مساعد وتقريبي. بالحالات الخاصة متل ذهب الزينة، والأسهم طويلة الأجل، والديون الصعب رجوعها، اسأل أهل العلم.')];
}

function resultContent(R) {
  if (R.priceMissing) {
    return [h('div', { class: 'banner' }, h('span', { class: 'banner-ic' }, icon('info', 22)),
      h('p', null, 'لازم سعر غرام الذهب أو الفضة مشان ينحسب النصاب. بيجي تلقائياً من النت، أو حطه بإيدك من «النصاب» تحت.'))];
  }
  const above = R.due > 0;
  return [h('div', { class: 'zakat-hero' },
    h('small', null, above ? 'زكاتك إذا حال الحول' : 'مالك هلّق'),
    h('strong', null, above ? fmt(R.due) : 'أقل من النصاب'),
    h('p', null, above
      ? `${Math.round(ZAKAT_RATE * 1000) / 10}% من ${fmt(R.total)}. النصاب ${fmt(R.nisab)}.`
      : `مجموع مالك الزكوي ${fmt(R.total)}، والنصاب ${fmt(R.nisab)}. ما عليك زكاة هلّق.`))];
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
      badge(kind === 'gold' ? 'ring' : 'coins', kind === 'gold' ? 'gold' : 'slate', 40),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, `غرام ${label} الصافي`), h('span', { class: 'row-sub' }, when)),
      h('span', { class: 'row-end' }, h('span', { class: `amount ${m.perGram ? '' : 'warn'}`.trim() }, m.perGram ? fmt(m.perGram) : 'حدده')));
  };
  const nisabOf = (kind) => (st.metals[kind].perGram ? fmt(NISAB_GRAMS[kind] * st.metals[kind].perGram) : '—');
  return group('النصاب', [
    h('div', { class: 'row-block' },
      segmented([{ value: 'gold', label: `ذهب ${NISAB_GRAMS.gold} غ` }, { value: 'silver', label: `فضة ${NISAB_GRAMS.silver} غ` }], z.basis, (v) => store.update((s) => { s.zakat.basis = v; }), 'النصاب'),
      h('p', { class: 'field-hint' }, `بالذهب ${nisabOf('gold')}، وبالفضة ${nisabOf('silver')}. في علماء بيعتمدوا الفضة لأنها أنفع للفقير، وعلماء بيعتمدوا الذهب. اختار حسب الفتوى اللي بتتبعها.`)),
    metalRow('gold', 'الذهب'),
    metalRow('silver', 'الفضة'),
  ]);
}

// رسم صغير لمالك الزكوي مع خط النصاب
function hawlSpark(series, nisab) {
  if (series.length < 3) return null;
  const step = Math.max(1, Math.ceil(series.length / 90));
  const pts = series.filter((_, i) => i % step === 0 || i === series.length - 1);
  const max = Math.max(nisab * 1.15, ...pts.map((p) => p.w));
  const min = Math.min(0, ...pts.map((p) => p.w));
  const W = 300;
  const H = 64;
  const y = (v) => (H - 4) - ((v - min) / (max - min || 1)) * (H - 8);
  const x = (i) => (i / (pts.length - 1)) * W;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'hawl-spark');
  svg.setAttribute('aria-hidden', 'true');
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.w).toFixed(1)}`).join(' ');
  svg.innerHTML = `<line x1="0" x2="${W}" y1="${y(nisab).toFixed(1)}" y2="${y(nisab).toFixed(1)}" class="nisab-line" vector-effect="non-scaling-stroke"/>
    <polyline points="${line}" class="wealth-line" vector-effect="non-scaling-stroke"/>`;
  return svg;
}

function hawlGroup(st) {
  const z = st.zakat;
  const H = hawlStatus(st);
  const R = H.Z;
  const rows = [];
  if (!H.known) {
    rows.push(h('p', { class: 'row-note' }, 'لازم سعر غرام الذهب أو الفضة مشان نعرف إيمتى وصل مالك للنصاب.'));
  } else if (H.above && H.due) {
    const left = daysUntil(H.due);
    let when;
    if (left > 0) when = `بعد ${daysText(left)}`;
    else if (left === 0) when = 'اليوم';
    else when = `مستحقة من ${daysText(-left)}`;
    rows.push(h('div', { class: 'row' },
      badge('calendar', 'gold', 40),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, `الحول الجاي ${when}`), h('span', { class: 'row-sub wrap' }, `${longDate(H.due)} ${H.due.slice(0, 4)}، ${hijriDate(H.due)}`))));
    const elapsed = Math.max(0, Math.min(LUNAR_YEAR_DAYS, LUNAR_YEAR_DAYS - left));
    let since;
    if (H.reason === 'manual') since = `بلّش الحول ${shortDate(H.hawlStart)}، حسب التاريخ اللي حطيته.`;
    else if (H.reason === 'fromStart') since = `مالك فوق النصاب من أول ما بلّشت تسجّل (${shortDate(H.start)}). إذا وصل للنصاب قبل هيك، حط التاريخ تحت.`;
    else since = `مالك وصل للنصاب ${shortDate(H.hawlStart)}، ومن وقتها ما نزل تحته.`;
    rows.push(h('div', { class: 'row-block' },
      h('div', { class: 'hawl-meta' }, h('span', null, `مضى ${daysText(elapsed)}`), h('span', null, `من ${LUNAR_YEAR_DAYS} يوم`)),
      bar(elapsed / LUNAR_YEAR_DAYS, 'gold'),
      h('p', { class: 'field-hint' }, `${since} إذا نزل مالك تحت النصاب قبل الموعد، الحول بينلغى وبيبلّش من جديد لما يرجع يوصل.`)));
    if (R.due > 0) {
      rows.push(h('div', { class: 'row-actions' },
        h('button', { class: 'btn gold small', type: 'button', onclick: () => openZakatPayForm(R.due, H.due) }, icon('check', 18), 'دفعت الزكاة'),
        h('button', { class: 'btn secondary small', type: 'button', onclick: () => addToPlan(R.due, H.due) }, icon('plan', 18), 'ضيفها للخطة')));
    }
  } else {
    rows.push(h('div', { class: 'row' },
      badge('moon', 'slate', 40),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, 'مالك تحت النصاب هلّق'),
        h('span', { class: 'row-sub wrap' }, H.droppedOn
          ? `نزل تحت النصاب ${shortDate(H.droppedOn)}، فانلغى الحول. أول ما يرجع يوصل، بيبلّش حول جديد لحاله.`
          : 'أول ما يوصل مالك للنصاب، بيبلّش الحول لحاله.'))));
  }
  if (H.manualVoided) rows.push(h('p', { class: 'row-note warn-note' }, `التاريخ اللي حطيته (${shortDate(z.lastDate)}) ما عاد بينحسب، لأن مالك نزل تحت النصاب بعده.`));
  if (H.known) {
    const spark = hawlSpark(H.series, R.nisab);
    if (spark) {
      rows.push(h('div', { class: 'row-block' }, spark,
        h('div', { class: 'hawl-meta' }, h('span', null, shortDate(H.start)), h('span', { class: 'nisab-key' }, h('i'), 'النصاب'), h('span', null, 'اليوم'))));
    }
  }
  rows.push(h('div', { class: 'row-block' },
    h('div', { class: 'field' },
      h('span', { class: 'field-label' }, 'بلّش الحول قبل ما تسجّل بالتطبيق؟ (اختياري)'),
      h('div', { class: 'date-clear' },
        dateButton({ value: z.lastDate || '', placeholder: 'منحسبه لحاله', onChange: (v) => store.update((s) => { s.zakat.lastDate = v || null; }) }),
        z.lastDate ? h('button', {
          class: 'btn secondary small', type: 'button',
          onclick: () => {
            const prev = z.lastDate;
            store.update((s) => { s.zakat.lastDate = null; });
            toast('انمسح التاريخ، وصار الحول تلقائي', { action: 'تراجع', onAction: () => store.update((s) => { s.zakat.lastDate = prev; }) });
          },
        }, icon('close', 16), 'امسح') : null),
      h('span', { class: 'field-hint' }, z.lastDate
        ? `${hijriDate(z.lastDate)}. إذا مسحته، منحسب الحول من مالك يوم بيوم.`
        : 'حط تاريخ آخر زكاة دفعتها، أو اليوم اللي وصل فيه مالك للنصاب قبل ما تبلّش. غير هيك منحسبه لحاله.'))));
  return group('الحول', rows);
}

function addToPlan(amountUSD, due) {
  const month = due.slice(0, 7);
  store.update((s) => {
    const existing = s.planItems.find((i) => i.zakatFor === due && i.status !== 'bought');
    if (existing) { existing.amount = Math.round(amountUSD * 100) / 100; return; }
    s.planItems.push({
      id: uid('item'), kind: 'commitment', name: 'زكاة المال', icon: 'moon', amount: Math.round(amountUSD * 100) / 100,
      currency: 'USD', priority: null, month: month < currentMonth() ? currentMonth() : month, note: '', status: 'planned',
      createdAt: Date.now(), zakatFor: due,
    });
  });
  toast(`انضافت الزكاة كالتزام بـ ${monthLabel(due.slice(0, 7))}`);
}
