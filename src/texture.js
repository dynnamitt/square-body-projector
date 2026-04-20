import * as THREE from 'three';
import { sideRibbon } from './mesh.js';
import { buildStandaloneSvg, tightViewBox, rasterize } from './raster.js';

const PX_LONG = 1024;
const CAP_EPS = 0.01;

export function build(textures, specByName, vb, svgMeta, root, maxAniso, getGen) {
  if (!textures?.length) return;
  const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;
  for (const tex of textures) {
    const ref = specByName.get(tex.ref);
    if (!ref?.bounds) {
      console.error(`texture "${tex.name}" ref "${tex.ref}" is not a 3d_project layer; skipping`);
      continue;
    }
    if (ref.paths.length > 1) {
      console.warn(`texture "${tex.name}" ref "${tex.ref}" has ${ref.paths.length} paths; attaching to paths[0]`);
    }
    if (tex.side === 'near' || tex.side === 'far') {
      buildCap(tex, ref, cx, cy, vb, svgMeta, maxAniso, getGen, root);
    } else if (tex.side === 'left' || tex.side === 'right') {
      buildRibbon(tex, ref, cx, cy, vb, svgMeta, maxAniso, getGen, root);
    } else if (tex.side === 'top' || tex.side === 'bottom') {
      console.warn(`texture "${tex.name}" side "${tex.side}" not implemented yet; skipping`);
    } else {
      console.error(`texture "${tex.name}" side "${tex.side}" unknown; skipping`);
    }
  }
}

function buildRibbon(tex, ref, cx, cy, vb, svgMeta, maxAniso, getGen, root) {
  const points = ref.paths[0].points;
  const front = points.map(([x, y]) => new THREE.Vector3(x - cx, -(y - cy), ref.zFront));
  const back  = front.map(v => v.clone().setZ(ref.zBack));
  const range = sideRange(front, tex.side, tex.params);
  if (!range) { console.warn(`texture "${tex.name}" side "${tex.side}" not resolvable; skipping`); return; }

  const n = front.length;
  let halfPerim = 0;
  for (let i = range.iStart, prev = range.iStart; i !== range.iEnd; ) {
    prev = i; i = (i + 1) % n;
    halfPerim += front[i].distanceTo(front[prev]);
  }
  const depth = Math.abs(ref.zFront - ref.zBack);
  if (halfPerim <= 0 || depth <= 0) { console.warn(`texture "${tex.name}" degenerate face; skipping`); return; }

  const probe = buildStandaloneSvg(tex.subtree, vb, svgMeta?.defs);
  const tight = tightViewBox(probe);
  if (!tight) { console.warn(`texture "${tex.name}" has no measurable bbox; skipping`); return; }
  if (tight.w > halfPerim || tight.h > depth) {
    console.warn(`texture "${tex.name}" content (${tight.w.toFixed(1)}×${tight.h.toFixed(1)}) exceeds face (${halfPerim.toFixed(1)}×${depth.toFixed(1)}); clipping`);
  }

  const K = PX_LONG / Math.max(halfPerim, depth);
  const canvasW = Math.max(2, Math.round(halfPerim * K));
  const canvasH = Math.max(2, Math.round(depth * K));
  const contentW = Math.min(canvasW, Math.round(tight.w * K));
  const contentH = Math.min(canvasH, Math.round(tight.h * K));
  if (contentW < 2 || contentH < 2) { console.warn(`texture "${tex.name}" content too small to rasterize; skipping`); return; }

  const tightSvg = buildStandaloneSvg(tex.subtree, tight, svgMeta?.defs);
  const gen = getGen();
  rasterize(tightSvg, canvasW, canvasH, contentW, contentH, maxAniso).then(canvasTex => {
    if (getGen() !== gen) { canvasTex.dispose(); return; }
    canvasTex.center.set(0.5, 0.5);
    canvasTex.rotation = Math.PI / 2;
    const mat = new THREE.MeshStandardMaterial({
      map: canvasTex, transparent: true, side: THREE.DoubleSide,
      metalness: 0.1, roughness: 0.7,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const mesh = sideRibbon(front, back, range.iStart, range.iEnd, mat);
    mesh.userData.layerIndex = ref.layerIndex;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
  }).catch(e => console.error(`texture "${tex.name}" rasterize failed:`, e));
}

function buildCap(tex, ref, cx, cy, vb, svgMeta, maxAniso, getGen, root) {
  const probe = buildStandaloneSvg(tex.subtree, vb, svgMeta?.defs);
  const tight = tightViewBox(probe);
  if (!tight) { console.warn(`texture "${tex.name}" has no measurable bbox; skipping`); return; }
  const K = PX_LONG / Math.max(tight.w, tight.h);
  const W = Math.max(2, Math.round(tight.w * K));
  const H = Math.max(2, Math.round(tight.h * K));
  if (W < 2 || H < 2) { console.warn(`texture "${tex.name}" content too small to rasterize; skipping`); return; }

  const tightSvg = buildStandaloneSvg(tex.subtree, tight, svgMeta?.defs);
  const gen = getGen();
  rasterize(tightSvg, W, H, W, H, maxAniso).then(canvasTex => {
    if (getGen() !== gen) { canvasTex.dispose(); return; }
    const mat = new THREE.MeshStandardMaterial({
      map: canvasTex, transparent: true, side: THREE.FrontSide,
      metalness: 0.1, roughness: 0.7,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(tight.w, tight.h), mat);
    const tcx = tight.x + tight.w / 2;
    const tcy = tight.y + tight.h / 2;
    const z = tex.side === 'near' ? ref.zFront + CAP_EPS : ref.zBack - CAP_EPS;
    mesh.position.set(tcx - cx, -(tcy - cy), z);
    if (tex.side === 'far') mesh.rotation.y = Math.PI;
    mesh.userData.layerIndex = ref.layerIndex;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
  }).catch(e => console.error(`texture "${tex.name}" rasterize failed:`, e));
}

export function sideRange(pts, side, params) {
  const algo = params?.detect ?? 'band';
  if (algo === 'first')  return sideRangeFirst(pts, side);
  if (algo === 'corner') { console.warn(`detect: corner not implemented; falling back to band`); return sideRangeBand(pts, side, 0.02); }
  return sideRangeBand(pts, side, params?.tol ?? 0.02);
}

// Longest contiguous run of points within a tolerance band of the target
// x-extremum. Circular: handles wrap through index 0.
function sideRangeBand(pts, side, tol) {
  const n = pts.length;
  if (n < 4) return null;
  let minX = pts[0].x, maxX = pts[0].x;
  for (let i = 1; i < n; i++) { if (pts[i].x < minX) minX = pts[i].x; if (pts[i].x > maxX) maxX = pts[i].x; }
  const span = maxX - minX;
  if (span <= 0) return null;
  const thresh = side === 'left' ? minX + span * tol : maxX - span * tol;
  const inBand = pts.map(p => side === 'left' ? p.x <= thresh : p.x >= thresh);
  let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
  for (let i = 0; i < 2 * n; i++) {
    const k = i % n;
    if (inBand[k]) {
      if (curLen === 0) curStart = k;
      curLen++;
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
      if (curLen >= n) return null;
    } else {
      curLen = 0;
    }
  }
  if (bestLen === 0) return null;
  return { iStart: bestStart, iEnd: (bestStart + bestLen - 1) % n };
}

// Iteration-1 behavior: split at y-extrema; arc containing argmin(x) is LEFT.
// Kept as `detect: first` for debugging / back-compat.
function sideRangeFirst(pts, side) {
  const n = pts.length;
  if (n < 4) return null;
  let iTop = 0, iBot = 0, iXMin = 0;
  for (let i = 1; i < n; i++) {
    if (pts[i].y < pts[iTop].y) iTop = i;
    if (pts[i].y > pts[iBot].y) iBot = i;
    if (pts[i].x < pts[iXMin].x) iXMin = i;
  }
  if (iTop === iBot) return null;
  const arcA = walk(iTop, iBot, n);
  const arcB = walk(iBot, iTop, n);
  const aHasXMin = iXMin !== iTop && iXMin !== iBot && arcA.includes(iXMin);
  let leftArc, rightArc;
  if (aHasXMin) { leftArc = arcA; rightArc = arcB; }
  else if (iXMin !== iTop && iXMin !== iBot) { leftArc = arcB; rightArc = arcA; }
  else { leftArc = arcA.length <= arcB.length ? arcA : arcB; rightArc = leftArc === arcA ? arcB : arcA; }
  const chosen = side === 'left' ? leftArc : rightArc;
  return { iStart: chosen[0], iEnd: chosen[chosen.length - 1] };
}

function walk(iStart, iEnd, n) {
  const out = [iStart];
  for (let i = iStart; i !== iEnd; ) { i = (i + 1) % n; out.push(i); }
  return out;
}
