import { parseSvg, samplePath, maxXSpan } from './svg.js';
import { setupStage } from './stage.js';

const SAMPLES    = 256;
const WIDTH_FRAC = 0.25;

const picker  = document.getElementById('pick');
const bgSel   = document.getElementById('bg');
const zStepIn = document.getElementById('zstep');
const stage   = setupStage(document.getElementById('cv'), () => Number(zStepIn.value) || 0);

picker .addEventListener('change', e => load(e.target.value).catch(fail));
bgSel  .addEventListener('change', e => applyBg(e.target.value));
zStepIn.addEventListener('input',  () => stage.setZStep());
applyBg(bgSel.value);
load(picker.value).catch(fail);

function applyBg(c) {
  document.body.style.background = c;
  stage.setBg(c);
}

async function load(url) {
  document.getElementById('svg').src = url;
  const xml = await fetch(url).then(r => r.text());
  const { layers, viewBox, decor } = parseSvg(xml);
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
    specs.push({ paths: l.paths, zFront: 0, zBack: -w, stepFactor: tier });
    let zMin = -w;
    if (l.params.nearAndFar && i > 0) {
      const refFar = farMost[i - 1];
      specs.push({ paths: l.paths, zFront: refFar, zBack: refFar + w, stepFactor: -tier });
      zMin = Math.min(zMin, refFar);
    }
    farMost.push(zMin);
  }
  stage.show(specs, viewBox, decor, sampled.map(l => l.name), groundY);
}

function fail(e) {
  console.error(e);
  const box = document.getElementById('err');
  box.textContent = String(e.stack || e);
  box.style.display = 'block';
}
