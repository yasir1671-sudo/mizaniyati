// شو لو؟ تجربة مصروف كبير قبل ما تعمله: أثره على مصروف اليوم والشهر والأساسيات والمشتريات
import { h, icon, fill, openSheet, toast, haptic, field, dateButton } from './ui.js';
import { badge } from './icons.js';
import { store, uid, catLabel } from './store.js';
import { CURRENCIES, fmt, parseAmount, toUSD } from './money.js';
import { todayISO, currentMonth, monthLabel, monthsBetween } from './dates.js';
import { isCashAware } from './calc.js';
import { restOfMonth, overrideFrom } from './month.js';
import { impact, cutForExtra } from './advisor.js';
import { cutRows, cutsText } from './suggest.js';
import { currencyPicker, live } from './forms.js';

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

// مربع قبل وبعد
function baTile(label, before, after, { goodUp = true, note = null } = {}) {
  const diff = after - before;
  const worse = goodUp ? diff < -0.5 : diff > 0.5;
  return h('div', { class: `ba-tile ${worse ? (after < -0.5 ? 'bad' : 'warn') : ''}`.trim() },
    h('small', null, label),
    h('b', null, fmt(after)),
    Math.abs(diff) > 0.5 ? h('span', null, h('s', null, fmt(before)), ' ', fmt(diff, 'USD', { sign: true })) : h('span', null, 'ما بيتغيّر'),
    note ? h('em', null, note) : null);
}

function section(iconName, tint, title, children) {
  return h('section', { class: 'wi-card' },
    h('div', { class: 'wi-head' }, badge(iconName, tint, 32), h('h3', null, title)),
    children);
}

export function openWhatIf(prefill = {}) {
  const d = { name: prefill.name || '', amount: prefill.amount ? String(prefill.amount) : '', currency: prefill.currency || 'USD', date: prefill.date || todayISO() };
  let shown = false;
  openSheet('شو لو؟', (body, close) => {
    const result = h('div', { class: 'wi-result', 'aria-live': 'polite' });
    fill(body, [
      h('p', { class: 'hint' }, 'جرّب مصروف كبير قبل ما تعمله، وشوف أثره على مصروف اليوم ومصاري الشهر، وشو لازم ينقص، وشو بيتأخر.'),
      field('شو بدك تشتري؟', h('input', { type: 'text', value: d.name, placeholder: 'مثلاً: سجادة', oninput: (e) => { d.name = e.target.value; } })),
      h('div', { class: 'two' },
        field('المبلغ', h('input', { type: 'text', inputmode: 'decimal', value: d.amount, placeholder: '0', 'data-autofocus': !d.amount, oninput: (e) => { d.amount = e.target.value; } })),
        field('العملة', live((refresh) => currencyPicker(d.currency, (v) => { d.currency = v; refresh(); if (shown) calc(); })))),
      field('إيمتى؟', live((refresh) => dateButton({ value: d.date, future: true, title: 'يوم الشراء', onChange: (v) => { d.date = v; refresh(); if (shown) calc(); } }))),
      h('button', { class: 'btn block', type: 'button', onclick: () => { haptic('select'); calc(); } }, icon('bulb', 18), 'احسب'),
      result,
    ]);

    function calc() {
      const st = store.state;
      const amount = parseAmount(d.amount);
      if (!(amount > 0)) { fill(result, [h('p', { class: 'form-error' }, 'اكتب المبلغ.')]); return; }
      const usd = toUSD(st, amount, d.currency);
      if (!Number.isFinite(usd)) { fill(result, [h('p', { class: 'form-error' }, `حدد سعر ${CURRENCIES[d.currency].name} أول.`)]); return; }
      shown = true;
      const today = todayISO();
      const date = isDay(d.date) && d.date >= today ? d.date : today;
      const key = date.slice(0, 7);
      const name = d.name.trim() || 'المصروف';
      const probe = { id: '__whatif', kind: 'want', confirmed: true, name, amount, currency: d.currency, date, month: key, status: 'planned', icon: 'bag' };
      const next = { ...st, planItems: [...st.planItems, probe] };
      const I = impact(st, next, { today });
      const out = [];
      let applyCuts = null;
      let cutsNote = null;

      if (key === currentMonth() && isCashAware(st)) {
        // هالشهر: المصاري الفعلية
        const R1 = restOfMonth(next, today);
        const tiles = h('div', { class: 'ba-grid' },
          baTile('مصروف اليوم', I.a0.perDay, I.a1.perDay),
          baTile('بيبقى لآخر الشهر', I.c0.pool, I.c1.pool));
        const kids = [tiles];
        const essNames = R1.ess.filter((x) => x.need >= 1).slice(0, 3).map((x) => `${catLabel(x.c)} ${fmt(x.need)}`);
        if (R1.essShort) {
          kids.push(h('p', { class: 'result-line bad' }, `ما بيبقى كفاية للأساسيات. ناقصك ${fmt(R1.essNeed - R1.pool)} حتى لو وقّفت الثانويات كلها.`));
        } else if (essNames.length) {
          kids.push(h('p', { class: 'result-line good' }, `الأساسيات بتضل محجوزة: ${essNames.join('، ')}.`));
        }
        const cuts = R1.disc.filter((x) => x.need - x.alloc >= 1).map((x) => ({ c: x.c, from: Math.round(x.need), to: x.alloc, rest: true }));
        if (cuts.length && !R1.essShort) {
          kids.push(h('p', { class: 'wi-sub' }, 'مشان تلحق، لازم تخفّف الثانويات لباقي الشهر:'), cutRows(cuts, 5));
          applyCuts = { ...(st.settings.monthBudgets || {}), [key]: overrideFrom(R1) };
          cutsNote = `خفّف ${cutsText(cuts, 2)}`;
        } else if (!R1.essShort && I.c1.pool >= -0.5) {
          kids.push(h('p', { class: 'result-line good' }, 'المصاري اللي معك بتكفيه، بلا ما تنقص من أي فئة.'));
        }
        // إذا ادخار هالشهر بيحل المشكلة: اعرضه كخيار
        const save = I.c1.savingsLeft;
        if (save > 0.5 && (R1.essShort || cuts.length)) {
          const after = R1.pool + save;
          kids.push(h('div', { class: 'wi-alt' },
            h('p', null, `أو بلا ادخار هالشهر (${fmt(save)}): بيصير معك ${fmt(after)} لباقي الشهر${after >= R1.need - 0.5 ? '، وبيكفي كل الميزانية' : after >= R1.essNeed - 0.5 ? '، وبتكفي الأساسيات' : ''}.`),
            h('button', {
              class: 'btn secondary small', type: 'button',
              onclick: () => {
                const prev = store.state.settings.monthSavings?.[key];
                store.update((s) => { s.settings.monthSavings = { ...(s.settings.monthSavings || {}), [key]: 0 }; });
                toast('هالشهر بلا ادخار', { action: 'تراجع', onAction: () => store.update((s) => { const ms = { ...(s.settings.monthSavings || {}) }; if (prev == null) delete ms[key]; else ms[key] = prev; s.settings.monthSavings = ms; }) });
                calc();
              },
            }, 'بلا ادخار هالشهر')));
        }
        out.push(section('calendar', 'teal', `هالشهر (${monthLabel(key, { year: false })})`, kids));
      } else {
        // شهر جاي: حسب الخطة
        const i = Math.max(0, monthsBetween(currentMonth(), key));
        const r0 = I.P0.rows[i];
        const r1 = I.P1.rows[i];
        const kids = [];
        if (r0 && r1) {
          kids.push(h('div', { class: 'ba-grid' },
            baTile('فائض الشهر', r0.free, r1.free),
            baTile('معك بآخر الشهر', r0.balance, r1.balance)));
          const hurts = I.delayed.length || r1.balance < -0.5;
          if (hurts) {
            const C = cutForExtra(st, probe, key);
            if (C && C.cuts.length) {
              kids.push(h('p', { class: 'wi-sub' }, `إذا خفّفت الثانويات بـ ${monthLabel(key, { year: false })}، ما بيتأخر شي:`), cutRows(C.cuts, 5));
              applyCuts = C.monthBudgets;
              cutsNote = `خفّف ${cutsText(C.cuts, 2)}`;
            } else {
              kids.push(h('p', { class: 'result-line warn' }, 'حتى لو خفّفت الثانويات للنص بهالشهر، في شي رح يتأخر. فكّر تأجّله شهر.'));
            }
          } else {
            kids.push(h('p', { class: 'result-line good' }, `فائض ${monthLabel(key, { year: false })} بيكفيه، بلا ما يتأخر شي.`));
          }
        } else {
          kids.push(h('p', { class: 'result-line' }, 'هالموعد بعد السنة اللي قدامك، فما منقدر نحسبه بالتفصيل.'));
        }
        out.push(section('calendar', 'blue', monthLabel(key), kids));
      }

      // المشتريات اللي بتتأخر، وآخر السنة
      const later = [];
      if (I.delayed.length) {
        for (const x of I.delayed) {
          later.push(h('div', { class: 'row' }, badge(x.it.icon || 'bag', 'violet', 34),
            h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, x.it.name),
              h('span', { class: `row-sub ${x.to ? 'warn' : 'bad'}` }, x.to ? `بيتأخر من ${monthLabel(x.from, { year: false })} لـ ${monthLabel(x.to, { year: false })}` : 'ما عاد بيلحق خلال السنة'))));
        }
      } else {
        later.push(h('p', { class: 'result-line good' }, 'ما بيأخّر ولا شي من مشترياتك.'));
      }
      const neg = I.P1.rows.find((r, k) => r.balance < -0.5 && I.P0.rows[k].balance >= -0.5);
      if (neg) later.push(h('p', { class: 'result-line bad' }, `رصيد خطتك بيصير بالسالب بـ ${monthLabel(neg.month)} (${fmt(neg.balance)}).`));
      later.push(h('div', { class: 'ba-grid one' }, baTile('الفائض الحر آخر السنة', I.end0, I.end1)));
      out.push(section('bag', 'violet', 'المشتريات والسنة', later));

      // شو بدك تعمل؟
      const add = (confirmed, withCuts) => {
        const item = {
          id: uid('item'), kind: 'want', name, icon: 'bag', amount, currency: d.currency, priority: 2,
          date, month: key, note: '', status: 'planned', createdAt: Date.now(), confirmed,
        };
        const prevMB = JSON.parse(JSON.stringify(store.state.settings.monthBudgets || {}));
        store.update((s) => {
          s.planItems.push(item);
          if (withCuts && applyCuts) s.settings.monthBudgets = JSON.parse(JSON.stringify(applyCuts));
        });
        close();
        haptic('success');
        toast(confirmed ? `تثبّت «${name}»${withCuts ? ' وانطبق التخفيض' : ''}` : `انضاف «${name}» للمشتريات`, {
          action: 'تراجع', duration: 6000,
          onAction: () => store.update((s) => { s.planItems = s.planItems.filter((x) => x.id !== item.id); if (withCuts) s.settings.monthBudgets = prevMB; }),
        });
      };
      out.push(h('div', { class: 'wi-actions' },
        applyCuts ? h('button', { class: 'btn gold block', type: 'button', onclick: () => add(true, true) }, icon('pin', 18), 'ثبّت الشراء وطبّق التخفيض') : null,
        applyCuts ? h('p', { class: 'field-hint' }, `${cutsNote}، كميزانية استثنائية لهالشهر بس.`) : null,
        h('button', { class: `btn ${applyCuts ? 'secondary' : 'gold'} block`, type: 'button', onclick: () => add(true, false) }, icon('pin', 18), applyCuts ? 'ثبّته بلا تخفيض' : 'ثبّت الشراء بهالتاريخ'),
        h('button', { class: 'btn secondary block', type: 'button', onclick: () => add(false, false) }, icon('bag', 18), 'ضيفه للمشتريات، والخطة بتختار شهره')));
      fill(result, out);
      requestAnimationFrame(() => result.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    if (d.amount) setTimeout(calc, 80);
  }, { tall: true });
}
