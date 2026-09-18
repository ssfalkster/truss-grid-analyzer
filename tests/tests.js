/* Engine tests. Runs in the browser via tests/run.html (no Node available). Results in window.__results. */
(function (g) {
  var TLA = g.TLA;
  var tests = [];
  function test(name, fn) { tests.push({ name: name, fn: fn }); }
  g.__addTLATest = test;
  function near(a, b, tol, msg) {
    if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a);
  }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }

  function findTruss(t) {
    return TLA.data.trusses.filter(function (x) { return x.manufacturer === t.manufacturer && x.description === t.description; })[0];
  }
  function hoistKey(h) { return h.description + " | " + h.capacity_label + " | " + h.speed_fpm + " fpm"; }
  function findHoist(name) {
    if (!name || String(name).indexOf("None") === 0) return TLA.data.hoists[0];
    return TLA.data.hoists.filter(function (h) { return hoistKey(h) === name; })[0];
  }

  test("simple beam: single span UDL reactions wL/2", function () {
    var b = TLA.beam.solve({ length: 20, supports: [0, 20], loads: [], trussWeightPerFt: 10 });
    near(b.reactions[0], 100, 1e-9); near(b.reactions[1], 100, 1e-9);
  });
  test("two equal spans UDL: 3/8, 5/4, 3/8 wL", function () {
    var b = TLA.beam.solve({ length: 20, supports: [0, 10, 20], loads: [], trussWeightPerFt: 10 });
    near(b.reactions[0], 37.5, 1e-9); near(b.reactions[1], 125, 1e-9); near(b.reactions[2], 37.5, 1e-9);
    near(b.moments[1], 125, 1e-9, "M2 = wL^2/8");
  });
  test("point load at midspan of a single span", function () {
    var b = TLA.beam.solve({ length: 10, supports: [0, 10], loads: [{ distance: 5, weight: 100 }] });
    near(b.reactions[0], 50, 1e-9); near(b.reactions[1], 50, 1e-9);
  });
  test("cantilever overhang: statics", function () {
    var b = TLA.beam.solve({ length: 12, supports: [2, 10], loads: [{ distance: 12, weight: 100 }] });
    near(b.reactions[1] + b.reactions[0], 100, 1e-9);
    near(b.reactions[1], 100 * (12 - 2) / 8, 1e-9);
    near(b.reactions[0], -100 * 2 / 8, 1e-9);
  });
  test("equilibrium with many supports and random loads", function () {
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var t = 0; t < 50; t++) {
      var n = 2 + Math.floor(rnd() * 9), pts = [], p = rnd() * 3;
      for (var i = 0; i < n; i++) { pts.push(p); p += 2 + rnd() * 20; }
      var len = p + rnd() * 3, loads = [];
      for (var j = 0; j < 20; j++) loads.push({ distance: rnd() * len, weight: rnd() * 300 });
      var b = TLA.beam.solve({ length: len, supports: pts, loads: loads, trussWeightPerFt: 6, wallWeight: 100 });
      near(b.equilibriumError, 0, 1e-7, "equilibrium case " + t);
    }
  });
  test("supports given in any order", function () {
    var loads = [{ distance: 3, weight: 50 }, { distance: 14, weight: 80 }];
    var a = TLA.beam.solve({ length: 20, supports: [1, 9, 19], loads: loads, trussWeightPerFt: 5 });
    var b = TLA.beam.solve({ length: 20, supports: [19, 1, 9], loads: loads, trussWeightPerFt: 5 });
    near(b.reactions[0], a.reactions[2], 1e-9); near(b.reactions[1], a.reactions[0], 1e-9); near(b.reactions[2], a.reactions[1], 1e-9);
  });
  test("mirror flag creates a symmetric twin, centre load not doubled", function () {
    var b = TLA.beam.solve({ length: 20, supports: [2, 18], loads: [{ distance: 4, weight: 100, mirror: true }] });
    eq(b.loads.length, 2, "twin count");
    near(b.reactions[0], b.reactions[1], 1e-9, "symmetric reactions");
    near(b.totalLoad, 200, 1e-9);
    var c = TLA.beam.solve({ length: 20, supports: [2, 18], loads: [{ distance: 10, weight: 100, mirror: true }] });
    eq(c.loads.length, 1, "centre not doubled");
  });
  test("coincident supports share the reaction", function () {
    var b = TLA.beam.solve({ length: 10, supports: [0, 0, 10], loads: [{ distance: 5, weight: 100 }] });
    near(b.reactions[0], 25, 1e-9); near(b.reactions[1], 25, 1e-9); near(b.reactions[2], 50, 1e-9);
  });
  test("hoist check uses static load for status", function () {
    var h = { weight_lb: 10, chain_weight_per_ft_lb: 1, speed_fpm: 16, capacity_lb: 1000 };
    var r = TLA.limits.checkHoist(h, 20, 900);
    near(r.staticLoad, 930, 1e-9); near(r.dynamicLoad, 930 * 1.25, 1e-9); eq(r.status, "Good");
    eq(TLA.limits.checkHoist(h, 20, 1000).status, "Overloaded");
    eq(TLA.limits.checkHoist(h, 20, -100).status, "No Load");
  });

  g.runTLATests = function () {
    var res = tests.map(function (t) {
      try { t.fn(); return { name: t.name, ok: true }; }
      catch (e) { return { name: t.name, ok: false, error: String(e.message || e) }; }
    });
    g.__results = res;
    return res;
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
