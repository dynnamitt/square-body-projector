import { XMLParser } from 'fast-xml-parser';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

export const EXTRUDE = 'EXTRUDE';

const PRAGMA_RE = /<!--\s*3d_project\.layer_name\s*:\s*(\S+)\s*-->/;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributesGroupName: '$',
  attributeNamePrefix: '',
});
const svgLoader = new SVGLoader();

export function parseSvg(xml) {
  const doc = parser.parse(xml);
  const root = doc.svg;
  const layer = PRAGMA_RE.exec(xml)?.[1] ?? EXTRUDE;
  return {
    layer,
    viewBox: parseViewBox(root?.$?.viewBox ?? '0 0 512 512'),
    extrudePaths: extrudePaths(root, layer),
    decor: svgLoader.parse(xml),
  };
}

export function samplePath(d, n) {
  const NS   = 'http://www.w3.org/2000/svg';
  const svg  = document.createElementNS(NS, 'svg');
  const path = document.createElementNS(NS, 'path');
  svg.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
  path.setAttribute('d', d);
  svg.appendChild(path);
  document.body.appendChild(svg);
  const len = path.getTotalLength();
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p = path.getPointAtLength((i / n) * len);
    pts.push([p.x, p.y]);
  }
  svg.remove();
  return pts;
}

export function maxXSpan(polys) {
  let max = 0;
  for (const poly of polys) {
    let lo = Infinity, hi = -Infinity;
    for (const [x] of poly) { if (x < lo) lo = x; if (x > hi) hi = x; }
    max = Math.max(max, hi - lo);
  }
  return max;
}

export function inExtrude(node, label) {
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) {
    if (n.getAttribute?.('inkscape:label') === label) return true;
  }
  return false;
}

function parseViewBox(s) {
  const [x, y, w, h] = s.trim().split(/[\s,]+/).map(Number);
  return { x, y, w, h };
}

function extrudePaths(root, label) {
  const out = [];
  walk(root);
  return out;
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) {
      if (k === '$') continue;
      for (const c of Array.isArray(v) ? v : [v]) {
        if (k === 'g' && c?.$?.['inkscape:label'] === label) collect(c);
        else walk(c);
      }
    }
  }
  function collect(g) {
    if (!g || typeof g !== 'object') return;
    for (const [k, v] of Object.entries(g)) {
      if (k === '$') continue;
      for (const c of Array.isArray(v) ? v : [v]) {
        if (k === 'path' && c?.$?.d) out.push({ d: c.$.d, fill: parseFill(c.$) });
        else collect(c);
      }
    }
  }
}

function parseFill(attrs) {
  if (!attrs) return null;
  const direct = attrs.fill;
  if (direct) return normFill(direct);
  const style = attrs.style;
  if (!style) return null;
  const m = /(?:^|;)\s*fill\s*:\s*([^;]+)/i.exec(style);
  return m ? normFill(m[1].trim()) : null;
}

function normFill(v) {
  if (!v || v === 'none' || v === 'transparent' || v === 'currentColor') return null;
  return v;
}
