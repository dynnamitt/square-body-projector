import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { ribbon, cap, loop, disposeGroup } from './mesh.js';
import { inExtrude } from './svg.js';

const YAW_DEG   = 22;
const PITCH_DEG = 15;

export function setupStage(cv, getStep) {
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

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
  key.position.set(1, 4, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 4;
  scene.add(key);

  const root = new THREE.Group();
  scene.add(root);
  let decorGroup = null;
  let groundPlane = null;
  let currentBg = '#111118';

  (function tick() {
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, cam);
  })();

  return {
    show(specs, vb, decorData, extrudeNames, groundY) {
      disposeGroup(root);
      const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2;

      let zMax = 0, zMin = 0;
      for (const { paths, zFront, zBack, stepFactor } of specs) {
        zMax = Math.max(zMax, zFront);
        zMin = Math.min(zMin, zBack);
        for (const { points, fill } of paths) {
          const front = points.map(([x, y]) => new THREE.Vector3(x - cx, -(y - cy), zFront));
          const back  = front.map(v => v.clone().setZ(zBack));
          const color = fill ?? 0xffea06;
          const meshes = [ribbon(front, back, color), loop(front, color), loop(back, color)];
          if (fill) meshes.push(cap(front, color), cap(back, color));
          for (const m of meshes) {
            m.userData.stepFactor = stepFactor;
            m.castShadow = true;
            m.receiveShadow = true;
            root.add(m);
          }
        }
      }

      decorGroup = buildDecor(decorData, cx, cy, extrudeNames);
      root.add(decorGroup);
      applyZStep();

      const planeSize = Math.max(vb.w, vb.h) * 6;
      const planeGeo  = new THREE.PlaneGeometry(planeSize, planeSize);
      planeGeo.rotateX(-Math.PI / 2);
      groundPlane = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({
        color: groundColor(currentBg), roughness: 0.95, metalness: 0,
      }));
      groundPlane.position.y    = groundY;
      groundPlane.receiveShadow = true;
      root.add(groundPlane);

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

      const sc = R * 2;
      Object.assign(key.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 0.5, far: sc * 8 });
      key.shadow.camera.updateProjectionMatrix();
    },
    setZStep() { applyZStep(); },
    setBg(color) {
      currentBg = color;
      scene.background = new THREE.Color(color);
      if (groundPlane) groundPlane.material.color.copy(groundColor(color));
    },
  };

  function applyZStep() {
    const step = getStep();
    root.traverse(o => {
      if (o.userData.stepFactor !== undefined) o.position.z = o.userData.stepFactor * step;
    });
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
      // stepFactor starts at 1 so bottom decor stays off z=0 (ribbon front plane)
      mesh.userData.stepFactor = i + 1;
      group.add(mesh);
    }
    i++;
  }
  return group;
}

function groundColor(bg) {
  return new THREE.Color(bg).multiplyScalar(0.5);
}
