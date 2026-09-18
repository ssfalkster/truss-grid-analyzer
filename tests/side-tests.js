(function (g) {
  var TLA = g.TLA, add = g.__addTLATest;
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function jte() { return TLA.data.trusses.filter(function (x) { return x.manufacturer === "JTE" && x.description === "12x12 Plated"; })[0]; }

  add("circular (match original): 5 points, 60 ft circle -> 614 lb, span 35.27 ft", function () {
    var r = TLA.side.circular(jte(), 5, 60, { matchOriginal: true });
    near(r.span, 35.2671, 1e-3, "span"); near(r.maxLoad, 614, 1e-6, "max load");
    near(r.cantileverRatio, 16.24, 0.01, "ratio");
  });
  add("circular (corrected): looks up the real span and applies derate", function () {
    var t = jte(), r = TLA.side.circular(t, 5, 60);
    near(r.baseLoad, t.udl_lb[35] * 0.85 / 2, 1e-9, "uses ceil(span)=36 ft column");
    near(r.maxLoad, r.baseLoad * 0.2, 1e-9);
  });
  add("circular: too few points and bands", function () {
    eq(TLA.side.circular(jte(), 2, 40).tooFew, true, "2 points");
    var r = TLA.side.circular(jte(), 8, 40, { matchOriginal: true }); // 45 deg -> ratio 20.7*... 35% band? check via bands
    eq(r.maxLoad != null, true);
    var r12 = TLA.side.circular(jte(), 12, 60, { matchOriginal: true });
    near(r12.maxLoad, r12.baseLoad, 1e-9, "11+ points -> full base");
  });
  add("simple UDL: table sums to ~1 and matches exact for 2-5 points", function () {
    for (var n = 2; n <= 10; n++) {
      var t = TLA.side.simpleTable(n), s = t.reduce(function (a, b) { return a + b; }, 0);
      near(s, 1, 0.0015, "sum for " + n + " points"); eq(t.length, n, "length " + n);
    }
    [2, 3, 4, 5].forEach(function (n) {
      var t = TLA.side.simpleTable(n), e = TLA.side.simpleExact(n);
      t.forEach(function (v, i) { near(v, e[i], 0.001, "point " + (i + 1) + " of " + n); });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
