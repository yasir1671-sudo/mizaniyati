// لوحة الإضافة السريعة: أزرار أرقام (مع جمع وطرح)، أيقونات الفئات، المحفظة والتاريخ
import { h, icon, fill, openSheet, toast, haptic, segmented, openPicker, openDatePicker } from './ui.js';
import { badge } from './icons.js';
import { store, uid, catLabel } from './store.js';
import { CURRENCIES, fmt, fmtNumber, rateOf, fromUSD } from './money.js';
import { debtRemaining } from './calc.js';
import { creditGoalForDebt, uncreditGoal } from './planner.js';
import { todayISO, dayLabel } from './dates.js';
import { openTxForm, accountOpts } from './forms.js';

const TYPES = [
  { value: 'expense', label: 'مصروف', icon: 'arrowDown' },
  { value: 'income', label: 'دخل', icon: 'arrowUp' },
  { value: 'transfer', label: 'تحويل', icon: 'swap' },
];

// حساب بسيط: أرقام مع + و − من اليسار لليمين
function evaluate(expr) {
  const parts = String(expr).match(/[+−]|[0-9.]+/g) || [];
  let total = 0;
  let op = '+';
  for (const p of parts) {
    if (p === '+' || p === '−') { op = p; continue; }
    const n = Number(p);
    if (!Number.isFinite(n)) continue;
    total = op === '+' ? total + n : total - n;
  }
  return Math.round(total * 100) / 100;
}

export function openAddSheet(prefill = {}) {
  const st = store.state;
  if (!st.accounts.length) { toast('ضيف محفظة أول من قسم المال.', { kind: 'warn' }); return; }
  const def = st.accounts.find((a) => a.id === st.settings.defaultAccountId) || st.accounts[0];
  const d = {
    type: prefill.type || 'expense',
    expr: prefill.amount ? String(prefill.amount) : '',
    accountId: st.accounts.some((a) => a.id === prefill.accountId) ? prefill.accountId : def.id,
    categoryId: prefill.categoryId || null,
    date: prefill.date || todayISO(),
    note: prefill.note || '',
    sourceId: prefill.sourceId || null,
    recurringId: prefill.recurringId || null,
    debtId: prefill.debtId || null,
    showNote: Boolean(prefill.note),
  };
  // فئة سداد الدين: بتطلع أسماء الناس، والعملية بتنسجل كدفعة على دينهم
  const DEBT_CAT = { income: 'inc_debt', expense: 'cat_debtpay' };
  const debtMode = () => d.categoryId === DEBT_CAT[d.type];

  openSheet('عملية جديدة', (body, close) => {
    let valEl = null;
    let exprEl = null;

    const currency = () => store.state.accounts.find((a) => a.id === d.accountId)?.currency || 'USD';

    function refreshAmount() {
      const v = evaluate(d.expr);
      const hasOp = /[+−]/.test(d.expr);
      valEl.textContent = d.expr ? fmt(v, currency(), { reveal: true }) : fmt(0, currency(), { reveal: true });
      valEl.classList.toggle('dim', !d.expr);
      exprEl.textContent = hasOp ? d.expr : '';
    }

    function press(k) {
      haptic('tap');
      let e = d.expr;
      if (k === 'del') e = e.slice(0, -1);
      else if (k === '+' || k === '−') {
        if (!e) return;
        e = /[+−]$/.test(e) ? e.slice(0, -1) + k : e + k;
      } else if (k === '.') {
        const last = e.split(/[+−]/).pop();
        if (last.includes('.')) return;
        e += last === '' ? '0.' : '.';
      } else {
        const last = e.split(/[+−]/).pop();
        if (last.replace('.', '').length >= 9) return;
        if (last === '0' && k !== '.') e = e.slice(0, -1);
        e += k;
      }
      d.expr = e;
      refreshAmount();
    }

    function render() {
      const s = store.state;
      const cats = s.categories.filter((c) => c.type === d.type);
      if (!cats.some((c) => c.id === d.categoryId)) d.categoryId = null;
      valEl = h('div', { class: 'val' });
      exprEl = h('div', { class: 'expr' });
      const acc = s.accounts.find((a) => a.id === d.accountId);

      const catGrid = h('div', { class: 'cat-scroll', role: 'group', 'aria-label': 'الفئة' },
        cats.map((c) => h('button', {
          type: 'button', class: 'cat-choice', 'aria-pressed': String(c.id === d.categoryId),
          onclick: (e) => {
            haptic('select');
            const wasDebt = debtMode();
            d.categoryId = c.id;
            if (wasDebt || debtMode()) { render(); return; }
            for (const b of catGrid.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
          },
        }, badgeWithTint(c), h('span', null, c.name))));

      // مين رجّعلك / لمين سددت
      let peopleRow = null;
      if (debtMode()) {
        const dir = d.type === 'income' ? 'theyOwe' : 'iOwe';
        const open = s.debts.filter((x) => x.direction === dir && debtRemaining(x) > 0.005);
        if (!open.some((x) => x.id === d.debtId)) d.debtId = open[0]?.id || null;
        peopleRow = open.length
          ? h('div', { class: 'people-row', role: 'group', 'aria-label': dir === 'theyOwe' ? 'مين رجّعلك؟' : 'لمين سددت؟' },
            h('span', { class: 'people-label' }, dir === 'theyOwe' ? 'مين رجّعلك؟' : 'لمين سددت؟'),
            open.map((x) => h('button', {
              type: 'button', class: 'chip', 'aria-pressed': String(x.id === d.debtId),
              onclick: () => { haptic('select'); d.debtId = x.id; render(); },
            }, x.person, h('small', null, fmt(debtRemaining(x), x.currency)))))
          : h('p', { class: 'hint' }, dir === 'theyOwe' ? 'ما في حدا مسجّل إلك عنده دين. بتنسجل كدخل عادي.' : 'ما في دين مسجّل عليك. بتنسجل كمصروف عادي.');
      }

      const noteInput = d.showNote
        ? h('input', { type: 'text', value: d.note, placeholder: 'ملاحظة (اختياري)', oninput: (e) => { d.note = e.target.value; }, style: { marginBottom: '10px' } })
        : null;

      const key = (label, k, cls = '') => h('button', { type: 'button', class: `key ${cls}`.trim(), onclick: () => press(k), 'aria-label': k === 'del' ? 'امسح' : String(label) }, label);

      fill(body, [
        h('div', { class: 'add-type' }, segmented(TYPES, d.type, (v) => {
          if (v === 'transfer') {
            close();
            const amt = evaluate(d.expr);
            setTimeout(() => openTxForm({ type: 'transfer', prefill: { amount: amt > 0 ? amt : undefined, accountId: d.accountId } }), 320);
            return;
          }
          d.type = v;
          render();
        }, 'نوع العملية')),
        h('div', { class: 'add-amount' }, valEl, exprEl),
        h('div', { class: 'add-meta' },
          h('button', {
            type: 'button', class: 'meta-chip', 'aria-label': `المحفظة: ${acc?.name || ''}`,
            onclick: () => openPicker({ title: 'المحفظة', options: accountOpts(), value: d.accountId, onPick: (v) => { d.accountId = v; render(); } }),
          }, icon('wallet', 16), acc?.name || ''),
          h('button', {
            type: 'button', class: 'meta-chip', 'aria-label': `التاريخ: ${dayLabel(d.date)}`,
            onclick: () => openDatePicker({ value: d.date, onPick: (v) => { d.date = v; render(); } }),
          }, icon('calendar', 16), dayLabel(d.date)),
          h('button', { type: 'button', class: 'meta-chip', onclick: () => { d.showNote = !d.showNote; render(); } }, icon('note', 16), d.note ? 'الملاحظة' : 'ملاحظة'),
          h('button', { type: 'button', class: 'meta-chip', 'aria-label': 'تفاصيل أكتر: سعر الصرف وغيره', onclick: () => more() }, icon('sliders', 16))),
        noteInput,
        catGrid,
        peopleRow,
        h('div', { class: 'keypad' },
          key('7', '7'), key('8', '8'), key('9', '9'), key(icon('backspace', 22), 'del', 'op'),
          key('4', '4'), key('5', '5'), key('6', '6'), key('+', '+', 'op'),
          key('1', '1'), key('2', '2'), key('3', '3'), key('−', '−', 'op'),
          key('.', '.'), key('0', '0'), key('00', '00'),
          h('button', { type: 'button', class: 'key save', 'aria-label': 'حفظ', onclick: save }, icon('check', 22, { stroke: 2.4 }))),
      ]);
      refreshAmount();
    }

    // باختيار الفئة منفرجي الاسم والأيقونة الحقيقية حتى للفئة الخاصة
    function badgeWithTint(c) {
      return badge(c.icon, c.tint, 46);
    }

    function more() {
      const amt = evaluate(d.expr);
      close();
      setTimeout(() => openTxForm({ type: d.type, prefill: { amount: amt > 0 ? amt : undefined, accountId: d.accountId, categoryId: d.categoryId, note: d.note, date: d.date, sourceId: d.sourceId } }), 320);
    }

    function save() {
      const s = store.state;
      const amount = evaluate(d.expr);
      if (!(amount > 0)) { haptic('warn'); toast('اكتب المبلغ أول.', { kind: 'warn' }); return; }
      const cur = currency();
      const rate = rateOf(s, cur);
      if (!rate) { toast(`حدد سعر ${CURRENCIES[cur].name}.`, { kind: 'warn' }); more(); return; }
      if (debtMode() && d.debtId) { saveDebtPayment(amount, cur, rate); return; }
      const categoryId = d.categoryId || (d.type === 'income' ? 'inc_other' : 'cat_other');
      const tx = {
        id: uid('tx'), type: d.type, date: d.date, accountId: d.accountId, amount, categoryId,
        note: d.note.trim(), usd: amount / rate, createdAt: Date.now(),
        ...(d.sourceId ? { sourceId: d.sourceId } : {}), ...(d.recurringId ? { recurringId: d.recurringId } : {}),
      };
      store.update((x) => { x.transactions.push(tx); });
      close();
      haptic('success');
      const c = s.categories.find((x) => x.id === categoryId);
      toast(`${d.type === 'income' ? 'انضاف دخل' : 'انضاف'} ${fmt(amount, cur)} على ${catLabel(c)}`, {
        action: 'تراجع', onAction: () => store.update((x) => { x.transactions = x.transactions.filter((t) => t.id !== tx.id); }),
      });
    }

    // دفعة على دين: بتنقص الباقي، وبتحرّك المحفظة
    function saveDebtPayment(amount, cur, rate) {
      const s = store.state;
      const debt = s.debts.find((x) => x.id === d.debtId);
      if (!debt) return;
      const usd = amount / rate;
      const debtAmt = debt.currency === cur ? amount : fromUSD(s, usd, debt.currency);
      if (!Number.isFinite(debtAmt)) { toast(`حدد سعر ${CURRENCIES[debt.currency].name}.`, { kind: 'warn' }); return; }
      const rem = debtRemaining(debt);
      if (debtAmt > rem * 1.005 + 0.01) { haptic('warn'); toast(`المبلغ أكتر من الباقي على ${debt.person} (${fmt(rem, debt.currency)}).`, { kind: 'warn' }); return; }
      const paymentId = uid('pay');
      const txId = uid('tx');
      const theyOwe = debt.direction === 'theyOwe';
      let credit = null;
      store.update((x) => {
        const dd = x.debts.find((k) => k.id === debt.id);
        // الدين المربوط بهدف: اللي رجع بينضاف للهدف لحاله
        if (theyOwe) credit = creditGoalForDebt(x, debt.id, usd);
        dd.payments = [...(dd.payments || []), { id: paymentId, amount: Math.min(rem, Math.round(debtAmt * 100) / 100), date: d.date, txId, ...(credit ? { goalCredit: credit } : {}) }];
        x.transactions.push({
          id: txId, type: 'debt', debtId: debt.id, paymentId, flow: theyOwe ? 'in' : 'out',
          accountId: d.accountId, amount, usd, date: d.date, note: d.note.trim() || debt.person, createdAt: Date.now(),
        });
      });
      close();
      haptic('success');
      const left = rem - debtAmt;
      const msg = left < 0.5 ? `خلص دين ${debt.person}` : `${theyOwe ? `رجّعلك ${debt.person}` : `سددت لـ ${debt.person}`} ${fmt(amount, cur)}. الباقي ${fmt(left, debt.currency)}`;
      toast(credit ? `${msg}. وانضاف لهدف «${credit.name}»` : msg, {
        action: 'تراجع',
        onAction: () => store.update((x) => {
          const dd = x.debts.find((k) => k.id === debt.id);
          if (dd) dd.payments = (dd.payments || []).filter((p) => p.id !== paymentId);
          x.transactions = x.transactions.filter((t) => t.id !== txId);
          if (credit) uncreditGoal(x, credit);
        }),
      });
    }

    render();
  });
}

export { fmtNumber };
