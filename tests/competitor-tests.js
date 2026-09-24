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
})(typeof globalThis !== "undefined" ? globalThis : window);
