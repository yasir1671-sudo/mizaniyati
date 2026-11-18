// حفظ البيانات على الجهاز (localStorage) وإدارة الحالة
import { iconKey, TINT_KEYS } from './icons.js';

export const APP_VERSION = '2.2.0';
export const DATA_VERSION = 4;
const KEY = 'mizaniyati:data';

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// الكلمات (aliases) بتساعد الإدخال السريع يعرف الفئة: «50 أكل»
const DEFAULT_CATEGORIES = [
  { id: 'cat_food', type: 'expense', name: 'أكل ومطاعم', icon: 'food', tint: 'coral', aliases: ['أكل', 'طعام', 'غدا', 'غداء', 'عشا', 'عشاء', 'فطور', 'ترويقة', 'مطعم', 'مطاعم', 'شاورما', 'فلافل', 'بيتزا', 'سندويش', 'سندويشة', 'سندويشات', 'فروج', 'كريب', 'برغر', 'طبخة', 'عزيمة', 'وجبة'] },
  { id: 'cat_snacks', type: 'expense', name: 'سناكات وقهوة', icon: 'coffee', tint: 'amber', aliases: ['سناك', 'سناكات', 'قهوة', 'شاي', 'حلو', 'حلويات', 'بسكوت', 'عصير', 'بوظة', 'شيبس', 'كولا', 'متة'] },
  { id: 'cat_grocery', type: 'expense', name: 'بقالة وخضرة', icon: 'cart', tint: 'mint', aliases: ['بقالة', 'خضرة', 'خضار', 'فواكه', 'سوبرماركت', 'ماركت', 'خبز', 'لحمة', 'جاج', 'دجاج', 'رز', 'زيت', 'سكر'] },
  { id: 'cat_transport', type: 'expense', name: 'مواصلات', icon: 'car', tint: 'blue', aliases: ['مواصلات', 'تكسي', 'تاكسي', 'سرفيس', 'باص', 'بنزين', 'مازوت', 'أجرة', 'اجار', 'ماتور', 'موتور', 'توصيلة', 'فان', 'ميكرو', 'اوبر', 'مترو', 'سيارة'] },
  { id: 'cat_bills', type: 'expense', name: 'فواتير واشتراكات', icon: 'receipt', tint: 'teal', fixed: true, aliases: ['فاتورة', 'فواتير', 'كهربا', 'كهرباء', 'مياه', 'نت', 'انترنت', 'رصيد', 'اشتراك', 'موبايل', 'باقة', 'غاز', 'امبير'] },
  { id: 'cat_rent', type: 'expense', name: 'سكن وإيجار', icon: 'house', tint: 'violet', fixed: true, aliases: ['إيجار', 'ايجار', 'سكن', 'بيت'] },
  { id: 'cat_health', type: 'expense', name: 'صحة ودواء', icon: 'pill', tint: 'pink', aliases: ['دوا', 'دواء', 'صيدلية', 'دكتور', 'طبيب', 'مشفى', 'تحاليل', 'عيادة'] },
  { id: 'cat_clothes', type: 'expense', name: 'لبس', icon: 'shirt', tint: 'sage', aliases: ['لبس', 'تياب', 'ثياب', 'قميص', 'بنطلون', 'حذاء', 'صباط', 'جاكيت', 'كنزة'] },
  { id: 'cat_family', type: 'expense', name: 'عائلة وهدايا', icon: 'gift', tint: 'gold', aliases: ['هدية', 'هدايا', 'عائلة', 'أهل', 'عيدية'] },
  { id: 'cat_charity', type: 'expense', name: 'صدقة وزكاة', icon: 'heart', tint: 'mint', aliases: ['صدقة', 'زكاة', 'تبرع', 'كفالة'] },
  { id: 'cat_debtpay', type: 'expense', name: 'سداد دين علي', icon: 'people', tint: 'violet', aliases: ['سددت', 'رجعت', 'رجّعت', 'وفيت'] },
  { id: 'cat_other', type: 'expense', name: 'أخرى', icon: 'box', tint: 'slate', aliases: [] },
  { id: 'inc_salary', type: 'income', name: 'راتب', icon: 'briefcase', tint: 'mint', aliases: ['راتب', 'معاش'] },
  { id: 'inc_stocks', type: 'income', name: 'أسهم وأرباح', icon: 'trend', tint: 'blue', aliases: ['أسهم', 'سهم', 'أرباح', 'توزيعات'] },
  { id: 'inc_extra', type: 'income', name: 'دخل إضافي', icon: 'toolbox', tint: 'amber', aliases: ['شغل', 'مشروع', 'إضافي', 'فريلانس'] },
  { id: 'inc_debt', type: 'income', name: 'سداد دين إلي', icon: 'people', tint: 'violet', aliases: ['سداد', 'دين', 'رجعلي', 'رجّعلي', 'ردلي'] },
  { id: 'inc_other', type: 'income', name: 'دخل آخر', icon: 'plusCircle', tint: 'slate', aliases: [] },
];
const DEFAULTS_BY_ID = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));

export const PROTECTED_CATEGORIES = ['cat_other', 'inc_other'];
// الأساسيات بتنحجز أول، وما بتنقص بالاقتراحات (المطاعم والهدايا ثانوية)
export const ESSENTIAL_DEFAULTS = ['cat_grocery', 'cat_transport', 'cat_bills', 'cat_rent', 'cat_health', 'cat_charity', 'cat_debtpay'];

// التوزيع التلقائي بيترك 15% من المتاح فائض، مشان يضل في مجال للمشتريات المخططة
export const AUTO_BUDGET_SHARE = 0.85;
// توزيع تلقائي للميزانية (نسب من المبلغ المتاح للصرف)
export const AUTO_BUDGET_WEIGHTS = {
  cat_food: 24, cat_grocery: 24, cat_transport: 10, cat_bills: 10, cat_snacks: 7,
  cat_clothes: 6, cat_health: 5, cat_other: 5, cat_family: 5, cat_charity: 4,
};

export function defaultState() {
  return {
    version: DATA_VERSION,
    createdAt: new Date().toISOString(),
    settings: {
      name: '', onboarded: false, hideAmounts: false, pinHash: null,
      defaultAccountId: 'acc_usd', savingsTarget: 0, plannerStart: 0, lastBackupAt: null,
      // settledMonths: دخل الشهر وصل كله. monthSavings: ادخار مختلف لشهر معيّن. dismissed: تذكيرات انزاحت
      settledMonths: {}, monthSavings: {}, dismissed: {},
      // monthBudgets: ميزانية استثنائية لشهر واحد (بترجع الأصلية الشهر الجاي)
      // buffer: مبلغ بيضل آخر الشهر لأول أيام الشهر الجاي. closedMonths: شهور انتقل فائضها للأهداف
      monthBudgets: {}, buffer: 50, closedMonths: {},
    },
    rates: {
      TRY: { rate: null, mode: 'auto', at: null },
      SYP: { rate: null, mode: 'manual', at: null },
    },
    ratesFetchedAt: 0,
    accounts: [
      { id: 'acc_usd', name: 'كاش دولار', currency: 'USD', opening: 0 },
      { id: 'acc_try', name: 'كاش تركي', currency: 'TRY', opening: 0 },
      { id: 'acc_syp', name: 'كاش سوري', currency: 'SYP', opening: 0 },
    ],
    categories: DEFAULT_CATEGORIES.map((c) => ({ budget: 0, fixed: false, private: false, essential: ESSENTIAL_DEFAULTS.includes(c.id), ...c, aliases: [...c.aliases] })),
    incomeSources: [],
    transactions: [],
    // المخطِّط: أغراض بدك تشتريها (want) والتزامات لازم تندفع بشهر معيّن (commitment)
    planItems: [],
    goals: [],
    // اشتراكات وفواتير بتتكرر كل شهر بيوم معيّن
    recurring: [],
    // الديون: theyOwe = إلي عند حدا، iOwe = علي لحدا. الدفعات جوّا كل دين.
    debts: [],
    zakat: {
      basis: 'gold', goldGrams: 0, goldKarat: 24, silverGrams: 0, stocks: 0, other: 0,
      includeReceivables: true, deductPayables: true, lastDate: null,
    },
    // سعر غرام الذهب والفضة الصافي بالدولار
    metals: {
      gold: { perGram: null, mode: 'auto', at: null },
      silver: { perGram: null, mode: 'auto', at: null },
    },
  };
}

export function migrate(d) {
  const base = defaultState();
  if (!d || typeof d !== 'object') return base;
  const out = { ...base, ...d };
  out.settings = { ...base.settings, ...(d.settings || {}) };
  out.rates = { ...base.rates, ...(d.rates || {}) };
  for (const k of ['accounts', 'categories', 'incomeSources', 'transactions', 'planItems', 'goals', 'debts', 'recurring']) {
    if (!Array.isArray(out[k])) out[k] = base[k];
  }
  out.zakat = { ...base.zakat, ...(d.zakat || {}) };
  out.metals = { ...base.metals, ...(d.metals || {}) };

  // من الإصدار 1: الإيموجي صارت أيقونات، وكل فئة إلها لون
  out.categories = out.categories.map((c, i) => {
    const def = DEFAULTS_BY_ID.get(c.id);
    return {
      ...c,
      icon: iconKey(c.icon, def?.icon || (c.type === 'income' ? 'plusCircle' : 'tag')),
      tint: c.tint || def?.tint || TINT_KEYS[i % TINT_KEYS.length],
      private: Boolean(c.private),
    };
  });
  out.planItems = out.planItems.map((it) => ({ ...it, icon: iconKey(it.icon, it.kind === 'commitment' ? 'pin' : 'bag') }));
  out.goals = out.goals.map((g) => ({ ...g, icon: iconKey(g.icon, g.kind === 'emergency' ? 'shield' : 'target') }));
  if (!d.settings || d.settings.onboarded === undefined) {
    out.settings.onboarded = out.transactions.length > 0 || out.incomeSources.length > 0;
  }
  // من الإصدار 3: كلمات جديدة للإدخال بالصوت (أجار ماتور مواصلات مش إيجار)
  if ((d.version || 1) < 3) {
    for (const c of out.categories) {
      const def = DEFAULTS_BY_ID.get(c.id);
      if (!def) continue;
      const set = new Set([...(c.aliases || []), ...def.aliases]);
      if (c.id === 'cat_rent') { set.delete('اجار'); set.delete('آجار'); }
      c.aliases = [...set];
    }
  }
  // من الإصدار 3: فئة «سداد دين علي» (مرة وحدة، إذا انحذفت ما منرجّعها)
  if ((d.version || 1) < 3 && !out.categories.some((c) => c.id === 'cat_debtpay')) {
    const otherIdx = out.categories.findIndex((c) => c.id === 'cat_other');
    const cat = { ...DEFAULTS_BY_ID.get('cat_debtpay'), budget: 0, fixed: false, private: false, essential: true };
    cat.aliases = [...cat.aliases];
    if (otherIdx >= 0) out.categories.splice(otherIdx, 0, cat); else out.categories.push(cat);
  }
  // من الإصدار 4: الفئات الأساسية (بتنحجز أول)
  for (const c of out.categories) {
    if (c.essential === undefined) c.essential = c.type === 'expense' && (ESSENTIAL_DEFAULTS.includes(c.id) || Boolean(c.fixed));
  }
  out.recurring = out.recurring.map((r) => ({ ...r, paidMonths: Array.isArray(r.paidMonths) ? r.paidMonths : [] }));
  out.planItems = out.planItems.map((it) => ({ ...it, date: it.date || null, confirmed: Boolean(it.confirmed) }));
  out.goals = out.goals.map((g) => ({ ...g, useSurplus: g.useSurplus !== false, linkedDebtIds: Array.isArray(g.linkedDebtIds) ? g.linkedDebtIds : [] }));
  if (!Number.isFinite(Number(out.settings.buffer))) out.settings.buffer = 50;
  out.version = DATA_VERSION;
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { data: migrate(JSON.parse(raw)), fresh: false };
  } catch (e) {
    console.error('load failed', e);
  }
  return { data: defaultState(), fresh: true };
}

const initial = load();
let state = initial.data;
const subs = new Set();
let persistAsked = false;

let version = 0;
function save() {
  version += 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('save failed', e);
    window.dispatchEvent(new CustomEvent('store-error', { detail: e }));
  }
  if (!persistAsked && navigator.storage?.persist) {
    persistAsked = true;
    navigator.storage.persist().catch(() => {});
  }
}
function emit() { for (const fn of subs) fn(); }

save();

export const store = {
  get state() { return state; },
  // بيزيد مع كل تغيير (للحسابات المحفوظة)
  get version() { return version; },
  subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  update(mutator, { silent = false } = {}) {
    const r = mutator(state);
    save();
    if (!silent) emit();
    return r;
  },
  replaceAll(next) { state = migrate(next); save(); emit(); },
  reset() { state = defaultState(); save(); emit(); },
};

window.addEventListener('storage', (e) => {
  if (e.key === KEY) { state = load().data; version += 1; emit(); }
});

export function backupPayload() {
  return { app: 'mizaniyati', version: DATA_VERSION, exportedAt: new Date().toISOString(), data: state };
}
export function isBackup(p) {
  return Boolean(p && p.app === 'mizaniyati' && p.data && Array.isArray(p.data.transactions) && Array.isArray(p.data.accounts));
}

/* ---------- عرض الفئات (مع الفئات الخاصة) ---------- */
export function categoryById(id) {
  return state.categories.find((c) => c.id === id) || null;
}
// الفئة الخاصة بيختفي اسمها وأيقونتها بكل مكان، إلا بالتعديل واختيار الفئة
export function catLabel(c) {
  if (!c) return 'بدون فئة';
  return c.private ? 'خاص' : c.name;
}
export function catIcon(c) {
  if (!c) return 'tag';
  return c.private ? 'lock' : c.icon;
}
export function catTint(c) {
  if (!c) return 'slate';
  return c.private ? 'slate' : c.tint;
}
