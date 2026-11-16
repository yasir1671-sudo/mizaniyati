// حفظ البيانات على الجهاز (localStorage) وإدارة الحالة
export const APP_VERSION = '1.2.0';
export const DATA_VERSION = 1;
const KEY = 'mizaniyati:data';

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// الكلمات (aliases) بتساعد الإدخال السريع يعرف الفئة: «50 أكل»
const DEFAULT_CATEGORIES = [
  { id: 'cat_food', type: 'expense', name: 'أكل ومطاعم', icon: '🍽️', aliases: ['أكل', 'طعام', 'غدا', 'غداء', 'عشا', 'عشاء', 'فطور', 'ترويقة', 'مطعم', 'مطاعم', 'شاورما', 'فلافل', 'بيتزا', 'سندويش', 'وجبة'] },
  { id: 'cat_snacks', type: 'expense', name: 'سناكات وقهوة', icon: '☕', aliases: ['سناك', 'سناكات', 'قهوة', 'شاي', 'حلو', 'حلويات', 'بسكوت', 'عصير', 'بوظة', 'شيبس', 'كولا', 'متة'] },
  { id: 'cat_grocery', type: 'expense', name: 'بقالة وخضرة', icon: '🛒', aliases: ['بقالة', 'خضرة', 'خضار', 'فواكه', 'سوبرماركت', 'ماركت', 'خبز', 'لحمة', 'جاج', 'دجاج', 'رز', 'زيت', 'سكر'] },
  { id: 'cat_transport', type: 'expense', name: 'مواصلات', icon: '🚕', aliases: ['مواصلات', 'تكسي', 'تاكسي', 'سرفيس', 'باص', 'بنزين', 'مازوت', 'أجرة', 'اوبر', 'مترو', 'سيارة'] },
  { id: 'cat_bills', type: 'expense', name: 'فواتير واشتراكات', icon: '🧾', fixed: true, aliases: ['فاتورة', 'فواتير', 'كهربا', 'كهرباء', 'مياه', 'نت', 'انترنت', 'رصيد', 'اشتراك', 'موبايل', 'باقة', 'غاز', 'امبير'] },
  { id: 'cat_rent', type: 'expense', name: 'سكن وإيجار', icon: '🏠', fixed: true, aliases: ['إيجار', 'اجار', 'آجار', 'سكن'] },
  { id: 'cat_health', type: 'expense', name: 'صحة ودواء', icon: '💊', aliases: ['دوا', 'دواء', 'صيدلية', 'دكتور', 'طبيب', 'مشفى', 'تحاليل', 'عيادة'] },
  { id: 'cat_clothes', type: 'expense', name: 'لبس', icon: '👕', aliases: ['لبس', 'تياب', 'ثياب', 'قميص', 'بنطلون', 'حذاء', 'صباط', 'جاكيت', 'كنزة'] },
  { id: 'cat_family', type: 'expense', name: 'عائلة وهدايا', icon: '🎁', aliases: ['هدية', 'هدايا', 'عائلة', 'أهل', 'عيدية'] },
  { id: 'cat_charity', type: 'expense', name: 'صدقة وزكاة', icon: '🤲', aliases: ['صدقة', 'زكاة', 'تبرع', 'كفالة'] },
  { id: 'cat_other', type: 'expense', name: 'أخرى', icon: '📦', aliases: [] },
  { id: 'inc_salary', type: 'income', name: 'راتب', icon: '💼', aliases: ['راتب', 'معاش'] },
  { id: 'inc_stocks', type: 'income', name: 'أسهم وأرباح', icon: '📈', aliases: ['أسهم', 'سهم', 'أرباح', 'توزيعات'] },
  { id: 'inc_extra', type: 'income', name: 'دخل إضافي', icon: '🧰', aliases: ['شغل', 'مشروع', 'إضافي', 'فريلانس'] },
  { id: 'inc_debt', type: 'income', name: 'سداد دين إلي', icon: '🤝', aliases: ['سداد', 'دين', 'رجعلي'] },
  { id: 'inc_other', type: 'income', name: 'دخل آخر', icon: '➕', aliases: [] },
];

export const PROTECTED_CATEGORIES = ['cat_other', 'inc_other'];

export function defaultState() {
  return {
    version: DATA_VERSION,
    createdAt: new Date().toISOString(),
    settings: { theme: 'auto', defaultAccountId: 'acc_usd', savingsTarget: 0, plannerStart: 0, lastBackupAt: null },
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
    categories: DEFAULT_CATEGORIES.map((c) => ({ budget: 0, fixed: false, ...c, aliases: [...c.aliases] })),
    incomeSources: [],
    transactions: [],
    // المخطِّط: أغراض بدك تشتريها (want) والتزامات لازم تندفع بشهر معيّن (commitment)
    planItems: [],
    goals: [],
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
  for (const k of ['accounts', 'categories', 'incomeSources', 'transactions', 'planItems', 'goals', 'debts']) {
    if (!Array.isArray(out[k])) out[k] = base[k];
  }
  out.zakat = { ...base.zakat, ...(d.zakat || {}) };
  out.metals = { ...base.metals, ...(d.metals || {}) };
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

function save() {
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

if (initial.fresh) save();

export const store = {
  get state() { return state; },
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
  if (e.key === KEY) { state = load().data; emit(); }
});

export function backupPayload() {
  return { app: 'mizaniyati', version: DATA_VERSION, exportedAt: new Date().toISOString(), data: state };
}
export function isBackup(p) {
  return Boolean(p && p.app === 'mizaniyati' && p.data && Array.isArray(p.data.transactions) && Array.isArray(p.data.accounts));
}
