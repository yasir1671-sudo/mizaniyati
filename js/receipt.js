// صوّر الفاتورة: جيميناي بيقرأ كل غرض وسعره وعملته وبيحطه بفئة، وبتراجعه قبل ما ينسجل
import { h, icon, fill, openSheet, toast, haptic } from './ui.js';
import { badge } from './icons.js';
import { store } from './store.js';
import { todayISO, addDays } from './dates.js';
import { normalizeAr, noteTokens } from './parse.js';
import { openReview } from './voice.js';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_PAGE = 'https://aistudio.google.com/apikey';
// إذا ما قدرنا نجيب قائمة النماذج: هدول بالترتيب (من وثائق جوجل، تشرين الثاني 2026)
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];
const MAX_PHOTOS = 3;

export const aiReady = () => Boolean(store.state.settings.ai?.key);

/* ---------- النموذج: الأحدث من عيلة Flash اللي بيقبل الصور ---------- */
function versionOf(name) {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}
export async function pickModel(key) {
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!r.ok) throw await apiError(r);
  const j = await r.json();
  const names = (j.models || [])
    .filter((m) => (m.supportedGenerationMethods || m.supportedActions || []).includes('generateContent') || !(m.supportedGenerationMethods || m.supportedActions))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n));
  // Flash أول (أدق)، بعدين Flash-Lite، والأحدث أول
  names.sort((a, b) => (/lite/.test(a) - /lite/.test(b)) || versionOf(b) - versionOf(a));
  return names[0] || FALLBACK_MODELS[0];
}

async function apiError(r) {
  let msg = '';
  try { const j = await r.json(); msg = j?.error?.message || ''; } catch { /* */ }
  const e = new Error(msg || `HTTP ${r.status}`);
  e.status = r.status;
  return e;
}

export function errorText(e) {
  if (!navigator.onLine) return 'قراءة الفاتورة بدها نت.';
  const s = e?.status;
  const m = String(e?.message || '');
  if (s === 400 && /api key|API_KEY/i.test(m)) return 'المفتاح مو صحيح. جيب مفتاح جديد من AI Studio.';
  if (s === 401 || s === 403) return 'المفتاح ما إله صلاحية، أو جيميناي مو متاح بهالبلد.';
  if (s === 429) return 'خلص الحد المجاني لهلّق. جرّب بعد شوي.';
  if (s >= 500) return 'جوجل مشغولة هلّق. جرّب بعد شوي.';
  if (e?.name === 'AbortError') return 'انلغت القراءة.';
  if (e?.kind === 'unreadable') return 'ما قدرت اقرأ الفاتورة. صوّرها أقرب وبضو منيح.';
  return 'ما زبطت القراءة. جرّب مرة تانية.';
}

/* ---------- تصغير الصورة قبل ما تنبعت ---------- */
async function toJpeg(file, maxSide = 1600) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
    src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
  const w = src.width;
  const ht = src.height;
  const k = Math.min(1, maxSide / Math.max(w, ht));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(ht * k);
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
  const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  return { b64, url: URL.createObjectURL(blob) };
}

/* ---------- القراءة ---------- */
function buildPrompt(state) {
  const cats = state.categories.filter((c) => c.type === 'expense' && c.id !== 'cat_debtpay')
    .map((c) => `- ${c.id}: ${c.name}${(c.aliases || []).length ? ` (مثل: ${(c.aliases || []).slice(0, 8).join('، ')})` : ''}`).join('\n');
  return `You read a shopping receipt photo (usually a Turkish supermarket like BIM, A101, ŞOK, Migros, or a Syrian shop). Extract every purchased line item.

Rules:
- amount = the final price paid for that line (quantity × unit price), after any discount printed for that line.
- A separate discount line (İNDİRİM, KAMPANYA) that you cannot attach to one item: add it as its own item with a NEGATIVE amount, name_ar "خصم".
- Do NOT include: subtotal/total lines (ARA TOPLAM, TOPLAM), tax lines (KDV, TOPKDV), payment lines (NAKİT, KREDİ KARTI), change (PARA ÜSTÜ), loyalty points.
- A plastic bag (POŞET) IS an item.
- currency: TL or ₺ → "TRY"; ل.س or Syrian pound → "SYP"; $ or USD → "USD".
- date: the receipt date as YYYY-MM-DD if printed, otherwise null.
- total: the printed grand total (TOPLAM) as a number, otherwise null.
- store: the shop name if printed.
- name: the line as printed (short). name_ar: a short everyday Levantine Arabic name for the product (EKMEK → خبز، SÜT → حليب، YUMURTA → بيض، DOMATES → بندورة، ÇİKOLATA → شوكولاتة).
- category_id: the best matching id from this list (use cat_other only if nothing fits):
${cats}
- readable: false if the photo is not a receipt or is too blurry to read.`;
}

function buildSchema(state) {
  const ids = state.categories.filter((c) => c.type === 'expense' && c.id !== 'cat_debtpay').map((c) => c.id);
  return {
    type: 'OBJECT',
    properties: {
      readable: { type: 'BOOLEAN' },
      store: { type: 'STRING', nullable: true },
      date: { type: 'STRING', nullable: true },
      currency: { type: 'STRING', enum: ['TRY', 'SYP', 'USD'] },
      total: { type: 'NUMBER', nullable: true },
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING' },
            name_ar: { type: 'STRING' },
            quantity: { type: 'NUMBER', nullable: true },
            amount: { type: 'NUMBER' },
            category_id: { type: 'STRING', enum: ids },
          },
          required: ['name', 'name_ar', 'amount', 'category_id'],
        },
      },
    },
    required: ['readable', 'currency', 'items'],
  };
}

export async function readReceipt(images, { signal } = {}) {
  const st = store.state;
  const key = st.settings.ai?.key;
  let model = st.settings.ai?.model || FALLBACK_MODELS[0];
  const body = {
    contents: [{ parts: [...images.map((b64) => ({ inlineData: { mimeType: 'image/jpeg', data: b64 } })), { text: buildPrompt(st) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: buildSchema(st) },
  };
  const call = () => fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  let r = await call();
  // النموذج انشال أو تغيّر اسمه: منختار من جديد
  if (r.status === 404) {
    model = await pickModel(key);
    store.update((s) => { s.settings.ai = { ...s.settings.ai, model }; }, { silent: true });
    r = await call();
  }
  if (r.status >= 500) { await new Promise((res) => setTimeout(res, 1500)); r = await call(); }
  if (!r.ok) throw await apiError(r);
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  let data;
  try { data = JSON.parse(text); } catch { const e = new Error('bad json'); e.kind = 'unreadable'; throw e; }
  if (!data || data.readable === false || !Array.isArray(data.items) || !data.items.length) { const e = new Error('unreadable'); e.kind = 'unreadable'; throw e; }
  return { ...data, model };
}

// من رد جيميناي لعمليات بشاشة المراجعة (وتعلّمك بيغلب اقتراحه)
export function toReviewItems(data, state) {
  const learned = state.settings.learned || {};
  const valid = new Set(state.categories.filter((c) => c.type === 'expense').map((c) => c.id));
  const cur = ['TRY', 'SYP', 'USD'].includes(data.currency) ? data.currency : 'TRY';
  const def = state.accounts.find((a) => a.id === state.settings.defaultAccountId);
  const acc = def && def.currency === cur ? def : state.accounts.find((a) => a.currency === cur && !a.savings) || state.accounts.find((a) => a.currency === cur) || def || state.accounts[0];
  const today = todayISO();
  let date = /^\d{4}-\d{2}-\d{2}$/.test(data.date || '') ? data.date : today;
  if (date > today || date < addDays(today, -60)) date = today;
  let items = data.items.map((it) => {
    let categoryId = valid.has(it.category_id) ? it.category_id : 'cat_other';
    for (const t of noteTokens(it.name_ar || '')) {
      const L = learned[t];
      if (L && valid.has(L.c)) { categoryId = L.c; break; }
    }
    return {
      type: 'expense', amount: Math.round((Number(it.amount) || 0) * 100) / 100, accountId: acc?.id, currency: acc?.currency || cur,
      categoryId, note: String(it.name_ar || it.name || '').trim(), original: String(it.name || '').trim(),
      date, matched: categoryId !== 'cat_other',
    };
  }).filter((it) => it.amount !== 0);
  // الخصم العام بينقص من أغلى غرض (مشان المجموع يطلع صح)
  for (const disc of items.filter((x) => x.amount < 0)) {
    const target = items.filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount)[0];
    if (target) target.amount = Math.round((target.amount + disc.amount) * 100) / 100;
  }
  items = items.filter((x) => x.amount > 0);
  const sum = items.reduce((s, x) => s + x.amount, 0);
  return { items, receipt: { store: (data.store || '').trim(), total: Number(data.total) || null, sum, currency: acc?.currency || cur, date } };
}

/* ---------- الشاشة: صوّر ← اقرأ ← راجع ---------- */
export function openReceiptScan() {
  if (!aiReady()) { openAiSetup({ then: openReceiptScan }); return; }
  const photos = [];
  let busy = false;
  let ctrl = null;
  openSheet('صوّر الفاتورة', (body, close) => {
    const pick = (capture) => {
      const input = h('input', { type: 'file', accept: 'image/*', ...(capture ? { capture: 'environment' } : { multiple: true }), style: { display: 'none' } });
      input.addEventListener('change', async () => {
        const files = [...(input.files || [])].slice(0, MAX_PHOTOS - photos.length);
        input.remove();
        for (const f of files) { try { photos.push(await toJpeg(f)); } catch { toast('ما قدرت افتح الصورة.', { kind: 'warn' }); } }
        render();
      });
      document.body.append(input);
      input.click();
    };
    async function read() {
      if (!photos.length || busy) return;
      busy = true;
      ctrl = new AbortController();
      render();
      const t0 = Date.now();
      const tick = setInterval(() => { const el = body.querySelector('.rc-secs'); if (el) el.textContent = `${Math.round((Date.now() - t0) / 1000)} ث`; }, 500);
      try {
        const data = await readReceipt(photos.map((p) => p.b64), { signal: ctrl.signal });
        clearInterval(tick);
        const { items, receipt } = toReviewItems(data, store.state);
        if (!items.length) { const e = new Error('empty'); e.kind = 'unreadable'; throw e; }
        haptic('success');
        close();
        setTimeout(() => openReview(items, { receipt }), 320);
      } catch (e) {
        clearInterval(tick);
        busy = false;
        if (e?.name === 'AbortError') { render(); return; }
        haptic('warn');
        render(errorText(e));
      }
    }
    function render(error = null) {
      const thumbs = photos.map((p, i) => h('div', { class: 'rc-thumb' },
        h('img', { src: p.url, alt: `صورة ${i + 1}` }),
        busy ? null : h('button', { type: 'button', class: 'icon-btn ghost', 'aria-label': 'شيل الصورة', onclick: () => { photos.splice(i, 1); render(); } }, icon('close', 16))));
      if (busy) {
        fill(body, [
          h('div', { class: 'rc-busy' },
            h('div', { class: 'rc-thumbs' }, thumbs),
            h('div', { class: 'voice-orb listening' }, icon('receipt', 32)),
            h('p', { class: 'voice-text' }, 'عم اقرأ الفاتورة…'),
            h('p', { class: 'hint' }, 'كل غرض وسعره وفئته. بتاخد كم ثانية.', ' ', h('span', { class: 'rc-secs' }, '')),
            h('button', { class: 'btn secondary block', type: 'button', onclick: () => ctrl?.abort() }, 'إلغاء')),
        ]);
        return;
      }
      fill(body, [
        !photos.length ? h('div', { class: 'rc-intro' },
          badge('receipt', 'teal', 56),
          h('p', null, 'صوّر الفاتورة كاملة وبضو منيح. إذا طويلة، صوّرها على كذا صورة (لحد 3).'),
          h('p', { class: 'hint' }, 'جيميناي بيقرأ كل غرض وسعره، وبيحطه بفئة، وبتراجع الكل قبل ما ينسجل.')) : null,
        photos.length ? h('div', { class: 'rc-thumbs' }, thumbs) : null,
        error ? h('p', { class: 'result-line bad' }, error) : null,
        h('div', { class: 'two' },
          h('button', { class: `btn ${photos.length ? 'secondary' : ''}`.trim(), type: 'button', disabled: photos.length >= MAX_PHOTOS, onclick: () => pick(true) }, icon('camera', 18), photos.length ? 'صورة كمان' : 'صوّر'),
          h('button', { class: 'btn secondary', type: 'button', disabled: photos.length >= MAX_PHOTOS, onclick: () => pick(false) }, icon('image', 18), 'من الصور')),
        photos.length ? h('button', { class: 'btn block', type: 'button', onclick: read }, icon('sparkle', 18), photos.length > 1 ? `اقرأ الفاتورة (${photos.length} صور)` : 'اقرأ الفاتورة') : null,
      ]);
    }
    render();
  }, { onClose: () => { ctrl?.abort(); for (const p of photos) URL.revokeObjectURL(p.url); } });
}

/* ---------- تجهيز مفتاح جيميناي ---------- */
export function openAiSetup({ then = null } = {}) {
  const cur = store.state.settings.ai || {};
  let value = '';
  openSheet('قراءة الفواتير بجيميناي', (body, close) => {
    let status = null;
    let saving = false;
    function render() {
      status = h('p', { class: 'form-error', role: 'alert' });
      fill(body, [
        h('p', { class: 'hint' }, 'مشان التطبيق يقرأ الفواتير بدو «مفتاح» من جوجل. المفتاح مجاني، بتعمله مرة وحدة بحسابك:'),
        h('ol', { class: 'steps' },
          h('li', null, 'افتح صفحة المفاتيح بـ Google AI Studio (الزر تحت) وسجّل بحساب جوجل.'),
          h('li', null, 'اضغط «Create API key»، وإذا سألك اختار أي مشروع.'),
          h('li', null, 'انسخ المفتاح، وارجع الصقه هون.')),
        h('a', { class: 'btn secondary block', href: KEY_PAGE, target: '_blank', rel: 'noopener' }, icon('external', 18), 'افتح صفحة المفاتيح'),
        h('label', { class: 'field', style: { marginTop: '14px' } },
          h('span', { class: 'field-label' }, cur.key ? 'مفتاح جديد (اختياري)' : 'المفتاح'),
          h('input', { type: 'text', class: 'mono', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: cur.key ? `محفوظ: ${cur.key.slice(0, 6)}…` : 'الصق المفتاح هون', value, oninput: (e) => { value = e.target.value.trim(); } })),
        status,
        h('button', { class: 'btn block', type: 'button', disabled: saving, onclick: save }, icon('check', 18), saving ? 'عم جرّب المفتاح…' : 'جرّب واحفظ'),
        cur.key ? h('button', { class: 'btn danger block', type: 'button', onclick: remove }, 'شيل المفتاح') : null,
        h('p', { class: 'field-hint', style: { marginTop: '12px' } }, 'المفتاح بيضل على هالموبايل بس: ما بينحط بالكود، وما بيدخل بالنسخة الاحتياطية. بالطبقة المجانية جوجل ممكن تستعمل صور الفواتير لتحسين خدماتها، وفي حد يومي للاستعمال.'),
      ]);
    }
    async function save() {
      const key = value || cur.key;
      if (!key) { status.textContent = 'الصق المفتاح أول.'; return; }
      saving = true;
      render();
      try {
        const model = await pickModel(key);
        store.update((s) => { s.settings.ai = { ...s.settings.ai, key, model }; });
        haptic('success');
        close();
        toast(`اشتغل! رح نقرأ الفواتير بـ ${model}`);
        if (then) setTimeout(then, 350);
      } catch (e) {
        saving = false;
        render();
        status.textContent = e?.status === 400 || e?.status === 403 ? 'المفتاح مو صحيح أو ما إله صلاحية. تأكد إنك نسخته كامل.' : errorText(e);
      }
    }
    function remove() {
      store.update((s) => { s.settings.ai = { key: '', model: '' }; });
      close();
      toast('انشال المفتاح');
    }
    render();
  });
}

export { normalizeAr };
