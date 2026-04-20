import { XMLParser } from 'fast-xml-parser';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

export const EXTRUDE = 'EXTRUDE';

const PRAGMA_RE  = /<!--\s*3d_project\s+layerName\s*:\s*([^>]+?)\s*-->/g;
const TEXTURE_RE = /<!--\s*texture\s+layerName\s*:\s*([^>]+?)\s*-->/g;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributesGroupName: '$',
  attributeNamePrefix: '',
});
const svgLoader = new SVGLoader();

export function parseSvg(xml) {
  const doc = parser.parse(xml);
  const root = doc.svg;
  const specs = parsePragmas(xml);
  const layers = specs.map(({ name, params }) => ({
    name,
    params,
    paths: layerPaths(root, name),
  }));
  const textures = parseTexturePragmas(xml)
    .map(({ name, params }) => {
      if (!params.ref || !params.side) {
        console.warn(`texture "${name}" missing ref/side; skipping`);
        return null;
      }
      const subtree = findLayerGroup(root, name);
      if (!subtree) {
        console.warn(`texture layer "${name}" not found; skipping`);
        return null;
      }
      return { name, ref: params.ref, side: params.side, params, subtree };
    })
    .filter(Boolean);
  return {
    layers,
    textures,
    viewBox: parseViewBox(root?.$?.viewBox ?? '0 0 512 512'),
    rootAttrs: root?.$ ?? {},
    defs: root?.defs ?? null,
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

export function inExtrude(node, names) {
  const set = Array.isArray(names) ? names : [names];
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) {
    const label = n.getAttribute?.('inkscape:label');
    if (label && set.includes(label)) return true;
  }
  return false;
}

function parsePragmas(xml) {
  const out = [];
  for (const m of xml.matchAll(PRAGMA_RE)) {
    const [head, ...rest] = m[1].split(',').map(s => s.trim());
    if (!head) continue;
    out.push({ name: head, params: parseParams(rest) });
  }
  return out.length ? out : [{ name: EXTRUDE, params: {} }];
}

function parseTexturePragmas(xml) {
  const out = [];
  for (const m of xml.matchAll(TEXTURE_RE)) {
    const [head, ...rest] = m[1].split(',').map(s => s.trim());
    if (!head) continue;
    out.push({ name: head, params: parseParams(rest) });
  }
  return out;
}

function findLayerGroup(root, label) {
  let found = null;
  (function walk(n) {
    if (found || !n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) {
      if (k === '$') continue;
      for (const c of Array.isArray(v) ? v : [v]) {
        if (found) return;
        if (k === 'g' && c?.$?.['inkscape:label'] === label) { found = c; return; }
        walk(c);
      }
    }
  })(root);
  return found;
}

function parseParams(parts) {
  const params = {};
  for (const part of parts) {
    const m = /^([^=:\s]+)\s*[=:]\s*(.+)$/.exec(part);
    if (!m) continue;
    params[m[1]] = coerce(m[2].trim());
  }
  return params;
}

function coerce(v) {
  if (v === 'on' || v === 'true')  return true;
  if (v === 'off' || v === 'false') return false;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

function parseViewBox(s) {
  const [x, y, w, h] = s.trim().split(/[\s,]+/).map(Number);
  return { x, y, w, h };
}

function layerPaths(root, label) {
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
        else if (k === 'circle' && c?.$) out.push({ d: circleToPath(c.$), fill: parseFill(c.$) });
        else collect(c);
      }
    }
  }
}

function circleToPath(a) {
  const cx = +a.cx, cy = +a.cy, r = +a.r;
  return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
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
