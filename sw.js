// عامل الخدمة: بيخلّي التطبيق يشتغل بدون نت. غيّر CACHE مع كل إصدار جديد.
const CACHE = 'mizaniyati-2.0.0';
const FONT_CACHE = 'mizaniyati-fonts';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/backup.js',
  './js/calc.js',
  './js/components.js',
  './js/dates.js',
  './js/debts.js',
  './js/forms.js',
  './js/icons.js',
  './js/keypad.js',
  './js/money.js',
  './js/onboarding.js',
  './js/parse.js',
  './js/planner.js',
  './js/rates.js',
  './js/store.js',
  './js/ui.js',
  './js/zakat.js',
  './js/views/activity.js',
  './js/views/home.js',
  './js/views/money.js',
  './js/views/plan.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(caches.match('./index.html').then((r) => r || fetch(req)));
      return;
    }
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') c.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      }),
    );
  }
  // أسعار الصرف: من النت مباشرة، والتطبيق محتفظ بآخر سعر
});
