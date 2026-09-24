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

  add("moment/shear check: truss self weight counted in the forces and added back into the allowables (option), else left out of both", function () {
    var t = truss("JTE", "12x12 Plated"), w = t.weight_per_ft_lb, b = TLA.beam.solve({ length: 20, supports: [0, 20], loads: [], trussWeightPerFt: w });
    var off = TLA.limits.checkTruss(t, b, 0, {}).member, on = TLA.limits.checkTruss(t, b, 0, { cantileverSelfWeight: true }).member;
    near(off.moment, 0, 1e-9, "left out: nothing but self weight -> 0");
    near(off.capacity.moment, TLA.limits.memberCapacity(t).moment, 1e-9, "left out: the tables' own moment");
    near(on.moment, w * 400 / 8, 1e-9, "counted: wL^2/8");
    near(on.capacity.moment, TLA.limits.memberCapacity(t, w).moment, 1e-9, "counted: capacity with self weight added back");
    eq(on.capacity.moment > off.capacity.moment && on.capacity.shear > off.capacity.shear, true, "added back: larger allowables");
    // a weightless truss carries no self weight, so nothing is added back
    var bw = TLA.beam.solve({ length: 20, supports: [0, 20], loads: [], trussWeightPerFt: w, weightless: true });
    near(TLA.limits.checkTruss(t, bw, 0, { cantileverSelfWeight: true }).member.capacity.moment, off.capacity.moment, 1e-9, "weightless");
  });

  add("capacity with self weight = Hall's Stress Table Creator 2 (Tomcat 20.5 x 20.5 medium duty spigoted, 11.5 lb/ft)", function () {
    // RMMS12 downloads, StressTableCreator2.xlsx Sheet1: spans 10-50 ft, max total UDL and max CPL rows; Hall adds the
    // self weight back: V = UDL / 2 + w L / 2, M = CPL x L / 4 + w L^2 / 8
    var udl = [], cpl = [], rows = { 10: [9200, 9204], 20: [9000, 5797], 30: [7560, 3781], 40: [5480, 2748], 50: [3850, 2109] };
    for (var i = 0; i < 50; i++) { udl.push((rows[i + 1] || [0])[0]); cpl.push((rows[i + 1] || [0, 0])[1]); }
    var t = { max_span_ft: 50, udl_lb: udl, cpl_lb: cpl, repetitive_use: true }, c = TLA.limits.memberCapacity(t, 11.5);
    near(c.momentFromPoint, 29956.25, 1e-9, "Hall's max moment (H14, the 50 ft CPL row)");
    near(c.momentFromUniform, 5480 * 40 / 8 + 11.5 * 1600 / 8, 1e-9, "from the UDL rows: the 40 ft row");
    near(c.moment, 29700, 1e-9, "the smaller of the two");
    near(9200 / 2 + 11.5 * 5, 4657.5, 1e-9, "Hall's shear D13 (10 ft UDL row)");
    near(c.shear, 9204 / 2 + 11.5 * 5, 1e-9, "ours also reads the CPL rows: 4659.5 at 10 ft");
  });

  add("self weight: counted unless the rig turns it off (1.18.0 default); saved choices kept", function () {
    eq(TLA.limits.countSelfWeight(undefined), true, "no settings"); eq(TLA.limits.countSelfWeight({}), true, "not set");
    eq(TLA.limits.countSelfWeight({ cantileverSelfWeight: true }), true, "on"); eq(TLA.limits.countSelfWeight({ cantileverSelfWeight: false }), false, "off");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
