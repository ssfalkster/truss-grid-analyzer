# Truss Grid Analyzer

Load analysis for entertainment truss grids. Build a box or grid of trusses bolted together at corner blocks, hang
it from chain hoists, add your loads, and see the load on every hoist and the utilization of every span and
cantilever.

It runs entirely in the browser. It works offline, needs no install or account, and sends nothing anywhere.

> **A calculation aid, not an engineering approval.** Check results against the manufacturer's current data and
> have a qualified person review every rig before it flies. See the disclaimer in [LICENSE.md](LICENSE.md).

Truss Grid Analyzer is a web rebuild of *Truss Load Analyzer - EOT*, the Excel workbook by Delbert L. Hall and
Jon Sogoian.

## Getting started

1. Download `dist/index.html`. It is the whole app in one file.
2. Open it in any modern browser. It works from your disk, with no internet connection.
3. Choose **Example** to load a sample box, or **New** to start empty, then **+ Truss** to add trusses.

Your work is kept in the browser automatically. Use **Save** and **Open** to keep rigs as `.rig.json` files and
share them. Saved files record the app version that made them.

## What it does

- **Truss lines from real pieces.** Build each truss from stock lengths and corner blocks
  (for example CB + 3' + CB + 8' + 6' + 8' + CB + 3' + CB). Corner block types and weights come from the
  Christie Lites and James Thomas Engineering catalogues.
- **Grids.** Trusses bolt to corner blocks at 90 degrees and move with them, and the last side of a box
  closes onto the first. A truss bolted to a truss that is bolted back to it is flagged rather than solved.
- **Load paths.** Each truss is solved as a continuous beam with cantilevers (Clapeyron's three-moment equation).
  Reactions at bolted connections are passed on to the truss they are bolted to, down to the hoists.
- **Stiffness check.** The whole rig is also solved as a grillage, a direct-stiffness analysis of the beams
  sharing deflection at the joints. Joints are modelled both hinged and rigid, and the worse result is shown
  next to the load-path result. This catches cases where the load-path method under-estimates a hoist.
- **Limits.** Span and cantilever checks against the manufacturer's UDL and center point load tables, with the
  ANSI repetitive-use factor (0.85) unless the data already includes it. Maximum cantilever is a quarter of the
  maximum span.
- **Hoists.** Static load including hoist body and chain weight, and dynamic load (speed in fpm / 64 + 1,
  so 16 fpm = 1.25, or your own factor) against rated capacity.
- **Loads.** Point loads from a fixture library, clamps, wall/UDL weight, loads mirrored about the
  centerline, and measurements from the start, centerline or end of a truss, in feet and inches.
- **Views.** Plan and 3D views, color by load-path layer, utilization, hoist load or pass/fail, and a
  breakdown of where each hoist's load comes from.

## How it's checked

- Reactions reproduce the worked examples in *Rigging Math Made Simple* (Delbert L. Hall).
- The beam solver is checked against an independent finite-element model of 400 random continuous beams.
- For a whole grid, cross-check with an independent 3D frame analysis such as CalcForge's
  *3D Structural Analysis*. Model hoists as pinned supports and leave the truss joints continuous.

## Limitations

- Hoists are treated as rigid supports at exactly the same height. Trim differences and chain stretch are not
  modelled.
- Truss bending and torsional stiffness in the stiffness check are estimated from each truss's published size and
  connector type. Scale a truss's estimate with its **Stiffness (x)** field if you have better data.
- Truss and hoist data come from the original workbook's tables. Always confirm against the manufacturer's
  current publications.

## Development

The app is plain HTML, CSS and JavaScript with no dependencies and no build step needed to run it.

| Path | Contents |
| --- | --- |
| `index.html` | The app, loading the source files directly |
| `src/engine/` | Calculations, with no DOM: `beam.js` (continuous beam), `rig.js` (load path), `grillage.js` (stiffness check), `limits.js` (table and hoist checks), `side.js` (circular truss and simple UDL calculators) |
| `src/ui/` | Interface: state and undo (`store.js`), plan and 3D views, panels, tools |
| `src/version.js` | Version number and version history |
| `data/` | Truss, hoist, fixture, corner block and stock-length data |
| `tests/` | Engine and store tests |
| `tools/` | `build.py` (single-file build), `serve.py` (dev server), `corner_blocks.py` (corner block data) |

- Run from source: `python tools/serve.py`, then open http://localhost:8765 (caching is off).
- Run the tests: open http://localhost:8765/tests/run.html.
- Build the single file: `python tools/build.py`, which writes `dist/index.html`.

Versions follow MAJOR.MINOR.PATCH. The history is in `src/version.js` and in the app's About dialog.

## Credits and license

Truss Grid Analyzer is by **G.E. Simmons Falk**. It is based on *Truss Load Analyzer - EOT* by
**Delbert L. Hall and Jon Sogoian**, the originators of the program, and their original team.
Thanks to **Issy Stadler** for testing help.

Free to use, copy and modify, but never for sale, as the original program's terms require.
See [LICENSE.md](LICENSE.md).
