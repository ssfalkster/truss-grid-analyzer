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
    // 1.1.0: in this rig the West/East hoists at 16 ft would have to PUSH (the NumPy reference let them), so their
    // chains go slack and are taken out. Values below equal the same rig with those two hoists deleted by hand.
    eq(hoistOf("West", 16).slack, true, "West @16 slack"); eq(hoistOf("East", 16).slack, true, "East @16 slack");
    near(iw.compat.hinged - iw.hoist.hoistChain, 553.4, 0.5, "Inner W hinged"); near(iw.compat.rigid - iw.hoist.hoistChain, 569.0, 0.5, "Inner W rigid");
    near(ie.compat.hinged - ie.hoist.hoistChain, 451.3, 0.5, "Inner E hinged"); near(ie.compat.rigid - ie.hoist.hoistChain, 469.8, 0.5, "Inner E rigid");
    near(we.compat.hinged - we.hoist.hoistChain, 320.6, 0.5, "West @3 hinged");
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

  /* ---------- 1.1.0: tension-only hoists, instability, hardware weight, equilibrium ---------- */

  function oneTruss(len, hoists, loads) {
    S.newRig();
    var t = S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: len, hoists: hoists });
    t.weightless = true;
    loads.forEach(function (l) { t.loads.push({ id: S.newId("l"), distance: l[0], weight: l[1] }); });
    S.commit();
    return t;
  }

  add("slack hoist: two spans, load in the first - the far hoist would push, so its chain goes slack (500 / 500 / slack)", function () {
    // elastic answer with a hoist that could push: 406 / 688 / -94 lb
    oneTruss(20, [0, 10, 20], [[5, 1000]]);
    var h0 = hoistOf("T", 0), h1 = hoistOf("T", 10), h2 = hoistOf("T", 20);
    near(h0.reaction, 500, 1e-6, "first"); near(h1.reaction, 500, 1e-6, "middle");
    eq(h2.slack, true, "far hoist slack"); eq(h2.reaction, 0, "slack carries nothing"); eq(h2.hoist.status, "Slack", "status");
    near(h2.hoist.staticLoad, h2.hoist.hoistChain, 1e-9, "only hoist + chain weight");
    eq(S.results.unstable.length, 0, "still stable");
    eq(S.results.warnings.some(function (w) { return /SLACK/.test(w.message); }), true, "warned");
    // the stiffness check agrees (a single truss is the same problem)
    near(h0.compat.hinged - h0.hoist.hoistChain, 500, 1e-3, "grillage first"); near(h1.compat.rigid - h1.hoist.hoistChain, 500, 1e-3, "grillage middle");
    eq(h2.compat.slackHinged && h2.compat.slackRigid, true, "grillage slack too");
    // with the slack hoist out, the span check sees one 10 ft span and a 10 ft cantilever, not two spans
    var segs = S.results.trusses[S.rig.trusses[0].id].limits.segments.filter(function (s) { return !s.skipped; });
    eq(segs.map(function (s) { return s.type; }).join(","), "span,cantilever-right", "segments");
  });

  add("unstable: a heavy cantilever lifts the middle hoist, then the end hoist - the truss would tip, and both solvers say so", function () {
    // 30 ft truss on hoists at 0/10/20, 1000 lb at the 30 ft tip: elastic 250 / -1500 / 2250; middle out -> -500 / 1500
    var t = oneTruss(30, [0, 10, 20], [[30, 1000]]);
    eq(S.results.unstable.indexOf(t.id) >= 0, true, "load path flags the truss");
    eq(S.results.warnings.some(function (w) { return /UNSTABLE/.test(w.message) && w.truss === t.id; }), true, "load-path warning");
    eq(hoistOf("T", 20).hoist.status, "UNSTABLE", "the last hoist is not reported Good");
    eq(S.results.compat.ok, false, "no stiffness result"); eq(S.results.compat.unstable, true, "stiffness check flags it");
    eq(S.results.warnings.some(function (w) { return /Stiffness check: UNSTABLE/.test(w.message); }), true, "stiffness warning");
  });

  add("unstable: a truss on one hoist is a mechanism, not a structure (the solver's tiny twist stiffness must not hold it up)", function () {
    oneTruss(20, [5], [[15, 200]]);
    eq(S.results.compat.ok, false, "not solved"); eq(S.results.compat.unstable, true, "flagged");
  });

  add("slack hoists: the load breakdown of a hoist still adds up to its reaction", function () {
    oneTruss(20, [0, 10, 20], [[5, 1000]]);
    var t = S.rig.trusses[0], h = hoistOf("T", 10), a = TLA.rig.attribution(S.rig, S.db(), t.id, h.support);
    near(a.parts.reduce(function (s, p) { return s + p.weight; }, 0), h.reaction, 1e-6, "parts sum");
  });

  add("stiffness check carries exactly the load-path total, including bolted-connection hardware and corner blocks, and balances", function () {
    S.newRig(); TLA.samples.box(S);
    var n = 0;
    S.rig.trusses.forEach(function (t) { (t.supports || []).forEach(function (s) { if (s.kind === "truss") { s.hardwareWeight = 12.5; n++; } }); });
    S.commit();
    eq(n > 0, true, "the example box has bolted connections");
    var c = S.results.compat;
    eq(c.ok, true, "ran");
    near(c.load, S.results.totals.applied, 1e-6, "same total as the load-path solve (1.0.0 dropped the hardware)");
    near(c.hinged.equilibriumError, 0, 1e-6 * c.load, "hinged balances"); near(c.rigid.equilibriumError, 0, 1e-6 * c.load, "rigid balances");
    eq(S.results.warnings.some(function (w) { return w.level === "internal"; }), false, "no self-check warnings");
  });

  add("RMMS 3D grid example (CalcForge 3D frame): 3 x 3 grid at 10 ft, 100 lb/ft on every span, 300 lb at a corner", function () {
    // Book answer: corners 750 (the loaded one 1050), edge midpoints 1625, centre 2500. Every node is a pinned hoist.
    var beams = [], links = [], supports = [], EI = 1e6, GJ = 3e5;
    function beam(c, s) { return { t: { name: "b" + beams.length }, c: c, s: s, EI: EI, GJ: GJ, w: 100, L: 20, nodes: [{ d: 0, P: 0 }, { d: 10, P: 0 }, { d: 20, P: 0 }] }; }
    for (var i = 0; i < 3; i++) beams.push(beam(1, 0));      // rows: along x at z = 0, 10, 20
    for (var j = 0; j < 3; j++) beams.push(beam(0, 1));      // columns: along z at x = 0, 10, 20
    beams[0].nodes[2].P = 300;                               // one corner node (x = 20, z = 0); the book loads its corner N3
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {         // row i node j is column j node i
      links.push({ a: i, na: j, b: 3 + j, nb: i, rigid: true });
      supports.push({ b: i, n: j, id: "N" + i + j });
    }
    [false, true].forEach(function (rigid) {
      var r = TLA.grillage.solveModel({ beams: beams, links: links, supports: supports }, rigid), R = r.reactions;
      eq(r.ok, true, "solved");
      near(R.N00, 750, 1e-4, "corner"); near(R.N20, 750, 1e-4, "corner"); near(R.N22, 750, 1e-4, "corner"); near(R.N02, 1050, 1e-4, "loaded corner");
      ["N01", "N10", "N12", "N21"].forEach(function (k) { near(R[k], 1625, 1e-4, "edge " + k); });
      near(R.N11, 2500, 1e-4, "centre"); near(r.total, 12300, 1e-4, "total");
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
