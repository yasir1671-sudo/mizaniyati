// الاشتراكات والفواتير الدورية: موعد كل شهر، وتذكير قبلها بيوم
import { h, icon, fill, openSheet, confirmSheet, toast, field, selectButton, dayButton, iconPicker, haptic } from '../ui.js';
import { badge, CATEGORY_ICON_CHOICES, tintHex } from '../icons.js';
import { store, uid, catLabel } from '../store.js';
import { fmt, parseAmount } from '../money.js';
import { todayISO } from '../dates.js';
import { group, emptyState } from '../components.js';
import { currencyPicker, accountOpts } from '../forms.js';
import { recurringStatus } from '../income.js';

export const billsActions = () => h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'اشتراك جديد', onclick: () => openRecurringForm() }, icon('plus', 20));

export function renderBills() {
  const st = store.state;
  const list = recurringStatus(st, todayISO());
  if (!list.length) {
    return [emptyState('receipt', 'ضيف اشتراكاتك وفواتيرك اللي بتتكرر كل شهر (نت، موبايل، اشتراك كلود…). قبل موعد كل وحدة بيوم بتطلع لك بالرئيسية.',
      h('button', { class: 'btn', type: 'button', onclick: () => openRecurringForm() }, icon('plus', 18), 'ضيف اشتراك'))];
  }
  const total = list.reduce((s, x) => s + (Number(x.r.amount) || 0) * (x.r.currency === 'USD' ? 1 : 0), 0);
  const rows = list.sort((a, b) => a.dueDay - b.dueDay).map(({ r, dueDay, paid, diff }) => {
    const c = st.categories.find((x) => x.id === r.categoryId);
    let sub;
    if (paid) sub = `اندفع هالشهر، الجاي ${dueDay} بالشهر الجاي`;
    else if (diff > 1) sub = `بعد ${diff} يوم (${dueDay} بالشهر)`;
    else if (diff === 1) sub = 'بكرة';
    else if (diff === 0) sub = 'اليوم';
    else sub = `متأخر ${-diff} يوم`;
    return h('button', { class: 'row', type: 'button', onclick: () => openRecurringForm(r) },
      badge(r.icon || c?.icon || 'receipt', r.tint || c?.tint || 'teal', 42),
      h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, r.name), h('span', { class: `row-sub ${!paid && diff < 0 ? 'warn' : ''}`.trim() }, `${sub}، ${catLabel(c)}`)),
      h('span', { class: 'row-end' }, h('span', { class: `amount ${paid ? 'income' : ''}`.trim() }, fmt(r.amount, r.currency))));
  });
  return [
    h('p', { class: 'section-note' }, 'قبل موعد كل اشتراك بيوم بيطلع لك تذكير بالرئيسية. «دفعته» بيسجّله، والسحب بيزيله لهالشهر.'),
    group('اشتراكاتك', rows),
    total > 0 ? h('p', { class: 'footer' }, `مجموع الاشتراكات بالدولار ${fmt(total)} بالشهر`) : null,
  ];
}

export function openRecurringForm(rec = null) {
  const st = store.state;
  const editing = Boolean(rec);
  const expenseCats = st.categories.filter((c) => c.type === 'expense');
  const d = {
    name: rec?.name || '', amount: rec ? String(rec.amount) : '', currency: rec?.currency || 'USD',
    day: rec?.day || Number(todayISO().slice(8, 10)), categoryId: rec?.categoryId || 'cat_bills',
    accountId: rec?.accountId || '', icon: rec?.icon || 'receipt', tint: rec?.tint || 'teal',
  };
  openSheet(editing ? 'تعديل الاشتراك' : 'اشتراك أو فاتورة دورية', (body, close) => {
    let err = null;
    function render() {
      err = h('p', { class: 'form-error', role: 'alert' });
      fill(body, [
        h('div', { class: 'name-row' }, badge(d.icon, d.tint, 52),
          field('الاسم', h('input', { type: 'text', value: d.name, placeholder: 'مثلاً: اشتراك كلود', 'data-autofocus': !editing, oninput: (e) => { d.name = e.target.value; } }))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الأيقونة'),
          iconPicker(CATEGORY_ICON_CHOICES, d.icon, (name) => { d.icon = name; render(); }, tintHex(d.tint))),
        h('div', { class: 'two' },
          field('المبلغ', h('input', { type: 'text', inputmode: 'decimal', value: d.amount, placeholder: '0', oninput: (e) => { d.amount = e.target.value; } })),
          field('العملة', currencyPicker(d.currency, (v) => { d.currency = v; render(); }))),
        field('بأي يوم بيتجدد كل شهر؟', dayButton({ value: d.day, onChange: (v) => { d.day = v; render(); }, title: 'يوم التجديد' })),
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
      const item = { ...(rec || {}), id: rec?.id || uid('rec'), name, amount, currency: d.currency, day: d.day, categoryId: d.categoryId, accountId: d.accountId || null, icon: d.icon, tint: d.tint, active: true };
      store.update((s) => {
        s.recurring = s.recurring || [];
        const i = s.recurring.findIndex((x) => x.id === item.id);
        if (i >= 0) s.recurring[i] = item; else s.recurring.push(item);
      });
      close();
      haptic('success');
      toast('انحفظ. رح يذكّرك قبلها بيوم.');
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
