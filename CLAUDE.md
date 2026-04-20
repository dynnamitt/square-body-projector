# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `make build` — assemble `www/` (sed-substituted `index.html`, copied `src/*.js`, copied `2d/*.svg`).
- `make serve` — build then serve `www/` at `http://localhost:8080` via `python -m http.server`.
- `make clean` — remove `www/`.

No npm/package manifest. No test or lint commands. ES modules are loaded in-browser via an importmap from `esm.sh` (`three`, `three/addons/*`, `fast-xml-parser`) — no bundler.

## Publish

`.github/workflows/publish.yml` deploys `www/` to GitHub Pages on push to `main` via `actions/deploy-pages@v4`. One-time repo setup: **Settings → Pages → Source = GitHub Actions**.

## What the page does

`src/app.js` fetches the SVG chosen from the `<select id="pick">` dropdown (its `<option>`s are generated at build time from `2d/*.svg`). `src/svg.js` parses the XML with `fast-xml-parser` and also runs `three/addons/loaders/SVGLoader` over it. The page then:

1. Resolves one or more extrude layers from top-of-document pragmas (see below).
2. For each layer, walks the parsed tree for `<path>` / `<circle>` inside `<g inkscape:label="$NAME">`, samples each one into a polyline via `SVGPathElement.getPointAtLength`, and renders a ribbon between a front polyline (z=zFront) and a back copy (z=zBack). Width per layer comes from the `w` pragma param (fraction of max X span); default `WIDTH_FRAC = 0.25`.
3. If the extruded path has a `fill` (attribute or inline `style`), adds front + back `ShapeGeometry` caps in the same color; otherwise renders only ribbon + edge loops in a default yellow.
4. Renders all non-extrude paths as flat `ShapeGeometry` decor via `SVGLoader.createShapes`, using each path's SVG fill color.
5. Tags every extrude mesh and every decor mesh with `userData.stepFactor`; `setupStage` multiplies that by the live `#zstep` input value to offset meshes in z, preventing z-fighting and letting the user scrub layer separation at runtime.
6. Adds a ground plane (`groundY` from SVG top extent) that receives shadows from a shadow-casting directional key light.

`src/stage.js` owns the Three.js scene, OrbitControls, lights, ground, camera fit, and background/ground-color coupling via the `#bg` picker.

## Layer pragmas (load-bearing)

Every SVG in `2d/` declares its extrude layers via top-of-document comments. One pragma per extrude layer:

    <!-- 3d_project layerName: NAME [, param: value, ...] -->

Note the grammar: no dot between `3d_project` and `layerName`, camelCase, comma-separated params. Multiple pragmas → multiple extrude layers in document order. If no pragma matches, the code falls back to a single layer named `EXTRUDE` (the `EXTRUDE` constant exported from `svg.js`). Hardcoding layer names in JS is a bug; pragmas are the source of truth.

Params (all optional):

- `w` — extrude width as a fraction of the max X span across all sampled points (default `0.25`).
- `zStepAdd` — integer added to the z-step tier index for this layer (nudges it forward or backward of where it would otherwise land).
- `nearAndFar` — when `on`/`true` and this is not the first layer, a second copy of the layer is extruded in +z starting from the previous layer's farthest z-face.

Example (`2d/da-bus.svg`):

    <!-- 3d_project layerName: EXTRUDE, w: .37 -->
    <!-- 3d_project layerName: rubber , w: .05, nearAndFar: on, zStepAdd: 1 -->

Layer names are free-form (the current `2d/` examples use `EXTRUDE`, `rubber`, `L1`).

### `texture` pragma — side-wall rasterized layer

Tags an Inkscape layer as a **side-wall texture** that is rasterized (SVG → `CanvasTexture`) and mapped onto the left or right wall of a referenced `3d_project` extrude. Front/back walls are already handled by extrude caps; `texture` fills the blank left/right ribbons.

    <!-- texture layerName: NAME, ref: EXTRUDE_NAME, side: left|right -->

Required params:

- `layerName` — the `inkscape:label` of the `<g>` to rasterize.
- `ref` — the `layerName` of a `3d_project` extrude whose wall this decorates. Bounding box + width come from that extrude's sampled points.
- `side` — `left` or `right`.

Semantics: missing/invalid `ref` logs an error and skips. Texture layers are excluded from flat `decor` so they don't double-render. Absence of any `texture` pragma preserves current behavior. See **Placement** below for the rendered mesh contract.

**Texture layers may live outside the source viewBox.** Illustrators often park side-view details (frontside/backside panels, door handles, vents, stripes, badges) outside the main viewport so the raw `2d/` SVG renders cleanly without cluttering the face view. `src/raster.js` therefore ignores the source `viewBox` and measures each subtree's own `getBBox()` to build a tight viewBox for rasterization (1:1 SVG-unit scale, aspect preserved — no stretching).

**Placement on the ribbon (cube-side UV) — TODO, see GH #5.** The floating-plane approach was reverted; the parser + rasterizer are in place but no mesh is emitted yet. Design draft parked in `.claude/projects/-home-kdm-CODE-square-body-projector/memory/project_cube_side_uv_draft.md`.

Example (`2d/da-bus.svg`):

    <!-- texture layerName: frontside, ref:EXTRUDE, side: right -->
    <!-- texture layerName: backside,  ref:EXTRUDE, side: left  -->

## Module layout

- `src/svg.js` — parsing only. Exports `parseSvg(xml)` returning `{layers, textures, viewBox, rootAttrs, defs, decor}` where `textures: [{name, ref, side, params, subtree}]`; plus `samplePath`, `maxXSpan`, `inExtrude(node, names)` (accepts string or array), and the `EXTRUDE` fallback constant.
- `src/app.js` — dropdown/bg/z-step wiring; builds per-layer `specs` (name, bounds, `nearAndFar` copies) and calls `stage.show`.
- `src/stage.js` — `setupStage(canvas, getStep)`: renderer, camera, OrbitControls, lights, shadows, ground plane, `show(specs, vb, decor, extrudeNames, textures, textureNames, svgMeta, groundY)`, `setZStep`, `setBg`; also builds decor via `SVGLoader.createShapes`, skipping paths `inExtrude` of any extrude OR texture layer name.
- `src/mesh.js` — primitive factories: `ribbon`, `cap`, `loop`, `disposeGroup`.
- `src/raster.js` — SVG subtree → standalone SVG string (`XMLBuilder`) → `CanvasTexture`. Exports `buildStandaloneSvg`, `tightViewBox`, `rasterize`. (Mesh-building for textures is TODO, see GH #5.)
- `src/index.html.tmpl` — HTML template with `__TITLE__`, `__BUILT__`, `__REPO_URL__`, `__SVG_OPTIONS__` placeholders filled by `make build`.

## Coding conventions

The user's global `~/.claude/CLAUDE.md` conventions apply — notably the 200-line file limit for dynamic-language files (JS/Python/Lua). When approaching it, split by responsibility (as `svg.js`, `stage.js`, and `mesh.js` were split out of `app.js`) instead of editing past it.
