"""Capture every screenshot the manual uses (see capture_lib.py). Run: python capture.py"""
from capture_lib import *

# ------------------------------------------------------------------ overview and header
fresh()
print("warnings:", c.js("JSON.stringify(TLA.store.results.warnings.map(function(w){return w.level+': '+w.message}))", 0))
shot("overview.jpg")
shot("appbar.png", (0, 0, W, 46))
shot("steps.png", (0, 44, 720, 102))
shot("verdict.png", rect("#verdict", 6))
for pop, name in (("m-file", "menu-file.png"), ("m-calc", "menu-calc.png"), ("m-export", "menu-export.png")):
    c.js(f"document.querySelector('[data-pop=\"{pop}\"]').click()", 0.3)
    r = rect("#" + pop, 8)
    b = c.js(f"M.rect(document.querySelector('[data-pop=\"{pop}\"]'), 8)", 0)
    x0, y0 = min(r[0], b[0]), 0
    x1, y1 = max(r[0] + r[2], b[0] + b[2]), r[1] + r[3]
    shot(name, (x0, y0, x1 - x0, y1 - y0))
    c.js("document.body.click()", 0.2)
shot("legend.png", rect("#legend", 4))
shot("zoom.png", rect(".zoomctl", 6))
shot("dock-structure.jpg", rect("#dock"))
shot("rig-inspector.jpg", c.js("M.insH()", 0))

# ------------------------------------------------------------------ truss inspector (tall viewport)
c.size(W, 2400)
c.js("TLA.plan.fit(); TLA.store.select({ truss: M.T('North').id }); M.expand();", 0.5)
shot("truss-inspector.jpg", c.js("M.insH()", 0))
shot("truss-head.jpg", c.js("var h=document.querySelector('#inspector .ins-head'), g=document.querySelector('#inspector [data-grp=\"truss\"]'); var a=h.getBoundingClientRect(), b=g.getBoundingClientRect(); [a.x-4, a.y-40, a.width+8, b.bottom-a.y+44]", 0))
for grp in ("truss", "blocks", "place", "loads", "supports", "result", "adv"):
    c.js(f"M.only('{grp}')", 0.4)
    shot(f"truss-grp-{grp}.jpg", rect(f"#inspector [data-grp=\"{grp}\"]", 2))
c.js("TLA.store.select({ truss: M.T('Inner W').id }); M.only('result');", 0.5)
shot("truss-checks.jpg", rect("#inspector [data-grp=\"result\"]", 2))
c.js("M.expand()", 0.3)

# corner block
c.js("TLA.store.select({ truss: M.T('North CB1').id }); M.expand();", 0.5)
shot("block-inspector.jpg", c.js("M.insH()", 0))
# hoist
c.js("var t=M.T('North'), s=t.supports.filter(function(x){return x.kind==='hoist'})[0]; TLA.store.select({ truss: t.id, support: s.id }); M.expand();", 0.5)
shot("hoist-inspector.jpg", c.js("M.insH()", 0))
# load
c.js("var t=M.T('North'); TLA.store.select({ truss: t.id, load: t.loads[0].id }); M.expand();", 0.5)
shot("load-inspector.jpg", c.js("M.insH()", 0))
c.size(W, H)
c.js("window.dispatchEvent(new Event('resize')); TLA.plan.fit()", 0.5)

# ------------------------------------------------------------------ bolt pick mode
c.js("TLA.store.select({ truss: M.T('Inner W').id }); M.btn('Bolt to…').click();", 0.5)
shot("pick-mode.jpg", (0, 44, 1040, 526))
c.js("M.key('Escape'); TLA.store.select({});", 0.3)

# ------------------------------------------------------------------ step 2 loads
c.js("TLA.app.setStep(2)", 0.5)
shot("dock-loads.jpg", rect("#dock"))
c.js("M.cell(function(tr){return tr.classList.contains('new') && tr.textContent.indexOf('Inner E')>=0}, 3); M.key('m');", 0.4)
c.js("var i=document.querySelector('#summary input.ci'); i.value='mac aura'; i.dispatchEvent(new Event('input'));", 0.5)
shot("loads-autocomplete.jpg")
c.js("var i=document.querySelector('#summary input.ci'); if(i){ i.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); }", 0.3)
c.js("TLA.grids.leave(); TLA.app.setStep(1); TLA.app.setStep(2)", 0.4)

# ------------------------------------------------------------------ step 3 hoists
c.js("TLA.store.select({}); TLA.app.setStep(3)", 0.5)
shot("step3.jpg")
shot("dock-hoists.jpg", rect("#dock"))
c.js("var keys=[]; M.T('West').supports.forEach(function(s){ if(s.kind==='hoist') keys.push('H:'+s.id); }); TLA.grids.selectRows(keys);", 0.5)
shot("hoists-multi.jpg", rect("#dock"))
c.js("M.key('Escape'); TLA.grids.leave(); TLA.grids.compare(true); TLA.app.renderAll();", 0.5)
shot("hoists-compare.jpg", rect("#dock"))
c.js("TLA.grids.compare(false); TLA.app.renderAll();", 0.3)

# ------------------------------------------------------------------ step 4 results (all OK)
for tab, name in (("t", "results-trusses.jpg"), ("h", "results-hoists.jpg"), ("w", "results-warnings.jpg")):
    c.js(f"TLA.app.setStep(4, '{tab}')", 0.5)
    shot(name, rect("#dock"))
c.js("TLA.app.setStep(4, 't')", 0.4)
shot("step4.jpg")

# ------------------------------------------------------------------ colour modes and 3D
for mode in ("hot", "defl", "hoist", "status"):
    c.js(f"TLA.store.ui.colorMode='{mode}'; TLA.app.renderAll(); TLA.plan.fit();", 0.5)
    shot(f"plan-{mode}.jpg", (0, 44, 1040, 526))
c.js("TLA.store.ui.colorMode='util'; TLA.app.renderAll();", 0.3)
c.js("document.querySelector('#views [data-view=\"iso\"]').click();", 0.8)
c.js("TLA.iso.fit && TLA.iso.fit();", 0.5)
shot("view-3d.jpg", (0, 44, 1040, 526))
c.js("TLA.store.ui.colorMode='defl'; TLA.app.renderAll();", 0.6)
shot("view-3d-defl.jpg", (0, 44, 1040, 526))
c.js("TLA.store.ui.colorMode='util'; document.querySelector('#views [data-view=\"plan\"]').click();", 0.5)

# ------------------------------------------------------------------ a rig with problems (for results / warnings)
c.js("""(function(){ var S=TLA.store, t=M.T('Inner W');
  t.loads.push({ id: S.newId('l'), distance: 20, weight: 1400, note: 'Video wall', mirror: false });
  t.loads.push({ id: S.newId('l'), distance: 4, weight: 0, note: 'Spot (weight to follow)', mirror: false });
  S.commit(); TLA.app.setStep(4, 't'); TLA.plan.fit(); })()""", 0.8)
shot("problem-overview.jpg")
shot("problem-results.jpg", rect("#dock"))
c.js("TLA.app.setStep(4, 'w')", 0.5)
shot("problem-warnings.jpg", rect("#dock"))
c.js("TLA.store.select({})", 0.4)
shot("problem-checkrig.jpg", c.js("M.insH()", 0))
shot("verdict-fail.png", rect("#verdict", 6))
c.js("TLA.store.select({ truss: M.T('Inner W').id }); M.expand();", 0.5)
c.size(W, 2400)
c.js("TLA.store.select({ truss: M.T('Inner W').id }); M.only('result');", 0.5)
shot("problem-checks.jpg", rect("#inspector [data-grp=\"result\"]", 2))
c.size(W, H)
c.js("window.dispatchEvent(new Event('resize')); TLA.plan.fit()", 0.5)

# ------------------------------------------------------------------ rig settings page
fresh()
c.size(W, 2300)
c.js("TLA.app.openSettings(true)", 0.6)
shot("settings.jpg", c.js("var e=document.getElementById('setpage'), b=e.lastElementChild.getBoundingClientRect(); [0, 44, " + str(W) + ", b.bottom - 44 + 20]", 0))
c.js("TLA.app.openSettings(false)", 0.4)
c.size(W, H)
c.js("window.dispatchEvent(new Event('resize')); TLA.plan.fit()", 0.5)

# ------------------------------------------------------------------ calc sheet
c.js("TLA.store.rig.report = { project: 'Example show', location: 'Example venue', preparedBy: 'A. Rigger', checkedBy: 'B. Checker' }; TLA.report.open();", 1.2)
shot("calcsheet-top.jpg")
c.js("document.getElementById('report').scrollTop = 1500", 0.5)
shot("calcsheet-mid.jpg")
c.js("TLA.report.close()", 0.4)

# ------------------------------------------------------------------ calculators and databases
for tab in ("circular", "udl", "fixtures", "databases"):
    c.js(f"document.querySelector('[data-tab=\"{tab}\"]').click()", 0.8)
    shot(f"tool-{tab}.jpg")
c.js("M.btn('‹ Back to the rig').click()", 0.5)

# ------------------------------------------------------------------ about dialog
c.js("document.getElementById('b-docs').click()", 0.6)
shot("about.jpg")
c.js("document.getElementById('docs').close()", 0.3)

# ------------------------------------------------------------------ starting a new rig from scratch
fresh(example=False)
shot("new-empty.jpg")
c.js("TLA.store.addTruss({ hoists: [] });", 0.6)
shot("new-first-truss.jpg")
c.size(W, 2400)
c.js("M.expand()", 0.4)
shot("new-truss-inspector.jpg", c.js("M.insH()", 0))
c.js("M.btn('Build from pieces…').click()", 0.5)
shot("pieces-builder.jpg", rect("#inspector [data-grp=\"truss\"]", 2))
c.size(W, H)
c.js("window.dispatchEvent(new Event('resize')); TLA.plan.fit()", 0.5)

# dark theme sample for the "themes" section
fresh(theme="dark")
shot("overview-dark.jpg")

c.close()
print("done")
