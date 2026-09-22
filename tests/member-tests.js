/* Shear/moment diagrams and the table-derived moment/shear check (1.2.0). */
(function (g) {
  var TLA = g.TLA, add = g.__addTLATest;
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function truss(mfr, desc) { return TLA.data.trusses.filter(function (x) { return x.manufacturer === mfr && x.description === desc; })[0]; }
  function solve(len, sup, loads, w) {
    return TLA.beam.solve({ length: len, supports: sup, loads: loads.map(function (l) { return { distance: l[0], weight: l[1] }; }), trussWeightPerFt: w || 0 });
  }

  add("diagram: simple span, centre point load - M = PL/4, V = P/2", function () {
    var d = TLA.beam.diagram(solve(10, [0, 10], [[5, 1000]]));
    near(d.maxSag, 2500, 1e-9, "M"); near(d.atSag, 5, 1e-9, "at centre"); near(d.maxHog, 0, 1e-9, "no hogging"); near(d.maxShear, 500, 1e-9, "V");
  });

  add("diagram: simple span, uniform load - M = wL^2/8 at midspan (peak found between points)", function () {
    var d = TLA.beam.diagram(solve(12, [0, 12], [], 10));
    near(d.maxSag, 10 * 144 / 8, 1e-9, "M"); near(d.atSag, 6, 1e-9, "at midspan"); near(d.maxShear, 60, 1e-9, "V = wL/2");
  });

  add("diagram: two equal spans, uniform load - hogging wL^2/8 over the middle support, sagging 9wL^2/128", function () {
    var d = TLA.beam.diagram(solve(20, [0, 10, 20], [], 10));
    near(d.maxHog, 10 * 100 / 8, 1e-9, "hogging"); near(d.atHog, 10, 1e-9, "over the middle support");
    near(d.maxSag, 9 * 10 * 100 / 128, 1e-9, "sagging"); near(d.maxShear, 0.625 * 100, 1e-9, "V = 5wL/8");
  });

  add("diagram: cantilever tip load - hogging P a at the support, shear P", function () {
    var d = TLA.beam.diagram(solve(14, [0, 10], [[14, 300]]));
    near(d.maxHog, 1200, 1e-9, "M"); near(d.atHog, 10, 1e-9, "at the support"); near(d.maxShear, 300, 1e-9, "V");
  });

  add("diagram: random continuous beams - support moments equal the three-moment solution, ends are free", function () {
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var k = 0; k < 50; k++) {
      var len = 10 + Math.round(rnd() * 40), n = 2 + Math.floor(rnd() * 4), sup = [], loads = [];
      for (var i = 0; i < n; i++) sup.push(Math.round((i / (n - 1)) * (len - 4) + 2 + (rnd() - 0.5) * 2));
      for (i = 0; i < 1 + Math.floor(rnd() * 5); i++) loads.push([Math.round(rnd() * len * 4) / 4, Math.round(rnd() * 500)]);
      var b = solve(len, sup, loads, rnd() * 10), d = TLA.beam.diagram(b);
      b.positions.forEach(function (p, j) {
        var pt = d.points.filter(function (q) { return Math.abs(q.x - p) < 1e-7; })[0];
        near(pt.m, -b.moments[j], 1e-6 * (1 + Math.abs(b.moments[j])), "beam " + k + " support " + j);
      });
      var last = d.points[d.points.length - 1], first = d.points[0];
      near(last.m, 0, 1e-6 * b.totalLoad * len, "beam " + k + " M(L) = 0");
      near(first.m, 0, 1e-9, "beam " + k + " M(0) = 0");
    }
  });

  add("capacity from tables: Tomcat 12x12 plated - point and uniform tables agree on about 5,575 lb-ft; shear 2,230 lb", function () {
    var c = TLA.limits.memberCapacity(truss("Tomcat", "12x12 Plated"));
    near(c.momentFromPoint, 5577.5, 1e-9, "from CPL"); near(c.momentFromUniform, 5575, 1e-9, "from UDL");
    near(c.moment, 5575, 1e-9, "the smaller"); near(c.shear, 2230, 1e-9, "largest demonstrated shear");
  });

  add("moment/shear check: a heavy load right next to a hoist passes the table check but not the shear check", function () {
    // JTE 12x12 plated, 10 ft span: table CPL 4497 x 0.85 = 3822 lb; 3800 lb at 0.5 ft puts 3610 lb of shear on the
    // near hoist, over the ~3070 x 0.85 = 2610 lb the tables demonstrate
    var t = truss("JTE", "12x12 Plated"), b = TLA.beam.solve({ length: 10, supports: [0, 10], loads: [{ distance: 0.5, weight: 3800 }], trussWeightPerFt: t.weight_per_ft_lb });
    var r = TLA.limits.checkTruss(t, b, 0, {});
    eq(r.segments.filter(function (s) { return s.type === "span"; })[0].code, 0, "table check passes");
    eq(r.member.shearOver, true, "shear over"); eq(r.member.momentOver, false, "moment fine"); eq(r.ok, false, "truss fails");
    near(r.member.shear, 3610, 1e-6, "shear without self weight");
  });

  add("moment/shear check: truss self weight is left out unless the stricter option is on", function () {
    var t = truss("JTE", "12x12 Plated"), b = TLA.beam.solve({ length: 20, supports: [0, 20], loads: [], trussWeightPerFt: t.weight_per_ft_lb });
    near(TLA.limits.checkTruss(t, b, 0, {}).member.moment, 0, 1e-9, "default: nothing but self weight -> 0");
    near(TLA.limits.checkTruss(t, b, 0, { cantileverSelfWeight: true }).member.moment, t.weight_per_ft_lb * 400 / 8, 1e-9, "stricter: wL^2/8");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
