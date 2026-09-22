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
    // NumPy results, GJ/EI = 0.15 (this truss type is bolted/plated), hoist weights excluded (reaction only)
    var expect = { "West@3": [159.2, 157.1], "West@16": [33.0, 38.2], "North@10.5": [303.1, 305.2], "South@23.5": [275.7, 277.2], "Inner W@15": [303.2, 298.7], "Inner E@15": [181.1, 177.2], "East@29": [121.2, 119.4] };
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
    near(iw.compat.hinged - iw.hoist.hoistChain, 547.8, 0.5, "Inner W hinged"); near(iw.compat.rigid - iw.hoist.hoistChain, 565.9, 0.5, "Inner W rigid");
    near(ie.compat.hinged - ie.hoist.hoistChain, 446.0, 0.5, "Inner E hinged"); near(ie.compat.rigid - ie.hoist.hoistChain, 466.3, 0.5, "Inner E rigid");
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

  add("stiffness estimate: connector type (plated vs spigoted vs pipe) from the catalog description", function () {
    var ct = TLA.grillage.connectorType;
    eq(ct('12"x12" A Type Bolted'), "plated", "Christie A - bolted");
    eq(ct('16"x16" B Type Spigoted'), "spigot", "Christie B - spigoted");
    eq(ct('SuperTruss 12 x 12'), "spigot", "JTE SuperTruss line is spigoted");
    eq(ct('12x12 Stl Frk Utiil'), "spigot", "steel fork = spigoted");
    eq(ct('1.5" Steel Schedule 40 Pipe'), "pipe", "pipe");
    eq(ct('Galaxy 240'), "plated", "no connector wording falls back to the more flexible (plated) assumption");
  });

  add("stiffness estimate: a spigoted truss of the same size is stiffer in bending, both are stiffer in torsion than the flat 0.3x used before, pipe stiffest in torsion", function () {
    var plated = { description: "12x12 Plated" }, spigot = { description: "12x12 Spigoted" }, pipe = { description: '1.5" Steel Schedule 40 Pipe' };
    var ep = TLA.grillage.estimateStiffness(plated, {}), es = TLA.grillage.estimateStiffness(spigot, {}), pp = TLA.grillage.estimateStiffness(pipe, {});
    near(es.EI / ep.EI, 1.5, 1e-9, "spigoted bending bonus");
    near(ep.GJ / ep.EI, 0.15, 1e-9, "plated GJ/EI");
    near(es.GJ / es.EI, 0.4, 1e-9, "spigoted GJ/EI");
    near(pp.GJ / pp.EI, 0.75, 1e-9, "pipe GJ/EI");
    var scaled = TLA.grillage.estimateStiffness(plated, { eiScale: 2 });
    near(scaled.EI, ep.EI * 2, 1e-6, "eiScale scales EI"); near(scaled.GJ, ep.GJ * 2, 1e-6, "and GJ, by the same factor");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
