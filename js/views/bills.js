// الاشتراكات والفواتير الدورية: موعد كل شهر، وتذكير قبلها بيوم
import { h, icon, fill, openSheet, confirmSheet, toast, field, selectButton, dayButton, iconPicker, haptic } from '../ui.js';
import { badge, CATEGORY_ICON_CHOICES, tintHex } from '../icons.js';
import { store, uid, catLabel } from '../store.js';
import { fmt, parseAmount } from '../money.js';
import { todayISO, currentMonth, daysText } from '../dates.js';
import { group, emptyState } from '../components.js';
import { currencyPicker, accountOpts, switchRow } from '../forms.js';
import { recurringStatus, setPrepaid } from '../income.js';
import { openAddSheet } from '../keypad.js';

export const billsActions = () => h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'اشتراك جديد', onclick: () => openRecurringForm() }, icon('plus', 20));

function accFor(st, cur) {
  return st.accounts.find((x) => x.id === st.settings.defaultAccountId && x.currency === cur) || st.accounts.find((x) => x.currency === cur && !x.savings);
}

/*
 * «دفعته»: يا بتسجّل المصروف هلّق، يا كان مدفوع من قبل (متل اشتراك اندفع قبل ما تضيفه)،
 * فبينعلّم مدفوع لهالشهر بلا ما ينخصم شي.
 */
export function openPaidChoice(r) {
  const key = currentMonth();
  openSheet(`«${r.name}»`, (body, close) => {
    const choice = (iconName, tint, title, sub, onclick) => h('button', { class: 'row', type: 'button', onclick: () => { haptic('select'); close(); setTimeout(onclick, 280); } },
      badge(iconName, tint, 42),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, title), h('span', { class: 'row-sub wrap' }, sub)),
      h('span', { class: 'chev' }, icon('chevL', 18)));
    fill(body, [h('div', { class: 'rows sheet-rows' },
      choice('receipt', 'teal', 'دفعته هلّق، سجّل المصروف', `بينخصم ${fmt(r.amount, r.currency)} من المحفظة`, () => {
        const st = store.state;
        openAddSheet({ type: 'expense', amount: r.amount, accountId: r.accountId || accFor(st, r.currency)?.id, categoryId: r.categoryId, note: r.name, recurringId: r.id });
      }),
      choice('check', 'mint', 'كان مدفوع من قبل', 'ما بينسجل شي وما بينخصم هالشهر، وبيذكّرك الشهر الجاي', () => markPrepaid(r, key, true)))]);
  });
}

export function markPrepaid(r, key, on) {
  store.update((s) => setPrepaid(s, r.id, key, on));
  haptic('success');
  toast(on ? `«${r.name}» مدفوع هالشهر، وما رح ينخصم` : `«${r.name}» رجع مو مدفوع هالشهر`, {
    action: 'تراجع', onAction: () => store.update((s) => setPrepaid(s, r.id, key, !on)),
  });
}

export function renderBills() {
  const st = store.state;
  const list = recurringStatus(st, todayISO());
  if (!list.length) {
    return [emptyState('receipt', 'ضيف اشتراكاتك وفواتيرك اللي بتتكرر كل شهر (نت، موبايل، اشتراك كلود…). قبل موعد كل وحدة بيوم بتطلع لك بالرئيسية.',
      h('button', { class: 'btn', type: 'button', onclick: () => openRecurringForm() }, icon('plus', 18), 'ضيف اشتراك'))];
  }
  const total = list.reduce((s, x) => s + x.usd, 0);
  const left = list.filter((x) => !x.paid).reduce((s, x) => s + x.usd, 0);
  const rows = list.sort((a, b) => a.dueDay - b.dueDay).map((x) => {
    const { r, dueDay, paid, prepaid, diff } = x;
    const c = st.categories.find((k) => k.id === r.categoryId);
    let sub;
    if (prepaid) sub = `مدفوع من قبل، الجاي ${dueDay} بالشهر الجاي`;
    else if (paid) sub = `اندفع هالشهر، الجاي ${dueDay} بالشهر الجاي`;
    else if (diff > 1) sub = `بعد ${daysText(diff)} (${dueDay} بالشهر)`;
    else if (diff === 1) sub = 'بكرة';
    else if (diff === 0) sub = 'اليوم';
    else sub = `متأخر ${daysText(-diff)}`;
    return h('div', { class: 'row' },
      h('button', { class: 'row-tap', type: 'button', onclick: () => openRecurringForm(r) },
        badge(r.icon || c?.icon || 'receipt', r.tint || c?.tint || 'teal', 42),
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, r.name), h('span', { class: `row-sub wrap ${!paid && diff < 0 ? 'warn' : ''}`.trim() }, `${sub}، ${catLabel(c)}`)),
        h('span', { class: 'row-end' }, h('span', { class: `amount ${paid ? 'income' : ''}`.trim() }, fmt(r.amount, r.currency)))),
      paid
        ? h('span', { class: 'paid-mark', 'aria-label': 'مدفوع' }, icon('check', 18, { stroke: 2.4 }))
        : h('button', { class: 'btn secondary small', type: 'button', onclick: () => openPaidChoice(r) }, 'دفعته'));
  });
  return [
    h('div', { class: 'duo' },
      h('div', null, h('small', null, 'بالشهر'), h('b', null, fmt(total))),
      h('div', null, h('small', null, 'باقي هالشهر'), h('b', { class: left > 0.5 ? '' : 'income' }, left > 0.5 ? fmt(left) : 'كله مدفوع'))),
    h('p', { class: 'section-note' }, 'قبل موعد كل اشتراك بيوم بيطلع لك تذكير بالرئيسية. «دفعته» بيسجّله، أو بتختار «كان مدفوع من قبل» إذا دفعته قبل ما تضيفه.'),
    group('اشتراكاتك', rows),
  ];
}

export function openRecurringForm(rec = null) {
  const st = store.state;
  const editing = Boolean(rec);
  const key = currentMonth();
  const todayDay = Number(todayISO().slice(8, 10));
  const expenseCats = st.categories.filter((c) => c.type === 'expense');
  const status = editing ? recurringStatus(st, todayISO()).find((x) => x.r.id === rec.id) : null;
  const d = {
    name: rec?.name || '', amount: rec ? String(rec.amount) : '', currency: rec?.currency || 'USD',
    day: rec?.day || todayDay, categoryId: rec?.categoryId || 'cat_bills',
    accountId: rec?.accountId || '', icon: rec?.icon || 'receipt', tint: rec?.tint || 'teal',
    // اشتراك جديد يوم تجديده فات هالشهر: غالباً اندفع، فمنعتبره مدفوع (وفيك تطفيه)
    prepaid: editing ? Boolean(status?.prepaid) : false, touched: editing,
  };
  openSheet(editing ? 'تعديل الاشتراك' : 'اشتراك أو فاتورة دورية', (body, close) => {
    let err = null;
    function render() {
      if (!d.touched) d.prepaid = d.day < todayDay;
      err = h('p', { class: 'form-error', role: 'alert' });
      let paidBlock;
      if (status?.tx) {
        paidBlock = h('p', { class: 'plan-status' }, 'انسجل مصروفه هالشهر.');
      } else {
        const sub = !editing && d.day < todayDay
          ? `يوم التجديد (${d.day}) فات هالشهر، فاعتبرناه مدفوع وما رح ينخصم. طفّيه إذا لسّا ما دفعته.`
          : 'إذا دفعته قبل ما تضيفه، شغّلها مشان ما ينخصم هالشهر.';
        paidBlock = h('div', { class: 'sheet-rows rows' },
          switchRow('مدفوع هالشهر', sub, d.prepaid, (v) => { d.prepaid = v; d.touched = true; }));
      }
      fill(body, [
        h('div', { class: 'name-row' }, badge(d.icon, d.tint, 52),
          field('الاسم', h('input', { type: 'text', value: d.name, placeholder: 'مثلاً: اشتراك كلود', 'data-autofocus': !editing, oninput: (e) => { d.name = e.target.value; } }))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الأيقونة'),
          iconPicker(CATEGORY_ICON_CHOICES, d.icon, (name) => { d.icon = name; render(); }, tintHex(d.tint))),
        h('div', { class: 'two' },
          field('المبلغ', h('input', { type: 'text', inputmode: 'decimal', value: d.amount, placeholder: '0', oninput: (e) => { d.amount = e.target.value; } })),
          field('العملة', currencyPicker(d.currency, (v) => { d.currency = v; render(); }))),
        field('بأي يوم بيتجدد كل شهر؟', dayButton({ value: d.day, onChange: (v) => { d.day = v; render(); }, title: 'يوم التجديد' })),
        paidBlock,
        field('الفئة', selectButton({
          value: d.categoryId, title: 'الفئة',
          options: expenseCats.map((c) => ({ value: c.id, label: c.name, icon: c.icon, tint: c.tint })),
          onChange: (v) => { d.categoryId = v; const c = expenseCats.find((x) => x.id === v); if (c) d.tint = c.tint; render(); },
        })),
        field('بيندفع من (اختياري)', selectButton({
          value: d.accountId, title: 'المحفظة', placeholder: 'المحفظة الافتراضية',
          options: [{ value: '', label: 'المحفظة الافتراضية', icon: 'wallet', tint: 'slate' }, ...accountOpts({ currency: d.currency })],
          onChange: (v) => { d.accountId = v; render(); },
        })),
        err,
        h('button', { class: 'btn block', type: 'button', onclick: save }, 'حفظ'),
        editing ? h('button', { class: 'btn danger block', type: 'button', onclick: remove }, 'حذف') : null,
      ]);
    }
    function save() {
      const name = d.name.trim();
      const amount = parseAmount(d.amount);
      if (!name) { err.textContent = 'اكتب الاسم.'; return; }
      if (!(amount > 0)) { err.textContent = 'اكتب المبلغ.'; return; }
      const item = {
        ...(rec || {}), id: rec?.id || uid('rec'), name, amount, currency: d.currency, day: d.day, categoryId: d.categoryId,
        accountId: d.accountId || null, icon: d.icon, tint: d.tint, active: true, paidMonths: [...(rec?.paidMonths || [])],
      };
      store.update((s) => {
        s.recurring = s.recurring || [];
        const i = s.recurring.findIndex((x) => x.id === item.id);
        if (i >= 0) s.recurring[i] = item; else s.recurring.push(item);
        if (!status?.tx) setPrepaid(s, item.id, key, d.prepaid);
      });
      close();
      haptic('success');
      toast(d.prepaid && !status?.tx ? 'انحفظ. مدفوع هالشهر، وبيذكّرك الشهر الجاي.' : 'انحفظ. رح يذكّرك قبلها بيوم.');
    }
    async function remove() {
      const ok = await confirmSheet('حذف الاشتراك؟', `رح ينحذف «${rec.name}» وما عاد يذكّرك فيه. العمليات اللي انسجلت بتضل.`, 'احذف');
      if (!ok) return;
      store.update((s) => { s.recurring = (s.recurring || []).filter((x) => x.id !== rec.id); });
      close();
      toast('انحذف الاشتراك');
    }
    render();
  });
}
