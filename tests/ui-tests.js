/* 1.18.0 interface helpers: load weight + clamp, fixture lookup, quick add, grid lookups. */
(function (g) {
  var TLA = g.TLA, add = g.__addTLATest, S = TLA.store, P = TLA.panels;
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-9))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function fresh() { S.newRig(); P.mount(S); TLA.grids.mount(S); var t = S.addTruss({ name: "T", length: 20 }); return t; }

  add("ui: weight + clamp is the load's weight; no quantity is stored", function () {
    var t = fresh(), l = P.newLoad(t);
    l.qty = 3;                              // a stray field from a pre-release build is dropped
    P.setLoadParts(l, { each: 20, clamp: 2 });
    near(l.weight, 22, 1e-9, "weight"); eq("qty" in l, false, "no qty"); eq(l.fixtureLb, 20, "weight kept"); eq(l.clampLb, 2, "clamp kept");
    var p = P.loadParts(l); near(p.each, 20); near(p.clamp, 2);
  });
  add("ui: a plain weight load reads back as its weight, no clamp", function () {
    var p = P.loadParts({ weight: 85, note: "x" });
    near(p.each, 85); near(p.clamp, 0);
  });
  add("ui: a library fixture fills the name, weight and clamp", function () {
    var t = fresh(), l = P.newLoad(t), f = TLA.data.fixtures.filter(function (x) { return x.clamp_lb; })[0];
    P.applyFixture(l, f);
    eq(l.note, f.manufacturer + " " + f.fixture); near(l.weight, f.weight_lb + f.clamp_lb, 1e-9, "weight + clamp");
  });
  add("ui: fixture lookup finds exact and partial names, and refuses an ambiguous one", function () {
    fresh();
    eq(TLA.grids.findFixture("Martin MAC Aura").fixture, "MAC Aura", "exact");
    eq(TLA.grids.findFixture("mac aura xb").fixture, "MAC Aura XB", "exact, any case");
    eq(TLA.grids.findFixture("aura").fixture, "MAC Aura", "shortest partial match");
    eq(TLA.grids.findFixture("zzzz-no-such"), null, "no match");
  });
  add("ui: quick add - fixture @ position, and a weight @ position", function () {
    var t = fresh();
    t.measure = "center";
    eq(P.quickAdd(t, "MAC Aura @ 4"), null, "fixture accepted");
    var l = t.loads[t.loads.length - 1];
    eq(l.note, "Martin MAC Aura"); near(l.distance, 14, 1e-9, "4 ft right of the centre of a 20 ft truss");
    eq(P.quickAdd(t, "45 lb @ -6"), null, "weight accepted");
    l = t.loads[t.loads.length - 1];
    near(l.weight, 45, 1e-9, "45 lb"); eq("qty" in l, false); near(l.distance, 4, 1e-9);
    eq(typeof P.quickAdd(t, "zzzz-no-such @ 2"), "string", "unknown fixture is refused");
  });
  add("ui: quick add takes a full or partial UDL", function () {
    var t = fresh(); t.measure = "start";
    eq(P.quickAdd(t, "UDL 200"), null, "full UDL accepted");
    near(t.wallWeight, 200, 1e-9, "added to the truss UDL"); eq(t.loads.length, 0, "no point loads");
    eq(P.quickAdd(t, "UDL 120 @ 2 to 8"), null, "partial UDL accepted");
    eq(t.loads.length, 6, "one load per foot over 6 ft");
    near(t.loads.reduce(function (s, l) { return s + l.weight; }, 0), 120, 1e-6, "total kept");
    near(t.loads[0].distance, 2.5, 1e-9, "first at the middle of its foot"); near(t.loads[5].distance, 7.5, 1e-9);
    eq(P.quickAdd(t, "UDL 10 lb/ft @ 10-14"), null, "per length");
    near(t.loads.slice(6).reduce(function (s, l) { return s + l.weight; }, 0), 40, 1e-6, "10 lb/ft x 4 ft");
    t.measure = "center";
    eq(P.quickAdd(t, "udl 30 @ -3 to 3"), null, "from the centerline");
    var c = t.loads.slice(-6); near(c[0].distance, 7.5, 1e-9); near(c[5].distance, 12.5, 1e-9);
    eq(typeof P.quickAdd(t, "UDL 50 @ 15 to 25"), "string", "past the end is refused");
    eq(typeof P.quickAdd(t, "UDL"), "string", "no weight is refused");
  });
  add("ui: mirror position is reported on the other side of the centerline", function () {
    var t = fresh(), l = P.newLoad(t); l.distance = 5; l.mirror = true;
    eq(P.mirrorAt(l, t) !== null, true, "has a twin");
    l.distance = 10; eq(P.mirrorAt(l, t), null, "a load on the centerline has no twin");
  });
  add("ui: selecting does not change the rig or re-solve it", function () {
    var t = fresh(), before = JSON.stringify(S.rig), res = S.results;
    S.select({ truss: t.id, load: null });
    eq(JSON.stringify(S.rig), before, "rig unchanged"); eq(S.results, res, "same results object");
    eq(S.sel.truss, t.id);
  });
  add("ui: centre the rig on 0,0 - the footprint's middle moves to the origin, bolted parts follow, results unchanged", function () {
    S.newRig(); TLA.samples.box(S); S.commit({ noUndo: true });
    var G = TLA.rig.geometry, loads = S.results.hoists.map(function (x) { return x.hoist.staticLoad.toFixed(6); }).join();
    function box() { var b = [Infinity, -Infinity, Infinity, -Infinity]; S.rig.trusses.forEach(function (t) { [0, t.length].forEach(function (d) { var p = G.endPoint(t, d); b[0] = Math.min(b[0], p.x); b[1] = Math.max(b[1], p.x); b[2] = Math.min(b[2], p.y); b[3] = Math.max(b[3], p.y); }); }); return b; }
    var w0 = box(), d = S.centerRig(), b = box();
    near((b[0] + b[1]) / 2, 0, 1e-6, "x centre"); near((b[2] + b[3]) / 2, 0, 1e-6, "y centre");
    near(b[1] - b[0], w0[1] - w0[0], 1e-6, "same width"); near(b[3] - b[2], w0[3] - w0[2], 1e-6, "same depth");
    eq(S.results.hoists.map(function (x) { return x.hoist.staticLoad.toFixed(6); }).join(), loads, "hoist loads unchanged");
    eq(S.centerRig()[0], 0, "already centred");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
