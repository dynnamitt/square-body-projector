import * as THREE from 'three';
import { XMLBuilder } from 'fast-xml-parser';

const SVG_NS = 'http://www.w3.org/2000/svg';

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributesGroupName: '$',
  attributeNamePrefix: '',
  suppressEmptyNode: true,
  format: false,
});

export function buildStandaloneSvg(subtree, viewBox, defs) {
  const svg = {
    $: {
      xmlns: SVG_NS,
      'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      'xmlns:inkscape': 'http://www.inkscape.org/namespaces/inkscape',
      'xmlns:sodipodi': 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
      version: '1.1',
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`,
      preserveAspectRatio: 'none',
    },
    g: subtree,
  };
  if (defs) svg.defs = defs;
  return `<?xml version="1.0" encoding="UTF-8"?>` + builder.build({ svg });
}

// Tightens viewBox to the subtree's own rendered bbox. Texture layers often
// live outside the source viewBox (so the 2D preview stays uncluttered), so we
// cannot rely on the source viewBox to clip them — we measure geometry instead.
export function tightViewBox(svgStr, pad = 4) {
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  const svgEl = doc.documentElement;
  if (!svgEl || svgEl.nodeName === 'parsererror' || svgEl.tagName.toLowerCase() !== 'svg') return null;
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:2048px;height:2048px;visibility:hidden;overflow:visible';
  host.appendChild(document.importNode(svgEl, true));
  document.body.appendChild(host);
  const g = host.querySelector('svg > g');
  const b = g?.getBBox?.();
  host.remove();
  if (!b || !isFinite(b.width) || !isFinite(b.height) || b.width <= 0 || b.height <= 0) return null;
  return { x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2 };
}

// Paints the SVG into a `contentW x contentH` rectangle of a transparent
// `canvasW x canvasH` canvas. `anchor.dx`/`anchor.dy` set the top-left of the
// content on the canvas; default centres it.
export function rasterize(svgStr, canvasW, canvasH, contentW, contentH, maxAniso, anchor) {
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = canvasW;
      cv.height = canvasH;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, canvasW, canvasH);
      const dx = anchor?.dx ?? Math.round((canvasW - contentW) / 2);
      const dy = anchor?.dy ?? Math.round((canvasH - contentH) / 2);
      ctx.drawImage(img, dx, dy, contentW, contentH);
      URL.revokeObjectURL(url);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

