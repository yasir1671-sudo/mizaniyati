// الخطة: الشهر، السنة (12 شهر)، المشتريات والالتزامات، الأهداف
import { h, icon, fill, segmented, openSheet } from '../ui.js';
import { store } from '../store.js';
import { CURRENCIES, fmt, parseAmount, toUSD } from '../money.js';
import { currentMonth, monthLabel } from '../dates.js';
import { plan, expectedIncome } from '../calc.js';
import { buildPlan, goalsSummary, emergencySuggestion, scheduleText, statusClass } from '../planner.js';
import { group, bar } from '../components.js';
import { openSourceForm, openItemForm, openGoalForm, openDepositForm, openWhatIf, INCOME_KINDS } from '../forms.js';

const SECTIONS = [
  { value: 'month', label: 'الشهر' },
  { value: 'year', label: 'السنة' },
  { value: 'items', label: 'المشتريات' },
  { value: 'goals', label: 'الأهداف' },
];
let section = 'month';
export function setPlanSection(s) { section = s; }

export function renderPlan({ go }) {
  const views = { month: monthSection, year: yearSection, items: itemsSection, goals: goalsSection };
  return h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', null, 'الخطة')),
    h('div', { class: 'section-tabs' }, segmented(SECTIONS, section, (v) => { section = v; go('plan'); }, 'أقسام الخطة')),
    views[section]());
}

function line(label, value, cls = '') {
  return h('div', { class: `row ${cls}`.trim() },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, label)),
    h('span', { class: 'row-end' }, h('span', { class: 'amount' }, value)));
}

/* ======================= الشهر ======================= */
function monthSection() {
  const st = store.state;
  const key = currentMonth();
  // الحقول هون بتنحفظ بصمت (بدون إعادة رسم الصفحة) مشان ما يسكّر الكيبورد
  const summary = h('section', { class: 'group' });
  const refresh = () => fill(summary, summaryContent(store.state, key));
  refresh();
  return [
    h('p', { class: 'section-note' }, `${monthLabel(key)}. الدخل والميزانية بيتكرروا كل شهر.`),
    summary,
    incomeGroup(st, key),
    savingsGroup(st, key, refresh),
    budgetGroup(st, refresh),
  ];
}

function summaryContent(st, key) {
  const p = plan(st, key);
  const r0 = buildPlan(st).rows[0];
  const planned = r0.commitments + r0.purchases;
  const missing = expectedIncome(st, key).missing;
  const rows = [
    line('الدخل المتوقع', fmt(p.income)),
    r0.debtIn > 0.005 ? line('ديون راجعة إلك', fmt(r0.debtIn, 'USD', { sign: true })) : null,
    line('ناقص الادخار', fmt(-p.savings)),
    line('ناقص المصاريف الثابتة', fmt(-p.fixed)),
    line('ناقص ميزانية المصروف اليومي', fmt(-p.flex)),
    planned > 0.005 ? line('ناقص التزامات ومشتريات الخطة', fmt(-planned)) : null,
    r0.debtOut > 0.005 ? line('ناقص ديون لازم تسدّها', fmt(-r0.debtOut)) : null,
    line(r0.free < 0 ? 'ناقصك' : 'بيبقى بلا تخصيص', fmt(Math.abs(r0.free)), `total ${r0.free < 0 ? 'bad' : ''}`),
  ];
  if (missing.length) rows.push(h('p', { class: 'row-note bad' }, `في دخل بـ ${missing.map((c) => CURRENCIES[c].name).join(' و')} ما انحسب لأن ما في سعر صرف.`));
  if (r0.free < 0) rows.push(h('p', { class: 'row-note bad' }, 'خطتك أكبر من دخلك. خفّف الادخار أو ميزانية فئة، أو أجّل شي من المشتريات.'));
  else if (r0.free > 0 && p.income > 0) rows.push(h('p', { class: 'row-note' }, 'هالمبلغ بيتراكم وبتنشترى منه أغراض قائمة المشتريات بالشهور الجاية.'));
  return [h('div', { class: 'group-head' }, h('h2', null, 'حساب الشهر')), h('div', { class: 'rows' }, rows)];
}

function incomeGroup(st, key) {
  const rows = st.incomeSources.map((s) => {
    const k = INCOME_KINDS[s.kind] || INCOME_KINDS.other;
    const usd = toUSD(st, s.amount, s.currency);
    const when = s.schedule === 'monthly' ? 'كل شهر' : `مرة وحدة، ${monthLabel(s.month)}`;
    const inactive = s.schedule === 'once' && s.month !== key;
    return h('button', { class: 'row', type: 'button', onclick: () => openSourceForm(s) },
      h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, k.icon),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, s.name),
        h('span', { class: 'row-sub' }, inactive ? `${when}، مو هالشهر` : when)),
      h('span', { class: 'row-end' },
        h('span', { class: 'amount' }, fmt(s.amount, s.currency)),
        s.currency !== 'USD' ? h('span', { class: 'row-sub' }, Number.isFinite(usd) ? `≈ ${fmt(usd)}` : 'ما في سعر') : null));
  });
  if (!rows.length) rows.push(h('p', { class: 'row-note' }, 'ضيف راتبك، ودخل الأسهم بمعدل متحفّظ، وأي مبلغ مستني يرجعلك.'));
  rows.push(h('div', { class: 'row-actions' },
    h('button', { class: 'btn secondary small', type: 'button', onclick: () => openSourceForm() }, icon('plus', 18), 'مصدر دخل')));
  return group('مصادر الدخل', rows);
}

function moneyInput(value, label, onCommit) {
  const input = h('input', {
    type: 'text', inputmode: 'decimal', class: 'inline-input', value: value ? String(value) : '', placeholder: '0',
    'aria-label': label, onchange: (e) => onCommit(parseAmount(e.target.value)),
  });
  return { input, wrap: h('span', { class: 'inline-money' }, '$', input) };
}

function savingsGroup(st, key, refresh) {
  const p = plan(st, key);
  const commit = (n) => {
    store.update((s) => { s.settings.savingsTarget = n > 0 ? n : 0; }, { silent: true });
    refresh();
  };
  const { input, wrap } = moneyInput(st.settings.savingsTarget, 'مبلغ الادخار الشهري بالدولار', commit);
  const rows = [
    h('div', { class: 'row' },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, 'بشيل كل شهر'),
        h('span', { class: 'row-sub' }, 'شيله أول ما يوصل الدخل، قبل أي مصروف.')),
      wrap),
  ];
  if (p.income > 0) {
    rows.push(h('div', { class: 'row chips-row' },
      h('span', { class: 'row-sub' }, 'اقتراح:'),
      [10, 20, 30].map((pct) => {
        const v = Math.round((p.income * pct) / 100);
        return h('button', { class: 'chip', type: 'button', onclick: () => { input.value = String(v); commit(v); } }, `${pct}% يعني ${fmt(v)}`);
      })));
  }
  return group('الادخار الشهري', rows);
}

function budgetGroup(st, refresh) {
  const rows = st.categories.filter((c) => c.type === 'expense').map((c) => {
    const { wrap } = moneyInput(c.budget, `ميزانية ${c.name} بالدولار`, (n) => {
      store.update((s) => {
        const x = s.categories.find((k) => k.id === c.id);
        if (x) x.budget = n > 0 ? n : 0;
      }, { silent: true });
      refresh();
    });
    return h('div', { class: 'row' },
      h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, c.icon),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, c.name),
        c.fixed ? h('span', { class: 'row-sub' }, 'ثابت، ما بيدخل بمصروف اليوم') : null),
      wrap);
  });
  rows.push(h('p', { class: 'row-note' }, 'المصاريف الثابتة متل الإيجار والفواتير بتنحسب لحالها. الباقي بيتوزع على أيام الشهر، وبيطلع لك بالرئيسية كمصروف اليوم.'));
  return group('ميزانية الفئات بالدولار', rows);
}

/* ======================= السنة ======================= */
const LEGEND = [
  ['s-living', 'المعيشة'],
  ['s-save', 'الادخار'],
  ['s-commit', 'التزامات'],
  ['s-buy', 'مشتريات'],
  ['s-free', 'فائض'],
];
const ENTRY_KIND = {
  want: 'مشتريات مخططة', commitment: 'التزام', bought: 'انشترى',
  debtIn: 'دين راجع إلك', debtOut: 'دين لازم تسدّه', debtDone: 'دفعة دين صارت',
};

function yearSection() {
  const st = store.state;
  const P = buildPlan(st);
  const neg = P.rows.find((r) => r.balance < -0.5);
  const startInput = h('input', {
    type: 'text', inputmode: 'decimal', class: 'inline-input', value: st.settings.plannerStart ? String(st.settings.plannerStart) : '',
    placeholder: '0', 'aria-label': 'مصاري متوفرة هلّق للمشتريات بالدولار',
    onchange: (e) => {
      const n = parseAmount(e.target.value);
      store.update((s) => { s.settings.plannerStart = n > 0 ? n : 0; });
    },
  });

  const out = [
    h('div', { class: 'section-actions' },
      h('button', { class: 'btn secondary small', type: 'button', onclick: () => openWhatIf() }, 'شو لو اشتريت شي كبير؟')),
  ];
  if (P.totals.income <= 0) {
    out.push(h('div', { class: 'banner' }, h('p', null, 'ضيف دخلك بقسم «الشهر» أول، مشان تنحسب السنة.')));
  }
  if (neg) {
    out.push(h('div', { class: 'banner warn-banner' },
      h('p', null, `بـ ${monthLabel(neg.month)} رصيد خطتك بيصير ${fmt(neg.balance)}. أجّل التزام أو خفّف المصاريف.`)));
  }
  out.push(group('خلال 12 شهر', [
    line('الدخل المتوقع', fmt(P.totals.income)),
    line('مصاريف المعيشة', fmt(-P.totals.living)),
    line('الادخار', fmt(-P.totals.savings)),
    line('الالتزامات والمشتريات', fmt(-P.totals.spend)),
    line('فائض حر آخر السنة', fmt(P.endBalance), `total ${P.endBalance < 0 ? 'bad' : ''}`),
    h('div', { class: 'row' },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, 'معك هلّق للمشتريات'),
        h('span', { class: 'row-sub' }, 'بتنضاف لفائض أول شهر')),
      h('span', { class: 'inline-money' }, '$', startInput)),
  ]));
  out.push(h('section', { class: 'group' },
    h('div', { class: 'group-head' }, h('h2', null, 'شهر بشهر')),
    h('div', { class: 'legend', role: 'list', 'aria-label': 'دليل الألوان' },
      LEGEND.map(([cls, label]) => h('span', { role: 'listitem' }, h('i', { class: cls, 'aria-hidden': 'true' }), label))),
    h('div', { class: 'rows' }, P.rows.map((r, i) => monthRow(r, i)))));
  return out;
}

// شهر صرف أكتر من دخله بس مغطّى من فائض الشهور اللي قبله: مو مشكلة، منقول «من المتراكم»
function freeLabel(r) {
  if (r.free >= -0.005) return { label: 'فائض', text: `فائض ${fmt(r.free)}`, cls: '' };
  if (r.balance >= -0.5) return { label: 'من المتراكم', text: `من المتراكم ${fmt(-r.free)}`, cls: '' };
  return { label: 'ناقص', text: `ناقص ${fmt(-r.free)}`, cls: 'over' };
}

function monthRow(r, i) {
  const used = r.living + r.savings + r.commitments + r.debtOut + r.purchases;
  const seg = (cls, v) => (v > 0.005 ? h('i', { class: cls, style: { flexGrow: String(v) } }) : null);
  const f = freeLabel(r);
  return h('button', { class: 'row month-row', type: 'button', onclick: () => openMonthSheet(r) },
    h('span', { class: 'mr-top' },
      h('span', { class: 'row-title' }, i === 0 ? `${monthLabel(r.month)}، هالشهر` : monthLabel(r.month)),
      h('span', { class: `amount ${f.cls}`.trim() }, f.text)),
    h('span', { class: 'stack', 'aria-hidden': 'true' },
      seg('s-living', r.living), seg('s-save', r.savings), seg('s-commit', r.commitments + r.debtOut), seg('s-buy', r.purchases),
      seg('s-free', Math.max(0, r.income + r.debtIn - used))),
    r.entries.length
      ? h('span', { class: 'entry-chips' }, r.entries.map((e) => h('span', { class: `entry ${e.kind}` },
        `${e.it.icon || ''} ${e.it.name} ${fmt(e.usd, 'USD', { sign: e.kind === 'debtIn' || e.inflow })}`)))
      : null,
    h('span', { class: `row-sub ${r.balance < -0.5 ? 'bad' : ''}`.trim() }, `معك بآخر الشهر ${fmt(r.balance)}`));
}

function openMonthSheet(r) {
  openSheet(monthLabel(r.month), (body) => {
    fill(body, [
      h('div', { class: 'rows sheet-rows' },
        line('الدخل المتوقع', fmt(r.income)),
        r.debtIn > 0.005 ? line('ديون راجعة إلك', fmt(r.debtIn, 'USD', { sign: true })) : null,
        line('مصاريف المعيشة', fmt(-r.living)),
        line('الادخار', fmt(-r.savings)),
        line('الالتزامات', fmt(-r.commitments)),
        r.debtOut > 0.005 ? line('ديون لازم تسدّها', fmt(-r.debtOut)) : null,
        line('المشتريات', fmt(-r.purchases)),
        line(freeLabel(r).label, fmt(Math.abs(r.free)), 'total'),
        line('معك بآخر الشهر', fmt(r.balance))),
      r.entries.length
        ? h('div', { class: 'rows sheet-rows' }, r.entries.map((e) => h('div', { class: 'row' },
          h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, e.it.icon || '🛍️'),
          h('span', { class: 'row-main' },
            h('span', { class: 'row-title' }, e.it.name),
            h('span', { class: 'row-sub' }, ENTRY_KIND[e.kind])),
          h('span', { class: 'row-end' }, h('span', { class: 'amount' }, fmt(e.usd))))))
        : h('p', { class: 'hint' }, 'ما في مشتريات أو التزامات بهالشهر.'),
    ]);
  });
}

/* ======================= المشتريات ======================= */
function itemsSection() {
  const st = store.state;
  const P = buildPlan(st);
  const actions = h('div', { class: 'section-actions' },
    h('button', { class: 'btn small', type: 'button', onclick: () => openItemForm(null, 'want') }, icon('plus', 18), 'غرض'),
    h('button', { class: 'btn secondary small', type: 'button', onclick: () => openItemForm(null, 'commitment') }, icon('plus', 18), 'التزام'),
    h('button', { class: 'btn secondary small', type: 'button', onclick: () => openWhatIf() }, 'شو لو؟'));

  if (!st.planItems.length) {
    return [actions, h('div', { class: 'empty' },
      h('p', null, 'ضيف الأغراض اللي ناوي تشتريها والالتزامات اللي لازم تدفعها. الخطة بتوزعها على الشهور حسب الفائض، والمهم أول.'),
      h('button', { class: 'btn', type: 'button', onclick: () => openItemForm(null, 'want') }, 'ضيف أول غرض'))];
  }

  const planned = st.planItems.filter((i) => i.status !== 'bought');
  const monthOf = (it) => P.schedule.get(it.id)?.month || '9999-99';
  const wants = planned.filter((i) => i.kind === 'want')
    .sort((a, b) => monthOf(a).localeCompare(monthOf(b)) || (a.priority || 2) - (b.priority || 2));
  const commitments = planned.filter((i) => i.kind === 'commitment')
    .sort((a, b) => (a.month || '').localeCompare(b.month || ''));
  const bought = st.planItems.filter((i) => i.status === 'bought')
    .sort((a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || '')).slice(0, 8);

  return [
    actions,
    wants.length ? group('قائمة المشتريات', wants.map((it) => itemRow(st, it, P))) : null,
    commitments.length ? group('الالتزامات', commitments.map((it) => itemRow(st, it, P))) : null,
    bought.length ? group('خلصت', bought.map((it) => itemRow(st, it, P))) : null,
    h('p', { class: 'section-note' }, 'الالتزامات بتنحسب أول، بعدين الأغراض حسب الأهمية والموعد. كل غرض بينحط بأول شهر بيكفيه فيه الفائض المتراكم.'),
  ];
}

function itemRow(st, it, P) {
  const s = P.schedule.get(it.id);
  const isBought = it.status === 'bought';
  const usd = isBought ? it.boughtUSD : toUSD(st, it.amount, it.currency);
  return h('button', { class: 'row', type: 'button', onclick: () => openItemForm(it) },
    h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, it.icon || '🛍️'),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, it.name, it.kind === 'want' && it.priority === 1 && !isBought ? h('span', { class: 'tag' }, 'مهم') : null),
      h('span', { class: `row-sub wrap ${statusClass(s)}`.trim() }, scheduleText(it, s))),
    h('span', { class: 'row-end' },
      h('span', { class: 'amount' }, isBought ? fmt(usd) : fmt(it.amount, it.currency)),
      !isBought && it.currency !== 'USD' && Number.isFinite(usd) ? h('span', { class: 'row-sub' }, `≈ ${fmt(usd)}`) : null));
}

/* ======================= الأهداف ======================= */
function goalsSection() {
  const st = store.state;
  const G = goalsSummary(st);
  const E = emergencySuggestion(st);
  const out = [];

  if (!st.goals.some((g) => g.kind === 'emergency')) {
    if (E.monthly > 0) {
      out.push(h('div', { class: 'banner col' },
        h('p', null, `صندوق الطوارئ أول: مصاري بتحميك إذا انقطع الدخل. مصاريفك بالشهر ${fmt(E.monthly)}، فالصندوق بين ${fmt(E.three)} و${fmt(E.six)}.`),
        h('div', { class: 'banner-actions' },
          h('button', { class: 'btn small', type: 'button', onclick: () => openGoalForm(null, { kind: 'emergency', name: 'صندوق الطوارئ', icon: '🛟', target: E.three }) }, `3 شهور ${fmt(E.three)}`),
          h('button', { class: 'btn secondary small', type: 'button', onclick: () => openGoalForm(null, { kind: 'emergency', name: 'صندوق الطوارئ', icon: '🛟', target: E.six }) }, `6 شهور ${fmt(E.six)}`))));
    } else {
      out.push(h('div', { class: 'banner' }, h('p', null, 'حدد ميزانيتك بقسم «الشهر» مشان نحسب لك صندوق الطوارئ.')));
    }
  }

  const summary = [
    line('بتشيل كل شهر', fmt(G.savings)),
    line('الأهداف بدها بالشهر', fmt(G.need)),
  ];
  if (G.gap > 0.5) {
    const target = Math.ceil(G.need);
    summary.push(
      h('p', { class: 'row-note bad' }, `ادخارك أقل من اللي بدها ياه أهدافك بـ ${fmt(G.gap)} بالشهر.`),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => store.update((s) => { s.settings.savingsTarget = target; }) }, `خلّي الادخار ${fmt(target)}`)));
  } else {
    summary.push(line('بيبقى للاستثمار بالشهر', fmt(G.invest), 'total'));
  }
  if (G.need > G.capacity + 0.5) {
    summary.push(h('p', { class: 'row-note bad' }, `حتى لو ما اشتريت ولا غرض، دخلك ما بيكفي هالأهداف. لازم توفّر ${fmt(G.need - G.capacity)} بالشهر من المصاريف، أو تأخّر موعد هدف.`));
  } else if (G.invest > 0.5) {
    summary.push(h('p', { class: 'row-note' }, 'بعد ما يكمل صندوق الطوارئ، الباقي من الادخار فيك تستثمره.'));
  }
  out.push(group('الادخار والأهداف', summary));

  const rows = G.list.map(({ g, monthly, done, overdue, remaining }) => {
    let sub;
    if (done) sub = `اكتمل، ${fmt(g.saved)}`;
    else if (overdue) sub = `فات الموعد، باقي ${fmt(remaining)}`;
    else sub = `${fmt(g.saved || 0)} من ${fmt(g.target)}، يعني ${fmt(monthly)} بالشهر لـ ${monthLabel(g.deadline)}`;
    return h('div', { class: 'row goal-row' },
      h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, g.icon || '🎯'),
      h('button', { class: 'goal-main', type: 'button', onclick: () => openGoalForm(g) },
        h('span', { class: 'row-title' }, g.name),
        bar((Number(g.saved) || 0) / (Number(g.target) || 1)),
        h('span', { class: `row-sub ${overdue && !done ? 'warn' : ''}`.trim() }, sub)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `إضافة مبلغ لـ ${g.name}`, onclick: () => openDepositForm(g) }, icon('plus', 18)));
  });
  if (!rows.length) rows.push(h('p', { class: 'row-note' }, 'مثلاً: «بدي أجمع 3000$ خلال سنة». بتحط الهدف وموعده، وهو بيقلك قدّيش لازم تشيل كل شهر.'));
  rows.push(h('div', { class: 'row-actions' },
    h('button', { class: 'btn secondary small', type: 'button', onclick: () => openGoalForm() }, icon('plus', 18), 'هدف جديد')));
  out.push(group('أهدافك', rows));
  return out;
}
