// أسعار الصرف التلقائية (مصدرين مجانيين، الثاني احتياط)
import { store } from './store.js';

const SOURCES = [
  async (signal) => {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { signal, cache: 'no-store' });
    const j = await r.json();
    if (j.result !== 'success' || !j.rates) throw new Error('bad response');
    return j.rates;
  },
  async (signal) => {
    const r = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', { signal, cache: 'no-store' });
    const j = await r.json();
    const out = {};
    for (const [k, v] of Object.entries(j.usd || {})) out[k.toUpperCase()] = v;
    return out;
  },
];

const STALE_MS = 6 * 3600 * 1000;

export async function refreshRates({ force = false } = {}) {
  const st = store.state;
  const autos = Object.entries(st.rates).filter(([, r]) => r.mode === 'auto').map(([c]) => c);
  if (!autos.length) return { ok: true, updated: [] };
  const fresh = Date.now() - (st.ratesFetchedAt || 0) < STALE_MS && autos.every((c) => st.rates[c].rate);
  if (!force && fresh) return { ok: true, updated: [], skipped: true };
  if (!navigator.onLine) return { ok: false, reason: 'offline' };

  for (const source of SOURCES) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const rates = await source(ctl.signal);
      clearTimeout(timer);
      const updated = [];
      store.update((s) => {
        for (const c of autos) {
          let v = Number(rates[c]);
          if (!(v > 0)) continue;
          // الليرة السورية الجديدة = القديمة ÷ 100. إذا المصدر لسّا بالقديمة منقسم
          if (c === 'SYP' && v > 2000) v /= 100;
          s.rates[c] = { ...s.rates[c], rate: v, at: Date.now() };
          updated.push(c);
        }
        s.ratesFetchedAt = Date.now();
      });
      return { ok: true, updated };
    } catch {
      clearTimeout(timer);
    }
  }
  return { ok: false, reason: 'network' };
}
