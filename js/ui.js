// أدوات الواجهة: إنشاء العناصر، الورقة المنزلقة، الإشعارات، الاهتزاز
import { icon, badge } from './icons.js';
import { MONTHS, iso, parseISO, todayISO, dayLabel, monthLabel, addMonths } from './dates.js';

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
    try { panel.setPointerCapture?.(e.pointerId); } catch { /* */ }
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

/* ---------- نوافذ اختيار من ثيم التطبيق (بدل نوافذ كروم) ---------- */
// options: [{ value, label, sub, icon, tint }]
export function openPicker({ title, options, value, onPick }) {
  openSheet(title, (body, close) => {
    fill(body, [h('div', { class: 'rows sheet-rows pick-list' }, options.map((o) => h('button', {
      class: 'row', type: 'button', 'aria-pressed': String(o.value === value),
      onclick: () => { haptic('select'); onPick(o.value); close(); },
    },
    o.icon ? badge(o.icon, o.tint || 'slate', 38) : null,
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, o.label), o.sub ? h('span', { class: 'row-sub' }, o.sub) : null),
    o.value === value ? h('span', { class: 'pick-check' }, icon('check', 20, { stroke: 2.2 })) : null)))]);
  });
}

// زر شكله متل الحقل، بيفتح نافذة الاختيار
export function selectButton({ value, options, onChange, title, placeholder = 'اختار', disabled = false }) {
  const current = options.find((o) => o.value === value);
  return h('button', {
    type: 'button', class: 'select-btn', disabled,
    onclick: () => openPicker({ title, options, value, onPick: onChange }),
  },
  current?.icon ? badge(current.icon, current.tint || 'slate', 26) : null,
  h('span', { class: current ? 'sb-val' : 'sb-val ph' }, current ? current.label : placeholder),
  icon('chevD', 18));
}

const WEEK = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج']; // بتبلّش بالسبت

// تقويم: اختيار يوم
export function openDatePicker({ value, onPick, title = 'التاريخ' }) {
  const today = todayISO();
  let shown = (value || today).slice(0, 7);
  openSheet(title, (body, close) => {
    const pick = (d) => { haptic('select'); onPick(d); close(); };
    function render() {
      const [y, m] = shown.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      const offset = (first.getDay() + 1) % 7; // السبت = 0
      const dim = new Date(y, m, 0).getDate();
      const cells = [];
      for (let i = 0; i < offset; i++) cells.push(h('span'));
      for (let d = 1; d <= dim; d++) {
        const ds = iso(new Date(y, m - 1, d));
        cells.push(h('button', {
          type: 'button', class: `cal-day${ds === value ? ' on' : ''}${ds === today ? ' today' : ''}`,
          onclick: () => pick(ds),
        }, String(d)));
      }
      const y1 = new Date(); y1.setDate(y1.getDate() - 1);
      const y2 = new Date(); y2.setDate(y2.getDate() - 2);
      fill(body, [
        h('div', { class: 'chips', style: { marginBottom: '14px' } },
          h('button', { type: 'button', class: 'chip', 'aria-pressed': String(value === today), onclick: () => pick(today) }, 'اليوم'),
          h('button', { type: 'button', class: 'chip', 'aria-pressed': String(value === iso(y1)), onclick: () => pick(iso(y1)) }, 'أمس'),
          h('button', { type: 'button', class: 'chip', 'aria-pressed': String(value === iso(y2)), onclick: () => pick(iso(y2)) }, 'قبل يومين')),
        h('div', { class: 'cal-nav' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'الشهر السابق', onclick: () => { shown = addMonths(shown, -1); render(); } }, icon('chevR', 20)),
          h('strong', null, monthLabel(shown)),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'الشهر التالي', onclick: () => { shown = addMonths(shown, 1); render(); } }, icon('chevL', 20))),
        h('div', { class: 'cal-grid cal-week' }, WEEK.map((w) => h('span', null, w))),
        h('div', { class: 'cal-grid' }, cells),
      ]);
    }
    render();
  });
}

// اختيار شهر
export function openMonthPicker({ value, onPick, title = 'الشهر', allowEmpty = false, emptyLabel = 'بلا موعد' }) {
  let year = Number((value || todayISO()).slice(0, 4));
  openSheet(title, (body, close) => {
    const pick = (v) => { haptic('select'); onPick(v); close(); };
    function render() {
      fill(body, [
        h('div', { class: 'cal-nav' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'السنة السابقة', onclick: () => { year -= 1; render(); } }, icon('chevR', 20)),
          h('strong', null, String(year)),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'السنة التالية', onclick: () => { year += 1; render(); } }, icon('chevL', 20))),
        h('div', { class: 'month-grid' }, MONTHS.map((name, i) => {
          const v = `${year}-${String(i + 1).padStart(2, '0')}`;
          return h('button', { type: 'button', class: `month-cell${v === value ? ' on' : ''}${v === todayISO().slice(0, 7) ? ' today' : ''}`, onclick: () => pick(v) }, name);
        })),
        allowEmpty ? h('button', { type: 'button', class: 'btn secondary block', onclick: () => pick('') }, emptyLabel) : null,
      ]);
    }
    render();
  });
}

// اختيار يوم من الشهر (1 لـ 31)
export function openDayPicker({ value, onPick, title = 'يوم بالشهر' }) {
  openSheet(title, (body, close) => {
    fill(body, [h('div', { class: 'cal-grid days31' }, Array.from({ length: 31 }, (_, i) => i + 1).map((d) => h('button', {
      type: 'button', class: `cal-day${d === value ? ' on' : ''}`,
      onclick: () => { haptic('select'); onPick(d); close(); },
    }, String(d))))]);
  });
}

// زر تاريخ أو شهر بشكل الحقل
export function dateButton({ value, onChange, mode = 'day', placeholder = 'اختار', allowEmpty = false, title, emptyLabel }) {
  let label = placeholder;
  if (value) label = mode === 'month' ? monthLabel(value) : dayLabel(value);
  return h('button', {
    type: 'button', class: 'select-btn',
    onclick: () => (mode === 'month'
      ? openMonthPicker({ value, onPick: onChange, allowEmpty, title, emptyLabel })
      : openDatePicker({ value, onPick: onChange, title })),
  }, icon('calendar', 18), h('span', { class: value ? 'sb-val' : 'sb-val ph' }, label), icon('chevD', 18));
}

export function dayButton({ value, onChange, title }) {
  return h('button', { type: 'button', class: 'select-btn', onclick: () => openDayPicker({ value, onPick: onChange, title }) },
    icon('calendar', 18), h('span', { class: value ? 'sb-val' : 'sb-val ph' }, value ? `${value} بالشهر` : 'اختار اليوم'), icon('chevD', 18));
}

export { parseISO };

/* ---------- السحب يمين أو يسار لإزالة تذكير (لازم سحبة مقصودة، مش كبسة) ---------- */
export function swipeable(el, onDismiss) {
  let x0 = null;
  let y0 = 0;
  let dx = 0;
  let active = false;
  let width = 1;
  el.classList.add('swipe');
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input')) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; active = false; width = el.offsetWidth || 1;
  });
  el.addEventListener('pointermove', (e) => {
    if (x0 == null) return;
    const mx = e.clientX - x0;
    const my = e.clientY - y0;
    if (!active) {
      if (Math.abs(my) > 14 && Math.abs(my) > Math.abs(mx)) { x0 = null; return; }
      if (Math.abs(mx) < 14 || Math.abs(mx) < Math.abs(my) * 1.4) return;
      active = true;
      try { el.setPointerCapture?.(e.pointerId); } catch { /* */ }
      el.classList.add('swiping');
    }
    dx = mx;
    el.style.transform = `translate3d(${dx}px, 0, 0)`;
    el.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / width));
  });
  const end = () => {
    if (x0 == null) return;
    x0 = null;
    if (!active) return;
    el.classList.remove('swiping');
    if (Math.abs(dx) > width * 0.42) {
      haptic('select');
      el.style.transform = `translate3d(${dx > 0 ? width : -width}px, 0, 0)`;
      el.style.opacity = '0';
      setTimeout(onDismiss, 170);
    } else {
      el.style.transform = '';
      el.style.opacity = '';
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return el;
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
