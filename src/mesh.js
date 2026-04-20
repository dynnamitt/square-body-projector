import * as THREE from 'three';

export function ribbon(a, b, color) {
  const n = a.length;
  const pos = new Float32Array(n * 2 * 3);
  const idx = [];
  for (let i = 0; i < n; i++) {
    pos.set([a[i].x, a[i].y, a[i].z], i * 3);
    pos.set([b[i].x, b[i].y, b[i].z], (n + i) * 3);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, n + i, j, j, n + i, n + j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color, side: THREE.DoubleSide, flatShading: true, metalness: 0.1, roughness: 0.7,
  }));
}

export function cap(pts3, color) {
  const shape = new THREE.Shape(pts3.map(v => new THREE.Vector2(v.x, v.y)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.translate(0, 0, pts3[0].z);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color, side: THREE.DoubleSide, metalness: 0.1, roughness: 0.7,
  }));
}

export function loop(pts, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
}

export function disposeGroup(g) {
  g.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  while (g.children.length) g.remove(g.children[0]);
}

// Open sub-ribbon over the index range [iStart..iEnd] (inclusive, walked
// forward with wrap). Writes a `uv` attribute: u = cumulative arc-length along
// the front rail / total, v = 0 on front rail / 1 on back rail.
export function sideRibbon(front, back, iStart, iEnd, material) {
  const n = front.length;
  const idxs = [iStart];
  for (let i = iStart; i !== iEnd; ) { i = (i + 1) % n; idxs.push(i); }
  const m = idxs.length;
  const pos = new Float32Array(m * 2 * 3);
  const uv  = new Float32Array(m * 2 * 2);
  const L = new Float32Array(m);
  for (let k = 1; k < m; k++) L[k] = L[k - 1] + front[idxs[k]].distanceTo(front[idxs[k - 1]]);
  const total = L[m - 1] || 1;
  for (let k = 0; k < m; k++) {
    const f = front[idxs[k]], b = back[idxs[k]];
    pos.set([f.x, f.y, f.z], k * 3);
    pos.set([b.x, b.y, b.z], (m + k) * 3);
    const u = L[k] / total;
    uv.set([u, 0], k * 2);
    uv.set([u, 1], (m + k) * 2);
  }
  const idx = [];
  for (let k = 0; k < m - 1; k++) idx.push(k, m + k, k + 1, k + 1, m + k, m + k + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv',       new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}
