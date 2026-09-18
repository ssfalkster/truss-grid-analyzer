/* Inspector (selected truss), elevation diagram, and rig summary. Plain DOM. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var S = null;
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
    if (S.rig && S.rig.settings && S.rig.settings.lengthFormat === "ftin") return fmtFtIn(Number(v));
    return String(Math.round(Number(v) * 10000) / 10000);
  }
  function numInput(value, onchange, opts) {
    opts = opts || {};
    if (opts.ft) {
      var ti = h("input", { type: "text", inputmode: "text", value: lenText(value), "class": "num " + (opts.cls || ""), title: (opts.title ? opts.title + ". " : "") + "Type decimal feet (4.1667) or feet-inches (4-2, 4'2\", 4' 2 1/2\")", placeholder: opts.placeholder, autocomplete: "off" });
      ti.addEventListener("change", function () {
        var v = parseLen(ti.value);
        if (!isFinite(v)) { ti.value = lenText(value); ti.classList.add("bad"); setTimeout(function () { ti.classList.remove("bad"); }, 800); return; }
        onchange(v);
      });
      return ti;
    }
    var i = h("input", { type: "number", step: opts.step || "any", value: value, "class": "num " + (opts.cls || ""), min: opts.min, title: opts.title, placeholder: opts.placeholder });
    i.addEventListener("change", function () {
      var v = parseFloat(i.value);
      onchange(isFinite(v) ? v : 0);
    });
    return i;
  }
  function textInput(value, onchange, cls, placeholder) {
    var i = h("input", { type: "text", value: value || "", "class": cls || "", placeholder: placeholder });
    i.addEventListener("change", function () { onchange(i.value); });
    return i;
  }
  function select(options, value, onchange) {
    var s = h("select");
    options.forEach(function (o) { var op = h("option", { value: o.value, text: o.label }); if (String(o.value) === String(value)) op.selected = true; s.appendChild(op); });
    s.addEventListener("change", function () { onchange(s.value); });
    return s;
  }
  function field(label, control, cls) { return h("label", { "class": "field " + (cls || "") }, h("span", { text: label }), control); }
  function badge(status) {
    var cls = status === "Good" ? "ok" : status === "No Load" || status === "Check" ? "warn" : "fail";
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
      var lab = fmt(b - a, 2) + "'" + (sg.code ? " " + sg.status : "");
      add("text", { x: X((a + b) / 2), y: yb - 12, "text-anchor": "middle", "class": "et" + (sg.code ? " fail" : "") }, lab);
    });
    // loads
    res.beam.loads.forEach(function (l) {
      var x = X(l.distance);
      add("path", { d: "M" + x + " " + (yb - 6) + " l -3.5 -8 l 7 0 z", "class": "el" + (l.injected ? " inj" : l.mirrored ? " ghost" : "") });
      if (Math.abs(l.weight) > 0.5) add("text", { x: x, y: yb - 32 - ((idx++) % 2) * 0, "text-anchor": "middle", "class": "et small rot", transform: "rotate(-60 " + x + " " + (yb - 18) + ")" }, fmt(l.weight, 0));
    });
    // supports + reactions
    res.supports.forEach(function (sr, i) {
      var x = X(sr.support.distance);
      var isH = sr.support.kind === "hoist";
      add("path", { d: "M" + x + " " + (yb + 6) + " l -7 12 l 14 0 z", "class": "es " + (isH ? "hoist" : "bear") });
      add("text", { x: x, y: yb + 34, "text-anchor": "middle", "class": "et strong" + (sr.reaction < 0 ? " fail" : "") }, fmt(sr.reaction, 0));
      add("text", { x: x, y: yb + 46, "text-anchor": "middle", "class": "et small" }, (isH ? "hoist" : "bolted to " + ((S.truss(sr.support.onTruss) || {}).name || "?")));
      add("text", { x: x, y: yb + 58, "text-anchor": "middle", "class": "et small" }, fmt(sr.support.distance, 2) + "'");
    });
    return svg;
  }

  /* ---------- inspector ---------- */
  /** Search-as-you-type fixture picker with an optional clamp. onPick(fixture, clampLb) adds the load. */
  function fixturePicker(onPick) {
    var fixtures = S.db().fixtures;
    var listId = "fxlist" + Math.floor(Math.random() * 1e9);
    var dl = h("datalist", { id: listId });
    fixtures.forEach(function (f) { dl.appendChild(h("option", { value: f.manufacturer + " " + f.fixture, label: f.weight_lb + " lb" + (f.clamp_lb ? " + " + f.clamp_lb + " clamp" : "") })); });
    var input = h("input", { type: "text", "class": "fxsearch", list: listId, placeholder: "Add fixture: type to search (e.g. mac one)", autocomplete: "off" });
    var withClamp = h("input", { type: "checkbox", checked: S.ui.fxClamp !== false });
    var clampLb = h("input", { type: "number", "class": "num w50", step: "any", min: 0, title: "Clamp weight (lb). Filled in from the fixture when it has one; type your own for others.", placeholder: "lb" });
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
      if (f && f.clamp_lb) clampLb.value = f.clamp_lb;
    }
    function commit() {
      var f = find(input.value);
      if (!f) return false;
      S.ui.fxClamp = withClamp.checked;
      var c = withClamp.checked ? (parseFloat(clampLb.value) || (f.clamp_lb || 0)) : 0;
      if (f.clamp_lb && withClamp.checked && !(parseFloat(clampLb.value) > 0)) c = f.clamp_lb;
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
    container.appendChild(h("div", { "class": "row-btns" }, h("button", { "class": "primary", text: "+ Add hoist", title: "Add a motor in the middle of this truss, then set its position", onclick: function () { S.addHoist(t.id); } })));
    var stbl = h("table", { "class": "tbl sup" });
    stbl.appendChild(h("thead", null, h("tr", null, h("th", { text: "At (ft) from" }), h("th", { text: "Type" }), h("th", { text: "Detail" }), h("th", { text: "Load" }), h("th"))));
    var tb = h("tbody");
    t.supports.forEach(function (s, i) {
      var sr = res && res.supports[i];
      var detail = h("div", { "class": "detail" });
      if (s.kind === "hoist") {
        detail.appendChild(select(db.hoists.map(function (x) { return { value: x.id, label: x.brand + " " + x.description + " " + x.capacity_label + " " + x.speed_fpm + "fpm" }; }), s.hoistId, function (v) { s.hoistId = parseInt(v, 10); S.commit(); }));
        detail.appendChild(h("span", { "class": "mini", text: "chain ft" }));
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
        detail.appendChild(numInput(s.dlf || "", function (v) { s.dlf = v > 0 ? v : undefined; S.commit(); }, { cls: "w50", placeholder: fmt(auto, 3), title: "Dynamic load factor. Blank = from the hoist speed (fpm / 64 + 1; 16 fpm = 1.25), or the default in the results bar if the speed is unknown. Now " + fmt(auto, 3) }));
      }
      detail.appendChild(h("span", { "class": "mini", text: "+lb" }));
      detail.appendChild(numInput(s.hardwareWeight || 0, function (v) { s.hardwareWeight = v; S.commit(); }, { cls: "w50", title: "Hardware weight at this connection" }));
      var load = sr ? (sr.hoist ? h("div", null, h("b", { text: fmt(sr.hoist.staticLoad, 0) }), " lb ", badge(sr.hoist.status), h("div", { "class": "mini", text: "dyn " + fmt(sr.hoist.dynamicLoad, 0) + " / cap " + fmt(sr.hoist.capacity, 0) })) : h("div", null, h("b", { text: fmt(sr.reaction, 0) }), " lb")) : h("span");
      tb.appendChild(h("tr", { "class": S.sel.support === s.id ? "sel" : "", onclick: function () { S.sel.support = s.kind === "hoist" ? s.id : null; } },
        h("td", null, posCell(s, t.length)),
        h("td", null, select([{ value: "hoist", label: "Hoist" }, { value: "truss", label: "Bolted to truss" }], s.kind, function (v) {
          s.kind = v;
          if (v === "truss") { var o = S.rig.trusses.filter(function (x) { return x.id !== t.id; })[0]; if (o) { s.onTruss = o.id; s.onDistance = 0; } else { s.kind = "hoist"; alert("Add another truss first."); } }
          else if (!s.hoistId) { s.hoistId = S.defaultHoistId(); s.chainLength = 20; }
          S.commit();
        })),
        h("td", null, detail), h("td", null, load),
        h("td", null, h("button", { "class": "del", title: s.kind === "hoist" ? "Delete this motor" : "Delete this connection", text: s.kind === "hoist" ? "Delete motor" : "Delete", onclick: function (e) { e.stopPropagation(); S.removeSupport(t.id, s.id); } }))));
    });
    stbl.appendChild(tb); container.appendChild(stbl);

  }

  function fmtLen(v) {
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
    var custom = h("input", { type: "text", "class": "num w50", placeholder: "ft", title: "A stick of another length: decimal feet or feet-inches (2-6)" });
    chips.appendChild(custom);
    chips.appendChild(h("button", { "class": "chip-btn", text: "+ add", onclick: function () { var v = parseLen(custom.value); if (v > 0) { S.rememberPiece(v); api.add(v); } else if (custom.value.trim()) alert("Could not read that length. Use 2.5 or 2-6."); } }));
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
    function addBlk(spec) { var r = S.addBlockToLine(t.id, S.ui.blockTypeId, spec); if (typeof r === "string") alert(r); }
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
      card.appendChild(h("div", { "class": "notation", text: parts.join(" + ") + "  =  " + fmt(t.length, 3) + " ft" }));
    }
    var atVal = h("input", { type: "text", "class": "num w60", placeholder: "ft", title: "Distance of the block center: decimal feet or feet-inches (4-2)" });
    var atFrom = select([{ value: "start", label: "from start" }, { value: "center", label: "from centerline" }, { value: "end", label: "from end" }], "start", function () {});
    card.appendChild(h("div", { "class": "row-btns" }, h("span", { "class": "mini", text: "Corner block at" }), atVal, atFrom,
      h("button", { text: "Add there", title: "Put a corner block exactly here; the run of truss is split at this point", onclick: function () {
        var v = parseLen(atVal.value);
        if (!isFinite(v)) { alert("Type the distance first (for example 12.5 or 12-6)."); return; }
        var err = S.addBlockAtMeasure(t.id, S.ui.blockTypeId, v, atFrom.value);
        if (err) alert(err);
      } })));
    var rows = h("div", { "class": "seqrows" });
    function segRow(i, label) {
      var v = segs[i];
      if (!manual) {
        if (v > 0 || label) rows.appendChild(h("div", { "class": "seg" }, h("span", { "class": "mini", text: label }), h("b", { text: fmt(v, 3) }), h("span", { "class": "mini", text: "ft" })));
        return;
      }
      var pieces = (t.layout.pieces && t.layout.pieces[i]) || [];
      rows.appendChild(h("div", { "class": "segbox" },
        h("div", { "class": "seg" }, h("span", { "class": "mini", text: label }), h("b", { text: fmt(v, 3) }), h("span", { "class": "mini", text: "ft of truss" }),
          numInput(v, function (nv) { S.setSegment(t, i, nv); }, { cls: "w60", ft: true, title: "Type a total instead of picking sticks" })),
        pieceBuilder(t, pieces, { add: function (len) { S.addSegPiece(t, i, len); }, remove: function (j) { S.removeSegPiece(t, i, j); }, insert: function (j) { addBlk({ seg: i, piece: j }); } }),
        h("div", { "class": "row-btns" }, h("button", { text: "+ Corner block after these pieces", onclick: function () { addBlk({ seg: i }); } }))));
    }
    function blockRow(b) {
      var r = S.results && S.results.trusses[b.id], type = r && r.block && r.block.type, mine = b.host === t.id;
      var bolted = S.rig.trusses.filter(function (o) { return o.supports.some(function (s) { return s.kind === "truss" && s.onTruss === b.id; }); }).map(function (o) { return o.name; });
      rows.appendChild(h("div", { "class": "cbrow" }, h("span", { "class": "cbmark" }), mine ? textInput(b.name, function (v) { b.name = v || b.name; S.commit(); }, "cbname", "name") : h("b", { text: b.name }), h("span", { "class": "mini", text: fmt(b.length, 3) + " ft" + (type ? " - " + type.name : "") + " - " + S.blockWhere(b) + (bolted.length ? " - bolted: " + bolted.join(", ") : "") }),
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

  function lockedInput(v) { return h("input", { type: "number", "class": "num", value: v, disabled: true, title: "Set by the corner block this truss is bolted to" }); }

  function posCell(item, L) {
    var from = item.from || "start";
    var inp = numInput(S.measureDisplay(item, L), function (v) { S.measureSet(item, v, L); if (item.fromPlan) item.fromPlan = false; S.commit(); }, { cls: "w60", ft: true, title: from === "center" ? "Distance from the centerline of the whole line (+ toward the far end)" : from === "end" ? "Distance from the far end of the whole line" : "Distance from the start of the whole line" });
    var ref = select([{ value: "start", label: "start" }, { value: "center", label: "centerline" }, { value: "end", label: "end" }], from, function (v) { S.measureFrom(item, v, L); S.commit(); });
    ref.className = "ref";
    return h("div", { "class": "poscell" }, inp, ref);
  }

  function blockLabel(c) {
    var w = c.base_lb != null ? c.base_lb + " lb bare + " + c.per_connection_lb + " per plate" : c.variants ? c.variants.map(function (v) { return v[1]; }).join("/") + " lb" : c.weight_lb != null ? c.weight_lb + " lb" : "weight n/a";
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
    function wt(c) { return c.base_lb != null ? c.base_lb + "+" + c.per_connection_lb + "/plate lb" : c.variants ? c.variants.map(function (v) { return v[1]; }).join("/") + " lb" : c.weight_lb != null ? c.weight_lb + " lb" : "weight n/a"; }
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
    var toBlock = blocks.length ? select([{ value: "", label: "Bolt to corner block..." }].concat(blocks.map(function (o) { var hh = S.truss(o.host || (o.attach && o.attach.b)); return { value: o.id, label: o.name + " - " + S.blockWhere(o) }; })), "", function (v) {
      if (!v) return;
      var err = S.boltToBlock(t.id, v, S.ui.boltMode || "auto", S.ui.boltSide || "auto");
      if (err) alert(err);
    }) : null;
    var mountSel = select([{ value: "above", label: "sits above" }, { value: "below", label: "clamped below" }], S.ui.mount || "above", function (v) { S.ui.mount = v; S.persist(); });
    var direct = select([{ value: "", label: "Stack / clamp at one point on..." }].concat(trusses.map(function (o) { return { value: o.id, label: o.name }; })), "", function (v) {
      if (!v) return;
      var err = S.addCrossingSupport(t.id, v, S.ui.mount || "above");
      if (err) alert(err);
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
      container.appendChild(field("Hardware fitted", select(type.variants.map(function (v, i) { return { value: i, label: v[0] + " - " + v[1] + " lb" }; }), vi, function (v) { t.variant = parseInt(v, 10); S.commit(); })));
    }
    if (b) {
      var full = b.waysAvailable && b.waysUsed > b.waysAvailable;
      container.appendChild(h("div", { "class": "chips" },
        h("span", { "class": "chip", text: fmt(b.weight, 1) + " lb" }),
        h("span", { "class": "chip " + (full ? "fail" : "ok"), text: b.waysUsed + (b.waysAvailable ? " / " + b.waysAvailable : "") + " faces used" }),
        h("span", { "class": "chip", text: "Layer " + S.results.layers[t.id] })));
      if (type) container.appendChild(h("div", { "class": "sub" }, (type.family.indexOf(type.manufacturer.split(" ")[0]) === 0 ? "" : type.manufacturer + " ") + type.family + (type.code ? " - " + type.code : "") + ". ", type.notes ? type.notes + ". " : "", h("a", { href: type.source, target: "_blank", rel: "noopener", text: "Source" })));
      if (type && type.weight_lb == null && !type.variants && type.base_lb == null) container.appendChild(h("div", { "class": "note fail", text: "The maker does not publish a weight for this block - enter your own below." }));
    }
    container.appendChild(h("div", { "class": "grid3" },
      field("Weight override (lb)", numInput(typeof t.weightOverride === "number" ? t.weightOverride : "", function (v) { t.weightOverride = v > 0 ? v : undefined; S.commit(); }, { title: "Leave 0 to use the published weight" })),
      field("Height (ft)", numInput(t.z || 0, function (v) { t.z = v; S.commit(); }, { ft: true }))));
    if (res) {
      var conns = [];
      S.rig.trusses.forEach(function (o) { o.supports.forEach(function (s) { if (s.kind === "truss" && s.onTruss === t.id) conns.push(o.name); }); });
      container.appendChild(h("h4", { text: "Bolted here" }));
      container.appendChild(h("div", { "class": "sub", text: conns.length ? conns.join(", ") : "Nothing bolted to this block yet." }));
      if (res.injected.length) container.appendChild(h("div", { "class": "sub", text: "Carrying: " + res.injected.map(function (i) { return fmt(i.weight, 0) + " lb from " + i.note.replace("from ", ""); }).join("; ") }));
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
        h("p", { text: "Click a truss in the plan, or add one. Drag trusses to move them; ends snap to other trusses." }),
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
      h("button", { "class": "primary", text: "+ Hoist", title: "Add a motor to this truss", onclick: function () { S.addHoist(t.id); } }),
      h("button", { text: "+ Load", title: "Add a load to this truss", onclick: function () { t.loads.push(S.applyMeasure({ id: S.newId("l"), distance: round(t.length / 2), weight: 0, note: "", mirror: false }, t)); S.commit(); } }),
      h("button", { "class": "danger", text: "Clear loads" + (t.loads.length ? " (" + t.loads.length + ")" : ""), disabled: !t.loads.length, title: "Remove every load from this truss (Undo brings them back)", onclick: function () { if (confirm("Remove all " + t.loads.length + " loads from " + t.name + "? (Undo brings them back.)")) S.clearLoads(t.id); } })));
    container.appendChild(h("div", { "class": "grp-tools" },
      h("button", { "class": "lnk", text: "Collapse all", onclick: function () { setAllGroups(root, false); } }),
      h("button", { "class": "lnk", text: "Expand all", onclick: function () { setAllGroups(root, true); } })));

    if (res && S.sel.support) {
      var a = TLA.rig.attribution(S.rig, S.db(), t.id, S.sel.support);
      if (a) {
        var ss = t.supports.filter(function (x) { return x.id === S.sel.support; })[0];
        var at = h("table", { "class": "tbl" }, h("tbody", null,
          a.parts.map(function (p) { return h("tr", null, h("td", { text: p.name + (p.truss === t.id ? " (own weight)" : "") }), h("td", { "class": "r", text: fmt(p.weight, 1) + " lb" })); }),
          h("tr", null, h("td", { text: "Hoist + chain" }), h("td", { "class": "r", text: fmt(a.hoistChain, 1) + " lb" })),
          h("tr", null, h("td", null, h("b", { text: "Total static" })), h("td", { "class": "r" }, h("b", { text: fmt(a.staticLoad, 1) + " lb" })))));
        container.appendChild(h("div", { "class": "loadpath" }, h("h4", { text: "Selected motor at " + fmt(ss ? ss.distance : 0, 2) + " ft on " + t.name }),
          h("div", { "class": "row-btns" }, h("button", { "class": "danger", text: "Delete this motor", onclick: function () { S.removeSupport(t.id, S.sel.support); } })), at));
      }
    }
    container = group(root, "result", "Diagram and checks", true, res ? (TLA.plan.trussStatus(res).bad ? "warnings" : "all pass") : "not solved");
    if (res) {
      container.appendChild(h("div", { "class": "elev-wrap" }, elevation(t, res)));
      var chips = h("div", { "class": "chips" }, h("span", { "class": "chip", text: "Layer " + S.results.layers[t.id] }));
      var st = TLA.plan.trussStatus(res);
      chips.appendChild(h("span", { "class": "chip " + (st.bad ? "fail" : "ok"), text: st.bad ? "Check warnings" : "All checks pass" }));
      chips.appendChild(h("span", { "class": "chip", text: "Total " + fmt(res.beam.totalLoad, 0) + " lb" }));
      chips.appendChild(h("span", { "class": "chip", text: "Derate " + res.limits.derate }));
      container.appendChild(chips);
    } else {
      container.appendChild(h("div", { "class": "note fail", text: "Not solved: it depends on a load-path loop or a missing truss/support. See warnings below." }));
    }

    // truss type
    container = group(root, "truss", "Truss and length", true, fmt(t.length, 2) + " ft");
    var cur = truss || {};
    var sameMfr = db.trusses.filter(function (x) { return x.manufacturer === cur.manufacturer; });
    var typeBox = h("div", { "class": "grid2" },
      field("Manufacturer", select(mfrs.map(function (m) { return { value: m, label: m }; }), cur.manufacturer, function (v) {
        var first = db.trusses.filter(function (x) { return x.manufacturer === v; })[0]; if (first) { t.trussId = first.id; S.commit(); }
      })),
      field("Model", select(sameMfr.map(function (x) { return { value: x.id, label: x.description }; }), t.trussId, function (v) { t.trussId = parseInt(v, 10); S.commit(); })));
    container.appendChild(typeBox);
    if (truss) container.appendChild(h("div", { "class": "sub", text: fmt(truss.weight_per_ft_lb, 2) + " lb/ft, max span " + fmt(truss.max_span_ft, 1) + " ft, max cantilever " + fmt(truss.max_span_ft / 4, 1) + " ft, " + (truss.repetitive_use ? "repetitive-use data (no 0.85 derate)" : "0.85 repetitive-use derate applies") }));

    container.appendChild(h("div", { "class": "grid3" },
      field("Truss pieces (ft)", (t.layout && t.layout.manual) || Array.isArray(t.pieces) ? h("input", { type: "number", "class": "num", value: t.pieceLength, disabled: true, title: "Set by the pieces / segments below" }) : numInput(t.pieceLength != null ? t.pieceLength : t.length, function (v) { t.pieceLength = Math.max(0.5, v); S.commit(); }, { ft: true, title: "Total length of the truss sections in this line, before corner blocks" })),
      field("Wall / UDL (lb)", numInput(t.wallWeight, function (v) { t.wallWeight = v; S.commit(); }, { title: "Total weight spread over the full length" })),
      field("Weightless", h("input", { type: "checkbox", checked: t.weightless, onchange: function (e) { t.weightless = e.target.checked; S.commit(); } }), "check")));
    container.appendChild(h("div", { "class": "linelen" },
      h("span", null, fmt(t.pieceLength != null ? t.pieceLength : t.length, 3) + " ft truss"),
      h("span", null, " + " + fmt(t.blocksAdded || 0, 3) + " ft corner blocks = "), h("b", { text: fmt(t.length, 3) + " ft whole line" }),
      t.layout && t.layout.manual ? null : h("label", { "class": "mini check", title: "Add the length of every corner block in this line to the truss pieces" }, h("input", { type: "checkbox", checked: t.addBlocks !== false, onchange: function (e) { t.addBlocks = e.target.checked; S.commit(); } }), "add block lengths")));
    if (!(t.layout && t.layout.manual)) {
      if (Array.isArray(t.pieces)) {
        container.appendChild(h("div", { "class": "layout" }, h("h4", { text: "Truss built from pieces" }),
          pieceBuilder(t, t.pieces, { add: function (len) { S.addLinePiece(t, len); }, remove: function (j) { S.removeLinePiece(t, j); }, insert: function (j) { var r = S.addBlockToLine(t.id, S.ui.blockTypeId || S.blockFor(t), { seg: 0, piece: j }); if (typeof r === "string") alert(r); } }),
          h("div", { "class": "row-btns" }, h("button", { text: "Type a length instead", onclick: function () { S.typeLineLength(t); } }))));
      } else {
        container.appendChild(h("div", { "class": "row-btns" }, h("button", { text: "Build from pieces...", title: "Assemble this stick from the standard truss lengths (8', 6', 4'...)", onclick: function () { S.startLinePieces(t); } })));
      }
    }
    var nBlk = t.layout && t.layout.order ? t.layout.order.length : 0;
    container = group(root, "blocks", "Corner blocks", true, nBlk ? nBlk + " in line" : "");
    layoutEditor(container, t);
    container = group(root, "place", "Position and bolting", true, t.anchor ? "bolted" : "");
    container.appendChild(h("div", { "class": "grid3" },
      field("Measure loads / hoists from", select([{ value: "start", label: "start of line" }, { value: "center", label: "centerline" }, { value: "end", label: "end of line" }], t.measure || "start", function (v) { t.measure = v; S.commit(); })),
      field("Height (ft)", numInput(t.z || 0, function (v) { t.z = v; S.commit(); }, { ft: true, title: "3D view only: raises this truss above the others" })),
      field("Width (in)", numInput(t.widthIn || Math.round(TLA.rig.widthIn(t, (S.results.trusses[t.id] || {}).dbTruss) * 100) / 100, function (v) { t.widthIn = v > 0 ? v : undefined; S.commit(); }, { title: "Drawn width in the plan and 3D views. Taken from the truss type (12x12 = 12 in, 1.5 in schedule 40 pipe = 1.9 in OD); type here to override" })),
      field("Stiffness (x)", numInput(t.eiScale || 1, function (v) { t.eiScale = v > 0 ? v : 1; S.commit(); }, { title: "Bending stiffness relative to this truss type's estimate; used only by the stiffness check" }))));
    container.appendChild(h("div", { "class": "grid3" },
      field("Plan X (ft)", t.anchor ? lockedInput(t.x) : numInput(t.x, function (v) { t.x = v; S.commit(); }, { ft: true })),
      field("Plan Y (ft)", t.anchor ? lockedInput(t.y) : numInput(t.y, function (v) { t.y = v; S.commit(); }, { ft: true })),
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
    ltbl.appendChild(h("thead", null, h("tr", null, h("th"), h("th", { "class": "sortable", text: "At (ft) from ↕", title: "Click to sort the rows by distance along the truss", onclick: function () { S.sortLoads(t.id); } }), h("th", { text: "Weight (lb)" }), h("th", { text: "Note" }), h("th", { text: "Mirror", title: "Also place the same load mirrored about the truss centerline" }), h("th", { text: "Copy" }), h("th", { text: "Order" }), h("th"))));
    var lb = h("tbody");
    t.loads.forEach(function (l, i) {
      var handle = h("span", { "class": "drag", title: "Drag to reorder", text: "≡" });
      var row = h("tr", { "data-load": l.id },
        h("td", { "class": "center" }, handle),
        h("td", null, posCell(l, t.length)),
        h("td", null, numInput(l.weight, function (v) { l.weight = v; S.commit(); }, { cls: "w60" })),
        h("td", null, textInput(l.note, function (v) { l.note = v; S.commit(); }, "note")),
        h("td", { "class": "center" }, h("input", { type: "checkbox", checked: !!l.mirror, title: "Mirror about centerline (" + fmt(t.length - l.distance, 2) + " ft)", onchange: function (e) { l.mirror = e.target.checked; S.commit(); } })),
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
      fixturePicker(function (f, clamp) { t.loads.push(S.applyMeasure({ id: S.newId("l"), distance: round(t.length / 2), weight: Math.round((f.weight_lb + (clamp || 0)) * 100) / 100, note: f.manufacturer + " " + f.fixture + (clamp ? " + clamp " + clamp + " lb" : ""), fixtureLb: f.weight_lb, clampLb: clamp || 0, mirror: false }, t)); S.commit(); })));
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
      container.appendChild(h("div", { "class": "sub", text: "Also carrying: " + res.injected.map(function (i) { return fmt(i.weight, 0) + " lb from " + i.note.replace("from ", "") + " at " + fmt(i.distance, 2) + "'"; }).join("; ") }));
    }
  }
  function round(v) { return Math.round(v * 100) / 100; }

  /* ---------- summary ---------- */
  function summary(container) {
    container.textContent = "";
    var r = S.results;
    var t = r.totals;
    container.appendChild(h("div", { "class": "sum-head" },
      h("div", { "class": "kpi" }, h("b", { text: fmt(t.staticLoad, 0) }), h("span", { text: "lb total static on hoists" })),
      h("div", { "class": "kpi" }, h("b", { text: fmt(t.dynamicLoad, 0) }), h("span", { text: "lb total dynamic" })),
      h("div", { "class": "kpi" }, h("b", { text: String(t.count) }), h("span", { text: "hoists" })),
      h("div", { "class": "kpi" }, h("b", { text: String(S.rig.trusses.length) }), h("span", { text: "trusses" })),
      h("div", { "class": "kpi " + (r.warnings.length ? "fail" : "ok") }, h("b", { text: String(r.warnings.length) }), h("span", { text: "warnings" }))));

    var st = S.rig.settings || (S.rig.settings = {});
    container.appendChild(h("div", { "class": "rules" },
      h("label", { "class": "mini check", title: "Rigging Math Made Simple, Lesson 21: manufacturers' tables already subtract the truss weight. Tick this to also count it against cantilevers, as the original Excel did (stricter)." },
        h("input", { type: "checkbox", checked: st.cantileverSelfWeight === true, onchange: function (e) { st.cantileverSelfWeight = e.target.checked; S.commit(); } }), "Count truss weight against cantilever limits (stricter than the textbook)"),
      h("label", { "class": "mini", title: "How length boxes are shown. You can type either way in any length box." }, "Show lengths as ",
        select([{ value: "decimal", label: "decimal feet (4.1667)" }, { value: "ftin", label: "feet-inches (4'-2\")" }], st.lengthFormat === "ftin" ? "ftin" : "decimal", function (v) { st.lengthFormat = v; S.commit(); })),
      h("label", { "class": "mini", title: "Used when a hoist has no speed listed (a custom motor). Hoists with a speed use fpm / 64 + 1 (16 fpm = 1.25). You can also type a factor on any hoist." }, "Default dynamic factor ",
        numInput(typeof st.defaultDlf === "number" ? st.defaultDlf : 1.25, function (v) { st.defaultDlf = v > 0 ? v : 1.25; S.commit(); }, { cls: "w50" })),
      h("label", { "class": "mini" }, "Repetitive-use factor ",
        select([{ value: "auto", label: "per truss data (0.85 unless the table includes it)" }, { value: "0.85", label: "always 0.85" }, { value: "1", label: "none (1.0)" }], typeof st.derate === "number" ? String(st.derate) : "auto", function (v) { st.derate = v === "auto" ? null : parseFloat(v); S.commit(); }))));

    if (r.warnings.length) {
      var ul = h("ul", { "class": "warnings" });
      r.warnings.forEach(function (w) {
        ul.appendChild(h("li", { onclick: function () { if (w.truss) { S.sel = { truss: w.truss, support: null }; S.emit(); } } }, w.message));
      });
      container.appendChild(ul);
    }

    var tbl = h("table", { "class": "tbl hoists" });
    tbl.appendChild(h("thead", null, h("tr", null, [["Truss"], ["Layer", "r"], ["At (ft)", "r"], ["Hoist"], ["Loads & Truss (lb)", "r"], ["Hoist & Chain (lb)", "r"], ["Total Static (lb)", "r"], ["Worst case*", "r"], ["Dyn. factor", "r"], ["Total Dynamic (lb)", "r"], ["Capacity", "r"], ["% cap", "r"], ["Status"], [""]].map(function (x) { return h("th", { "class": x[1] || "", text: x[0] }); }))));
    var tb = h("tbody");
    r.hoists.forEach(function (x) {
      var hs = S.truss(x.truss).supports.filter(function (s) { return s.id === x.support; })[0];
      var hd = S.db().hoists.filter(function (q) { return q.id === (hs && hs.hoistId); })[0];
      tb.appendChild(h("tr", { "class": S.sel.support === x.support ? "sel" : "", onclick: function () { S.sel = { truss: x.truss, support: x.support }; S.emit(); } },
        h("td", { text: x.trussName }), h("td", { "class": "r", text: String(x.layer) }), h("td", { "class": "r", text: fmt(x.distance, 2) }),
        h("td", { text: hd ? hd.description.trim() + " " + hd.capacity_label : "-" }),
        h("td", { "class": "r", title: "Reaction from the loads and the truss's own weight (including any trusses it carries)", text: fmt(x.hoist.reaction, 1) }),
        h("td", { "class": "r", title: "Hoist body + chain (chain length x weight per foot)" + (hs && hs.hardwareWeight ? " + hardware" : ""), text: fmt(x.hoist.staticLoad - x.hoist.reaction, 1) }),
        h("td", { "class": "r", text: fmt(x.hoist.staticLoad, 1) }),
        h("td", { "class": "r" + (x.compat && x.compat.higher ? " hi" : ""), title: x.compat ? "Stiffness check: hinged joints " + fmt(x.compat.hinged, 0) + " lb, rigid corner blocks " + fmt(x.compat.rigid, 0) + " lb" : "", text: x.compat ? fmt(x.compat.envelope, 0) : "-" }),
        h("td", { "class": "r", text: fmt(x.hoist.dynamicFactor, 3) }),
        h("td", { "class": "r", text: fmt(x.hoist.dynamicLoad, 1) }),
        h("td", { "class": "r", text: x.hoist.capacity >= 999999 ? "none" : fmt(x.hoist.capacity, 0) }),
        h("td", { "class": "r", text: x.hoist.capacity >= 999999 ? "-" : fmt(x.hoist.staticLoad / x.hoist.capacity * 100, 0) + "%" }),
        h("td", null, badge(x.hoist.status)),
        h("td", null, h("button", { "class": "x", title: "Delete this motor", text: "x", onclick: function (e) { e.stopPropagation(); S.removeSupport(x.truss, x.support); } }))));
    });
    tbl.appendChild(tb); container.appendChild(tbl);
    if (!r.hoists.length) container.appendChild(h("p", { "class": "sub", text: "No hoists yet - add a hoist support to a truss." }));
    container.appendChild(h("p", { "class": "sub" }, "* Worst case: the larger of the load-path result and a stiffness check that lets the trusses sag and share load (bolted joints modelled as pins and as rigid, all trusses assumed equally stiff unless scaled). " + (r.compat && !r.compat.ok && r.compat.note ? r.compat.note : "")));
  }

  TLA.panels = {
    mount: function (store) { S = store; },
    parseLen: parseLen, fmtFtIn: fmtFtIn, h: h, select: select, numInput: numInput, textInput: textInput, field: field, fmt: fmt, badge: badge,
    inspector: inspector, summary: summary, hoistsCsv: function () {
      var rows = [["Truss", "Layer", "At ft", "Loads & Truss lb", "Hoist & Chain lb", "Total Static lb", "Dynamic factor", "Total Dynamic lb", "Capacity lb", "Status"]];
      S.results.hoists.forEach(function (x) { rows.push([x.trussName, x.layer, x.distance, Math.round(x.hoist.reaction * 10) / 10, Math.round((x.hoist.staticLoad - x.hoist.reaction) * 10) / 10, Math.round(x.hoist.staticLoad * 10) / 10, Math.round(x.hoist.dynamicFactor * 1000) / 1000, Math.round(x.hoist.dynamicLoad * 10) / 10, x.hoist.capacity, x.hoist.status]); });
      return rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
