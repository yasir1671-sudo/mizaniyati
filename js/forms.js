// نماذج الإضافة والتعديل: العمليات، المحافظ، مصادر الدخل، الفئات، أسعار الصرف
import { h, icon, fill, openSheet, confirmSheet, toast, field, segmented, iconPicker, haptic, selectButton, dateButton, dayButton } from './ui.js';
import { badge, CATEGORY_ICON_CHOICES, ITEM_ICON_CHOICES, GOAL_ICON_CHOICES, TINT_KEYS, tintHex } from './icons.js';
import { store, uid, PROTECTED_CATEGORIES } from './store.js';
import { CURRENCIES, CODES, rateOf, toUSD, fromUSD, fmt, numText, parseAmount, roundTo } from './money.js';
import { todayISO, currentMonth, addMonths, monthLabel, monthsText, txCountText } from './dates.js';
import { refreshRates } from './rates.js';
import { buildPlan, scheduleText, statusClass, goalMonthly, itemUSD } from './planner.js';
import { purchaseSuggestions, impact } from './advisor.js';
import { suggestionCard } from './suggest.js';

export const INCOME_KINDS = {
  salary: { label: 'راتب', icon: 'briefcase', tint: 'mint', placeholder: 'مثلاً: راتب الشغل' },
  stocks: { label: 'أسهم', icon: 'trend', tint: 'blue', placeholder: 'مثلاً: أرباح الأسهم' },
  extra: { label: 'دخل إضافي', icon: 'toolbox', tint: 'amber', placeholder: 'مثلاً: شغل جانبي' },
  debt: { label: 'دين إلي', icon: 'exchange', tint: 'violet', placeholder: 'مثلاً: دين عند فلان' },
  other: { label: 'غير ذلك', icon: 'plusCircle', tint: 'slate', placeholder: 'اسم مصدر الدخل' },
};

const TX_TYPES = [
  { value: 'expense', label: 'مصروف' },
  { value: 'income', label: 'دخل' },
  { value: 'transfer', label: 'تحويل' },
];
const SAVE_LABEL = { expense: 'حفظ المصروف', income: 'حفظ الدخل', transfer: 'حفظ التحويل' };

const accountById = (id) => store.state.accounts.find((a) => a.id === id);
const currencyOf = (id) => accountById(id)?.currency || 'USD';
const cleanNum = (n) => String(+Number(n).toPrecision(8));

function upsert(list, rec) {
  const i = list.findIndex((x) => x.id === rec.id);
  if (i >= 0) list[i] = rec; else list.push(rec);
}

// يرجّع غرض الخطة من «اشتريته» لـ «مخطط»
function revertItem(it) {
  it.status = 'planned';
  delete it.boughtUSD;
  delete it.boughtMonth;
  delete it.boughtAt;
  delete it.txId;
}

/* ---------- خيارات للنوافذ (بدل قوائم كروم) ---------- */
export const CUR_ICON = { USD: 'cash', TRY: 'coins', SYP: 'bank' };
export const CUR_TINT = { USD: 'mint', TRY: 'coral', SYP: 'gold' };

export function accountOpts({ exclude = null, currency = null } = {}) {
  return store.state.accounts
    .filter((a) => a.id !== exclude && (!currency || a.currency === currency))
    .map((a) => ({ value: a.id, label: a.name, sub: `${CURRENCIES[a.currency].name}${a.savings ? '، ادخار' : ''}`, icon: CUR_ICON[a.currency] || 'wallet', tint: CUR_TINT[a.currency] || 'slate' }));
}
export function currencyOpts() {
  return CODES.map((c) => ({ value: c, label: CURRENCIES[c].name, sub: CURRENCIES[c].symbol, icon: CUR_ICON[c], tint: CUR_TINT[c] }));
}
export function currencyPicker(value, onChange, { disabled = false } = {}) {
  return selectButton({ value, options: currencyOpts(), onChange, title: 'العملة', disabled });
}

// عنصر بيعيد بناء حاله لما تتغيّر قيمته (للنماذج اللي ما إلها render)
export function live(make) {
  let el = null;
  const rebuild = () => {
    const next = make(rebuild);
    if (el) el.replaceWith(next);
    el = next;
    return next;
  };
  return rebuild();
}

function accountSelect(value, onChange, excludeId) {
  return selectButton({ value, options: accountOpts({ exclude: excludeId }), onChange, title: 'المحفظة' });
}

function convert(st, amount, from, to) {
  return fromUSD(st, toUSD(st, amount, from), to);
}

function exchangeText(from, a, to, b) {
  if (from === 'USD') return `سعر التصريف: الدولار بـ ${numText(b / a)} ${CURRENCIES[to].symbol}`;
  if (to === 'USD') return `سعر التصريف: الدولار بـ ${numText(a / b)} ${CURRENCIES[from].symbol}`;
  return `كل 1 ${CURRENCIES[from].symbol} بـ ${numText(b / a)} ${CURRENCIES[to].symbol}`;
}

/* ---------- عملية: مصروف / دخل / تحويل ---------- */
export function openTxForm({ tx = null, type = 'expense', prefill = {} } = {}) {
  const st = store.state;
  if (!st.accounts.length) { toast('ضيف محفظة أول من قسم المحافظ.'); return; }
  const editing = Boolean(tx);
  const defAcc = accountById(st.settings.defaultAccountId) || st.accounts[0];
  const d = editing
    ? {
      type: tx.type, amount: cleanNum(tx.amount), accountId: tx.accountId, toAccountId: tx.toAccountId || null,
      toAmount: tx.toAmount != null ? cleanNum(tx.toAmount) : '', categoryId: tx.categoryId || null,
      date: tx.date, note: tx.note || '', rate: tx.type !== 'transfer' && tx.usd > 0 ? cleanNum(tx.amount / tx.usd) : '',
      toTouched: true, adopt: false,
    }
    : {
      type, amount: prefill.amount != null ? cleanNum(prefill.amount) : '', accountId: prefill.accountId || defAcc.id,
      toAccountId: null, toAmount: '', categoryId: prefill.categoryId || null, date: prefill.date || todayISO(),
      note: prefill.note || '', rate: '', toTouched: false, adopt: true, sourceId: prefill.sourceId || null,
    };

  const EDIT_TITLE = { expense: 'تعديل المصروف', income: 'تعديل الدخل', transfer: 'تعديل التحويل' };
  openSheet(editing ? EDIT_TITLE[tx.type] || 'تعديل العملية' : 'عملية جديدة', (body, close) => {
    let hintEl = null;
    let toInput = null;
    let errorEl = null;

    function normalizeDraft() {
      const s = store.state;
      if (!accountById(d.accountId)) d.accountId = s.accounts[0].id;
      if (d.type === 'transfer') {
        if (!d.toAccountId || d.toAccountId === d.accountId || !accountById(d.toAccountId)) {
          d.toAccountId = s.accounts.find((a) => a.id !== d.accountId)?.id || null;
        }
      } else {
        if (!s.categories.some((c) => c.type === d.type && c.id === d.categoryId)) d.categoryId = null;
        const cur = currencyOf(d.accountId);
        if (cur !== 'USD' && !d.rate) {
          const r = rateOf(s, cur);
          d.rate = r ? cleanNum(r) : '';
        }
      }
    }

    function render() {
      normalizeDraft();
      const s = store.state;
      const cur = currencyOf(d.accountId);
      const c = CURRENCIES[cur];
      const amountInput = h('input', {
        class: 'amount-input', type: 'text', inputmode: 'decimal', placeholder: '0', value: d.amount,
        'aria-label': `المبلغ بـ ${c.name}`, 'data-autofocus':!editing,
        oninput: (e) => { d.amount = e.target.value; refreshHints(); },
      });
      const sym = h('span', { class: 'amount-cur' }, c.symbol);
      // بالتعديل ما في داعي نبدّل النوع: المصروف بيضل مصروف
      const nodes = [
        editing ? null : segmented(TX_TYPES, d.type, (v) => { d.type = v; render(); }, 'نوع العملية'),
        h('div', { class: 'amount-wrap' }, c.prefix ? [sym, amountInput] : [amountInput, sym]),
      ];
      hintEl = null;
      toInput = null;

      if (d.type === 'transfer') {
        if (s.accounts.length < 2) nodes.push(h('p', { class: 'hint' }, 'لازم يكون عندك محفظتين على الأقل مشان تحوّل بيناتهم.'));
        nodes.push(h('div', { class: 'two' },
          field('من محفظة', accountSelect(d.accountId, (v) => { d.accountId = v; d.toTouched = false; render(); })),
          field('إلى محفظة', accountSelect(d.toAccountId, (v) => { d.toAccountId = v; d.toTouched = false; render(); }, d.accountId))));
        const toCur = currencyOf(d.toAccountId);
        if (d.toAccountId && toCur !== cur) {
          toInput = h('input', {
            type: 'text', inputmode: 'decimal', value: d.toAmount, placeholder: '0',
            oninput: (e) => { d.toAmount = e.target.value; d.toTouched = true; refreshHints(); },
          });
          hintEl = h('span', { class: 'field-hint' });
          nodes.push(h('label', { class: 'field' },
            h('span', { class: 'field-label' }, `المبلغ اللي وصلك بـ ${CURRENCIES[toCur].name}`), toInput, hintEl));
          const other = cur === 'USD' ? toCur : toCur === 'USD' ? cur : null;
          if (other && s.rates[other]?.mode === 'manual') {
            nodes.push(h('label', { class: 'check' },
              h('input', { type: 'checkbox', checked: d.adopt, onchange: (e) => { d.adopt = e.target.checked; } }),
              `اعتمد سعر هالتصريف كسعر ${CURRENCIES[other].name}`));
          }
        }
      } else {
        nodes.push(field(d.type === 'income' ? 'إلى محفظة' : 'من محفظة',
          accountSelect(d.accountId, (v) => { d.accountId = v; d.rate = ''; render(); })));
        if (cur !== 'USD') {
          hintEl = h('span', { class: 'field-hint' });
          nodes.push(h('label', { class: 'field' },
            h('span', { class: 'field-label' }, `سعر الدولار بـ ${c.name}`),
            h('input', { type: 'text', inputmode: 'decimal', value: d.rate, placeholder: 'اكتب السعر', oninput: (e) => { d.rate = e.target.value; refreshHints(); } }),
            hintEl));
        }
        const cats = s.categories.filter((x) => x.type === d.type);
        const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'الفئة' },
          cats.map((x) => h('button', {
            type: 'button', class: 'chip', 'aria-pressed': String(x.id === d.categoryId),
            onclick: (e) => {
              d.categoryId = x.id;
              for (const b of chips.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
            },
          }, badge(x.icon, x.tint, 22), x.name)));
        nodes.push(h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الفئة'), chips));
      }

      nodes.push(h('div', { class: 'two' },
        field('التاريخ', dateButton({ value: d.date, onChange: (v) => { d.date = v; render(); } })),
        field('ملاحظة', h('input', { type: 'text', value: d.note, placeholder: 'اختياري', oninput: (e) => { d.note = e.target.value; } }))));
      errorEl = h('p', { class: 'form-error', role: 'alert' });
      nodes.push(errorEl, h('button', { class: 'btn block', type: 'button', onclick: save }, editing ? 'حفظ التعديل' : SAVE_LABEL[d.type]));
      if (editing) nodes.push(h('button', { class: 'btn danger block', type: 'button', onclick: remove }, 'حذف العملية'));
      fill(body, nodes);
      refreshHints();
    }

    function refreshHints() {
      const s = store.state;
      const amt = parseAmount(d.amount);
      const cur = currencyOf(d.accountId);
      if (d.type === 'transfer') {
        if (!toInput) return;
        const toCur = currencyOf(d.toAccountId);
        if (!d.toTouched) {
          const est = amt > 0 ? convert(s, amt, cur, toCur) : NaN;
          d.toAmount = Number.isFinite(est) ? cleanNum(roundTo(est, CURRENCIES[toCur].decimals)) : '';
          toInput.value = d.toAmount;
        }
        const to = parseAmount(d.toAmount);
        if (hintEl) hintEl.textContent = amt > 0 && to > 0 ? exchangeText(cur, amt, toCur, to) : 'اكتب المبلغ اللي استلمته فعلاً.';
      } else if (hintEl) {
        const r = parseAmount(d.rate);
        hintEl.textContent = amt > 0 && r > 0 ? `يعني ${fmt(amt / r, 'USD')}` : 'حط سعر الصرف مشان ينحسب بالدولار.';
      }
    }

    function save() {
      const s = store.state;
      const amount = parseAmount(d.amount);
      const cur = currencyOf(d.accountId);
      const fail = (msg) => { errorEl.textContent = msg; };
      if (!(amount > 0)) return fail('اكتب مبلغ أكبر من صفر.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return fail('اختار التاريخ.');
      const rec = {
        id: tx?.id || uid('tx'), type: d.type, date: d.date, accountId: d.accountId, amount,
        note: d.note.trim(), createdAt: tx?.createdAt || Date.now(),
      };
      if (tx?.planItemId) rec.planItemId = tx.planItemId;
      if (tx?.noDaily) rec.noDaily = true;
      const sourceId = tx?.sourceId || d.sourceId;
      if (sourceId && d.type === 'income') rec.sourceId = sourceId;
      let adopt = null;
      if (d.type === 'transfer') {
        if (!d.toAccountId || d.toAccountId === d.accountId) return fail('اختار محفظة ثانية تحوّل لها.');
        const toCur = currencyOf(d.toAccountId);
        const toAmount = toCur === cur ? amount : parseAmount(d.toAmount);
        if (!(toAmount > 0)) return fail('اكتب المبلغ اللي وصلك.');
        rec.toAccountId = d.toAccountId;
        rec.toAmount = toAmount;
        const usd = cur === 'USD' ? amount : toCur === 'USD' ? toAmount : toUSD(s, amount, cur);
        rec.usd = Number.isFinite(usd) ? usd : null;
        if (d.adopt && toCur !== cur) {
          if (cur === 'USD' && s.rates[toCur]?.mode === 'manual') adopt = [toCur, toAmount / amount];
          else if (toCur === 'USD' && s.rates[cur]?.mode === 'manual') adopt = [cur, amount / toAmount];
        }
      } else {
        let rate = 1;
        if (cur !== 'USD') {
          rate = parseAmount(d.rate);
          if (!(rate > 0)) return fail(`حط سعر الدولار بـ ${CURRENCIES[cur].name}.`);
          if (!rateOf(s, cur)) adopt = [cur, rate];
        }
        rec.categoryId = d.categoryId || (d.type === 'income' ? 'inc_other' : 'cat_other');
        rec.usd = amount / rate;
      }
      store.update((x) => {
        upsert(x.transactions, rec);
        if (adopt) x.rates[adopt[0]] = { ...x.rates[adopt[0]], rate: adopt[1], at: Date.now() };
        const it = rec.planItemId && rec.type === 'expense' ? x.planItems.find((i) => i.id === rec.planItemId) : null;
        if (it) Object.assign(it, { boughtUSD: rec.usd, boughtMonth: rec.date.slice(0, 7), boughtAt: rec.date });
      });
      close();
      if (editing) toast('انحفظ التعديل');
      else if (rec.type === 'transfer') toast('انحفظ التحويل');
      else toast(`${rec.type === 'income' ? 'انضاف دخل' : 'انضاف مصروف'} ${fmt(amount, cur)}`);
    }

    async function remove() {
      const item = tx.planItemId ? store.state.planItems.find((i) => i.id === tx.planItemId) : null;
      const msg = item ? `رح تنشال هالعملية، و«${item.name}» بيرجع لقائمة المشتريات.` : 'رح تنشال هالعملية من كل الحسابات.';
      const ok = await confirmSheet('حذف العملية؟', msg, 'احذف');
      if (!ok) return;
      const snapshot = { ...tx };
      const itemSnap = item ? { ...item } : null;
      store.update((x) => {
        x.transactions = x.transactions.filter((t) => t.id !== tx.id);
        const it = item ? x.planItems.find((i) => i.id === item.id) : null;
        if (it) revertItem(it);
      });
      close();
      toast('انحذفت العملية', {
        action: 'تراجع',
        onAction: () => store.update((x) => {
          x.transactions.push(snapshot);
          if (itemSnap) upsert(x.planItems, itemSnap);
        }),
      });
    }

    render();
  });
}

/* ---------- محفظة ---------- */
export function openAccountForm(account = null) {
  const st = store.state;
  const editing = Boolean(account);
  const used = editing && st.transactions.some((t) => t.accountId === account.id || t.toAccountId === account.id);
  const d = {
    name: account?.name || '', currency: account?.currency || 'USD',
    opening: account ? cleanNum(account.opening || 0) : '', isDefault: editing && st.settings.defaultAccountId === account.id,
    savings: Boolean(account?.savings),
  };
  openSheet(editing ? 'تعديل المحفظة' : 'محفظة جديدة', (body, close) => {
    const err = h('p', { class: 'form-error', role: 'alert' });
    fill(body, [
      field('اسم المحفظة', h('input', { type: 'text', value: d.name, placeholder: 'مثلاً: كاش، بنك، شام كاش', 'data-autofocus':!editing, oninput: (e) => { d.name = e.target.value; } })),
      field('العملة', live((refresh) => currencyPicker(d.currency, (v) => { d.currency = v; refresh(); }, { disabled: used })), used ? 'ما فيك تغيّر العملة لأن عليها عمليات.' : null),
      field('الرصيد الافتتاحي', h('input', { type: 'text', inputmode: 'decimal', value: d.opening, placeholder: '0', oninput: (e) => { d.opening = e.target.value; } }),
        'المبلغ اللي كان فيها قبل ما تبلّش تسجّل.'),
      h('div', { class: 'sheet-rows rows' },
        switchRow('المحفظة الافتراضية', 'المصاريف السريعة بتنسجل عليها.', d.isDefault, (v) => { d.isDefault = v; }),
        switchRow('محفظة ادخار', 'مصاريها محجوزة: ما بتنحسب بمصروف اليوم ولا بمصاري الشهر. التحويل إلها بينحسب ادخار.', d.savings, (v) => { d.savings = v; })),
      err,
      h('button', { class: 'btn block', type: 'button', onclick: save }, 'حفظ المحفظة'),
      editing ? h('button', { class: 'btn danger block', type: 'button', onclick: remove }, 'حذف المحفظة') : null,
    ]);

    function save() {
      const name = d.name.trim();
      if (!name) { err.textContent = 'اكتب اسم المحفظة.'; return; }
      const opening = d.opening === '' ? 0 : parseAmount(d.opening);
      if (!Number.isFinite(opening)) { err.textContent = 'الرصيد لازم يكون رقم.'; return; }
      const rec = { ...(account || {}), id: account?.id || uid('acc'), name, currency: used ? account.currency : d.currency, opening, savings: d.savings };
      store.update((s) => {
        upsert(s.accounts, rec);
        if (d.isDefault || !s.accounts.some((a) => a.id === s.settings.defaultAccountId)) s.settings.defaultAccountId = rec.id;
      });
      close();
      toast('انحفظت المحفظة');
    }

    async function remove() {
      if (used) { err.textContent = 'هالمحفظة عليها عمليات. احذف عملياتها أول، أو خليها.'; return; }
      const ok = await confirmSheet('حذف المحفظة؟', `رح تنحذف «${account.name}».`, 'احذف');
      if (!ok) return;
      store.update((s) => {
        s.accounts = s.accounts.filter((a) => a.id !== account.id);
        if (s.settings.defaultAccountId === account.id) s.settings.defaultAccountId = s.accounts[0]?.id || null;
      });
      close();
      toast('انحذفت المحفظة');
    }
  });
}

/* ---------- مصدر دخل ---------- */
export function openSourceForm(src = null) {
  const editing = Boolean(src);
  const srcParts = src?.parts?.length ? src.parts : [{ day: src?.day || 1, amount: src?.amount || 0 }];
  const d = {
    kind: src?.kind || 'salary', name: src?.name || '', amount: src ? cleanNum(src.amount) : '',
    currency: src?.currency || 'USD', schedule: src?.schedule || 'monthly', month: src?.month || currentMonth(),
    day: srcParts[0].day || 1,
    split: srcParts.length > 1,
    parts: srcParts.map((p) => ({ day: p.day || 1, amount: p.amount ? cleanNum(p.amount) : '' })),
  };
  openSheet(editing ? 'تعديل مصدر الدخل' : 'مصدر دخل جديد', (body, close) => {
    let err = null;
    let totalEl = null;
    const partsTotal = () => d.parts.reduce((s, p) => s + (parseAmount(p.amount) || 0), 0);
    function render() {
      const k = INCOME_KINDS[d.kind];
      err = h('p', { class: 'form-error', role: 'alert' });
      totalEl = h('p', { class: 'hint' });
      const partRows = d.split ? d.parts.map((p, i) => h('div', { class: 'part-row' },
        h('span', { class: 'part-n' }, `${i + 1}`),
        dayButtonInline(p.day, (v) => { p.day = v; render(); }),
        h('input', { type: 'text', inputmode: 'decimal', value: p.amount, placeholder: 'المبلغ', 'aria-label': `مبلغ الدفعة ${i + 1}`, oninput: (e) => { p.amount = e.target.value; refreshTotal(); } }),
        d.parts.length > 2 ? h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': `احذف الدفعة ${i + 1}`, onclick: () => { d.parts.splice(i, 1); render(); } }, icon('close', 18)) : null)) : null;
      // الديون صار إلها قسم لحالها (المال ← الديون)، منخبّي النوع القديم إلا إذا كان مستعمل
      const kinds = Object.entries(INCOME_KINDS).filter(([id]) => id !== 'debt' || d.kind === 'debt');
      fill(body, [
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'النوع'),
          h('div', { class: 'kind-grid', role: 'group', 'aria-label': 'نوع الدخل', style: { '--n': String(kinds.length) } },
            kinds.map(([id, x]) => h('button', {
              type: 'button', class: 'cat-choice', 'aria-pressed': String(id === d.kind), style: { '--tint': tintHex(x.tint) },
              onclick: () => { if (id !== d.kind) haptic('select'); d.kind = id; if (id === 'debt') d.schedule = 'once'; render(); },
            }, badge(x.icon, x.tint, 46), h('span', null, x.label))))),
        h('div', { class: 'name-row' },
          badge(k.icon, k.tint, 52),
          field('الاسم', h('input', { type: 'text', value: d.name, placeholder: k.placeholder, oninput: (e) => { d.name = e.target.value; } }))),
        d.split
          ? field('العملة', currencyPicker(d.currency, (v) => { d.currency = v; render(); }))
          : h('div', { class: 'two' },
            field(d.kind === 'stocks' ? 'المعدل الشهري' : 'المبلغ', h('input', { type: 'text', inputmode: 'decimal', value: d.amount, placeholder: '0', oninput: (e) => { d.amount = e.target.value; } })),
            field('العملة', currencyPicker(d.currency, (v) => { d.currency = v; render(); }))),
        d.kind === 'stocks' ? h('p', { class: 'hint' }, 'الأسهم بتطلع وبتنزل. حط الرقم الأقل اللي متأكد منه، والزيادة بتروح للادخار.') : null,
        segmented([{ value: 'monthly', label: 'كل شهر' }, { value: 'once', label: 'مرة وحدة' }], d.schedule, (v) => { d.schedule = v; render(); }, 'التكرار'),
        d.schedule === 'once' ? field('بأي شهر بيوصل؟', dateButton({ value: d.month, mode: 'month', onChange: (v) => { d.month = v; render(); } })) : null,
        d.split ? null : field('إيمتى بيوصل بالشهر؟', dayButtonInline(d.day, (v) => { d.day = v; render(); }), 'بهاليوم بيطلع لك بالرئيسية «وصل؟» مشان تسجّله.'),
        h('div', { class: 'sheet-rows rows' },
          switchRow('بيوصل على دفعات', 'متل 300 بـ 4 الشهر، والباقي بـ 8.', d.split, (v) => {
            d.split = v;
            if (v && d.parts.length < 2) {
              const total = parseAmount(d.amount) || 0;
              const half = Math.round(total / 2);
              d.parts = [{ day: d.day, amount: total ? String(half) : '' }, { day: Math.min(28, d.day + 4), amount: total ? String(total - half) : '' }];
            }
            if (!v) { d.amount = partsTotal() ? cleanNum(partsTotal()) : d.amount; d.day = d.parts[0]?.day || d.day; }
            render();
          })),
        d.split ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الدفعات (اليوم والمبلغ)'), partRows,
          h('button', { type: 'button', class: 'btn secondary small', onclick: () => { d.parts.push({ day: Math.min(28, (d.parts.at(-1)?.day || 1) + 3), amount: '' }); render(); } }, icon('plus', 16), 'دفعة كمان'),
          totalEl) : null,
        err,
        h('button', { class: 'btn block', type: 'button', onclick: save }, 'حفظ مصدر الدخل'),
        editing ? h('button', { class: 'btn danger block', type: 'button', onclick: remove }, 'حذف مصدر الدخل') : null,
      ]);
      refreshTotal();
    }

    function refreshTotal() {
      if (totalEl) totalEl.textContent = d.split ? `المجموع بالشهر ${fmt(partsTotal(), d.currency)}` : '';
    }

    function save() {
      let parts;
      let amount;
      if (d.split) {
        parts = d.parts.map((p) => ({ day: p.day, amount: parseAmount(p.amount) })).filter((p) => p.amount > 0).sort((a, b) => a.day - b.day);
        amount = parts.reduce((s, p) => s + p.amount, 0);
      } else {
        amount = parseAmount(d.amount);
        parts = [{ day: d.day, amount }];
      }
      if (!(amount > 0)) { err.textContent = 'اكتب المبلغ.'; return; }
      if (d.schedule === 'once' && !/^\d{4}-\d{2}$/.test(d.month)) { err.textContent = 'اختار الشهر.'; return; }
      const rec = {
        id: src?.id || uid('src'), kind: d.kind, name: d.name.trim() || INCOME_KINDS[d.kind].label,
        amount, currency: d.currency, schedule: d.schedule, month: d.schedule === 'once' ? d.month : null, parts,
      };
      store.update((s) => upsert(s.incomeSources, rec));
      close();
      toast(rateOf(store.state, rec.currency) ? 'انحفظ مصدر الدخل' : `انحفظ. حدد سعر ${CURRENCIES[rec.currency].name} مشان ينحسب.`);
    }

    async function remove() {
      const ok = await confirmSheet('حذف مصدر الدخل؟', `رح ينشال «${src.name}» من خطة الشهر.`, 'احذف');
      if (!ok) return;
      store.update((s) => { s.incomeSources = s.incomeSources.filter((x) => x.id !== src.id); });
      close();
      toast('انحذف مصدر الدخل');
    }

    render();
  });
}

function dayButtonInline(value, onChange) {
  return dayButton({ value, onChange, title: 'يوم الوصول بالشهر' });
}

/* ---------- فئة ---------- */
// مفتاح تشغيل وإطفاء
export function switchRow(title, sub, checked, onChange) {
  return h('label', { class: 'switch-row' },
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), sub ? h('span', { class: 'row-sub wrap' }, sub) : null),
    h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked, onchange: (e) => { haptic('select'); onChange(e.target.checked); } }), h('i')));
}

export function openCategoryForm(cat = null, type = 'expense') {
  const editing = Boolean(cat);
  const d = {
    type: cat?.type || type, name: cat?.name || '', icon: cat?.icon || 'tag', tint: cat?.tint || 'mint',
    budget: cat?.budget ? cleanNum(cat.budget) : '', fixed: Boolean(cat?.fixed), private: Boolean(cat?.private),
    essential: Boolean(cat?.essential), aliases: (cat?.aliases || []).join('، '),
  };
  openSheet(editing ? 'تعديل الفئة' : 'فئة جديدة', (body, close) => {
    let err = null;
    let preview = null;
    const nameInput = h('input', { type: 'text', value: d.name, placeholder: d.type === 'expense' ? 'مثلاً: كتب ودورات' : 'مثلاً: إيجار محل', oninput: (e) => { d.name = e.target.value; } });
    function render() {
      err = h('p', { class: 'form-error', role: 'alert' });
      preview = badge(d.icon, d.tint, 52);
      fill(body, [
        editing ? null : segmented([{ value: 'expense', label: 'مصروف' }, { value: 'income', label: 'دخل' }], d.type, (v) => { d.type = v; render(); }, 'نوع الفئة'),
        h('div', { class: 'name-row' }, preview, field('اسم الفئة', nameInput)),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'اللون'),
          h('div', { class: 'tint-row', role: 'group', 'aria-label': 'اللون' }, TINT_KEYS.map((k) => h('button', {
            type: 'button', class: 'tint-dot', 'aria-label': k, 'aria-pressed': String(k === d.tint), style: { '--tint': tintHex(k) },
            onclick: () => { haptic('select'); d.tint = k; render(); },
          })))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الأيقونة'),
          iconPicker(CATEGORY_ICON_CHOICES, d.icon, (name) => { d.icon = name; preview.replaceWith(preview = badge(d.icon, d.tint, 52)); }, tintHex(d.tint))),
        d.type === 'expense' ? field('الميزانية الشهرية بالدولار', h('input', { type: 'text', inputmode: 'decimal', value: d.budget, placeholder: '0', oninput: (e) => { d.budget = e.target.value; } })) : null,
        h('div', { class: 'sheet-rows rows' },
          d.type === 'expense' ? switchRow('مصروف ثابت', 'متل الإيجار والفواتير. ما بيدخل بحساب مصروف اليوم.', d.fixed, (v) => { d.fixed = v; }) : null,
          d.type === 'expense' ? switchRow('أساسي', 'متل المواصلات والبقالة: بينحجز مبلغه أول إذا المصاري قليلة، وما بنقترح تخفّفه. الثانوي (مطاعم، هدايا) بياخد من اللي بيبقى.', d.essential, (v) => { d.essential = v; }) : null,
          switchRow('اسم خاص', 'بيختفي الاسم والأيقونة بكل مكان، وبيطلع «خاص» بدالهم. المبلغ بيضل محسوب.', d.private, (v) => { d.private = v; })),
        field('كلمات بتدل عليها', h('input', { type: 'text', value: d.aliases, placeholder: 'مثلاً: كتاب، دورة، قرطاسية', oninput: (e) => { d.aliases = e.target.value; } }),
          'لما تكتب وحدة منها بالإدخال السريع، بتنحط العملية بهالفئة.'),
        err,
        h('button', { class: 'btn block', type: 'button', onclick: save }, 'حفظ الفئة'),
        editing && !PROTECTED_CATEGORIES.includes(cat.id) ? h('button', { class: 'btn danger block', type: 'button', onclick: remove }, 'حذف الفئة') : null,
      ]);
    }

    function save() {
      const name = d.name.trim();
      if (!name) { err.textContent = 'اكتب اسم الفئة.'; return; }
      const budget = d.type === 'expense' ? parseAmount(d.budget) : 0;
      const rec = {
        ...(cat || {}), id: cat?.id || uid('cat'), type: d.type, name, icon: d.icon, tint: d.tint, private: d.private,
        budget: budget > 0 ? budget : 0, fixed: d.type === 'expense' && d.fixed, essential: d.type === 'expense' && d.essential,
        aliases: d.aliases.split(/[،,\s]+/).map((x) => x.trim()).filter(Boolean),
      };
      store.update((s) => upsert(s.categories, rec));
      close();
      toast('انحفظت الفئة');
    }

    async function remove() {
      const used = store.state.transactions.filter((t) => t.categoryId === cat.id).length;
      const fallback = cat.type === 'income' ? 'inc_other' : 'cat_other';
      const msg = used ? `فيها ${txCountText(used)}، رح تنتقل لفئة «أخرى».` : `رح تنحذف فئة «${cat.name}».`;
      const ok = await confirmSheet('حذف الفئة؟', msg, 'احذف');
      if (!ok) return;
      store.update((s) => {
        for (const t of s.transactions) if (t.categoryId === cat.id) t.categoryId = fallback;
        s.categories = s.categories.filter((c) => c.id !== cat.id);
      });
      close();
      toast('انحذفت الفئة');
    }

    render();
  });
}

/* ---------- سعر صرف ---------- */
export function openRateForm(code) {
  const c = CURRENCIES[code];
  const r = store.state.rates[code] || { rate: null, mode: 'manual' };
  const d = { mode: r.mode, rate: r.rate ? cleanNum(r.rate) : '' };
  openSheet(`سعر ${c.name}`, (body, close) => {
    let err = null;
    function render() {
      err = h('p', { class: 'form-error', role: 'alert' });
      let note;
      if (code === 'SYP') note = 'المصادر العالمية بتعطي السعر الرسمي، وسعر السوق غالباً غيره. إذا بتصرّف بسعر السوق خليه يدوي، وحدّثه كل ما تغيّر.';
      else if (d.mode === 'auto') note = 'بيتحدّث لحاله كل كم ساعة لما يكون في نت.';
      else note = 'حدّثه كل ما تغيّر السعر.';
      fill(body, [
        segmented([{ value: 'manual', label: 'أنا بحدده' }, { value: 'auto', label: 'تلقائي من النت' }], d.mode, (v) => { d.mode = v; render(); }, 'طريقة تحديد السعر'),
        field(`كم ${c.name} بالدولار الواحد؟`, h('input', { type: 'text', inputmode: 'decimal', value: d.rate, placeholder: 'اكتب السعر', 'data-autofocus':d.mode === 'manual', oninput: (e) => { d.rate = e.target.value; } })),
        h('p', { class: 'hint' }, note),
        err,
        h('button', { class: 'btn block', type: 'button', onclick: save }, 'حفظ السعر'),
      ]);
    }

    function save() {
      const n = parseAmount(d.rate);
      if (d.mode === 'manual' && !(n > 0)) { err.textContent = 'اكتب السعر.'; return; }
      store.update((s) => {
        s.rates[code] = { ...s.rates[code], mode: d.mode, ...(n > 0 ? { rate: n, at: Date.now() } : {}) };
        if (d.mode === 'auto') s.ratesFetchedAt = 0;
      });
      close();
      if (d.mode === 'auto') {
        refreshRates({ force: true }).then((res) => {
          toast(res.ok && res.updated.includes(code) ? `تحدّث سعر ${c.name}` : 'ما قدرت جيب السعر هلّق، رح جرّب بعدين.');
        });
      } else {
        toast('انحفظ السعر');
      }
    }

    render();
  });
}

/* ---------- غرض بدك تشتريه أو التزام ---------- */
const PRIORITY_OPTS = [{ value: 1, label: 'مهم' }, { value: 2, label: 'متوسط' }, { value: 3, label: 'بيستنى' }];
const isMonth = (m) => /^\d{4}-\d{2}$/.test(m || '');

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export function openItemForm(item = null, kind = 'want') {
  const editing = Boolean(item);
  const bought = item?.status === 'bought';
  // التاريخ بيوم (5 كانون الأول). الأغراض القديمة كان إلها شهر بس، فبتطلع بأول الشهر لحتى تعدّلها
  const oldMonth = item?.month && !item?.date ? `${item.month}-01` : '';
  const d = {
    kind: item?.kind || kind, name: item?.name || '', icon: item?.icon || (kind === 'commitment' ? 'pin' : 'bag'),
    amount: item ? cleanNum(item.amount) : '', currency: item?.currency || 'USD', priority: item?.priority || 2,
    date: item?.date || oldMonth || (kind === 'commitment' ? `${addMonths(currentMonth(), 1)}-01` : ''), note: item?.note || '',
  };
  let title;
  if (editing) title = d.kind === 'commitment' ? 'تعديل الالتزام' : 'تعديل الغرض';
  else title = kind === 'commitment' ? 'التزام جديد' : 'غرض بدك تشتريه';

  openSheet(title, (body, close) => {
    let err = null;
    function render() {
      err = h('p', { class: 'form-error', role: 'alert' });
      const s = editing ? buildPlan(store.state).schedule.get(item.id) : null;
      fill(body, [
        editing ? null : segmented([{ value: 'want', label: 'بدي اشتريه' }, { value: 'commitment', label: 'التزام لازم' }], d.kind, (v) => {
          d.kind = v;
          if (v === 'commitment' && !d.date) d.date = `${addMonths(currentMonth(), 1)}-01`;
          if (d.icon === 'bag' || d.icon === 'pin') d.icon = v === 'commitment' ? 'pin' : 'bag';
          render();
        }, 'النوع'),
        s ? h('p', { class: `plan-status ${statusClass(s)}`.trim() }, scheduleText(item, s)) : null,
        editing && !bought && d.kind === 'want' ? suggestBox(item, close) : null,
        h('div', { class: 'name-row' },
          badge(d.icon, d.kind === 'commitment' ? 'coral' : 'violet', 52),
          field('الاسم', h('input', {
            type: 'text', value: d.name, placeholder: d.kind === 'commitment' ? 'مثلاً: قسط الجامعة' : 'مثلاً: لابتوب',
            'data-autofocus': !editing, oninput: (e) => { d.name = e.target.value; },
          }))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الأيقونة'),
          iconPicker(ITEM_ICON_CHOICES, d.icon, (name) => { d.icon = name; render(); }, tintHex(d.kind === 'commitment' ? 'coral' : 'violet'))),
        h('div', { class: 'two' },
          field(d.kind === 'commitment' ? 'المبلغ' : 'السعر التقريبي', h('input', { type: 'text', inputmode: 'decimal', value: d.amount, placeholder: '0', oninput: (e) => { d.amount = e.target.value; } })),
          field('العملة', currencyPicker(d.currency, (v) => { d.currency = v; render(); }))),
        d.kind === 'want'
          ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الأولوية'),
            segmented(PRIORITY_OPTS, d.priority, (v) => { d.priority = v; render(); }, 'الأولوية'))
          : null,
        d.kind === 'want'
          ? field('إيمتى بدك ياه؟ (اختياري)', dateButton({ value: d.date, future: true, placeholder: 'بلا موعد', allowEmpty: true, title: 'إيمتى بدك ياه؟', onChange: (v) => { d.date = v; render(); } }),
            'متل 5 كانون الأول. إذا ما في موعد خليه فاضي، وبينحط بأول شهر بيكفيه فيه الفائض.')
          : field('إيمتى لازم تدفعه؟', dateButton({ value: d.date, future: true, title: 'موعد الدفع', onChange: (v) => { d.date = v; render(); } }),
            'الالتزام بينحجز من مصاري شهره قبل أي غرض تاني، وبيطلع بخريطة الشهر بيومه.'),
        field('ملاحظة', h('input', { type: 'text', value: d.note, placeholder: 'اختياري', oninput: (e) => { d.note = e.target.value; } })),
        err,
        h('button', { class: 'btn block', type: 'button', onclick: save }, 'حفظ'),
        editing && !bought && d.kind === 'want'
          ? (item.confirmed
            ? h('button', { class: 'btn secondary block', type: 'button', onclick: unconfirm }, icon('close', 18), 'فك التثبيت')
            : h('button', { class: 'btn gold block', type: 'button', onclick: () => { close(); setTimeout(() => openConfirmForm(item), 320); } }, icon('pin', 18), 'ثبّت الشراء'))
          : null,
        editing && !bought
          ? h('button', { class: 'btn violet block', type: 'button', onclick: () => { close(); setTimeout(() => openBoughtForm(item), 320); } },
            d.kind === 'commitment' ? 'دفعته' : 'اشتريته')
          : null,
        editing && bought ? h('button', { class: 'btn secondary block', type: 'button', onclick: unbuy }, 'رجّعه للخطة') : null,
        editing ? h('button', { class: 'btn danger block', type: 'button', onclick: remove }, 'حذف') : null,
      ]);
    }

    function save() {
      const name = d.name.trim();
      const amount = parseAmount(d.amount);
      if (!name) { err.textContent = 'اكتب الاسم.'; return; }
      if (!(amount > 0)) { err.textContent = 'اكتب المبلغ.'; return; }
      if (d.kind === 'commitment' && !isDay(d.date)) { err.textContent = 'اختار موعد الدفع.'; return; }
      if (d.kind === 'want' && item?.confirmed && !isDay(d.date)) { err.textContent = 'الغرض المثبّت بدو تاريخ. اختاره أو فك التثبيت.'; return; }
      const rec = {
        ...(item || {}), id: item?.id || uid('item'), kind: d.kind, name, icon: d.icon, amount, currency: d.currency,
        priority: d.kind === 'want' ? d.priority : null, date: isDay(d.date) ? d.date : null, month: isDay(d.date) ? d.date.slice(0, 7) : null,
        note: d.note.trim(), status: item?.status || 'planned', createdAt: item?.createdAt || Date.now(), confirmed: Boolean(item?.confirmed),
      };
      store.update((s) => upsert(s.planItems, rec));
      close();
      const s = buildPlan(store.state).schedule.get(rec.id);
      toast(s && rec.status !== 'bought' ? scheduleText(rec, s) : 'انحفظ');
    }

    function unconfirm() {
      store.update((s) => { const it = s.planItems.find((i) => i.id === item.id); if (it) it.confirmed = false; });
      close();
      toast('انفك التثبيت، ورجع المبلغ للخطة', { action: 'تراجع', onAction: () => store.update((s) => { const it = s.planItems.find((i) => i.id === item.id); if (it) it.confirmed = true; }) });
    }

    async function unbuy() {
      const ok = await confirmSheet('ترجّعه للخطة؟', item.txId ? 'ورح ينحذف المصروف اللي انسجل وقتها.' : 'رح يرجع لقائمة المشتريات.', 'رجّعه', { danger: false });
      if (!ok) return;
      store.update((s) => {
        const it = s.planItems.find((i) => i.id === item.id);
        if (it) revertItem(it);
        s.transactions = s.transactions.filter((t) => t.planItemId !== item.id);
      });
      close();
      toast('رجع للخطة');
    }

    async function remove() {
      const ok = await confirmSheet('حذف من الخطة؟', `رح ينحذف «${item.name}» من الخطة.`, 'احذف');
      if (!ok) return;
      store.update((s) => {
        s.planItems = s.planItems.filter((i) => i.id !== item.id);
        for (const t of s.transactions) if (t.planItemId === item.id) delete t.planItemId;
      });
      close();
      toast('انحذف من الخطة');
    }

    render();
  });
}

/* ---------- اقتراح جوّا نموذج الغرض: كيف بيلحق موعده أو بيصير أبكر ---------- */
function suggestBox(item, close) {
  const box = h('div', { class: 'sg-slot' });
  // الحساب بعد ما تنفتح الورقة مشان ما تتأخر
  setTimeout(() => {
    const list = purchaseSuggestions(store.state, { onlyId: item.id, limit: 1 });
    if (!list.length) { box.remove(); return; }
    const card = suggestionCard(list[0]);
    card.querySelector('.sg-actions .btn')?.addEventListener('click', () => close());
    box.replaceChildren(card);
  }, 60);
  return box;
}

/* ---------- ثبّت الشراء: بيحجز المبلغ بتاريخه، وما بينسجل مصروف لحتى تشتريه ---------- */
export function openConfirmForm(item) {
  const st = store.state;
  const P = buildPlan(st);
  const s = P.schedule.get(item.id);
  const today = todayISO();
  let date = item.date;
  if (!date) date = s?.month && s.month > currentMonth() ? `${s.month}-01` : today;
  if (date < today) date = today;
  openSheet(`ثبّت «${item.name}»`, (body, close) => {
    const preview = h('div', { class: 'result', 'aria-live': 'polite' });
    function nextState() {
      const s0 = store.state;
      return { ...s0, planItems: s0.planItems.map((i) => (i.id === item.id ? { ...i, confirmed: true, date, month: date.slice(0, 7) } : i)) };
    }
    function render() {
      fill(body, [
        h('p', { class: 'hint' }, 'التثبيت بيحجز المبلغ من مصاري شهره متل الالتزام، فما بينصرف على شي تاني. ما بينسجل مصروف لحتى تضغط «اشتريته».'),
        field('إيمتى رح تشتريه؟', dateButton({ value: date, future: true, title: 'يوم الشراء', onChange: (v) => { date = v; render(); } })),
        preview,
        h('button', { class: 'btn gold block', type: 'button', onclick: save }, icon('pin', 18), 'ثبّت'),
      ]);
      const I = impact(store.state, nextState());
      const lines = [];
      const usd = itemUSD(store.state, item);
      if (date.slice(0, 7) === currentMonth()) {
        lines.push(beforeAfter('مصروف اليوم', I.a0.perDay, I.a1.perDay), beforeAfter('بيبقى لآخر الشهر', I.c0.pool, I.c1.pool));
        if (I.c1.pool < -0.5) lines.push(h('p', { class: 'result-line bad' }, `المصاري اللي معك ما بتكفي: ناقصك ${fmt(-I.c1.pool)} لآخر الشهر.`));
      } else {
        lines.push(h('p', { class: 'result-line' }, `بينحجز ${fmt(usd)} من خطة ${monthLabel(date.slice(0, 7))}.`));
      }
      const neg = I.P1.rows.find((r, i) => r.balance < -0.5 && I.P0.rows[i].balance >= -0.5);
      if (neg) lines.push(h('p', { class: 'result-line bad' }, `خطتك بتصير بالسالب بـ ${monthLabel(neg.month)} (${fmt(neg.balance)}). يعني ما في مصاري كفاية لهالموعد، فكّر تأجّله.`));
      for (const x of I.delayed) {
        lines.push(h('p', { class: `result-line ${x.to ? 'warn' : 'bad'}` }, x.to ? `«${x.it.name}» بيتأخر من ${monthLabel(x.from, { year: false })} لـ ${monthLabel(x.to, { year: false })}.` : `«${x.it.name}» ما عاد بيلحق خلال السنة.`));
      }
      fill(preview, lines);
    }
    function save() {
      if (!isDay(date)) return;
      store.update((x) => {
        const it = x.planItems.find((i) => i.id === item.id);
        if (it) Object.assign(it, { confirmed: true, date, month: date.slice(0, 7) });
      });
      close();
      haptic('success');
      toast(`تثبّت «${item.name}»، ومبلغه محجوز`, {
        action: 'تراجع', onAction: () => store.update((x) => { const it = x.planItems.find((i) => i.id === item.id); if (it) it.confirmed = false; }),
      });
    }
    render();
  });
}

// سطر «قبل ← بعد»
export function beforeAfter(label, before, after, { good = 'up' } = {}) {
  const diff = after - before;
  const worse = good === 'up' ? diff < -0.5 : diff > 0.5;
  return h('div', { class: 'ba-row' },
    h('span', { class: 'ba-label' }, label),
    h('span', { class: 'ba-vals' },
      Math.abs(diff) > 0.5 ? h('s', null, fmt(before)) : null,
      Math.abs(diff) > 0.5 ? icon('chevL', 14) : null,
      h('b', { class: worse ? (after < 0 ? 'bad' : 'warn') : '' }, fmt(after))));
}

/* ---------- اشتريته / دفعته ---------- */
export function openBoughtForm(item) {
  const st = store.state;
  const acc = st.accounts.find((a) => a.id === st.settings.defaultAccountId && a.currency === item.currency)
    || st.accounts.find((a) => a.currency === item.currency)
    || accountById(st.settings.defaultAccountId) || st.accounts[0];
  const d = {
    accountId: acc?.id || null, amount: '', touched: false, rate: '', date: todayISO(),
    categoryId: item.categoryId || 'cat_other', record: Boolean(acc),
  };
  openSheet(item.kind === 'commitment' ? `دفعت «${item.name}»` : `اشتريت «${item.name}»`, (body, close) => {
    let err = null;
    let hint = null;

    function prefill() {
      const s = store.state;
      const cur = currencyOf(d.accountId);
      if (cur !== 'USD' && !d.rate) { const r = rateOf(s, cur); d.rate = r ? cleanNum(r) : ''; }
      if (!d.touched) {
        const v = cur === item.currency ? item.amount : convert(s, item.amount, item.currency, cur);
        d.amount = Number.isFinite(v) ? cleanNum(roundTo(v, CURRENCIES[cur].decimals)) : '';
      }
    }

    function render() {
      prefill();
      const s = store.state;
      const cur = currencyOf(d.accountId);
      const c = CURRENCIES[cur];
      err = h('p', { class: 'form-error', role: 'alert' });
      hint = h('span', { class: 'field-hint' });
      const amountInput = h('input', {
        class: 'amount-input', type: 'text', inputmode: 'decimal', value: d.amount, 'aria-label': `المبلغ اللي دفعته بـ ${c.name}`,
        oninput: (e) => { d.amount = e.target.value; d.touched = true; refreshHint(); },
      });
      const sym = h('span', { class: 'amount-cur' }, c.symbol);
      const cats = s.categories.filter((x) => x.type === 'expense');
      const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'الفئة' },
        cats.map((x) => h('button', {
          type: 'button', class: 'chip', 'aria-pressed': String(x.id === d.categoryId),
          onclick: (e) => {
            d.categoryId = x.id;
            for (const b of chips.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
          },
        }, badge(x.icon, x.tint, 22), x.name)));
      fill(body, [
        h('p', { class: 'hint' }, 'اكتب المبلغ اللي دفعته فعلاً.'),
        h('div', { class: 'amount-wrap' }, c.prefix ? [sym, amountInput] : [amountInput, sym]),
        field('دفعت من محفظة', accountSelect(d.accountId, (v) => { d.accountId = v; d.rate = ''; d.touched = false; render(); })),
        cur !== 'USD'
          ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, `سعر الدولار بـ ${c.name}`),
            h('input', { type: 'text', inputmode: 'decimal', value: d.rate, oninput: (e) => { d.rate = e.target.value; refreshHint(); } }), hint)
          : null,
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الفئة'), chips),
        field('التاريخ', dateButton({ value: d.date, onChange: (v) => { d.date = v; render(); } })),
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: d.record, onchange: (e) => { d.record = e.target.checked; } }),
          'سجّله كمصروف بالعمليات'),
        err,
        h('button', { class: 'btn violet block', type: 'button', onclick: save }, 'تم'),
      ]);
      refreshHint();
    }

    function refreshHint() {
      const a = parseAmount(d.amount);
      const r = parseAmount(d.rate);
      hint.textContent = a > 0 && r > 0 ? `يعني ${fmt(a / r)}` : 'حط سعر الصرف.';
    }

    function save() {
      const cur = currencyOf(d.accountId);
      const amount = parseAmount(d.amount);
      const rate = cur === 'USD' ? 1 : parseAmount(d.rate);
      if (!(amount > 0)) { err.textContent = 'اكتب المبلغ.'; return; }
      if (!(rate > 0)) { err.textContent = 'حط سعر الصرف.'; return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) { err.textContent = 'اختار التاريخ.'; return; }
      const usd = amount / rate;
      const record = d.record && Boolean(d.accountId);
      const txId = record ? uid('tx') : null;
      store.update((x) => {
        const it = x.planItems.find((i) => i.id === item.id);
        if (!it) return;
        Object.assign(it, { status: 'bought', boughtUSD: usd, boughtMonth: d.date.slice(0, 7), boughtAt: d.date, txId, categoryId: d.categoryId });
        if (record) {
          x.transactions.push({
            id: txId, type: 'expense', date: d.date, accountId: d.accountId, amount, categoryId: d.categoryId,
            note: item.name, usd, planItemId: item.id, createdAt: Date.now(),
          });
        }
        if (cur !== 'USD' && !rateOf(x, cur)) x.rates[cur] = { ...x.rates[cur], rate, at: Date.now() };
      });
      close();
      toast(item.kind === 'commitment' ? 'انسجل الدفع' : 'مبروك! انشال من قائمة المشتريات');
    }

    render();
  });
}


