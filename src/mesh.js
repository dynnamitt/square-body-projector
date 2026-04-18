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
