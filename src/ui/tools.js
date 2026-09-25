/* Side tools: Circular Truss, Simple UDL, Fixture weights, Databases (trusses and corner blocks in one table, custom hoists). */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var S, P, h, fmt, U;
  var NS = "http://www.w3.org/2000/svg";
  var state = { circ: { trussId: null, n: 5, d: 60, orig: false }, udl: { total: 1000, exact: false }, fx: { q: "", mfr: "" }, db: { q: "", type: "", mfr: "", fam: "" } };

  function trussPicker(get, set) {
    var db = S.db().trusses, cur = db.filter(function (x) { return x.id === get(); })[0] || db[0];
    set(cur.id);
    var mfrs = [];
    db.forEach(function (x) { if (mfrs.indexOf(x.manufacturer) < 0) mfrs.push(x.manufacturer); });
    return h("div", { "class": "formrow" },
      P.field("Manufacturer", P.select(mfrs.map(function (m) { return { value: m, label: m }; }), cur.manufacturer, function (v) { set(P.modelsOf(db, v)[0].id); render(); })),
      P.field("Model", P.select(P.modelsOf(db, cur.manufacturer, cur.id).map(function (x) { return { value: x.id, label: P.trussLabel(x) }; }), cur.id, function (v) { set(parseInt(v, 10)); render(); })));
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
      P.field("Diameter (" + U.unit("len") + ")", P.numInput(c.d, function (v) { c.d = v; render(); }, { ft: true })),
      h("label", { "class": "mini check" }, h("input", { type: "checkbox", checked: c.orig, onchange: function (e) { c.orig = e.target.checked; render(); } }), "Match original spreadsheet (uses its 5-ft column lookup, no derate; imperial trusses only)")));
    var truss = S.db().trusses.filter(function (x) { return x.id === c.trussId; })[0];
    var r = TLA.side.circular(truss, c.n, c.d, { matchOriginal: c.orig });
    var res = h("div", null,
      h("div", { "class": "result-big" }, r.maxLoad != null ? U.n("w", r.maxLoad, 0) : "-", h("small", { text: " " + U.unit("w") + " max allowable load on a span" })),
      (r.messages || []).map(function (m) { return h("div", { "class": "msg", text: U.text(m) }); }),
      h("table", { "class": "tbl wide" }, h("tbody", null,
        [["Span (chord)", U.f("len", r.span, 2) + " (max " + U.n("len", r.maxSpan, 1) + ")"], ["Angle of arc", fmt(r.angle, 2) + " deg"], ["Cantilever distance", U.f("len", r.sagitta, 2)], ["Cantilever / span", fmt(r.cantileverRatio, 1) + " %"],
         ["Base load (UDL/2" + (r.derate < 1 ? " x " + r.derate : "") + ")", U.f("w", r.baseLoad, 0)], ["20% band", U.n("w", r.bands.pct20, 0)], ["35% band", U.n("w", r.bands.pct35, 0)], ["70% band", U.n("w", r.bands.pct70, 0)], ["100% band", U.n("w", r.bands.full, 0)]]
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
        P.field("Total load (" + U.unit("w") + ")", P.numInput(u.total, function (v) { u.total = v; render(); }, { q: "w" })),
        h("label", { "class": "mini check" }, h("input", { type: "checkbox", checked: u.exact, onchange: function (e) { u.exact = e.target.checked; render(); } }), "Use exact beam-engine coefficients instead of the published rounded table")));
    var head = h("tr", null, h("th", { text: "Points" }));
    for (var i = 1; i <= 10; i++) head.appendChild(h("th", { "class": "r", text: "P" + i }));
    head.appendChild(h("th", { "class": "r", text: "Sum" }));
    var tb = h("tbody");
    for (var n = 2; n <= 10; n++) {
      var co = u.exact ? TLA.side.simpleExact(n) : TLA.side.simpleTable(n), row = h("tr", null, h("td", { text: n + " points" }));
      for (var j = 0; j < 10; j++) row.appendChild(h("td", { "class": "r", text: j < n ? U.n("w", co[j] * u.total, 1) : "-" }));
      row.appendChild(h("td", { "class": "r", text: U.n("w", co.reduce(function (a, b) { return a + b; }, 0) * u.total, 1) }));
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
    var tb = h("tbody"); card.appendChild(h("div", { style: "max-height:46vh;overflow:auto" }, h("table", { "class": "tbl wide" }, h("thead", null, h("tr", null, h("th", { text: "Manufacturer" }), h("th", { text: "Fixture" }), h("th", { "class": "r", text: "Weight (" + U.unit("w") + ")" }), h("th", { "class": "r", text: "Clamp (" + U.unit("w") + ")" }))), tb)));
    function list() {
      tb.textContent = "";
      var term = f.q.toLowerCase();
      all.filter(function (x) { return (!f.mfr || x.manufacturer === f.mfr) && (!term || (x.manufacturer + " " + x.fixture).toLowerCase().indexOf(term) >= 0); }).slice(0, 400).forEach(function (x) {
        tb.appendChild(h("tr", null, h("td", { text: x.manufacturer }), h("td", { text: x.fixture }), h("td", { "class": "r", text: U.n("w", x.weight_lb, 1) }), h("td", { "class": "r", text: x.clamp_lb ? U.n("w", x.clamp_lb, 2) : "" })));
      });
    }
    list();
    var nm = h("input", { type: "text", placeholder: "Manufacturer" }), fn = h("input", { type: "text", placeholder: "Fixture" }), wt = h("input", { type: "number", "class": "num", placeholder: U.unit("w"), step: "any" }), cl = h("input", { type: "number", "class": "num", placeholder: "clamp " + U.unit("w"), step: "any", title: "Optional clamp weight" });
    card.appendChild(h("div", { "class": "formrow" }, nm, fn, wt, cl, h("button", { "class": "primary", text: "Add fixture", onclick: function () {
      if (!nm.value || !fn.value) return;
      S.userDb.fixtures.push({ manufacturer: nm.value, fixture: fn.value, weight_lb: U.back("w", parseFloat(wt.value) || 0), clamp_lb: parseFloat(cl.value) > 0 ? U.back("w", parseFloat(cl.value)) : undefined }); S.persist(); render();
    } })));
    box.appendChild(card);
  }

  var MAKER = { "Christie Lites": "Christie", "James Thomas Engineering": "JTE" };
  function maker(m) { return MAKER[m] || m; }

  // One table for trusses and corner blocks: they share a family_key (e.g. "jte-gp-12x12"), so a truss and the blocks
  // that fit it can be shown together. Trusses link to the maker's load table, corner blocks to the product page.
  function equipment(card) {
    var u = S.userDb, f = state.db;
    var blocks = TLA.data.corners.concat(u.corners || []);
    var trusses = S.db().trusses.filter(function (x) { return !x.hidden; });
    var famName = {};
    blocks.forEach(function (c) { if (c.family_key && !famName[c.family_key]) famName[c.family_key] = c.family.replace(/^Christie /, ""); });
    trusses.forEach(function (x) { if (x.family_key && !famName[x.family_key]) famName[x.family_key] = String(x.description).trim(); });
    function wtxt(c) { return c.base_lb != null ? U.n("w", c.base_lb, 1) + " + " + U.n("w", c.per_connection_lb, 1) + " / plate" : c.variants ? c.variants.map(function (v) { return U.n("w", v[1], 1); }).join(" / ") : c.weight_lb != null ? U.n("w", c.weight_lb, 1) : "n/a"; }
    var rows = trusses.map(function (x) {
      return { t: "Truss", x: x, mk: maker(x.manufacturer), fam: x.family_key ? famName[x.family_key] : "", key: x.family_key, name: String(x.description).trim(), code: "",
        spec: "max span " + U.f("len", x.max_span_ft, 1) + (x.repetitive_use ? ", repetitive use" : ""), wt: U.f("wpl", x.weight_per_ft_lb, 2),
        url: x.url, link: "load table", src: x.source === "User" ? "custom" : x.source === "TLA" ? "workbook" : "", tip: P.trussSource(x), custom: x.source === "User" };
    }).concat(blocks.map(function (c) {
      var w = wtxt(c);
      return { t: "Corner block", x: c, mk: maker(c.manufacturer), fam: c.family_key ? famName[c.family_key] : c.family.replace(/^Christie /, ""), key: c.family_key, name: c.name, code: c.code || "",
        spec: c.ways + "-way" + (c.kind && c.kind !== "corner" ? " " + c.kind : "") + (c.fits ? ", fits " + c.fits : ""), wt: w === "n/a" ? w : w + " " + U.unit("w"),
        url: c.source, link: "product page", src: c.custom ? "custom" : "", tip: c.notes || "", custom: !!c.custom };
    }));
    rows.sort(function (a, b) { return a.mk.localeCompare(b.mk) || (a.fam || "~").localeCompare(b.fam || "~") || (a.t === b.t ? 0 : a.t === "Truss" ? -1 : 1) || a.name.localeCompare(b.name); });
    var mfrs = []; rows.forEach(function (r) { if (mfrs.indexOf(r.mk) < 0) mfrs.push(r.mk); });
    if (mfrs.indexOf(f.mfr) < 0) f.mfr = "";

    var q = h("input", { type: "text", placeholder: "Search trusses and corner blocks", value: f.q });
    var famChip = h("span"), count = h("span", { "class": "sub" }), tb = h("tbody");
    function list() {
      tb.textContent = ""; famChip.textContent = "";
      var term = f.q.toLowerCase(), n = 0;
      if (f.fam) famChip.appendChild(h("button", { "class": "chip-btn", title: "Show all families", text: "Family: " + (famName[f.fam] || f.fam) + "  x", onclick: function () { f.fam = ""; list(); } }));
      rows.forEach(function (r) {
        if ((f.type && r.t !== f.type) || (f.mfr && r.mk !== f.mfr) || (f.fam && r.key !== f.fam)) return;
        if (term && (r.t + " " + r.mk + " " + r.x.manufacturer + " " + r.fam + " " + r.name + " " + r.code + " " + r.spec).toLowerCase().indexOf(term) < 0) return;
        n++;
        var del = r.custom ? h("button", { "class": "x", title: "Delete this custom entry", text: "x", onclick: function () {
          if (r.t === "Truss") u.trusses = u.trusses.filter(function (x) { return x !== r.x; }); else u.corners = u.corners.filter(function (x) { return x.id !== r.x.id; });
          S.commit({ noUndo: true }); render(); } }) : null;
        tb.appendChild(h("tr", { title: r.tip },
          h("td", { "class": "mut", text: r.t === "Truss" ? "Truss" : "Block" }), h("td", { text: r.mk }),
          h("td", null, r.key ? h("a", { href: "#", title: "Show this family's trusses and corner blocks", text: r.fam, onclick: function (e) { e.preventDefault(); f.fam = r.key; list(); } }) : r.fam || ""),
          h("td", { text: r.name }), h("td", { style: "white-space:nowrap", text: r.code }), h("td", { text: r.spec }), h("td", { "class": "r", style: "white-space:nowrap", text: r.wt }),
          h("td", { style: "white-space:nowrap" }, r.url ? h("a", { href: r.url, target: "_blank", rel: "noopener", text: r.link }) : h("span", { "class": "mut", text: r.src })), h("td", null, del)));
      });
      count.textContent = n + " of " + rows.length;
    }
    q.addEventListener("input", function () { f.q = q.value; list(); });
    card.appendChild(h("div", { "class": "formrow" }, q,
      P.select([{ value: "", label: "Trusses and corner blocks" }, { value: "Truss", label: "Trusses" }, { value: "Corner block", label: "Corner blocks" }], f.type, function (v) { f.type = v; list(); }),
      P.select([{ value: "", label: "All makers" }].concat(mfrs.map(function (m) { return { value: m, label: m }; })), f.mfr, function (v) { f.mfr = v; list(); }),
      famChip, count));
    card.appendChild(h("div", { style: "max-height:60vh;overflow:auto" }, h("table", { "class": "tbl wide" },
      h("thead", null, h("tr", null, ["Type", "Maker", "Family", "Item", "Code", "Spec", "Weight", "Source", ""].map(function (x) { return h("th", { "class": x === "Weight" ? "r" : "", text: x }); }))), tb)));
    list();
  }

  function databases(box) {
    box.textContent = "";
    var u = S.userDb, M = U.metric();
    var card = h("div", { "class": "card" }, h("h2", { text: "Trusses and corner blocks" }),
      h("p", { "class": "sub", text: "Every truss and corner block the app knows, including your own. Manufacturer trusses link to the maker's load table, corner blocks to the product page. Click a family to see a truss with the corner blocks that fit it. Trusses marked \"workbook\" come from Hall & Sogoian's Truss Load Analyzer - hover a row for where its numbers come from. Corner block weights marked n/a are not published - enter your own on the block in the rig; blocks with end/face plates add weight per connection." }));
    equipment(card);

    var ta = h("details", { "class": "grp" }, h("summary", { text: "Add your own truss" }),
      h("p", { "class": "sub", text: "For a truss that is not in the table. Enter the max uniformly distributed load (UDL, total) and max center point load (CPL) in " + (M ? "kilograms" : "pounds") + "; they are applied for every span up to the max span. For different values per length, paste one number per " + (M ? "metre (1 m, 2 m, ...)" : "foot (1 ft to 100 ft)") + " instead. The truss is saved in the units you enter it in (" + (M ? "metric" : "imperial") + ")." }));
    var KW = M ? "kg/m" : "lb/ft", KS = M ? "Max span (m)" : "Max span (ft)", KU = M ? "UDL (kg)" : "UDL (lb)", KC = M ? "CPL (kg)" : "CPL (lb)";
    var f = {}; ["Manufacturer", "Model", KW, KS, KU, KC].forEach(function (k) { f[k] = h("input", { type: k === "Manufacturer" || k === "Model" ? "text" : "number", step: "any", "class": k === "Manufacturer" || k === "Model" ? "" : "num", placeholder: k }); });
    var udlList = h("input", { type: "text", placeholder: "Optional: UDL per " + (M ? "metre" : "foot") + ", comma separated" }), cplList = h("input", { type: "text", placeholder: "Optional: CPL per " + (M ? "metre" : "foot") + ", comma separated" });
    var rep = h("input", { type: "checkbox" });
    ta.appendChild(h("div", { "class": "formrow" }, f.Manufacturer, f.Model, f[KW], f[KS], f[KU], f[KC]));
    ta.appendChild(h("div", { "class": "formrow" }, udlList, cplList));
    ta.appendChild(h("div", { "class": "formrow" }, h("label", { "class": "mini check" }, rep, "Data already includes the repetitive-use factor (no 0.85 derate)"),
      h("button", { "class": "primary", text: "Add truss", onclick: function () {
        var ms = parseFloat(f[KS].value) || 0, n = M ? Math.ceil(ms) : 100;
        if (!f.Model.value || !ms) { alert("Enter a model name and max span."); return; }
        function arr(txt, flat) {
          var v = txt.value.split(/[,\s]+/).filter(Boolean).map(Number);
          if (v.length && v.every(isFinite) && (M ? v.length >= n : v.length === 100)) return M ? v.slice(0, n) : v;
          var o = []; for (var i = 1; i <= n; i++) o.push(i <= Math.ceil(ms) ? (parseFloat(flat.value) || 0) : 0); return o;
        }
        var id = S.nextUserId("trusses"), wv = parseFloat(f[KW].value) || 0;
        var e = { id: id, manufacturer: f.Manufacturer.value || "Custom", description: f.Model.value, repetitive_use: rep.checked, source: "User", units: M ? "metric" : "imperial" };
        if (M) { e.weight_per_m_kg = wv; e.max_span_m = ms; e.weight_per_ft_lb = U.back("wpl", wv); e.max_span_ft = ms / U.FT_M; e.udl_kg = arr(udlList, f[KU]); e.cpl_kg = arr(cplList, f[KC]); }
        else { e.weight_per_ft_lb = wv; e.max_span_ft = ms; e.udl_lb = arr(udlList, f[KU]); e.cpl_lb = arr(cplList, f[KC]); }
        u.trusses.push(e);
        S.commit({ noUndo: true }); render();
      } })));
    card.appendChild(ta);

    var ba = h("details", { "class": "grp" }, h("summary", { text: "Add your own corner block" }));
    var CW = "Weight (" + U.unit("w") + ")", CS = "Size (" + U.unit("inch") + ")";
    var cf = {}; ["Maker", "Truss family", "Name", "Ways", CW, CS].forEach(function (k) { cf[k] = h("input", { type: /Ways|Weight|Size/.test(k) ? "number" : "text", step: "any", "class": /Ways|Weight|Size/.test(k) ? "num" : "", placeholder: k }); });
    var fitsIn = h("input", { type: "text", placeholder: "Fits e.g. 12x12" });
    ba.appendChild(h("div", { "class": "formrow" }, cf.Maker, cf["Truss family"], cf.Name, fitsIn, cf.Ways, cf[CW], cf[CS],
      h("button", { "class": "primary", text: "Add block", onclick: function () {
        if (!cf.Name.value) { alert("Enter a name."); return; }
        u.corners = u.corners || [];
        var nid = S.nextUserId("corners");
        u.corners.push({ id: nid, custom: true, manufacturer: cf.Maker.value || "Custom", family: cf["Truss family"].value || "Custom", fits: (fitsIn.value || "12x12").toLowerCase().replace(/\s|"/g, ""), name: cf.Name.value, code: "", kind: "corner",
          ways: parseInt(cf.Ways.value, 10) || 6, size_in: parseFloat(cf[CS].value) ? U.back("inch", parseFloat(cf[CS].value)) : null, weight_lb: parseFloat(cf[CW].value) ? U.back("w", parseFloat(cf[CW].value)) : null, variants: null, base_lb: null, per_connection_lb: null, notes: "user-added", source: "" });
        S.commit({ noUndo: true }); render();
      } })));
    card.appendChild(ba);
    box.appendChild(card);

    var hc = h("div", { "class": "card" }, h("h2", { text: "Custom chain hoists" }));
    var HK = ["Brand", "Model", "Capacity label", "Capacity (" + U.unit("w") + ")", "Speed (" + U.unit("speed") + ")", "Weight (" + U.unit("w") + ")", "Chain " + U.unit("wpl")];
    var g2 = {}; HK.forEach(function (k) { g2[k] = h("input", { type: /Brand|Model|label/.test(k) ? "text" : "number", step: "any", "class": /Brand|Model|label/.test(k) ? "" : "num", placeholder: k }); });
    hc.appendChild(h("div", { "class": "formrow" }, Object.keys(g2).map(function (k) { return g2[k]; }),
      h("button", { "class": "primary", text: "Add hoist", onclick: function () {
        if (!g2.Model.value) { alert("Enter a model name."); return; }
        function gv(i, q) { return U.back(q, parseFloat(g2[HK[i]].value) || 0); }
        u.hoists.push({ id: S.nextUserId("hoists"), brand: g2.Brand.value || "Custom", description: g2.Model.value, capacity_label: g2["Capacity label"].value || fmt(parseFloat(g2[HK[3]].value) || 0, 0) + " " + U.unit("w"), speed_fpm: gv(4, "speed"), weight_lb: gv(5, "w"), chain_weight_per_ft_lb: gv(6, "wpl"), capacity_lb: gv(3, "w") });
        S.commit({ noUndo: true }); render();
      } })));
    hc.appendChild(listBlock(u.hoists, function (x) { return x.brand + " " + x.description + " - " + U.f("w", x.capacity_lb, 0) + ", " + U.f("speed", x.speed_fpm, 0); }, function (i) { u.hoists.splice(i, 1); S.commit({ noUndo: true }); render(); }));
    box.appendChild(hc);

    function srcCount(src) { return TLA.data.trusses.filter(function (x) { return x.source === src; }).length; }
    box.appendChild(h("div", { "class": "card" }, h("h2", { text: "Built-in data" }), h("p", { "class": "sub", text: TLA.data.trusses.length + " trusses (" + srcCount("TLA") + " from the Truss Load Analyzer workbooks, " + srcCount("MFG") + " straight from manufacturers' data; " + TLA.data.trusses.filter(function (x) { return x.units === "metric"; }).length + " with native metric tables), " + TLA.data.hoists.length + " chain hoists, " + TLA.data.fixtures.length + " fixtures from the original workbook (read-only), plus " + TLA.data.corners.length + " corner blocks from the manufacturers. Your custom entries are stored in this browser and included in saved rig files." })));
  }

  function listBlock(items, label, remove) {
    if (!items.length) return h("p", { "class": "sub", text: "No custom entries yet." });
    return h("table", { "class": "tbl wide" }, h("tbody", null, items.map(function (x, i) {
      return h("tr", null, h("td", { text: label(x) }), h("td", null, h("button", { "class": "x", text: "x", onclick: function () { remove(i); } })));
    })));
  }

  TLA.tools = {
    mount: function (store) { S = store; P = TLA.panels; h = P.h; fmt = P.fmt; U = TLA.units; },
    show: function (name, container) {
      holder = container;
      current = { circular: circular, udl: simpleUdl, fixtures: fixtures, databases: databases }[name];
      render();
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
