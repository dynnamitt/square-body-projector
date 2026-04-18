import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { parseSvg, samplePath, maxXSpan, inExtrude } from './svg.js';

const SAMPLES    = 256;
const WIDTH_FRAC = 0.25;
const Y_STEP     = 0.1;
const YAW_DEG    = 22;
const PITCH_DEG  = 15;

const stage  = setupStage();
const picker = document.getElementById('pick');
const bgSel  = document.getElementById('bg');
picker.addEventListener('change', e => load(e.target.value).catch(fail));
bgSel .addEventListener('change', e => applyBg(e.target.value));
applyBg(bgSel.value);
load(picker.value).catch(fail);

function applyBg(c) {
  document.body.style.background = c;
  stage.setBg(c);
}

async function load(url) {
  document.getElementById('svg').src = url;
  const xml = await fetch(url).then(r => r.text());
  const { layer, viewBox, extrudePaths, decor } = parseSvg(xml);
  if (!extrudePaths.length) throw new Error(`no <g inkscape:label="${layer}"> in ${url}`);
  const paths = extrudePaths.map(p => ({
    points: samplePath(p.d, SAMPLES),
    fill:   p.fill,
  }));
  const width = WIDTH_FRAC * maxXSpan(paths.map(p => p.points));
  stage.show(paths, width, viewBox, decor, layer);
}

function setupStage() {
  const cv       = document.getElementById('cv');
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(devicePixelRatio);

  const cam = new THREE.PerspectiveCamera(45, 1, 1, 5000);
  const resize = () => {
    renderer.setSize(cv.clientWidth, cv.clientHeight, false);
    cam.aspect = cv.clientWidth / cv.clientHeight;
    cam.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  const controls = new OrbitControls(cam, cv);
  controls.enableDamping = true;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(1, 1, 2);
  scene.add(key);

  const root = new THREE.Group();
  scene.add(root);

  (function tick() {
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, cam);
  })();

  return {
    show(paths, width, vb, decorData, layer) {
      disposeGroup(root);
      const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;

      for (const { points, fill } of paths) {
        const front = points.map(([x, y]) => new THREE.Vector3(x - cx, -(y - cy), 0));
        const back  = front.map(v => v.clone().setZ(-width));
        const color = fill ?? 0xffea06;
        root.add(ribbon(front, back, color));
        root.add(loop(front, color));
        root.add(loop(back,  color));
        if (fill) {
          root.add(cap(front, color));
          root.add(cap(back,  color));
        }
      }

      root.add(buildDecor(decorData, cx, cy, layer));

      const R       = Math.hypot(vb.w / 2, vb.h / 2, width / 2);
      const fovRad  = cam.fov * Math.PI / 180;
      const minDist = R / Math.tan(fovRad / 2) / Math.min(1, cam.aspect);
      const dist    = minDist * 1.2;
      const yaw     = YAW_DEG   * Math.PI / 180;
      const pitch   = PITCH_DEG * Math.PI / 180;
      const tz      = -width / 2;
      cam.position.set(
        dist * Math.sin(yaw) * Math.cos(pitch),
        dist * Math.sin(pitch),
        tz + dist * Math.cos(yaw) * Math.cos(pitch),
      );
      controls.target.set(0, 0, tz);
      controls.update();
    },
    setBg(color) { scene.background = new THREE.Color(color); },
  };
}

function buildDecor(data, cx, cy, layer) {
  const group = new THREE.Group();
  group.position.set(-cx, cy, 0);
  group.scale.set(1, -1, 1);
  let i = 0;
  for (const p of data.paths) {
    if (inExtrude(p.userData?.node, layer)) continue;
    for (const shape of SVGLoader.createShapes(p)) {
      const geo = new THREE.ShapeGeometry(shape);
      const mat = new THREE.MeshBasicMaterial({
        color: p.color ?? 0xffffff,
        side: THREE.DoubleSide,
        transparent: (p.userData?.style?.fillOpacity ?? 1) < 1,
        opacity: p.userData?.style?.fillOpacity ?? 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = -i * Y_STEP;
      group.add(mesh);
    }
    i++;
  }
  return group;
}

function ribbon(a, b, color) {
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

function cap(pts3, color) {
  const shape = new THREE.Shape(pts3.map(v => new THREE.Vector2(v.x, v.y)));
  const geo = new THREE.ShapeGeometry(shape);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color, side: THREE.DoubleSide, metalness: 0.1, roughness: 0.7,
  }));
  mesh.position.z = pts3[0].z;
  return mesh;
}

function loop(pts, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
}

function disposeGroup(g) {
  g.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  while (g.children.length) g.remove(g.children[0]);
}

function fail(e) {
  console.error(e);
  const box = document.getElementById('err');
  box.textContent = String(e.stack || e);
  box.style.display = 'block';
}
