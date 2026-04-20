# square-body-projector

Web renderer that turns a 2D SVG into a 3D "square-body" extrude: one or more
layers pushed along Z, with optional rasterized decor painted on the sides and
caps. Runs in the browser via Three.js — no bundler, no build tools beyond
`make` and Python's `http.server`.

## Usage

1. `make serve` — builds `www/` and serves on <http://localhost:8080>.
2. Open the page in a browser.
3. Pick an SVG from the **dropdown**. The 3D view updates.
4. Tweak:
   - **color** — recolors the first extrude layer. The background flips to a
     complementary hue automatically.
   - **z-step** — separates overlapping extrude layers along Z to prevent
     z-fighting. Texture meshes are glued to their ribbon and are not affected.
5. Drag in the canvas to orbit; wheel to zoom.

To add a new SVG, drop it in `2d/` and run `make build` (or just `make serve`
again). The dropdown is regenerated from the file list at build time.

## Writing pragmas

The renderer reads plain HTML comments at the top of each SVG. They tell it
which Inkscape layers to extrude and which to rasterize as textures on the
3D body. Layer names are arbitrary — the pragmas are the source of truth.

### Extrude pragma — one per extruded layer

```
<!-- 3d_project layerName: NAME [, param: value, ...] -->
```

| Param        | Meaning                                                                    | Default |
|--------------|----------------------------------------------------------------------------|---------|
| `layerName`  | `inkscape:label` of the `<g>` to extrude. **Required.**                    | —       |
| `w`          | Extrude depth as a fraction of the maximum X span across sampled points.   | `0.25`  |
| `zStepAdd`   | Integer added to this layer's z-step tier (nudges forward/backward).       | `0`     |
| `nearAndFar` | `on` / `true` — also extrude a copy in +Z starting from the previous layer's far face. | off |

One pragma per layer, in document order. If no pragma matches, the code falls
back to a single layer named `EXTRUDE`.

### Texture pragma — one per decor layer

```
<!-- texture layerName: NAME, ref: EXTRUDE_NAME, side: SIDE [, param: value, ...] -->
```

The named layer is rasterized (SVG → canvas) and painted onto one face of the
referenced extrude. The layer may live **outside the main SVG viewBox** —
illustrators often park side details off to the side so the 2D preview stays
clean. Rasterization measures the subtree's own bbox, so off-viewBox layers
render at 1:1 scale regardless.

| Param       | Meaning                                                                   | Default |
|-------------|---------------------------------------------------------------------------|---------|
| `layerName` | `inkscape:label` of the `<g>` to rasterize. **Required.**                 | —       |
| `ref`       | `layerName` of the extrude layer whose face this decorates. **Required.** | —       |
| `side`      | Which face (see table below). **Required.**                               | —       |
| `detect`    | For `left`/`right` only: `band` or `first`. See below.                    | `band`  |
| `tol`       | For `detect: band`: tolerance as a fraction of the X span.                | `0.02`  |

#### `side` values

| Value    | Where it lands                                                   | Status    |
|----------|------------------------------------------------------------------|-----------|
| `left`   | Flat ribbon strip near `minX` of the SVG perimeter.              | available |
| `right`  | Flat ribbon strip near `maxX`.                                   | available |
| `near`   | Front cap at `z = 0`.                                            | available |
| `far`    | Back cap at `z = -WIDTH`. Auto-mirrored for correct read from behind. | available |
| `top`    | Ribbon strip near `minY`.                                        | *TODO*    |
| `bottom` | Ribbon strip near `maxY`.                                        | *TODO*    |

#### `detect` values (side = `left` or `right` only)

- **`band`** (default) — tolerance strip around the target x-extremum. Works
  well for rectangular-ish bodies. `tol` controls the strip width.
- **`first`** — legacy: splits the perimeter at the first-encountered top and
  bottom y-extrema and picks the arc containing `argmin(x)` (or `argmax(x)`).
  Can misplace the texture on asymmetric perimeters.

### Example (`2d/da-bus.svg`)

```xml
<!-- 3d_project layerName: EXTRUDE, w: .37 -->
<!-- 3d_project layerName: rubber, w: .05, nearAndFar: on, zStepAdd: 1 -->
<!-- texture    layerName: frontside, ref: EXTRUDE, side: right -->
<!-- texture    layerName: backside,  ref: EXTRUDE, side: left  -->
```

## Commands

- `make build` — assembles `www/` (HTML template filled, `src/*.js` copied,
  `2d/*.svg` copied, dropdown options generated from the SVG list).
- `make serve` — `make build` then serves `www/` on port 8080.
- `make clean` — removes `www/`.

No npm or package manifest. ES modules are loaded from `esm.sh` via an
importmap in the page (`three`, `three/addons/*`, `fast-xml-parser`).

## Publishing

`.github/workflows/publish.yml` deploys `www/` to GitHub Pages on push to
`main`. One-time repo setup: **Settings → Pages → Source = GitHub Actions**.

## Idea

The project started with a simple question: given an SVG with some paths
annotated for "extrude me," can we show a 3D shape in the browser without a
modelling tool?

`fast-xml-parser` produces a list of vertices + edges from the SVG. Paths in
the tagged layer get a twin copy at `z = -WIDTH`. Edges and faces connect the
two copies. Paths outside the tagged layer stay flat at `z = 0` as decor.

### Sample (box with a window)

                                           n---------n
                                          /        / |
    *--------*                           *--------*  |
    |  x..x  |                           |  x..x  |  |
    |  .  .  |  -- |projected-as-3d| --> |  .  .  |  n
    |  x..x  |                           |  x..x  | /
    *--------*                           *--------*

#### Legend

1. `*` vertices and `--` edges in the tagged layer trigger a copy placed
   behind in the z-axis. `n` shows the new clone of a vertex.
2. `n` vertices get `z = -WIDTH` (a fraction of the longest *-vertex distance
   along x).
3. Edges and faces in 3D space are added between `*` and `n` vertices.
4. `x` vertices keep `z = 0`; the `..` edges follow along, no projection
   added.

## Future iterations

- `side: top` / `side: bottom` texture targets.
- Migrate all flat decor to rasterized textures on caps/ribbons, retiring the
  z-step nudge mechanism.
- Curvature-based (`detect: corner`) side detection for non-rectangular
  bodies.
