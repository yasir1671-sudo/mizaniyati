// الإدخال بالصوت: بتحكي جملة (أو كذا مصروف)، التطبيق بيفهمها، وبتراجعها قبل ما تنسجل
import { h, icon, fill, openSheet, toast, haptic, openPicker } from './ui.js';
import { badge } from './icons.js';
import { store, uid } from './store.js';
import { CURRENCIES, fmt, parseAmount, rateOf } from './money.js';
import { todayISO } from './dates.js';
import { parseMulti } from './parse.js';
import { accountOpts } from './forms.js';
import { SOURCE_CATEGORY } from './income.js';

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const voiceSupported = () => Boolean(SR);

/* ---------- الاستماع ---------- */
export function openVoice() {
  if (!SR) {
    toast('المتصفح ما بيدعم التسجيل هون. استعمل مايك الكيبورد بخانة الكتابة.', { kind: 'warn', duration: 5000 });
    return;
  }
  let rec = null;
  let finalText = '';
  let liveText = '';
  let stopped = false;
  let langTried = 0;
  const LANGS = ['ar-SY', 'ar-LB', 'ar-JO', 'ar'];

  openSheet('احكي مصروفك', (body, close) => {
    const transcript = h('p', { class: 'voice-text', 'aria-live': 'polite' }, 'عم اسمعك…');
    const orb = h('div', { class: 'voice-orb listening' }, icon('mic', 34, { stroke: 2 }));
    fill(body, [
      h('div', { class: 'voice-wrap' },
        orb,
        transcript,
        h('p', { class: 'hint' }, 'متل: «صرفت 50 تركي مواصلات، و30 قهوة» أو «وصل الراتب 300 دولار» أو «عزمت أخوي على طبخة: 100 فروج و80 كولا».'),
        h('div', { class: 'two' },
          h('button', { class: 'btn secondary', type: 'button', onclick: () => { stopped = true; rec?.abort(); close(); } }, 'إلغاء'),
          h('button', { class: 'btn', type: 'button', onclick: () => { rec?.stop(); } }, icon('check', 18), 'خلصت'))),
    ]);

    function start() {
      rec = new SR();
      rec.lang = LANGS[langTried];
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += `${r[0].transcript} `;
          else interim += r[0].transcript;
        }
        liveText = `${finalText}${interim}`.trim();
        transcript.textContent = liveText || 'عم اسمعك…';
      };
      rec.onerror = (e) => {
        if (e.error === 'language-not-supported' && langTried < LANGS.length - 1) { langTried += 1; setTimeout(start, 50); return; }
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('لازم تسمح للتطبيق يستعمل المايك.', { kind: 'warn' }); stopped = true; close(); return; }
        if (e.error === 'no-speech') { transcript.textContent = 'ما سمعت شي. جرّب تحكي أقرب.'; }
        if (e.error === 'network') { toast('التسجيل بالصوت بدو نت.', { kind: 'warn' }); stopped = true; close(); }
      };
      rec.onend = () => {
        orb.classList.remove('listening');
        if (stopped) return;
        const text = (finalText || liveText).trim();
        if (!text) { transcript.textContent = 'ما سمعت شي. اضغط إلغاء وجرّب مرة تانية.'; return; }
        stopped = true;
        close();
        setTimeout(() => reviewText(text, { heard: true }), 320);
      };
      try { rec.start(); } catch { /* بلّش من قبل */ }
    }
    start();
  }, { onClose: () => { stopped = true; try { rec?.abort(); } catch { /* */ } } });
}

/* ---------- مراجعة العمليات قبل التسجيل ---------- */
export function reviewText(text, { heard = false } = {}) {
  const st = store.state;
  const items = parseMulti(text, st);
  if (!items.length) {
    toast(heard ? `ما لقيت مبلغ بـ «${text}». جرّب تذكر الرقم.` : 'ما لقيت مبلغ. اكتب الرقم مع المصروف.', { kind: 'warn', duration: 5000 });
    return false;
  }
  openReview(items, heard ? text : null);
  return true;
}

export function openReview(items, heard) {
  const list = items.map((it) => ({ ...it, amount: String(it.amount) }));
  openSheet(list.length > 1 ? `فهمت ${list.length} عمليات` : 'فهمت عملية وحدة', (body, close) => {
    function render() {
      const s = store.state;
      fill(body, [
        heard ? h('p', { class: 'heard' }, icon('mic', 16), `«${heard}»`) : null,
        h('div', { class: 'rev-list' }, list.map((it, i) => {
          const c = s.categories.find((x) => x.id === it.categoryId);
          const acc = s.accounts.find((a) => a.id === it.accountId);
          return h('div', { class: 'rev-item' },
            h('div', { class: 'rev-top' },
              h('button', {
                type: 'button', class: 'rev-cat', 'aria-label': `الفئة: ${c?.name || ''}`,
                onclick: () => openPicker({
                  title: 'الفئة', value: it.categoryId,
                  options: s.categories.map((x) => ({ value: x.id, label: x.name, sub: x.type === 'income' ? 'دخل' : 'مصروف', icon: x.icon, tint: x.tint })),
                  onPick: (v) => { it.categoryId = v; it.type = s.categories.find((x) => x.id === v)?.type || it.type; render(); },
                }),
              }, badge(c?.icon || 'tag', c?.tint || 'slate', 38), h('span', null, h('b', null, c?.name || 'اختار فئة'), h('small', null, it.type === 'income' ? 'دخل' : 'مصروف')), icon('chevD', 16)),
              h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': 'شيل هالعملية', onclick: () => { list.splice(i, 1); if (!list.length) close(); else render(); } }, icon('close', 18))),
            h('div', { class: 'rev-bottom' },
              h('input', { type: 'text', inputmode: 'decimal', value: it.amount, 'aria-label': 'المبلغ', oninput: (e) => { it.amount = e.target.value; } }),
              h('button', {
                type: 'button', class: 'meta-chip',
                onclick: () => openPicker({ title: 'المحفظة', value: it.accountId, options: accountOpts(), onPick: (v) => { it.accountId = v; render(); } }),
              }, CURRENCIES[acc?.currency || 'USD'].symbol, ' ', acc?.name || '')),
            h('input', { type: 'text', class: 'rev-note', value: it.note, placeholder: 'ملاحظة', 'aria-label': 'ملاحظة', oninput: (e) => { it.note = e.target.value; } }));
        })),
        h('button', { class: 'btn block', type: 'button', onclick: saveAll }, icon('check', 18), list.length > 1 ? `سجّل الكل (${list.length})` : 'سجّل'),
      ]);
    }

    function saveAll() {
      const s = store.state;
      const txs = [];
      for (const it of list) {
        const amount = parseAmount(it.amount);
        if (!(amount > 0)) continue;
        const acc = s.accounts.find((a) => a.id === it.accountId);
        const rate = rateOf(s, acc?.currency || 'USD');
        if (!rate) { toast(`حدد سعر ${CURRENCIES[acc.currency].name} أول.`, { kind: 'warn' }); return; }
        const tx = { id: uid('tx'), type: it.type, date: todayISO(), accountId: it.accountId, amount, categoryId: it.categoryId, note: (it.note || '').trim(), usd: amount / rate, createdAt: Date.now() + txs.length };
        // الدخل بفئة مصدر (راتب، أسهم…) بيرتبط بالمصدر مشان تختفي «وصل؟»
        if (it.type === 'income') {
          const src = s.incomeSources.find((x) => SOURCE_CATEGORY[x.kind] === it.categoryId);
          if (src) tx.sourceId = src.id;
        }
        txs.push(tx);
      }
      if (!txs.length) { toast('ما في مبالغ.', { kind: 'warn' }); return; }
      store.update((x) => { x.transactions.push(...txs); });
      close();
      haptic('success');
      const ids = new Set(txs.map((t) => t.id));
      const total = txs.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.usd, 0);
      toast(txs.length > 1 ? `انسجلت ${txs.length} عمليات${total ? `، مصروف ${fmt(total)}` : ''}` : 'انسجلت العملية', {
        action: 'تراجع', onAction: () => store.update((x) => { x.transactions = x.transactions.filter((t) => !ids.has(t.id)); }),
      });
    }

    render();
  });
}
