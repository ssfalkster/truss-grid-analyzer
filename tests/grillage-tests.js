/* Stiffness check (grillage FEM) against an independent NumPy implementation (tools: box_study.py) and basic sanity. */
(function (g) {
  var TLA = g.TLA, S = TLA.store, add = g.__addTLATest;
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function hoistOf(name, d) {
    var r = S.results, h = r.hoists.filter(function (x) { return x.trussName === name && Math.abs(x.distance - d) < 0.01; })[0];
    if (!h) throw new Error("no hoist " + name + " @" + d);
    return h;
  }

  add("stiffness check: example box agrees with the NumPy grillage model (hinged and rigid joints)", function () {
    S.newRig(); TLA.samples.box(S); S.commit();
    var r = S.results; eq(r.compat.ok, true, "check ran");
    // NumPy results, GJ/EI = 0.3, hoist weights excluded (reaction only)
    var expect = { "West@3": [159.2, 155.5], "West@16": [33.0, 42.2], "North@10.5": [303.1, 306.7], "South@23.5": [275.7, 278.3], "Inner W@15": [303.2, 295.3], "Inner E@15": [181.1, 174.2], "East@29": [121.2, 118.1] };
    Object.keys(expect).forEach(function (k) {
      var nm = k.split("@")[0], d = parseFloat(k.split("@")[1]), h = hoistOf(nm, d), chain = h.hoist.hoistChain;
      near(h.compat.hinged - chain, expect[k][0], 0.25, k + " hinged"); near(h.compat.rigid - chain, expect[k][1], 0.25, k + " rigid");
    });
    var sumH = r.hoists.reduce(function (t, h) { return t + h.compat.hinged - h.hoist.hoistChain; }, 0);
    near(sumH, r.totals.applied, 1e-6, "equilibrium: hoist reactions = everything applied");
  });

  add("stiffness check: a carrier with no hoist near the connection makes the load-path method under-estimate the inner hoists", function () {
    S.newRig(); TLA.samples.box(S);
    ["North", "South"].forEach(function (n) { var t = S.rig.trusses.filter(function (x) { return x.name === n; })[0]; t.supports = t.supports.filter(function (s) { return s.kind !== "hoist"; }); });
    S.commit();
    var iw = hoistOf("Inner W", 15), ie = hoistOf("Inner E", 15), we = hoistOf("West", 3);
    near(iw.reaction, 301.0, 0.2, "load-path Inner W (NumPy input)"); near(ie.reaction, 181.0, 0.2, "load-path Inner E");
    near(iw.compat.hinged - iw.hoist.hoistChain, 547.8, 0.5, "Inner W hinged"); near(iw.compat.rigid - iw.hoist.hoistChain, 578.2, 0.5, "Inner W rigid");
    near(ie.compat.hinged - ie.hoist.hoistChain, 446.0, 0.5, "Inner E hinged"); near(ie.compat.rigid - ie.hoist.hoistChain, 480.7, 0.5, "Inner E rigid");
    near(we.compat.hinged - we.hoist.hoistChain, 349.6, 0.5, "West @3 hinged");
    eq(iw.compat.higher, true, "flagged"); eq(ie.compat.higher, true, "flagged");
    eq(S.results.warnings.some(function (w) { return /stiffness check/.test(w.message); }), true, "a warning is raised");
  });

  add("stiffness check: a single truss on two hoists changes nothing", function () {
    S.newRig();
    var t = S.addTruss({ name: "One", x: 0, y: 0, angle: 0, length: 20, hoists: [3, 17] });
    t.loads.push({ id: S.newId("l"), distance: 8, weight: 100 }); S.commit();
    S.results.hoists.forEach(function (h) { eq(h.compat.higher, false, "not flagged"); near(h.compat.hinged, h.hoist.staticLoad, 1e-4, "same as statics"); near(h.compat.rigid, h.hoist.staticLoad, 1e-4, "same as statics (rigid)"); });
  });

  add("stiffness check: continuous beam on three hoists agrees with the three-moment engine", function () {
    S.newRig();
    var t = S.addTruss({ name: "Cont", x: 0, y: 0, angle: 0, length: 40, hoists: [0, 20, 40] });
    t.loads.push({ id: S.newId("l"), distance: 10, weight: 200 }); S.commit();
    S.results.hoists.forEach(function (h) { near(h.compat.hinged, h.hoist.staticLoad, 1e-3, "hoist @" + h.distance); });
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
