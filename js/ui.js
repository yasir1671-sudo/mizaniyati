// أدوات الواجهة: إنشاء العناصر، الورقة المنزلقة، الإشعارات، الاهتزاز
import { icon } from './icons.js';

export { icon };

function appendAll(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  let value;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'value') value = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
        }
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  appendAll(el, children);
  if (value != null) el.value = value;
  return el;
}

export function fill(el, items) {
  el.replaceChildren();
  appendAll(el, items);
}

// اهتزاز خفيف بيأكّد اللمس (أندرويد)
export function haptic(kind = 'tap') {
  try {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    const pattern ={ tap: 6, select: 10, success: [12, 40, 12], warn: [20, 40, 20] }[kind] || 8;
    navigator.vibrate?.(pattern);
  } catch { /* ما في اهتزاز */ }
}

/* ---------- الورقة المنزلقة: زر الرجوع بيسكّرها، والسحب لتحت كمان ---------- */
const stack = [];
window.addEventListener('popstate', () => {
  const top = stack.pop();
  if (top) top.destroy();
});
export const sheetOpen = () => stack.length > 0;

export function openSheet(title, build, { onClose, tall = false } = {}) {
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;
  const body = h('div', { class: 'sheet-body' });
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const head = h('div', { class: 'sheet-head' },
    h('h2', { id: titleId }, title),
    h('button', { class: 'icon-btn ghost', type: 'button', 'aria-label': 'إغلاق', onclick: () => close() }, icon('close', 20)));
  const grip = h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }, h('span'));
  const panel = h('div', { class: `sheet${tall ? ' tall' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, grip, head, body);
  const prevFocus = document.activeElement;

  const entry = {
    destroy() {
      panel.classList.remove('open');
      panel.style.transform = '';
      backdrop.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { panel.remove(); backdrop.remove(); }, 260);
      if (!stack.length) document.body.classList.remove('sheet-lock');
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
      onClose?.();
    },
  };
  function close() {
    if (stack[stack.length - 1] === entry) history.back();
  }
  function onKey(e) {
    if (e.key === 'Escape' && stack[stack.length - 1] === entry) close();
  }

  // السحب لتحت من راس الورقة
  let startY = null;
  let lastY = 0;
  let lastT = 0;
  let velocity = 0;
  const onDown = (e) => {
    if (e.target.closest('button, input, select, textarea')) return;
    startY = e.clientY; lastY = e.clientY; lastT = performance.now();
    panel.classList.add('dragging');
    panel.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (startY == null) return;
    const dy = Math.max(0, e.clientY - startY);
    const now = performance.now();
    velocity = (e.clientY - lastY) / Math.max(1, now - lastT);
    lastY = e.clientY; lastT = now;
    panel.style.transform = `translateY(${dy}px)`;
  };
  const onUp = (e) => {
    if (startY == null) return;
    const dy = Math.max(0, e.clientY - startY);
    startY = null;
    panel.classList.remove('dragging');
    if (dy > 120 || (dy > 40 && velocity > 0.6)) { haptic('tap'); close(); } else panel.style.transform = '';
  };
  for (const el of [grip, head]) el.addEventListener('pointerdown', onDown);
  panel.addEventListener('pointermove', onMove);
  panel.addEventListener('pointerup', onUp);
  panel.addEventListener('pointercancel', onUp);

  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  stack.push(entry);
  history.pushState({ sheet: stack.length }, '');
  document.body.append(backdrop, panel);
  document.body.classList.add('sheet-lock');
  build(body, close);
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    panel.classList.add('open');
    panel.querySelector('[data-autofocus]')?.focus();
  });
  return close;
}

export function confirmSheet(title, message, okLabel = 'تأكيد', { danger = true } = {}) {
  return new Promise((resolve) => {
    let result = false;
    openSheet(title, (body, close) => {
      body.append(
        h('p', { class: 'confirm-msg' }, message),
        h('div', { class: 'two' },
          h('button', { class: 'btn secondary', type: 'button', onclick: () => close() }, 'إلغاء'),
          h('button', { class: danger ? 'btn danger-solid' : 'btn', type: 'button', onclick: () => { result = true; close(); } }, okLabel)));
    }, { onClose: () => resolve(result) });
  });
}

let toastTimer = 0;
export function toast(message, { action, onAction, duration = 3500, kind = 'ok' } = {}) {
  const root = document.getElementById('toast-root');
  clearTimeout(toastTimer);
  const el = h('div', { class: `toast ${kind}`, role: 'status' },
    h('span', { class: 'toast-ic' }, icon(kind === 'warn' ? 'alert' : 'check', 16)),
    h('span', { class: 'toast-msg' }, message),
    action ? h('button', { type: 'button', onclick: () => { hide(); onAction?.(); } }, action) : null);
  function hide() {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 200);
  }
  root.replaceChildren(el);
  requestAnimationFrame(() => el.classList.add('show'));
  if (duration) toastTimer = setTimeout(hide, duration);
}

export function field(label, control, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null);
}

export function segmented(options, value, onChange, label) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map((o) => h('button', {
      type: 'button', 'aria-pressed': String(o.value === value),
      onclick: () => { if (o.value !== value) haptic('select'); onChange(o.value); },
    }, o.icon ? icon(o.icon, 16) : null, o.label)));
}

// اختيار أيقونة ولون (للفئات والأغراض والأهداف)
export function iconPicker(choices, value, onPick, tint) {
  const grid = h('div', { class: 'icon-grid', role: 'group', 'aria-label': 'الأيقونة' },
    choices.map((name) => h('button', {
      type: 'button', class: 'icon-choice', 'aria-pressed': String(name === value), 'aria-label': name,
      style: { '--tint': tint || 'var(--accent)' },
      onclick: (e) => {
        haptic('select');
        for (const b of grid.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        onPick(name);
      },
    }, icon(name, 20))));
  return grid;
}
