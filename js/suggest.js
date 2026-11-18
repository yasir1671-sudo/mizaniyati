// بطاقات الاقتراحات: «إذا خفّفت المطاعم لـ 100 والهدايا لـ 15، بتشتري الغرضين سوا»
import { h, icon, toast, haptic } from './ui.js';
import { badge } from './icons.js';
import { store, catLabel, catIcon, catTint } from './store.js';
import { fmt } from './money.js';
import { currentMonth, monthLabel, monthsText } from './dates.js';

const joinAr = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join('، ')} و${list.at(-1)}`);

export function periodText(months) {
  const cur = currentMonth();
  if (months.length === 1 && months[0] === cur) return 'لباقي هالشهر';
  if (months.length === 1) return `بـ ${monthLabel(months[0], { year: false })}`;
  return `لـ ${monthsText(months.length)} (لحد ${monthLabel(months.at(-1), { year: false })})`;
}

export function cutsText(cuts, max = 3) {
  const parts = cuts.slice(0, max).map((x) => (x.to < 1 ? `${catLabel(x.c)} لـ صفر` : `${catLabel(x.c)} من ${fmt(x.from)} لـ ${fmt(x.to)}`));
  if (cuts.length > max) parts.push('غيرهم');
  return joinAr(parts);
}

export function suggestionText(sg) {
  const names = joinAr(sg.items.map((it) => `«${it.name}»`));
  const cut = `إذا خفّفت ${cutsText(sg.cuts)} ${periodText(sg.months)}`;
  const at = (m) => (m === currentMonth() ? 'هالشهر' : `بـ ${monthLabel(m, { year: false })}`);
  switch (sg.kind) {
    case 'together': return `${cut}، بتقدر تشتري ${names} سوا بموعدهن.`;
    case 'closer': return `حتى لو خفّفت الثانويات للنص، ${names} ما بيلحق موعده، بس بيقرب لـ ${monthLabel(sg.to, { year: false })}${sg.from ? ` بدل ${monthLabel(sg.from, { year: false })}` : ' بدل ما يضل بعد السنة'}.`;
    case 'sooner': return `${cut}، بتشتري ${names} ${at(sg.to)} بدل ${monthLabel(sg.from, { year: false })}.`;
    default: return `${cut}، بتقدر تشتري ${names} ${at(sg.to)} بموعدك${sg.from ? ` بدل ${monthLabel(sg.from, { year: false })}` : ''}.`;
  }
}

// صفوف التخفيض: قبل ← بعد
export function cutRows(cuts, max = 4) {
  return h('div', { class: 'cut-list' }, cuts.slice(0, max).map((x) => h('div', { class: 'cut-row' },
    badge(catIcon(x.c), catTint(x.c), 30),
    h('span', { class: 'cut-name' }, catLabel(x.c), x.rest ? h('small', null, 'لباقي الشهر') : null),
    h('span', { class: 'cut-vals' }, h('s', null, fmt(x.from)), icon('chevL', 14), h('b', null, fmt(x.to))),
    h('span', { class: 'cut-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${x.from > 0 ? Math.max(0, Math.min(100, (x.to / x.from) * 100)) : 0}%` } })))));
}

export function applyCuts(monthBudgets, label = 'انطبق التخفيض') {
  const prev = JSON.parse(JSON.stringify(store.state.settings.monthBudgets || {}));
  store.update((s) => { s.settings.monthBudgets = JSON.parse(JSON.stringify(monthBudgets)); });
  haptic('success');
  toast(label, { action: 'تراجع', duration: 6000, onAction: () => store.update((s) => { s.settings.monthBudgets = prev; }) });
}

export function suggestionCard(sg, { compact = false } = {}) {
  return h('div', { class: 'sg-card' },
    h('div', { class: 'sg-head' }, badge('bulb', 'amber', 34), h('p', null, suggestionText(sg))),
    compact ? null : cutRows(sg.cuts),
    h('div', { class: 'sg-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => applyCuts(sg.monthBudgets, 'انطبق التخفيض على الثانويات') }, icon('check', 16), 'طبّق'),
      h('span', { class: 'sg-note' }, 'بيصير ميزانية استثنائية لهالشهور بس')));
}
