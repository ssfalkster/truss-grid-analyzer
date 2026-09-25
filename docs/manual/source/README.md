# User manual - sources

The manual in `docs/manual/` is written for **Truss Grid Analyzer v1.26.0** (24 September 2026). It is revised on
request, not with every release, so the app may be newer than the manual.

Outputs (in `docs/manual/`):
- `Truss Grid Analyzer - Quick Start (v1.26.0).pdf`
- `Truss Grid Analyzer - User Guide (v1.26.0).pdf` - bookmarks, contents with page numbers
- `Truss Grid Analyzer - User Guide (v1.26.0).html` - one file, images inlined, works offline, search box (`/` or Ctrl+K)

## Sources

- `quickstart.src.html`, `guide-01..05.src.html` - the text. Macros: `[[img file|caption|width%]]`,
  `[[pins file|caption|width%|n@x,y;...]]` (x, y in % of the image; below 0 or over 100 puts the pin in the margin),
  `{{pin n}}`, `{{VER}}`, `{{DATE}}`. `<h2>` / `<h3>` are numbered by the build.
- `manual.css` - shared screen and print styles.
- `cdp.py` - a small Chrome DevTools Protocol client (Python stdlib only) that drives headless Chrome or Edge.
- `capture_lib.py` + `capture.py` - take every screenshot from the app into `img/`.
- `tutorial.py` - runs the Quick Start tutorial in the app (`img/qs-*.jpg`) and prints its numbers
  (low hook 300.9 lb, high hook static 433.7 lb, dynamic 549.4 lb).
- `box_demo.py` - builds the "Building a box" example (`img/box-built.jpg`).
- `build.py` - builds the three outputs. Needs Chrome or Edge, and Python with Pillow, pypdf and PyMuPDF.

The screenshots (`img/`) and the pinned app build are not in git; they are regenerated:

```
cd docs/manual/source
git show v1.26.0:dist/index.html > app-1.26.0.html
python capture.py
python tutorial.py
python box_demo.py
python build.py
```

## Updating for a new version

Only when the owner asks. Take the new build (`git show vX.Y.Z:dist/index.html > app-X.Y.Z.html`), change the file
name in `capture_lib.py` and `VER` / `DATE` in `build.py`, re-run the captures, check every screenshot and every
statement against the version history (`src/version.js`), then `python build.py` and replace the outputs.
