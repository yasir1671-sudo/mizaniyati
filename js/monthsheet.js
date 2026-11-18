// ميزانية باقي الشهر الاستثنائية: من المصاري اللي معك، الأساسيات أول، وبترجع الأصلية الشهر الجاي
import { h, icon, fill, openSheet, toast, haptic, confirmSheet } from './ui.js';
import { badge } from './icons.js';
import { store, catLabel, catIcon, catTint } from './store.js';
import { fmt, parseAmount } from './money.js';
import { todayISO, monthLabel, addMonths, daysText } from './dates.js';
import { monthOverride } from './calc.js';
import { restOfMonth, overrideFrom, needsMonthPlan } from './month.js';
import { bar } from './components.js';

export function openMonthBudgetSheet() {
  const st = store.state;
  const today = todayISO();
  const key = today.slice(0, 7);
  const existing = monthOverride(st, key);
  const R0 = restOfMonth(st, today, { base: 'original' });
  const Rc = existing ? restOfMonth(st, today) : null;
  const allocs = {};
  for (const x of R0.cats) {
    const cur = Rc?.cats.find((y) => y.c.id === x.c.id);
    allocs[x.c.id] = cur ? Math.round(cur.need) : x.alloc;
  }
  const nextLabel = monthLabel(addMonths(key, 1), { year: false });

  openSheet('ميزانية باقي الشهر', (body, close) => {
    const summary = h('div', { class: 'mb-summary' });
    const sumAlloc = () => Object.values(allocs).reduce((s, v) => s + (Number(v) || 0), 0);
    const refresh = () => {
      const used = sumAlloc();
      const left = R0.pool - used;
      fill(summary, [
        h('div', { class: 'mb-top' },
          h('div', null, h('small', null, 'معك لباقي الشهر'), h('strong', null, fmt(Math.max(0, R0.pool)))),
          h('div', null, h('small', null, 'مصروف اليوم تقريباً'), h('strong', null, fmt(used / R0.daysLeft)))),
        bar(R0.pool > 0 ? used / R0.pool : 1, left < -0.5 ? 'over' : left < 5 ? 'warn' : ''),
        h('p', { class: `mb-note ${left < -0.5 ? 'bad' : ''}`.trim() }, left < -0.5
          ? `وزّعت أكتر من اللي معك بـ ${fmt(-left)}. خفّف شي من الثانويات.`
          : `وزّعت ${fmt(used)} على ${daysText(R0.daysLeft)}، وبيبقى ${fmt(left)} بلا تخصيص.`),
      ]);
    };
    const row = (x) => {
      const input = h('input', {
        type: 'text', inputmode: 'decimal', class: 'inline-input', value: String(allocs[x.c.id] ?? 0), placeholder: '0',
        'aria-label': `${catLabel(x.c)} لباقي الشهر بالدولار`,
        oninput: (e) => { const n = parseAmount(e.target.value); allocs[x.c.id] = n > 0 ? n : 0; refresh(); },
      });
      const was = Math.round(x.need);
      return h('div', { class: 'row' },
        badge(catIcon(x.c), catTint(x.c), 38),
        h('span', { class: 'row-main' },
          h('span', { class: 'row-title' }, catLabel(x.c)),
          h('span', { class: 'row-sub wrap' }, x.spent > 0.5 ? `صرفت ${fmt(x.spent)}، والأصلية لباقي الشهر ${fmt(was)}` : `الأصلية لباقي الشهر ${fmt(was)}`)),
        h('span', { class: 'inline-money' }, '$', input));
    };
    const ess = R0.cats.filter((x) => x.essential);
    const disc = R0.cats.filter((x) => !x.essential);
    refresh();
    fill(body, [
      h('p', { class: 'hint' }, `محسوبة على المصاري اللي معك فعلاً والجاي هالشهر، بعد الفواتير والالتزامات والادخار. الأساسيات بتاخد أول، والثانويات من اللي بيبقى. لـ ${monthLabel(key, { year: false })} بس: أول ${nextLabel} بترجع ميزانيتك الأصلية لحالها.`),
      summary,
      R0.essShort ? h('p', { class: 'result-line bad' }, 'المصاري ما بتكفي حتى الأساسيات. وزّعنا اللي معك على الأساسيات، والثانويات صفر.') : null,
      ess.length ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الأساسيات (بتنحجز أول)'), h('div', { class: 'rows sheet-rows' }, ess.map(row))) : null,
      disc.length ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'الثانويات (من اللي بيبقى)'), h('div', { class: 'rows sheet-rows' }, disc.map(row))) : null,
      h('p', { class: 'field-hint' }, 'فيك تغيّر شو أساسي وشو ثانوي من الإعدادات ← الفئات.'),
      h('button', { class: 'btn block', type: 'button', onclick: save }, icon('check', 18), 'اعتمدها لهالشهر'),
      existing ? h('button', { class: 'btn secondary block', type: 'button', onclick: () => { close(); setTimeout(revertMonthBudget, 300); } }, 'رجّع الميزانية الأصلية') : null,
    ]);

    function save() {
      const used = sumAlloc();
      if (used > R0.pool + 0.5 && R0.pool > 0) { haptic('warn'); toast('وزّعت أكتر من اللي معك. خفّف شي أول.', { kind: 'warn' }); return; }
      const override = overrideFrom(R0, allocs);
      const prev = store.state.settings.monthBudgets?.[key] || null;
      store.update((s) => { s.settings.monthBudgets = { ...(s.settings.monthBudgets || {}), [key]: override }; });
      close();
      haptic('success');
      toast(`انعتمدت ميزانية باقي ${monthLabel(key, { year: false })}`, {
        action: 'تراجع', duration: 6000,
        onAction: () => store.update((s) => {
          const mb = { ...(s.settings.monthBudgets || {}) };
          if (prev) mb[key] = prev; else delete mb[key];
          s.settings.monthBudgets = mb;
        }),
      });
    }
  }, { tall: true });
}

export async function revertMonthBudget() {
  const key = todayISO().slice(0, 7);
  const prev = store.state.settings.monthBudgets?.[key];
  if (!prev) return;
  const ok = await confirmSheet('ترجّع الميزانية الأصلية؟', 'رح تنشال ميزانية باقي الشهر الاستثنائية، ويرجع مصروف اليوم على ميزانيتك العادية.', 'رجّعها', { danger: false });
  if (!ok) return;
  store.update((s) => { const mb = { ...(s.settings.monthBudgets || {}) }; delete mb[key]; s.settings.monthBudgets = mb; });
  toast('رجعت الميزانية الأصلية', { action: 'تراجع', onAction: () => store.update((s) => { s.settings.monthBudgets = { ...(s.settings.monthBudgets || {}), [key]: prev }; }) });
}

// بطاقة صغيرة: إما في ميزانية استثنائية، أو المصاري أقل من الميزانية وبدها ترتيب
export function monthBudgetBanner(st) {
  const today = todayISO();
  const key = today.slice(0, 7);
  const next = monthLabel(addMonths(key, 1), { year: false });
  if (monthOverride(st, key)) {
    return h('div', { class: 'banner col gold-banner' },
      h('div', { class: 'banner-row' }, h('span', { class: 'banner-ic' }, icon('sparkle', 22)),
        h('p', null, `ميزانية استثنائية لباقي ${monthLabel(key, { year: false })}، على المصاري اللي معك. أول ${next} بترجع الأصلية لحالها.`)),
      h('div', { class: 'banner-actions' },
        h('button', { class: 'btn gold small', type: 'button', onclick: () => openMonthBudgetSheet() }, icon('edit', 16), 'عدّلها'),
        h('button', { class: 'btn secondary small', type: 'button', onclick: () => revertMonthBudget() }, 'رجّع الأصلية')));
  }
  if (!needsMonthPlan(st, today)) return null;
  const R = restOfMonth(st, today, { base: 'original' });
  return h('div', { class: 'banner col warn-banner' },
    h('div', { class: 'banner-row' }, h('span', { class: 'banner-ic' }, icon('alert', 22)),
      h('p', null, `المصاري اللي معك (${fmt(Math.max(0, R.pool))}) أقل من ميزانية باقي الشهر (${fmt(R.need)}). رتّبها على اللي معك: الأساسيات أول، والثانويات من اللي بيبقى.`)),
    h('div', { class: 'banner-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => openMonthBudgetSheet() }, icon('sparkle', 16), 'رتّب باقي الشهر')));
}
