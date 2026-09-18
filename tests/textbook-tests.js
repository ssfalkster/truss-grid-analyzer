/* Checks against "Rigging Math Made Simple" (Delbert Hall): Lessons 12, 13, 14 (reactions on a beam, with cantilevers and
 * truss weight) and Lesson 21 (how much load can I put on a truss). Page numbers are the book's. */
(function (g) {
  var TLA = g.TLA, add = g.__addTLATest;
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }

  /** Book method: tension on L1 = sum of (load x distance from the load to L2) / span; L2 = total - L1. */
  function bookL1(span, loads) { return loads.reduce(function (t, l) { return t + l.w * l.d / span; }, 0); }

  /** Solve with the engine. Loads are given as the book gives them: weight and distance from the LOAD to L2 (negative = beyond L2). */
  function engine(span, cantL, cantR, loads, wPerFt) {
    var length = cantL + span + cantR, p2 = cantL + span;
    return TLA.beam.solve({
      length: length, supports: [cantL, p2],
      loads: loads.map(function (l) { return { distance: p2 - l.d, weight: l.w }; }),
      trussWeightPerFt: wPerFt || 0
    });
  }
  function check(span, cantL, cantR, loads, l1, l2, msg) {
    var b = engine(span, cantL, cantR, loads);
    near(b.reactions[0], l1, 1e-9, msg + " L1"); near(b.reactions[1], l2, 1e-9, msg + " L2");
    near(bookL1(span, loads), l1, 1e-9, msg + " (book formula)");
  }

  add("book L12 p86: span 20, 200 lb with D1 = 5 -> L1 50, L2 150", function () {
    check(20, 0, 0, [{ w: 200, d: 5 }], 50, 150, "example");
  });
  add("book L12 sample problems p87-88 (weightless truss)", function () {
    check(12, 0, 0, [{ w: 300, d: 5 }], 125, 175, "#1 12', 300 lb at 7 from L1");
    check(20, 0, 0, [{ w: 300, d: 7 }], 105, 195, "#2 20', 300 lb at 13 from L1");
    check(30, 0, 0, [{ w: 400, d: 8 }], 400 * 8 / 30, 400 - 400 * 8 / 30, "#3 30', 400 lb at 22 from L1");
    check(25, 0, 0, [{ w: 350, d: 8 }], 112, 238, "#4 25', 350 lb at 17 from L1");
    check(20, 0, 0, [{ w: 350, d: 18 }], 315, 35, "#5 20', 350 lb at 2 from L1");
  });
  add("book L12 p87: truss weight = half of the total weight on each supporting point", function () {
    var b = engine(30, 0, 0, [], 10);
    near(b.reactions[0], 150, 1e-9); near(b.reactions[1], 150, 1e-9);
  });
  add("book L13 p90-91: two loads, span 20, 100 lb at 17.5 and 200 lb at 5 from L2 -> L1 137.5, L2 162.5", function () {
    check(20, 0, 0, [{ w: 100, d: 17.5 }, { w: 200, d: 5 }], 137.5, 162.5, "example");
    check(20, 0, 0, [{ w: 300, d: 20 }, { w: 400, d: 5 }], 400, 300, "sample #1 (300 lb at L1, 400 lb 5 ft from L2)");
  });
  add("book L14 p96: cantilevered loads, span 30 -> L1 275, L2 175", function () {
    check(30, 5, 10, [{ w: 200, d: 35 }, { w: 150, d: 15 }, { w: 100, d: -10 }], 275, 175, "example");
  });
  add("book L14 p98 sample #1: span 20, 300 lb at 25 and 500 lb at 5 from L2, 300 lb 5 ft past L2 -> L1 425, L2 675", function () {
    check(20, 5, 5, [{ w: 300, d: 25 }, { w: 500, d: 5 }, { w: 300, d: -5 }], 425, 675, "sample #1");
  });
  add("book L14 p97-98: truss weight with cantilevers (10 lb/ft, 5' + 30' + 10') adds 187.5 to L1 and 262.5 to L2", function () {
    var b = engine(30, 5, 10, [], 10);
    near(b.reactions[0], 187.5, 1e-9, "L1"); near(b.reactions[1], 262.5, 1e-9, "L2");
    near(b.reactions[0] + b.reactions[1], 450, 1e-9, "(5 + 30 + 10) x 10 = 450 lb");
    var c = engine(30, 5, 10, [{ w: 200, d: 35 }, { w: 150, d: 15 }, { w: 100, d: -10 }], 10);
    near(c.reactions[0], 275 + 187.5, 1e-9, "loads + truss L1"); near(c.reactions[1], 175 + 262.5, 1e-9, "loads + truss L2");
  });
  add("book L12-14: engine equals the book formula for 300 random two-leg problems (cantilevers, truss weight)", function () {
    var seed = 11; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var n = 0; n < 300; n++) {
      var span = 5 + rnd() * 35, cl = rnd() < 0.3 ? 0 : rnd() * 10, cr = rnd() < 0.3 ? 0 : rnd() * 10, w = rnd() * 12;
      var length = cl + span + cr, loads = [], j;
      for (j = 0; j < 8; j++) loads.push({ w: rnd() * 300, x: rnd() * length });
      var p2 = cl + span;
      var b = TLA.beam.solve({ length: length, supports: [cl, p2], loads: loads.map(function (l) { return { distance: l.x, weight: l.w }; }), trussWeightPerFt: w });
      var bookLoads = loads.map(function (l) { return { w: l.w, d: p2 - l.x }; })
        .concat([{ w: w * cl, d: p2 - cl / 2 }, { w: w * span, d: span / 2 }, { w: w * cr, d: -cr / 2 }]);
      var expect = bookL1(span, bookLoads), total = bookLoads.reduce(function (t, l) { return t + l.w; }, 0);
      near(b.reactions[0], expect, 1e-8, "L1 case " + n); near(b.reactions[1], total - expect, 1e-8, "L2 case " + n);
    }
  });

  /* ---------------- Lesson 21 ---------------- */
  function tomcat(desc) { return TLA.data.trusses.filter(function (t) { return t.manufacturer === "Tomcat" && t.description === desc; })[0]; }
  function segCheck(truss, span, pointLoad, wall, opts) {
    var b = TLA.beam.solve({ length: span, supports: [0, span], loads: [{ distance: span / 2, weight: pointLoad }], trussWeightPerFt: truss.weight_per_ft_lb, wallWeight: wall });
    return TLA.limits.checkTruss(truss, b, wall, opts || { derate: 1 }).segments.filter(function (x) { return x.type === "span"; })[0];
  }

  add("book L21 p149: the database holds the printed 20.5 x 20.5 plated table (UDL and CPL at 10-50 ft)", function () {
    var t = tomcat("20.5x20.5 Plated"), udl = [8390, 4600, 2910, 2040, 1450], cpl = [4744, 2306, 1464, 1021, 737];
    [10, 20, 30, 40, 50].forEach(function (s, i) { near(t.udl_lb[s - 1], udl[i], 0, "UDL at " + s + " ft"); near(t.cpl_lb[s - 1], cpl[i], 0, "CPL at " + s + " ft"); });
  });
  add("book L21 p150-151: a span is not overloaded if the load does not exceed the CPL (even above Max UDL / 2)", function () {
    var t = tomcat("20.5x20.5 Plated");
    eq(t.udl_lb[9] / 2 < t.cpl_lb[9], true, "book: Max UDL/2 = 4195 is below the 4744 CPL on a 10' span");
    eq(segCheck(t, 10, 4700, 0).status, "Good", "4,700 lb at the centre of 10' passes (book: 'you can safely place 4,744 lb')");
    eq(segCheck(t, 10, 4745, 0).status, "OVERLOADED", "one pound over the CPL fails");
  });
  add("book L21 p151: UDL plus point loads - revised CPL = CPL x (1 - UDL / Max UDL)", function () {
    var t = tomcat("20.5x20.5 Plated");           // 20 ft: UDL 4,600, CPL 2,306
    var s = segCheck(t, 20, 1729, 1150);            // 1,150 / 4,600 = 0.25 used -> 0.75 x 2,306 = 1,729.5 left
    near(s.freeFraction, 0.75, 1e-9, "remaining capacity"); near(s.capacity, 1729.5, 1e-9, "revised CPL");
    eq(s.status, "Good", "1,729 lb passes");
    eq(segCheck(t, 20, 1730, 1150).status, "OVERLOADED", "1,730 lb fails");
  });
  add("book L21 p149: span is rounded up to the next tabulated length (21 ft uses the 30-ft row)", function () {
    var t = tomcat("20.5x20.5 Plated");
    near(segCheck(t, 21, 100, 0).capacity, 1464, 1e-9, "CPL for 21 ft = the 30 ft value");
    near(segCheck(t, 30, 100, 0).capacity, 1464, 1e-9, "and exactly 30 ft");
  });
  add("book L21 p152-153 (Tomcat): cantilever - max length = max span / 4, load < CPL for a span 4 x the cantilever", function () {
    var t = tomcat("12x12 Plated");                 // max span 40, CPL at 40 ft = 426
    eq(t.max_span_ft, 40, "max span"); eq(t.cpl_lb[39], 426, "CPL at 40 ft");
    function cantilever(lc, load, opts) {
      var b = TLA.beam.solve({ length: lc + 20, supports: [lc, lc + 20], loads: [{ distance: 0, weight: load }], trussWeightPerFt: t.weight_per_ft_lb });
      var chk = TLA.limits.checkTruss(t, b, 0, opts || { derate: 1 });
      return { chk: chk, seg: chk.segments[0] };
    }
    near(cantilever(10, 100).chk.maxCantilever, 10, 1e-9, "max cantilever 10 ft");
    var tooLong = cantilever(15, 100).seg;           // 4 x 15 = 60 ft, beyond the tables
    eq(tooLong.lengthFail, true, "a 15 ft cantilever is too long (book example)");
    eq(cantilever(10, 426).seg.status, "Good", "426 lb on the end of a 10 ft cantilever is allowed (book)");
    eq(cantilever(10, 427).seg.status, "OVERLOADED", "427 lb is not");
    // book: tables already subtract the truss weight, so it is not counted unless the stricter option is on
    eq(cantilever(10, 426, { derate: 1, cantileverSelfWeight: true }).seg.status, "OVERLOADED", "stricter option adds 61 lb of truss weight");
  });
  add("book L14 p95: a cantilevered load lifts the far leg when nothing balances it", function () {
    var b = engine(20, 0, 10, [{ w: 400, d: -10 }]);
    near(b.reactions[0], -200, 1e-9, "L1 is pushed up (negative)"); near(b.reactions[1], 600, 1e-9, "L2 carries it");
    var st = TLA.limits.checkHoist({ weight_lb: 0, chain_weight_per_ft_lb: 0, speed_fpm: 0, capacity_lb: 1000 }, 0, b.reactions[0]);
    eq(st.status, "No Load", "flagged instead of hidden");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
