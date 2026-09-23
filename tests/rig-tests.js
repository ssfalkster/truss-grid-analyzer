/* Rig (truss grid) tests - registered on the same runner as tests.js (must load after it). */
(function (g) {
  var TLA = g.TLA;
  var add = g.__addTLATest;
  function near(a, b, tol, msg) {
    if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a);
  }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }

  function dbId(mfr, desc) {
    return TLA.data.trusses.filter(function (x) { return x.manufacturer === mfr && x.description === desc; })[0].id;
  }
  function hoistId(desc, cap, fpm) {
    return TLA.data.hoists.filter(function (h) { return h.description === desc && h.capacity_label === cap && h.speed_fpm === fpm; })[0].id;
  }
  /** A three-level chain: C sits on B, B sits on A, A hangs from three hoists. */
  function chainRig() {
    var cid = dbId("Christie", '12"x12" A Type Bolted');
    var h16 = hoistId("Custom", "1/4 Ton", 16);
    return { settings: {}, trusses: [
      { id: "A", name: "A", trussId: cid, length: 30, loads: [{ id: "a1", distance: 5, weight: 50 }, { id: "a2", distance: 20, weight: 80 }],
        supports: [2, 15, 28].map(function (p, i) { return { id: "ah" + i, distance: p, kind: "hoist", hoistId: h16, chainLength: 20 }; }) },
      { id: "B", name: "B", trussId: cid, length: 24, loads: [{ id: "b1", distance: 12, weight: 120 }],
        supports: [{ id: "b-a", distance: 2, kind: "truss", onTruss: "A", onDistance: 8 }, { id: "b-h", distance: 12, kind: "hoist", hoistId: h16, chainLength: 20 }, { id: "b-b", distance: 22, kind: "truss", onTruss: "A", onDistance: 22 }] },
      { id: "C", name: "C", trussId: cid, length: 12, loads: [{ id: "c1", distance: 6, weight: 60 }],
        supports: [{ id: "c-a", distance: 1, kind: "truss", onTruss: "B", onDistance: 5 }, { id: "c-b", distance: 11, kind: "truss", onTruss: "B", onDistance: 17 }] }
    ] };
  }

  add("rig: chain solves with nothing left over", function () {
    var r = TLA.rig.solve(chainRig());
    eq(r.unsolved.length, 0, "unsolved");
  });
  add("rig: layers follow the load path (C = 1, B = 2, A = 3)", function () {
    var r = TLA.rig.solve(chainRig());
    eq(r.layers.C, 1); eq(r.layers.B, 2); eq(r.layers.A, 3);
    eq(r.order.indexOf("C") < r.order.indexOf("B"), true, "C before B");
    eq(r.order.indexOf("B") < r.order.indexOf("A"), true, "B before A");
  });
  add("rig: equilibrium - hoist reactions equal everything applied", function () {
    var r = TLA.rig.solve(chainRig());
    near(r.totals.hoistReaction, r.totals.applied, 1e-6, "sum of hoist reactions vs applied weight");
  });
  add("rig: cycle is detected and reported, not solved", function () {
    var cid = dbId("Christie", '12"x12" A Type Bolted');
    var rig = { trusses: [
      { id: "A", name: "A", trussId: cid, length: 10, loads: [], supports: [{ id: "a1", distance: 0, kind: "truss", onTruss: "B", onDistance: 5 }, { id: "a2", distance: 10, kind: "hoist", hoistId: 1, chainLength: 0 }] },
      { id: "B", name: "B", trussId: cid, length: 10, loads: [], supports: [{ id: "b1", distance: 0, kind: "truss", onTruss: "A", onDistance: 5 }, { id: "b2", distance: 10, kind: "hoist", hoistId: 1, chainLength: 0 }] }
    ] };
    var r = TLA.rig.solve(rig);
    eq(r.unsolved.length, 2, "both unsolved");
    eq(r.cycles.length >= 1, true, "cycle found");
  });
  add("rig: hardware weight and mirrored loads flow through", function () {
    var cid = dbId("Christie", '12"x12" A Type Bolted');
    var rig = { trusses: [
      { id: "T", name: "Top", trussId: cid, length: 20, weightless: true, loads: [], supports: [{ id: "t1", distance: 0, kind: "hoist", hoistId: 1, chainLength: 0 }, { id: "t2", distance: 20, kind: "hoist", hoistId: 1, chainLength: 0 }] },
      { id: "S", name: "Sub", trussId: cid, length: 10, weightless: true, loads: [{ id: "x", distance: 2, weight: 100, mirror: true }],
        supports: [{ id: "s1", distance: 0, kind: "truss", onTruss: "T", onDistance: 5, hardwareWeight: 10 }, { id: "s2", distance: 10, kind: "truss", onTruss: "T", onDistance: 15, hardwareWeight: 10 }] }
    ] };
    var r = TLA.rig.solve(rig);
    near(r.totals.applied, 220, 1e-9, "applied = 2x100 + 2x10");
    near(r.totals.hoistReaction, 220, 1e-6, "hoists carry all of it");
    near(r.trusses.T.supports[0].reaction, r.trusses.T.supports[1].reaction, 1e-9, "symmetry");
  });
  add("rig: attribution parts add up to the hoist reaction", function () {
    var rig = chainRig(), r = TLA.rig.solve(rig);
    r.hoists.forEach(function (h) {
      var a = TLA.rig.attribution(rig, undefined, h.truss, h.support);
      near(a.parts.reduce(function (t, p) { return t + p.weight; }, 0), a.reaction, 1e-6, "parts sum for " + h.trussName + " " + h.distance);
    });
  });
  add("corner blocks: weight rules (variants, plates per connection, override, unpublished)", function () {
    var C = TLA.data.corners;
    function by(fam, name) { return C.filter(function (c) { return c.family.indexOf(fam) === 0 && c.name.indexOf(name) === 0; })[0]; }
    var a90 = by("Christie A", "Corner 90"), b6 = by("Christie B", "Blk Corner"), g6 = by("Christie G", "Blk Corner"), jte6 = by("General Purpose 12 x 12", "6-Way");
    near(TLA.rig.blockWeight({}, a90, 3), 25.5, 1e-9, "Christie A default = 12 bolts");
    near(TLA.rig.blockWeight({ variant: 0 }, a90, 3), 22.5, 1e-9, "4 bolts");
    near(TLA.rig.blockWeight({ variant: 2 }, a90, 3), 30, 1e-9, "24 bolts");
    near(TLA.rig.blockWeight({}, b6, 2), 65.5, 1e-9, "Christie B + 2 plates");
    near(TLA.rig.blockWeight({}, b6, 6), 122.5, 1e-9, "Christie B + 6 plates");
    near(TLA.rig.blockWeight({}, g6, 4), 225, 1e-9, "Christie G + 4 plates");
    near(TLA.rig.blockWeight({}, jte6, 3), 26.5, 1e-9, "JTE 12x12 6-way");
    near(TLA.rig.blockWeight({ weightOverride: 30 }, jte6, 3), 30, 1e-9, "override");
    eq(TLA.rig.blockWeight({}, C.filter(function (c) { return c.code === "TRUHA-02"; })[0], 2), 0, "unpublished weight is 0 until entered");
  });
  add("corner blocks: block carries bolted truss, adds own weight, counts faces, equilibrium", function () {
    var cid = dbId("Christie", '12"x12" A Type Bolted');
    var a90 = TLA.data.corners.filter(function (c) { return c.code === "TRUAA-90"; })[0];
    var none = TLA.data.hoists[0].id;
    var rig = { trusses: [
      { id: "P", name: "Main", trussId: cid, length: 20, weightless: true, loads: [], supports: [{ id: "p1", distance: 0, kind: "hoist", hoistId: none, chainLength: 0 }, { id: "p2", distance: 20, kind: "hoist", hoistId: none, chainLength: 0 }] },
      { id: "B", isBlock: true, name: "Blk", blockTypeId: a90.id, length: 1.0625, weightless: false, loads: [], supports: [{ id: "b1", distance: 0.53125, kind: "truss", onTruss: "P", onDistance: 10 }] },
      { id: "S", name: "Side", trussId: cid, length: 10, weightless: true, loads: [{ id: "l", distance: 5, weight: 100 }], supports: [{ id: "s1", distance: 0, kind: "truss", onTruss: "B", onDistance: 0.53125 }, { id: "s2", distance: 10, kind: "hoist", hoistId: none, chainLength: 0 }] }
    ] };
    var r = TLA.rig.solve(rig);
    eq(r.unsolved.length, 0, "unsolved");
    var res = r.trusses.B.block;
    near(res.weight, 25.5, 1e-9, "block weight"); eq(res.waysUsed, 3, "faces: Side end (1) + Main through (2)");
    near(r.totals.applied, 125.5, 1e-9, "applied = 100 + block");
    near(r.totals.hoistReaction, 125.5, 1e-6, "hoists carry it all");
    eq(r.layers.S, 1); eq(r.layers.B, 2); eq(r.layers.P, 3);
    rig.trusses[1].blockTypeId = TLA.data.corners.filter(function (c) { return c.code === "TRUAA-22"; })[0].id;
    var over = TLA.rig.solve(rig);
    eq(over.warnings.some(function (w) { return /2-way block/.test(w.message); }), true, "3 faces on a 2-way block is flagged");
  });
  add("geometry: crossing distances come from the plan", function () {
    var a = { x: 0, y: 0, angle: 0 }, b = { x: 4.5, y: -3, angle: 90 };
    var c = TLA.rig.geometry.crossing(a, b);
    near(c.onA, 4.5, 1e-9); near(c.onB, 3, 1e-9);
    eq(TLA.rig.geometry.crossing(a, { x: 0, y: 5, angle: 0 }), null, "parallel");
    var p = TLA.rig.geometry.project(b, { x: 4.5, y: 2 });
    near(p.distance, 5, 1e-9); near(p.offset, 0, 1e-9);
  });

  add("plan width follows the truss type (12x12 = 12 in, 1.5 in schedule 40 pipe = 1.9 in OD) unless overridden", function () {
    var by = function (re, m) { return TLA.data.trusses.filter(function (x) { return re.test(x.description) && (!m || x.manufacturer === m); })[0]; };
    near(TLA.rig.widthIn(null, by(/12x12 Plated/, "Tomcat")), 12, 1e-9, "12x12");
    near(TLA.rig.widthIn(null, by(/20\.5x20\.5 Plated/, "Tomcat")), 20.5, 1e-9, "20.5x20.5");
    near(TLA.rig.widthIn(null, by(/Schedule 40 Pipe/i, "Generic")), 1.9, 1e-9, "1.5 in pipe OD");
    near(TLA.rig.widthIn({ widthIn: 15 }, by(/12x12 Plated/, "Tomcat")), 15, 1e-9, "override");
  });

  add("hoist output: loads & truss + hoist & chain = total static; dynamic = static x factor (16 fpm = 1.267 as in EOT 2.4, default 1.25, override wins)", function () {
    var S = TLA.store; S.newRig();
    var t = S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 20, hoists: [3, 17] });
    t.loads.push({ id: S.newId("l"), distance: 10, weight: 200 }); S.commit();
    var h0 = S.results.hoists[0].hoist;
    near(h0.reaction + h0.hoistChain, h0.staticLoad, 1e-9, "static = reaction + hoist & chain");
    near(h0.dynamicLoad, h0.staticLoad * h0.dynamicFactor, 1e-9, "dynamic = static x factor");
    var hd = TLA.data.hoists.filter(function (x) { return x.speed_fpm === 16; })[0];
    near(TLA.limits.checkHoist(hd, 10, 100).dynamicFactor, 16 / 60 + 1, 1e-12, "16 fpm hoist = fpm / 60 + 1");
    near(TLA.limits.checkHoist({ weight_lb: 50, chain_weight_per_ft_lb: 1, speed_fpm: 0, capacity_lb: 2000 }, 10, 100).dynamicFactor, 1.25, 1e-12, "unknown speed -> default 1.25");
    near(TLA.limits.checkHoist({ weight_lb: 50, chain_weight_per_ft_lb: 1, speed_fpm: 0, capacity_lb: 2000 }, 10, 100, 0, 0, 1.3).dynamicFactor, 1.3, 1e-12, "settings default");
    near(TLA.limits.checkHoist(hd, 10, 100, 0, 1.5).dynamicFactor, 1.5, 1e-12, "per-hoist override");
    S.rig.trusses[0].supports[0].dlf = 1.4; S.commit();
    near(S.results.hoists[0].hoist.dynamicFactor, 1.4, 1e-12, "override reaches the results");
  });

  add("EOT 2.4: 'Add %' raises each hoist's load and truss weight, not the hoist, chain or hardware; truss checks unchanged", function () {
    var hd = { weight_lb: 50, chain_weight_per_ft_lb: 1, speed_fpm: 16, capacity_lb: 2000 };
    var r = TLA.limits.checkHoist(hd, 10, 400, 5, 0, 1.25, 10);
    near(r.added, 40, 1e-9, "10% of 400"); near(r.staticLoad, 400 + 40 + 60 + 5, 1e-9, "static"); near(r.dynamicLoad, r.staticLoad * (16 / 60 + 1), 1e-9, "dynamic");
    eq(TLA.limits.checkHoist(hd, 10, -50, 0, 0, 1.25, 10).added, 0, "nothing added to a pushing reaction");
    var S = TLA.store; S.newRig();
    var t = S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 20, hoists: [3, 17] });
    t.loads.push({ id: S.newId("l"), distance: 10, weight: 200 }); S.commit();
    var before = S.results.hoists.map(function (x) { return x.hoist.staticLoad; }), rx = S.results.hoists.map(function (x) { return x.hoist.reaction; });
    var segs = JSON.stringify(S.results.trusses[t.id].limits.segments);
    S.rig.settings = S.rig.settings || {}; S.rig.settings.addPercent = 10; S.commit();
    S.results.hoists.forEach(function (x, i) { near(x.hoist.staticLoad, before[i] + 0.1 * rx[i], 1e-9, "hoist " + i); });
    eq(JSON.stringify(S.results.trusses[t.id].limits.segments), segs, "span checks unchanged");
  });

  add("EOT 2.4 trusses: Prolyte H30 Verto, and the generic Universal trusses carry a 0.75 derate (applied to capacity)", function () {
    function by(m, d) { return TLA.data.trusses.filter(function (x) { return x.manufacturer === m && x.description === d; })[0]; }
    var v = by("Prolyte", "H30 Verto"), u = by("Universal", '12"x12" Bolted');
    eq(!!v && !!u && !!by("Universal", '20"x20" Bolted') && !!by("Universal", '26" x 30" PRT'), true, "present");
    near(v.max_span_ft, 65.6, 1e-9, "Verto max span"); eq(TLA.limits.derate(v), 0.85, "Verto: not repetitive-use data");
    eq(TLA.limits.derate(u), 0.75, "Universal 0.75"); eq(TLA.limits.derate(u, 1), 1, "rig-wide override still wins");
    // a 20 ft span with 1000 lb UDL: capacity is table(20 ft) x 0.75 - not EOT 2.4's table(row 20 x 0.75 = 15 ft)
    var beam = TLA.beam.solve({ length: 20, supports: [0, 20], loads: [] }), c = TLA.limits.checkTruss(u, beam, 0, {});
    var sp = c.segments.filter(function (s) { return s.type === "span"; })[0];
    eq(c.derate, 0.75, "check uses 0.75"); near(sp.udlMax, u.udl_lb[19] * 0.75, 1e-9, "UDL allowed = 20 ft value x 0.75");
    near(sp.capacity, u.cpl_lb[19] * 0.75, 1e-9, "CPL allowed = 20 ft value x 0.75");
  });

  add("truss database (1.6.0): every entry says where its numbers come from and in which units; ids are unique", function () {
    var ids = {};
    TLA.data.trusses.forEach(function (x) {
      eq(ids[x.id], undefined, "duplicate id " + x.id); ids[x.id] = true;
      eq(x.source === "TLA" || x.source === "MFG", true, x.description + " source"); eq(!!x.source_ref, true, x.description + " reference");
      eq(x.units === "imperial" || x.units === "metric", true, x.description + " units");
      if (x.units === "metric") eq(x.udl_kg.length > 0 && x.cpl_kg.length === x.udl_kg.length && x.max_span_m > 0 && x.weight_per_m_kg > 0, true, x.description + " metric table");
      else eq(x.udl_lb.length === 100 && x.cpl_lb.length === 100, true, x.description + " imperial table");
      near(x.weight_per_ft_lb > 0 ? 1 : 0, 1, 0, x.description + " weight");
    });
    eq(TLA.data.trusses.filter(function (x) { return x.source === "MFG" && x.manufacturer === "Tomcat"; }).length, 7, "Tomcat MFG entries");
  });

  add("metric trusses (1.6.0): looked up in their own table in whole metres, kg to lb; model numbers are not inches", function () {
    function by(m, d) { return TLA.data.trusses.filter(function (x) { return x.manufacturer === m && x.description === d; })[0]; }
    var t = by("Prolyte", "H30V Square Truss"), KG = 2.20462262185;
    near(TLA.limits.tableAt(t, "udl", 6.5), t.udl_kg[1] * KG, 1e-9, "6.5 ft = 1.98 m -> the 2 m row");
    near(TLA.limits.tableAt(t, "cpl", 6.57), t.cpl_kg[2] * KG, 1e-9, "6.57 ft = 2.002 m -> the 3 m row");
    near(TLA.limits.tableAt(t, "udl", 20 / 0.3048 + 0.01), 0, 1e-12, "past the table: nothing allowed");
    near(t.max_span_ft, 20 / 0.3048, 1e-3, "max span 20 m"); near(t.weight_per_ft_lb, 7 * KG * 0.3048, 1e-3, "7 kg/m");
    eq(TLA.limits.derate(t), 0.85, "repetitive-use derate applies");
    var beam = TLA.beam.solve({ length: 20, supports: [0, 20], loads: [] }), c = TLA.limits.checkTruss(t, beam, 0, {});
    near(c.segments.filter(function (s) { return s.type === "span"; })[0].udlMax, t.udl_kg[6] * KG * 0.85, 1e-9, "20 ft = 6.1 m -> 7 m row");
    var m = by("Milos", "M290 Trio");
    near(TLA.rig.widthIn(null, m), 12, 0, "M290 is not 290 in wide"); eq(TLA.section.estimate(m).notes.some(function (n) { return /size not in the description/.test(n); }), true, "size flagged as assumed");
    eq(TLA.limits.memberCapacity(t).moment > 0, true, "moment capacity from the metric table");
  });

  add("Tomcat manufacturer data (1.6.0): a span between table rows uses the next longer row; Guardian+ is already repetitive-use data", function () {
    function by(d) { return TLA.data.trusses.filter(function (x) { return x.manufacturer === "Tomcat" && x.description === d; })[0]; }
    var p = by("Light Duty 12x12 Plated"), g = by("Light Duty 12x12 Guardian+");
    near(TLA.limits.tableAt(p, "udl", 12), 3435, 0, "12 ft -> the 15 ft row"); near(TLA.limits.tableAt(p, "cpl", 10), 2613, 0, "10 ft row");
    near(TLA.limits.tableAt(p, "udl", 51), 0, 0, "past 50 ft"); eq(p.max_span_ft, 50, "max span = last row");
    eq(TLA.limits.derate(p), 0.85, "plated: 0.85"); eq(TLA.limits.derate(g), 1, "Guardian+: sheet already reduced");
    eq(p.section.chordOD, 2, "chord size from the sheet");
    function s36(d) { return TLA.data.trusses.filter(function (x) { return x.manufacturer === "Prolyte" && x.description === d; })[0]; }
    eq(s36("S36 PRT w/ Wheels").weight_per_ft_lb > s36("S36 PRT w/o Wheels").weight_per_ft_lb, true, "S36 PRT: wheels weigh something (EOT 2.4 swap corrected)");
  });

  add("units (1.7.0): the metric switch converts only what is shown - results, trusses and hoists are untouched", function () {
    var S = TLA.store, U = TLA.units; S.newRig(); TLA.samples.box(S); S.commit();
    var before = JSON.stringify(S.results.hoists.map(function (x) { return [x.truss, x.support, x.hoist.staticLoad, x.hoist.dynamicLoad]; }));
    var picks = JSON.stringify(S.rig.trusses.map(function (t) { return [t.trussId, t.length, (t.supports || []).map(function (s) { return [s.hoistId, s.distance, s.chainLength]; })]; }));
    S.rig.settings = S.rig.settings || {}; S.rig.settings.units = "metric"; S.commit();
    eq(U.metric(), true, "metric on");
    eq(JSON.stringify(S.results.hoists.map(function (x) { return [x.truss, x.support, x.hoist.staticLoad, x.hoist.dynamicLoad]; })), before, "same results");
    eq(JSON.stringify(S.rig.trusses.map(function (t) { return [t.trussId, t.length, (t.supports || []).map(function (s) { return [s.hoistId, s.distance, s.chainLength]; })]; })), picks, "same trusses, hoists, positions");
    near(U.v("len", 10), 3.048, 1e-12, "10 ft = 3.048 m"); near(U.back("len", 2), 2 / 0.3048, 1e-12, "2 m = 6.56168 ft");
    near(U.v("w", 100), 45.359237, 1e-9, "100 lb = 45.36 kg"); near(U.back("w", U.v("w", 123.4)), 123.4, 1e-9, "round trip");
    eq(U.f("len", 10, 2), "3.048 m", "one more decimal in metres"); eq(U.unit("wpl"), "kg/m", "kg/m");
    near(U.parseLength("2.5", TLA.panels ? TLA.panels.parseLen : function () { return NaN; }), 2.5 / 0.3048, 1e-9, "metres");
    near(U.parseLength("250 cm", function () { return NaN; }), 2.5 / 0.3048, 1e-9, "cm"); near(U.parseLength("2500mm", function () { return NaN; }), 2.5 / 0.3048, 1e-9, "mm");
    near(U.parseLength("8'", function (s) { return s === "8'" ? 8 : NaN; }), 8, 0, "feet still work");
    eq(U.text("West hoist at 16 ft adds about 905 lb"), "West hoist at 4.88 m adds about 411 kg", "engine text converted");
    S.rig.settings.units = undefined; S.commit();
    eq(U.metric(), false, "back to imperial"); eq(U.text("905 lb"), "905 lb", "imperial text untouched"); eq(U.f("len", 10, 2), "10 ft", "imperial");
  });

  add("loads: duplicate, and copy to another truss keeps the distance from the CENTRE", function () {
    var S = TLA.store; S.newRig();
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 30, hoists: [3, 27] }), b = S.addTruss({ name: "B", x: 0, y: 10, angle: 0, length: 20, hoists: [2, 18] });
    a.loads.push({ id: S.newId("l"), distance: 20, weight: 50, note: "x", mirror: true }); S.commit();
    var d = S.duplicateLoad(a.id, a.loads[0].id);
    eq(S.truss(a.id).loads.length, 2, "duplicated"); near(d.distance, 20, 1e-9, "same spot"); eq(d.mirror, true, "keeps mirror");
    var r = S.copyLoads(a.id, [], b.id);
    eq(r.copied, 2, "both copied"); eq(r.clamped, 0, "none clamped");
    var c = S.truss(b.id).loads[0];
    near(c.distance, 15, 1e-9, "5 ft past centre of A -> 5 ft past centre of B (15)"); eq(c.from, "center", "measured from centre"); near(c.pos, 5, 1e-9, "offset kept");
    a.loads.push({ id: S.newId("l"), distance: 29, weight: 10 }); S.commit();
    var r2 = S.copyLoads(a.id, [a.loads[2].id], b.id);
    eq(r2.clamped, 1, "past the end of the shorter truss -> held at its end"); near(S.truss(b.id).loads[2].distance, 20, 1e-9, "at the end");
  });

  add("loads can be reordered and sorted; corner blocks can be renumbered in line order", function () {
    var S = TLA.store; S.newRig();
    var t = S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 30, hoists: [3, 27] });
    [20, 5, 12].forEach(function (d, k) { t.loads.push({ id: "L" + k, distance: d, weight: 10 + k }); }); S.commit();
    S.moveLoad(t.id, "L2", -1);
    eq(S.truss(t.id).loads.map(function (l) { return l.id; }).join(), "L0,L2,L1", "moved up");
    S.moveLoad(t.id, "L0", -1); eq(S.truss(t.id).loads[0].id, "L0", "top row stays");
    S.sortLoads(t.id); eq(S.truss(t.id).loads.map(function (l) { return l.distance; }).join(), "5,12,20", "sorted by position");
    near(S.results.hoists[0].reaction, S.results.hoists[0].reaction, 0, "still solves");
    var c = TLA.data.corners.filter(function (x) { return x.code === "TRUAA-90"; })[0];
    S.addBlockToLine(t.id, c.id, { at: "end" }); S.addBlockToLine(t.id, c.id, { at: "start" });
    S.hostedBlocks(t.id).forEach(function (b, i) { b.name = "X" + (9 - i); });
    eq(S.renumberBlocks(t.id, 1), 2, "two blocks");
    eq(S.hostedBlocks(t.id).map(function (b) { return b.name; }).join(), "T CB1,T CB2", "numbered from the start of the line");
    S.renumberBlocks(t.id, 5);
    eq(S.hostedBlocks(t.id).map(function (b) { return b.name; }).join(), "T CB5,T CB6", "start number honoured");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
