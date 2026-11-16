// التواريخ بأسماء الأشهر الشامية
export const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
export const SHORT_MONTHS = ['ك2', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'ت1', 'ت2', 'ك1'];
export const WEEKDAYS =['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const pad = (n) => String(n).padStart(2, '0');

export function iso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayISO() { return iso(new Date()); }
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}
export function currentMonth() { return todayISO().slice(0, 7); }
export function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function daysUntil(s) {
  return Math.round((parseISO(s) - parseISO(todayISO())) / 86400000);
}
// التاريخ الهجري (أم القرى) بأرقام عادية
export function hijriDate(s) {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(parseISO(s));
  } catch {
    return '';
  }
}
export function daysInMonth(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function monthLabel(key, { year = true } = {}) {
  const [y, m] = key.split('-').map(Number);
  return year ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
}
export function longDate(s) {
  const d = parseISO(s);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function dayLabel(s) {
  if (s === todayISO()) return 'اليوم';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (s === iso(y)) return 'أمس';
  const d = parseISO(s);
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

// العدد مع المعدود: [مفرد، مثنى، جمع 3-10، مفرد 11+]
export function countText(n, [one, two, few, many]) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}
export const daysText = (n) => countText(n, ['يوم واحد', 'يومين', 'أيام', 'يوم']);
export const monthsText = (n) => countText(n, ['شهر واحد', 'شهرين', 'شهور', 'شهر']);

// عدد الأشهر بين شهرين بصيغة YYYY-MM (b ناقص a)
export function monthsBetween(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
export const txCountText = (n) => countText(n, ['عملية وحدة', 'عمليتين', 'عمليات', 'عملية']);

export function relTime(ts) {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'من شوي';
  if (m < 60) return `قبل ${countText(m, ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'])}`;
  const hr = Math.round(m / 60);
  if (hr < 24) return `قبل ${countText(hr, ['ساعة', 'ساعتين', 'ساعات', 'ساعة'])}`;
  const dd = Math.round(hr / 24);
  if (dd < 30) return `قبل ${countText(dd, ['يوم', 'يومين', 'أيام', 'يوم'])}`;
  return dayLabel(iso(new Date(ts)));
}
