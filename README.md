# Truss Grid Analyzer

An offline, single-file web app for load analysis of truss grids: trusses bolted together at corner blocks, hung from chain hoists, with loads carried through the whole load path.

Based on the *Truss Load Analyzer - EOT* spreadsheet by Hall & Sogoian (credit and history in the app's About dialog). The truss, hoist and fixture tables come from that workbook; corner-block data is from the Christie Lites and James Thomas Engineering catalogs.

**This is a calculation aid, not an engineering approval. Verify against manufacturer data and have a qualified person review any rig.**

## Use

Open `dist/index.html` in a browser (no install, no internet). Work is saved in the browser; use Save / Open for `.rig.json` files.

To rebuild the single file after editing: `python tools/build.py`. To serve the source with no caching for development: `python tools/serve.py` (http://localhost:8765). Tests: open `tests/run.html` through that server.

## Features

- Continuous-beam (three-moment) solver per truss with cantilevers; limits from manufacturer UDL/CPL tables; hoist static and dynamic load (dynamic factor = speed fpm / 64 + 1, default 1.25).
- Truss grids: corner blocks as components of a truss line, trusses bolted at 90 degrees, loop closing, loads passed down to the hoists; stiffness (grillage) cross-check.
- Plan and 3D views, mirrored loads, measuring from start / centerline / end, feet-inches input, fixture library with clamps, grouped side panel, resizable panels.
- Textbook checks against *Rigging Math Made Simple* (lessons 12-14, 21).

## License

Free to use and share, never for sale. See [LICENSE.md](LICENSE.md). Truss Grid Analyzer is by G.E. Simmons Falk,
based on *Truss Load Analyzer - EOT* by Delbert L. Hall and Jon Sogoian, the originators of the program. Thanks to
Issy Stadler, Drop Bear Productions, for testing help.
