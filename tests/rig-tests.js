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

  add("hoist output: loads & truss + hoist & chain = total static; dynamic = static x factor (16 fpm = 1.25, default 1.25, override wins)", function () {
    var S = TLA.store; S.newRig();
    var t = S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 20, hoists: [3, 17] });
    t.loads.push({ id: S.newId("l"), distance: 10, weight: 200 }); S.commit();
    var h0 = S.results.hoists[0].hoist;
    near(h0.reaction + h0.hoistChain, h0.staticLoad, 1e-9, "static = reaction + hoist & chain");
    near(h0.dynamicLoad, h0.staticLoad * h0.dynamicFactor, 1e-9, "dynamic = static x factor");
    var hd = TLA.data.hoists.filter(function (x) { return x.speed_fpm === 16; })[0];
    near(TLA.limits.checkHoist(hd, 10, 100).dynamicFactor, 1.25, 1e-12, "16 fpm hoist = 1.25");
    near(TLA.limits.checkHoist({ weight_lb: 50, chain_weight_per_ft_lb: 1, speed_fpm: 0, capacity_lb: 2000 }, 10, 100).dynamicFactor, 1.25, 1e-12, "unknown speed -> default 1.25");
    near(TLA.limits.checkHoist({ weight_lb: 50, chain_weight_per_ft_lb: 1, speed_fpm: 0, capacity_lb: 2000 }, 10, 100, 0, 0, 1.3).dynamicFactor, 1.3, 1e-12, "settings default");
    near(TLA.limits.checkHoist(hd, 10, 100, 0, 1.5).dynamicFactor, 1.5, 1e-12, "per-hoist override");
    S.rig.trusses[0].supports[0].dlf = 1.4; S.commit();
    near(S.results.hoists[0].hoist.dynamicFactor, 1.4, 1e-12, "override reaches the results");
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
