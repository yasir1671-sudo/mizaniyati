// الرمز السري: بيحمي إظهار المبالغ وتعديل الميزانية لما يكون التطبيق بيد حدا تاني
import { h, icon, fill, openSheet, toast, haptic } from './ui.js';
import { badge } from './icons.js';
import { store } from './store.js';

const PIN_LEN = 4;

// منخزّن بصمة الرمز (SHA-256) مش الرمز نفسه
export async function hashPin(pin) {
  const text = `mizaniyati:${pin}`;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let x = 0;
    for (const ch of text) x = (Math.imul(31, x) + ch.charCodeAt(0)) | 0;
    return `f${(x >>> 0).toString(16)}`;
  }
}

/*
 * mode: 'verify' (تأكيد الرمز) أو 'set' (رمز جديد مع إعادته)
 */
export function openPinSheet({ mode = 'verify', title, onSuccess, onCancel }) {
  let entered = '';
  let first = null;
  let done = false;
  openSheet(title || (mode === 'set' ? 'رمز جديد' : 'الرمز السري'), (body, close) => {
    let dotsEl = null;
    let msgEl = null;

    function render(msg = '') {
      const step = mode === 'set' && first ? 'رجّع اكتب الرمز للتأكيد' : mode === 'set' ? 'اختار 4 أرقام بتتذكّرها' : 'اكتب الرمز السري';
      dotsEl = h('div', { class: 'pin-dots', 'aria-hidden': 'true' }, Array.from({ length: PIN_LEN }, (_, i) => h('i', { class: i < entered.length ? 'on' : '' })));
      msgEl = h('p', { class: `pin-msg ${msg ? 'bad' : ''}`.trim(), role: 'status' }, msg || step);
      const key = (label, k, cls = '') => h('button', { type: 'button', class: `key ${cls}`.trim(), 'aria-label': k === 'del' ? 'امسح' : String(label), onclick: () => press(k) }, label);
      fill(body, [
        h('div', { class: 'pin-wrap' },
          badge('lock', 'mint', 56),
          msgEl,
          dotsEl,
          h('div', { class: 'keypad pin-pad' },
            key('1', '1'), key('2', '2'), key('3', '3'),
            key('4', '4'), key('5', '5'), key('6', '6'),
            key('7', '7'), key('8', '8'), key('9', '9'),
            h('span'), key('0', '0'), key(icon('backspace', 22), 'del', 'op'))),
      ]);
    }

    async function press(k) {
      haptic('tap');
      if (k === 'del') { entered = entered.slice(0, -1); render(); return; }
      if (entered.length >= PIN_LEN) return;
      entered += k;
      render();
      if (entered.length < PIN_LEN) return;
      const value = entered;
      if (mode === 'set') {
        if (!first) { first = value; entered = ''; setTimeout(() => render(), 120); return; }
        if (first !== value) { first = null; entered = ''; haptic('warn'); shake(); render('الرمزين مو متل بعض. جرّب من جديد.'); return; }
        const hash = await hashPin(value);
        store.update((s) => { s.settings.pinHash = hash; });
        done = true;
        close();
        haptic('success');
        onSuccess?.();
        return;
      }
      const hash = await hashPin(value);
      if (hash === store.state.settings.pinHash) {
        done = true;
        close();
        haptic('success');
        onSuccess?.();
      } else {
        entered = '';
        haptic('warn');
        shake();
        render('الرمز غلط.');
      }
    }

    function shake() {
      const el = body.querySelector('.pin-dots');
      el?.classList.add('shake');
    }

    render();
  }, { onClose: () => { if (!done) onCancel?.(); } });
}

// شغّل الفعل بعد التأكد من الرمز (إذا في رمز)
export function requirePin(action, title) {
  if (!store.state.settings.pinHash) { action(); return; }
  openPinSheet({ mode: 'verify', title, onSuccess: action });
}

// زر العين: الإخفاء ما بدو رمز، والإظهار بدو الرمز
export function toggleHideAmounts() {
  const s = store.state.settings;
  if (!s.hideAmounts) {
    store.update((x) => { x.settings.hideAmounts = true; });
    haptic('select');
    if (!s.pinHash) {
      toast('خبّينا المبالغ. حط رمز مشان ما حدا يقدر يرجّعها غيرك.', {
        action: 'حط رمز', duration: 6000,
        onAction: () => openPinSheet({ mode: 'set', onSuccess: () => toast('انحفظ الرمز') }),
      });
    }
    return;
  }
  requirePin(() => store.update((x) => { x.settings.hideAmounts = false; }), 'دخّل الرمز لتظهر المبالغ');
}
