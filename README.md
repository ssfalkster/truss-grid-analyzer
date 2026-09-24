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
3. Choose **File > Load example box** to see a sample box, or **File > New rig** to start empty.
4. Work through the four steps above the plan - **1 Structure** (trusses, corner blocks, bolting), **2 Loads**,
   **3 Hoists**, **4 Results** - in any order. Each step has a spreadsheet-style grid under the plan (Tab, Enter,
   Ctrl+D to fill down, Ctrl+V to paste from Excel); click anything on the plan to edit it in the side panel.

Your work is kept in the browser automatically. Use **File > Save** and **File > Open** to keep rigs as
`.rig.json` files and share them. Saved files record the app version that made them. Rig-wide settings (dynamic
factor, Add %, units...) are under **Rig settings**.

## What it does

- **Truss lines from real pieces.** Build each truss from stock lengths and corner blocks
  (for example CB + 3' + CB + 8' + 6' + 8' + CB + 3' + CB). Corner block types and weights come from the
  Christie Lites and James Thomas Engineering catalogues.
- **Grids.** Trusses bolt to corner blocks at 90 degrees and move with them, and the last side of a box
  closes onto the first. A truss bolted to a truss that is bolted back to it is flagged rather than solved.
- **Load paths.** Each truss is solved as a continuous beam with cantilevers (Clapeyron's three-moment equation).
  Reactions at bolted connections are passed on to the truss they are bolted to, down to the hoists.
- **Stiffness solve (primary result).** The whole rig is solved as a grillage, a direct-stiffness analysis of
  the trusses as Timoshenko beams sharing deflection at the joints. Corner blocks are modelled hinged,
  semi-rigid (rotational springs of 1, 4 and 16 x EI/L) and rigid, and every check uses the worst. Each truss's
  bending, shear and torsion stiffness is estimated from its manufacturer's tables, or taken from real chord and
  diagonal sizes where the truss data has them. The load-path result is kept for reference; the stiffness solve
  catches cases where the load-path method under-estimates a hoist.
- **Trim.** For each hoist, how much its load changes if it runs 1/4 in high or low, flagged past 10% of its
  capacity. Hoists can be given a stiffness (lb/in) instead of being rigid.
- **Limits.** Span and cantilever checks against the manufacturer's UDL and center point load tables, with the
  ANSI repetitive-use factor (0.85) unless the data already includes it. Maximum cantilever is a quarter of the
  maximum span.
- **Shear and moment.** Shear and bending-moment diagrams for every truss, checked against an allowable moment
  and shear estimated from the manufacturer's tables. This catches bending over the supports of a continuous
  truss and heavy loads right next to a support, which a span-by-span table check misses.
- **Hoists.** Static load including hoist body and chain weight, and dynamic load (speed in fpm / 60 + 1,
  so 16 fpm = 1.267, or your own factor) against rated capacity. A hoist the load would push up is shown as
  slack and the rig is solved without it; a truss left with nothing to stop it tipping is flagged unstable.
- **Loads.** Point loads from a fixture library, clamps, wall/UDL weight, loads mirrored about the
  centerline, and measurements from the start, centerline or end of a truss, in feet and inches.
- **Views.** Plan and 3D views, color by workload, hot spots (where each truss works hardest), hoist workload or pass/fail, and a
  breakdown of where each hoist's load comes from.

## How it's checked

- Reactions reproduce the worked examples in *Rigging Math Made Simple* (Delbert L. Hall).
- The beam solver is checked against an independent finite-element model of 400 random continuous beams.
- The stiffness solve is checked against PyNite, the 3D frame engine behind CalcForge's *3D Structural
  Analysis*: **Export > Export whole-rig model**, then `python tools/pynite_check.py <file>`
  (needs `pip install PyNiteFEA`). It rebuilds the same model in PyNite and compares hoist reactions and member
  forces for hinged and rigid joints; the example rigs agree to 0.01 lb. PyNite has no shear deformation, so the
  export is the Euler-Bernoulli version of the model. Timoshenko shear, trim and hoist springs are tested
  against closed-form beam results.

## Limitations

- Hoists are rigid supports at one level unless a hoist stiffness is given; the trim column shows the effect of
  a hoist 1/4 in out of level, one hoist at a time.
- Truss stiffness is estimated from the load tables (see the About dialog), not measured. A truss named AxB is
  taken as B deep. Scale a truss's estimate with its **Stiffness (x)** field, or add real chord and diagonal sizes
  to its data, if you have better information.
- Corner blocks are treated as points: their size (the offset between the trusses they join) is ignored, as in
  a standard grillage.
- The allowable moment and shear are estimated from the load tables, not published values. Where the
  manufacturer publishes them, compare against those.
- Truss and hoist data come from the original workbook's tables. Always confirm against the manufacturer's
  current publications.

## Development

The app is plain HTML, CSS and JavaScript with no dependencies and no build step needed to run it.

| Path | Contents |
| --- | --- |
| `index.html` | The app, loading the source files directly |
| `src/engine/` | Calculations, with no DOM: `beam.js` (continuous beam), `rig.js` (load path), `grillage.js` (stiffness solve), `section.js` (truss stiffness from the tables), `limits.js` (table and hoist checks), `side.js` (circular truss and simple UDL calculators) |
| `src/ui/` | Interface: state and undo (`store.js`), plan and 3D views, panels, tools |
| `src/version.js` | Version number and version history |
| `data/` | Truss, hoist, fixture, corner block and stock-length data |
| `tests/` | Engine and store tests |
| `tools/` | `build.py` (single-file build), `serve.py` (dev server), `corner_blocks.py` (corner block data), `pynite_check.py` (cross-check the stiffness solve in PyNite) |

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
