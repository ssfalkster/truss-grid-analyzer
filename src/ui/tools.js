/* Side tools: Circular Truss, Simple UDL, Fixture weights, Databases (custom trusses / hoists / fixtures). */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var S, P, h, fmt;
  var NS = "http://www.w3.org/2000/svg";
  var state = { circ: { trussId: null, n: 5, d: 60, orig: false }, udl: { total: 1000, exact: false }, fx: { q: "", mfr: "" } };

  function trussPicker(get, set) {
    var db = S.db().trusses, cur = db.filter(function (x) { return x.id === get(); })[0] || db[0];
    set(cur.id);
    var mfrs = [];
    db.forEach(function (x) { if (mfrs.indexOf(x.manufacturer) < 0) mfrs.push(x.manufacturer); });
    return h("div", { "class": "formrow" },
      P.field("Manufacturer", P.select(mfrs.map(function (m) { return { value: m, label: m }; }), cur.manufacturer, function (v) { set(db.filter(function (x) { return x.manufacturer === v; })[0].id); render(); })),
      P.field("Model", P.select(db.filter(function (x) { return x.manufacturer === cur.manufacturer; }).map(function (x) { return { value: x.id, label: x.description }; }), cur.id, function (v) { set(parseInt(v, 10)); render(); })));
  }

  var current = null, holder = null;
  function render() { if (current) current(holder); }

  function circular(box) {
    var c = state.circ;
    box.textContent = "";
    var card = h("div", { "class": "card" }, h("h2", { text: "Circular Truss" }),
      h("p", { "class": "sub", text: "Evenly spaced pick points around a circle of truss. Not every truss is available in circular form - check with the manufacturer. Loads must be balanced so the ring does not tip." }));
    card.appendChild(trussPicker(function () { return c.trussId; }, function (v) { c.trussId = v; }));
    card.appendChild(h("div", { "class": "formrow" },
      P.field("Pick points", P.numInput(c.n, function (v) { c.n = Math.max(1, Math.round(v)); render(); }, { step: 1 })),
      P.field("Diameter (ft)", P.numInput(c.d, function (v) { c.d = v; render(); }, { ft: true })),
      h("label", { "class": "mini check" }, h("input", { type: "checkbox", checked: c.orig, onchange: function (e) { c.orig = e.target.checked; render(); } }), "Match original spreadsheet (uses its 5-ft column lookup, no derate)")));
    var truss = S.db().trusses.filter(function (x) { return x.id === c.trussId; })[0];
    var r = TLA.side.circular(truss, c.n, c.d, { matchOriginal: c.orig });
    var res = h("div", null,
      h("div", { "class": "result-big" }, r.maxLoad != null ? fmt(r.maxLoad, 0) : "-", h("small", { text: " lb max allowable load on a span" })),
      (r.messages || []).map(function (m) { return h("div", { "class": "msg", text: m }); }),
      h("table", { "class": "tbl wide" }, h("tbody", null,
        [["Span (chord)", fmt(r.span, 2) + " ft (max " + fmt(r.maxSpan, 1) + ")"], ["Angle of arc", fmt(r.angle, 2) + " deg"], ["Cantilever distance", fmt(r.sagitta, 2) + " ft"], ["Cantilever / span", fmt(r.cantileverRatio, 1) + " %"],
         ["Base load (UDL/2" + (r.derate < 1 ? " x " + r.derate : "") + ")", fmt(r.baseLoad, 0) + " lb"], ["20% band", fmt(r.bands.pct20, 0)], ["35% band", fmt(r.bands.pct35, 0)], ["70% band", fmt(r.bands.pct70, 0)], ["100% band", fmt(r.bands.full, 0)]]
          .map(function (row) { return h("tr", null, h("td", { text: row[0] }), h("td", { "class": "r", text: row[1] })); }))));
    card.appendChild(res);
    // diagram
    var svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "-60 -60 120 120"); svg.setAttribute("width", "220"); svg.setAttribute("height", "220");
    var circ = document.createElementNS(NS, "circle"); circ.setAttribute("r", "48"); circ.setAttribute("fill", "none"); circ.setAttribute("stroke", "var(--muted)"); circ.setAttribute("stroke-dasharray", "2 3"); svg.appendChild(circ);
    var pts = [];
    for (var i = 0; i < c.n; i++) { var a = i / c.n * 2 * Math.PI - Math.PI / 2; pts.push([Math.cos(a) * 48, Math.sin(a) * 48]); }
    var poly = document.createElementNS(NS, "polygon"); poly.setAttribute("points", pts.map(function (p) { return p.join(","); }).join(" ")); poly.setAttribute("fill", "none"); poly.setAttribute("stroke", "var(--l3)"); poly.setAttribute("stroke-width", "3"); svg.appendChild(poly);
    pts.forEach(function (p) { var d = document.createElementNS(NS, "circle"); d.setAttribute("cx", p[0]); d.setAttribute("cy", p[1]); d.setAttribute("r", "3.5"); d.setAttribute("fill", "var(--panel)"); d.setAttribute("stroke", "var(--ok)"); d.setAttribute("stroke-width", "2"); svg.appendChild(d); });
    card.appendChild(svg);
    box.appendChild(card);
  }

  function simpleUdl(box) {
    var u = state.udl;
    box.textContent = "";
    var card = h("div", { "class": "card" }, h("h2", { text: "Simple UDL" }),
      h("p", { "class": "sub", text: "Uniformly distributed load across the whole truss, all spans equal, no cantilevers. Shows the load on each point for 2-10 points." }),
      h("div", { "class": "formrow" },
        P.field("Total load (lb)", P.numInput(u.total, function (v) { u.total = v; render(); })),
        h("label", { "class": "mini check" }, h("input", { type: "checkbox", checked: u.exact, onchange: function (e) { u.exact = e.target.checked; render(); } }), "Use exact beam-engine coefficients instead of the published rounded table")));
    var head = h("tr", null, h("th", { text: "Points" }));
    for (var i = 1; i <= 10; i++) head.appendChild(h("th", { "class": "r", text: "P" + i }));
    head.appendChild(h("th", { "class": "r", text: "Sum" }));
    var tb = h("tbody");
    for (var n = 2; n <= 10; n++) {
      var co = u.exact ? TLA.side.simpleExact(n) : TLA.side.simpleTable(n), row = h("tr", null, h("td", { text: n + " points" }));
      for (var j = 0; j < 10; j++) row.appendChild(h("td", { "class": "r", text: j < n ? fmt(co[j] * u.total, 1) : "-" }));
      row.appendChild(h("td", { "class": "r", text: fmt(co.reduce(function (a, b) { return a + b; }, 0) * u.total, 1) }));
      tb.appendChild(row);
    }
    card.appendChild(h("div", { style: "overflow:auto" }, h("table", { "class": "tbl wide" }, h("thead", null, head), tb)));
    box.appendChild(card);
  }

  function fixtures(box) {
    var f = state.fx;
    box.textContent = "";
    var all = S.db().fixtures;
    var mfrs = [];
    all.forEach(function (x) { if (mfrs.indexOf(x.manufacturer) < 0) mfrs.push(x.manufacturer); });
    var card = h("div", { "class": "card" }, h("h2", { text: "Fixture weights" }),
      h("p", { "class": "sub", text: all.length + " entries. Add your own below - they are saved with your browser data and in saved rig files." }));
    var q = h("input", { type: "text", value: f.q, placeholder: "Search fixtures" });
    q.addEventListener("input", function () { f.q = q.value; list(); });
    card.appendChild(h("div", { "class": "formrow" }, q,
      P.select([{ value: "", label: "All manufacturers" }].concat(mfrs.map(function (m) { return { value: m, label: m }; })), f.mfr, function (v) { f.mfr = v; list(); })));
    var tb = h("tbody"); card.appendChild(h("div", { style: "max-height:46vh;overflow:auto" }, h("table", { "class": "tbl wide" }, h("thead", null, h("tr", null, h("th", { text: "Manufacturer" }), h("th", { text: "Fixture" }), h("th", { "class": "r", text: "Weight (lb)" }), h("th", { "class": "r", text: "Clamp (lb)" }))), tb)));
    function list() {
      tb.textContent = "";
      var term = f.q.toLowerCase();
      all.filter(function (x) { return (!f.mfr || x.manufacturer === f.mfr) && (!term || (x.manufacturer + " " + x.fixture).toLowerCase().indexOf(term) >= 0); }).slice(0, 400).forEach(function (x) {
        tb.appendChild(h("tr", null, h("td", { text: x.manufacturer }), h("td", { text: x.fixture }), h("td", { "class": "r", text: fmt(x.weight_lb, 1) }), h("td", { "class": "r", text: x.clamp_lb ? fmt(x.clamp_lb, 2) : "" })));
      });
    }
    list();
    var nm = h("input", { type: "text", placeholder: "Manufacturer" }), fn = h("input", { type: "text", placeholder: "Fixture" }), wt = h("input", { type: "number", "class": "num", placeholder: "lb", step: "any" }), cl = h("input", { type: "number", "class": "num", placeholder: "clamp lb", step: "any", title: "Optional clamp weight" });
    card.appendChild(h("div", { "class": "formrow" }, nm, fn, wt, cl, h("button", { "class": "primary", text: "Add fixture", onclick: function () {
      if (!nm.value || !fn.value) return;
      S.userDb.fixtures.push({ manufacturer: nm.value, fixture: fn.value, weight_lb: parseFloat(wt.value) || 0, clamp_lb: parseFloat(cl.value) > 0 ? parseFloat(cl.value) : undefined }); S.persist(); render();
    } })));
    box.appendChild(card);
  }

  function databases(box) {
    box.textContent = "";
    var u = S.userDb;
    var card = h("div", { "class": "card" }, h("h2", { text: "Custom trusses" }),
      h("p", { "class": "sub", text: "Add a truss that is not in the built-in table. Enter the max uniformly distributed load (UDL) and max center point load (CPL) in pounds; they are applied for every span up to the max span. For different values per length, paste 100 comma-separated numbers (1 ft to 100 ft) instead." }));
    var f = {}; ["Manufacturer", "Model", "lb/ft", "Max span (ft)", "UDL (lb)", "CPL (lb)"].forEach(function (k) { f[k] = h("input", { type: k === "Manufacturer" || k === "Model" ? "text" : "number", step: "any", "class": k === "Manufacturer" || k === "Model" ? "" : "num", placeholder: k }); });
    var udlList = h("input", { type: "text", placeholder: "Optional: 100 UDL values, comma separated" }), cplList = h("input", { type: "text", placeholder: "Optional: 100 CPL values, comma separated" });
    var rep = h("input", { type: "checkbox" });
    card.appendChild(h("div", { "class": "formrow" }, f.Manufacturer, f.Model, f["lb/ft"], f["Max span (ft)"], f["UDL (lb)"], f["CPL (lb)"]));
    card.appendChild(h("div", { "class": "formrow" }, udlList, cplList));
    card.appendChild(h("div", { "class": "formrow" }, h("label", { "class": "mini check" }, rep, "Data already includes the repetitive-use factor (no 0.85 derate)"),
      h("button", { "class": "primary", text: "Add truss", onclick: function () {
        var ms = parseFloat(f["Max span (ft)"].value) || 0;
        if (!f.Model.value || !ms) { alert("Enter a model name and max span."); return; }
        function arr(txt, flat) {
          var v = txt.value.split(/[,\s]+/).filter(Boolean).map(Number);
          if (v.length === 100 && v.every(isFinite)) return v;
          var o = []; for (var i = 1; i <= 100; i++) o.push(i <= Math.ceil(ms) ? (parseFloat(flat.value) || 0) : 0); return o;
        }
        var id = 1000 + u.trusses.length + 1;
        u.trusses.push({ id: id, manufacturer: f.Manufacturer.value || "Custom", description: f.Model.value, weight_per_ft_lb: parseFloat(f["lb/ft"].value) || 0, max_span_ft: ms, repetitive_use: rep.checked, udl_lb: arr(udlList, f["UDL (lb)"]), cpl_lb: arr(cplList, f["CPL (lb)"]) });
        S.commit({ noUndo: true }); render();
      } })));
    card.appendChild(listBlock(u.trusses, function (x) { return x.manufacturer + " " + x.description + " - " + fmt(x.weight_per_ft_lb, 2) + " lb/ft, max span " + x.max_span_ft + " ft"; }, function (i) { u.trusses.splice(i, 1); S.commit({ noUndo: true }); render(); }));
    box.appendChild(card);

    var hc = h("div", { "class": "card" }, h("h2", { text: "Custom chain hoists" }));
    var g2 = {}; ["Brand", "Model", "Capacity label", "Capacity (lb)", "Speed (fpm)", "Weight (lb)", "Chain lb/ft"].forEach(function (k) { g2[k] = h("input", { type: /Brand|Model|label/.test(k) ? "text" : "number", step: "any", "class": /Brand|Model|label/.test(k) ? "" : "num", placeholder: k }); });
    hc.appendChild(h("div", { "class": "formrow" }, Object.keys(g2).map(function (k) { return g2[k]; }),
      h("button", { "class": "primary", text: "Add hoist", onclick: function () {
        if (!g2.Model.value) { alert("Enter a model name."); return; }
        u.hoists.push({ id: 1000 + u.hoists.length + 1, brand: g2.Brand.value || "Custom", description: g2.Model.value, capacity_label: g2["Capacity label"].value || fmt(parseFloat(g2["Capacity (lb)"].value) || 0, 0) + " lb", speed_fpm: parseFloat(g2["Speed (fpm)"].value) || 0, weight_lb: parseFloat(g2["Weight (lb)"].value) || 0, chain_weight_per_ft_lb: parseFloat(g2["Chain lb/ft"].value) || 0, capacity_lb: parseFloat(g2["Capacity (lb)"].value) || 0 });
        S.commit({ noUndo: true }); render();
      } })));
    hc.appendChild(listBlock(u.hoists, function (x) { return x.brand + " " + x.description + " - " + x.capacity_lb + " lb, " + x.speed_fpm + " fpm"; }, function (i) { u.hoists.splice(i, 1); S.commit({ noUndo: true }); render(); }));
    box.appendChild(hc);
    var cc = h("div", { "class": "card" }, h("h2", { text: "Corner blocks" }),
      h("p", { "class": "sub", text: "Christie Lites and James Thomas Engineering corner blocks, hubs, pivots, hinges and gates, with the weights published on the manufacturers' product pages. Weights marked n/a are not published - enter your own on the block in the rig. Blocks with end/face plates add weight per connection." }));
    var all = TLA.data.corners.concat(u.corners || []);
    var q2 = h("input", { type: "text", placeholder: "Search corner blocks" });
    var tb2 = h("tbody");
    function wtxt(c) { return c.base_lb != null ? c.base_lb + " + " + c.per_connection_lb + " / plate" : c.variants ? c.variants.map(function (v) { return v[1]; }).join(" / ") : c.weight_lb != null ? String(c.weight_lb) : "n/a"; }
    function list2() {
      tb2.textContent = "";
      var term = q2.value.toLowerCase();
      all.filter(function (c) { return !term || (c.manufacturer + " " + c.family + " " + c.name + " " + c.code + " " + c.fits).toLowerCase().indexOf(term) >= 0; }).forEach(function (c) {
        tb2.appendChild(h("tr", null, h("td", { text: c.manufacturer.replace("James Thomas Engineering", "JTE") }), h("td", { text: c.family }), h("td", null, c.source ? h("a", { href: c.source, target: "_blank", rel: "noopener", text: c.name }) : c.name), h("td", { text: c.code || "" }),
          h("td", { "class": "r", text: String(c.ways) }), h("td", { "class": "r", text: wtxt(c) }), h("td", null, c.custom ? h("button", { "class": "x", text: "x", onclick: function () { u.corners = u.corners.filter(function (x) { return x.id !== c.id; }); S.commit({ noUndo: true }); render(); } }) : null)));
      });
    }
    q2.addEventListener("input", list2); list2();
    cc.appendChild(h("div", { "class": "formrow" }, q2));
    cc.appendChild(h("div", { style: "max-height:40vh;overflow:auto" }, h("table", { "class": "tbl wide" }, h("thead", null, h("tr", null, ["Maker", "Truss", "Block", "Code", "Ways", "Weight (lb)", ""].map(function (x, i) { return h("th", { "class": i === 4 || i === 5 ? "r" : "", text: x }); }))), tb2)));
    var cf = {}; ["Maker", "Truss family", "Name", "Ways", "Weight (lb)", "Size (in)"].forEach(function (k) { cf[k] = h("input", { type: /Ways|Weight|Size/.test(k) ? "number" : "text", step: "any", "class": /Ways|Weight|Size/.test(k) ? "num" : "", placeholder: k }); });
    var fitsIn = h("input", { type: "text", placeholder: "Fits e.g. 12x12" });
    cc.appendChild(h("h3", { text: "Add your own corner block" }));
    cc.appendChild(h("div", { "class": "formrow" }, cf.Maker, cf["Truss family"], cf.Name, fitsIn, cf.Ways, cf["Weight (lb)"], cf["Size (in)"],
      h("button", { "class": "primary", text: "Add block", onclick: function () {
        if (!cf.Name.value) { alert("Enter a name."); return; }
        u.corners = u.corners || [];
        var nid = 2000 + u.corners.length + 1;
        u.corners.push({ id: nid, custom: true, manufacturer: cf.Maker.value || "Custom", family: cf["Truss family"].value || "Custom", fits: (fitsIn.value || "12x12").toLowerCase().replace(/\s|"/g, ""), name: cf.Name.value, code: "", kind: "corner",
          ways: parseInt(cf.Ways.value, 10) || 6, size_in: parseFloat(cf["Size (in)"].value) || null, weight_lb: parseFloat(cf["Weight (lb)"].value) || null, variants: null, base_lb: null, per_connection_lb: null, notes: "user-added", source: "" });
        S.commit({ noUndo: true }); render();
      } })));
    box.appendChild(cc);

    box.appendChild(h("div", { "class": "card" }, h("h2", { text: "Built-in data" }), h("p", { "class": "sub", text: TLA.data.trusses.length + " trusses, " + TLA.data.hoists.length + " chain hoists, " + TLA.data.fixtures.length + " fixtures from the original workbook (read-only), plus " + TLA.data.corners.length + " corner blocks from the manufacturers. Your custom entries are stored in this browser and included in saved rig files." })));
  }

  function listBlock(items, label, remove) {
    if (!items.length) return h("p", { "class": "sub", text: "No custom entries yet." });
    return h("table", { "class": "tbl wide" }, h("tbody", null, items.map(function (x, i) {
      return h("tr", null, h("td", { text: label(x) }), h("td", null, h("button", { "class": "x", text: "x", onclick: function () { remove(i); } })));
    })));
  }

  TLA.tools = {
    mount: function (store) { S = store; P = TLA.panels; h = P.h; fmt = P.fmt; },
    show: function (name, container) {
      holder = container;
      current = { circular: circular, udl: simpleUdl, fixtures: fixtures, databases: databases }[name];
      render();
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
