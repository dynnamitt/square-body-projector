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

`src/app.js` fetches the SVG chosen from the `<select id="pick">` dropdown (the dropdown's `<option>`s are generated at build time from `2d/*.svg`). `src/svg.js` parses the XML with `fast-xml-parser` and also runs `three/addons/loaders/SVGLoader` over it. The page then:

1. Resolves the extrudable layer name (see pragma below).
2. Walks the parsed tree for `<path>` elements inside `<g inkscape:label="$LAYER">`, samples each one into a polyline via `SVGPathElement.getPointAtLength`, and renders a ribbon between the front polyline (z=0) and a back copy at z=-WIDTH.
3. If the extruded path has a `fill`, adds front + back `ShapeGeometry` caps in the same color.
4. Renders all non-extrude paths as flat `ShapeGeometry` decor on z=0, using each path's SVG fill color, with a tiny +y nudge per document-order index to prevent z-fighting.

## Layer-selection pragma (load-bearing)

Every SVG in `2d/` declares its extrudable layer via a top-of-document comment:

    <!-- 3d_project.layer_name: NAME -->

`NAME` is the value of `inkscape:label` on the `<g>` that should be extruded. The project does **not** enforce a single layer name — `da-bus.svg` uses `EXTRUDE`, `2layers.svg` uses `L1`. If the pragma is absent, the code falls back to `"EXTRUDE"`. Hardcoding the name in JS is a bug; the pragma is the source of truth.

## Module layout

- `src/svg.js` — parsing only. Exports `parseSvg(xml)` (returns `{layer, viewBox, extrudePaths, decor}`), `samplePath`, `maxXSpan`, `inExtrude`, `EXTRUDE` (the fallback constant).
- `src/app.js` — Three.js scene, dropdown wiring, `buildDecor`, `ribbon`, `cap`, `loop`.
- `src/index.html.tmpl` — HTML template with `__TITLE__`, `__BUILT__`, `__SVG_OPTIONS__` placeholders filled by `make build`.

## Coding conventions

The user's global `~/.claude/CLAUDE.md` conventions apply — notably the 200-line file limit for dynamic-language files (JS/Python/Lua). When approaching it, split by responsibility (as `svg.js` was split out of `app.js`) instead of editing past it.
