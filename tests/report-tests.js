/* Calculation sheet (1.14.0): it shows what the solve computed, adds up, and never changes a result. */
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
    eq(el.querySelector(".rplan").querySelectorAll("circle.ho").length, S.results.hoists.length, "every hoist on the plan");
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
    var w = Array.prototype.filter.call(TLA.report.build().querySelectorAll(".calcs"), function (x) { return /^Span 1/.test(x.textContent); })[0].textContent;
    eq(/f = 0 \(the UDL row is 0/.test(w), true, w);
    eq(/C = CPL × k × f = 2,000 × 0\.85 × 0 = 0 lb/.test(w), true, "capacity line: " + w);
    eq(/f = 1/.test(w), false, "no f = 1: " + w);
  });

  add("calc sheet paper (1.17.0): Letter for imperial and A4 for metric unless set; the choice is saved with the rig and leaves the input fingerprint alone", function () {
    example();
    var fp = TLA.report.fingerprint(S.rig);
    eq(TLA.report.paper(), "letter", "imperial default");
    S.rig.settings.units = "metric"; eq(TLA.report.paper(), "a4", "metric default"); delete S.rig.settings.units;
    S.rig.report = { paper: "a4" }; eq(TLA.report.paper(), "a4", "set: A4 even in imperial");
    eq(TLA.report.fingerprint(S.rig), fp, "paper is not a calculation input");
    S.rig.report = { paper: "bogus" }; eq(TLA.report.paper(), "letter", "unknown value falls back to the default");
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
  add("calc sheet (1.25.0): every truss shows its deflection drawing and an F7 deflection check matching the results", function () {
    example();
    var el = TLA.report.build(), text = el.textContent;
    eq(/F7/.test(text) && /Deflection check \(F7\)/.test(text), true, "F7 formula and per-truss check");
    var trusses = S.rig.trusses.filter(function (t) { return !t.isBlock && S.results.trusses[t.id] && S.results.trusses[t.id].deflection; });
    eq(el.querySelectorAll(".rfig svg").length >= trusses.length * 2, true, "deflection drawings present");
    eq((text.match(/Deflection, exaggerated/g) || []).length, trusses.length, "one drawing per truss");
    eq((text.match(/Deflection check \(F7\)/g) || []).length, trusses.length, "one check per truss");
    trusses.forEach(function (t) {
      var dc = S.results.trusses[t.id].deflection;
      dc.spans.forEach(function (sp) { var v = TLA.panels.deflText(sp.max); eq(text.indexOf(v) >= 0, true, t.name + " span " + sp.index + " sag " + v); });
    });
    eq(/NaN|undefined/.test(text), false, "no NaN / undefined");
  });

  add("calc sheet (1.25.5): estimate notice citing ANSI E1.6-3 2.11 on an indeterminate rig, Prepared by / for, hoist schedule", function () {
    example();
    S.rig.report = { preparedBy: "GESF", preparedFor: "Venue", checkedBy: "QQchecker" };
    var el = TLA.report.build(), text = el.textContent, n = el.querySelector(".notice");
    eq(!!n && el.firstChild.nextSibling === n, true, "notice right under the title block");
    eq(/Estimate only/.test(n.textContent) && /E1\.6-3-2019/.test(n.textContent) && /section 2\.11/.test(n.textContent) && /indeterminate structure/.test(n.textContent), true, n.textContent);
    eq((text.match(/Prepared for/g) || []).length, 2, "Prepared for in the title block and at the end");
    eq(/Checked by/.test(text) || text.indexOf("QQchecker") >= 0, false, "Checked by no longer printed");
    eq(el.querySelectorAll("tfoot").length, 0, "no tfoot: a total must not repeat on every printed page");
    var sch = el.querySelector(".sched");
    eq(!!sch && sch.querySelectorAll("tbody tr").length === S.results.hoists.length, true, "one schedule row per hoist");
    eq(el.querySelectorAll(".rplan").length, 2, "plan in section 3 and on the schedule");
    eq(/Speed/.test(text), true, "hoist speed column");
  });

  add("calc sheet (1.26.4): a warning from a maker's document names it and writes out its address", function () {
    example();
    var url = "https://www.christielites.com/file_uploads/Spec_288_Load%20Table%20-%20Corner%20Blocks%20-%20CL.pdf";
    S.results.warnings.push({ kind: "corner", level: "corner", message: "Box truss: test warning", link: { url: url, text: "Christie Lites corner-block data" } });
    var el = TLA.report.build(), li = Array.prototype.filter.call(el.querySelectorAll(".warns li"), function (x) { return /test warning/.test(x.textContent); })[0];
    eq(!!li, true, "the warning is listed");
    eq(/Source: Christie Lites corner-block data, https:/.test(li.textContent), true, li.textContent);
    var a = li.querySelector("a"); eq(a && a.getAttribute("href"), url, "linked"); eq(a.getAttribute("target"), "_blank", "new tab");
    S.commit({ noUndo: true });
  });
  add("calc sheet (1.25.5): a truss on two hoists is not called indeterminate; three in a line are", function () {
    S.newRig(); TLA.panels.mount(S); TLA.report.mount(S);
    var t = S.addTruss({ name: "Pipe", x: 0, y: 0, angle: 0, length: 30, hoists: [2, 28] }); S.commit();
    var n = TLA.report.build().querySelector(".notice").textContent;
    eq(/Estimate only/.test(n) && !/indeterminate structure/.test(n), true, n);
    S.addHoist(t.id); S.commit();
    n = TLA.report.build().querySelector(".notice").textContent;
    eq(/3 hoists in a straight line/.test(n), true, n);
  });

  add("calc sheet (1.25.5): deflection text - 3 decimals of an inch, L/d capped at L/10,000+", function () {
    eq(TLA.panels.deflText(0.01 / 12), "0.01 in", "0.010 in");
    eq(TLA.panels.deflText(0.0001 / 12), "0 in", "below a thousandth");
    eq(TLA.panels.ldText(10, 0.001), "L/10,000+", "cap");
    eq(TLA.panels.ldText(10, 10 / 8204), "L/" + (8204).toLocaleString(), "under the cap");
    eq(TLA.panels.ldText(10, 0), "-", "no sag");
  });

  add("calc sheet (1.25.5): support labels in the truss drawings don't overlap (end bolts next to a hoist)", function () {
    example();
    S.rig.trusses.filter(function (t) { return !t.isBlock && S.results.trusses[t.id]; }).forEach(function (t) {
      var svg = TLA.panels.elevation(t, S.results.trusses[t.id]), boxes = [];
      Array.prototype.forEach.call(svg.querySelectorAll("text.strong"), function (e) {
        var y = Number(e.getAttribute("y")), x = Number(e.getAttribute("x"));
        boxes.forEach(function (b) { eq(Math.abs(b.y - y) > 1 || Math.abs(b.x - x) > 30, true, t.name + ": labels at " + b.x + " and " + x); });
        boxes.push({ x: x, y: y });
      });
    });
  });

  add("truss view (1.26.3): reaction labels don't overlap (end bolts next to a hoist)", function () {
    example();
    S.rig.trusses.filter(function (t) { return !t.isBlock && S.results.trusses[t.id]; }).forEach(function (t) {
      var svg = TLA.panels.reactionsDiagram(t, S.results.trusses[t.id]), boxes = [];
      Array.prototype.forEach.call(svg.querySelectorAll("text.strong"), function (e) {
        var y = Number(e.getAttribute("y")), x = Number(e.getAttribute("x")), w = e.textContent.length * 11 * 0.56;
        boxes.forEach(function (b) { eq(Math.abs(b.y - y) > 1 || Math.abs(b.x - x) > (b.w + w) / 2, true, t.name + ": reaction labels at " + b.x + " and " + x); });
        boxes.push({ x: x, y: y, w: w });
      });
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
