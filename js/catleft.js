// الباقي لكل فئة: «أكل ومطاعم باقيلها 20 من 50» مشان تعرف قبل ما تعزم حدا أو تطلع عالمطعم
import { h, icon, fill, openSheet, haptic } from './ui.js';
import { badge } from './icons.js';
import { store, catLabel, catIcon, catTint } from './store.js';
import { fmt } from './money.js';
import { daysInMonth, parseISO, daysText, monthLabel, countText } from './dates.js';
import { budgetFor, monthOverride, monthStats, dailyAllowance } from './calc.js';
import { flexSpent } from './month.js';
import { bar } from './components.js';

export function categoryLeft(state, today) {
  const key = today.slice(0, 7);
  const d = parseISO(today);
  const daysLeft = daysInMonth(d.getFullYear(), d.getMonth()) - d.getDate() + 1;
  const all = monthStats(state, key).byCat;
  const flex = flexSpent(state, key);
  const rows = state.categories.filter((c) => c.type === 'expense').map((c) => {
    const budget = budgetFor(state, c, key);
    // المشتريات من الخطة والزكاة ما بتاكل من ميزانية الفئة اليومية
    const spent = c.fixed ? all.get(c.id) || 0 : flex.get(c.id) || 0;
    const left = budget - spent;
    return { c, budget, spent, left, fixed: Boolean(c.fixed), perDay: !c.fixed && left > 0 ? left / daysLeft : 0 };
  });
  return { key, daysLeft, rows, special: Boolean(monthOverride(state, key)) };
}

export function leftRow(x) {
  const { c, budget, spent, left } = x;
  const ratio = budget ? spent / budget : 0;
  const state = !budget ? '' : ratio > 1 ? 'over' : ratio >= 0.85 ? 'warn' : '';
  let sub;
  if (!budget) sub = `صرفت ${fmt(spent)}، بلا ميزانية`;
  else if (left < 0) sub = `صرفت ${fmt(spent)} من ${fmt(budget)}`;
  else sub = `صرفت ${fmt(spent)} من ${fmt(budget)}`;
  let end2 = null;
  if (budget && left < 0) end2 = 'تجاوزت';
  else if (x.fixed) end2 = budget ? 'ثابت' : null;
  else if (x.perDay > 0.005) end2 = `${fmt(x.perDay)} باليوم`;
  return h('div', { class: 'row left-row' },
    badge(catIcon(c), catTint(c), 40),
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, catLabel(c)),
      budget ? bar(ratio, state) : null,
      h('span', { class: 'row-sub' }, sub)),
    h('span', { class: 'row-end' },
      budget ? h('small', { class: 'left-label' }, left < 0 ? 'زيادة' : 'باقي') : null,
      h('span', { class: `amount ${state}`.trim() }, budget ? fmt(Math.abs(left)) : '—'),
      end2 ? h('span', { class: `row-sub ${left < 0 ? 'bad' : ''}`.trim() }, end2) : null));
}

export function openCategoryLeft(open) {
  openSheet('الباقي لكل فئة', (body, close) => {
    const st = store.state;
    const today = new Date();
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const L = categoryLeft(st, todayISO);
    const a = dailyAllowance(st, todayISO);
    const daily = L.rows.filter((x) => !x.fixed && (x.budget > 0 || x.spent > 0));
    const fixed = L.rows.filter((x) => x.fixed && (x.budget > 0 || x.spent > 0));
    const hidden = L.rows.filter((x) => !(x.budget > 0 || x.spent > 0)).length;
    const sumLeft = daily.reduce((s, x) => s + Math.max(0, x.left), 0);
    const go = (path) => { close(); setTimeout(() => open?.(path), 300); };
    fill(body, [
      h('p', { class: 'hint' }, `«باقي لك اليوم» هو اللي فيك تصرفه اليوم من كل الفئات اليومية سوا. هون كل فئة لحالها: قدّيش باقيلها لآخر ${monthLabel(L.key, { year: false })}، ويعني قدّيش باليوم.`),
      h('div', { class: 'ba-grid' },
        h('div', { class: 'ba-tile' }, h('small', null, 'باقي لك اليوم'), h('b', { class: a.left < 0 ? 'bad' : '' }, fmt(Math.abs(a.left))), h('span', null, `من ${fmt(a.perDay)}`)),
        h('div', { class: 'ba-tile' }, h('small', null, 'باقي للشهر'), h('b', null, fmt(Math.max(0, a.monthLeft))), h('span', null, `لـ ${daysText(L.daysLeft)}`))),
      a.cashLimited && sumLeft > a.monthLeft + 1
        ? h('p', { class: 'result-line warn' }, `المصاري اللي معك (${fmt(Math.max(0, a.monthLeft))}) أقل من مجموع الباقي بالفئات (${fmt(sumLeft)}). يعني مش كل الأرقام تحت متوفرة فعلاً.${L.special ? '' : ' رتّب باقي الشهر من «الخطة» مشان تصير على اللي معك.'}`)
        : null,
      daily.length ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'المصاريف اليومية'), h('div', { class: 'rows sheet-rows' }, daily.map(leftRow))) : null,
      fixed.length ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الثابتة (فواتير واشتراكات)'), h('div', { class: 'rows sheet-rows' }, fixed.map(leftRow))) : null,
      hidden ? h('p', { class: 'field-hint' }, `في ${countText(hidden, ['فئة وحدة', 'فئتين', 'فئات', 'فئة'])} بلا ميزانية ولا مصروف هالشهر.`) : null,
      h('button', { class: 'btn secondary block', type: 'button', onclick: () => { haptic('tap'); go('plan/month'); } }, icon('edit', 18), 'عدّل الميزانية'),
    ]);
  }, { tall: true });
}
