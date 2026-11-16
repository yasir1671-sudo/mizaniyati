// المزيد: الإعدادات، الفئات، النسخ الاحتياطي، التثبيت
import { h, icon, toast, field, segmented, confirmSheet } from '../ui.js';
import { store, APP_VERSION } from '../store.js';
import { CURRENCIES, fmt } from '../money.js';
import { relTime } from '../dates.js';
import { group } from '../components.js';
import { openCategoryForm } from '../forms.js';
import { exportBackup, pickBackupFile } from '../backup.js';

export function renderMore({ go }) {
  const st = store.state;
  const expense = st.categories.filter((c) => c.type === 'expense');
  const income = st.categories.filter((c) => c.type === 'income');

  return h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', null, 'المزيد')),

    group('الإدخال السريع', [
      h('div', { class: 'row-block' },
        field('المحفظة اللي بتنسجل عليها المصاريف السريعة',
          h('select', { value: st.settings.defaultAccountId, onchange: (e) => store.update((s) => { s.settings.defaultAccountId = e.target.value; }) },
            st.accounts.map((a) => h('option', { value: a.id }, `${a.name} (${CURRENCIES[a.currency].symbol})`))))),
      h('p', { class: 'row-note' }, 'إذا كتبت العملة مع المبلغ، متل «200 تركي مواصلات»، بتنسجل على محفظة هالعملة. وفيك تحكي بمايك الكيبورد بدل ما تكتب.'),
    ]),

    group('فئات المصاريف', [
      ...expense.map(catRow),
      addRow('فئة مصروف', () => openCategoryForm(null, 'expense')),
    ]),
    group('فئات الدخل', [
      ...income.map(catRow),
      addRow('فئة دخل', () => openCategoryForm(null, 'income')),
    ]),

    group('النسخة الاحتياطية', [
      h('p', { class: 'row-note' }, 'بياناتك محفوظة على هالموبايل بس، وما بتطلع لأي مكان. احفظ نسخة كل فترة على Drive أو واتساب، مشان إذا تغيّر الموبايل ما تضيع.'),
      h('div', { class: 'row' },
        h('span', { class: 'row-main' },
          h('span', { class: 'row-title' }, 'آخر نسخة'),
          h('span', { class: 'row-sub' }, st.settings.lastBackupAt ? relTime(st.settings.lastBackupAt) : 'ما حفظت ولا نسخة لسّا'))),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => exportBackup() }, 'حفظ نسخة'),
        h('button', { class: 'btn secondary small', type: 'button', onclick: () => pickBackupFile() }, 'استرجاع نسخة')),
    ]),

    group('المظهر', [
      h('div', { class: 'row-block' },
        segmented([{ value: 'auto', label: 'حسب الموبايل' }, { value: 'light', label: 'فاتح' }, { value: 'dark', label: 'غامق' }],
          st.settings.theme, (v) => store.update((s) => { s.settings.theme = v; }), 'المظهر')),
    ]),

    group('تثبيت التطبيق', installRows(go)),

    group(null, [
      h('button', { class: 'row danger-row', type: 'button', onclick: resetAll }, 'حذف كل البيانات'),
    ]),

    h('p', { class: 'footer' }, `ميزانيتي، الإصدار ${APP_VERSION}`));
}

function catRow(c) {
  let sub;
  if (c.type === 'expense') sub = `${c.budget ? `ميزانية ${fmt(c.budget)}` : 'بلا ميزانية'}${c.fixed ? '، ثابت' : ''}`;
  else sub = c.aliases?.length ? c.aliases.slice(0, 4).join('، ') : '';
  return h('button', { class: 'row', type: 'button', onclick: () => openCategoryForm(c) },
    h('span', { class: 'tx-icon', 'aria-hidden': 'true' }, c.icon),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, c.name),
      sub ? h('span', { class: 'row-sub' }, sub) : null));
}

function addRow(label, onclick) {
  return h('div', { class: 'row-actions' },
    h('button', { class: 'btn secondary small', type: 'button', onclick }, icon('plus', 18), label));
}

function installRows(go) {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return [h('p', { class: 'row-note' }, 'التطبيق مثبّت على هالجهاز.')];
  const prompt = window.__installPrompt;
  if (prompt) {
    return [h('div', { class: 'row-actions' },
      h('button', {
        class: 'btn small', type: 'button',
        onclick: async () => {
          prompt.prompt();
          await prompt.userChoice.catch(() => null);
          window.__installPrompt = null;
          go('more');
        },
      }, 'ثبّت التطبيق على الموبايل'))];
  }
  return [
    h('p', { class: 'row-note' }, 'على أندرويد: من قائمة كروم ⋮ اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».'),
    h('p', { class: 'row-note' }, 'على آيفون: من سفاري اضغط زر المشاركة واختار «إضافة إلى الشاشة الرئيسية».'),
  ];
}

async function resetAll() {
  const ok = await confirmSheet('حذف كل البيانات؟', 'رح تنمسح كل العمليات والمحافظ والخطة من هالجهاز. ما في رجعة إلا من نسخة احتياطية.', 'احذف كل شي');
  if (!ok) return;
  store.reset();
  toast('انمسحت البيانات');
}
