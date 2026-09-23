/* 1.4.0: section properties from the tables, Timoshenko beams, hoist trim, hoist springs, semi-rigid corner blocks.
 * Closed-form beam results are used wherever one exists. */
(function (g) {
  var TLA = g.TLA, S = TLA.store, add = g.__addTLATest;
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function entry(id) { return TLA.data.trusses.filter(function (x) { return x.id === id; })[0]; }
  function est(e, t) { return TLA.section.estimate(e, t || {}); }
  function inIn2(r) { return r.EI * 144; }                     // lb-ft2 -> lb-in2
  function tube(od, wall) { var id = od - 2 * wall; return Math.PI / 4 * (od * od - id * id); }
  function hoistOf(name, d) { return S.results.hoists.filter(function (x) { return x.trussName === name && Math.abs(x.distance - d) < 0.01; })[0]; }

  /* ---------- section properties ---------- */

  add("section: EI from the table moment, calibrated on a 20.5 in box (2 x 0.125 in chords at 18.5 in, about 2.5e9 lb-in2)", function () {
    var r = est(entry(49));                                    // JTE 20.5x20.5 Plated, table moment 14,350 lb-ft
    eq(r.source, "tables", "estimated from the tables"); eq(r.shape, "box", "box");
    near(r.tableMoment, 14350, 1, "table moment");
    near(inIn2(r), 1e7 * 14350 * 12 * 9.25 / 6200, 1, "EI = E M c / sigma");
    near(r.chordArea, tube(2, 0.125), 0.03, "equivalent chord area is a 2 x 0.125 in tube");
    eq(inIn2(r) > 2.3e9 && inIn2(r) < 2.8e9, true, "near the Lesson 21 anchor");
  });

  add("section: the same calibration gives 16 in and 12 in boxes within 10% of their chord-based EI (stiffness goes with about depth^2, not depth^3)", function () {
    var chord = function (depth) { var hc = depth - 2; return 1e7 * tube(2, 0.125) * hc * hc; };
    var r16 = est(entry(17)), r12 = est(entry(44));            // XSF 16x16 Plt Util, JTE 12x12 Plated
    near(inIn2(r16) / chord(16), 1, 0.1, "16 in"); near(inIn2(r12) / chord(12), 1, 0.1, "12 in");
    var a = est({ description: "12x12", section: { chordOD: 2, chordWall: 0.125 } }), b = est({ description: "20.5x20.5", section: { chordOD: 2, chordWall: 0.125 } });
    near(a.EI / b.EI, Math.pow(10 / 18.5, 2), 1e-12, "same chords: EI scales with chord spacing squared");
  });

  add("section: real chord and diagonal sizes replace the estimate (box: EI, GA from the two side faces, GJ from the closed cell)", function () {
    var e = { description: "20.5x20.5 Plated", section: { chordOD: 2, chordWall: 0.125, diagOD: 1, diagWall: 0.083, panelIn: 18.5 } };
    var r = est(e), Ac = tube(2, 0.125), Ad = tube(1, 0.083), hc = 18.5, a = Math.atan2(hc, 18.5), gf = 1e7 * Ad * Math.sin(a) * Math.sin(a) * Math.cos(a);
    eq(r.source, "section", "from section data");
    near(inIn2(r), 1e7 * Ac * hc * hc, 1, "EI = E x 4 chords x (hc/2)^2");
    near(r.GA, 2 * gf, 1e-6, "GA = two vertical faces");
    near(r.GJ * 144, hc * hc * gf, 1, "GJ of a square cell = b^2 x face GA");
    eq(r.GA > 1e6 && r.GA < 2e6, true, "GA about 1.2-1.7e6 lb, as in the engineering notes");
  });

  add("section: triangle, pipe, steel, and names without a size", function () {
    var tri = est(entry(46)), hc = 10, box = est(entry(44));   // JTE 12 Triangle Plated, JTE 12x12 Plated
    eq(tri.shape, "triangle", "triangle"); eq(box.shape, "box", "box");
    near(tri.GJ * 144 / tri.GA, hc * hc / 6, 1e-9, "triangle: GJ / GA = b^2 / 6 (closed cell / two sloping faces)");
    near(box.GJ * 144 / box.GA, hc * hc / 2, 1e-9, "square box: GJ / GA = b^2 / 2");
    var pipe = est(entry(113));                                // 1.5" schedule 40 steel pipe: OD 1.9, wall 0.145
    eq(pipe.shape, "pipe", "pipe"); eq(pipe.material, "steel", "steel");
    near(inIn2(pipe), 29e6 * Math.PI / 64 * (Math.pow(1.9, 4) - Math.pow(1.61, 4)), 1, "pipe EI from its real section");
    eq(est(entry(2)).material, "steel", "12\" Stl Fork Tri is steel"); eq(est(entry(3)).material, "aluminum", "Al fork is aluminium");
    var gx = est(entry(56));                                   // JTE Galaxy 240: no size in the name
    eq(gx.depthIn, 20.5, "a 20.5 in box is assumed, not a 240 in one"); eq(gx.notes.some(function (n) { return /size not in the description/.test(n); }), true, "and it says so");
    near(est(entry(98)).depthIn, 20, 1e-9, "20,5x20 (decimal comma) is 20 deep");
  });

  add("section: Stiffness (x) scales EI, GA and GJ together", function () {
    var a = est(entry(49)), b = est(entry(49), { eiScale: 2 });
    near(b.EI, 2 * a.EI, 1e-6, "EI"); near(b.GA, 2 * a.GA, 1e-6, "GA"); near(b.GJ, 2 * a.GJ, 1e-6, "GJ");
  });

  /* ---------- Timoshenko beam element ---------- */

  function oneBeam(EI, GA, L, nodes, supports) {
    return { beams: [{ t: { id: "b", name: "b" }, c: 1, s: 0, L: L, EI: EI, GA: GA, GJ: EI / 10, w: 0, nodes: nodes }], links: [], supports: supports };
  }

  add("Timoshenko: centre deflection of a simple span = PL^3/48EI + PL/4GA (and Euler-Bernoulli when GA is infinite)", function () {
    [[5e4, 1000 * 8000 / 48e6 + 1000 * 20 / 2e5], [Infinity, 1000 * 8000 / 48e6]].forEach(function (c) {
      var m = oneBeam(1e6, c[0], 20, [{ d: 0, P: 0 }, { d: 10, P: 1000 }, { d: 20, P: 0 }], [{ b: 0, n: 0, id: "a" }, { b: 0, n: 2, id: "c" }]);
      var r = TLA.grillage.solveModel(m, "hinged");
      near(-r.U[r.dofs[0][1][0]], c[1], 1e-9, "deflection, GA " + c[0]);
      near(r.reactions.a, 500, 1e-9, "statics");
    });
  });

  add("Timoshenko: two equal spans under uniform load - middle hoist wL (5 + phi) / (4 + phi)", function () {
    S.newRig();
    var t = S.addTruss({ name: "C", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 10, 20] });
    t.weightless = true; t.wallWeight = 1000; S.commit();
    var bm = S.results.compat.model.beams[0], phi = 12 * bm.EI / (bm.GA * 100), mid = hoistOf("C", 10);
    near(mid.reaction, 500 * (5 + phi) / (4 + phi), 1e-6, "middle (phi " + phi.toFixed(3) + ")");
    near(mid.loadPath.reaction, 625, 1e-6, "the three-moment load path has no shear deformation: 5/4 wL");
  });

  /* ---------- trim ---------- */

  add("trim: middle hoist of two 10 ft spans raised 1/4 in - it picks up 1/(L^3/6EI + L/2GA) x 1/4 in, each end loses half", function () {
    S.newRig();
    S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 10, 20] }); S.commit();
    var bm = S.results.compat.model.beams[0], L = 10, f = L * L * L / (6 * bm.EI) + L / (2 * bm.GA), mid = hoistOf("T", 10);
    // (to 1e-7: the solver's tiny twist stiffness)
    near(mid.trim.self, (1 / 48) / f, 1e-7 * mid.trim.self, "raised hoist");
    near(mid.trim.other.lb, -(1 / 48) / f / 2, 1e-7 * mid.trim.self, "an end hoist");
    var end = hoistOf("T", 0), fe = 8 * L * L * L / (48 * bm.EI) + 2 * L / (4 * bm.GA);
    near(end.trim.self, (1 / 48) / (4 * fe), 1e-7 * mid.trim.self, "an end hoist raised: 1/4 of the middle's stiffness x 1/4 in");
    eq(S.results.warnings.some(function (w) { return w.level === "trim" && /trim-sensitive/.test(w.message); }), true, "short stiff spans warn about trim");
  });

  add("trim: long flexible spans are not trim-sensitive", function () {
    S.newRig();
    S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 80, hoists: [0, 40, 80] }); S.commit();
    var mid = hoistOf("T", 40);
    eq(Math.abs(mid.trim.self) < 0.1 * mid.hoist.capacity, true, "under 10% of capacity (" + mid.trim.self + " lb)");
    eq(S.results.warnings.some(function (w) { return w.level === "trim"; }), false, "no trim warning");
  });

  /* ---------- hoist springs ---------- */

  add("hoist springs: three hoists of stiffness k under a uniform load - middle takes (d_w + wL/k) / (f + 1.5/k)", function () {
    S.newRig();
    var t = S.addTruss({ name: "C", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 10, 20] });
    t.weightless = true; t.wallWeight = 1000; S.rig.settings.hoistStiffness = 1000; S.commit();   // 1000 lb/in
    var bm = S.results.compat.model.beams[0], L = 10, w = 50, k = 12000;
    var f = L * L * L / (6 * bm.EI) + L / (2 * bm.GA), dw = 5 * w * Math.pow(L, 4) / (24 * bm.EI) + w * L * L / (2 * bm.GA);
    near(hoistOf("C", 10).reaction, (dw + w * L / k) / (f + 1.5 / k), 1e-6, "middle hoist");
    near(hoistOf("C", 0).reaction + hoistOf("C", 10).reaction + hoistOf("C", 20).reaction, 1000, 1e-6, "balances");
    var springTrim = hoistOf("C", 10).trim.self;
    S.rig.settings.hoistStiffness = 0; S.commit();
    eq(Math.abs(springTrim) < Math.abs(hoistOf("C", 10).trim.self), true, "a springy hoist is less trim-sensitive");
    near(hoistOf("C", 10).reaction, 500 * (5 + 12 * bm.EI / (bm.GA * 100)) / (4 + 12 * bm.EI / (bm.GA * 100)), 1e-6, "no stiffness = rigid hoists again");
  });

  add("hoist springs: a hoist's own stiffness overrides the rig's", function () {
    S.newRig();
    var t = S.addTruss({ name: "C", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 10, 20] });
    t.supports.filter(function (s) { return s.kind === "hoist" && s.distance === 10; })[0].stiffness = 500; S.commit();
    var sup = S.results.compat.model.supports;
    eq(sup.filter(function (s) { return s.k > 0; }).length, 1, "one spring"); near(sup.filter(function (s) { return s.k > 0; })[0].k, 6000, 1e-9, "500 lb/in = 6000 lb/ft");
  });

  /* ---------- semi-rigid corner blocks ---------- */

  add("semi-rigid corner blocks: a very stiff spring is the rigid model, a very soft one the hinged model; every sweep point balances", function () {
    S.newRig(); TLA.samples.box(S); S.commit();
    var c = S.results.compat, stiff = TLA.grillage.solveSlack(c.model, "semi1000000"), soft = TLA.grillage.solveSlack(c.model, "semi0.000001");
    Object.keys(c.rigid.reactions).forEach(function (id) {
      near(stiff.reactions[id], c.rigid.reactions[id], 0.01, id + " stiff = rigid");
      near(soft.reactions[id], c.hinged.reactions[id], 0.01, id + " soft = hinged");
    });
    TLA.grillage.SWEEP.forEach(function (a) { near(c["semi" + a].equilibriumError, 0, 1e-6 * c.load, "semi" + a + " balances"); });
    S.results.hoists.forEach(function (h) {
      var lo = Math.min(h.compat.hinged, h.compat.rigid, h.compat.semiMin), hi = Math.max(h.compat.hinged, h.compat.rigid, h.compat.semiMax);
      near(h.hoist.staticLoad, hi, 1e-9, "governing = the worst of all five"); eq(lo <= hi, true, "range");
    });
  });

  add("semi-rigid corner blocks: only swept where a corner block joins trusses", function () {
    S.newRig();
    S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 10, 20] }); S.commit();
    eq(S.results.models.join(","), "hinged,rigid", "a lone truss has no joints to sweep");
    eq(hoistOf("T", 10).compat.semiMin, null, "no semi-rigid range");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
