// الديون: إلك عند الناس (theyOwe) وعليك للناس (iOwe)، مع الدفعات وأثرها على المحافظ
import { h, fill, openSheet, confirmSheet, toast, field, segmented, icon, selectButton, dateButton } from './ui.js';
import { accountOpts, currencyPicker, live } from './forms.js';
import { store, uid } from './store.js';
import { CURRENCIES, CODES, fmt, parseAmount, toUSD } from './money.js';
import { todayISO, dayLabel } from './dates.js';
import { debtPaid, debtRemaining } from './calc.js';

const cleanNum = (n) => String(+Number(n).toPrecision(8));
const isMonth = (m) => /^\d{4}-\d{2}$/.test(m || '');
const toUSDorNull = (st, amount, cur) => {
  const v = toUSD(st, amount, cur);
  return Number.isFinite(v) ? v : null;
};

// عنوان حركة الدين بالعمليات، من اتجاه المصاري ونوعها
export function debtTxTitle(t, debt) {
  const person = debt?.person || '؟';
  if (t.initial) return t.flow === 'out' ? `أعطيت ${person} دين` : `استلفت من ${person}`;
  return t.flow === 'in' ? `رجّعلي ${person}` : `سددت لـ ${person}`;
}

function sameCurrencyAccounts(currency) {
  return store.state.accounts.filter((a) => a.currency === currency);
}

function statusText(debt) {
  const cur = debt.currency;
  const paid = debtPaid(debt);
  const rem = debtRemaining(debt);
  if (rem < 0.005) return debt.direction === 'theyOwe' ? 'رجع الدين كامل.' : 'سددت الدين كامل.';
  if (paid < 0.005) return `الباقي ${fmt(rem, cur)}.`;
  const verb = debt.direction === 'theyOwe' ? 'رجع' : 'سددت';
  return `${verb} ${fmt(paid, cur)} من ${fmt(debt.amount, cur)}، والباقي ${fmt(rem, cur)}.`;
}

/* ---------- دين جديد أو تعديل ---------- */
export function openDebtForm(debt = null, direction = 'theyOwe') {
  const editing = Boolean(debt);
  const hasPayments = editing && (debt.payments || []).length > 0;
  const d = {
    direction: debt?.direction || direction, person: debt?.person || '', amount: debt ? cleanNum(debt.amount) : '',
    currency: debt?.currency || 'USD', date: debt?.date || todayISO(), due: debt?.due || '', note: debt?.note || '',
    move: !editing, accountId: null,
  };
  let title = 'دين جديد';
  if (editing) title = debt.direction === 'theyOwe' ? `دين عند ${debt.person}` : `دين لـ ${debt.person}`;

  openSheet(title, (body, close) => {
    let err = null;

    function render() {
      const accs = sameCurrencyAccounts(d.currency);
      if (!accs.some((a) => a.id === d.accountId)) d.accountId = accs[0]?.id || null;
      const theyOwe = d.direction === 'theyOwe';
      err = h('p', { class: 'form-error', role: 'alert' });

      let moveBlock = null;
      if (!editing) {
        moveBlock = accs.length
          ? [
            h('label', { class: 'check' },
              h('input', { type: 'checkbox', checked: d.move, onchange: (e) => { d.move = e.target.checked; render(); } }),
              theyOwe ? 'طلعت المصاري من محفظة' : 'دخلت المصاري على محفظة'),
            d.move ? field('المحفظة', selectButton({ value: d.accountId, options: accountOpts({ currency: d.currency }), title: 'المحفظة', onChange: (v) => { d.accountId = v; render(); } })) : null,
          ]
          : h('p', { class: 'hint' }, `ما عندك محفظة بـ ${CURRENCIES[d.currency].name}، فرصيد المحافظ ما رح يتغيّر.`);
      }

      fill(body, [
        editing
          ? h('p', { class: 'plan-status' }, statusText(debt))
          : segmented([{ value: 'theyOwe', label: 'إلي عند حدا' }, { value: 'iOwe', label: 'علي لحدا' }], d.direction, (v) => { d.direction = v; render(); }, 'نوع الدين'),
        field(theyOwe ? 'مين أخد منك؟' : 'مين أعطاك؟', h('input', { type: 'text', value: d.person, placeholder: 'الاسم', 'data-autofocus': !editing, oninput: (e) => { d.person = e.target.value; } })),
        h('div', { class: 'two' },
          field('المبلغ', h('input', { type: 'text', inputmode: 'decimal', value: d.amount, placeholder: '0', oninput: (e) => { d.amount = e.target.value; } })),
          field('العملة', currencyPicker(d.currency, (v) => { d.currency = v; render(); }, { disabled: hasPayments }))),
        h('div', { class: 'two' },
          field('التاريخ', dateButton({ value: d.date, onChange: (v) => { d.date = v; render(); } })),
          field(theyOwe ? 'إيمتى بيرجع؟' : 'إيمتى لازم تسدّه؟', dateButton({ value: d.due, mode: 'month', placeholder: 'بلا موعد', allowEmpty: true, onChange: (v) => { d.due = v; render(); } }))),
        h('p', { class: 'hint' }, theyOwe
          ? 'الموعد اختياري. إذا حطيته، بينحسب بالخطة كمبلغ راجع إلك بهالشهر.'
          : 'الموعد اختياري. إذا حطيته، بينحسب بالخطة كالتزام بهالشهر.'),
        moveBlock,
        field('ملاحظة', h('input', { type: 'text', value: d.note, placeholder: 'اختياري', oninput: (e) => { d.note = e.target.value; } })),
        err,
        h('button', { class: 'btn block', type: 'button', onclick: save }, 'حفظ الدين'),
        editing && debtRemaining(debt) > 0.005
          ? h('button', { class: 'btn violet block', type: 'button', onclick: () => { close(); setTimeout(() => openPaymentForm(debt), 320); } },
            debt.direction === 'theyOwe' ? 'رجّعلي جزء أو كامل' : 'سددت جزء أو كامل')
          : null,
        hasPayments ? paymentsList(debt, close) : null,
        editing ? h('button', { class: 'btn danger block', type: 'button', onclick: remove }, 'حذف الدين') : null,
      ]);
    }

    function save() {
      const person = d.person.trim();
      const amount = parseAmount(d.amount);
      if (!person) { err.textContent = 'اكتب الاسم.'; return; }
      if (!(amount > 0)) { err.textContent = 'اكتب المبلغ.'; return; }
      if (editing && amount < debtPaid(debt) - 0.005) { err.textContent = `المبلغ أقل من اللي اندفع (${fmt(debtPaid(debt), debt.currency)}).`; return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) { err.textContent = 'اختار التاريخ.'; return; }
      const st = store.state;
      const rec = {
        ...(debt || {}), id: debt?.id || uid('debt'), direction: d.direction, person, amount,
        currency: hasPayments ? debt.currency : d.currency, date: d.date, due: isMonth(d.due) ? d.due : null,
        note: d.note.trim(), payments: debt?.payments || [], createdAt: debt?.createdAt || Date.now(),
      };
      store.update((s) => {
        const i = s.debts.findIndex((x) => x.id === rec.id);
        if (i >= 0) s.debts[i] = rec; else s.debts.push(rec);
        if (!editing && d.move && d.accountId) {
          const txId = uid('tx');
          rec.startTxId = txId;
          s.transactions.push({
            id: txId, type: 'debt', debtId: rec.id, flow: rec.direction === 'theyOwe' ? 'out' : 'in', initial: true,
            accountId: d.accountId, amount, usd: toUSDorNull(st, amount, rec.currency), date: rec.date, note: person, createdAt: Date.now(),
          });
        }
        // إذا تعدّل المبلغ أو التاريخ، منعدّل حركة المحفظة الأولى كمان
        if (editing && rec.startTxId) {
          const t = s.transactions.find((x) => x.id === rec.startTxId);
          if (t) Object.assign(t, { amount, date: rec.date, usd: toUSDorNull(st, amount, rec.currency) });
        }
      });
      close();
      toast(editing ? 'انحفظ الدين' : 'انضاف الدين');
    }

    async function remove() {
      const ok = await confirmSheet('حذف الدين؟', 'رح ينحذف الدين وكل حركاته من المحافظ.', 'احذف');
      if (!ok) return;
      store.update((s) => {
        s.debts = s.debts.filter((x) => x.id !== debt.id);
        s.transactions = s.transactions.filter((t) => t.debtId !== debt.id);
      });
      close();
      toast('انحذف الدين');
    }

    render();
  });
}

function paymentsList(debt, close) {
  const cur = debt.currency;
  return h('div', { class: 'field' },
    h('span', { class: 'field-label' }, debt.direction === 'theyOwe' ? 'الدفعات اللي رجعت' : 'الدفعات اللي سددتها'),
    h('div', { class: 'rows sheet-rows' }, debt.payments.map((p) => h('div', { class: 'row' },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, fmt(p.amount, cur)),
        h('span', { class: 'row-sub' }, dayLabel(p.date))),
      h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': `حذف دفعة ${dayLabel(p.date)}`,
        onclick: async () => {
          close();
          await new Promise((r) => setTimeout(r, 320));
          const ok = await confirmSheet('حذف الدفعة؟', `رح تنحذف دفعة ${fmt(p.amount, cur)}، ويرجع المبلغ للباقي.`, 'احذف');
          if (!ok) return;
          store.update((s) => {
            const x = s.debts.find((k) => k.id === debt.id);
            if (x) x.payments = x.payments.filter((k) => k.id !== p.id);
            s.transactions = s.transactions.filter((t) => t.id !== p.txId);
          });
          toast('انحذفت الدفعة');
        },
      }, icon('close', 18))))));
}

/* ---------- دفعة: رجّعلي / سددت ---------- */
export function openPaymentForm(debt) {
  const rem = debtRemaining(debt);
  const accs = sameCurrencyAccounts(debt.currency);
  const d = { amount: cleanNum(rem), date: todayISO(), accountId: accs[0]?.id || '' };
  const theyOwe = debt.direction === 'theyOwe';
  openSheet(theyOwe ? `رجّعلي ${debt.person}` : `سددت لـ ${debt.person}`, (body, close) => {
    const err = h('p', { class: 'form-error', role: 'alert' });
    const c = CURRENCIES[debt.currency];
    const amountInput = h('input', {
      class: 'amount-input', type: 'text', inputmode: 'decimal', value: d.amount, 'data-autofocus': true,
      'aria-label': `المبلغ بـ ${c.name}`, oninput: (e) => { d.amount = e.target.value; },
    });
    const sym = h('span', { class: 'amount-cur' }, c.symbol);
    fill(body, [
      h('p', { class: 'hint' }, `الباقي ${fmt(rem, debt.currency)}.`),
      h('div', { class: 'amount-wrap' }, c.prefix ? [sym, amountInput] : [amountInput, sym]),
      field(theyOwe ? 'دخلت المصاري على' : 'طلعت المصاري من', live((refresh) => selectButton({
        value: d.accountId, title: 'المحفظة',
        options: [...accountOpts({ currency: debt.currency }), { value: '', label: 'ولا محفظة', sub: 'رصيد المحافظ ما بيتغيّر', icon: 'close', tint: 'slate' }],
        onChange: (v) => { d.accountId = v; refresh(); },
      }))),
      field('التاريخ', live((refresh) => dateButton({ value: d.date, onChange: (v) => { d.date = v; refresh(); } }))),
      err,
      h('button', { class: 'btn violet block', type: 'button', onclick: save }, 'حفظ الدفعة'),
    ]);

    function save() {
      const amount = parseAmount(d.amount);
      if (!(amount > 0)) { err.textContent = 'اكتب المبلغ.'; return; }
      if (amount > rem + 0.005) { err.textContent = `المبلغ أكتر من الباقي (${fmt(rem, debt.currency)}).`; return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) { err.textContent = 'اختار التاريخ.'; return; }
      const st = store.state;
      const paymentId = uid('pay');
      const txId = d.accountId ? uid('tx') : null;
      store.update((s) => {
        const x = s.debts.find((k) => k.id === debt.id);
        if (!x) return;
        x.payments = [...(x.payments || []), { id: paymentId, amount, date: d.date, txId }];
        if (txId) {
          s.transactions.push({
            id: txId, type: 'debt', debtId: debt.id, paymentId, flow: theyOwe ? 'in' : 'out',
            accountId: d.accountId, amount, usd: toUSDorNull(st, amount, debt.currency), date: d.date, note: debt.person, createdAt: Date.now(),
          });
        }
      });
      close();
      const left = rem - amount;
      toast(left < 0.005 ? 'خلص الدين' : `انسجلت الدفعة. الباقي ${fmt(left, debt.currency)}`);
    }
  });
}
