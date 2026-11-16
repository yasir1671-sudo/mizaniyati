// نقشة الورقة النقدية (guilloche). الجزء الملوّن = اللي باقي من مصروف اليوم.
import { svgEl } from './ui.js';

const SIZE = 300;
const C = SIZE / 2;
let ringsCache = null;

function curve(R, amp, k, phase, n = 360) {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = R + amp * Math.sin(k * t + phase);
    d += `${i ? 'L' : 'M'}${(C + r * Math.cos(t)).toFixed(1)} ${(C + r * Math.sin(t)).toFixed(1)}`;
  }
  return `${d}Z`;
}

function circle(R) {
  return `M${C - R} ${C}a${R} ${R} 0 1 0 ${R * 2} 0a${R} ${R} 0 1 0 ${-R * 2} 0Z`;
}

function rings() {
  if (ringsCache) return ringsCache;
  const out = [];
  for (let j = 0; j < 10; j++) out.push(curve(122, 17, 15, (j * Math.PI * 2) / 10));
  for (let j = 0; j < 6; j++) out.push(curve(101, 5, 30, (j * Math.PI * 2) / 6));
  out.push(circle(144), circle(93));
  ringsCache = out;
  return out;
}

function wedge(f) {
  const R = 160;
  if (f >= 0.9999) return `M${C - R} ${C - R}H${C + R}V${C + R}H${C - R}Z`;
  if (f <= 0.0001) return 'M0 0Z';
  const a0 = -Math.PI / 2;
  const a1 = a0 + f * Math.PI * 2;
  const x0 = C + R * Math.cos(a0);
  const y0 = C + R * Math.sin(a0);
  const x1 = C + R * Math.cos(a1);
  const y1 = C + R * Math.sin(a1);
  return `M${C} ${C}L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${f > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
}

let seq = 0;
export function rosette(fraction = 0, { animate = false } = {}) {
  const id = `ros${++seq}`;
  const g = svgEl('g', { id: `${id}-g`, fill: 'none' }, rings().map((d) => svgEl('path', { d })));
  const wp = svgEl('path', { d: wedge(animate ? 0 : fraction) });
  const svg = svgEl('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'rosette', 'aria-hidden': 'true' },
    svgEl('defs', {}, g, svgEl('clipPath', { id: `${id}-c` }, wp)),
    svgEl('use', { href: `#${id}-g`, class: 'r-faint' }),
    svgEl('use', { href: `#${id}-g`, class: 'r-live', 'clip-path': `url(#${id}-c)` }));

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (animate && fraction > 0 && !reduce) {
    const t0 = performance.now();
    const dur = 1100;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      wp.setAttribute('d', wedge(fraction * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  } else {
    wp.setAttribute('d', wedge(fraction));
  }
  return svg;
}
