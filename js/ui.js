// أدوات الواجهة: إنشاء العناصر، الورقة المنزلقة، الإشعارات
const SVG_NS = 'http://www.w3.org/2000/svg';

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
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
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

export function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

const ICONS = {
  home: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
  list: 'M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.5M4.5 12h.5M4.5 17.5h.5',
  plan: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8.5 3v4M15.5 3v4M8 14h3',
  wallet: 'M3.5 7.5a2 2 0 0 1 2-2H17v2.5M3.5 7.5v10a2 2 0 0 0 2 2h15v-12h-15a2 2 0 0 1-2-2zM16 13.5h1.5',
  more: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  chevR: 'M9 6l6 6-6 6',
  chevL: 'M15 6l-6 6 6 6',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  swap: 'M7 7.5h12.5l-3-3M17 16.5H4.5l3 3',
};

export function icon(name, size = 22) {
  return svgEl('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor',
    'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon',
  }, svgEl('path', { d: ICONS[name] }));
}

// ورقة منزلقة من تحت. زر الرجوع بأندرويد بيسكّرها.
const stack = [];
window.addEventListener('popstate', () => {
  const top = stack.pop();
  if (top) top.destroy();
});

export function openSheet(title, build, { onClose } = {}) {
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;
  const body = h('div', { class: 'sheet-body' });
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' },
      h('h2', { id: titleId }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'إغلاق', onclick: () => close() }, icon('close', 20))),
    body);
  const prevFocus = document.activeElement;

  const entry = {
    destroy() {
      panel.classList.remove('open');
      backdrop.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { panel.remove(); backdrop.remove(); }, 240);
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
export function toast(message, { action, onAction, duration = 3500 } = {}) {
  const root = document.getElementById('toast-root');
  clearTimeout(toastTimer);
  const el = h('div', { class: 'toast', role: 'status' },
    h('span', null, message),
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
    options.map((o) => h('button', { type: 'button', 'aria-pressed': String(o.value === value), onclick: () => onChange(o.value) }, o.label)));
}
