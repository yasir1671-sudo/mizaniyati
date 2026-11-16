// الترحيب لأول مرة: 4 خطوات بتجهّز الخطة (الاسم، الدخل، الادخار، العملة)
import { h, icon, fill, openSheet, toast, field, segmented, haptic } from './ui.js';
import { badge } from './icons.js';
import { store, AUTO_BUDGET_WEIGHTS, AUTO_BUDGET_SHARE } from './store.js';
import { CURRENCIES, CODES, fmt, parseAmount, toUSD } from './money.js';
import { switchRow, currencyPicker } from './forms.js';
import { accountBalances } from './calc.js';
import { currentMonth } from './dates.js';

const cleanNum = (n) => String(+Number(n).toPrecision(8));

export function openOnboarding() {
  const st = store.state;
  const salary = st.incomeSources.find((s) => s.id === 'onb_salary');
  const stocks = st.incomeSources.find((s) => s.id === 'onb_stocks');
  const defAcc = st.accounts.find((a) => a.id === st.settings.defaultAccountId);
  const d = {
    step: 0,
    name: st.settings.name || '',
    income: salary ? cleanNum(salary.amount) : '',
    currency: salary?.currency || 'USD',
    stocks: stocks ? cleanNum(stocks.amount) : '',
    pct: 20,
    auto: true,
    spend: defAcc?.currency || 'USD',
    syp: st.rates.SYP?.rate ? cleanNum(st.rates.SYP.rate) : '',
    balances: Object.fromEntries(CODES.map((c) => {
      const acc = st.accounts.find((a) => a.currency === c && !a.savings);
      const v = acc ? accountBalances(st).get(acc.id) : 0;
      return [c, v ? cleanNum(Math.round(v * 100) / 100) : ''];
    })),
    settled: Boolean(st.settings.settledMonths?.[currentMonth()]),
  };
  let finished = false;
  const STEPS = 5;

  openSheet('أهلاً بميزانيتي', (body, close) => {
    // دخل شهري بالدولار حسب اللي انكتب لهلّق
    function incomeUSD() {
      const s = store.state;
      const rates = { ...s.rates };
      const sypRate = parseAmount(d.syp);
      const conv = (amount, cur) => {
        if (cur === 'SYP' && sypRate > 0) return amount / sypRate;
        return toUSD({ ...s, rates }, amount, cur);
      };
      const a = parseAmount(d.income) > 0 ? conv(parseAmount(d.income), d.currency) : 0;
      const b = parseAmount(d.stocks) > 0 ? conv(parseAmount(d.stocks), d.currency) : 0;
      return a + b;
    }

    function nav(nextLabel, onNext, { skip } = {}) {
      return h('div', { class: 'two', style: { marginTop: '6px' } },
        d.step > 0 ? h('button', { class: 'btn secondary', type: 'button', onclick: () => { d.step -= 1; render(); } }, 'رجوع') : (skip || h('span')),
        h('button', { class: 'btn', type: 'button', onclick: onNext }, nextLabel));
    }

    function render() {
      const dots = h('div', { class: 'onb-steps', 'aria-hidden': 'true' }, Array.from({ length: STEPS }, (_, i) => h('i', { class: i === d.step ? 'on' : '' })));
      let content;
      if (d.step === 0) {
        const feat = (name, tint, title, sub) => h('div', { class: 'onb-feat' }, badge(name, tint, 42), h('div', null, h('b', null, title), h('small', null, sub)));
        content = [
          h('div', { class: 'onb-hero' }, badge('sparkle', 'mint', 64), h('h3', null, 'تطبيق بيخطط لمصاريك'), h('p', null, 'مش بس بيسجّل شو صرفت. بيقلك قدّيش فيك تصرف، وإيمتى فيك تشتري، وقدّيش تدّخر.')),
          h('div', { class: 'onb-feats' },
            feat('target', 'mint', 'مصروف اليوم', 'رقم واحد كل يوم: قدّيش باقي لك تصرف'),
            feat('trend', 'blue', 'خطة 12 شهر', 'مشترياتك بتنحط بالشهر اللي فيه فائض'),
            feat('moon', 'gold', 'الديون والزكاة', 'كل شي بيخص مالك بمكان واحد')),
          field('شو اسمك؟', h('input', { type: 'text', value: d.name, placeholder: 'مثلاً: ياسر', oninput: (e) => { d.name = e.target.value; } })),
          nav('يلا نبلّش', () => { d.step = 1; render(); }),
        ];
      } else if (d.step === 1) {
        content = [
          h('div', { class: 'onb-hero' }, badge('briefcase', 'mint', 56), h('h3', null, 'قدّيش دخلك بالشهر؟'), h('p', null, 'الراتب أو الدخل الثابت. فيك تعدّله بعدين من الخطة.')),
          h('div', { class: 'two' },
            field('الدخل الشهري', h('input', { type: 'text', inputmode: 'decimal', value: d.income, placeholder: '0', 'data-autofocus': true, oninput: (e) => { d.income = e.target.value; } })),
            field('العملة', currencyPicker(d.currency, (v) => { d.currency = v; render(); }))),
          field('دخل متغيّر متل الأسهم (اختياري)', h('input', { type: 'text', inputmode: 'decimal', value: d.stocks, placeholder: '0', oninput: (e) => { d.stocks = e.target.value; } }),
            'حط الرقم الأقل اللي متأكد منه بالشهر.'),
          nav('التالي', () => {
            if (!(parseAmount(d.income) > 0)) { haptic('warn'); toast('اكتب دخلك الشهري.', { kind: 'warn' }); return; }
            d.step = 2; render();
          }),
        ];
      } else if (d.step === 2) {
        const inc = incomeUSD();
        const save = Number.isFinite(inc) ? Math.round((inc * d.pct) / 100) : 0;
        const spend = Number.isFinite(inc) ? inc - save : NaN;
        content = [
          h('div', { class: 'onb-hero' }, badge('coins', 'gold', 56), h('h3', null, 'قدّيش بدك تدّخر؟'), h('p', null, 'الادخار بينشال أول ما يوصل الدخل، قبل أي مصروف.')),
          segmented([10, 15, 20, 30].map((p) => ({ value: p, label: `${p}%` })), d.pct, (v) => { d.pct = v; render(); }, 'نسبة الادخار'),
          Number.isFinite(inc)
            ? h('div', { class: 'duo', style: { padding: '0 0 6px' } },
              h('div', null, h('small', null, 'بتشيل بالشهر'), h('b', { class: 'amount', style: { color: 'var(--gold)' } }, fmt(save))),
              h('div', null, h('small', null, 'بيبقى للصرف'), h('b', { class: 'amount' }, fmt(spend)), h('span', null, `يعني حوالي ${fmt(spend / 30)} باليوم`)))
            : h('p', { class: 'hint' }, `بالخطوة الجاية حط سعر ${CURRENCIES[d.currency].name} مشان نحسب بالدولار.`),
          h('div', { class: 'sheet-rows rows' },
            switchRow('وزّع الباقي على الفئات', 'أكل، بقالة، مواصلات، فواتير… بنسب مقترحة، وفيك تعدّلها بعدين.', d.auto, (v) => { d.auto = v; })),
          nav('التالي', () => { d.step = 3; render(); }),
        ];
      } else if (d.step === 3) {
        content = [
          h('div', { class: 'onb-hero' }, badge('wallet', 'teal', 56), h('h3', null, 'بأي عملة بتصرف أغلب الشي؟'), h('p', null, 'المصاريف السريعة رح تنسجل على هالعملة. التخطيط كله بالدولار.')),
          segmented(CODES.map((c) => ({ value: c, label: CURRENCIES[c].name })), d.spend, (v) => { d.spend = v; render(); }, 'عملة الصرف'),
          (d.spend === 'SYP' || d.currency === 'SYP')
            ? field('كم ليرة سورية بالدولار اليوم؟', h('input', { type: 'text', inputmode: 'decimal', value: d.syp, placeholder: 'سعر السوق', oninput: (e) => { d.syp = e.target.value; } }),
              'سعر الليرة السورية بتحطه إنت، لأن سعر السوق غير الرسمي.')
            : h('p', { class: 'hint' }, 'سعر الليرة التركية بيجي تلقائي من النت.'),
          nav('التالي', () => { d.step = 4; render(); }),
        ];
      } else {
        // المصاري اللي معك هلّق: منها بيبلّش الحساب الفعلي
        content = [
          h('div', { class: 'onb-hero' }, badge('cash', 'mint', 56), h('h3', null, 'قدّيش معك هلّق؟'), h('p', null, 'المصاري الموجودة معك اليوم بكل عملة. منها بنعرف كيف بتكفّي باقي الشهر.')),
          CODES.map((c) => field(`${CURRENCIES[c].name}`, h('input', {
            type: 'text', inputmode: 'decimal', value: d.balances[c], placeholder: '0', 'aria-label': `معك بـ ${CURRENCIES[c].name}`,
            oninput: (e) => { d.balances[c] = e.target.value; },
          }))),
          h('div', { class: 'sheet-rows rows' },
            switchRow('دخل هالشهر وصلني', 'إذا قبضت الراتب هالشهر قبل ما تبلّش بالتطبيق، ما منستنّاه مرة تانية لهالشهر.', d.settled, (v) => { d.settled = v; })),
          nav('خلصنا', finish),
        ];
      }
      fill(body, [h('div', { class: 'onb' }, dots, content)]);
    }

    function finish() {
      const sypRate = parseAmount(d.syp);
      store.update((s) => {
        s.settings.name = d.name.trim();
        if (sypRate > 0) s.rates.SYP = { ...s.rates.SYP, rate: sypRate, at: Date.now(), mode: 'manual' };
        const upsertSource = (id, kind, name, amount) => {
          const i = s.incomeSources.findIndex((x) => x.id === id);
          if (!(amount > 0)) { if (i >= 0) s.incomeSources.splice(i, 1); return; }
          const rec = { id, kind, name, amount, currency: d.currency, schedule: 'monthly', month: null };
          if (i >= 0) s.incomeSources[i] = rec; else s.incomeSources.push(rec);
        };
        upsertSource('onb_salary', 'salary', 'الراتب', parseAmount(d.income));
        upsertSource('onb_stocks', 'stocks', 'دخل متغيّر', parseAmount(d.stocks));
        const acc = s.accounts.find((a) => a.currency === d.spend && !a.savings) || s.accounts.find((a) => a.currency === d.spend);
        if (acc) s.settings.defaultAccountId = acc.id;
        // الرصيد اللي كتبه بيصير رصيد المحفظة هلّق (منعدّل الرصيد الافتتاحي)
        const bal = accountBalances(s);
        for (const c of CODES) {
          const raw = String(d.balances[c] ?? '').trim();
          if (raw === '') continue;
          const want = parseAmount(raw);
          const a = s.accounts.find((x) => x.currency === c && !x.savings);
          if (!a || !Number.isFinite(want)) continue;
          const now = bal.get(a.id) || 0;
          a.opening = Math.round(((Number(a.opening) || 0) + (want - now)) * 100) / 100;
        }
        const key = currentMonth();
        const settled = { ...(s.settings.settledMonths || {}) };
        if (d.settled) settled[key] = true; else delete settled[key];
        s.settings.settledMonths = settled;
      });
      const inc = incomeUSD();
      store.update((s) => {
        if (Number.isFinite(inc) && inc > 0) {
          const save = Math.round((inc * d.pct) / 100);
          s.settings.savingsTarget = save;
          if (d.auto) {
            const others = s.categories.filter((c) => c.type === 'expense' && !(c.id in AUTO_BUDGET_WEIGHTS)).reduce((x, c) => x + (Number(c.budget) || 0), 0);
            const pool = Math.max(0, inc - save - others) * AUTO_BUDGET_SHARE;
            for (const c of s.categories) {
              const w = AUTO_BUDGET_WEIGHTS[c.id];
              if (w) c.budget = Math.floor((pool * w) / 100);
            }
          }
        }
        s.settings.onboarded = true;
      });
      finished = true;
      close();
      haptic('success');
      toast(d.name.trim() ? `جاهز يا ${d.name.trim()}! هاد مصروفك اليومي.` : 'جاهز! هاد مصروفك اليومي.');
    }

    render();
  }, {
    tall: true,
    onClose: () => {
      // إذا سكّرها بدون ما يكمّل، ما منرجع نفتحها كل مرة (فيه يرجعلها من الإعدادات)
      if (!finished && !store.state.settings.onboarded) store.update((s) => { s.settings.onboarded = true; }, { silent: true });
    },
  });
}

export { icon };
