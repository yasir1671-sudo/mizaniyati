// الأهداف: الفائض بآخر كل شهر بيروح للهدف (بعد مبلغ لأول الشهر)، والديون المربوطة بتنحسب مضمونة
import { h, icon, fill, openSheet, confirmSheet, toast, field, iconPicker, haptic, selectButton, dateButton } from './ui.js';
import { badge, GOAL_ICON_CHOICES, tintHex } from './icons.js';
import { store, uid } from './store.js';
import { CURRENCIES, fmt, parseAmount, toUSD, fromUSD, roundTo } from './money.js';
import { todayISO, currentMonth, addMonths, monthLabel, monthsText, daysInMonth, parseISO } from './dates.js';
import { accountBalances, cashMonth, dailyAllowance, isCashAware, debtRemaining } from './calc.js';
import { goalsSummary } from './planner.js';
import { switchRow, accountOpts } from './forms.js';
import { monthMap } from './month.js';

const cleanNum = (n) => String(+Number(n).toPrecision(8));
const isMonth = (m) => /^\d{4}-\d{2}$/.test(m || '');

/* ---------- الفائض اللي فيك تنقله هلّق ---------- */
// اللي معك بالإيد − الفواتير والالتزامات − مصروف باقي الشهر − المبلغ اللي بيضل لأول الشهر الجاي
export function movableSurplus(state, today = todayISO()) {
  if (!isCashAware(state)) return { ok: false };
  const c = cashMonth(state, today);
  const a = dailyAllowance(state, today);
  const flexReserve = Math.max(0, a.perDay * a.daysLeft - a.todaySpent);
  const buffer = Math.max(0, Number(state.settings.buffer) || 0);
  const free = c.spendable - c.bills - c.commits - c.debtOut - flexReserve;
  return { ok: true, free, buffer, movable: Math.max(0, Math.floor(free - buffer)), c, a, flexReserve };
}

export function surplusGoal(state) {
  const G = goalsSummary(state);
  return G.list.find((x) => x.g.useSurplus && !x.done && x.remaining > 0.5)?.g || null;
}

// آخر 3 أيام بالشهر: «حط الفائض بالهدف»
export function surplusCloseBanner(state) {
  const today = todayISO();
  const key = today.slice(0, 7);
  const d = parseISO(today);
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  if (d.getDate() < dim - 2 || state.settings.closedMonths?.[key]) return null;
  const goal = surplusGoal(state);
  if (!goal) return null;
  const S = movableSurplus(state, today);
  if (!S.ok || S.movable < 10) return null;
  const close = (v) => store.update((s) => { s.settings.closedMonths = { ...(s.settings.closedMonths || {}), [key]: v }; });
  return h('div', { class: 'banner col gold-banner' },
    h('div', { class: 'banner-row' }, h('span', { class: 'banner-ic' }, icon('target', 22)),
      h('p', null, `آخر الشهر: بيبقى معك فائض تقريباً ${fmt(S.movable + S.buffer)}. خلّي ${fmt(S.buffer)} لأول الشهر الجاي، وحط ${fmt(S.movable)} بهدف «${goal.name}»؟`)),
    h('div', { class: 'banner-actions' },
      h('button', { class: 'btn gold small', type: 'button', onclick: () => openDepositForm(goal, { amount: S.movable, onDone: () => close(true) }) }, icon('check', 16), 'حطها بالهدف'),
      h('button', { class: 'btn secondary small', type: 'button', onclick: () => close('skip') }, 'مش هالشهر')));
}

/* ---------- هدف ادخار ---------- */
export function openGoalForm(goal = null, preset = {}) {
  const editing = Boolean(goal);
  const d = {
    name: goal?.name ?? preset.name ?? '', icon: goal?.icon || preset.icon || 'target',
    target: goal ? cleanNum(goal.target) : preset.target ? cleanNum(Math.round(preset.target)) : '',
    saved: goal ? cleanNum(goal.saved || 0) : '', deadline: goal?.deadline || preset.deadline || addMonths(currentMonth(), 11),
    kind: goal?.kind || preset.kind || 'goal',
    useSurplus: goal ? goal.useSurplus !== false : preset.kind !== 'emergency',
    linked: new Set(goal?.linkedDebtIds || []),
  };
  const id = goal?.id || uid('goal');
  openSheet(editing ? 'تعديل الهدف' : 'هدف جديد', (body, close) => {
    let err = null;
    let hint = null;

    function draft() {
      return {
        ...(goal || {}), id, name: d.name.trim() || 'هدف', icon: d.icon, target: parseAmount(d.target) || 0,
        saved: Math.max(0, parseAmount(d.saved) || 0), deadline: d.deadline, kind: d.kind,
        useSurplus: d.useSurplus, linkedDebtIds: [...d.linked], createdAt: goal?.createdAt || Date.now(),
      };
    }

    function render() {
      const st = store.state;
      err = h('p', { class: 'form-error', role: 'alert' });
      hint = h('div', { class: 'plan-status goal-hint' });
      // الديون اللي إلك (مفتوحة): فيك تربطها بالهدف
      const debts = st.debts.filter((x) => x.direction === 'theyOwe' && (debtRemaining(x) > 0.005 || d.linked.has(x.id)));
      const otherGoal = (debtId) => st.goals.find((g) => g.id !== id && (g.linkedDebtIds || []).includes(debtId));
      fill(body, [
        h('div', { class: 'name-row' },
          badge(d.icon, 'gold', 52),
          field('اسم الهدف', h('input', { type: 'text', value: d.name, placeholder: 'مثلاً: سيارة، عمرة، دفعة بيت', oninput: (e) => { d.name = e.target.value; } }))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الأيقونة'),
          iconPicker(GOAL_ICON_CHOICES, d.icon, (name) => { d.icon = name; render(); }, tintHex('gold'))),
        h('div', { class: 'two' },
          field('المبلغ المطلوب بالدولار', h('input', { type: 'text', inputmode: 'decimal', value: d.target, placeholder: '0', oninput: (e) => { d.target = e.target.value; refreshHint(); } })),
          field('جمعت لهلّق', h('input', { type: 'text', inputmode: 'decimal', value: d.saved, placeholder: '0', oninput: (e) => { d.saved = e.target.value; refreshHint(); } }))),
        field('لإيمتى؟', dateButton({ value: d.deadline, mode: 'month', onChange: (v) => { d.deadline = v; render(); } })),
        h('div', { class: 'sheet-rows rows' },
          switchRow('حط فيه فائض كل شهر', `اللي بيبقى آخر كل شهر بيروح للهدف، بعد ما يضل ${fmt(Number(st.settings.buffer) || 0)} لأول الشهر الجاي. فبيقل اللي لازم تشيله.`, d.useSurplus, (v) => { d.useSurplus = v; refreshHint(); })),
        debts.length ? h('div', { class: 'field' },
          h('span', { class: 'field-label' }, 'دين إلك رايح لهالهدف؟'),
          h('div', { class: 'sheet-rows rows' }, debts.map((x) => {
            const og = otherGoal(x.id);
            const rem = debtRemaining(x);
            const sub = `باقي ${fmt(rem, x.currency)}${x.due ? `، بيرجع بـ ${monthLabel(x.due, { year: false })}` : ''}${og ? `، مربوط بـ «${og.name}»` : ''}`;
            return switchRow(`عند ${x.person}`, sub, d.linked.has(x.id), (v) => { if (v) d.linked.add(x.id); else d.linked.delete(x.id); refreshHint(); });
          })),
          h('span', { class: 'field-hint' }, 'الدين المربوط بينحسب مضمون للهدف، وما بيدخل بمصاري الشهر. ولما يرجع، بينضاف للهدف لحاله.')) : null,
        hint,
        err,
        h('button', { class: 'btn block', type: 'button', onclick: save }, 'حفظ الهدف'),
        editing ? h('button', { class: 'btn danger block', type: 'button', onclick: remove }, 'حذف الهدف') : null,
      ]);
      refreshHint();
    }

    function refreshHint() {
      const g = draft();
      if (!(g.target > 0) || !isMonth(g.deadline)) { fill(hint, []); return; }
      const st = store.state;
      // منحسب على نسخة فيها الهدف بعد التعديل (والديون المربوطة طالعة من الفائض)
      const others = st.goals.filter((x) => x.id !== id).map((x) => ({ ...x, linkedDebtIds: (x.linkedDebtIds || []).filter((k) => !d.linked.has(k)) }));
      const G = goalsSummary({ ...st, goals: [...others, g] });
      const x = G.list.find((k) => k.g.id === id);
      if (!x) { fill(hint, []); return; }
      fill(hint, goalExplain(x, G));
    }

    function save() {
      const g = draft();
      if (!(g.target > 0)) { err.textContent = 'اكتب المبلغ المطلوب.'; return; }
      if (!isMonth(g.deadline)) { err.textContent = 'اختار الموعد.'; return; }
      store.update((s) => {
        // الدين بيرتبط بهدف واحد بس
        for (const other of s.goals) if (other.id !== id) other.linkedDebtIds = (other.linkedDebtIds || []).filter((k) => !d.linked.has(k));
        const i = s.goals.findIndex((x) => x.id === id);
        if (i >= 0) s.goals[i] = g; else s.goals.push(g);
      });
      close();
      toast('انحفظ الهدف');
    }

    async function remove() {
      const ok = await confirmSheet('حذف الهدف؟', `رح ينحذف هدف «${goal.name}». الديون المربوطة فيه بترجع تنحسب بمصاري شهرها.`, 'احذف');
      if (!ok) return;
      store.update((s) => { s.goals = s.goals.filter((x) => x.id !== goal.id); });
      close();
      toast('انحذف الهدف');
    }

    render();
  });
}

// شرح الهدف: شو مضمون، شو بيغطّيه الفائض، وقدّيش باقي تشيل بالشهر
export function goalExplain(x, G) {
  const out = [];
  if (x.done) return [h('p', null, 'الهدف مكتمل. مبروك!')];
  if (x.linkedUSD > 0.5) out.push(h('p', null, `الدين المربوط (${fmt(x.linkedUSD)}) بينحسب مضمون، فالباقي ${fmt(x.remaining)}.`));
  if (x.covered) { out.push(h('p', { class: 'good' }, 'الدين المربوط بيكمّل الهدف لحاله.')); return out; }
  if (x.overdue) { out.push(h('p', { class: 'warn' }, 'الموعد فات. اختار شهر جاي.')); return out; }
  if (x.g.useSurplus && x.surplusUse > 0.5) {
    out.push(h('p', null, `الفائض المتوقع لـ ${monthLabel(x.g.deadline, { year: false })} (بعد ما يضل ${fmt(G.buffer)} لأول كل شهر) بيغطّي ${fmt(x.surplusUse)}.`));
  }
  if (x.monthly > 0.5) {
    out.push(h('p', { class: 'strong' }, `${x.g.useSurplus && x.surplusUse > 0.5 ? 'وباقي' : 'يعني لازم'} تشيل ${fmt(x.monthly)} بالشهر من الادخار لمدة ${monthsText(x.monthsLeft)}${x.g.useSurplus && x.surplusUse > 0.5 ? ` (بدل ${fmt(x.monthlyPlain)} بلا الفائض)` : ''}.`));
  } else {
    out.push(h('p', { class: 'good' }, 'ما بدك تشيل شي زيادة من الادخار: الفائض بيكفيه بموعده.'));
  }
  if (x.doneBy) out.push(h('p', { class: 'muted' }, `إذا حطيت فيه الفائض كل شهر، بيكمل تقريباً بـ ${monthLabel(x.doneBy)}.`));
  return out;
}

/* ---------- إضافة للهدف (مع نقل المصاري لمحفظة ادخار) ---------- */
export function openDepositForm(goal, { amount = null, onDone = null } = {}) {
  const st = store.state;
  const bal = accountBalances(st);
  const spendable = st.accounts.filter((a) => !a.savings);
  const usdFirst = (a) => (a.currency === 'USD' ? 0 : 1);
  const from = [...spendable].sort((a, b) => usdFirst(a) - usdFirst(b) || (bal.get(b.id) || 0) - (bal.get(a.id) || 0))[0];
  const d = { value: amount ? String(amount) : '', move: Boolean(from), fromId: from?.id || '' };
  openSheet(`إضافة لـ «${goal.name}»`, (body, close) => {
    let err = null;
    let hint = null;
    function render() {
      const s = store.state;
      const acc = s.accounts.find((a) => a.id === d.fromId);
      err = h('p', { class: 'form-error', role: 'alert' });
      hint = h('span', { class: 'field-hint' });
      fill(body, [
        h('div', { class: 'amount-wrap' },
          h('span', { class: 'amount-cur' }, '$'),
          h('input', { class: 'amount-input', type: 'text', inputmode: 'decimal', value: d.value, placeholder: '0', 'data-autofocus': !amount, 'aria-label': 'المبلغ بالدولار', oninput: (e) => { d.value = e.target.value; refreshHint(); } })),
        h('p', { class: 'hint' }, `جمعت لهلّق ${fmt(goal.saved || 0)} من ${fmt(goal.target)}.`),
        spendable.length ? h('div', { class: 'sheet-rows rows' },
          switchRow('انقلها لمحفظة ادخار', 'مشان ما تنحسب بمصروفك وتنصرف بالغلط. إذا ما عندك محفظة ادخار بنعملها.', d.move, (v) => { d.move = v; render(); })) : null,
        d.move ? field('من محفظة', selectButton({ value: d.fromId, options: accountOpts().filter((o) => spendable.some((a) => a.id === o.value)), title: 'المحفظة', onChange: (v) => { d.fromId = v; render(); } }), null) : null,
        d.move && acc ? hint : null,
        err,
        h('button', { class: 'btn gold block', type: 'button', onclick: save }, icon('target', 18), 'أضف للهدف'),
      ]);
      refreshHint();
    }
    function refreshHint() {
      const s = store.state;
      const acc = s.accounts.find((a) => a.id === d.fromId);
      if (!hint || !acc) return;
      const n = parseAmount(d.value);
      const target = savingsWallet(s, acc.currency);
      const inCur = n > 0 ? fromUSD(s, n, acc.currency) : NaN;
      const where = target ? `لمحفظة «${target.name}»` : `لمحفظة ادخار جديدة بـ ${CURRENCIES[acc.currency].name}`;
      hint.textContent = Number.isFinite(inCur) && n > 0 ? `رح ينتقل ${fmt(roundTo(inCur, CURRENCIES[acc.currency].decimals), acc.currency)} من «${acc.name}» ${where}.` : `بتنتقل ${where}.`;
    }
    function save() {
      const s = store.state;
      const n = parseAmount(d.value);
      if (!(n > 0)) { err.textContent = 'اكتب المبلغ.'; return; }
      const acc = d.move ? s.accounts.find((a) => a.id === d.fromId) : null;
      let txId = null;
      let newAccId = null;
      if (acc) {
        const inCur = roundTo(fromUSD(s, n, acc.currency), CURRENCIES[acc.currency].decimals);
        if (!Number.isFinite(inCur)) { err.textContent = `حدد سعر ${CURRENCIES[acc.currency].name} أول.`; return; }
        txId = uid('tx');
        store.update((x) => {
          let to = savingsWallet(x, acc.currency);
          if (!to) {
            to = { id: uid('acc'), name: `ادخار ${CURRENCIES[acc.currency].name}`, currency: acc.currency, opening: 0, savings: true };
            x.accounts.push(to);
            newAccId = to.id;
          }
          x.transactions.push({
            id: txId, type: 'transfer', date: todayISO(), accountId: acc.id, toAccountId: to.id, amount: inCur, toAmount: inCur,
            usd: n, note: `لهدف «${goal.name}»`, goalId: goal.id, createdAt: Date.now(),
          });
          const g = x.goals.find((k) => k.id === goal.id);
          if (g) g.saved = Math.round(((Number(g.saved) || 0) + n) * 100) / 100;
        });
      } else {
        store.update((x) => {
          const g = x.goals.find((k) => k.id === goal.id);
          if (g) g.saved = Math.round(((Number(g.saved) || 0) + n) * 100) / 100;
        });
      }
      onDone?.();
      close();
      haptic('success');
      toast(`انضاف ${fmt(n)} لـ «${goal.name}»`, {
        action: 'تراجع', duration: 6000,
        onAction: () => store.update((x) => {
          const g = x.goals.find((k) => k.id === goal.id);
          if (g) g.saved = Math.max(0, Math.round(((Number(g.saved) || 0) - n) * 100) / 100);
          if (txId) x.transactions = x.transactions.filter((t) => t.id !== txId);
          if (newAccId && !x.transactions.some((t) => t.accountId === newAccId || t.toAccountId === newAccId)) x.accounts = x.accounts.filter((a) => a.id !== newAccId);
        }),
      });
    }
    render();
  });
}

function savingsWallet(s, currency) {
  return s.accounts.find((a) => a.savings && a.currency === currency) || null;
}

/* ---------- المبلغ اللي بيضل لأول الشهر ---------- */
export function bufferAdvice(state) {
  const M = monthMap(state, todayISO());
  return M.next;
}

export { toUSD };
