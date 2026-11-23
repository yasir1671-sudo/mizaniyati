// الإدخال بالصوت: بتضغط المايك وبتحكي كل مصاريفك ورا بعض، التطبيق بيفهمها، وبتراجعها بكبسة
import { h, icon, fill, openSheet, toast, haptic, openPicker, openDatePicker } from './ui.js';
import { badge } from './icons.js';
import { store, uid, catLabel } from './store.js';
import { CURRENCIES, fmt, parseAmount, rateOf, toUSD, fromUSD } from './money.js';
import { todayISO, dayLabel, countText, txCountText } from './dates.js';
import { parseMulti, mergeSpeech, learnNote } from './parse.js';
import { accountOpts } from './forms.js';
import { SOURCE_CATEGORY } from './income.js';
import { debtRemaining } from './calc.js';
import { creditGoalForDebt, uncreditGoal } from './planner.js';
import { orderedCats } from './smart.js';

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const voiceSupported = () => Boolean(SR);
const LANGS = ['ar-SY', 'ar-LB', 'ar-JO', 'ar'];
let langIndex = 0; // اللغة اللي اشتغلت بتنحفظ للمرة الجاية

/*
 * الاستماع: بيضل يسمع لحتى تضغط «خلصت» (أو تسكت كم ثانية).
 * أندرويد بيوقف السماع بعد كل سكتة وبيكرر النص، فمنرجع نشغّله ومنشيل التكرار.
 */
export function openVoice({ keep = null } = {}) {
  if (!SR) {
    toast('المتصفح ما بيدعم التسجيل هون. استعمل مايك الكيبورد بخانة الكتابة.', { kind: 'warn', duration: 5000 });
    return;
  }
  let rec = null;
  const committed = [];
  let sessionFinals = [];
  let interim = '';
  let done = false;
  let cancelled = false;
  let finished = false;
  let restarts = 0;
  const startedAt = Date.now();
  let lastSpeechAt = Date.now();
  let heardAnything = false;

  openSheet('احكي مصاريفك', (body, close) => {
    const status = h('p', { class: 'voice-status' }, 'عم اسمعك… احكي كل شي ورا بعض');
    const transcript = h('p', { class: 'voice-text', 'aria-live': 'polite' });
    const preview = h('div', { class: 'voice-preview', 'aria-live': 'polite' });
    const orb = h('div', { class: 'voice-orb listening' }, icon('mic', 34, { stroke: 2 }));
    const doneBtn = h('button', { class: 'btn', type: 'button', onclick: () => { done = true; haptic('select'); status.textContent = 'لحظة…'; try { rec?.stop(); } catch { finish(); } } }, icon('check', 18), 'خلصت');
    fill(body, [
      h('div', { class: 'voice-wrap' },
        orb, status, transcript, preview,
        h('p', { class: 'hint' }, 'متل: «صرفت 50 تركي مواصلات، و30 قهوة، ومبارح اشتريت خبز بعشرين» أو «وصل الراتب 300 دولار».'),
        h('div', { class: 'two' },
          h('button', { class: 'btn secondary', type: 'button', onclick: () => { cancelled = true; try { rec?.abort(); } catch { /* */ } close(); } }, 'إلغاء'),
          doneBtn)),
    ]);

    const textNow = (withInterim) => mergeSpeech([...committed, ...sessionFinals, withInterim ? interim : '']);

    function draw() {
      const t = textNow(true);
      transcript.textContent = t;
      if (!t) { fill(preview, []); return; }
      const items = parseMulti(t, store.state);
      const s = store.state;
      fill(preview, items.slice(0, 6).map((it) => {
        const c = s.categories.find((x) => x.id === it.categoryId);
        return h('span', { class: `vp-chip${it.matched ? '' : ' unsure'}` }, badge(c?.icon || 'tag', c?.tint || 'slate', 22),
          h('b', null, fmt(it.amount, it.currency, { reveal: true })), h('span', null, catLabel(c)));
      }));
    }

    function start() {
      if (cancelled || finished) return;
      rec = new SR();
      rec.lang = LANGS[langIndex];
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      sessionFinals = [];
      interim = '';
      rec.onresult = (e) => {
        // منبني النص من كل النتايج كل مرة (أندرويد بيرجّع نفس النتيجة كذا مرة)
        const finals = [];
        let inter = '';
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finals.push(r[0].transcript); else inter += ` ${r[0].transcript}`;
        }
        sessionFinals = finals;
        interim = inter.trim();
        lastSpeechAt = Date.now();
        heardAnything = true;
        orb.classList.add('listening');
        status.textContent = 'عم اسمعك…';
        draw();
      };
      rec.onerror = (e) => {
        if (e.error === 'language-not-supported' && langIndex < LANGS.length - 1) { langIndex += 1; return; }
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('لازم تسمح للتطبيق يستعمل المايك.', { kind: 'warn' }); cancelled = true; close(); return; }
        if (e.error === 'network') { toast('التسجيل بالصوت بدو نت.', { kind: 'warn' }); cancelled = true; close(); }
      };
      rec.onend = () => {
        committed.push(...sessionFinals);
        if (interim) committed.push(interim);
        sessionFinals = [];
        interim = '';
        if (cancelled || finished) return;
        const quietFor = Date.now() - lastSpeechAt;
        // ما ضغطت «خلصت»: منرجع نسمع (إلا إذا سكتت كتير)
        if (!done && restarts < 25 && Date.now() - startedAt < 180000 && quietFor < (heardAnything ? 6000 : 9000)) {
          restarts += 1;
          orb.classList.remove('listening');
          status.textContent = heardAnything ? 'كمّل، عم اسمعك…' : 'عم اسمعك…';
          setTimeout(start, 80);
          return;
        }
        finish();
      };
      try { rec.start(); } catch { /* بلّش من قبل */ }
    }

    function finish() {
      if (finished) return;
      finished = true;
      orb.classList.remove('listening');
      const text = textNow(false);
      if (!text) {
        status.textContent = 'ما سمعت شي.';
        doneBtn.replaceWith(h('button', { class: 'btn', type: 'button', onclick: () => { close(); setTimeout(() => openVoice({ keep }), 320); } }, icon('mic', 18), 'جرّب مرة تانية'));
        return;
      }
      close();
      setTimeout(() => reviewText(text, { heard: true, keep }), 320);
    }

    start();
  }, { onClose: () => { cancelled = true; try { rec?.abort(); } catch { /* */ } } });
}

/* ---------- مراجعة العمليات قبل التسجيل ---------- */
export function reviewText(text, { heard = false, keep = null } = {}) {
  const st = store.state;
  const items = parseMulti(text, st);
  if (!items.length && !keep?.length) {
    toast(heard ? `ما لقيت مبلغ بـ «${text}». جرّب تذكر الرقم.` : 'ما لقيت مبلغ. اكتب الرقم مع المصروف.', { kind: 'warn', duration: 5000 });
    return false;
  }
  const prev = keep || [];
  openReview([...prev, ...items.map((it) => ({ ...it, amount: String(it.amount), heard: heard ? text : null }))], { heard: heard ? text : null });
  return true;
}

export function openReview(items, { heard = null, receipt = null } = {}) {
  const today = todayISO();
  const list = items.map((it) => ({ ...it, amount: String(it.amount), date: it.date || today }));
  // الفاتورة: كل فئة بتنسجل عملية وحدة (والأغراض بملاحظتها)، إلا إذا بدك كل غرض لحاله
  let group = Boolean(receipt);
  const itemsText = (n) => countText(n, ['غرض واحد', 'غرضين', 'أغراض', 'غرض']);
  let title = `فهمت ${txCountText(list.length)}`;
  if (receipt) title = receipt.store ? `فاتورة ${receipt.store}` : `فاتورة فيها ${itemsText(list.length)}`;
  openSheet(title, (body, close) => {
    function receiptHead(s) {
      const sum = list.reduce((x, it) => x + (parseAmount(it.amount) || 0), 0);
      const diff = receipt.total ? receipt.total - sum : 0;
      const cats = new Set(list.map((it) => it.categoryId)).size;
      return h('div', { class: 'rc-head' },
        h('div', { class: 'ba-grid' },
          h('div', { class: 'ba-tile' }, h('small', null, `مجموع ${itemsText(list.length)}`), h('b', null, fmt(sum, receipt.currency, { reveal: true })), h('span', null, dayLabel(list[0]?.date || today))),
          h('div', { class: `ba-tile ${receipt.total && Math.abs(diff) > 0.05 ? 'warn' : ''}`.trim() }, h('small', null, 'مجموع الفاتورة'),
            h('b', null, receipt.total ? fmt(receipt.total, receipt.currency, { reveal: true }) : '—'),
            h('span', null, !receipt.total ? 'ما انقرا' : Math.abs(diff) <= 0.05 ? 'مطابق' : `الفرق ${fmt(Math.abs(diff), receipt.currency, { reveal: true })}`))),
        receipt.total && Math.abs(diff) > 0.05 ? h('p', { class: 'rev-warn' }, icon('info', 16), 'المجموع مو مطابق. شيك على الأسعار، أو ممكن في غرض ما انقرا.') : null,
        h('label', { class: 'switch-row rc-group' },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, 'جمّع حسب الفئة'), h('span', { class: 'row-sub wrap' }, group ? `بتنسجل ${txCountText(cats)}، والأغراض بملاحظاتها` : 'كل غرض بينسجل عملية لحاله')),
          h('span', { class: 'switch' }, h('input', { type: 'checkbox', checked: group, onchange: (e) => { group = e.target.checked; haptic('select'); render(); } }), h('i'))));
    }
    function render() {
      const s = store.state;
      const unsure = list.filter((it) => !it.matched && (it.categoryId === 'cat_other' || it.categoryId === 'inc_other')).length;
      fill(body, [
        heard ? h('p', { class: 'heard' }, icon('mic', 16), `«${heard}»`) : null,
        receipt ? receiptHead(s) : null,
        unsure ? h('p', { class: 'rev-warn' }, icon('info', 16), unsure > 1 ? `${txCountText(unsure)} ما عرفت فئتها. اختارها بكبسة، والمرة الجاية بتذكّرها.` : 'في عملية ما عرفت فئتها. اختارها بكبسة، والمرة الجاية بتذكّرها.') : null,
        h('div', { class: 'rev-list' }, list.map((it, i) => itemCard(s, it, i))),
        receipt
          ? h('button', { class: 'btn block', type: 'button', onclick: saveAll }, icon('check', 18), 'سجّل الفاتورة')
          : h('div', { class: 'rev-actions' },
            h('button', { class: 'btn secondary', type: 'button', onclick: more }, icon('mic', 18), 'كمّل حكي'),
            h('button', { class: 'btn', type: 'button', onclick: saveAll }, icon('check', 18), list.length > 1 ? `سجّل الكل (${list.length})` : 'سجّل')),
      ]);
    }

    function itemCard(s, it, i) {
      const c = s.categories.find((x) => x.id === it.categoryId);
      const acc = s.accounts.find((a) => a.id === it.accountId);
      const debt = it.debtId ? s.debts.find((d) => d.id === it.debtId) : null;
      const isUnsure = !it.matched && (it.categoryId === 'cat_other' || it.categoryId === 'inc_other');
      const pick = (v) => {
        const cat = s.categories.find((x) => x.id === v);
        it.categoryId = v;
        it.type = cat?.type || it.type;
        it.matched = true;
        if (v !== 'inc_debt' && v !== 'cat_debtpay') it.debtId = null;
        haptic('select');
        render();
      };
      // اقتراحات سريعة للفئة: الأكتر استعمالاً
      const quick = isUnsure ? orderedCats(s, it.type).filter((x) => x.id !== 'cat_other' && x.id !== 'inc_other').slice(0, 5) : [];
      return h('div', { class: `rev-item${isUnsure ? ' unsure' : ''}` },
        h('div', { class: 'rev-top' },
          h('button', {
            type: 'button', class: 'rev-cat', 'aria-label': `الفئة: ${c?.name || ''}`,
            onclick: () => openPicker({
              title: 'الفئة', value: it.categoryId,
              options: [...orderedCats(s, 'expense'), ...orderedCats(s, 'income')].map((x) => ({ value: x.id, label: x.name, sub: x.type === 'income' ? 'دخل' : 'مصروف', icon: x.icon, tint: x.tint })),
              onPick: pick,
            }),
          }, badge(c?.icon || 'tag', c?.tint || 'slate', 38),
          h('span', null, h('b', null, c?.name || 'اختار فئة'), h('small', null, debt ? (debt.direction === 'theyOwe' ? `رجّعلك ${debt.person}` : `سددت لـ ${debt.person}`) : it.type === 'income' ? 'دخل' : 'مصروف')),
          icon('chevD', 16)),
          h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': 'شيل هالعملية', onclick: () => { list.splice(i, 1); if (!list.length) close(); else render(); } }, icon('close', 18))),
        quick.length ? h('div', { class: 'rev-quick' }, quick.map((x) => h('button', { type: 'button', class: 'chip', onclick: () => pick(x.id) }, badge(x.icon, x.tint, 20), x.name))) : null,
        h('div', { class: 'rev-bottom' },
          h('input', { type: 'text', inputmode: 'decimal', value: it.amount, 'aria-label': 'المبلغ', oninput: (e) => { it.amount = e.target.value; } }),
          h('button', {
            type: 'button', class: 'meta-chip',
            onclick: () => openPicker({ title: 'المحفظة', value: it.accountId, options: accountOpts(), onPick: (v) => { it.accountId = v; render(); } }),
          }, CURRENCIES[acc?.currency || 'USD'].symbol, ' ', acc?.name || ''),
          h('button', {
            type: 'button', class: `meta-chip${it.date !== today ? ' on' : ''}`, 'aria-label': `التاريخ: ${dayLabel(it.date)}`,
            onclick: () => openDatePicker({ value: it.date, onPick: (v) => { it.date = v; render(); } }),
          }, icon('calendar', 14), dayLabel(it.date))),
        h('input', { type: 'text', class: 'rev-note', value: it.note, placeholder: 'ملاحظة', 'aria-label': 'ملاحظة', oninput: (e) => { it.note = e.target.value; } }),
        it.original && it.original !== it.note ? h('small', { class: 'rev-orig' }, it.original) : null);
    }

    // «كمّل حكي»: بيرجع يسمع وبيضيف على نفس القائمة
    function more() {
      const keep = list.map((it) => ({ ...it }));
      close();
      setTimeout(() => openVoice({ keep }), 320);
    }

    function saveAll() {
      const s = store.state;
      const txs = [];
      const payments = [];
      for (const it of list) {
        const amount = parseAmount(it.amount);
        if (!(amount > 0)) continue;
        const acc = s.accounts.find((a) => a.id === it.accountId);
        const rate = rateOf(s, acc?.currency || 'USD');
        if (!rate) { toast(`حدد سعر ${CURRENCIES[acc.currency].name} أول.`, { kind: 'warn' }); return; }
        const usd = amount / rate;
        const debt = it.debtId ? s.debts.find((d) => d.id === it.debtId) : null;
        if (debt && debtRemaining(debt) > 0.005) {
          const debtAmt = debt.currency === acc.currency ? amount : fromUSD(s, usd, debt.currency);
          if (Number.isFinite(debtAmt)) { payments.push({ it, debt, amount, usd, debtAmt: Math.min(debtRemaining(debt), Math.round(debtAmt * 100) / 100), acc }); continue; }
        }
        const tx = { id: uid('tx'), type: it.type, date: it.date || todayISO(), accountId: it.accountId, amount, categoryId: it.categoryId, note: (it.note || '').trim(), usd, createdAt: Date.now() + txs.length };
        // الدخل بفئة مصدر (راتب، أسهم…) بيرتبط بالمصدر مشان تختفي «وصل؟»
        if (it.type === 'income') {
          const src = s.incomeSources.find((x) => SOURCE_CATEGORY[x.kind] === it.categoryId);
          if (src) tx.sourceId = src.id;
        }
        txs.push(tx);
      }
      if (!txs.length && !payments.length) { toast('ما في مبالغ.', { kind: 'warn' }); return; }
      // الفاتورة مجمّعة: عملية وحدة لكل فئة ومحفظة وتاريخ، والأغراض بالملاحظة
      const learnList = txs.map((t) => [t.note, t.categoryId]);
      if (receipt && group) {
        const groups = new Map();
        for (const t of txs) {
          const k = `${t.categoryId}|${t.accountId}|${t.date}`;
          const g = groups.get(k) || { ...t, id: uid('tx'), amount: 0, usd: 0, items: [] };
          g.amount = Math.round((g.amount + t.amount) * 100) / 100;
          g.usd += t.usd;
          g.items.push({ n: t.note, a: t.amount });
          groups.set(k, g);
        }
        txs.length = 0;
        for (const g of groups.values()) {
          const names = g.items.map((x) => x.n).filter(Boolean).join('، ');
          const full = `${receipt.store ? `${receipt.store}: ` : ''}${names}`;
          g.note = full.length > 90 ? `${full.slice(0, 88)}…` : full;
          txs.push(g);
        }
      } else if (receipt?.store) {
        for (const t of txs) t.note = t.note ? `${t.note} (${receipt.store})` : receipt.store;
      }
      const made = [];
      store.update((x) => {
        x.transactions.push(...txs);
        for (const [note, cat] of learnList) learnNote(x, note, cat);
        for (const p of payments) {
          const dd = x.debts.find((k) => k.id === p.debt.id);
          if (!dd) continue;
          const theyOwe = dd.direction === 'theyOwe';
          const paymentId = uid('pay');
          const txId = uid('tx');
          const credit = theyOwe ? creditGoalForDebt(x, dd.id, p.usd) : null;
          dd.payments = [...(dd.payments || []), { id: paymentId, amount: p.debtAmt, date: p.it.date || todayISO(), txId, ...(credit ? { goalCredit: credit } : {}) }];
          x.transactions.push({ id: txId, type: 'debt', debtId: dd.id, paymentId, flow: theyOwe ? 'in' : 'out', accountId: p.acc.id, amount: p.amount, usd: p.usd, date: p.it.date || todayISO(), note: (p.it.note || '').trim() || dd.person, createdAt: Date.now() });
          made.push({ debtId: dd.id, paymentId, txId, credit });
        }
      });
      close();
      haptic('success');
      const ids = new Set(txs.map((t) => t.id));
      const count = txs.length + payments.length;
      const total = txs.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.usd, 0);
      toast(count > 1 ? `انسجلت ${txCountText(count)}${total ? `، مصروف ${fmt(total)}` : ''}` : 'انسجلت العملية', {
        action: 'تراجع', duration: 6000,
        onAction: () => store.update((x) => {
          x.transactions = x.transactions.filter((t) => !ids.has(t.id) && !made.some((m) => m.txId === t.id));
          for (const m of made) {
            const dd = x.debts.find((k) => k.id === m.debtId);
            if (dd) dd.payments = (dd.payments || []).filter((p) => p.id !== m.paymentId);
            if (m.credit) uncreditGoal(x, m.credit);
          }
        }),
      });
    }

    render();
  }, { tall: list.length > 2 });
}

export { toUSD };
