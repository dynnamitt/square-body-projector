import { parseSvg, samplePath, maxXSpan } from './svg.js';
import { setupStage } from './stage.js';

const SAMPLES       = 256;
const WIDTH_FRAC    = 0.25;
const DEFAULT_COLOR = '#ffea06';
const PRESETS = [
  ['#1e88e5', 'blue'],
  ['#e53935', 'red'],
  ['#43a047', 'green'],
  ['#fb8c00', 'orange'],
  ['#8e24aa', 'purple'],
  ['#ffea06', 'yellow'],
  ['#ffffff', 'white'],
];

const picker   = document.getElementById('pick');
const colorSel = document.getElementById('color');
const zStepIn  = document.getElementById('zstep');
const stage    = setupStage(document.getElementById('cv'), () => Number(zStepIn.value) || 0);

picker  .addEventListener('change', e => load(e.target.value).catch(fail));
colorSel.addEventListener('change', () => applyColor(colorSel.value));
zStepIn .addEventListener('input',  () => stage.setZStep());
applyColor(DEFAULT_COLOR);
load(picker.value).catch(fail);

function applyBg(c) {
  document.body.style.background = c;
  stage.setBg(c);
}

function applyColor(hex) {
  stage.setLayerColor(0, hex);
  applyBg(complement(hex));
}

async function load(url) {
  const errBox = document.getElementById('err');
  errBox.textContent = '';
  errBox.style.display = 'none';
  document.getElementById('svg').src = url;
  const xml = await fetch(url).then(r => r.text());
  const { layers, textures, viewBox, rootAttrs, defs, decor } = parseSvg(xml);
  const sampled = layers.map(l => ({
    name:   l.name,
    params: l.params,
    paths:  l.paths.map(p => ({ points: samplePath(p.d, SAMPLES), fill: p.fill })),
  }));
  if (!sampled.some(l => l.paths.length)) {
    throw new Error(`no extrude layers with paths in ${url} (declared: ${layers.map(l => l.name).join(', ')})`);
  }
  const allPoints = sampled.flatMap(l => l.paths.map(p => p.points));
  const S = maxXSpan(allPoints);
  const cy = viewBox.y + viewBox.h / 2;
  const yMaxSvg = allPoints.reduce((m, poly) => Math.max(m, ...poly.map(([, y]) => y)), -Infinity);
  const groundY = cy - yMaxSvg;
  const specs = [];
  const farMost = [];
  for (let i = 0; i < sampled.length; i++) {
    const l = sampled[i];
    const w = (l.params.w ?? WIDTH_FRAC) * S;
    const tier = i + (l.params.zStepAdd ?? 0);
    const bounds = pathBounds(l.paths);
    specs.push({ name: l.name, bounds, paths: l.paths, zFront: 0, zBack: -w, stepFactor: tier, layerIndex: i });
    let zMin = -w;
    if (l.params.nearAndFar && i > 0) {
      const refFar = farMost[i - 1];
      specs.push({ name: l.name, bounds, paths: l.paths, zFront: refFar, zBack: refFar + w, stepFactor: -tier, layerIndex: i });
      zMin = Math.min(zMin, refFar);
    }
    farMost.push(zMin);
  }
  const textureNames = textures.map(t => t.name);
  stage.show(specs, viewBox, decor, sampled.map(l => l.name), textures, textureNames, { rootAttrs, defs }, groundY);
  populateColors(uniqueFill(sampled[0]?.paths ?? []));
  applyColor(colorSel.value);
}

function pathBounds(paths) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { points } of paths) {
    for (const [x, y] of points) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY };
}

function uniqueFill(paths) {
  const fills = new Set(paths.map(p => p.fill).filter(Boolean).map(s => s.toLowerCase()));
  return fills.size === 1 ? [...fills][0] : null;
}

function populateColors(original) {
  const first = original ?? DEFAULT_COLOR;
  const seen = new Set([first.toLowerCase()]);
  const opts = [`<option value="${first}">original (${first})</option>`];
  for (const [hex, label] of PRESETS) {
    if (seen.has(hex.toLowerCase())) continue;
    seen.add(hex.toLowerCase());
    opts.push(`<option value="${hex}">${label}</option>`);
  }
  colorSel.innerHTML = opts.join('');
  colorSel.value = first;
}

function complement(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d === 0 ? 0 : (l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn));
  let H = 0;
  if (d !== 0) {
    H = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    H /= 6;
  }
  const H2 = (H + 0.5) % 1;
  const f = (k) => {
    const t = (k + H2 * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1))));
  };
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}

function fail(e) {
  console.error(e);
  const box = document.getElementById('err');
  box.textContent = String(e.stack || e);
  box.style.display = 'block';
}
