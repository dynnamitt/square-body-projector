import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { parseSvg, samplePath, maxXSpan, inExtrude } from './svg.js';
import { ribbon, cap, loop, disposeGroup } from './mesh.js';

const SAMPLES    = 256;
const WIDTH_FRAC = 0.25;
const YAW_DEG    = 22;
const PITCH_DEG  = 15;

const stage   = setupStage();
const picker  = document.getElementById('pick');
const bgSel   = document.getElementById('bg');
const zStepIn = document.getElementById('zstep');
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
  const S = maxXSpan(sampled.flatMap(l => l.paths.map(p => p.points)));
  const specs = [];
  const farMost = [];
  for (let i = 0; i < sampled.length; i++) {
    const l = sampled[i];
    const w = (l.params.w ?? WIDTH_FRAC) * S;
    specs.push({ paths: l.paths, zFront: 0, zBack: -w });
    let zMin = -w;
    if (l.params.nearAndFar && i > 0) {
      const refFar = farMost[i - 1];
      specs.push({ paths: l.paths, zFront: refFar, zBack: refFar - w });
      zMin = Math.min(zMin, refFar - w);
    }
    farMost.push(zMin);
  }
  stage.show(specs, viewBox, decor, sampled.map(l => l.name));
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
  let decorGroup = null;

  (function tick() {
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, cam);
  })();

  return {
    show(specs, vb, decorData, extrudeNames) {
      disposeGroup(root);
      const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;

      let zMax = 0, zMin = 0;
      for (const { paths, zFront, zBack } of specs) {
        zMax = Math.max(zMax, zFront);
        zMin = Math.min(zMin, zBack);
        for (const { points, fill } of paths) {
          const front = points.map(([x, y]) => new THREE.Vector3(x - cx, -(y - cy), zFront));
          const back  = front.map(v => v.clone().setZ(zBack));
          const color = fill ?? 0xffea06;
          root.add(ribbon(front, back, color));
          root.add(loop(front, color));
          root.add(loop(back,  color));
          if (fill) {
            root.add(cap(front, color));
            root.add(cap(back,  color));
          }
        }
      }

      decorGroup = buildDecor(decorData, cx, cy, extrudeNames);
      applyZStep();
      root.add(decorGroup);

      const depth   = zMax - zMin;
      const R       = Math.hypot(vb.w / 2, vb.h / 2, depth / 2);
      const fovRad  = cam.fov * Math.PI / 180;
      const minDist = R / Math.tan(fovRad / 2) / Math.min(1, cam.aspect);
      const dist    = minDist * 1.2;
      const yaw     = YAW_DEG   * Math.PI / 180;
      const pitch   = PITCH_DEG * Math.PI / 180;
      const tz      = (zMax + zMin) / 2;
      cam.position.set(
        dist * Math.sin(yaw) * Math.cos(pitch),
        dist * Math.sin(pitch),
        tz + dist * Math.cos(yaw) * Math.cos(pitch),
      );
      controls.target.set(0, 0, tz);
      controls.update();
    },
    setZStep() { applyZStep(); },
    setBg(color) { scene.background = new THREE.Color(color); },
  };

  function applyZStep() {
    if (!decorGroup) return;
    const step = Number(zStepIn.value) || 0;
    for (const m of decorGroup.children) m.position.z = m.userData.tier * step;
  }
}

function buildDecor(data, cx, cy, extrudeNames) {
  const group = new THREE.Group();
  group.position.set(-cx, cy, 0);
  group.scale.set(1, -1, 1);
  let i = 0;
  for (const p of data.paths) {
    if (inExtrude(p.userData?.node, extrudeNames)) continue;
    for (const shape of SVGLoader.createShapes(p)) {
      const geo = new THREE.ShapeGeometry(shape);
      const mat = new THREE.MeshBasicMaterial({
        color: p.color ?? 0xffffff,
        side: THREE.DoubleSide,
        transparent: (p.userData?.style?.fillOpacity ?? 1) < 1,
        opacity: p.userData?.style?.fillOpacity ?? 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      // tier starts at 1 so bottom decor stays off z=0 (ribbon front plane)
      mesh.userData.tier = i + 1;
      group.add(mesh);
    }
    i++;
  }
  return group;
}

function fail(e) {
  console.error(e);
  const box = document.getElementById('err');
  box.textContent = String(e.stack || e);
  box.style.display = 'block';
}
