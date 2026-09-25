"""Runs the Quick Start tutorial in the real app (v1.26.0) through its own UI actions, captures qs-*.jpg, prints the numbers."""
import time, json
import capture_lib as L
c, W, H = L.c, L.W, L.H
L.fresh(example=False)
# 1. rename, add truss, 30 ft
c.js("TLA.store.rig.name='My first rig'; TLA.store.commit(); document.getElementById('b-add').click();", 0.5)
c.js("var i=document.querySelector('#inspector [data-grp=\"truss\"] .grid3 input'); i.value='30'; i.dispatchEvent(new Event('change'));", 0.6)
c.js("TLA.plan.fit()", 0.4)
L.shot("qs-1-truss.jpg")
# 2. loads with quick add, then Mirror all
c.js("TLA.app.setStep(2); TLA.store.select({ truss: TLA.store.rig.trusses[0].id });", 0.5)
for pos in ("-12", "-7", "-2"):
    c.js(f"var t=TLA.store.rig.trusses[0]; TLA.panels.quickAdd(t, 'MAC Viper Wash @ {pos}'); TLA.store.select({{ truss: t.id }});", 0.4)
c.js("var t=TLA.store.rig.trusses[0]; t.loads.forEach(function(l){l.mirror=true}); TLA.store.commit(); TLA.grids.leave(); TLA.app.renderAll(); TLA.plan.fit();", 0.6)
L.shot("qs-2-loads.jpg")
# 3. hoists at -13 and +13 from the centerline
c.js("TLA.app.setStep(3); var S=TLA.store, t=S.rig.trusses[0]; [-13,13].forEach(function(p){ var sp=S.addHoist(t.id); S.measureSet(sp, p, t.length); }); S.commit(); S.select({ truss: t.id }); TLA.plan.fit();", 0.8)
L.shot("qs-3-hoists.jpg")
# 4. results
c.js("TLA.store.select({}); TLA.app.setStep(4,'h'); TLA.plan.fit();", 0.8)
L.shot("qs-4-results.jpg")
c.js("TLA.app.setStep(4,'t');", 0.5)
L.shot("qs-4b-trusses.jpg", L.rect("#dock"))
print(c.js("""JSON.stringify({ t: TLA.store.rig.trusses[0].name, len: TLA.store.rig.trusses[0].length, measure: TLA.store.rig.trusses[0].measure,
  loads: TLA.store.rig.trusses[0].loads.map(function(l){return [l.note, l.distance, l.weight]}),
  hoists: TLA.store.results.hoists.map(function(x){return {d:x.distance, low:Math.round(x.hoist.reaction*10)/10, st:Math.round(x.hoist.staticLoad*10)/10, dyn:Math.round(x.hoist.dynamicLoad*10)/10, cap:x.hoist.capacity, status:x.hoist.status}}),
  totals: TLA.store.results.totals, warns: TLA.store.results.warnings.map(function(w){return w.message}) })""", 0))
# 5. calc sheet
c.js("TLA.report.open()", 1.0)
L.shot("qs-5-calcsheet.jpg")
c.js("TLA.report.close()", 0.3)
c.close()
