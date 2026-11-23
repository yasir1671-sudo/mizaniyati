// الخطة: لوحة فيها الشهر والسنة والمشتريات والأهداف، وكل وحدة إلها صفحتها
import { h, icon, fill, openSheet, confirmSheet, toast, haptic } from '../ui.js';
import { badge } from '../icons.js';
import { store, catLabel, catIcon, catTint, AUTO_BUDGET_WEIGHTS, AUTO_BUDGET_SHARE } from '../store.js';
import { CURRENCIES, fmt, parseAmount, toUSD } from '../money.js';
import { currentMonth, monthLabel, SHORT_MONTHS, todayISO, daysText, countText } from '../dates.js';
import { plan, expectedIncome, budgetTotals, budgetFor, monthOverride } from '../calc.js';
import { buildPlan, goalsSummary, emergencySuggestion, scheduleText, statusClass } from '../planner.js';
import { group, bar, emptyState, cashCard } from '../components.js';
import { requirePin } from '../pin.js';
import { openSourceForm, openItemForm, openConfirmForm, openReorderSheet, INCOME_KINDS } from '../forms.js';
import { openGoalForm, openDepositForm, movableSurplus, surplusGoal } from '../goals.js';
import { openWhatIf } from '../whatif.js';
import { monthBudgetBanner, openMonthBudgetSheet } from '../monthsheet.js';
import { purchaseSuggestions } from '../advisor.js';
import { suggestionCard } from '../suggest.js';
import { monthMap } from '../month.js';

function line(label, value, cls = '') {
  return h('div', { class: `row ${cls}`.trim() },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, label)),
    h('span', { class: 'row-end' }, h('span', { class: 'amount' }, value)));
}

function hubHead(iconName, tint, title, sub, onclick) {
  return h('button', { class: 'hub-card', type: 'button', onclick: () => { haptic('tap'); onclick(); } },
    badge(iconName, tint, 46),
    h('span', { class: 'row-main' }, h('b', null, title), h('span', { class: 'row-sub wrap' }, sub)),
    h('span', { class: 'chev' }, icon('chevL', 20)));
}

export const planActions = {
  year: () => h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'شو لو؟', onclick: () => openWhatIf() }, icon('bulb', 20)),
  items: () => h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'غرض جديد', onclick: () => openItemForm(null, 'want') }, icon('plus', 20)),
  goals: () => h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'هدف جديد', onclick: () => openGoalForm() }, icon('plus', 20)),
};

/* ======================= لوحة الخطة ======================= */
export function renderPlanHub({ open }) {
  const st = store.state;
  const key = currentMonth();
  const P = buildPlan(st);
  const r0 = P.rows[0];
  const p = plan(st, key);

  // الشهر
  const monthCard = h('section', { class: 'group' },
    hubHead('plan', 'mint', 'ميزانية الشهر', p.income > 0
      ? (r0.free < 0 ? `خطتك أكبر من دخلك بـ ${fmt(-r0.free)}` : `بيبقى بلا تخصيص ${fmt(r0.free)}`)
      : 'حط دخلك وميزانية كل فئة', () => open('plan/month')),
    p.income > 0 ? h('div', { class: 'duo' },
      h('div', null, h('small', null, 'الدخل المتوقع'), h('b', null, fmt(p.income))),
      h('div', null, h('small', null, 'الادخار'), h('b', null, fmt(p.savings)))) : null);

  // السنة
  const maxBal = Math.max(1, ...P.rows.map((r) => Math.abs(r.balance)));
  const yearCard = h('section', { class: 'group' },
    hubHead('trend', 'blue', 'السنة الجاية', P.totals.income > 0 ? `آخر السنة بيبقى معك ${fmt(P.endBalance)} فائض` : 'شوف 12 شهر قدامك', () => open('plan/year')),
    P.totals.income > 0 ? h('div', { class: 'mini-timeline', 'aria-hidden': 'true' },
      P.rows.map((r) => h('i', { class: r.balance < 0 ? 'neg' : '', style: { height: `${Math.max(6, (Math.abs(r.balance) / maxBal) * 100)}%` } }))) : null,
    P.totals.income > 0 ? h('div', { class: 'trend-labels', style: { gridTemplateColumns: 'repeat(12, 1fr)', padding: '4px 16px 12px', fontSize: '10px' }, 'aria-hidden': 'true' },
      P.rows.map((r) => h('span', null, SHORT_MONTHS[Number(r.month.slice(5)) - 1]))) : null);

  // المشتريات
  const planned = st.planItems.filter((i) => i.status !== 'bought');
  const next = planned
    .map((it) => ({ it, s: P.schedule.get(it.id) }))
    .sort((a, b) => (a.s?.month || '9999').localeCompare(b.s?.month || '9999'))
    .slice(0, 3);
  const itemsCard = h('section', { class: 'group' },
    hubHead('bag', 'violet', 'المشتريات والالتزامات', planned.length ? `${planned.length} بالخطة، بتنحط بالشهر اللي بيكفيها` : 'ضيف اللي ناوي تشتريه، والخطة بتختار شهره', () => open('plan/items')),
    next.length ? h('div', { class: 'rows' }, next.map(({ it, s }) => h('button', { class: 'row', type: 'button', onclick: () => openItemForm(it) },
      badge(it.icon, it.kind === 'commitment' ? 'coral' : 'violet', 36),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, it.name), h('span', { class: `row-sub ${statusClass(s)}`.trim() }, scheduleText(it, s))),
      h('span', { class: 'row-end' }, h('span', { class: 'amount' }, fmt(it.amount, it.currency)))))) : null);

  // الأهداف
  const G = goalsSummary(st);
  const goalsCard = h('section', { class: 'group' },
    hubHead('target', 'gold', 'الأهداف والادخار', st.goals.length
      ? (G.gap > 0.5 ? `ادخارك ناقص ${fmt(G.gap)} بالشهر لتوصل لأهدافك` : `ماشي تمام، وبيبقى ${fmt(G.invest)} للاستثمار`)
      : 'صندوق طوارئ، سيارة، عمرة… حط هدف وموعده', () => open('plan/goals')),
    G.list.length ? h('div', { class: 'rows' }, G.list.slice(0, 2).map(({ g }) => h('div', { class: 'row' },
      badge(g.icon, 'gold', 36),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, g.name), bar((g.saved || 0) / (g.target || 1), 'gold')),
      h('span', { class: 'row-end' }, h('span', { class: 'amount' }, `${Math.round(((g.saved || 0) / (g.target || 1)) * 100)}%`))))) : null);

  // الاشتراكات
  const recs = st.recurring || [];
  const billsCard = h('section', { class: 'group' },
    hubHead('receipt', 'teal', 'الاشتراكات والفواتير', recs.length
      ? `${recs.length} بتتكرر كل شهر، وبيذكّرك قبلها بيوم`
      : 'نت، موبايل، اشتراكات… بيذكّرك قبل موعدها بيوم', () => open('plan/bills')));

  // خريطة الشهر
  const M = monthMap(st, todayISO());
  const nextEv = M.days.filter((x) => !x.past && !x.isToday).flatMap((x) => x.events.filter((e) => e.kind !== 'billPaid').map((e) => ({ e, day: x.day })))[0];
  const mapCard = h('section', { class: 'group' },
    hubHead('calendar', 'teal', 'خريطة الشهر', M.runOut
      ? `انتبه: يوم ${M.runOut} ممكن تخلص المصاري اللي بإيدك`
      : nextEv ? `الجاي: ${nextEv.e.name} يوم ${nextEv.day}` : 'كل يوم شو فيه، وقدّيش بيبقى معك', () => open('plan/calendar')));

  return [
    h('header', { class: 'page-head' }, h('div', null, h('h1', null, 'خطتك'), h('p', { class: 'muted' }, 'ميزانية الشهر، والسنة الجاية، والمشتريات، والأهداف.'))),
    monthBudgetBanner(st),
    monthCard, mapCard, billsCard, yearCard, itemsCard, goalsCard,
    h('section', { class: 'group' }, hubHead('bulb', 'amber', 'شو لو؟', 'جرّب مصروف كبير قبل ما تعمله: مصروف اليوم قبل وبعد، وشو لازم ينقص، وشو بيتأخر', () => openWhatIf())),
  ];
}

/* ======================= ميزانية الشهر ======================= */
// وضع التعديل: التغييرات بتضل مسودة لحتى تضغط «حفظ»، و«إلغاء» بيرجّع كل شي متل ما كان
let edit = null;
export function resetPlanMonth() { edit = null; }

function previewState() {
  const st = store.state;
  if (!edit) return st;
  return {
    ...st,
    settings: { ...st.settings, savingsTarget: edit.savings },
    categories: st.categories.map((c) => (c.type === 'expense' && edit.budgets[c.id] != null ? { ...c, budget: edit.budgets[c.id] } : c)),
  };
}

function startEdit(refreshPage) {
  const st = store.state;
  const begin = () => {
    edit = { savings: Number(st.settings.savingsTarget) || 0, budgets: {}, changed: false };
    for (const c of st.categories) if (c.type === 'expense') edit.budgets[c.id] = Number(c.budget) || 0;
    haptic('select');
    refreshPage();
  };
  // إذا المبالغ مخفية والرمز موجود، التعديل بدو الرمز (مشان ما حدا يخربط الميزانية)
  if (st.settings.hideAmounts && st.settings.pinHash) requirePin(begin, 'دخّل الرمز لتعدّل الميزانية');
  else begin();
}

function saveEdit(refreshPage) {
  const st = store.state;
  const snapshot = { savings: st.settings.savingsTarget, budgets: Object.fromEntries(st.categories.map((c) => [c.id, c.budget])) };
  const draft = edit;
  store.update((s) => {
    s.settings.savingsTarget = draft.savings;
    for (const c of s.categories) if (draft.budgets[c.id] != null) c.budget = draft.budgets[c.id];
  });
  edit = null;
  haptic('success');
  refreshPage();
  toast('انحفظت الميزانية', {
    action: 'تراجع', duration: 6000,
    onAction: () => store.update((s) => {
      s.settings.savingsTarget = snapshot.savings;
      for (const c of s.categories) if (c.id in snapshot.budgets) c.budget = snapshot.budgets[c.id];
    }),
  });
}

async function cancelEdit(refreshPage) {
  if (edit?.changed) {
    const ok = await confirmSheet('تلغي التعديلات؟', 'رح ترجع الميزانية متل ما كانت قبل ما تعدّل.', 'إلغاء التعديلات', { danger: false });
    if (!ok) return;
  }
  edit = null;
  refreshPage();
}

export function renderPlanMonth({ refresh: refreshPage }) {
  const st = store.state;
  const key = currentMonth();
  const summary = h('section', { class: 'group' });
  const refresh = () => fill(summary, summaryContent(previewState(), key));
  refresh();
  return [
    h('p', { class: 'section-note' }, `${monthLabel(key)}. الدخل والميزانية بيتكرروا كل شهر.`),
    monthBudgetBanner(st),
    cashCard(st, key),
    !edit && !monthOverride(st, key) ? h('div', { class: 'section-actions' },
      h('button', { class: 'btn secondary small', type: 'button', onclick: () => openMonthBudgetSheet() }, icon('sparkle', 16), 'ميزانية لباقي الشهر بس')) : null,
    summary,
    incomeGroup(st, key),
    savingsGroup(st, key, refresh),
    budgetGroup(st, refresh, refreshPage),
    edit
      ? h('div', { class: 'edit-bar' },
        h('button', { class: 'btn', type: 'button', onclick: () => saveEdit(refreshPage) }, icon('check', 18), 'حفظ التعديلات'),
        h('button', { class: 'btn secondary', type: 'button', onclick: () => cancelEdit(refreshPage) }, 'إلغاء'))
      : null,
  ];
}

function summaryContent(st, key) {
  // حساب الشهر «على الورق» (حسب الدخل المتوقع). الواقع الفعلي ببطاقة «مصاري الشهر الفعلية»
  const p = plan(st, key);
  const r0 = buildPlan(st).rows[0];
  const sumKind = (kinds) => r0.entries.filter((e) => kinds.includes(e.kind)).reduce((s, e) => s + e.usd, 0);
  const planned = sumKind(['commitment', 'want', 'bought']);
  const dIn = sumKind(['debtIn']);
  const dOut = sumKind(['debtOut']);
  const free = p.income + dIn - p.savings - p.fixed - p.flex - planned - dOut;
  const missing = expectedIncome(st, key).missing;
  const rows = [
    line('الدخل المتوقع', fmt(p.income)),
    dIn > 0.005 ? line('ديون راجعة إلك', fmt(dIn, 'USD', { sign: true })) : null,
    line('ناقص الادخار', fmt(-p.savings)),
    line('ناقص المصاريف الثابتة', fmt(-p.fixed)),
    line('ناقص ميزانية المصروف اليومي', fmt(-p.flex)),
    planned > 0.005 ? line('ناقص التزامات ومشتريات الخطة', fmt(-planned)) : null,
    dOut > 0.005 ? line('ناقص ديون لازم تسدّها', fmt(-dOut)) : null,
    line(free < 0 ? 'ناقصك' : 'بيبقى بلا تخصيص', fmt(Math.abs(free)), `total ${free < 0 ? 'bad' : ''}`),
  ];
  if (missing.length) rows.push(h('p', { class: 'row-note bad' }, `في دخل بـ ${missing.map((c) => CURRENCIES[c].name).join(' و')} ما انحسب لأن ما في سعر صرف.`));
  if (free < 0) rows.push(h('p', { class: 'row-note bad' }, 'خطتك أكبر من دخلك. خفّف الادخار أو ميزانية فئة، أو أجّل شي من المشتريات.'));
  else if (free > 0 && p.income > 0) rows.push(h('p', { class: 'row-note' }, 'هالمبلغ بيتراكم وبتنشترى منه أغراض قائمة المشتريات بالشهور الجاية.'));
  return [h('div', { class: 'group-head' }, h('h2', null, 'الخطة على الورق')), h('div', { class: 'rows' }, rows)];
}

function incomeGroup(st, key) {
  const rows = st.incomeSources.map((s) => {
    const k = INCOME_KINDS[s.kind] || INCOME_KINDS.other;
    const usd = toUSD(st, s.amount, s.currency);
    const when = s.schedule === 'monthly' ? 'كل شهر' : `مرة وحدة، ${monthLabel(s.month)}`;
    const inactive = s.schedule === 'once' && s.month !== key;
    return h('button', { class: 'row', type: 'button', onclick: () => openSourceForm(s) },
      badge(k.icon, k.tint || 'mint', 40),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, s.name),
        h('span', { class: 'row-sub' }, inactive ? `${when}، مو هالشهر` : when)),
      h('span', { class: 'row-end' },
        h('span', { class: 'amount income' }, fmt(s.amount, s.currency)),
        s.currency !== 'USD' ? h('span', { class: 'row-sub' }, Number.isFinite(usd) ? `≈ ${fmt(usd)}` : 'ما في سعر') : null));
  });
  if (!rows.length) rows.push(h('p', { class: 'row-note' }, 'ضيف راتبك، ودخل الأسهم بمعدل متحفّظ.'));
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
    edit.savings = n > 0 ? n : 0;
    edit.changed = true;
    refresh();
  };
  const savingsRow = (end) => h('div', { class: 'row' },
    badge('coins', 'gold', 40),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, 'بشيل كل شهر'),
      h('span', { class: 'row-sub' }, 'شيله أول ما يوصل الدخل، قبل أي مصروف.')),
    end);
  if (!edit) return group('الادخار الشهري', [savingsRow(h('span', { class: 'row-end' }, h('span', { class: 'amount' }, fmt(Number(st.settings.savingsTarget) || 0))))]);
  const { input, wrap } = moneyInput(edit.savings, 'مبلغ الادخار الشهري بالدولار', commit);
  const rows = [savingsRow(wrap)];
  if (p.income > 0) {
    rows.push(h('div', { class: 'row chips-row' },
      h('span', { class: 'row-sub' }, 'اقتراح:'),
      [10, 20, 30].map((pct) => {
        const v = Math.round((p.income * pct) / 100);
        return h('button', { class: 'chip', type: 'button', onclick: () => { haptic('select'); input.value = String(v); commit(v); } }, `${pct}% يعني ${fmt(v)}`);
      })));
  }
  return group('الادخار الشهري', rows);
}

// توزيع تلقائي: المتاح (الدخل ناقص الادخار وناقص الفئات اللي ما إلها نسبة) بيتوزّع بنسب مقترحة على المسودة
function autoDistribute() {
  const st = store.state;
  const key = currentMonth();
  const income = expectedIncome(st, key).usd;
  const savings = edit.savings;
  const others = st.categories.filter((c) => c.type === 'expense' && !(c.id in AUTO_BUDGET_WEIGHTS)).reduce((s, c) => s + (Number(edit.budgets[c.id]) || 0), 0);
  const pool = Math.max(0, income - savings - others) * AUTO_BUDGET_SHARE;
  return {
    pool,
    apply: () => {
      for (const id of Object.keys(AUTO_BUDGET_WEIGHTS)) if (id in edit.budgets) edit.budgets[id] = Math.floor((pool * AUTO_BUDGET_WEIGHTS[id]) / 100);
      edit.changed = true;
    },
  };
}

let showEmptyCats = false;
function budgetGroup(st, refresh, refreshPage) {
  const key = currentMonth();
  const over = monthOverride(st, key);
  const all = st.categories.filter((c) => c.type === 'expense');
  // بلا تعديل: الفئات اللي إلها ميزانية بترتيبك، واللي ما إلها مطوية تحت
  const hasBudget = (c) => (Number(c.budget) || 0) > 0 || budgetFor(st, c, key) > 0;
  const empty = edit ? [] : all.filter((c) => !hasBudget(c));
  const cats = edit || showEmptyCats ? all : all.filter(hasBudget);
  const rows = cats.map((c) => {
    let end;
    const monthVal = budgetFor(st, c, key);
    const special = over && over[c.id] != null && Math.abs(monthVal - (Number(c.budget) || 0)) > 0.5;
    if (edit) {
      end = moneyInput(edit.budgets[c.id], `ميزانية ${catLabel(c)} بالدولار`, (n) => {
        edit.budgets[c.id] = n > 0 ? n : 0;
        edit.changed = true;
        refresh();
      }).wrap;
    } else {
      end = h('span', { class: 'row-end' },
        h('span', { class: `amount ${c.budget ? '' : 'muted'}`.trim() }, c.budget ? fmt(c.budget) : '—'),
        special ? h('span', { class: 'row-sub gold-text' }, `هالشهر ${fmt(monthVal)}`) : null);
    }
    let sub = null;
    if (c.fixed) sub = 'ثابت، ما بيدخل بمصروف اليوم';
    else if (c.essential) sub = 'أساسي، بينحجز أول';
    return h('div', { class: 'row' },
      badge(catIcon(c), catTint(c), 40),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, catLabel(c)),
        sub ? h('span', { class: 'row-sub' }, sub) : null),
      end);
  });
  if (!edit && empty.length) {
    rows.push(h('button', { class: 'row more-row', type: 'button', onclick: () => { showEmptyCats = !showEmptyCats; refreshPage(); } },
      showEmptyCats ? 'خبّي الفئات اللي بلا ميزانية' : `${countText(empty.length, ['فئة وحدة', 'فئتين', 'فئات', 'فئة'])} بلا ميزانية`, icon(showEmptyCats ? 'chevU' : 'chevD', 16)));
  }
  if (edit) {
    rows.push(h('div', { class: 'row-actions' },
      h('button', {
        class: 'btn secondary small', type: 'button',
        onclick: async () => {
          const A = autoDistribute();
          if (!(A.pool > 0)) { toast('ضيف دخلك أول مشان نوزّع الميزانية.', { kind: 'warn' }); return; }
          const ok = await confirmSheet('توزيع تلقائي؟', `رح يتوزّع ${fmt(A.pool)} على الفئات بنسب مقترحة (الأكل والبقالة أكتر شي)، ويبقى 15% فائض للمشتريات. ما بينحفظ شي لحتى تضغط «حفظ».`, 'وزّع', { danger: false });
          if (!ok) return;
          A.apply();
          haptic('success');
          refreshPage();
        },
      }, icon('sparkle', 18), 'وزّع تلقائياً')));
  }
  rows.push(h('p', { class: 'row-note' }, over
    ? 'هي ميزانيتك الأصلية للشهور الجاية. هالشهر ماشي على الميزانية الاستثنائية (بالذهبي).'
    : 'المصاريف الثابتة بتنحسب لحالها. الباقي بيتوزّع على أيام الشهر، وبيطلع لك بالرئيسية كمصروف اليوم.'));
  return group('ميزانية الفئات بالدولار', rows, {
    action: edit ? null : h('span', { class: 'head-btns' },
      h('button', { class: 'btn secondary small', type: 'button', 'aria-label': 'رتّب الفئات', onclick: () => openReorderSheet('expense') }, icon('sort', 16), 'رتّب'),
      h('button', { class: 'btn small', type: 'button', onclick: () => startEdit(refreshPage) }, icon('edit', 16), 'عدّل')),
  });
}

/* ======================= السنة ======================= */
const LEGEND = [['s-living', 'المعيشة'], ['s-save', 'الادخار'], ['s-commit', 'التزامات'], ['s-buy', 'مشتريات'], ['s-free', 'فائض']];
const ENTRY_KIND = {
  want: 'مشتريات مخططة', commitment: 'التزام', bought: 'انشترى', confirmed: 'شراء مثبّت',
  debtIn: 'دين راجع إلك', debtOut: 'دين لازم تسدّه', debtDone: 'دفعة دين صارت',
};

export function renderPlanYear() {
  const st = store.state;
  const P = buildPlan(st);
  const neg = P.rows.find((r) => r.balance < -0.5);
  const startInput = h('input', {
    type: 'text', inputmode: 'decimal', class: 'inline-input', value: st.settings.plannerStart ? String(st.settings.plannerStart) : '',
    placeholder: '0', 'aria-label': 'معك هلّق للمشتريات بالدولار',
    onchange: (e) => { const n = parseAmount(e.target.value); store.update((s) => { s.settings.plannerStart = n > 0 ? n : 0; }); },
  });
  const out = [];
  if (P.totals.income <= 0) out.push(h('div', { class: 'banner' }, h('span', { class: 'banner-ic' }, icon('info', 22)), h('p', null, 'ضيف دخلك بـ «ميزانية الشهر» أول، مشان تنحسب السنة.')));
  if (neg) out.push(h('div', { class: 'banner warn-banner' }, h('span', { class: 'banner-ic' }, icon('alert', 22)), h('p', null, `بـ ${monthLabel(neg.month)} رصيد خطتك بيصير ${fmt(neg.balance)}. أجّل التزام أو خفّف المصاريف.`)));
  out.push(group('خلال 12 شهر', [
    line('الدخل المتوقع', fmt(P.totals.income)),
    line('مصاريف المعيشة', fmt(-P.totals.living)),
    line('الادخار', fmt(-P.totals.savings)),
    line('الالتزامات والمشتريات', fmt(-P.totals.spend)),
    line('فائض حر آخر السنة', fmt(P.endBalance), `total ${P.endBalance < 0 ? 'bad' : ''}`),
    P.cashMode
      ? h('p', { class: 'row-note' }, 'هالشهر محسوب على المصاري اللي معك فعلاً والجاي، والشهور الجاية على الدخل المتوقع.')
      : h('div', { class: 'row' },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'معك هلّق للمشتريات'), h('span', { class: 'row-sub' }, 'بتنضاف لفائض أول شهر')),
        h('span', { class: 'inline-money' }, '$', startInput)),
  ]));
  out.push(h('section', { class: 'group' },
    h('div', { class: 'group-head' }, h('h2', null, 'شهر بشهر')),
    h('div', { class: 'legend', role: 'list', 'aria-label': 'دليل الألوان' },
      LEGEND.map(([cls, label]) => h('span', { role: 'listitem' }, h('i', { class: cls, 'aria-hidden': 'true' }), label))),
    h('div', { class: 'rows' }, P.rows.map((r, i) => monthRow(r, i, Boolean(monthOverride(st, r.month)))))));
  return out;
}

function freeLabel(r) {
  if (r.free >= -0.005) return { label: 'فائض', text: `فائض ${fmt(r.free)}`, cls: '' };
  if (r.balance >= -0.5) return { label: 'من المتراكم', text: `من المتراكم ${fmt(-r.free)}`, cls: '' };
  return { label: 'ناقص', text: `ناقص ${fmt(-r.free)}`, cls: 'over' };
}

function monthRow(r, i, special = false) {
  const used = r.living + r.savings + r.commitments + r.debtOut + r.purchases;
  const seg = (cls, v) => (v > 0.005 ? h('i', { class: cls, style: { flexGrow: String(v) } }) : null);
  const f = freeLabel(r);
  return h('button', { class: 'row month-row', type: 'button', onclick: () => openMonthSheet(r) },
    h('span', { class: 'mr-top' },
      h('span', { class: 'row-title' }, i === 0 ? `${monthLabel(r.month)}، هالشهر${r.cashMode ? ' (فعلي)' : ''}` : monthLabel(r.month),
        special ? h('span', { class: 'tag gold' }, 'ميزانية استثنائية') : null),
      h('span', { class: `amount ${f.cls}`.trim() }, f.text)),
    h('span', { class: 'stack', 'aria-hidden': 'true' },
      seg('s-living', r.living), seg('s-save', r.savings), seg('s-commit', r.commitments + r.debtOut), seg('s-buy', r.purchases),
      seg('s-free', Math.max(0, r.income + r.debtIn - used))),
    r.entries.length
      ? h('span', { class: 'entry-chips' }, r.entries.map((e) => h('span', { class: `entry ${e.kind}` }, `${e.it.name} ${fmt(e.usd, 'USD', { sign: e.kind === 'debtIn' || e.inflow })}`)))
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
          badge(e.it.icon || 'bag', e.kind === 'debtIn' ? 'blue' : e.kind === 'want' || e.kind === 'confirmed' ? 'violet' : 'coral', 36),
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, e.it.name), h('span', { class: 'row-sub' }, ENTRY_KIND[e.kind])),
          h('span', { class: 'row-end' }, h('span', { class: 'amount' }, fmt(e.usd))))))
        : h('p', { class: 'hint' }, 'ما في مشتريات أو التزامات بهالشهر.'),
    ]);
  });
}

/* ======================= المشتريات والالتزامات ======================= */
export function renderPlanItems() {
  const st = store.state;
  const P = buildPlan(st);
  const actions = h('div', { class: 'section-actions' },
    h('button', { class: 'btn small', type: 'button', onclick: () => openItemForm(null, 'want') }, icon('bag', 18), 'غرض بدي اشتريه'),
    h('button', { class: 'btn secondary small', type: 'button', onclick: () => openItemForm(null, 'commitment') }, icon('pin', 18), 'التزام'),
    h('button', { class: 'btn secondary small', type: 'button', onclick: () => openWhatIf() }, icon('bulb', 18), 'شو لو؟'));

  if (!st.planItems.length) {
    return [actions, emptyState('bag', 'ضيف الأغراض اللي ناوي تشتريها والالتزامات اللي لازم تدفعها. الخطة بتوزّعها على الشهور حسب الفائض، والمهم أول.',
      h('button', { class: 'btn', type: 'button', onclick: () => openItemForm(null, 'want') }, 'ضيف أول غرض'))];
  }
  const planned = st.planItems.filter((i) => i.status !== 'bought');
  const monthOf = (it) => P.schedule.get(it.id)?.month || '9999-99';
  const confirmed = planned.filter((i) => i.kind === 'want' && i.confirmed).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const wants = planned.filter((i) => i.kind === 'want' && !i.confirmed).sort((a, b) => monthOf(a).localeCompare(monthOf(b)) || (a.priority || 2) - (b.priority || 2));
  const commitments = planned.filter((i) => i.kind === 'commitment').sort((a, b) => (a.date || a.month || '').localeCompare(b.date || b.month || ''));
  const bought = st.planItems.filter((i) => i.status === 'bought').sort((a, b) => (b.boughtAt || '').localeCompare(a.boughtAt || '')).slice(0, 8);
  // اقتراحات: قدّيش تخفّف لتلحق مواعيدك (الحساب بعد ما تنرسم الصفحة)
  const tips = h('div', { class: 'sg-slot' });
  if (wants.length) {
    setTimeout(() => {
      if (!document.contains(tips)) return;
      const list = purchaseSuggestions(store.state, { limit: 2 });
      if (list.length) fill(tips, [h('section', { class: 'group sg-group' }, h('div', { class: 'group-head' }, h('h2', null, 'اقتراحات')), h('div', { class: 'sg-list' }, list.map((sg) => suggestionCard(sg))))]);
    }, 30);
  }
  return [
    actions,
    tips,
    confirmed.length ? group('مثبّتة (مبلغها محجوز)', confirmed.map((it) => itemRow(st, it, P))) : null,
    wants.length ? group('قائمة المشتريات', wants.map((it) => itemRow(st, it, P))) : null,
    commitments.length ? group('الالتزامات', commitments.map((it) => itemRow(st, it, P))) : null,
    bought.length ? group('خلصت', bought.map((it) => itemRow(st, it, P))) : null,
    h('p', { class: 'section-note' }, 'الالتزامات والمشتريات المثبّتة بتنحجز أول، بعدين الأغراض حسب الأهمية والموعد. كل غرض بينحط بأول شهر بيكفيه فيه الفائض المتراكم. «ثبّت» بيحجز المبلغ بتاريخه بلا ما ينسجل مصروف.'),
  ];
}

function itemRow(st, it, P) {
  const s = P.schedule.get(it.id);
  const isBought = it.status === 'bought';
  const usd = isBought ? it.boughtUSD : toUSD(st, it.amount, it.currency);
  let tag = null;
  if (!isBought && it.kind === 'want' && it.confirmed) tag = h('span', { class: 'tag gold' }, 'مثبّت');
  else if (!isBought && it.kind === 'want' && it.priority === 1) tag = h('span', { class: 'tag' }, 'مهم');
  // غرض فيك تشتريه هالشهر: زر «ثبّت» مباشرة
  const canPin = !isBought && it.kind === 'want' && !it.confirmed && s?.month === currentMonth();
  return h('div', { class: 'row' },
    h('button', { class: 'row-tap', type: 'button', onclick: () => openItemForm(it) },
      badge(it.icon, isBought ? 'slate' : it.kind === 'commitment' ? 'coral' : 'violet', 42),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, it.name, tag),
        h('span', { class: `row-sub wrap ${statusClass(s)}`.trim() }, scheduleText(it, s))),
      h('span', { class: 'row-end' },
        h('span', { class: 'amount' }, isBought ? fmt(usd) : fmt(it.amount, it.currency)),
        !isBought && it.currency !== 'USD' && Number.isFinite(usd) ? h('span', { class: 'row-sub' }, `≈ ${fmt(usd)}`) : null)),
    canPin ? h('button', { class: 'icon-btn pin-btn', type: 'button', 'aria-label': `ثبّت شراء ${it.name}`, onclick: () => openConfirmForm(it) }, icon('pin', 18)) : null);
}

/* ======================= الأهداف ======================= */
export function renderPlanGoals() {
  const st = store.state;
  const G = goalsSummary(st);
  const E = emergencySuggestion(st);
  const out = [];
  if (!st.goals.some((g) => g.kind === 'emergency')) {
    if (E.monthly > 0) {
      out.push(h('div', { class: 'banner col gold-banner' },
        h('p', null, `صندوق الطوارئ أول: مصاري بتحميك إذا انقطع الدخل. مصاريفك بالشهر ${fmt(E.monthly)}، فالصندوق بين ${fmt(E.three)} و${fmt(E.six)}.`),
        h('div', { class: 'banner-actions' },
          h('button', { class: 'btn gold small', type: 'button', onclick: () => openGoalForm(null, { kind: 'emergency', name: 'صندوق الطوارئ', icon: 'shield', target: E.three }) }, `3 شهور ${fmt(E.three)}`),
          h('button', { class: 'btn secondary small', type: 'button', onclick: () => openGoalForm(null, { kind: 'emergency', name: 'صندوق الطوارئ', icon: 'shield', target: E.six }) }, `6 شهور ${fmt(E.six)}`))));
    } else {
      out.push(h('div', { class: 'banner' }, h('span', { class: 'banner-ic' }, icon('info', 22)), h('p', null, 'حدد ميزانيتك بـ «ميزانية الشهر» مشان نحسب لك صندوق الطوارئ.')));
    }
  }
  const summary = [line('بتشيل كل شهر', fmt(G.savings)), line('الأهداف بدها من الادخار بالشهر', fmt(G.need))];
  if (G.surplusUsed > 0.5) summary.push(h('p', { class: 'row-note' }, `حسبنا معها ${fmt(G.surplusUsed)} من الفائض المتوقع لمواعيد أهدافك (بعد ما يضل ${fmt(G.buffer)} لأول كل شهر). لهيك الرقم أقل من المبلغ مقسوم على الشهور.`));
  if (G.gap > 0.5) {
    const target = Math.ceil(G.need);
    summary.push(
      h('p', { class: 'row-note bad' }, `ادخارك أقل من اللي بدها ياه أهدافك بـ ${fmt(G.gap)} بالشهر.`),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn small', type: 'button', onclick: () => store.update((s) => { s.settings.savingsTarget = target; }) }, `خلّي الادخار ${fmt(target)}`)));
  } else {
    summary.push(line('بيبقى للاستثمار بالشهر', fmt(G.invest), 'total'));
  }
  if (G.need > G.capacity + 0.5) summary.push(h('p', { class: 'row-note bad' }, `حتى لو ما اشتريت ولا غرض، دخلك ما بيكفي هالأهداف. لازم توفّر ${fmt(G.need - G.capacity)} بالشهر من المصاريف، أو تأخّر موعد هدف.`));
  else if (G.invest > 0.5) summary.push(h('p', { class: 'row-note' }, 'بعد ما يكمل صندوق الطوارئ، الباقي من الادخار فيك تستثمره.'));
  out.push(group('الادخار والأهداف', summary));

  // فائض هالشهر: فيك تنقله للهدف هلّق، والمبلغ اللي بيضل لأول الشهر
  const S = movableSurplus(st);
  if (S.ok && st.goals.length) {
    const sg = surplusGoal(st);
    const M = monthMap(st, todayISO());
    const bufInput = h('input', {
      type: 'text', inputmode: 'decimal', class: 'inline-input', value: String(G.buffer), 'aria-label': 'المبلغ اللي بيضل لأول الشهر بالدولار',
      onchange: (e) => { const n = parseAmount(e.target.value); store.update((s) => { s.settings.buffer = n >= 0 ? n : 0; }); },
    });
    const rows = [
      h('div', { class: 'row' },
        badge('flag', 'teal', 40),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'بيضل لأول الشهر الجاي'),
          h('span', { class: 'row-sub wrap' }, M.next.firstIncomeDay && M.next.bridgeDays > 0
            ? `أول دخل بيوصل ${M.next.firstIncomeDay} بالشهر، يعني بتحتاج تقريباً ${fmt(M.next.need)} لأول ${daysText(M.next.bridgeDays)}`
            : 'مصاري لأول أيام الشهر لحتى يوصل الدخل')),
        h('span', { class: 'inline-money' }, '$', bufInput)),
      h('div', { class: 'row' },
        badge('target', 'gold', 40),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'فائض فيك تنقله هلّق'),
          h('span', { class: 'row-sub wrap' }, 'اللي معك ناقص الفواتير والمحجوز ومصروف باقي الشهر، وناقص اللي بيضل لأول الشهر')),
        h('span', { class: 'row-end' }, h('span', { class: `amount ${S.movable >= 1 ? 'income' : 'muted'}` }, fmt(S.movable)))),
    ];
    if (sg && S.movable >= 1) {
      rows.push(h('div', { class: 'row-actions' },
        h('button', { class: 'btn gold small', type: 'button', onclick: () => openDepositForm(sg, { amount: S.movable }) }, icon('target', 16), `حطه بهدف «${sg.name}»`)));
    }
    out.push(group('فائض الشهر', rows));
  }

  const rows = G.list.map((x) => {
    const { g, monthly, done, overdue, covered } = x;
    const target = Number(g.target) || 1;
    const savedPct = Math.min(100, ((Number(g.saved) || 0) / target) * 100);
    const linkedPct = Math.min(100 - savedPct, (x.linkedUSD / target) * 100);
    let line1 = `${fmt(g.saved || 0)} من ${fmt(g.target)}`;
    if (x.linkedUSD > 0.5) line1 += `، ودين ${fmt(x.linkedUSD)} مضمون (${x.linked.list.map((k) => k.debt.person).join(' و')})`;
    let line2;
    let cls = '';
    if (done) line2 = 'اكتمل الهدف';
    else if (covered) line2 = 'الدين المربوط بيكمّله';
    else if (overdue) { line2 = `فات الموعد، باقي ${fmt(x.remaining)}`; cls = 'warn'; }
    else if (monthly > 0.5) line2 = `لازم تشيل ${fmt(monthly)} بالشهر لـ ${monthLabel(g.deadline, { year: false })}${x.surplusUse > 0.5 ? `، بعد ما الفائض بيغطّي ${fmt(x.surplusUse)}` : ''}`;
    else line2 = `الفائض بيكمّله بموعده (${monthLabel(g.deadline, { year: false })})، بلا ادخار زيادة`;
    if (!done && x.doneBy && !covered) line2 += `. بالفائض لحاله بيكمل تقريباً بـ ${monthLabel(x.doneBy)}`;
    return h('div', { class: 'row goal-row' },
      badge(g.icon, 'gold', 42),
      h('button', { class: 'goal-main', type: 'button', onclick: () => openGoalForm(g) },
        h('span', { class: 'row-title' }, g.name, g.useSurplus ? h('span', { class: 'tag' }, 'من الفائض') : null),
        h('span', { class: 'bar gold dual', 'aria-hidden': 'true' },
          h('i', { style: { width: `${savedPct}%` } }),
          linkedPct > 0 ? h('i', { class: 'linked', style: { width: `${linkedPct}%` } }) : null),
        h('span', { class: 'row-sub' }, line1),
        h('span', { class: `row-sub ${cls}`.trim() }, line2)),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `إضافة مبلغ لـ ${g.name}`, onclick: () => openDepositForm(g) }, icon('plus', 18)));
  });
  if (!rows.length) rows.push(h('p', { class: 'row-note' }, 'مثلاً: «بدي أجمع 3000$ خلال سنة». بتحط الهدف وموعده، وهو بيقلك قدّيش لازم تشيل كل شهر.'));
  rows.push(h('div', { class: 'row-actions' }, h('button', { class: 'btn secondary small', type: 'button', onclick: () => openGoalForm() }, icon('plus', 18), 'هدف جديد')));
  out.push(group('أهدافك', rows));
  return out;
}

export { budgetTotals };
