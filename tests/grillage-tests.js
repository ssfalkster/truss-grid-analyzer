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

  /* 1.4.0: reference values from PyNite 3.2 (the 3D frame engine behind CalcForge 3D), by tools/pynite_check.py on
   * this tool's own export of the same rig (Euler-Bernoulli, as PyNite has no shear deformation). They follow the
   * section estimate (section.js): if that changes on purpose, re-export and re-run the script. */
  var PYNITE = {
    box: { hinged: { "West@3": 159.21, "West@16": 33.05, "North@10.5": 303.12, "South@23.5": 275.73, "East@3": 121.23, "East@16": 50.05, "Inner W@15": 303.17, "Inner E@15": 181.14 },
      rigid: { "West@3": 157.65, "West@16": 36.87, "North@10.5": 304.64, "South@23.5": 276.78, "East@3": 119.91, "East@16": 53.06, "Inner W@15": 299.83, "Inner E@15": 178.28 } },
    noCarrier: { hinged: { "West@3": 320.65, "East@3": 320.0, "Inner W@15": 553.42, "Inner E@15": 451.27 },
      rigid: { "West@3": 314.18, "East@3": 313.48, "Inner W@15": 565.37, "Inner E@15": 465.31 } },
    // noCarrier with Inner W = JTE 20.5x20.5 Plated, North = JTE 12 Triangle, West = Tomcat 12x12 Spigoted, East = 1.5" pipe
    mixed: { hinged: { "West@3": 144.93, "West@16": 105.36, "West@29": 164.01, "East@3": 135.92, "East@29": 155.0, "Inner W@15": 1016.15, "Inner E@15": 661.08 },
      rigid: { "West@3": 208.98, "West@16": 61.55, "West@29": 231.0, "East@3": 210.61, "East@29": 226.77, "Inner W@15": 975.35, "Inner E@15": 468.19 } }
  };
  function againstPyNite(which) {
    var ex = TLA.grillage.exportModel(S.rig, S.results, S.db());
    ["hinged", "rigid"].forEach(function (m) {
      var exp = PYNITE[which][m];
      Object.keys(exp).forEach(function (k) {
        var h = hoistOf(k.split("@")[0], parseFloat(k.split("@")[1])), id = h.truss + ":" + h.support;
        near(ex.results[m].reactions[id], exp[k], 0.01, which + " " + k + " " + m);     // PyNite values are to 2 decimals
      });
    });
    return ex;
  }

  add("stiffness check: the example box agrees with PyNite (hinged and rigid joints), and balances", function () {
    S.newRig(); TLA.samples.box(S); S.commit();
    var r = S.results; eq(r.compat.ok, true, "check ran");
    againstPyNite("box");
    var sumH = r.hoists.reduce(function (t, h) { return t + h.compat.hinged - h.hoist.hoistChain; }, 0);
    near(sumH, r.totals.applied, 1e-6, "equilibrium: hoist reactions = everything applied");
  });

  add("stiffness check: a carrier with no hoist near the connection makes the load-path method under-estimate the inner hoists (agrees with PyNite)", function () {
    S.newRig(); TLA.samples.box(S);
    ["North", "South"].forEach(function (n) { var t = S.rig.trusses.filter(function (x) { return x.name === n; })[0]; t.supports = t.supports.filter(function (s) { return s.kind !== "hoist"; }); });
    S.commit();
    var iw = hoistOf("Inner W", 15), ie = hoistOf("Inner E", 15);
    near(iw.loadPath.reaction, 301.0, 0.2, "load-path Inner W"); near(ie.loadPath.reaction, 181.0, 0.2, "load-path Inner E");
    // 1.1.0: in this rig the West/East hoists at 16 ft would have to PUSH, so their chains go slack and are taken out
    eq(hoistOf("West", 16).slack, true, "West @16 slack"); eq(hoistOf("East", 16).slack, true, "East @16 slack");
    againstPyNite("noCarrier");
    // with shear deformation (1.4.0) the 30 ft trusses move only a little from the Euler-Bernoulli answer
    near(iw.compat.hinged - iw.hoist.hoistChain, 553.42, 0.02 * 553.42, "Inner W hinged, near PyNite's Euler-Bernoulli value");
    near(iw.compat.rigid - iw.hoist.hoistChain, 565.37, 0.02 * 565.37, "Inner W rigid");
    eq(iw.compat.higher, true, "flagged"); eq(ie.compat.higher, true, "flagged");
    eq(S.results.warnings.some(function (w) { return /whole-rig analysis, well above the load-path/.test(w.message); }), true, "a warning is raised");
  });

  add("stiffness check: mixed truss types (box, triangle, spigoted, pipe) agree with PyNite", function () {
    S.newRig(); TLA.samples.box(S);
    ["North", "South"].forEach(function (n) { var t = S.rig.trusses.filter(function (x) { return x.name === n; })[0]; t.supports = t.supports.filter(function (s) { return s.kind !== "hoist"; }); });
    var ids = { "Inner W": 49, "North": 46, "West": 75, "East": 113 };
    S.rig.trusses.forEach(function (t) { if (ids[t.name]) t.trussId = ids[t.name]; });
    S.commit();
    againstPyNite("mixed");
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
    eq(S.results.warnings.some(function (w) { return /slack/i.test(w.message); }), true, "warned");
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
    eq(S.results.warnings.some(function (w) { return /unstable/i.test(w.message) && w.truss === t.id; }), true, "load-path warning");
    eq(hoistOf("T", 20).hoist.status, "UNSTABLE", "the last hoist is not reported Good");
    eq(S.results.compat.ok, false, "no stiffness result"); eq(S.results.compat.unstable, true, "stiffness check flags it");
    eq(S.results.warnings.some(function (w) { return /Whole-rig analysis: Unstable/.test(w.message); }), true, "stiffness warning");
  });

  add("unstable: a truss on one hoist is a mechanism, not a structure (the solver's tiny twist stiffness must not hold it up)", function () {
    oneTruss(20, [5], [[15, 200]]);
    eq(S.results.compat.ok, false, "not solved"); eq(S.results.compat.unstable, true, "flagged");
  });

  add("unstable check: a very short element on a soft pipe does not make the pipe look like a mechanism (1.5.0)", function () {
    // 7 ft 1.5" pipe on two hoists, 500 lb at mid-span, Euler-Bernoulli (as exported to PyNite). A 0.002 ft stub at one
    // end is ~1e14 stiff; the twist stiffness used to be 1e-12 x that everywhere, held up the pipe and failed the leak check.
    function pipe(stub) {
      var nodes = [{ d: 0 }, { d: 3.5, P: 500 }].concat(stub ? [{ d: 6.998 }] : []).concat([{ d: 7 }]);
      return { beams: [{ t: { id: "p", name: "Pipe" }, c: 1, s: 0, L: 7, EI: 6.24e4, GA: Infinity, GJ: 4.82e4, w: 2.72, nodes: nodes }], links: [],
        supports: [{ b: 0, n: 0, id: "p:a" }, { b: 0, n: nodes.length - 1, id: "p:b" }] };
    }
    ["hinged", "rigid"].forEach(function (m) {
      var a = TLA.grillage.solveModel(pipe(true), m), b = TLA.grillage.solveModel(pipe(false), m);
      eq(a.ok, true, m + " with the stub solves"); eq(b.ok, true, m + " without");
      near(a.reactions["p:a"], 250 + 2.72 * 3.5, 1e-4, m + " reaction"); near(a.reactions["p:b"], b.reactions["p:b"], 1e-4, m + " stub changes nothing (to round-off: 1e14 costs digits)");
    });
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

  add("RMMS 3D grid example in Production Assist 1.13.10 (Derek Epstein, RMMS12 downloads, Calculations.pdf): same hoist loads from the same model", function () {
    // PA's model of the grid: 12x12 box as one beam (EN-AW-6082-T6, E 70000 MPa, G 27000 MPa, Iy 3118.87 cm4,
    // Ix 1130.16 cm4), no shear deformation, frames continuous through the corner blocks (rigid joints), nodes at
    // 120.75 in centres, 100.03 lbf/ft on every span, 300.10 lbf hung under the N3 corner block, weightless truss.
    // Each hoist hangs on a 352 in "StiffRope" element (A 10000 mm2, E 110000 MPa): a spring. Expected = PA's
    // "Motor force" (hook load, roof force less hoist weight), p. 6; PA's N1-N9 run 1 2 3 / 4 5 6 / 7 8 9.
    var MPA = 145.0377, CM4 = 1 / Math.pow(2.54, 4), s = 120.75 / 12;
    var EI = 70000 * MPA * 3118.87 * CM4 / 144, GJ = 27000 * MPA * 1130.16 * CM4 / 144;           // lb-ft2
    var k = (10000 / 645.16) * 110000 * MPA / 352 * 12;                                             // lb/ft
    var beams = [], links = [], supports = [];
    function beam(c, sn) { return { t: { name: "b" + beams.length }, c: c, s: sn, EI: EI, GJ: GJ, w: 100.03, L: 2 * s, nodes: [{ d: 0, P: 0 }, { d: s, P: 0 }, { d: 2 * s, P: 0 }] }; }
    for (var i = 0; i < 3; i++) beams.push(beam(1, 0));
    for (var j = 0; j < 3; j++) beams.push(beam(0, 1));
    beams[0].nodes[2].P = 300.10;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
      links.push({ a: i, na: j, b: 3 + j, nb: i, rigid: true });
      supports.push({ b: i, n: j, id: "N" + i + j, k: k });
    }
    var r = TLA.grillage.solveModel({ beams: beams, links: links, supports: supports }, true), R = r.reactions;
    eq(r.ok, true, "solved");
    var PA = { N02: 1057.81, N01: 1634.73, N12: 1634.73, N10: 1634.05, N21: 1634.05, N11: 2509.50, N00: 758.08, N22: 758.08, N20: 758.38 };
    // within 0.5 lb: PA also carries 0.21 lb of corner blocks and bolts, and prints to 2 decimals
    Object.keys(PA).forEach(function (id) { near(R[id], PA[id], 0.5, "PA " + id); });
    near(r.total, 12378.72, 0.01, "total");
    // PA's section is four 2 x 0.125 in chords 10 in apart - what section.js computes from the same chord sizes
    // (chord self-inertia left out: 1.7% less)
    var sec = TLA.section.estimate({ description: "12x12 box", section: { chordOD: 2, chordWall: 0.125, depthIn: 12, widthIn: 12 } });
    near(sec.EI * 144 / sec.E, 3118.87 * CM4, 0.02 * 3118.87 * CM4, "I of the chords vs PA's Iy");
  });

  /* ---------- 1.3.0: the stiffness solve is primary ---------- */

  function noCarrierHoists() {
    S.newRig(); TLA.samples.box(S);
    ["North", "South"].forEach(function (n) { var t = S.rig.trusses.filter(function (x) { return x.name === n; })[0]; t.supports = t.supports.filter(function (s) { return s.kind !== "hoist"; }); });
    S.commit();
  }
  function trussNamed(n) { return S.rig.trusses.filter(function (x) { return x.name === n; })[0]; }

  add("primary: hoist loads, status and totals come from the stiffness solve (worst of every joint model), load path kept for reference", function () {
    noCarrierHoists();
    var r = S.results; eq(r.primary, "grillage", "primary");
    eq(r.models.join(","), "hinged,semi1,semi4,semi16,rigid", "hinged, the semi-rigid sweep and rigid");
    var iw = hoistOf("Inner W", 15), all = r.models.map(function (m) { return iw.byModel[m].staticLoad; });
    near(iw.hoist.staticLoad, Math.max.apply(null, all), 1e-9, "governing = worst model");
    eq(iw.byModel[iw.model].staticLoad, iw.hoist.staticLoad, "model named");
    near(iw.compat.semiMax, Math.max(iw.byModel.semi1.staticLoad, iw.byModel.semi4.staticLoad, iw.byModel.semi16.staticLoad), 1e-9, "semi-rigid range");
    near(iw.loadPath.hoist.staticLoad - iw.loadPath.hoist.hoistChain, 301.0, 0.2, "load path kept");
    near(r.totals.staticLoad, r.hoists.reduce(function (t, h) { return t + h.hoist.staticLoad; }, 0), 1e-9, "totals from the governing loads");
    r.models.forEach(function (m) { near(r.totals.byModel[m] - r.totals.hoistChain, r.totals.applied, 1e-6, m + " totals balance"); });
    // the same record is what the plan, 3D view and support list read
    var sr = r.trusses[iw.truss].supports.filter(function (x) { return x.support.id === iw.support; })[0];
    eq(sr.hoist, iw.hoist, "support record shares the governing check");
  });

  add("primary: every truss is in equilibrium under its stiffness-solve loads (hoists + bolted connection forces = its loads)", function () {
    ["box", "carrier"].forEach(function (which) {
      if (which === "box") { S.newRig(); TLA.samples.box(S); S.rig.trusses.forEach(function (t) { (t.supports || []).forEach(function (s) { if (s.kind === "truss") s.hardwareWeight = 7; }); }); S.commit(); }
      else noCarrierHoists();
      var r = S.results; eq(r.primary, "grillage", which + " primary");
      S.rig.trusses.forEach(function (t) {
        var res = r.trusses[t.id]; if (t.isBlock || !res.byModel) return;
        r.models.forEach(function (m) {
          var up = res.supports.reduce(function (a, sr) { return a + sr.byModel[m]; }, 0);
          near(up, res.byModel[m].beam.totalLoad, 1e-6, which + " " + t.name + " " + m);
        });
      });
      eq(r.warnings.some(function (w) { return w.level === "internal"; }), false, which + ": no self-check warnings");
    });
  });

  add("primary: span checks on a carrier use the connection forces from the stiffness solve", function () {
    noCarrierHoists();
    var n = trussNamed("North"), res = S.results.trusses[n.id];
    eq(res.injected.length > 0, true, "North carries bolted trusses");
    var lp = res.loadPath.injected.reduce(function (a, l) { return a + l.weight; }, 0), gr = res.injected.reduce(function (a, l) { return a + l.weight; }, 0);
    eq(Math.abs(gr - lp) > 1, true, "different from the load path (" + gr + " vs " + lp + ")");
    var segLoads = res.limits.segments.filter(function (s) { return !s.skipped; }).reduce(function (a, s) { return a + (s.type === "span" ? s.load : s.load - res.beam.wDist * s.length); }, 0);
    near(segLoads, res.beam.loads.reduce(function (a, l) { return a + l.weight; }, 0), 1e-6, "span and cantilever loads add up to every point load on the truss (" + res.model + ")");
  });

  add("primary: member forces - a simple span and a two-span continuous truss match beam theory", function () {
    S.newRig();
    var t = S.addTruss({ name: "S", x: 0, y: 0, angle: 30, length: 20, hoists: [0, 20] });
    t.weightless = true; t.loads.push({ id: S.newId("l"), distance: 10, weight: 400 }); S.commit();
    var f = S.results.trusses[t.id].memberForces;
    ["hinged", "rigid"].forEach(function (m) { near(f[m].maxSag, 400 * 20 / 4, 1e-4, m + " PL/4"); near(f[m].maxShear, 200, 1e-4, m + " P/2"); near(f[m].maxHog, 0, 1e-4, m + " no hogging"); });
    S.newRig();
    var c = S.addTruss({ name: "C", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 10, 20] });
    c.weightless = true; c.wallWeight = 20 * 50; S.commit();                  // 50 lb/ft over two 10 ft spans
    var g = S.results.trusses[c.id].memberForces.rigid, bm = S.results.compat.model.beams[0];
    // Timoshenko (1.4.0): with phi = 12 EI / (GA L^2) the middle hoist takes wL (5 + phi) / (4 + phi); phi = 0 gives the
    // textbook wL^2/8, 9/128 wL^2 and 5/8 wL
    var w = 50, L = 10, phi = 12 * bm.EI / (bm.GA * L * L), Rend = w * L * (3 + phi) / (2 * (4 + phi));
    eq(phi > 0.1, true, "shear deformation is significant on 10 ft spans (phi " + phi + ")");
    near(g.maxHog, w * L * L / (2 * (4 + phi)), 1e-6, "hogging over the middle hoist"); near(g.atHog, 10, 1e-9, "at the middle");
    near(g.maxSag, Rend * Rend / (2 * w), 1e-6, "span peak"); near(g.maxShear, w * L - Rend, 1e-6, "shear at the middle hoist");
  });

  add("primary: a rigid corner block carries moment across the joint (the moment diagram jumps there), a hinged one doesn't", function () {
    S.newRig(); TLA.samples.box(S); S.commit();
    function jumps(m) {
      var n = 0;
      S.rig.trusses.forEach(function (t) { var f = S.results.trusses[t.id].memberForces; if (f && f[m]) f[m].points.forEach(function (p) { if (p.jump) n++; }); });
      return n;
    }
    eq(jumps("rigid") > 0, true, "rigid model has moment jumps at blocks");
    eq(jumps("hinged"), 0, "hinged model: no moment through the joints");
  });

  add("primary: a hoist's load breakdown adds up to its stiffness-solve reaction", function () {
    noCarrierHoists();
    ["Inner W@15", "West@3"].forEach(function (k) {
      var h = hoistOf(k.split("@")[0], parseFloat(k.split("@")[1])), a = TLA.grillage.attribution(S.rig, S.results, S.db(), h.truss, h.support);
      eq(a.model, h.model, "breakdown uses the governing model");
      near(a.parts.reduce(function (s, p) { return s + p.weight; }, 0), h.reaction, 1e-6, k + " parts sum");
      eq(a.parts.length > 1, true, k + " more than one truss contributes");
    });
  });

  add("primary: falls back to the load path, with a warning, when the stiffness solve can't run", function () {
    S.newRig();
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 20, hoists: [0] }), b = S.addTruss({ name: "B", x: 0, y: 5, angle: 0, length: 20, hoists: [20] });
    a.supports.push({ id: S.newId("s"), kind: "truss", distance: 20, onTruss: b.id, onDistance: 20 });
    b.supports.push({ id: S.newId("s"), kind: "truss", distance: 0, onTruss: a.id, onDistance: 0 });
    S.commit();
    eq(S.results.unsolved.length > 0, true, "a load-path loop");
    eq(S.results.primary, "load-path", "primary");
    eq(S.results.warnings.some(function (w) { return w.level === "fallback"; }), true, "fallback warning");
  });
  add("primary: the moment/shear check uses the stiffness solve's diagrams (with self weight by default, net when turned off); a lone truss matches the load path", function () {
    noCarrierHoists();
    var n = 0;
    S.rig.trusses.forEach(function (t) {
      var res = S.results.trusses[t.id]; if (t.isBlock || !res.model) return;
      eq(res.limits.member.diagram, res.memberForces[res.model], t.name + ": full diagram from the stiffness solve"); n++;
    });
    eq(n > 0, true, "checked some trusses");
    // statically determinate: exactly the load path
    S.newRig();
    var t = S.addTruss({ name: "L", x: 0, y: 0, angle: 45, length: 30, hoists: [0, 24] });
    t.loads.push({ id: S.newId("l"), distance: 5, weight: 300 }, { id: S.newId("l"), distance: 20, weight: 500 }, { id: S.newId("l"), distance: 28, weight: 100 }); S.commit();
    var res = S.results.trusses[t.id], a = res.limits.member, b = res.loadPath.limits.member;
    near(a.moment, b.moment, 1e-6 * b.moment, "moment (self weight in both)"); near(a.shear, b.shear, 1e-6 * b.shear, "shear");
    eq(a.checked, a.diagram, "default (1.18.0): self weight counted, the full diagram is checked");
    near(a.momentAllowed, b.momentAllowed, 1e-9, "same allowable (self weight added back) in both");
    S.rig.settings.cantileverSelfWeight = false; S.commit();
    res = S.results.trusses[t.id]; a = res.limits.member; b = res.loadPath.limits.member;
    near(a.moment, b.moment, 1e-6 * b.moment, "moment (self weight left out in both)"); near(a.shear, b.shear, 1e-6 * b.shear, "shear");
    eq(a.checked === a.diagram, false, "turned off: a separate net-of-self-weight diagram");
    // continuous: the load path has no shear deformation, so it is close but not equal
    S.newRig();
    t = S.addTruss({ name: "L", x: 0, y: 0, angle: 45, length: 30, hoists: [0, 12, 30] });
    t.loads.push({ id: S.newId("l"), distance: 5, weight: 300 }, { id: S.newId("l"), distance: 20, weight: 500 }); S.commit();
    res = S.results.trusses[t.id]; a = res.limits.member; b = res.loadPath.limits.member;
    near(a.moment, b.moment, 0.05 * b.moment, "moment within 5% of the three-moment answer"); near(a.shear, b.shear, 0.05 * b.shear, "shear");
  });

  /* 1.18.0: deflected shape from the whole-rig analysis, against the textbook simple-span formulas (Timoshenko:
   * bending + shear). The shape is output only - it must not move any reaction. */
  function oneSpan(opts) {
    S.newRig();
    var t = S.addTruss({ name: "D", length: 20, hoists: [0, 20] });
    t.weightless = !!opts.weightless; t.loads = opts.loads || []; S.commit();
    var res = S.results.trusses[t.id], m = res.model, d = res.memberForces[m].defl, sec = res.section;
    var mid = d.filter(function (p) { return Math.abs(p[0] - 10) < 1e-9; })[0];
    return { t: t, res: res, mid: mid, d: d, EI: sec.EI, GA: sec.GA };
  }
  add("deflection: point load at midspan of a weightless span = PL^3/48EI + PL/4GA, zero at the hoists", function () {
    var o = oneSpan({ weightless: true, loads: [{ id: "l1", distance: 10, weight: 500, note: "P", mirror: false }] });
    eq(S.results.primary, "grillage", "whole-rig analysis ran");
    var P = 500, L = 20, exp = P * L * L * L / (48 * o.EI) + P * L / (4 * o.GA);
    near(-o.mid[1], exp, 1e-6 * exp + 1e-12, "midspan sag (ft)");
    near(o.d[0][1], 0, 1e-12, "at the start hoist"); near(o.d[o.d.length - 1][1], 0, 1e-12, "at the end hoist");
  });
  add("deflection: truss self weight on a simple span = 5wL^4/384EI + wL^2/8GA", function () {
    var o = oneSpan({}), w = o.res.dbTruss.weight_per_ft_lb, L = 20;
    var exp = 5 * w * Math.pow(L, 4) / (384 * o.EI) + w * L * L / (8 * o.GA);
    near(-o.mid[1], exp, 1e-6 * exp, "midspan sag (ft)");
    o.d.forEach(function (p) { if (p[1] > 1e-12) throw new Error("a simple span only sags: " + p); });
  });
  add("deflection limit: maker's published ratio where there is one, else the rig default", function () {
    var db = TLA.data.trusses, lim = TLA.limits.deflectionLimit;
    var tom = db.filter(function (x) { return x.manufacturer === "Tomcat" && x.source === "MFG"; })[0];
    eq(lim(tom, {}).ratio, 100, "Tomcat L/100"); eq(lim(tom, {}).source, "maker");
    var gal = db.filter(function (x) { return x.manufacturer === "JTE" && /Galaxy 240/.test(x.description); })[0];
    eq(lim(gal, {}).ratio, 160, "JTE Galaxy L/160");
    var gp = db.filter(function (x) { return x.manufacturer === "JTE" && x.description === "General Purpose 12x12"; })[0];
    eq(lim(gp, {}).source, "default", "JTE GP 12x12 states no limit"); eq(lim(gp, {}).ratio, 160, "default L/160");
    eq(lim(gp, { deflectionLimit: 240 }).ratio, 240, "rig default");
  });
  add("deflection check: past the rig default it is a warning only, hoist statuses unchanged", function () {
    var o = oneSpan({ loads: [{ id: "l1", distance: 10, weight: 900, note: "P", mirror: false }] });
    var dc = o.res.deflection, sp = dc.spans[0];
    near(sp.max, -o.mid[1], 1e-9, "span sag = midspan sag (hoists do not move)");
    near(sp.allowed, 20 / dc.ratio, 1e-12, "allowed = span / ratio");
    S.rig.settings.deflectionLimit = 100000; S.commit();
    var tight = S.results.warnings.filter(function (w) { return w.kind === "deflection"; }).length;
    eq(tight, 1, "flagged at L/100000");
    var before = S.results.hoists.map(function (h) { return h.hoist.status; }).join();
    S.rig.settings.deflectionLimit = 10; S.commit();
    eq(S.results.warnings.filter(function (w) { return w.kind === "deflection"; }).length, 0, "not flagged at L/10");
    eq(S.results.hoists.map(function (h) { return h.hoist.status; }).join(), before, "hoist statuses unchanged");
  });
  add("deflection check: past the maker's published limit the truss fails (Tomcat L/100)", function () {
    S.newRig();
    var tom = TLA.data.trusses.filter(function (x) { return x.manufacturer === "Tomcat" && x.source === "MFG"; })[0];
    var t = S.addTruss({ name: "D", length: 20, hoists: [0, 20], trussId: tom.id });
    t.loads = [{ id: "l1", distance: 10, weight: 50, note: "P", mirror: false }]; S.commit();
    var res = S.results.trusses[t.id];
    eq(res.deflection.source, "maker"); eq(res.deflection.ratio, 100);
    var ok = TLA.plan.trussStatus(res).bad;
    // scale the truss's stiffness down until the span sags past L/100, with the same load
    t.eiScale = 0.0005; S.commit(); res = S.results.trusses[t.id];
    eq(res.deflection.fail, true, "past L/100");
    eq(TLA.plan.trussStatus(res).bad, true, "truss fails");
    eq(S.results.warnings.some(function (w) { return w.kind === "deflection" && /Overloaded/.test(w.message); }), true, "warning says Overloaded");
    eq(ok, false, "and it passed before");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
