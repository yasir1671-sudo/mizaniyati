// الإعدادات والفئات
import { h, icon, toast, field, confirmSheet, haptic, selectButton } from '../ui.js';
import { badge } from '../icons.js';
import { store, APP_VERSION } from '../store.js';
import { CURRENCIES, fmt } from '../money.js';
import { relTime } from '../dates.js';
import { group, navRow } from '../components.js';
import { openCategoryForm, switchRow, accountOpts } from '../forms.js';
import { exportBackup, pickBackupFile } from '../backup.js';
import { openOnboarding } from '../onboarding.js';
import { toggleHideAmounts, requirePin, openPinSheet } from '../pin.js';

export const categoriesActions = () => h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'فئة جديدة', onclick: () => openCategoryForm(null, 'expense') }, icon('plus', 20));

export function renderSettings({ open }) {
  const st = store.state;
  const privateCount = st.categories.filter((c) => c.private).length;
  return [
    group('إلك', [
      h('div', { class: 'row-block' },
        field('اسمك (بيطلع بالترحيب)', h('input', {
          type: 'text', value: st.settings.name || '', placeholder: 'مثلاً: ياسر',
          onchange: (e) => store.update((s) => { s.settings.name = e.target.value.trim(); }),
        }))),
      switchRow('خبّي المبالغ', 'كل المبالغ بتطلع نجوم، مفيدة إذا بدك تفرجي التطبيق لحدا. فيك تبدّلها من زر العين بالرئيسية.',
        Boolean(st.settings.hideAmounts), () => toggleHideAmounts()),
      navRow({
        iconName: 'lock', tint: 'mint', title: st.settings.pinHash ? 'غيّر الرمز السري' : 'حط رمز سري',
        sub: st.settings.pinHash ? 'إظهار المبالغ وتعديل الميزانية بيطلبوا الرمز.' : 'بلا رمز، أي حدا بيقدر يضغط العين ويشوف المبالغ.',
        onclick: () => (st.settings.pinHash
          ? requirePin(() => setTimeout(() => openPinSheet({ mode: 'set', onSuccess: () => toast('تغيّر الرمز') }), 320), 'دخّل الرمز الحالي')
          : openPinSheet({ mode: 'set', onSuccess: () => toast('انحفظ الرمز') })),
      }),
      st.settings.pinHash ? h('button', {
        class: 'row danger-row', type: 'button',
        onclick: () => requirePin(() => { store.update((s) => { s.settings.pinHash = null; s.settings.hideAmounts = false; }); toast('انشال الرمز'); }, 'دخّل الرمز لتشيله'),
      }, 'شيل الرمز السري') : null,
    ]),

    group('الفئات', [
      navRow({
        iconName: 'grid', tint: 'violet', title: 'عدّل الفئات',
        sub: privateCount ? `أسماء، أيقونات، ألوان. في ${privateCount} مخفية الاسم.` : 'أسماء، أيقونات، ألوان، وإخفاء اسم أي فئة.',
        onclick: () => open('settings/categories'),
      }),
    ]),

    group('الإدخال السريع', [
      h('div', { class: 'row-block' },
        field('المحفظة الافتراضية',
          selectButton({ value: st.settings.defaultAccountId, options: accountOpts(), title: 'المحفظة الافتراضية', onChange: (v) => store.update((s) => { s.settings.defaultAccountId = v; }) }))),
      h('p', { class: 'row-note' }, 'إذا كتبت العملة مع المبلغ، متل «200 تركي مواصلات»، بتنسجل على محفظة هالعملة. وفيك تحكي بمايك الكيبورد بدل ما تكتب.'),
    ]),

    group('النسخة الاحتياطية', [
      h('div', { class: 'row' },
        badge('shield', 'mint', 40),
        h('span', { class: 'row-main' },
          h('span', { class: 'row-title' }, 'آخر نسخة'),
          h('span', { class: 'row-sub wrap' }, st.settings.lastBackupAt ? relTime(st.settings.lastBackupAt) : 'ما حفظت ولا نسخة لسّا. بياناتك على هالموبايل بس.'))),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn small', type: 'button', onclick: () => exportBackup() }, icon('download', 18), 'حفظ نسخة'),
        h('button', { class: 'btn secondary small', type: 'button', onclick: () => pickBackupFile() }, icon('upload', 18), 'استرجاع نسخة')),
    ]),

    group('التطبيق', [
      ...installRows(),
      navRow({ iconName: 'sparkle', tint: 'teal', title: 'جهّز خطتي من جديد', sub: 'خطوات الترحيب: الدخل والادخار وتوزيع الميزانية.', onclick: () => openOnboarding() }),
    ]),

    group(null, [
      h('button', { class: 'row danger-row', type: 'button', onclick: resetAll }, icon('trash', 18), 'حذف كل البيانات'),
    ]),

    h('p', { class: 'footer' }, `ميزانيتي ${APP_VERSION}`),
  ];
}

function installRows() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return [h('div', { class: 'row' }, badge('check', 'mint', 40), h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'التطبيق مثبّت على هالجهاز')))];
  const prompt = window.__installPrompt;
  if (prompt) {
    return [navRow({
      iconName: 'install', tint: 'mint', title: 'ثبّت التطبيق', sub: 'بينزل على شاشتك متل أي تطبيق، وبيشتغل بدون نت.',
      onclick: async () => { prompt.prompt(); await prompt.userChoice.catch(() => null); window.__installPrompt = null; store.update(() => {}); },
    })];
  }
  return [h('div', { class: 'row' }, badge('install', 'mint', 40), h('span', { class: 'row-main' },
    h('span', { class: 'row-title' }, 'ثبّت التطبيق'),
    h('span', { class: 'row-sub wrap' }, 'أندرويد: قائمة كروم ⋮ ← «تثبيت التطبيق». آيفون: من سفاري زر المشاركة ← «إضافة إلى الشاشة الرئيسية».')))];
}

function resetAll() {
  requirePin(() => setTimeout(resetAllConfirmed, 320), 'دخّل الرمز لتحذف البيانات');
}
async function resetAllConfirmed() {
  const ok = await confirmSheet('حذف كل البيانات؟', 'رح تنمسح كل العمليات والمحافظ والخطة من هالجهاز. ما في رجعة إلا من نسخة احتياطية.', 'احذف كل شي');
  if (!ok) return;
  store.reset();
  haptic('warn');
  toast('انمسحت البيانات');
}

/* ---------- الفئات ---------- */
export function renderCategories() {
  const st = store.state;
  const row = (c) => {
    const bits = [];
    if (c.type === 'expense') bits.push(c.budget ? `ميزانية ${fmt(c.budget)}` : 'بلا ميزانية');
    if (c.fixed) bits.push('ثابت');
    if (c.private) bits.push('الاسم مخفي');
    return h('button', { class: 'row', type: 'button', onclick: () => openCategoryForm(c) },
      badge(c.icon, c.tint, 42),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, c.name, c.private ? h('span', { class: 'tag' }, 'خاص') : null),
        bits.length ? h('span', { class: 'row-sub' }, bits.join('، ')) : null),
      h('span', { class: 'chev' }, icon('chevL', 18)));
  };
  const expense = st.categories.filter((c) => c.type === 'expense');
  const income = st.categories.filter((c) => c.type === 'income');
  return [
    h('p', { class: 'section-note' }, 'اضغط على أي فئة لتغيّر اسمها أو أيقونتها أو لونها، أو تخبّي اسمها. الفئة المخفية بتطلع «خاص» بكل مكان، والمبلغ بيضل محسوب.'),
    group('المصاريف', [...expense.map(row), h('div', { class: 'row-actions' }, h('button', { class: 'btn secondary small', type: 'button', onclick: () => openCategoryForm(null, 'expense') }, icon('plus', 18), 'فئة مصروف'))]),
    group('الدخل', [...income.map(row), h('div', { class: 'row-actions' }, h('button', { class: 'btn secondary small', type: 'button', onclick: () => openCategoryForm(null, 'income') }, icon('plus', 18), 'فئة دخل'))]),
  ];
}
