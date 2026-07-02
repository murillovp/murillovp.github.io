const BASE = 'assets/negative/';
const FALLBACK = 'assets/skull.svg';

// Explicit file map — note `left-center.svg` and `right-center.svg` lack the `_1` suffix.
const VARIANTS = [
  { dir: 'top-left',      file: 'top-left_1.svg' },
  { dir: 'top-center',    file: 'top-center_1.svg' },
  { dir: 'top-right',     file: 'top-right_1.svg' },
  { dir: 'left-center',   file: 'left-center.svg' },
  { dir: 'center-center', file: 'center-center_1.svg' },
  { dir: 'right-center',  file: 'right-center.svg' },
  { dir: 'bottom-left',   file: 'bottom-left_1.svg' },
  { dir: 'bottom-center', file: 'bottom-center_1.svg' },
  { dir: 'bottom-right',  file: 'bottom-right_1.svg' },
];

// Octant index (0..7) → direction. 0° = right, ccw positive.
const OCTANTS = [
  'right-center', 'top-right', 'top-center', 'top-left',
  'left-center', 'bottom-left', 'bottom-center', 'bottom-right',
];

export const NEG_SEQUENCE = [
  { dir: 'left-center',   hold: 560 },
  { dir: 'right-center',  hold: 560 },
  { dir: 'left-center',   hold: 560 },
  { dir: 'right-center',  hold: 560 },
  { dir: 'center-center', hold: 400 },
];

export const POS_SEQUENCE = [
  { dir: 'top-center',    hold: 680 },
  { dir: 'bottom-center', hold: 680 },
  { dir: 'top-center',    hold: 680 },
  { dir: 'bottom-center', hold: 520 },
  { dir: 'center-center', hold: 400 },
];

// Figure-eight loop for touch devices.
const ORBIT = [
  { dir: 'top-left',      hold: 900 },
  { dir: 'left-center',   hold: 900 },
  { dir: 'bottom-left',   hold: 900 },
  { dir: 'center-center', hold: 900 },   // crossing
  { dir: 'bottom-right',  hold: 900 },
  { dir: 'right-center',  hold: 900 },
  { dir: 'top-right',     hold: 900 },
  { dir: 'center-center', hold: 5000 },  // full cycle rest
];

let skull, inner;
let reduceMotion = false;
let noHover = false;
let activeEl = null;
let rect = null;
let mx = 0, my = 0;
let pending = false;
let baseMode = 'tracking';   // 'tracking' | 'orbit'
let skullMode = 'tracking';  // baseMode or 'sequence'
let orbitTimer = null;

async function loadVariant({ dir, file }) {
  const res = await fetch(BASE + file);
  if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
  const raw = await res.text();
  // Rewrite the single `fill: #fff` rule to `currentColor` so CSS controls the hue.
  const tinted = raw
    .replace(/^<\?xml[^>]*\?>\s*/, '')
    .replace(/fill:\s*#fff;?/gi, 'fill: currentColor;');
  const tmp = document.createElement('div');
  tmp.innerHTML = tinted;
  const svg = tmp.querySelector('svg');
  svg.setAttribute('data-dir', dir);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.removeAttribute('id');
  return svg;
}

function setGaze(dir) {
  const next = inner.querySelector(`[data-dir="${dir}"]`);
  if (!next || next === activeEl) return;
  if (activeEl) activeEl.classList.remove('is-active');
  next.classList.add('is-active');
  activeEl = next;
}

function measure() {
  rect = skull.getBoundingClientRect();
}

function tick() {
  pending = false;
  if (!rect || skullMode !== 'tracking') return;

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = mx - cx;
  const dy = my - cy;
  const dist = Math.hypot(dx, dy);
  const dead = rect.width * 0.55;  // cursor-on-skull → look at viewer

  let dir;
  if (dist < dead) {
    dir = 'center-center';
  } else {
    let angle = Math.atan2(-dy, dx) * 180 / Math.PI;  // 0 = right, 90 = up
    if (angle < 0) angle += 360;
    dir = OCTANTS[Math.floor(((angle + 22.5) % 360) / 45)];
  }
  setGaze(dir);

  // Parallax flourish — a few pixels toward the cursor, capped.
  const MAX = 6;
  const px = Math.max(-MAX, Math.min(MAX, dx / 60));
  const py = Math.max(-MAX, Math.min(MAX, dy / 60));
  skull.style.transform = `translate(${px}px, ${py}px)`;
}

function onMove(e) {
  mx = e.clientX;
  my = e.clientY;
  if (!pending) {
    pending = true;
    requestAnimationFrame(tick);
  }
}

function startOrbit() {
  stopOrbit();
  let i = 0;
  const step = () => {
    if (skullMode !== 'orbit') return;
    const { dir, hold } = ORBIT[i % ORBIT.length];
    setGaze(dir);
    i++;
    orbitTimer = setTimeout(step, hold);
  };
  step();
}

function stopOrbit() {
  if (orbitTimer) { clearTimeout(orbitTimer); orbitTimer = null; }
}

function resumeBase() {
  skullMode = baseMode;
  if (baseMode === 'orbit') startOrbit();
  else if (rect) tick();
}

export function playSequence(steps) {
  return new Promise(resolve => {
    if (reduceMotion) {
      setGaze('center-center');
      resolve();
      return;
    }
    stopOrbit();
    skullMode = 'sequence';
    let i = 0;
    const step = () => {
      if (i >= steps.length) {
        resumeBase();
        resolve();
        return;
      }
      const { dir, hold } = steps[i++];
      setGaze(dir);
      setTimeout(step, hold);
    };
    step();
  });
}

export async function initSkull() {
  skull = document.querySelector('.skull');
  inner = skull.querySelector('.skull-inner');
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  noHover = window.matchMedia('(hover: none)').matches;

  try {
    const svgs = await Promise.all(VARIANTS.map(loadVariant));
    svgs.forEach(svg => inner.appendChild(svg));
    setGaze('center-center');
    measure();
    if (reduceMotion) {
      // pinned to center-center; no listeners, no orbit
    } else if (noHover) {
      baseMode = 'orbit';
      skullMode = 'orbit';
      startOrbit();
    } else {
      window.addEventListener('mousemove', onMove, { passive: true });
      window.addEventListener('resize', measure);
    }
  } catch (err) {
    console.error('[skull] variant load failed — falling back to center-center only.', err);
    const fallback = document.createElement('img');
    fallback.src = FALLBACK;
    fallback.alt = '';
    fallback.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    inner.appendChild(fallback);
  }
}
