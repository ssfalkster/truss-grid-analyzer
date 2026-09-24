/* 1.22.0: the Braceworks / Production Assist list - hoists hung below a truss, dead hangs, level offsets, the check-rig
 * list, cable allowance and load factors, measured loads. */
(function (g) {
  var TLA = g.TLA, S = TLA.store, add = g.__addTLATest;
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function hoistOf(name, d) {
    var h = S.results.hoists.filter(function (x) { return x.trussName === name && Math.abs(x.distance - d) < 0.01; })[0];
    if (!h) throw new Error("no hoist " + name + " @" + d);
    return h;
  }
  /** A 20 ft carrier on hoists at 2 and 18 ft, and a 10 ft truss across it (lower), on a hoist at 0 and one hung from
   * the carrier at its 10 ft point. */
  function hungRig(opts) {
    opts = opts || {};
    S.newRig();
    var up = S.addTruss({ name: "Upper", x: 0, y: 0, angle: 0, length: 20, hoists: opts.upHoists || [2, 18] });
    var lo = S.addTruss({ name: "Lower", x: 10, y: -5, angle: 90, length: 10, hoists: opts.loHoists || [0, 5] });
    var hs = lo.supports.filter(function (s) { return Math.abs(s.distance - 5) < 1e-9; })[0];
    hs.hangFrom = up.id;
    lo.loads.push({ id: S.newId("l"), distance: opts.loadAt != null ? opts.loadAt : 5, weight: 500 });
    if (opts.setup) opts.setup(up, lo, hs);
    S.commit();
    return { up: up, lo: lo, hs: hs };
  }

  add("hung hoist: the carrier takes the hung hoist's high hook dynamic load; its hoists too, unless Rig settings turn it off", function () {
    var x = hungRig(), r = S.results;
    eq(r.primary, "grillage", "whole-rig analysis ran");
    var hh = hoistOf("Lower", 5);
    eq(hh.hung, x.up.id, "marked as hung from Upper");
    // Lower is statically determinate (hoists at 0 and 5, the rest a cantilever): the hung hoist takes the 500 lb
    // and the truss weight, the other hoist nothing
    var wl = r.trusses[x.lo.id].dbTruss.weight_per_ft_lb, wu = r.trusses[x.up.id].dbTruss.weight_per_ft_lb;
    near(hh.reaction, 500 + 10 * wl, 1e-6, "low hook load of the hung hoist");
    near(hoistOf("Lower", 0).reaction, 0, 1e-6, "other hoist");
    var dyn = hh.hoist.dynamicLoad;
    near(dyn, (hh.reaction + hh.hoist.hoistChain) * hh.hoist.dynamicFactor, 1e-6, "high hook dynamic");
    // the carrier: its check sees the dynamic load at 10 ft
    var inj = r.trusses[x.up.id].injected.filter(function (i) { return i.source.hang; })[0];
    near(inj.distance, 10, 1e-9, "hooks on at the plan crossing"); near(inj.weight, dyn, 1e-6, "carrier checked with the dynamic load");
    eq(/\+dyn$/.test(r.trusses[x.up.id].model), true, "carrier case governs the carrier");
    // its hoists: half of it each, plus half the carrier
    near(hoistOf("Upper", 2).reaction, (dyn + 20 * wu) / 2, 1e-4, "carrier hoist includes the dynamic load");
    // totals: only the hoists to the structure
    eq(r.totals.hung, 1, "one hung hoist");
    near(r.totals.staticLoad, hoistOf("Upper", 2).hoist.staticLoad + hoistOf("Upper", 18).hoist.staticLoad + hoistOf("Lower", 0).hoist.staticLoad, 1e-6, "totals leave the hung hoist out");
    r.models.forEach(function (m) { near(r.totals.byModel[m] - r.totals.hoistChain, r.totals.applied, 1e-6, m + " static solve balances"); });

    S.rig.settings.hungDynamic = false; S.commit();
    var st = hoistOf("Lower", 5).hoist;
    near(hoistOf("Upper", 2).reaction, (st.reaction + st.hoistChain + 20 * wu) / 2, 1e-4, "setting off: carrier hoists take the static load");
    eq(/\+dyn$/.test(S.results.trusses[x.up.id].model), true, "the carrier truss is still checked with the dynamic load");
  });

  add("hung hoist: coupled solve - the carrier sags, the hung truss sheds load (same as a hoist spring of the carrier's stiffness)", function () {
    // a weightless carrier on rigid hoists at its ends, the hung hoist at mid-span, no hoist weights: the carrier is a
    // spring k = 1 / (L^3 / 48EI + L / 4GA) under the chain
    function setup(up, lo, hs) {
      up.weightless = true;
      [up, lo].forEach(function (t) { t.supports.forEach(function (s) { s.hoistId = 1; }); });
    }
    var x = hungRig({ upHoists: [0, 20], loHoists: [0, 5, 10], loadAt: 7.5, setup: setup });
    var sec = S.results.trusses[x.up.id].section, kc = 1 / (Math.pow(20, 3) / (48 * sec.EI) + 20 / (4 * sec.GA));
    var coupled = [0, 5, 10].map(function (d) { return hoistOf("Lower", d).compat.hinged; });
    near(coupled[0] + coupled[1] + coupled[2], 500 + 10 * S.results.trusses[x.lo.id].dbTruss.weight_per_ft_lb, 1e-6, "lower truss balances");
    // the same lower truss on its own, the middle hoist a spring of the carrier's stiffness
    S.newRig();
    var lo2 = S.addTruss({ name: "Lower", x: 10, y: -5, angle: 90, length: 10, hoists: [0, 5, 10] });
    lo2.supports.forEach(function (s) { s.hoistId = 1; if (Math.abs(s.distance - 5) < 1e-9) s.stiffness = kc / 12; });
    lo2.loads.push({ id: S.newId("l"), distance: 7.5, weight: 500 }); S.commit();
    [0, 5, 10].forEach(function (d, i) { near(coupled[i], hoistOf("Lower", d).compat.hinged, 1e-3, "hoist @" + d); });
    var rigidMid = TLA.beam.solve({ length: 10, supports: [0, 5, 10], loads: [{ distance: 7.5, weight: 500 }], trussWeightPerFt: S.results.trusses[lo2.id].dbTruss.weight_per_ft_lb }).reactions[1];
    eq(coupled[1] < rigidMid - 1, true, "the sagging carrier takes less than a rigid hoist would (" + coupled[1] + " < " + rigidMid + ")");
  });

  add("hung hoist: level sensitivity, slack chain, not under its carrier", function () {
    // with the carrier's own weight and the hoist weight on it, a carrier can sag more than the truss below: then the
    // chain unloads and goes slack (tension-only, like every hoist)
    var x = hungRig({ loHoists: [0, 5, 10], loadAt: 2 });
    eq(hoistOf("Lower", 5).slack, true, "slack when the carrier sags more than the truss below");
    x = hungRig({ upHoists: [0, 20], loHoists: [0, 5, 10], setup: function (up, lo) { up.weightless = true; [up, lo].forEach(function (t) { t.supports.forEach(function (s) { s.hoistId = 1; }); }); } });
    var h = hoistOf("Lower", 5);
    eq(h.slack, false, "carries load");
    eq(h.trim && h.trim.self > 0, true, "running the hung hoist 1/4\" high adds load to it");
    // a heavy load on a cantilever end makes one of the lower truss's hoists push
    S.newRig();
    var up = S.addTruss({ name: "Upper", x: 0, y: 0, angle: 0, length: 20, hoists: [2, 18] });
    var lo = S.addTruss({ name: "Lower", x: 10, y: -5, angle: 90, length: 10, hoists: [2, 5, 10] });
    lo.supports.filter(function (s) { return s.distance === 5; })[0].hangFrom = up.id;
    lo.loads.push({ id: S.newId("l"), distance: 0, weight: 2000 }); S.commit();
    eq(hoistOf("Lower", 10).slack || hoistOf("Lower", 5).slack, true, "one of them goes slack");
    // not under the carrier
    x = hungRig({ setup: function (up, lo) { lo.x = 30; } });
    eq(S.results.warnings.some(function (w) { return w.kind === "hang" && /not under it/.test(w.message); }), true, "warned");
  });
  add("hung hoist: the calc sheet builds, each truss balances, the totals leave the hung hoist out", function () {
    hungRig(); TLA.panels.mount(S); TLA.report.mount(S);
    var el = TLA.report.build(), text = el.textContent;
    eq(/NaN|undefined/.test(text), false, "no NaN / undefined");
    eq(text.indexOf("below Upper") >= 0, true, "the hung hoist is marked");
    eq(/Hoists hung below a truss/.test(text), true, "basis explains it");
    var n = 0;
    Array.prototype.forEach.call(el.querySelectorAll(".work"), function (w) { if (/^Balance:/.test(w.textContent)) { n++; eq(/\(balances\)/.test(w.textContent), true, w.textContent); } });
    eq(n, 2, "a balance line per truss");
  });

  /** A 30 ft truss on three supports at 0, 15, 30 ft, 400 lb at 7.5 and 22.5 ft; the middle one a dead hang (3/8" GAC, 20 ft). */
  function deadRig(setup) {
    S.newRig();
    var t = S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 30, hoists: [0, 15, 30] });
    var d = t.supports[1];
    TLA.panels.setDead(d, true); d.ropeLength = 20;
    t.loads.push({ id: S.newId("l"), distance: 7.5, weight: 400 }, { id: S.newId("l"), distance: 22.5, weight: 400 });
    if (setup) setup(t, d);
    S.commit();
    return { t: t, d: d };
  }

  add("dead hang: WLL = breaking strength / design factor (7, 8 or 10:1, default 10), capped by the assembly WLL; static; rope weight", function () {
    var x = deadRig(), h = hoistOf("T", 15).hoist, rope = TLA.limits.rope("gac-3/8");
    eq(h.dead, true, "a dead hang");
    near(h.capacity, 14400 / 10, 1e-9, "3/8 GAC at 10:1");
    near(h.dynamicFactor, 1, 0, "static");
    near(h.dynamicLoad, h.staticLoad, 1e-9, "no dynamic increase");
    near(h.hoistChain, rope.weight_per_ft_lb * 20, 1e-9, "rope weight, no hoist body");
    [7, 8].forEach(function (f) { S.rig.settings.ropeDesignFactor = f; S.commit(); near(hoistOf("T", 15).hoist.capacity, 14400 / f, 1e-9, f + ":1"); });
    x.d.wll = 1000; S.commit();
    near(hoistOf("T", 15).hoist.capacity, 1000, 1e-9, "the weaker assembly WLL governs");
    x.d.dlf = 1.2; S.commit();
    near(hoistOf("T", 15).hoist.dynamicFactor, 1.2, 1e-9, "a typed factor is used");
    x.d.rope = undefined; x.d.wll = undefined; S.commit();
    eq(hoistOf("T", 15).hoist.status, "Overloaded", "no rope and no WLL: Overloaded until entered");
  });

  add("dead hang: rigid with rigid hoists; on a rig of spring hoists its rope is a stiffer spring (EA/L) and draws load", function () {
    deadRig();
    var withDead = hoistOf("T", 15).reaction;
    S.newRig(); var t = S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 30, hoists: [0, 15, 30] }); t.loads.push({ id: S.newId("l"), distance: 7.5, weight: 400 }, { id: S.newId("l"), distance: 22.5, weight: 400 }); S.commit();
    near(withDead, hoistOf("T", 15).reaction, 1e-6, "rigid rig: same as a hoist");
    var soft = 1500;
    S.rig.settings.hoistStiffness = soft; S.commit();
    var hoistMid = hoistOf("T", 15).reaction;
    deadRig(function () { S.rig.settings.hoistStiffness = soft; });
    var k = TLA.limits.ropeStiffness(S.rig.trusses[0].supports[1]) / 12;
    eq(k > soft, true, "3/8 GAC over 20 ft is stiffer than the hoists (" + Math.round(k) + " lb/in)");
    eq(hoistOf("T", 15).reaction > hoistMid + 0.5, true, "the dead hang draws load (" + hoistOf("T", 15).reaction + " > " + hoistMid + ")");
  });

  add("dead hang: calc sheet numbers it DH1 and explains its WLL", function () {
    deadRig(); TLA.panels.mount(S); TLA.report.mount(S);
    var text = TLA.report.build().textContent;
    eq(text.indexOf("DH1") >= 0, true, "DH1"); eq(text.indexOf("H2") >= 0, true, "hoists H1, H2");
    eq(/NaN|undefined/.test(text), false, "no NaN / undefined");
    eq(/Dead hangs \(DH\)/.test(text), true, "explained");
  });

  /** A weightless 20 ft truss on hoists at 0, 10, 20 ft with 1000 lb at 5 and 15 ft. */
  function levelRig(setup) {
    S.newRig();
    var t = S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 10, 20] });
    t.weightless = true;
    t.loads.push({ id: S.newId("l"), distance: 5, weight: 1000 }, { id: S.newId("l"), distance: 15, weight: 1000 });
    if (setup) setup(t);
    S.commit();
    return t;
  }

  add("level offset: a hoist hung 0.1 in high takes the load that pushes the truss up by 0.1 in there (two-span beam)", function () {
    var t = levelRig(), base = hoistOf("T", 10).compat.hinged - hoistOf("T", 10).hoist.hoistChain;
    var sec = S.results.trusses[t.id].section, dz = 0.1 / 12;
    // a simple 20 ft span pushed up at mid-span: P = dz / (L^3 / 48EI + L / 4GA)
    var P = dz / (Math.pow(20, 3) / (48 * sec.EI) + 20 / (4 * sec.GA));
    t.supports[1].level = 0.1; S.commit();
    var mid = hoistOf("T", 10);
    near(mid.compat.hinged - mid.hoist.hoistChain, base + P, 1e-6, "middle hoist");
    near(hoistOf("T", 0).reaction + hoistOf("T", 20).reaction + mid.reaction, 2000, 1e-6, "no load added");
    // where the load comes from: the parts still add up, with the level offsets as a part of their own
    var a = TLA.grillage.attribution(S.rig, S.results, S.db(), t.id, t.supports[1].id);
    near(a.parts.reduce(function (x, p) { return x + p.weight; }, 0), mid.reaction, 1e-6, "parts add up");
    eq(a.parts.some(function (p) { return /level offsets/.test(p.name); }), true, "level offsets listed");
    // the load-path method can't do it: never the silent fallback
    eq(S.results.primary, "grillage", "whole-rig analysis");
  });

  add("out-of-level tolerance: each hoist's check carries the sum of what every hoist alone at +/- tol does to it", function () {
    levelRig(function () { S.rig.settings.levelTolerance = 0.25; });
    var sol = S.results.compat.rigid, ids = S.results.hoists.map(function (h) { return h.truss + ":" + h.support; });
    S.results.hoists.forEach(function (h, i) {
      var sum = 0;
      ids.forEach(function (j) { sum += Math.abs(sol.lift(j, 0.25 / 12).reactions[ids[i]]); });
      near(h.level.add, sum, 1e-6, "allowance @" + h.distance);
      near(h.hoist.staticLoad, h.reaction + sum + h.hoist.hoistChain, 1e-6, "in the high hook load @" + h.distance);
      near(h.level.low, h.reaction - sum, 1e-9, "low side");
      eq(h.level.add > 0, true, "short stiff spans: a real allowance");
    });
    S.rig.settings.levelTolerance = undefined; S.commit();
    S.results.hoists.forEach(function (h) { eq(h.level, undefined, "off by default"); });
  });

  add("level: the calc sheet lists designed levels and the tolerance allowance", function () {
    levelRig(function (t) { t.supports[1].level = 0.1; S.rig.settings.levelTolerance = 0.25; });
    TLA.panels.mount(S); TLA.report.mount(S);
    var text = TLA.report.build().textContent;
    eq(/NaN|undefined/.test(text), false, "no NaN / undefined");
    eq(/Designed hoist levels/.test(text), true, "offsets listed");
    eq(/\+ Level/.test(text), true, "allowance column");
  });

  function checks() { return S.results.warnings.filter(function (w) { return w.kind === "check"; }); }
  add("check rig: the example box is clean; each input mistake is listed once, and changes no result", function () {
    S.newRig(); TLA.samples.box(S); S.commit();
    eq(checks().length, 0, "example box: nothing");
    var before = JSON.stringify(S.results.hoists.map(function (x) { return x.hoist.staticLoad; }));
    var west = S.rig.trusses.filter(function (t) { return t.name === "West"; })[0];
    west.loads.push({ id: S.newId("l"), distance: 4, weight: 0, note: "spare" });
    var dup = JSON.parse(JSON.stringify(west.supports.filter(function (s) { return s.kind === "hoist"; })[0])); dup.id = S.newId("s"); west.supports.push(dup);
    S.commit();
    var c = checks();
    eq(c.filter(function (w) { return /no weight/.test(w.message); }).length, 1, "zero-weight load");
    eq(c.filter(function (w) { return /same point/.test(w.message); }).length, 1, "duplicate hoist");
    west.supports.pop(); west.loads.pop(); S.commit();
    eq(JSON.stringify(S.results.hoists.map(function (x) { return x.hoist.staticLoad; })), before, "back to the same results");
  });

  add("check rig: a bolted frame with its hoists in one line; trusses crossing with no joint; bolted ends apart", function () {
    S.newRig();
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 20, hoists: [2, 18] });
    var b = S.addTruss({ name: "B", x: 10, y: -5, angle: 90, length: 10, hoists: [] });
    S.commit();
    eq(checks().some(function (w) { return /A and B cross/.test(w.message) && w.level === "note"; }), true, "crossing without a joint");
    b.x = 10; b.y = 0; b.length = 10; b.supports.push({ id: S.newId("s"), kind: "truss", distance: 0, onTruss: a.id, onDistance: 10, hardwareWeight: 0 });
    S.commit();
    eq(checks().some(function (w) { return /hoists are in one line|only 2 hoists/.test(w.message); }), true, "frame on 2 hoists");
    b.supports[0].onDistance = 14; S.commit();
    eq(checks().some(function (w) { return /in away from it on the plan/.test(w.message); }), true, "bolted ends don't meet");
    eq(TLA.rig.assembly(S.rig, b.id)[a.id], true, "assembly: B is joined to A");
  });

  add("allowances: cable per foot joins the UDL; load factors by category; the rig as typed is not changed", function () {
    S.newRig();
    var t = S.addTruss({ name: "T", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 20] });
    t.loads.push({ id: S.newId("l"), distance: 10, weight: 100, cat: "lighting" }, { id: S.newId("l"), distance: 10, weight: 50 });
    S.commit();
    var r0 = hoistOf("T", 0).reaction;
    S.rig.settings.cablePerFt = 2; S.commit();
    near(hoistOf("T", 0).reaction, r0 + 20, 1e-6, "2 lb/ft x 20 ft, half each");
    near(S.results.trusses[t.id].limits.segments.filter(function (sg) { return sg.type === "span"; })[0].udlUsed, 40, 1e-9, "the span check sees it as UDL");
    t.cablePerFt = 0; S.commit();
    near(hoistOf("T", 0).reaction, r0, 1e-6, "the truss's own 0 = no cable");
    t.cablePerFt = undefined; S.rig.settings.cablePerFt = undefined;
    S.rig.settings.loadFactors = { lighting: 1.1, other: 1.2 }; S.commit();
    near(hoistOf("T", 0).reaction, r0 + (10 + 10) / 2, 1e-6, "100 x 1.1 and 50 x 1.2 (no category = other)");
    eq(t.loads[0].weight, 100, "typed weight kept"); eq(t.wallWeight || 0, 0, "typed UDL kept");
    var a = TLA.grillage.attribution(S.rig, S.results, S.db(), t.id, t.supports[0].id);
    near(a.parts.reduce(function (x, p) { return x + p.weight; }, 0), hoistOf("T", 0).reaction, 1e-6, "breakdown adds up");
    TLA.panels.mount(S); TLA.report.mount(S);
    var el = TLA.report.build(), text = el.textContent;
    eq(/Load factors by category: Lighting x 1.1/.test(text), true, "calc sheet lists the factors");
    eq(/NaN|undefined/.test(text), false, "no NaN / undefined");
    Array.prototype.forEach.call(el.querySelectorAll(".work"), function (w) { if (/^Balance:/.test(w.textContent)) eq(/\(balances\)/.test(w.textContent), true, w.textContent); });
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
