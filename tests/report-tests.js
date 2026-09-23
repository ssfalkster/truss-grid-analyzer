/* Calculation sheet (1.13.0): it shows what the solve computed, adds up, and never changes a result. */
(function (g) {
  var TLA = g.TLA, S = TLA.store, add = g.__addTLATest;
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function example() { S.newRig(); TLA.samples.box(S); S.commit({ noUndo: true }); TLA.panels.mount(S); TLA.report.mount(S); }

  add("calc sheet: memberCapacity names the table rows its allowable moment and shear come from", function () {
    TLA.data.trusses.forEach(function (x) {
      var c = TLA.limits.memberCapacity(x), a = c.at;
      if (c.momentFromPoint) near(a.point.load * a.point.length / 4, c.momentFromPoint, 1e-6, x.description + " CPL moment row");
      if (c.momentFromUniform) near(a.uniform.load * a.uniform.length / 8, c.momentFromUniform, 1e-6, x.description + " UDL moment row");
      if (c.shear) near(a.shear.load / 2, c.shear, 1e-6, x.description + " shear row");
      if (a.point) eq(a.point.unit, x.units === "metric" && x.udl_kg ? "m" : "ft", x.description + " row unit");
    });
  });

  add("calc sheet: table rows are read as the checks read them (next whole foot, or whole metre for metric data)", function () {
    var imp = TLA.data.trusses.filter(function (x) { return x.units !== "metric" && x.cpl_lb && x.cpl_lb.length > 20; })[0];
    var r = TLA.report.lookup(imp, "cpl", 10.5);
    eq(r.row, 11, "10.5 ft reads the 11 ft row"); eq(r.unit, "ft", "unit"); near(r.value, imp.cpl_lb[10], 0, "value");
    eq(TLA.report.lookup(imp, "cpl", 12).row, 12, "a whole foot reads its own row");
    var met = TLA.data.trusses.filter(function (x) { return x.units === "metric" && x.cpl_kg; })[0];
    var m = TLA.report.lookup(met, "cpl", 10);                                        // 10 ft = 3.048 m -> 4 m row
    eq(m.row, 4, "metric row"); eq(m.unit, "m", "metric unit"); near(m.value, TLA.limits.tableAt(met, "cpl", 10), 1e-9, "metric value");
    eq(TLA.report.lookup(imp, "cpl", imp.cpl_lb.length + 3).past, true, "past the end of the table");
  });

  add("calc sheet: builds for the example box, balances, and does not change any result", function () {
    example();
    var before = JSON.stringify(S.results.hoists.map(function (x) { return [x.reaction, x.hoist.staticLoad, x.hoist.dynamicLoad, x.hoist.status]; }));
    var el = TLA.report.build(), text = el.textContent;
    eq(JSON.stringify(S.results.hoists.map(function (x) { return [x.reaction, x.hoist.staticLoad, x.hoist.dynamicLoad, x.hoist.status]; })), before, "results unchanged");
    S.rig.trusses.filter(function (t) { return !t.isBlock; }).forEach(function (t) { eq(text.indexOf(t.name) >= 0, true, t.name + " on the sheet"); });
    S.results.hoists.forEach(function (x, i) { eq(text.indexOf("H" + (i + 1)) >= 0, true, "H" + (i + 1)); });
    var bal = el.querySelectorAll(".work"), n = 0;
    Array.prototype.forEach.call(bal, function (w) { if (/^Balance:/.test(w.textContent)) { n++; eq(/\(balances\)/.test(w.textContent), true, w.textContent); } });
    eq(n, S.rig.trusses.filter(function (t) { return !t.isBlock; }).length, "a balance line per truss");
    eq(/NaN|undefined/.test(text), false, "no NaN / undefined");
    // each hoist's static load is the sum of the parts the sheet lists (F4)
    S.results.hoists.forEach(function (x) {
      var t = S.truss(x.truss), s = t.supports.filter(function (q) { return q.id === x.support; })[0], e = S.db().hoists.filter(function (q) { return q.id === s.hoistId; })[0];
      near(x.hoist.reaction + (x.hoist.added || 0) + e.weight_lb + e.chain_weight_per_ft_lb * s.chainLength + (s.hardwareWeight || 0), x.hoist.staticLoad, 1e-9, "static parts");
    });
    eq(el.querySelectorAll(".rplan circle.ho").length, S.results.hoists.length, "every hoist on the plan");
  });

  add("calc sheet: the input fingerprint follows the inputs, not the names on the sheet", function () {
    example();
    var f0 = TLA.report.fingerprint(S.rig);
    S.rig.report = { preparedBy: "Someone", project: "Show" };
    eq(TLA.report.fingerprint(S.rig), f0, "names and project don't change it");
    S.rig.trusses[0].loads.push({ id: "lx", distance: 1, weight: 1, note: "", mirror: false });
    eq(TLA.report.fingerprint(S.rig) !== f0, true, "a new load changes it");
    eq(/^[0-9A-F]{8}$/.test(f0), true, "8 hex digits");
  });

  add("calc sheet: a single truss on two hoists shows statics that match its reactions; metric shows kg", function () {
    S.newRig(); TLA.panels.mount(S); TLA.report.mount(S);
    var t = S.addTruss({ name: "Pipe", x: 0, y: 0, angle: 0, length: 30, hoists: [2, 24] });
    t.wallWeight = 300; t.loads.push({ id: "a", distance: 10, weight: 1200, note: "LED", mirror: false }, { id: "b", distance: 28, weight: 600, note: "Speaker", mirror: false });
    S.commit();
    var el = TLA.report.build(), st = Array.prototype.filter.call(el.querySelectorAll(".work"), function (w) { return /^Statics/.test(w.textContent); })[0];
    eq(!!st, true, "statics line");
    var rB = (1200 * 8 + 600 * 26 + (300 + t.length * TLA.data.trusses.filter(function (x) { return x.id === t.trussId; })[0].weight_per_ft_lb) * 13) / 22;
    eq(st.textContent.indexOf(TLA.units.f("w", rB, 1)) >= 0, true, "R2 = " + rB + " in: " + st.textContent);
    near(S.results.hoists[1].reaction, rB, 1e-6, "and the solve agrees");
    S.rig.settings.units = "metric"; S.commit();
    var tx = TLA.report.build().textContent;
    eq(/ kg/.test(tx) && /Units.*metric/.test(tx), true, "metric");
    S.rig.settings.units = undefined; S.commit();
  });

  add("calc sheet: a span whose UDL row is 0 shows f = 0, so the working gives the capacity printed", function () {
    S.newRig(); TLA.panels.mount(S); TLA.report.mount(S);
    var t = S.addTruss({ name: "Odd", x: 0, y: 0, angle: 0, length: 10, hoists: [0, 10] }), cpl = [], udl = [];
    for (var i = 0; i < 20; i++) { cpl.push(2000); udl.push(i === 9 ? 0 : 3000); }
    t.custom = { manufacturer: "Custom", description: "Test 12x12", weight_per_ft_lb: 5, max_span_ft: 20, cpl_lb: cpl, udl_lb: udl, repetitive_use: false, source: "User" };
    t.loads.push({ id: "a", distance: 5, weight: 100, note: "", mirror: false });
    S.commit();
    var seg = S.results.trusses[t.id].limits.segments.filter(function (x) { return x.type === "span"; })[0];
    eq(seg.capacity, 0, "the engine gives this span no capacity");
    var w = Array.prototype.filter.call(TLA.report.build().querySelectorAll(".work"), function (x) { return /^Span 1/.test(x.textContent); })[0].textContent;
    eq(/UDL row is 0, so f = 0/.test(w), true, w);
    eq(/f = 1/.test(w), false, "no f = 1: " + w);
  });

  add("calc sheet: open / close - the page footer style goes with the sheet, isOpen follows it", function () {
    if (!document.getElementById("report")) document.body.appendChild(TLA.panels.h("section", { id: "report", hidden: true }));
    example();
    TLA.report.open();
    eq(TLA.report.isOpen(), true, "open"); eq(!!document.getElementById("report-page"), true, "footer style while open");
    TLA.report.close();
    eq(TLA.report.isOpen(), false, "closed"); eq(!!document.getElementById("report-page"), false, "footer style removed");
    var host = document.getElementById("report"); host.parentNode.removeChild(host);
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
