/* Inspector (selected truss), elevation diagram, and rig summary. Plain DOM. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var S = null, U = TLA.units;
  var NS = "http://www.w3.org/2000/svg";

  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") e.className = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === false || attrs[k] == null) return;
      else e.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    (function add(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c == null) continue;
        if (Array.isArray(c)) add(c);
        else e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    })(Array.prototype.slice.call(arguments, 2));
    return e;
  }
  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "-";
    d = d == null ? 1 : d;
    return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString(undefined, { maximumFractionDigits: d });
  }
  /* ---- lengths: type decimal feet (4.1667) or feet-inches (4-2, 4'2", 4' 2 1/2") ---- */
  function parseLen(str) {
    var s = String(str == null ? "" : str).trim().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/\s*ft/i, "'").replace(/\s*in/i, '"');
    if (!s) return NaN;
    var neg = false; if (s.charAt(0) === "-") { neg = true; s = s.slice(1).trim(); }
    var m;
    if (/^\d*\.?\d+$/.test(s)) return (neg ? -1 : 1) * parseFloat(s);
    if ((m = s.match(/^(\d*\.?\d+)\s*"$/))) return (neg ? -1 : 1) * parseFloat(m[1]) / 12;
    m = s.match(/^(\d+)\s*(?:'|-|\s)\s*(?:(\d*\.?\d+)(?:[\s-]+(\d+)\/(\d+))?)?\s*"?$/);
    if (!m) return NaN;
    var inches = m[2] ? parseFloat(m[2]) : 0;
    if (m[3] && m[4] && +m[4] > 0) inches += +m[3] / +m[4];
    return (neg ? -1 : 1) * (parseFloat(m[1]) + inches / 12);
  }
  function fmtFtIn(v) {
    if (v == null || !isFinite(v)) return "";
    var neg = v < 0, q = Math.round(Math.abs(v) * 12 * 16), whole = Math.floor(q / 16), fr = q % 16, ft = Math.floor(whole / 12), inch = whole % 12, f = "";
    if (fr) { var a = fr, b = 16; while (a % 2 === 0) { a /= 2; b /= 2; } f = " " + a + "/" + b; }
    return (neg ? "-" : "") + ft + "'-" + inch + f + '"';
  }
  function lenText(v) {
    if (v === "" || v == null) return "";
    if (U.metric()) return String(Math.round(Number(v) * U.FT_M * 1000) / 1000);   // to the mm (the rig keeps 0.001 ft = 0.3 mm)
    if (S.rig && S.rig.settings && S.rig.settings.lengthFormat === "ftin") return fmtFtIn(Number(v));
    return String(Math.round(Number(v) * 10000) / 10000);
  }
  /** A length typed in the shown units (metres, or feet / feet-inches) -> feet. */
  function parseShownLen(str) { return U.parseLength(str, parseLen); }
  /** opts.ft: a length (shown and typed in ft or m). opts.q: another unit kind of TLA.units ("w", "wpl", "inch",
   * "stiff"...) - the value is kept in imperial and shown / typed in the rig's display units. */
  function numInput(value, onchange, opts) {
    opts = opts || {};
    if (opts.ft) {
      var ti = h("input", { type: "text", inputmode: "text", value: lenText(value), "class": "num " + (opts.cls || ""), title: (opts.title ? opts.title + ". " : "") + (U.metric() ? "Type metres (2.5), or 250 cm / 2500 mm; feet-inches (8'2\") also work" : "Type decimal feet (4.1667) or feet-inches (4-2, 4'2\", 4' 2 1/2\")"), placeholder: opts.placeholder, autocomplete: "off" });
      ti.addEventListener("change", function () {
        var v = parseShownLen(ti.value);
        if (!isFinite(v)) { ti.value = lenText(value); ti.classList.add("bad"); setTimeout(function () { ti.classList.remove("bad"); }, 800); return; }
        onchange(v);
      });
      return ti;
    }
    var q = opts.q, shown = q && value !== "" && value != null && isFinite(value) ? Math.round(U.v(q, value) * 10000) / 10000 : value;
    var i = h("input", { type: "number", step: opts.step || "any", value: shown, "class": "num " + (opts.cls || ""), min: opts.min, title: opts.title, placeholder: opts.placeholder });
    i.addEventListener("change", function () {
      var v = parseFloat(i.value);
      v = isFinite(v) ? v : 0;
      onchange(q ? U.back(q, v) : v);
    });
    return i;
  }
  function textInput(value, onchange, cls, placeholder) {
    var i = h("input", { type: "text", value: value || "", "class": cls || "", placeholder: placeholder });
    i.addEventListener("change", function () { onchange(i.value); });
    return i;
  }
  /** Model name in pickers, tagged where the data is not the original workbook's imperial table (1.6.0). */
  function trussLabel(x) {
    var tags = [];
    if (x.source === "MFG") tags.push("MFG"); else if (x.source === "User") tags.push("custom");
    if (x.units === "metric") tags.push("metric data");
    return String(x.description).trim() + (tags.length ? " (" + tags.join(", ") + ")" : "");
  }
  /** Models of one maker for a picker: the manufacturer's own data first (1.10.0), then the workbook's and custom rows.
   * Hidden entries (kept only so older saved rigs open, 1.11.0) are left out unless `keep` is that entry's id. */
  function modelsOf(list, maker, keep) {
    var same = list.filter(function (x) { return x.manufacturer === maker && (!x.hidden || x.id === keep); });
    return same.filter(function (x) { return x.source === "MFG"; }).concat(same.filter(function (x) { return x.source !== "MFG"; }));
  }
  /** Where a truss entry's numbers come from, in words. */
  function trussSource(x) {
    var s = x.source === "MFG" ? "manufacturer" : x.source === "User" ? "your custom entry" : x.source === "TLA" ? "Truss Load Analyzer workbook" : "";
    return (s ? "Source: " + s + (x.source_ref ? " - " + x.source_ref : "") : "") + (x.units === "metric" ? " (native metric table, 1 m steps)" : "") + (x.note ? ". Note: " + x.note : "");
  }

  function select(options, value, onchange) {
    var s = h("select");
    options.forEach(function (o) { var op = h("option", { value: o.value, text: o.label }); if (String(o.value) === String(value)) op.selected = true; s.appendChild(op); });
    s.addEventListener("change", function () { onchange(s.value); });
    return s;
  }
  function field(label, control, cls) { return h("label", { "class": "field " + (cls || "") }, h("span", { text: label }), control); }
  function badge(status) {
    var cls = status === "Good" ? "ok" : status === "No Load" || status === "Check" || status === "Slack" ? "warn" : "fail";
    return h("span", { "class": "badge " + cls, text: status });
  }

  /* ---------- elevation diagram of one truss ---------- */
  function elevation(t, res) {
    var W = 420, H = 150, pad = 26;
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "elev");
    function add(tag, attrs, txt) {
      var e = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (txt != null) e.textContent = txt;
      svg.appendChild(e); return e;
    }
    var L = res.beam.length, sx = (W - pad * 2) / L, X = function (d) { return pad + d * sx; }, yb = 62;
    var segs = res.limits.segments, P = res.beam.positions;
    // beam body coloured by segment status
    var bounds = [0].concat(P).concat([L]);
    var idx = 0;
    segs.forEach(function (sg, i) {
      var a = bounds[i], b = bounds[i + 1];
      if (b - a < 1e-9) return;
      add("rect", { x: X(a), y: yb - 6, width: (b - a) * sx, height: 12, "class": "eb " + (sg.code ? "fail" : sg.type.indexOf("cant") === 0 ? "cant" : "ok") });
      var lab = U.mark(b - a, 2) + (sg.code ? " " + sg.status : "");
      add("text", { x: X((a + b) / 2), y: yb - 12, "text-anchor": "middle", "class": "et" + (sg.code ? " fail" : "") }, lab);
    });
    // loads
    res.beam.loads.forEach(function (l) {
      var x = X(l.distance);
      add("path", { d: "M" + x + " " + (yb - 6) + " l -3.5 -8 l 7 0 z", "class": "el" + (l.injected ? " inj" : l.mirrored ? " ghost" : "") });
      if (Math.abs(l.weight) > 0.5) add("text", { x: x, y: yb - 32 - ((idx++) % 2) * 0, "text-anchor": "middle", "class": "et small rot", transform: "rotate(-60 " + x + " " + (yb - 18) + ")" }, U.n("w", l.weight, 0));
    });
    // supports + reactions
    res.supports.forEach(function (sr, i) {
      var x = X(sr.support.distance);
      var isH = sr.support.kind === "hoist";
      add("path", { d: "M" + x + " " + (yb + 6) + " l -7 12 l 14 0 z", "class": "es " + (isH ? "hoist" : "bear") });
      add("text", { x: x, y: yb + 34, "text-anchor": "middle", "class": "et strong" + (sr.reaction < 0 ? " fail" : "") }, U.n("w", sr.reaction, 0));
      add("text", { x: x, y: yb + 46, "text-anchor": "middle", "class": "et small" }, (isH ? "hoist" : "bolted to " + ((S.truss(sr.support.onTruss) || {}).name || "?")));
      add("text", { x: x, y: yb + 58, "text-anchor": "middle", "class": "et small" }, U.mark(sr.support.distance, 2));
    });
    return svg;
  }

  /** Shear and bending-moment diagrams under the elevation (same horizontal scale), with the table-derived
   * allowable as dashed lines. Shows the diagram the check uses (without truss self weight unless the stricter option). */
  function forceDiagrams(res) {
    var mb = res.limits.member;
    if (!mb) return null;
    var d = mb.checked, W = 420, pad = 26, band = 62, gap = 16, H = 2 * band + gap + 22;
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", "elev forces");
    function add(tag, attrs, txt) {
      var e = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (txt != null) e.textContent = txt;
      svg.appendChild(e); return e;
    }
    var L = d.length || 1, sx = (W - pad * 2) / L, X = function (x) { return pad + x * sx; };
    function plot(top, title, pts, maxAbs, allowed, over, unit) {
      var mid = top + band / 2 + 6, lim = allowed > 0 && allowed < 3 * maxAbs ? allowed : 0;
      var scale = (band / 2 - 4) / (Math.max(maxAbs, lim) || 1);
      add("text", { x: pad - 22, y: top + 8, "class": "et small" }, title);
      add("text", { x: W - pad + 22, y: top + 8, "text-anchor": "end", "class": "et" + (over ? " fail" : "") },
        "max " + U.f(unit, maxAbs, 0) + (allowed > 0 ? " / about " + U.n(unit, allowed, 0) + " allowed" : ""));
      add("line", { x1: X(0), x2: X(L), y1: mid, y2: mid, "class": "axis" });
      if (lim) [1, -1].forEach(function (s) { add("line", { x1: X(0), x2: X(L), y1: mid - s * lim * scale, y2: mid - s * lim * scale, "class": "limit" }); });
      var path = "M" + X(0) + " " + mid + " " + pts.map(function (p) { return "L" + X(p[0]).toFixed(1) + " " + (mid - p[1] * scale).toFixed(1); }).join(" ") + " L" + X(L) + " " + mid + " Z";
      add("path", { d: path, "class": "fd" + (over ? " over" : "") });
    }
    var sh = [], mo = [];
    d.points.forEach(function (p, i) {
      sh.push([p.x, p.vl], [p.x, p.vr]);
      var nx = d.points[i + 1];
      mo.push([p.x, p.m]);
      if (nx && d.w > 0) for (var k = 1; k < 8; k++) {            // moment is a parabola under a uniform load
        var x = p.x + (nx.x - p.x) * k / 8, dx = x - p.x;
        mo.push([x, p.m + p.vr * dx - d.w * dx * dx / 2]);
      }
    });
    plot(4, "Shear", sh, d.maxShear, mb.shearAllowed, mb.shearOver, "w");
    plot(4 + band + gap, "Moment", mo, d.maxMoment, mb.momentAllowed, mb.momentOver, "mom");
    add("text", { x: W / 2, y: H - 3, "text-anchor": "middle", "class": "et small" },
      "Sagging moment up. Allowable estimated from the manufacturer's tables" + (d === mb.diagram ? "." : "; truss self weight left out, as in the tables."));
    return svg;
  }

  /* ---------- inspector ---------- */
  /** Search-as-you-type fixture picker with an optional clamp. onPick(fixture, clampLb) adds the load. */
  function fixturePicker(onPick) {
    var fixtures = S.db().fixtures;
    var listId = "fxlist" + Math.floor(Math.random() * 1e9);
    var dl = h("datalist", { id: listId });
    fixtures.forEach(function (f) { dl.appendChild(h("option", { value: f.manufacturer + " " + f.fixture, label: U.f("w", f.weight_lb, 1) + (f.clamp_lb ? " + " + U.n("w", f.clamp_lb, 1) + " clamp" : "") })); });
    var input = h("input", { type: "text", "class": "fxsearch", list: listId, placeholder: "Add fixture: type to search (e.g. mac one)", autocomplete: "off" });
    var withClamp = h("input", { type: "checkbox", checked: S.ui.fxClamp !== false });
    var clampLb = h("input", { type: "number", "class": "num w50", step: "any", min: 0, title: "Clamp weight (" + U.unit("w") + "). Filled in from the fixture when it has one; type your own for others.", placeholder: U.unit("w") });
    if (S.ui.fxClampLb != null) clampLb.value = S.ui.fxClampLb;
    function find(txt) {
      txt = txt.trim().toLowerCase(); if (!txt) return null;
      var exact = fixtures.filter(function (f) { return (f.manufacturer + " " + f.fixture).toLowerCase() === txt; })[0];
      if (!exact) { var fl = txt.replace(/[^a-z0-9.]/g, ""); exact = fixtures.filter(function (f) { return (f.manufacturer + f.fixture).toLowerCase().replace(/[^a-z0-9.]/g, "") === fl; })[0]; }
      if (exact) return exact;
      var flat = function (x) { return x.toLowerCase().replace(/[^a-z0-9.]/g, ""); };
      var words = txt.split(/\s+/).map(flat).filter(Boolean);
      var hits = fixtures.filter(function (f) { var n = flat(f.manufacturer + " " + f.fixture); return words.every(function (w) { return n.indexOf(w) >= 0; }); });
      if (!hits.length) return null;
      hits.sort(function (a, b) { return (a.manufacturer + a.fixture).length - (b.manufacturer + b.fixture).length; });
      return hits.length === 1 || (hits[0].manufacturer + hits[0].fixture).length < (hits[1].manufacturer + hits[1].fixture).length || flat(hits[0].manufacturer + hits[0].fixture) === flat(hits[1].manufacturer + hits[1].fixture) ? hits[0] : null;
    }
    function preview() {
      var f = find(input.value);
      if (f && f.clamp_lb) clampLb.value = Math.round(U.v("w", f.clamp_lb) * 100) / 100;
    }
    function commit() {
      var f = find(input.value);
      if (!f) return false;
      S.ui.fxClamp = withClamp.checked;
      var typed = parseFloat(clampLb.value) > 0 ? U.back("w", parseFloat(clampLb.value)) : 0;
      var c = withClamp.checked ? (typed || (f.clamp_lb || 0)) : 0;
      onPick(f, c);
      return true;
    }
    input.addEventListener("input", preview);
    input.addEventListener("change", function () { preview(); if (find(input.value)) commit(); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); if (!commit()) input.classList.add("bad"); setTimeout(function () { input.classList.remove("bad"); }, 700); } });
    withClamp.addEventListener("change", function () { S.ui.fxClamp = withClamp.checked; });
    return h("div", { "class": "fxpick" }, dl, input,
      h("label", { "class": "mini check", title: "Add the clamp weight to the load" }, withClamp, "+ clamp"), clampLb);
  }

  function supportsTable(container, t, res, db) {
    container.appendChild(h("div", { "class": "row-btns" }, h("button", { "class": "primary", text: "+ Add hoist", title: "Add a hoist in the middle of this truss, then set its position", onclick: function () { S.addHoist(t.id); } })));
    var stbl = h("table", { "class": "tbl sup" });
    stbl.appendChild(h("thead", null, h("tr", null, h("th", { text: "At (" + U.unit("len") + ") from" }), h("th", { text: "Type" }), h("th", { text: "Detail" }), h("th", { text: "Load" }), h("th"))));
    var tb = h("tbody");
    t.supports.forEach(function (s, i) {
      var sr = res && res.supports[i];
      var detail = h("div", { "class": "detail" });
      if (s.kind === "hoist") {
        detail.appendChild(select(db.hoists.map(function (x) { return { value: x.id, label: x.brand + " " + x.description + " " + x.capacity_label + (U.metric() && x.capacity_lb < 999999 ? " (" + U.f("w", x.capacity_lb, 0) + ")" : "") + " " + U.f("speed", x.speed_fpm, 0) }; }), s.hoistId, function (v) { s.hoistId = parseInt(v, 10); S.commit(); }));
        detail.appendChild(h("span", { "class": "mini", text: "chain " + U.unit("len") }));
        detail.appendChild(numInput(s.chainLength || 0, function (v) { s.chainLength = v; S.commit(); }, { cls: "w50", ft: true, title: "Chain length" }));
      } else {
        var others = S.rig.trusses.filter(function (o) { return o.id !== t.id; });
        detail.appendChild(select(others.map(function (o) { return { value: o.id, label: o.name }; }), s.onTruss, function (v) { s.onTruss = v; S.commit(); }));
        detail.appendChild(h("span", { "class": "mini", text: "at" }));
        detail.appendChild(numInput(s.onDistance || 0, function (v) { s.onDistance = v; s.fromPlan = false; S.commit(); }, { cls: "w50", ft: true }));
        var tgt = S.truss(s.onTruss);
        if (!tgt || !tgt.isBlock) detail.appendChild(select([{ value: "", label: "in plane" }, { value: "above", label: "above" }, { value: "below", label: "below" }], s.mount || "", function (v) { s.mount = v || null; S.commit(); }));
        detail.appendChild(h("label", { "class": "mini check", title: "Keep both distances tied to the plan geometry" }, h("input", { type: "checkbox", checked: !!s.fromPlan, onchange: function (e) { s.fromPlan = e.target.checked; S.commit(); } }), "plan"));
      }
      if (s.kind === "hoist") {
        var hd0 = db.hoists.filter(function (q) { return q.id === s.hoistId; })[0], auto = sr && sr.hoist ? sr.hoist.dynamicFactor : 1.25;
        detail.appendChild(h("span", { "class": "mini", text: "DLF" }));
        detail.appendChild(numInput(s.dlf || "", function (v) { s.dlf = v > 0 ? v : undefined; S.commit(); }, { cls: "w50", placeholder: fmt(auto, 3), title: "Dynamic load factor. Blank = from the hoist speed (speed in fpm / 60 + 1; 16 fpm = 4.9 m/min = 1.267), or the default in the results bar if the speed is unknown. Now " + fmt(auto, 3) }));
      }
      detail.appendChild(h("span", { "class": "mini", text: "+" + U.unit("w") }));
      detail.appendChild(numInput(s.hardwareWeight || 0, function (v) { s.hardwareWeight = v; S.commit(); }, { cls: "w50", q: "w", title: "Hardware weight at this connection" }));
      var load = sr ? (sr.hoist ? h("div", null, h("b", { text: U.n("w", sr.hoist.staticLoad, 0) }), " " + U.unit("w") + " ", badge(sr.hoist.status), h("div", { "class": "mini", text: "dyn " + U.n("w", sr.hoist.dynamicLoad, 0) + " / cap " + U.n("w", sr.hoist.capacity, 0) })) : h("div", null, h("b", { text: U.n("w", sr.reaction, 0) }), " " + U.unit("w"))) : h("span");
      tb.appendChild(h("tr", { "class": S.sel.support === s.id ? "sel" : "", onclick: function () { S.sel.support = s.kind === "hoist" ? s.id : null; } },
        h("td", null, posCell(s, t.length)),
        h("td", null, select([{ value: "hoist", label: "Hoist" }, { value: "truss", label: "Bolted to truss" }], s.kind, function (v) {
          s.kind = v;
          if (v === "truss") { var o = S.rig.trusses.filter(function (x) { return x.id !== t.id; })[0]; if (o) { s.onTruss = o.id; s.onDistance = 0; } else { s.kind = "hoist"; alert("Add another truss first."); } }
          else if (!s.hoistId) { s.hoistId = S.defaultHoistId(); s.chainLength = 20; }
          S.commit();
        })),
        h("td", null, detail), h("td", null, load),
        h("td", null, h("button", { "class": "del", title: s.kind === "hoist" ? "Delete this hoist" : "Delete this connection", text: s.kind === "hoist" ? "Delete hoist" : "Delete", onclick: function (e) { e.stopPropagation(); S.removeSupport(t.id, s.id); } }))));
    });
    stbl.appendChild(tb); container.appendChild(stbl);

  }

  function fmtLen(v) {
    if (U.metric()) return U.mark(v, 2);
    if (Math.abs(v - Math.round(v)) < 0.0005) return Math.round(v) + "'";
    var inches = v * 12;
    if (Math.abs(inches - Math.round(inches)) < 0.06) return Math.round(inches) + "\"";
    return fmt(v, 3) + "'";
  }
  /** Build a run of truss from component pieces: tags for what is in it, buttons for the standard sticks. */
  function pieceBuilder(t, pieces, api) {
    var lengths = S.pieceLengths(t), box = h("div", { "class": "pieces" });
    var tags = h("div", { "class": "ptags" });
    pieces.forEach(function (p, j) {
      if (api.insert && j > 0) tags.appendChild(h("button", { "class": "cb-ins", text: "+CB", title: "Put a corner block between these two pieces", onclick: function () { api.insert(j); } }));
      tags.appendChild(h("span", { "class": "ptag", title: "Remove this piece" , onclick: function () { api.remove(j); } }, fmtLen(p) + " ", h("i", { text: "x" })));
    });
    if (!pieces.length) tags.appendChild(h("span", { "class": "mini", text: "no truss - add pieces" }));
    box.appendChild(tags);
    var chips = h("div", { "class": "pchips" });
    lengths.forEach(function (len) { chips.appendChild(h("button", { "class": "chip-btn", text: "+" + fmtLen(len), title: "Add a " + fmtLen(len) + " stick", onclick: function () { api.add(len); } })); });
    var custom = h("input", { type: "text", "class": "num w50", placeholder: U.unit("len"), title: U.metric() ? "A stick of another length: metres (1.5), cm or mm" : "A stick of another length: decimal feet or feet-inches (2-6)" });
    chips.appendChild(custom);
    chips.appendChild(h("button", { "class": "chip-btn", text: "+ add", onclick: function () { var v = parseShownLen(custom.value); if (v > 0) { S.rememberPiece(v); api.add(v); } else if (custom.value.trim()) alert("Could not read that length. Use 2.5 or 2-6."); } }));
    box.appendChild(chips);
    return box;
  }

  /** Corner blocks are components of the truss: CB + 3' + CB + 22' + CB + 3'. Pieces between them are set here; the line is one span. */
  function layoutEditor(container, t) {
    var db = S.db();
    if (!S.ui.blockTypeId || !db.corners.some(function (c) { return c.id === S.ui.blockTypeId; })) {
      var te = db.trusses.filter(function (x) { return x.id === t.trussId; })[0];
      S.ui.blockTypeId = (S.suggestBlock(te) || db.corners[0]).id;
    }
    var manual = t.layout && t.layout.manual, derived = manual ? null : S.layoutDerived(t);
    var segs = manual ? t.layout.segs : derived.segs;
    var order = manual ? t.layout.order.map(function (id) { return S.truss(id); }) : derived.att.map(function (a) { return a.block; });
    function addBlk(spec) { var r = S.addBlockToLine(t.id, S.ui.blockTypeId, spec); if (typeof r === "string") alert(U.text(r)); }
    function hostName(b) { var hh = S.truss(b.host || (b.attach && b.attach.b)); return hh ? hh.name : "?"; }

    var card = h("div", { "class": "layout" });
    card.appendChild(h("h4", { text: "Corner blocks on this truss" }));
    card.appendChild(h("div", { "class": "sub", text: "A corner block is part of the truss: add it at the start, the end, or after a run of truss. Other trusses then bolt to it at 90 degrees." }));
    card.appendChild(h("div", { "class": "row-btns" }, h("span", { "class": "mini", text: "Block to add" }), blockTypeSelect(S.ui.blockTypeId, function (v) { S.ui.blockTypeId = v; S.persist(); S.emit(); })));
    if (manual) {
      var parts = [];
      function segText(i) { var p = t.layout.pieces[i] || []; return p.length ? p.map(fmtLen).join(" + ") : (t.layout.segs[i] > 0 ? fmtLen(t.layout.segs[i]) : ""); }
      for (var q = 0; q < t.layout.segs.length; q++) {
        var st = segText(q); if (st) parts.push(st);
        if (q < order.length) parts.push("CB");
      }
      card.appendChild(h("div", { "class": "notation", text: parts.join(" + ") + "  =  " + U.f("len", t.length, 3) }));
    }
    var atVal = h("input", { type: "text", "class": "num w60", placeholder: U.unit("len"), title: U.metric() ? "Distance of the block center: metres (3.8), cm or mm" : "Distance of the block center: decimal feet or feet-inches (4-2)" });
    var atFrom = select([{ value: "start", label: "from start" }, { value: "center", label: "from centerline" }, { value: "end", label: "from end" }], "start", function () {});
    card.appendChild(h("div", { "class": "row-btns" }, h("span", { "class": "mini", text: "Corner block at" }), atVal, atFrom,
      h("button", { text: "Add there", title: "Put a corner block exactly here; the run of truss is split at this point", onclick: function () {
        var v = parseShownLen(atVal.value);
        if (!isFinite(v)) { alert(U.metric() ? "Type the distance first (for example 3.8)." : "Type the distance first (for example 12.5 or 12-6)."); return; }
        var err = S.addBlockAtMeasure(t.id, S.ui.blockTypeId, v, atFrom.value);
        if (err) alert(U.text(err));
      } })));
    var rows = h("div", { "class": "seqrows" });
    function segRow(i, label) {
      var v = segs[i];
      if (!manual) {
        if (v > 0 || label) rows.appendChild(h("div", { "class": "seg" }, h("span", { "class": "mini", text: label }), h("b", { text: U.n("len", v, 3) }), h("span", { "class": "mini", text: U.unit("len") })));
        return;
      }
      var pieces = (t.layout.pieces && t.layout.pieces[i]) || [];
      rows.appendChild(h("div", { "class": "segbox" },
        h("div", { "class": "seg" }, h("span", { "class": "mini", text: label }), h("b", { text: U.n("len", v, 3) }), h("span", { "class": "mini", text: U.unit("len") + " of truss" }),
          numInput(v, function (nv) { S.setSegment(t, i, nv); }, { cls: "w60", ft: true, title: "Type a total instead of picking sticks" })),
        pieceBuilder(t, pieces, { add: function (len) { S.addSegPiece(t, i, len); }, remove: function (j) { S.removeSegPiece(t, i, j); }, insert: function (j) { addBlk({ seg: i, piece: j }); } }),
        h("div", { "class": "row-btns" }, h("button", { text: "+ Corner block after these pieces", onclick: function () { addBlk({ seg: i }); } }))));
    }
    function blockRow(b) {
      var r = S.results && S.results.trusses[b.id], type = r && r.block && r.block.type, mine = b.host === t.id;
      var bolted = S.rig.trusses.filter(function (o) { return o.supports.some(function (s) { return s.kind === "truss" && s.onTruss === b.id; }); }).map(function (o) { return o.name; });
      rows.appendChild(h("div", { "class": "cbrow" }, h("span", { "class": "cbmark" }), mine ? textInput(b.name, function (v) { b.name = v || b.name; S.commit(); }, "cbname", "name") : h("b", { text: b.name }), h("span", { "class": "mini", text: U.f("len", b.length, 3) + (type ? " - " + type.name : "") + " - " + U.text(S.blockWhere(b)) + (bolted.length ? " - bolted: " + bolted.join(", ") : "") }),
        h("button", { "class": "del", text: "select", onclick: function () { S.sel = { truss: b.id, support: null }; S.emit(); } }),
        mine ? h("button", { "class": "del", text: "remove", title: "Take this corner block out of the truss", onclick: function () { S.removeTruss(b.id); } }) : null));
    }
    if (order.length) {
      var startIn = numInput(S.ui.cbStart != null ? S.ui.cbStart : 1, function (v) { S.ui.cbStart = v; }, { cls: "w50", title: "Number the first corner block on this truss with this" });
      card.appendChild(h("div", { "class": "row-btns" }, h("span", { "class": "mini", text: "Number blocks from" }), startIn,
        h("button", { text: "Renumber this truss", title: "Rename this truss's corner blocks in order along the line", onclick: function () { S.renumberBlocks(t.id, S.ui.cbStart != null ? S.ui.cbStart : 1); } }),
        h("button", { text: "Renumber all trusses", title: "Do the same for every truss in the rig", onclick: function () { S.rig.trusses.forEach(function (x) { if (!x.isBlock) S.renumberBlocks(x.id, S.ui.cbStart != null ? S.ui.cbStart : 1); }); } })));
    }
    if (manual) card.appendChild(h("div", { "class": "row-btns" }, h("button", { text: "+ Corner block at start", onclick: function () { addBlk({ at: "start" }); } })));
    if (order.length || manual) {
      segRow(0, order.length ? "before first block" : "truss");
      order.forEach(function (b, i) { blockRow(b); segRow(i + 1, i === order.length - 1 ? "after last block" : "between blocks"); });
    }
    card.appendChild(rows);
    if (manual) {
      card.appendChild(h("div", { "class": "row-btns" }, h("button", { text: "+ Corner block at end", onclick: function () { addBlk({ at: "end" }); } })));
    } else {
      card.appendChild(h("div", { "class": "row-btns" },
        h("button", { "class": "primary", text: "+ Corner block at start", onclick: function () { addBlk({ at: "start" }); } }),
        h("button", { "class": "primary", text: "+ Corner block at end", onclick: function () { addBlk({ at: "end" }); } }),
        order.length ? h("button", { text: "Set segment lengths...", title: "Type the length of each run of truss between the corner blocks", onclick: function () { S.startManualLayout(t); } }) : null));
    }
    container.appendChild(card);
  }

  function lockedInput(v) { return h("input", { type: "number", "class": "num", value: Math.round(U.v("len", v) * 10000) / 10000, disabled: true, title: "Set by the corner block this truss is bolted to" }); }

  function posCell(item, L) {
    var from = item.from || "start";
    var inp = numInput(S.measureDisplay(item, L), function (v) { S.measureSet(item, v, L); if (item.fromPlan) item.fromPlan = false; S.commit(); }, { cls: "w60", ft: true, title: from === "center" ? "Distance from the centerline of the whole line (+ toward the far end)" : from === "end" ? "Distance from the far end of the whole line" : "Distance from the start of the whole line" });
    var ref = select([{ value: "start", label: "start" }, { value: "center", label: "centerline" }, { value: "end", label: "end" }], from, function (v) { S.measureFrom(item, v, L); S.commit(); });
    ref.className = "ref";
    return h("div", { "class": "poscell" }, inp, ref);
  }

  function blockLabel(c) {
    var u = U.unit("w"), w = c.base_lb != null ? U.n("w", c.base_lb, 1) + " " + u + " bare + " + U.n("w", c.per_connection_lb, 1) + " per plate" : c.variants ? c.variants.map(function (v) { return U.n("w", v[1], 1); }).join("/") + " " + u : c.weight_lb != null ? U.f("w", c.weight_lb, 1) : "weight n/a";
    return (c.family.indexOf(c.manufacturer.split(" ")[0]) === 0 ? "" : c.manufacturer.replace("James Thomas Engineering", "JTE") + " ") + c.family + " - " + c.name + " (" + c.ways + "-way, " + w + ")";
  }
  function uniq(a) { var o = []; a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
  /** Maker > truss family > block, each filtering the next. */
  function blockTypeSelect(value, onchange) {
    var list = S.db().corners, cur = list.filter(function (c) { return c.id === value; })[0] || list[0];
    var makers = uniq(list.map(function (c) { return c.manufacturer; }));
    var fams = uniq(list.filter(function (c) { return c.manufacturer === cur.manufacturer; }).map(function (c) { return c.family; }));
    var blocks = list.filter(function (c) { return c.manufacturer === cur.manufacturer && c.family === cur.family; });
    function first(pred) { return list.filter(pred)[0].id; }
    function wt(c) { var u = U.unit("w"); return c.base_lb != null ? U.n("w", c.base_lb, 1) + "+" + U.n("w", c.per_connection_lb, 1) + "/plate " + u : c.variants ? c.variants.map(function (v) { return U.n("w", v[1], 1); }).join("/") + " " + u : c.weight_lb != null ? U.f("w", c.weight_lb, 1) : "weight n/a"; }
    return h("div", { "class": "blockpick" },
      select(makers.map(function (m) { return { value: m, label: m }; }), cur.manufacturer, function (v) { onchange(first(function (c) { return c.manufacturer === v; })); }),
      select(fams.map(function (f) { return { value: f, label: f }; }), cur.family, function (v) { onchange(first(function (c) { return c.manufacturer === cur.manufacturer && c.family === v; })); }),
      select(blocks.map(function (c) { return { value: c.id, label: c.name + " - " + c.ways + "-way, " + wt(c) }; }), cur.id, function (v) { onchange(parseInt(v, 10)); }));
  }

  function connectionControls(container, t) {
    var trusses = S.rig.trusses.filter(function (o) { return o.id !== t.id && !o.isBlock; });
    var blocks = S.rig.trusses.filter(function (o) { return o.isBlock && o.host !== t.id; });
    function addHoist() { t.supports.push(S.applyMeasure(S.hoistSupport(round(t.length / 2)), t)); S.commit(); }
    if (t.isBlock) {
      container.appendChild(h("div", { "class": "row-btns" }, h("button", { text: "+ Hoist", onclick: addHoist })));
      return;
    }
    container.appendChild(h("h4", { text: "Bolt this truss to a corner block" }));
    if (!blocks.length) {
      container.appendChild(h("div", { "class": "sub", text: "No corner blocks yet. Add one to a truss (\"Corner blocks on this truss\"), then bolt this truss to it here." }));
    } else {
      container.appendChild(h("div", { "class": "sub", text: "Bolts at 90 degrees. The truss is turned and placed to meet the block and then stays there." }));
    }
    var mode = S.ui.boltMode || "auto";
    var modeSel = select([{ value: "auto", label: "automatic" }, { value: "start", label: "this truss's start meets the block" }, { value: "end", label: "this truss's end meets the block" }, { value: "through", label: "the block is along this truss" }], mode, function (v) { S.ui.boltMode = v; S.persist(); });
    var toBlock = blocks.length ? select([{ value: "", label: "Bolt to corner block..." }].concat(blocks.map(function (o) { var hh = S.truss(o.host || (o.attach && o.attach.b)); return { value: o.id, label: o.name + " - " + U.text(S.blockWhere(o)) }; })), "", function (v) {
      if (!v) return;
      var err = S.boltToBlock(t.id, v, S.ui.boltMode || "auto", S.ui.boltSide || "auto");
      if (err) alert(U.text(err));
    }) : null;
    var mountSel = select([{ value: "above", label: "sits above" }, { value: "below", label: "clamped below" }], S.ui.mount || "above", function (v) { S.ui.mount = v; S.persist(); });
    var direct = select([{ value: "", label: "Stack / clamp at one point on..." }].concat(trusses.map(function (o) { return { value: o.id, label: o.name }; })), "", function (v) {
      if (!v) return;
      var err = S.addCrossingSupport(t.id, v, S.ui.mount || "above");
      if (err) alert(U.text(err));
    });
    var sideSel = select([{ value: "auto", label: "direction: automatic" }, { value: "north", label: "extends NORTH (up the plan)" }, { value: "south", label: "extends SOUTH (down the plan)" }, { value: "east", label: "extends EAST (right)" }, { value: "west", label: "extends WEST (left)" }], S.ui.boltSide || "auto", function (v) { S.ui.boltSide = v; S.persist(); });
    if (toBlock) container.appendChild(h("div", { "class": "row-btns" }, toBlock, modeSel, sideSel));
    container.appendChild(h("div", { "class": "row-btns" }, mountSel, direct));
  }

  function blockInspector(container, t, res) {
    var db = S.db(), b = res && res.block, type = db.corners.filter(function (c) { return c.id === t.blockTypeId; })[0];
    container.appendChild(h("div", { "class": "ins-head" },
      textInput(t.name, function (v) { t.name = v || t.name; S.commit(); }, "title-input"),
      h("div", { "class": "row-btns" }, h("button", { "class": "danger", text: "Delete", onclick: function () { if (confirm("Delete " + t.name + " and its connections?")) S.removeTruss(t.id); } }))));
    container.appendChild(h("div", { "class": "sub", text: "Corner block. It is a component of " + ((S.truss(t.host || (t.attach && t.attach.b)) || {}).name || "a truss") + " and cannot be moved on its own; change the pieces in that truss to move it." }));
    container.appendChild(field("Block type", blockTypeSelect(t.blockTypeId, function (v) { t.blockTypeId = v; t.variant = undefined; var ty = db.corners.filter(function (c) { return c.id === v; })[0]; if (ty) t.length = S.blockLength(ty); S.commit(); })));
    if (type && type.variants) {
      var vi = typeof t.variant === "number" ? t.variant : Math.floor(type.variants.length / 2);
      container.appendChild(field("Hardware fitted", select(type.variants.map(function (v, i) { return { value: i, label: v[0] + " - " + U.f("w", v[1], 1) }; }), vi, function (v) { t.variant = parseInt(v, 10); S.commit(); })));
    }
    if (b) {
      var full = b.waysAvailable && b.waysUsed > b.waysAvailable;
      container.appendChild(h("div", { "class": "chips" },
        h("span", { "class": "chip", text: U.f("w", b.weight, 1) }),
        h("span", { "class": "chip " + (full ? "fail" : "ok"), text: b.waysUsed + (b.waysAvailable ? " / " + b.waysAvailable : "") + " faces used" }),
        h("span", { "class": "chip", text: "Layer " + S.results.layers[t.id] })));
      if (type) container.appendChild(h("div", { "class": "sub" }, (type.family.indexOf(type.manufacturer.split(" ")[0]) === 0 ? "" : type.manufacturer + " ") + type.family + (type.code ? " - " + type.code : "") + ". ", type.notes ? type.notes + ". " : "", h("a", { href: type.source, target: "_blank", rel: "noopener", text: "Source" })));
      if (type && type.weight_lb == null && !type.variants && type.base_lb == null) container.appendChild(h("div", { "class": "note fail", text: "The maker does not publish a weight for this block - enter your own below." }));
    }
    container.appendChild(h("div", { "class": "grid3" },
      field("Weight override (" + U.unit("w") + ")", numInput(typeof t.weightOverride === "number" ? t.weightOverride : "", function (v) { t.weightOverride = v > 0 ? v : undefined; S.commit(); }, { q: "w", title: "Leave 0 to use the published weight" })),
      field("Height (" + U.unit("len") + ")", numInput(t.z || 0, function (v) { t.z = v; S.commit(); }, { ft: true }))));
    if (res) {
      var conns = [];
      S.rig.trusses.forEach(function (o) { o.supports.forEach(function (s) { if (s.kind === "truss" && s.onTruss === t.id) conns.push(o.name); }); });
      container.appendChild(h("h4", { text: "Bolted here" }));
      container.appendChild(h("div", { "class": "sub", text: conns.length ? conns.join(", ") : "Nothing bolted to this block yet." }));
      if (res.injected.length) container.appendChild(h("div", { "class": "sub", text: "Carrying: " + res.injected.map(function (i) { return U.f("w", i.weight, 0) + " from " + i.note.replace("from ", ""); }).join("; ") }));
    }
    supportsTable(container, t, res, db);
    connectionControls(container, t);
  }

  var GKEY = "tla-groups", gstate = null;
  function groupState() {
    if (!gstate) { try { gstate = JSON.parse(localStorage.getItem(GKEY) || "{}") || {}; } catch (e) { gstate = {}; } }
    return gstate;
  }
  function saveGroups() { try { localStorage.setItem(GKEY, JSON.stringify(gstate)); } catch (e) { /* ignore */ } }
  /** A collapsible group in the side panel; returns the body to fill. Open/closed state is remembered per group. */
  function group(root, id, title, dflt, note) {
    var st = groupState(), open = id in st ? st[id] : dflt;
    var d = h("details", { "class": "grp", "data-grp": id });
    if (open) d.open = true;
    d.appendChild(h("summary", null, h("span", { "class": "grp-t", text: title }), note ? h("span", { "class": "grp-n", text: note }) : null));
    var body = h("div", { "class": "grp-body" });
    d.appendChild(body);
    d.addEventListener("toggle", function () { st[id] = d.open; saveGroups(); });
    root.appendChild(d);
    return body;
  }
  function setAllGroups(root, open) {
    var st = groupState();
    [].forEach.call(root.querySelectorAll("details.grp"), function (d) { d.open = open; st[d.getAttribute("data-grp")] = open; });
    saveGroups();
  }

  function inspector(container) {
    container.textContent = "";
    var root = container;
    var t = S.sel.truss && S.truss(S.sel.truss);
    if (!t) {
      container.appendChild(h("div", { "class": "empty" },
        h("h3", { text: "No truss selected" }),
        h("p", { text: "Click a truss in the plan, or add one. Drag trusses to move them; ends snap to other trusses. Drag a hoist along its truss to move it (1\" steps, 2 cm in metric)." }),
        h("button", { "class": "primary", text: "Add truss", onclick: function () { S.addTruss(); } })));
      return;
    }
    var res = S.results.trusses[t.id];
    var db = S.db();
    if (t.isBlock) { blockInspector(container, t, res); return; }
    var truss = db.trusses.filter(function (x) { return x.id === t.trussId; })[0] || (t.custom || null);
    var mfrs = [];
    db.trusses.forEach(function (x) { if (mfrs.indexOf(x.manufacturer) < 0) mfrs.push(x.manufacturer); });

    var head = h("div", { "class": "ins-head" },
      textInput(t.name, function (v) { t.name = v || t.name; S.commit(); }, "title-input"),
      h("div", { "class": "row-btns" },
        h("button", { text: "Duplicate", onclick: function () { S.duplicateTruss(t.id); } }),
        h("button", { "class": "danger", text: "Delete", onclick: function () { if (confirm("Delete " + t.name + "?")) S.removeTruss(t.id); } })));
    container.appendChild(head);
    container.appendChild(h("div", { "class": "quick" },
      h("button", { "class": "primary", text: "+ Hoist", title: "Add a hoist to this truss", onclick: function () { S.addHoist(t.id); } }),
      h("button", { text: "+ Load", title: "Add a load to this truss", onclick: function () { t.loads.push(S.applyMeasure({ id: S.newId("l"), distance: round(t.length / 2), weight: 0, note: "", mirror: false }, t)); S.commit(); } }),
      h("button", { "class": "danger", text: "Clear loads" + (t.loads.length ? " (" + t.loads.length + ")" : ""), disabled: !t.loads.length, title: "Remove every load from this truss (Undo brings them back)", onclick: function () { if (confirm("Remove all " + t.loads.length + " loads from " + t.name + "? (Undo brings them back.)")) S.clearLoads(t.id); } })));
    container.appendChild(h("div", { "class": "grp-tools" },
      h("button", { "class": "lnk", text: "Collapse all", onclick: function () { setAllGroups(root, false); } }),
      h("button", { "class": "lnk", text: "Expand all", onclick: function () { setAllGroups(root, true); } })));

    if (res && S.sel.support) {
      var a = TLA.grillage.attribution(S.rig, S.results, S.db(), t.id, S.sel.support);
      if (a) {
        var ss = t.supports.filter(function (x) { return x.id === S.sel.support; })[0];
        var at = h("table", { "class": "tbl" }, h("tbody", null,
          a.parts.filter(function (p) { return Math.abs(p.weight) >= 0.05; }).map(function (p) { return h("tr", null, h("td", { text: p.name + (p.truss === t.id ? " (self weight)" : "") }), h("td", { "class": "r", text: U.f("w", p.weight, 1) })); }),
          h("tr", null, h("td", { text: "Hoist + chain" }), h("td", { "class": "r", text: U.f("w", a.hoistChain, 1) })),
          h("tr", null, h("td", null, h("b", { text: "High hook load (static)" })), h("td", { "class": "r" }, h("b", { text: U.f("w", a.staticLoad, 1) })))));
        container.appendChild(h("div", { "class": "loadpath" }, h("h4", { text: "Selected hoist at " + U.f("len", ss ? ss.distance : 0, 2) + " on " + t.name + (a.model === "load-path" ? " (load-path method)" : " (stiffness solve, " + TLA.grillage.MODEL_LABEL[a.model] + ")") }),
          h("div", { "class": "row-btns" }, h("button", { "class": "danger", text: "Delete this hoist", onclick: function () { S.removeSupport(t.id, S.sel.support); } })), at));
      }
    }
    container = group(root, "result", "Diagram and checks", true, res ? (TLA.plan.trussStatus(res).bad ? "warnings" : "all pass") : "not solved");
    if (res) {
      container.appendChild(h("div", { "class": "elev-wrap" }, elevation(t, res)));
      var fd = forceDiagrams(res);
      if (fd) container.appendChild(h("div", { "class": "elev-wrap" }, fd));
      var chips = h("div", { "class": "chips" }, h("span", { "class": "chip", text: "Layer " + S.results.layers[t.id] }));
      var st = TLA.plan.trussStatus(res);
      chips.appendChild(h("span", { "class": "chip " + (st.bad ? "fail" : "ok"), text: st.bad ? "Check warnings" : "All checks pass" }));
      chips.appendChild(h("span", { "class": "chip", text: "Total " + U.f("w", res.beam.totalLoad, 0) }));
      chips.appendChild(h("span", { "class": "chip", text: "Derate " + res.limits.derate }));
      var mbr = res.limits.member;
      if (mbr) {
        chips.appendChild(h("span", { "class": "chip" + (mbr.momentOver ? " fail" : ""), title: "Largest bending moment / allowable estimated from the tables", text: "Moment " + fmt(mbr.momentUtil * 100, 0) + "%" }));
        chips.appendChild(h("span", { "class": "chip" + (mbr.shearOver ? " fail" : ""), title: "Largest shear / allowable estimated from the tables", text: "Shear " + fmt(mbr.shearUtil * 100, 0) + "%" }));
      }
      if (res.model) chips.appendChild(h("span", { "class": "chip", title: "The diagram, reactions and span checks shown are from the stiffness solve with " + TLA.grillage.MODEL_LABEL[res.model] + ", the joint model that loads this truss hardest", text: "Checked with " + TLA.grillage.MODEL_LABEL[res.model] }));
      else if (S.results.primary === "load-path") chips.appendChild(h("span", { "class": "chip", text: "Load-path method only" }));
      container.appendChild(chips);
    } else {
      container.appendChild(h("div", { "class": "note fail", text: "Not solved: it depends on a load-path loop or a missing truss/support. See warnings below." }));
    }

    // truss type
    var nBlk = t.layout && t.layout.order ? t.layout.order.length : 0;
    container = group(root, "truss", "Truss, length and corner blocks", true, U.f("len", t.length, 2) + (nBlk ? ", " + nBlk + " block" + (nBlk > 1 ? "s" : "") : ""));
    var cur = truss || {};
    var sameMfr = modelsOf(db.trusses, cur.manufacturer, t.trussId);
    var typeBox = h("div", { "class": "grid2" },
      field("Manufacturer", select(mfrs.map(function (m) { return { value: m, label: m }; }), cur.manufacturer, function (v) {
        var first = modelsOf(db.trusses, v)[0]; if (first) { t.trussId = first.id; S.commit(); }
      })),
      field("Model", select(sameMfr.map(function (x) { return { value: x.id, label: trussLabel(x) }; }), t.trussId, function (v) { t.trussId = parseInt(v, 10); S.commit(); })));
    container.appendChild(typeBox);
    if (truss) container.appendChild(h("div", { "class": "sub", text: U.f("wpl", truss.weight_per_ft_lb, 2) + ", max span " + U.f("len", truss.max_span_ft, 1) + ", max cantilever " + U.f("len", truss.max_span_ft / 4, 1) + ", " + (typeof truss.derate === "number" ? truss.derate + " derate applies (generic truss data)" : truss.repetitive_use ? "repetitive-use data (no 0.85 derate)" : "0.85 repetitive-use derate applies") }));
    if (truss && (truss.source || truss.note)) container.appendChild(h("div", { "class": "sub", text: trussSource(truss) }));

    container.appendChild(h("div", { "class": "grid3" },
      field("Truss pieces (" + U.unit("len") + ")", (t.layout && t.layout.manual) || Array.isArray(t.pieces) ? h("input", { type: "number", "class": "num", value: Math.round(U.v("len", t.pieceLength) * 10000) / 10000, disabled: true, title: "Set by the pieces / segments below" }) : numInput(t.pieceLength != null ? t.pieceLength : t.length, function (v) { t.pieceLength = Math.max(0.5, v); S.commit(); }, { ft: true, title: "Total length of the truss sections in this line, before corner blocks" })),
      field("UDL (" + U.unit("w") + ")", numInput(t.wallWeight, function (v) { t.wallWeight = v; S.commit(); }, { q: "w", title: "UDL (uniformly distributed load): total weight spread evenly over the full length, e.g. a drape or LED wall" })),
      field("Weightless", h("input", { type: "checkbox", checked: t.weightless, onchange: function (e) { t.weightless = e.target.checked; S.commit(); } }), "check")));
    container.appendChild(h("div", { "class": "linelen" },
      h("span", null, U.f("len", t.pieceLength != null ? t.pieceLength : t.length, 3) + " truss"),
      h("span", null, " + " + U.f("len", t.blocksAdded || 0, 3) + " corner blocks = "), h("b", { text: U.f("len", t.length, 3) + " whole line" }),
      t.layout && t.layout.manual ? null : h("label", { "class": "mini check", title: "Add the length of every corner block in this line to the truss pieces" }, h("input", { type: "checkbox", checked: t.addBlocks !== false, onchange: function (e) { t.addBlocks = e.target.checked; S.commit(); } }), "add block lengths")));
    if (!(t.layout && t.layout.manual)) {
      if (Array.isArray(t.pieces)) {
        container.appendChild(h("div", { "class": "layout" }, h("h4", { text: "Truss built from pieces" }),
          pieceBuilder(t, t.pieces, { add: function (len) { S.addLinePiece(t, len); }, remove: function (j) { S.removeLinePiece(t, j); }, insert: function (j) { var r = S.addBlockToLine(t.id, S.ui.blockTypeId || S.blockFor(t), { seg: 0, piece: j }); if (typeof r === "string") alert(U.text(r)); } }),
          h("div", { "class": "row-btns" }, h("button", { text: "Type a length instead", onclick: function () { S.typeLineLength(t); } }))));
      } else {
        container.appendChild(h("div", { "class": "row-btns" }, h("button", { text: "Build from pieces...", title: "Assemble this stick from the standard truss lengths (8', 6', 4'...)", onclick: function () { S.startLinePieces(t); } })));
      }
    }
    layoutEditor(container, t);
    container = group(root, "place", "Position and bolting", true, t.anchor ? "bolted" : "");
    container.appendChild(h("div", { "class": "grid3" },
      field("Measure loads / hoists from", select([{ value: "start", label: "start of line" }, { value: "center", label: "centerline" }, { value: "end", label: "end of line" }], t.measure || "start", function (v) { t.measure = v; S.commit(); })),
      field("Height (" + U.unit("len") + ")", numInput(t.z || 0, function (v) { t.z = v; S.commit(); }, { ft: true, title: "3D view only: raises this truss above the others" })),
      field("Width (" + U.unit("inch") + ")", numInput(t.widthIn || Math.round(TLA.rig.widthIn(t, (S.results.trusses[t.id] || {}).dbTruss) * 100) / 100, function (v) { t.widthIn = v > 0 ? v : undefined; S.commit(); }, { q: "inch", title: "Drawn width in the plan and 3D views. Taken from the truss type (12x12 = 12 in, 1.5 in schedule 40 pipe = 1.9 in OD); type here to override" })),
      field("Stiffness (x)", numInput(t.eiScale || 1, function (v) { t.eiScale = v > 0 ? v : 1; S.commit(); }, { title: "Bending, shear and torsion stiffness relative to this truss type's estimate; used only by the stiffness solve" }))));
    var sec = res && res.section;
    if (sec) container.appendChild(h("div", { "class": "sub", title: "Used by the stiffness solve. " + (sec.source === "tables" ? "Estimated from the manufacturer's tables: the largest table moment (" + U.f("mom", sec.tableMoment, 0) + ") carried by the chords at one effective stress, diagonals " + TLA.section.DIAG_RATIO + " x the chord area. Real chord and diagonal sizes in the truss data replace this." : "From the truss data's section sizes.") + (sec.notes.length ? " Note: " + U.text(sec.notes.join("; ")) + "." : "") },
      "Stiffness: EI " + (U.v("ei", sec.EI * 144)).toExponential(2) + " " + U.unit("ei") + ", GA " + U.v("w", sec.GA).toExponential(2) + " " + U.unit("w") + ", GJ " + (U.v("ei", sec.GJ * 144)).toExponential(2) + " " + U.unit("ei") + " (" + sec.shape + ", " + TLA.section.MAT[sec.material].label + ", " +
      (sec.source === "tables" ? "estimated from the tables, chords ≈ " + (U.metric() ? fmt(sec.chordArea * 645.16, 0) + " mm²" : fmt(sec.chordArea, 2) + " in²") + " each" : sec.source === "section" ? "from section data" : sec.source) + (sec.scale !== 1 ? ", x" + sec.scale : "") + ")"));
    container.appendChild(h("div", { "class": "grid3" },
      field("Plan X (" + U.unit("len") + ")", t.anchor ? lockedInput(t.x) : numInput(t.x, function (v) { t.x = v; S.commit(); }, { ft: true })),
      field("Plan Y (" + U.unit("len") + ")", t.anchor ? lockedInput(t.y) : numInput(t.y, function (v) { t.y = v; S.commit(); }, { ft: true })),
      field("Angle (deg)", t.anchor ? lockedInput(t.angle) : numInput(t.angle, function (v) { t.angle = v; S.commit(); }))));
    if (t.anchor && t.anchor.reverse) {
      var yr = S.truss(t.anchor.reverse.truss);
      container.appendChild(h("div", { "class": "sub" }, "Pulled onto " + (yr ? yr.name : "another truss") + " (bolted through its own corner block): this truss moves and turns to meet it, so its position and angle follow. ",
        h("button", { "class": "del", text: "Unbolt", title: "Release this truss and remove the bolt", onclick: function () { S.unbolt(t.id); } }),
        h("button", { "class": "del", text: "Flip side", title: "Swing this truss across to the other side of " + (yr ? yr.name : "the truss"), onclick: function () { S.flipBolt(t.id); } })));
    } else if (t.anchor) {
      var ab = S.truss(t.anchor.block);
      container.appendChild(h("div", { "class": "sub" }, "Bolted to " + (ab ? ab.name : "a corner block") + " - position and angle follow the block. ",
        h("button", { "class": "del", text: "Unbolt", title: "Release this truss from the block", onclick: function () { S.unbolt(t.id); } })));
      if (t.anchor.mode !== "through") {
        container.appendChild(h("div", { "class": "row-btns" },
          h("span", { "class": "mini", text: "Extends " + (S.boltDirection(t.id) ? S.boltDirection(t.id).toUpperCase() : "to the " + S.boltSide(t.id) + " of " + (((S.truss(ab && (ab.host || (ab.attach && ab.attach.b))) || {}).name) || "its carrier")) + " from the block, with its " + (t.anchor.mode === "start" ? "start" : "end") + " at the block" }),
          h("button", { text: "Flip to the other side", title: "Swing this truss across to the other side of the truss that carries the block", onclick: function () { S.flipBolt(t.id); } }),
          h("button", { text: "Bolt the other end", title: "Swap which end of this truss meets the block (stays on the same side)", onclick: function () { S.swapBoltEnd(t.id); } })));
      }
    }
    var nH = t.supports.filter(function (x) { return x.kind === "hoist"; }).length, nB = t.supports.length - nH;
    container = group(root, "supports", "Hoists and bolted connections", true, nH + " hoist" + (nH === 1 ? "" : "s") + (nB ? ", " + nB + " bolted" : ""));
    supportsTable(container, t, res, db);
    connectionControls(container, t);

    // loads
    container = group(root, "loads", "Loads", true, t.loads.length ? t.loads.length + " load" + (t.loads.length === 1 ? "" : "s") : "none");
    var loadSel = S.ui.loadSel || (S.ui.loadSel = {});
    var ltbl = h("table", { "class": "tbl loads" });
    ltbl.appendChild(h("thead", null, h("tr", null, h("th"), h("th", { "class": "sortable", text: "At (" + U.unit("len") + ") from ↕", title: "Click to sort the rows by distance along the truss", onclick: function () { S.sortLoads(t.id); } }), h("th", { text: "Weight (" + U.unit("w") + ")" }), h("th", { text: "Note" }), h("th", { text: "Mirror", title: "Also place the same load mirrored about the truss centerline" }), h("th", { text: "Copy" }), h("th", { text: "Order" }), h("th"))));
    var lb = h("tbody");
    t.loads.forEach(function (l, i) {
      var handle = h("span", { "class": "drag", title: "Drag to reorder", text: "≡" });
      var row = h("tr", { "data-load": l.id },
        h("td", { "class": "center" }, handle),
        h("td", null, posCell(l, t.length)),
        h("td", null, numInput(l.weight, function (v) { l.weight = v; S.commit(); }, { cls: "w60", q: "w" })),
        h("td", null, textInput(l.note, function (v) { l.note = v; S.commit(); }, "note")),
        h("td", { "class": "center" }, h("input", { type: "checkbox", checked: !!l.mirror, title: "Mirror about centerline (" + U.f("len", t.length - l.distance, 2) + ")", onchange: function (e) { l.mirror = e.target.checked; S.commit(); } })),
        h("td", { "class": "center" }, h("input", { type: "checkbox", title: "Tick loads to copy to another truss (none ticked = all)", checked: !!loadSel[l.id], onchange: function (e) { loadSel[l.id] = e.target.checked; } })),
        h("td", { "class": "center nowrap" }, h("button", { "class": "x", title: "Move up", text: "↑", disabled: i === 0, onclick: function () { S.moveLoad(t.id, l.id, -1); } }), h("button", { "class": "x", title: "Move down", text: "↓", disabled: i === t.loads.length - 1, onclick: function () { S.moveLoad(t.id, l.id, 1); } })),
        h("td", null, h("button", { "class": "x", title: "Duplicate this load", text: "dup", onclick: function () { S.duplicateLoad(t.id, l.id); } }), h("button", { "class": "x", title: "Delete this load", text: "x", onclick: function () { t.loads.splice(i, 1); S.commit(); } })));
      handle.addEventListener("mousedown", function () { row.draggable = true; });
      row.addEventListener("dragstart", function (e) { S.ui.dragLoad = l.id; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", l.id); } catch (er) { /* ignore */ } row.classList.add("dragging"); });
      row.addEventListener("dragend", function () { row.draggable = false; row.classList.remove("dragging"); [].forEach.call(lb.querySelectorAll(".dropat"), function (r) { r.classList.remove("dropat"); }); });
      row.addEventListener("dragover", function (e) { if (S.ui.dragLoad) { e.preventDefault(); row.classList.add("dropat"); } });
      row.addEventListener("dragleave", function () { row.classList.remove("dropat"); });
      row.addEventListener("drop", function (e) { e.preventDefault(); var from = S.ui.dragLoad; S.ui.dragLoad = null; if (from) S.reorderLoad(t.id, from, l.id); });
      lb.appendChild(row);
    });
    ltbl.appendChild(lb); container.appendChild(ltbl);
    container.appendChild(h("div", { "class": "row-btns" },
      t.loads.length ? h("button", { "class": "danger", text: "Clear all loads", title: "Remove every load from this truss (Undo brings them back)", onclick: function () { if (confirm("Remove all " + t.loads.length + " loads from " + t.name + "? (Undo brings them back.)")) S.clearLoads(t.id); } }) : null,
      t.loads.length > 1 ? h("button", { text: "Sort by position", title: "Order the rows by distance along the truss", onclick: function () { S.sortLoads(t.id); } }) : null,
      h("button", { text: "+ Load", onclick: function () { t.loads.push(S.applyMeasure({ id: S.newId("l"), distance: round(t.length / 2), weight: 0, note: "", mirror: false }, t)); S.commit(); } }),
      fixturePicker(function (f, clamp) { t.loads.push(S.applyMeasure({ id: S.newId("l"), distance: round(t.length / 2), weight: Math.round((f.weight_lb + (clamp || 0)) * 100) / 100, note: f.manufacturer + " " + f.fixture + (clamp ? " + clamp " + U.f("w", clamp, 1) : ""), fixtureLb: f.weight_lb, clampLb: clamp || 0, mirror: false }, t)); S.commit(); })));
    var others = S.rig.trusses.filter(function (o) { return o.id !== t.id && !o.isBlock; });
    if (t.loads.length && others.length) {
      var dst = select([{ value: "", label: "Copy loads to..." }].concat(others.map(function (o) { return { value: o.id, label: o.name }; })), "", function () {});
      container.appendChild(h("div", { "class": "row-btns" }, dst,
        h("button", { text: "Copy ticked (or all)", title: "Copies keep each load's distance from the CENTRE of the truss (loads past the other truss's ends are held at its end)", onclick: function () {
          if (!dst.value) { alert("Pick the truss to copy to."); return; }
          var ids = t.loads.filter(function (l) { return loadSel[l.id]; }).map(function (l) { return l.id; }), r = S.copyLoads(t.id, ids, dst.value);
          t.loads.forEach(function (l) { delete loadSel[l.id]; });
          if (r && r.clamped) alert(r.clamped + " load(s) were past the end of " + S.truss(dst.value).name + " and were placed at its end.");
        } })));
    }
    if (res && res.injected.length) {
      container.appendChild(h("div", { "class": "sub", text: "Also carrying: " + res.injected.map(function (i) { return U.f("w", i.weight, 0) + " from " + i.note.replace("from ", "") + " at " + U.mark(i.distance, 2); }).join("; ") }));
    }
  }
  function round(v) { return Math.round(v * 100) / 100; }
  /** One joint model's static load in the hoist table; bold when it is the one that governs. */
  function modelCell(x, m) {
    var c = x.byModel && x.byModel[m];
    if (!c) return h("td", { "class": "r mut", text: "-" });
    var txt = U.n("w", c.staticLoad, 1) + (c.slack ? " slack" : "");
    return h("td", { "class": "r", title: "Stiffness solve, " + TLA.grillage.MODEL_LABEL[m] + (x.model === m ? " (governs)" : "") }, x.model === m ? h("b", { text: txt }) : txt);
  }
  /** The semi-rigid sweep's range in the hoist table; bold when one of its points governs. */
  function semiCell(x) {
    var c = x.compat;
    if (!c || c.semiMin === null || c.semiMin === undefined) return h("td", { "class": "r mut", text: "-" });
    var txt = Math.abs(c.semiMax - c.semiMin) < 0.05 ? U.n("w", c.semiMax, 1) : U.n("w", c.semiMin, 1) + " - " + U.n("w", c.semiMax, 1), gov = /^semi/.test(x.model);
    return h("td", { "class": "r nowrap", title: "Corner blocks as rotational springs of 1, 4 and 16 x EI/L (between hinged and rigid)" + (gov ? " - " + TLA.grillage.MODEL_LABEL[x.model] + " governs" : "") }, gov ? h("b", { text: txt }) : txt);
  }
  /** Load change on this hoist when it runs a quarter inch high. */
  function trimCell(x) {
    var t = x.trim;
    if (!t) return h("td", { "class": "r mut", text: "-" });
    var hot = x.hoist.capacity > 0 && x.hoist.capacity < 999999 && Math.abs(t.self) > 0.1 * x.hoist.capacity;
    return h("td", { "class": "r" + (hot ? " hi" : ""), title: "Run this hoist 1/4\" (6 mm) high and it picks up this much (1/4\" low: the same, off)" + (t.other ? "; the hoist it affects most, " + t.other.name + ", changes by " + U.f("w", t.other.lb, 0) : "") + " (" + TLA.grillage.MODEL_LABEL[t.model] + ")", text: "±" + U.n("w", Math.abs(t.self), 0) });
  }

  /* ---------- chain lengths (1.13.0) ---------- */
  var pendingChain = null;   // row whose chain box takes the focus after the table is redrawn (Tab / Enter moves on)
  /** Chain length typed straight into the hoist table; Tab / Enter goes on to the next hoist. */
  function chainInput(s, idx) {
    var dir = 0;
    var inp = numInput(s.chainLength || 0, function (v) {
      pendingChain = dir ? idx + dir : null;
      v = Math.max(0, v);
      if (Math.abs((s.chainLength || 0) - v) < 1e-9) { if (pendingChain != null) S.emit(); return; }
      s.chainLength = v; S.commit();
    }, { cls: "w60", ft: true, title: "Chain length of this hoist (Tab or Enter goes to the next one)" });
    inp.setAttribute("data-chain", idx);
    inp.addEventListener("keydown", function (e) { dir = e.key === "Tab" ? (e.shiftKey ? -1 : 1) : e.key === "Enter" ? 1 : 0; });
    inp.addEventListener("click", function (e) { e.stopPropagation(); });
    return inp;
  }
  /** One chain length for every hoist, or for the selected truss's hoists. */
  function chainBar() {
    var t = S.sel.truss && S.truss(S.sel.truss);
    var inp = h("input", { type: "text", "class": "num w60", placeholder: U.metric() ? "6" : "20", autocomplete: "off", title: U.metric() ? "Chain length: metres, or cm / mm" : "Chain length: decimal feet or feet-inches (20-6)" });
    function go(tid) {
      var v = parseShownLen(inp.value);
      if (!(v >= 0)) { alert(U.metric() ? "Type a chain length first (for example 6)." : "Type a chain length first (for example 20 or 20-6)."); inp.focus(); return; }
      S.setChains(v, tid);
    }
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(null); });
    var nOn = t ? t.supports.filter(function (s) { return s.kind === "hoist"; }).length : 0;
    return h("div", { "class": "row-btns chainbar" }, h("span", { "class": "mini", text: "Chain length (" + U.unit("len") + ")" }), inp,
      h("button", { text: "Set all hoists", title: "Give every hoist in the rig this chain length (one Undo step)", onclick: function () { go(null); } }),
      nOn ? h("button", { text: "Set on " + t.name + " (" + nOn + ")", title: "Give only the hoists on the selected truss this chain length", onclick: function () { go(t.id); } }) : null);
  }

  /* ---------- per-truss checks (1.13.0) ---------- */
  function pctCell(u, title) {
    if (u == null) return h("td", { "class": "r mut", text: "-" });
    var cls = !isFinite(u) || u > 1 + 1e-9 ? " over" : u >= 0.8 ? " near" : "";
    return h("td", { "class": "r" + cls, title: title, text: isFinite(u) ? fmt(u * 100, 0) + "%" : "no table" });
  }
  /** One row per truss: the table checks and the moment / shear check from the solve that loads it hardest. */
  function trussTable(container) {
    var r = S.results, rows = S.rig.trusses.filter(function (t) { return !t.isBlock; });
    if (!rows.length) return;
    var L = U.unit("len");
    container.appendChild(h("h4", { "class": "sum-h", text: "Trusses" }));
    var tbl = h("table", { "class": "tbl hoists trusses" });
    tbl.appendChild(h("thead", null, h("tr", null, [["Truss"], ["Type"], ["Layer", "r"], ["Length (" + L + ")", "r"], ["Longest span / max (" + L + ")", "r"], ["Span load", "r"], ["Cantilever", "r"], ["Moment", "r"], ["Shear", "r"], ["Max moment (" + U.unit("mom") + ")", "r"], ["Checked with"], ["Status"]].map(function (x) { return h("th", { "class": x[1] || "", text: x[0] }); }))));
    var tb = h("tbody");
    rows.forEach(function (t) {
      var res = r.trusses[t.id], db = res && res.dbTruss;
      var tr = h("tr", { "class": S.sel.truss === t.id && !S.sel.support ? "sel" : "", onclick: function () { S.sel = { truss: t.id, support: null }; S.emit(); } },
        h("td", { text: t.name }), h("td", { text: db ? db.manufacturer + " " + String(db.description).trim() : "-" }));
      if (!res) {
        tr.appendChild(h("td", { "class": "r mut", text: "-" }));
        tr.appendChild(h("td", { "class": "r", text: U.n("len", t.length, 2) }));
        tr.appendChild(h("td", { colspan: 7, "class": "mut", text: "not solved - see the warnings" }));
        tr.appendChild(h("td", null, badge("Not solved")));
        tb.appendChild(tr); return;
      }
      var segs = res.limits.segments.filter(function (s) { return !s.skipped; });
      var spans = segs.filter(function (s) { return s.type === "span"; }), cants = segs.filter(function (s) { return s.type !== "span"; });
      function worst(list, f) { return list.length ? list.reduce(function (m, s) { return Math.max(m, f(s)); }, 0) : null; }
      var longest = spans.reduce(function (m, s) { return !m || s.length > m.length ? s : m; }, null);
      var mb = res.limits.member, code = res.limits.worstCode || 0;
      tr.appendChild(h("td", { "class": "r", text: String(r.layers[t.id] || "-") }));
      tr.appendChild(h("td", { "class": "r", text: U.n("len", t.length, 2) }));
      tr.appendChild(h("td", { "class": "r" + (longest && longest.lengthFail ? " over" : ""), title: "Longest span between supports, and the longest span the table allows", text: longest ? U.n("len", longest.length, 2) + " / " + U.n("len", longest.maxLength, 1) : "-" }));
      tr.appendChild(pctCell(worst(spans, function (s) { return s.utilization; }), "Worst span: its point loads as a share of the table capacity for that span (less any UDL)"));
      tr.appendChild(pctCell(worst(cants, function (s) { return Math.max(s.utilization, s.maxLength ? s.length / s.maxLength : 0); }), "Worst cantilever: its load against the table, or its length against a quarter of the maximum span, whichever is higher"));
      tr.appendChild(pctCell(mb ? mb.momentUtil : null, "Largest bending moment against the allowable estimated from the tables"));
      tr.appendChild(pctCell(mb ? mb.shearUtil : null, "Largest shear against the allowable estimated from the tables"));
      tr.appendChild(h("td", { "class": "r", text: mb ? U.n("mom", mb.moment, 0) : "-" }));
      tr.appendChild(h("td", { text: res.model ? TLA.grillage.MODEL_LABEL[res.model] : "load path" }));
      var segCode = segs.reduce(function (m, s) { return Math.max(m, s.code || 0); }, 0);
      tr.appendChild(h("td", null, badge(segCode ? ["Good", "TOO LONG!", "OVERLOADED", "FAILURE"][segCode] : mb && mb.code ? mb.status : code ? "FAILURE" : "Good")));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); container.appendChild(tbl);
  }

  /* ---------- summary ---------- */
  function summary(container) {
    container.textContent = "";
    var r = S.results;
    var t = r.totals;
    var warns = r.warnings.filter(function (w) { return w.level !== "note"; }), notes = r.warnings.filter(function (w) { return w.level === "note"; });
    container.appendChild(h("div", { "class": "sum-head" },
      h("div", { "class": "kpi" }, h("b", { text: U.n("w", t.staticLoad, 0) }), h("span", { text: U.unit("w") + " total static on hoists" })),
      h("div", { "class": "kpi" }, h("b", { text: U.n("w", t.dynamicLoad, 0) }), h("span", { text: U.unit("w") + " total dynamic" })),
      h("div", { "class": "kpi" }, h("b", { text: String(t.count) }), h("span", { text: "hoists" })),
      h("div", { "class": "kpi" }, h("b", { text: String(S.rig.trusses.length) }), h("span", { text: "trusses" })),
      h("div", { "class": "kpi " + (warns.length ? "fail" : "ok") }, h("b", { text: String(warns.length) }), h("span", { text: "warnings" }))));

    var st = S.rig.settings || (S.rig.settings = {});
    container.appendChild(h("div", { "class": "rules" },
      h("label", { "class": "mini check", title: "Per Rigging Math Made Simple, manufacturers' tables already subtract the truss weight. Tick this to also count it against the cantilever limits (as the original Excel did) and in the moment/shear check (stricter)." },
        h("input", { type: "checkbox", checked: st.cantileverSelfWeight === true, onchange: function (e) { st.cantileverSelfWeight = e.target.checked; S.commit(); } }), "Count truss weight against cantilever and moment/shear limits (stricter than the textbook)"),
      h("label", { "class": "mini", title: "Show and type everything in feet and pounds, or metres and kilograms. Only the display changes: the rig, its trusses and hoists, and every result stay exactly the same." }, "Units ",
        select([{ value: "imperial", label: "imperial (ft, lb)" }, { value: "metric", label: "metric (m, kg)" }], U.metric() ? "metric" : "imperial", function (v) { st.units = v === "metric" ? "metric" : undefined; S.commit(); })),
      U.metric() ? null : h("label", { "class": "mini", title: "How length boxes are shown. You can type either way in any length box." }, "Show lengths as ",
        select([{ value: "decimal", label: "decimal feet (4.1667)" }, { value: "ftin", label: "feet-inches (4'-2\")" }], st.lengthFormat === "ftin" ? "ftin" : "decimal", function (v) { st.lengthFormat = v; S.commit(); })),
      h("label", { "class": "mini", title: "Used when a hoist has no speed listed (a custom hoist). Hoists with a speed use speed in fpm / 60 + 1 (16 fpm = 4.9 m/min = 1.267). You can also type a factor on any hoist." }, "Default dynamic factor ",
        numInput(typeof st.defaultDlf === "number" ? st.defaultDlf : 1.25, function (v) { st.defaultDlf = v > 0 ? v : 1.25; S.commit(); }, { cls: "w50" })),
      h("label", { "class": "mini" }, "Repetitive-use factor ",
        select([{ value: "auto", label: "per truss data (0.85 unless the table includes it; Universal 0.75)" }, { value: "0.85", label: "always 0.85" }, { value: "1", label: "none (1.0)" }], typeof st.derate === "number" ? String(st.derate) : "auto", function (v) { st.derate = v === "auto" ? null : parseFloat(v); S.commit(); })),
      h("label", { "class": "mini", title: "An extra percentage on the load and truss weight at every hoist (unknown cable weight, a safety margin), as in the original's 'Add Percentage'. It is added before the hoist, chain and hardware weight and shows in the high hook static and dynamic loads; the truss checks are not changed." }, "Add % to hoist loads ",
        numInput(Number(st.addPercent) > 0 ? st.addPercent : "", function (v) { st.addPercent = v > 0 ? v : undefined; S.commit(); }, { cls: "w50", placeholder: "0" })),
      h("label", { "class": "mini", title: "How much a hoist and its chain stretch under load, in " + (U.metric() ? "kg per mm (for example 27 for a 1-ton chain hoist on a long drop" : "lb per inch (for example 1500 for a 1-ton chain hoist on a long drop") + " - measure or ask the maker). Blank = rigid hoists, the usual assumption. Springy hoists share load more evenly and are much less level-sensitive." }, "Hoist stiffness (" + U.unit("stiff") + ") ",
        numInput(Number(st.hoistStiffness) > 0 ? st.hoistStiffness : "", function (v) { st.hoistStiffness = v > 0 ? v : undefined; S.commit(); }, { cls: "w60", q: "stiff", placeholder: "rigid" }))));

    [[warns, "warnings"], [notes, "warnings notes"]].forEach(function (g) {
      if (!g[0].length) return;
      var ul = h("ul", { "class": g[1] });
      g[0].forEach(function (w) {
        ul.appendChild(h("li", { onclick: function () { if (w.truss) { S.sel = { truss: w.truss, support: null }; S.emit(); } } }, U.text(w.message)));
      });
      container.appendChild(ul);
    });

    var tbl = h("table", { "class": "tbl hoists" });
    tbl.appendChild(h("thead", null, h("tr", null, (function (L, W) { return [["Truss"], ["Layer", "r"], ["At (" + L + ")", "r"], ["Hoist"], ["Chain (" + L + ")", "r"], ["Hoist & Chain (" + W + ")", "r"], ["Load path* (" + W + ")", "r"], ["Hinged joints* (" + W + ")", "r"], ["Semi-rigid* (" + W + ")", "r"], ["Rigid joints* (" + W + ")", "r"], ["High hook static (" + W + ")", "r"], ["Level sens. 1/4\" (" + W + ")", "r"], ["Dyn. factor", "r"], ["High hook dynamic (" + W + ")", "r"], ["Capacity (" + W + ")", "r"], ["% cap", "r"], ["Status"], [""]]; })(U.unit("len"), U.unit("w")).map(function (x) { return h("th", { "class": x[1] || "", text: x[0] }); }))));
    var tb = h("tbody");
    r.hoists.forEach(function (x, hi) {
      var hs = S.truss(x.truss).supports.filter(function (s) { return s.id === x.support; })[0];
      var hd = S.db().hoists.filter(function (q) { return q.id === (hs && hs.hoistId); })[0];
      tb.appendChild(h("tr", { "class": S.sel.support === x.support ? "sel" : "", onclick: function () { S.sel = { truss: x.truss, support: x.support }; S.emit(); } },
        h("td", { text: x.trussName }), h("td", { "class": "r", text: String(x.layer) }), h("td", { "class": "r", text: U.n("len", x.distance, 2) }),
        h("td", { text: hd ? hd.description.trim() + " " + hd.capacity_label + (U.metric() && hd.capacity_lb < 999999 ? " (" + U.f("w", hd.capacity_lb, 0) + ")" : "") : "-" }),
        h("td", { "class": "r" }, hs ? chainInput(hs, hi) : "-"),
        h("td", { "class": "r", title: "Hoist body + chain (chain length x weight per foot)" + (hs && hs.hardwareWeight ? " + hardware" : ""), text: U.n("w", x.hoist.staticLoad - x.hoist.reaction - (x.hoist.added || 0), 1) }),
        h("td", { "class": "r mut", title: "Load-path method (each carrying truss treated as unyielding) - for reference", text: U.n("w", (x.loadPath || x).hoist.staticLoad, 1) + ((x.loadPath || x).slack ? " slack" : "") }),
        modelCell(x, "hinged"), semiCell(x), modelCell(x, "rigid"),
        h("td", { "class": "r" + (x.compat && x.compat.higher ? " hi" : ""), title: (x.model ? "Largest of the joint models (" + TLA.grillage.MODEL_LABEL[x.model] + ")" + (x.compat.higher ? " - well above the load-path method" : "") : "Load-path method (stiffness solve not available)") + (x.hoist.added ? "; includes " + U.f("w", x.hoist.added, 1) + " added (" + S.rig.settings.addPercent + "%)" : "") }, h("b", { text: U.n("w", x.hoist.staticLoad, 1) })),
        trimCell(x),
        h("td", { "class": "r", text: fmt(x.hoist.dynamicFactor, 3) }),
        h("td", { "class": "r", text: U.n("w", x.hoist.dynamicLoad, 1) }),
        h("td", { "class": "r", text: x.hoist.capacity >= 999999 ? "none" : U.n("w", x.hoist.capacity, 0) }),
        h("td", { "class": "r", text: x.hoist.capacity >= 999999 ? "-" : fmt(x.hoist.staticLoad / x.hoist.capacity * 100, 0) + "%" }),
        h("td", null, badge(x.hoist.status)),
        h("td", null, h("button", { "class": "x", title: "Delete this hoist", text: "x", onclick: function (e) { e.stopPropagation(); S.removeSupport(x.truss, x.support); } }))));
    });
    tbl.appendChild(tb);
    if (r.hoists.length) container.appendChild(chainBar());
    container.appendChild(tbl);
    if (pendingChain != null) {
      var nextIn = container.querySelector('input[data-chain="' + pendingChain + '"]');
      pendingChain = null;
      if (nextIn) { nextIn.focus(); nextIn.select(); }
    }
    if (!r.hoists.length) container.appendChild(h("p", { "class": "sub", text: "No hoists yet - add a hoist support to a truss." }));
    if (r.primary === "grillage") container.appendChild(h("div", { "class": "row-btns" }, h("button", { "class": "lnk", text: "Export stiffness model", title: "Save this rig's stiffness model (JSON) to cross-check it in PyNite, the engine behind CalcForge 3D: python tools/pynite_check.py <file>", onclick: function () {
      var ex = TLA.grillage.exportModel(S.rig, S.results, S.db()); if (!ex) { alert("The stiffness model can't be exported for this rig."); return; }
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(ex, null, 1)], { type: "application/json" }));
      a.download = (S.rig.name || "rig").replace(/[^\w\- ]+/g, "") + ".grillage.json"; a.click();
    } })));
    trussTable(container);
    container.appendChild(h("p", { "class": "sub" }, r.primary === "grillage"
      ? "* Hoist loads come from a stiffness (grillage) solve of the whole rig, which lets the trusses bend, shear and twist and share load, with the corner blocks modelled as hinged (vertical force only), semi-rigid (rotational springs of 1, 4 and 16 x EI/L) and rigid (bending and torsion pass through). High hook static and dynamic, % and status use the largest. Low hook = what the truss hangs on the hoist's hook; high hook = low hook + Add % + hoist, chain and hardware weight (what the structure above carries). Each truss's bending, shear and torsion stiffness is estimated from its manufacturer's tables unless the truss data gives real chord and diagonal sizes (scale it with Stiffness x). Hoists are rigid unless a hoist stiffness is set. Level sensitivity: the change in a hoist's load if it runs 1/4\" (6 mm) high or low - large on short, stiff spans. The load-path column is the per-truss method of the original workbook, for reference only."
      : "* Stiffness solve not available" + (r.compat && r.compat.note ? " (" + U.text(r.compat.note) + ")" : "") + ": loads are from the load-path method alone, which treats every carrying truss as unyielding and can under-estimate hoists in a grid."));
  }

  TLA.panels = {
    mount: function (store) { S = store; },
    elevation: elevation, forceDiagrams: forceDiagrams,
    parseLen: parseLen, fmtFtIn: fmtFtIn, trussLabel: trussLabel, modelsOf: modelsOf, trussSource: trussSource, h: h, select: select, numInput: numInput, textInput: textInput, field: field, fmt: fmt, badge: badge,
    inspector: inspector, summary: summary, hoistsCsv: function () {
      var L = U.unit("len"), W = U.unit("w");
      var rows = [["Truss", "Layer", "At " + L, "Low hook " + W, "Hoist & Chain " + W, "Added % " + W, "Load path high hook " + W + " (ref.)", "Hinged joints high hook " + W, "Semi-rigid min high hook " + W, "Semi-rigid max high hook " + W, "Rigid joints high hook " + W, "High hook static " + W, "Governing", "Level sensitivity per 1/4 in " + W, "Dynamic factor", "High hook dynamic " + W, "Capacity " + W, "Status"]];
      function r1(v) { return Math.round(U.v("w", v) * 10) / 10; }
      S.results.hoists.forEach(function (x) {
        var c = x.compat || {}, semi = c.semiMin !== null && c.semiMin !== undefined;
        rows.push([x.trussName, x.layer, Math.round(U.v("len", x.distance) * 1000) / 1000, r1(x.hoist.reaction), r1(x.hoist.staticLoad - x.hoist.reaction - (x.hoist.added || 0)), r1(x.hoist.added || 0), r1((x.loadPath || x).hoist.staticLoad),
          x.byModel ? r1(x.byModel.hinged.staticLoad) : "", semi ? r1(c.semiMin) : "", semi ? r1(c.semiMax) : "", x.byModel ? r1(x.byModel.rigid.staticLoad) : "", r1(x.hoist.staticLoad), x.model ? TLA.grillage.MODEL_LABEL[x.model] : "load path",
          x.trim ? r1(Math.abs(x.trim.self)) : "", Math.round(x.hoist.dynamicFactor * 1000) / 1000, r1(x.hoist.dynamicLoad), x.hoist.capacity >= 999999 ? "none" : r1(x.hoist.capacity), x.hoist.status]);
      });
      return rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
