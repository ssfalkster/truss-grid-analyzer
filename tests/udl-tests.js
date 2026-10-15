/* 2.0.0: partial UDL loads (a load with a span) - exact in the beam solver and the whole-rig analysis, checked against
 * the same weight cut into many point loads, and the span-check rule for them. */
(function (g) {
  var TLA = g.TLA, S = TLA.store, add = g.__addTLATest;
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  /** The same UDL as n point loads at the middle of n equal pieces. */
  function pieces(u, n) {
    var a = u.distance - u.span / 2, out = [];
    for (var i = 0; i < n; i++) out.push({ distance: a + (i + 0.5) * u.span / n, weight: u.weight / n });
    return out;
  }
  var U1 = { distance: 11, span: 10, weight: 300 }, U2 = { distance: 22, span: 4, weight: 80 };   // over a support; on the cantilever

  add("udl: a partial UDL gives the reactions of the same weight in many point loads (three-moment)", function () {
    var base = { length: 24, supports: [3, 12, 20], trussWeightPerFt: 7 };
    var b = TLA.beam.solve(Object.assign({}, base, { loads: [U1, U2, { distance: 8, weight: 50 }] }));
    var c = TLA.beam.solve(Object.assign({}, base, { loads: pieces(U1, 4000).concat(pieces(U2, 4000)).concat([{ distance: 8, weight: 50 }]) }));
    b.reactions.forEach(function (r, i) { near(r, c.reactions[i], 1e-4, "reaction " + i); });
    near(b.equilibriumError, 0, 1e-9, "equilibrium");
    eq(b.loads.length, 1, "point loads only in loads"); eq(b.udls.length, 2, "two UDLs");
    near(b.right.udlF, 80, 1e-9, "the cantilever carries the second UDL");
    var db = TLA.beam.diagram(b), dc = TLA.beam.diagram(c);
    near(db.maxSag, dc.maxSag, 1e-2, "max sagging moment"); near(db.maxHog, dc.maxHog, 1e-2, "max hogging moment"); near(db.maxShear, dc.maxShear, 0.05, "max shear");
  });
  add("udl: a UDL over the whole truss is the same as the truss's own UDL", function () {
    var a = TLA.beam.solve({ length: 20, supports: [2, 10, 18], loads: [{ distance: 10, span: 20, weight: 400 }] });
    var b = TLA.beam.solve({ length: 20, supports: [2, 10, 18], loads: [], wallWeight: 400 });
    a.reactions.forEach(function (r, i) { near(r, b.reactions[i], 1e-9, "reaction " + i); });
  });
  add("udl: a mirrored UDL adds its twin, and a UDL is cut at the truss ends", function () {
    var b = TLA.beam.solve({ length: 20, supports: [0, 20], loads: [{ distance: 4, span: 4, weight: 100, mirror: true }] });
    eq(b.udls.length, 2); near(b.udls[1].start, 14, 1e-9); near(b.udls[1].end, 18, 1e-9);
    near(b.reactions[0], 100, 1e-9); near(b.reactions[1], 100, 1e-9);
    var c = TLA.beam.solve({ length: 20, supports: [0, 20], loads: [{ distance: 1, span: 4, weight: 100 }] });
    near(c.udls[0].start, 0, 1e-9); near(c.totalLoad, 75, 1e-9, "the 1 ft past the end is left out");
  });
  add("udl: span check - a UDL over a whole span uses up the table UDL; over part of a span it is a point load", function () {
    var tr = TLA.data.trusses.filter(function (x) { return x.udl_lb && x.cpl_lb; })[0];
    var full = TLA.beam.solve({ length: 20, supports: [0, 10, 20], loads: [{ distance: 5, span: 10, weight: 200 }] });
    var sp = TLA.limits.checkTruss(tr, full, 0, {}).segments.filter(function (s) { return s.type === "span"; });
    near(sp[0].udlFull, 200, 1e-9); near(sp[0].udlPart, 0, 1e-9); near(sp[0].load, 0, 1e-9, "no point load on span 1");
    var part = TLA.beam.solve({ length: 20, supports: [0, 10, 20], loads: [{ distance: 8, span: 6, weight: 120 }] });
    var sq = TLA.limits.checkTruss(tr, part, 0, {}).segments.filter(function (s) { return s.type === "span"; });
    near(sq[0].udlPart, 100, 1e-9, "5 ft of 6 ft on span 1"); near(sq[1].udlPart, 20, 1e-9); near(sq[0].load, 100, 1e-9); near(sq[0].udlUsed, 0, 1e-9);
  });
  add("udl: whole-rig analysis - a partial UDL matches the same weight in many point loads", function () {
    function rig(loads) {
      S.newRig(); var t = S.addTruss({ name: "T", length: 30, hoists: [1, 12, 29] }); t.measure = "start"; t.supports.forEach(function (s) { delete s.from; delete s.pos; });
      t.loads = loads.map(function (l, i) { return Object.assign({ id: "l" + i, note: "" }, l); }); S.commit();
      if (S.results.primary !== "grillage") throw new Error("whole-rig analysis did not run");
      return S.results.hoists.map(function (h) { return [h.compat ? h.compat.hinged : h.reaction, h.reaction]; });
    }
    var u = { distance: 14, span: 12, weight: 360 }, a = rig([u]), b = rig(pieces(u, 120));
    a.forEach(function (r, i) { near(r[1], b[i][1], 0.05, "hoist " + i + " (120 pieces vs exact)"); });
    S.newRig();
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
