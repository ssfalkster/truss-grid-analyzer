/* Step grids (1.18.0): Structure, Loads and Hoists as spreadsheet-style tables in the dock.
 * Tab / Enter / arrows move, typing edits, Ctrl+D fills down, Ctrl+V pastes rows from Excel. Cells change the rig
 * the same way the inspectors do (no new data, no engine change); one Undo step per edit or paste. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var S = null, P = null, U = TLA.units, h = null;
  var st = { act: null, edit: false, cmp: false, noFocus: false, cols: null, rows: null, host: null, typed: null };

  function round(v) { return Math.round(v * 1000) / 1000; }
  function flat(x) { return String(x).toLowerCase().replace(/[^a-z0-9.]/g, ""); }

  /* ---------------- fixtures and hoists lookup ---------------- */
  function fxName(f) { return f.manufacturer + " " + f.fixture; }
  function findFixture(txt) {
    var fixtures = S.db().fixtures;
    txt = String(txt || "").trim().toLowerCase(); if (!txt) return null;
    var exact = fixtures.filter(function (f) { return fxName(f).toLowerCase() === txt; })[0];
    if (!exact) { var fl = flat(txt); exact = fixtures.filter(function (f) { return flat(f.manufacturer + f.fixture) === fl || flat(f.fixture) === fl; })[0]; }
    if (exact) return exact;
    var hits = matchFixtures(txt);
    if (!hits.length) return null;
    return hits.length === 1 || fxName(hits[0]).length < fxName(hits[1]).length ? hits[0] : null;
  }
  function matchFixtures(q) {
    var words = String(q || "").toLowerCase().split(/\s+/).map(flat).filter(Boolean);
    if (!words.length) return [];
    var hits = S.db().fixtures.filter(function (f) { var n = flat(fxName(f)); return words.every(function (w) { return n.indexOf(w) >= 0; }); });
    hits.sort(function (a, b) { return fxName(a).length - fxName(b).length; });
    return hits;
  }
  /** Fixtures already on this rig, most used first. */
  function usedFixtures() {
    var count = {};
    S.rig.trusses.forEach(function (t) { (t.loads || []).forEach(function (l) { if (typeof l.fixtureLb === "number" && l.note) count[l.note] = (count[l.note] || 0) + 1; }); });
    var fx = S.db().fixtures;
    return Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).map(function (n) { return fx.filter(function (f) { return fxName(f) === n; })[0]; }).filter(Boolean);
  }
  function fxItem(f, q) {
    var words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean), label = fxName(f), html = esc(label);
    words.forEach(function (w) { var i = html.toLowerCase().indexOf(w); if (i >= 0) html = html.slice(0, i) + "<mark>" + html.slice(i, i + w.length) + "</mark>" + html.slice(i + w.length); });
    return { value: f, html: html, right: U.n("w", f.weight_lb, 1) + (f.clamp_lb ? " + " + U.n("w", f.clamp_lb, 1) + " clamp" : "") };
  }
  function fixtureSource(q) {
    var used = usedFixtures(), m = q ? matchFixtures(q) : [], out = [];
    var u2 = q ? used.filter(function (f) { return m.indexOf(f) >= 0; }) : used.slice(0, 8);
    if (u2.length) out.push({ head: "Used in this rig" }); u2.forEach(function (f) { out.push(fxItem(f, q)); });
    var lib = m.filter(function (f) { return u2.indexOf(f) < 0; }).slice(0, 30);
    if (lib.length) out.push({ head: "Fixture library" }); lib.forEach(function (f) { out.push(fxItem(f, q)); });
    return out;
  }
  function hoistLabel(q) { return P.hoistName(q) + " · " + U.f("speed", q.speed_fpm, 0); }
  function hoistSource(q) {
    var words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    // 1.22.0: "dead hang" (wire rope, no hoist) is picked here too
    var dead = /^(d|de|dea|dead|dead ?h.*|dh|rope|wire.*|gac)$/i.test(String(q).trim()) ? [{ value: { dead: true }, html: "Dead hang (wire rope, no hoist)", right: "set the rope in the inspector" }] : [];
    return dead.concat(S.db().hoists.filter(function (x) { var n = hoistLabel(x).toLowerCase(), n2 = n.replace(/\s+/g, ""); return words.every(function (w) { return n.indexOf(w) >= 0 || n2.indexOf(w) >= 0; }); })
      .slice(0, 40).map(function (x) { return { value: x, html: esc(P.hoistName(x)), right: x.capacity_lb < 999999 ? U.f("w", x.capacity_lb, 0) + " · " + U.f("speed", x.speed_fpm, 0) : "" }; }));
  }
  function trussTypeSource(q) {
    var words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    return S.db().trusses.filter(function (x) { if (x.hidden) return false; var n = (x.manufacturer + " " + P.trussLabel(x)).toLowerCase(); return words.every(function (w) { return n.indexOf(w) >= 0; }); })
      .slice(0, 40).map(function (x) { return { value: x, html: esc(x.manufacturer + " " + P.trussLabel(x)), right: U.f("wpl", x.weight_per_ft_lb, 1) }; });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------------- autocomplete dropdown ---------------- */
  var acEl = null;
  function closeAc() { if (acEl) { acEl.remove(); acEl = null; } }
  /** Attach a dropdown to an input. source(query) -> items {value, html, right} or {head}. onPick(value). */
  function attachAc(input, source, onPick, foot) {
    var items = [], on = -1;
    function show() {
      closeAc();
      items = source(input.value);
      var picks = items.filter(function (x) { return !x.head; });
      if (!picks.length) { on = -1; return; }
      on = on < 0 || on >= picks.length ? 0 : on;
      acEl = h("div", { "class": "ac" });
      var k = 0;
      items.forEach(function (x) {
        if (x.head) { acEl.appendChild(h("div", { "class": "h lbl-sm", text: x.head })); return; }
        var idx = k++, o = h("div", { "class": "o" + (idx === on ? " on" : "") });
        o.innerHTML = "<span>" + x.html + "</span>" + (x.right ? '<span class="w">' + esc(x.right) + "</span>" : "");
        o.addEventListener("mousedown", function (e) { e.preventDefault(); pick(idx); });
        acEl.appendChild(o);
      });
      if (foot) acEl.appendChild(h("div", { "class": "f", text: foot }));
      document.body.appendChild(acEl);
      var r = input.getBoundingClientRect(), below = window.innerHeight - r.bottom;
      acEl.style.left = r.left + "px"; acEl.style.minWidth = Math.max(320, r.width) + "px";
      if (below < 220 && r.top > below) { acEl.style.bottom = (window.innerHeight - r.top) + "px"; acEl.style.borderRadius = "5px 5px 0 0"; }
      else acEl.style.top = r.bottom + "px";
      var cur = acEl.querySelector(".o.on"); if (cur) cur.scrollIntoView({ block: "nearest" });
    }
    function pick(idx) {
      var picks = items.filter(function (x) { return !x.head; });
      var x = picks[idx]; closeAc();
      if (x) { input._acPicked = true; onPick(x.value); }
    }
    input.addEventListener("input", function () { on = 0; show(); });
    input.addEventListener("focus", function () { if (input.value || source("").length) show(); });
    input.addEventListener("blur", function () { setTimeout(closeAc, 120); });
    input.addEventListener("keydown", function (e) {
      if (!acEl) return;
      var n = items.filter(function (x) { return !x.head; }).length;
      if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); on = (on + 1) % n; show(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); on = (on - 1 + n) % n; show(); }
      else if ((e.key === "Enter" || e.key === "Tab") && on >= 0 && input.value.trim()) { pick(on); }
      else if (e.key === "Escape") { e.stopPropagation(); closeAc(); }
    });
  }
  /** Fixture autocomplete on a plain input (inspector quick-add / load item). */
  function attachFixtureAc(input, opts) {
    opts = opts || {};
    attachAc(input, function (q) {
      if (opts.quick) { var m = q.match(/^([^@]*)/); q = m ? m[1].trim() : q; if (/^\d*\.?\d+\s*(lb|lbs|kg)?$/i.test(q)) return []; }
      return q ? fixtureSource(q) : [];
    }, function (f) {
      if (opts.onPick) { opts.onPick(f); return; }
      var at = input.value.match(/@.*$/);
      input.value = fxName(f) + (at ? " " + at[0] : " @ ");
      input.focus();
    }, opts.quick ? "Then type @ and the position, and Enter. A weight works too: 120 lb @ -6" : null);
  }

  /* ---------------- columns ---------------- */
  function lenCell(get, set) { return { type: "len", r: true, get: function (o, row) { var v = get(o, row); return v == null ? "" : P.lenText(v); }, raw: function (o, row) { var v = get(o, row); return v == null ? "" : P.lenText(v); }, parse: function (s) { var v = P.parseShownLen(s); return isFinite(v) ? v : undefined; }, set: set }; }
  function wCell(get, set, d) { return { type: "w", r: true, get: function (o, row) { var v = get(o, row); return v == null || v === "" ? "" : U.n("w", v, d == null ? 1 : d); }, raw: function (o, row) { var v = get(o, row); return v == null || v === "" ? "" : String(Math.round(U.v("w", v) * 1000) / 1000); }, parse: function (s) { if (String(s).trim() === "") return 0; var v = parseFloat(String(s).replace(/,/g, "")); return isFinite(v) ? U.back("w", v) : undefined; }, set: set }; }
  function numCell(get, set, opts) { opts = opts || {}; return { type: "num", r: true, get: function (o, row) { var v = get(o, row); return v == null || v === "" ? (opts.ph ? '<span class="mut">' + opts.ph(o) + "</span>" : "") : String(v); }, html: !!opts.ph, raw: function (o, row) { var v = get(o, row); return v == null ? "" : String(v); }, parse: function (s) { if (String(s).trim() === "") return opts.blank !== undefined ? opts.blank : undefined; var v = parseFloat(s); return isFinite(v) ? v : undefined; }, set: set }; }
  function textCell(get, set) { return { type: "text", get: function (o, row) { return get(o, row) || ""; }, raw: function (o, row) { return get(o, row) || ""; }, parse: function (s) { return String(s); }, set: set }; }
  function roCell(get, opts) { opts = opts || {}; return { ro: true, r: opts.r, html: opts.html, cls: opts.cls, get: get }; }
  var FROM = [["start", "start"], ["center", "CL"], ["end", "end"]];
  function fromCell(len) {
    return { type: "select", options: FROM, get: function (o) { var f = o.from || "start"; return (FROM.filter(function (x) { return x[0] === f; })[0] || FROM[0])[1]; }, raw: function (o) { return o.from || "start"; },
      parse: function (s) { s = String(s).trim().toLowerCase(); return s === "cl" || s === "centerline" || s === "center" || s === "centre" ? "center" : s === "end" ? "end" : s === "start" ? "start" : undefined; },
      set: function (o, v, row) { S.measureFrom(o, v, len(row)); } };
  }

  /* ---------------- step 1: structure ---------------- */
  function lineText(t) {
    try {
      var manual = t.layout && t.layout.manual, d = manual ? null : S.layoutDerived(t);
      var segs = manual ? t.layout.segs : d.segs, order = manual ? t.layout.order.map(function (id) { return S.truss(id); }) : d.att.map(function (a) { return a.block; });
      var out = [];
      segs.forEach(function (v, i) {
        var pcs = manual && t.layout.pieces && t.layout.pieces[i] && t.layout.pieces[i].length ? t.layout.pieces[i].map(function (p) { return U.mark(p, 2); }).join("+") : v > 0 ? (!order.length && Array.isArray(t.pieces) && t.pieces.length ? t.pieces.map(function (p) { return U.mark(p, 2); }).join("+") : U.mark(v, 2)) : "";
        if (pcs) out.push(pcs);
        if (i < order.length && order[i]) out.push(order[i].name.replace(t.name + " ", ""));
      });
      return out.join(" · ");
    } catch (e) { return U.mark(t.length, 2); }
  }
  function structure() {
    var db = S.db();
    var cols = [
      { key: "name", label: "Name", type: "text", get: function (t) { return t.name; }, raw: function (t) { return t.name; }, parse: function (s) { return String(s).trim() || undefined; }, set: function (t, v) { t.name = v; } },
      { key: "type", label: "Type", type: "ac", source: trussTypeSource, get: function (t) { var x = db.trusses.filter(function (q) { return q.id === t.trussId; })[0]; return x ? x.manufacturer + " " + String(x.description).trim() : "custom"; },
        raw: function () { return ""; }, parse: function (s) { var hit = trussTypeSource(s)[0]; return hit ? hit.value : undefined; }, set: function (t, x) { t.trussId = x.id; } },
      { key: "line", label: "Line (pieces · blocks)", ro: true, cls: "mono", get: function (t) { return lineText(t); } },
      Object.assign({ key: "pcs", label: "Pieces (" + U.unit("len") + ")", roIf: function (t) { return (t.layout && t.layout.manual) || Array.isArray(t.pieces); } }, lenCell(function (t) { return t.pieceLength != null ? t.pieceLength : t.length; }, function (t, v) { t.pieceLength = Math.max(0.5, v); })),
      roCell(function (t) { return U.n("len", t.length, 3); }, { r: true }),
      Object.assign({ key: "x", label: "X", roIf: function (t) { return !!t.anchor; } }, lenCell(function (t) { return t.x; }, function (t, v) { t.x = v; })),
      Object.assign({ key: "y", label: "Y", roIf: function (t) { return !!t.anchor; } }, lenCell(function (t) { return t.y; }, function (t, v) { t.y = v; })),
      Object.assign({ key: "ang", label: "Angle", roIf: function (t) { return !!t.anchor; } }, numCell(function (t) { return t.angle || 0; }, function (t, v) { t.angle = ((v % 360) + 360) % 360; })),
      roCell(function (t) { if (!t.anchor) return '<span class="mut">-</span>'; var b = S.truss(t.anchor.block || (t.anchor.reverse && t.anchor.reverse.truss)); return esc((b ? b.name : "?") + (t.anchor.mode && t.anchor.mode !== "through" ? " (" + t.anchor.mode + ")" : "")); }, { html: true }),
      Object.assign({ key: "udl", label: "UDL (" + U.unit("w") + ")" }, wCell(function (t) { return t.wallWeight || 0; }, function (t, v) { t.wallWeight = v; }, 0)),
      Object.assign({ key: "meas", label: "Measure from" }, { type: "select", options: FROM, get: function (t) { var f = t.measure || "start"; return (FROM.filter(function (x) { return x[0] === f; })[0] || FROM[0])[1]; }, raw: function (t) { return t.measure || "start"; }, parse: fromCell().parse, set: function (t, v) { t.measure = v; } }),
      roCell(function (t) { return P.hangsFrom(t); }),
      roCell(function (t) { var vd = P.trussVerdict(S.results.trusses[t.id]); return '<span class="st ' + vd[0] + '">' + vd[1] + "</span>"; }, { html: true })
    ];
    cols[4].key = "lenro"; cols[4].label = "Line (" + U.unit("len") + ")";
    cols[8].key = "bolt"; cols[8].label = "Bolted to";
    cols[11].key = "hangs"; cols[11].label = "Hangs from";
    cols[12].key = "status"; cols[12].label = "Status";
    var rows = S.rig.trusses.filter(function (t) { return !t.isBlock; }).map(function (t) { return { key: "T:" + t.id, obj: t, truss: t, sel: { truss: t.id } }; });
    rows.push({ key: "NT", kind: "new", label: "new truss… (type a name)", create: function () { var t = S.makeTruss({ hoists: [] }); S.rig.trusses.push(t); return { key: "T:" + t.id, obj: t, truss: t }; } });
    return { cols: cols, rows: rows, hint: "Type straight from the plot: X / Y / angle for free trusses; a truss bolted to a corner block is placed by the block (bolt it with \"Bolt to…\" in the inspector). Pieces = truss sections before corner blocks. Grey columns are results." };
  }

  /* ---------------- step 2: loads ---------------- */
  function loads() {
    var len = function (row) { return row.truss.length; };
    var cols = [
      roCell(function (l, row) { return row.truss.name; }, { cls: "mut" }),
      Object.assign({ key: "at" }, lenCell(function (l, row) { return S.measureDisplay(l, row.truss.length); }, function (l, v, row) { S.measureSet(l, v, row.truss.length); })),
      Object.assign({ key: "from", label: "From" }, fromCell(len)),
      { key: "item", label: "Item / fixture", type: "ac", source: fixtureSource, free: true, get: function (l) { return (l.note || "") + (typeof l.fixtureLb === "number" ? "" : l.note ? ' <span class="pill">custom</span>' : ""); }, html: true, raw: function (l) { return l.note || ""; },
        parse: function (s) { return s; },
        set: function (l, v) {
          if (v && typeof v === "object") { P.applyFixture(l, v); return; }
          var s = String(v).trim(), wm = s.match(/^(-?\d*\.?\d+)\s*(lb|lbs|kg)?$/i);
          if (wm) { var w = parseFloat(wm[1]); w = wm[2] && /kg/i.test(wm[2]) && !U.metric() ? w / U.LB_KG : U.back("w", w); if (!l.note) l.note = "Load"; var p = P.loadParts(l); p.each = w; p.clamp = 0; delete l.fixtureLb; delete l.clampLb; P.setLoadParts(l, p); return; }
          var f = findFixture(s);
          if (f) P.applyFixture(l, f); else l.note = s;
        } },
      Object.assign({ key: "each", label: "Weight (" + U.unit("w") + ")" }, wCell(function (l) { return P.loadParts(l).each; }, function (l, v) { var p = P.loadParts(l); p.each = v; P.setLoadParts(l, p); })),
      Object.assign({ key: "clamp", label: "Clamp (" + U.unit("w") + ")" }, wCell(function (l) { var c = P.loadParts(l).clamp; return c ? c : ""; }, function (l, v) { var p = P.loadParts(l); p.clamp = v; if (typeof l.fixtureLb !== "number") l.fixtureLb = p.each; P.setLoadParts(l, p); })),
      roCell(function (l, row) { return U.n("w", l.weight, 1) + (P.mirrorAt(l, row.truss) ? ' <span class="pill">×2</span>' : ""); }, { r: true, html: true }),
      { key: "mirror", label: "Mirror about CL", type: "check", get: function (l, row) { var m = P.mirrorAt(l, row.truss); return m ? "at " + m : ""; }, val: function (l) { return !!l.mirror; }, set: function (l, v) { l.mirror = !!v; } },
      Object.assign({ key: "note", label: "Note" }, textCell(function (l) { return l.comment; }, function (l, v) { l.comment = v || undefined; })),
      { key: "cat", label: "Category", type: "select", options: TLA.rig.LOAD_CATS.map(function (c) { return [c[0], c[1]]; }), get: function (l) { var c = TLA.rig.LOAD_CATS.filter(function (x) { return x[0] === (l.cat || "other"); })[0]; var f = TLA.rig.loadFactor(l, S.rig.settings); return (c ? c[1] : "Other") + (f !== 1 ? " ×" + f : ""); }, raw: function (l) { return l.cat || "other"; },
        parse: function (q) { q = String(q).trim().toLowerCase(); var c = TLA.rig.LOAD_CATS.filter(function (x) { return x[0] === q || x[1].toLowerCase().indexOf(q) === 0; })[0]; return q === "" ? "other" : c ? c[0] : undefined; }, set: function (l, v) { l.cat = v === "other" ? undefined : v; } }
    ];
    cols[0].key = "truss"; cols[0].label = "Truss"; cols[1].label = "At (" + U.unit("len") + ")"; cols[6].key = "total"; cols[6].label = "Total (" + U.unit("w") + ")";
    var rows = [];
    S.rig.trusses.forEach(function (t) {
      if (t.isBlock) return;
      var tot = t.loads.reduce(function (a, l) { return a + (Number(l.weight) || 0) * (P.mirrorAt(l, t) ? 2 : 1); }, 0);
      rows.push({ key: "G:" + t.id, kind: "group", truss: t, label: t.name, right: t.loads.length + " load" + (t.loads.length === 1 ? "" : "s") + " · " + U.f("w", tot, 1),
        acts: t.loads.length ? [["Mirror all", function () { t.loads.forEach(function (l) { l.mirror = true; }); S.commit(); }], ["Copy to truss…", function () { copyPrompt(t); }], ["Sort", function () { S.sortLoads(t.id); }], ["Clear", function () { if (confirm("Remove all " + t.loads.length + " loads from " + t.name + "? (Undo brings them back.)")) S.clearLoads(t.id); }]] : [] });
      t.loads.forEach(function (l) { rows.push({ key: "L:" + l.id, obj: l, truss: t, sel: { truss: t.id, load: l.id }, del: function () { t.loads.splice(t.loads.indexOf(l), 1); } }); });
      rows.push({ key: "NL:" + t.id, kind: "new", truss: t, label: "+ load on " + t.name + " (start typing)", sel: { truss: t.id }, create: function () { var l = P.newLoad(t); return { key: "L:" + l.id, obj: l, truss: t }; } });
    });
    return { cols: cols, rows: rows, hint: "Item: type to search the fixture library (or a weight, e.g. 45 lb, for a custom load). Total = weight + clamp. One row per load position. Mirror adds the same load on the other side of the centerline. Category sets the load factor (Rig settings). Paste rows from a spreadsheet: at, from, item, weight, clamp, mirror, note, category." };
  }
  function copyPrompt(t) {
    var others = S.rig.trusses.filter(function (o) { return o.id !== t.id && !o.isBlock; });
    if (!others.length) return;
    var name = prompt("Copy all " + t.loads.length + " loads from " + t.name + " to which truss? (keeps each load's distance from the centre)\n\n" + others.map(function (o) { return o.name; }).join(", "), others[0].name);
    if (!name) return;
    var dst = others.filter(function (o) { return o.name.toLowerCase() === name.trim().toLowerCase(); })[0];
    if (!dst) { alert("No truss called \"" + name + "\"."); return; }
    var r = S.copyLoads(t.id, [], dst.id);
    if (r && r.clamped) alert(r.clamped + " load(s) were past the end of " + dst.name + " and were placed at its end.");
  }

  /** Where a hoist hangs (1.22.0): the structure, or below another truss (type its name). */
  function hangCell() {
    var opts = [["", "structure"]].concat(S.rig.trusses.filter(function (t) { return !t.isBlock; }).map(function (t) { return [t.id, "below " + t.name]; }));
    function label(v) { var o = opts.filter(function (x) { return x[0] === (v || ""); })[0]; return o ? o[1] : "structure"; }
    return { key: "hang", label: "Hangs from", type: "select", options: opts, get: function (s) { return label(s.hangFrom); }, raw: function (s) { return s.hangFrom || ""; },
      parse: function (q) {
        q = String(q).trim().toLowerCase().replace(/^below\s+/, "");
        if (!q || q === "structure" || q === "roof" || q === "grid") return "";
        var o = opts.filter(function (x) { return x[0] === q || x[1].toLowerCase().replace(/^below\s+/, "") === q; })[0];
        return o ? o[0] : undefined;
      },
      set: function (s, v, row) { s.hangFrom = v && v !== row.truss.id ? v : undefined; } };
  }

  /* ---------------- step 3: hoists ---------------- */
  function hoists() {
    var len = function (row) { return row.truss.length; };
    function X(s) { return P.hoistRes(s.id); }
    var cols = [
      roCell(function (s, row) { return row.truss.name; }, { cls: "mut" }),
      Object.assign({ key: "at" }, lenCell(function (s, row) { return S.measureDisplay(s, row.truss.length); }, function (s, v, row) { S.measureSet(s, v, row.truss.length); })),
      Object.assign({ key: "from", label: "From" }, fromCell(len)),
      { key: "hoist", label: "Hoist", type: "ac", source: hoistSource, get: function (s) { if (s.dead) return P.supportName(s); var hd = P.hoistDb(s.hoistId); return hd ? String(hd.description).trim() + " " + hd.capacity_label : "-"; }, raw: function () { return ""; },
        parse: function (q) { var hit = hoistSource(q)[0]; return hit ? hit.value : undefined; }, set: function (s, x) { if (x.dead) { P.setDead(s, true); return; } P.setDead(s, false); s.hoistId = x.id; } },
      Object.assign({ key: "chain", label: "Chain / rope (" + U.unit("len") + ")" }, lenCell(function (s) { return (s.dead ? s.ropeLength : s.chainLength) || 0; }, function (s, v) { if (s.dead) s.ropeLength = Math.max(0, v); else s.chainLength = Math.max(0, v); })),
      Object.assign({ key: "dlf", label: "DLF" }, numCell(function (s) { return s.dlf; }, function (s, v) { s.dlf = v > 0 ? v : undefined; }, { blank: 0, ph: function (s) { var x = X(s); return "auto " + (x ? P.fmt(x.hoist.dynamicFactor, 3) : ""); } })),
      Object.assign({ key: "hw", label: "Hardware (" + U.unit("w") + ")" }, wCell(function (s) { return s.hardwareWeight || 0; }, function (s, v) { s.hardwareWeight = v; }, 1)),
      hangCell(),
      // 1.22.0: designed level offset, inches (mm)
      { key: "lvl", label: "Level (" + U.unit("inch") + ")", type: "num", r: true, get: function (s) { return Number(s.level) ? U.n("inch", s.level, 2) : ""; }, raw: function (s) { return Number(s.level) ? String(Math.round(U.v("inch", s.level) * 1000) / 1000) : ""; },
        parse: function (q) { if (String(q).trim() === "") return 0; var v = parseFloat(q); return isFinite(v) ? U.back("inch", v) : undefined; }, set: function (s, v) { s.level = v ? v : undefined; } }
    ];
    if (st.cmp) {
      [["hin", "Hinged*", function (x) { var c = x.byModel && x.byModel.hinged; return c ? U.n("w", c.staticLoad, 1) : "-"; }],
       ["semi", "Semi-rigid*", function (x) { var c = x.compat; return c && c.semiMin != null ? (Math.abs(c.semiMax - c.semiMin) < 0.05 ? U.n("w", c.semiMax, 1) : U.n("w", c.semiMin, 1) + " - " + U.n("w", c.semiMax, 1)) : "-"; }],
       ["rig", "Rigid*", function (x) { var c = x.byModel && x.byModel.rigid; return c ? U.n("w", c.staticLoad, 1) : "-"; }]].forEach(function (m) {
        cols.push(Object.assign(roCell(function (s) { var x = X(s); return x ? m[2](x) : "-"; }, { r: true }), { key: m[0], label: m[1] }));
      });
    }
    cols.push(Object.assign(roCell(function (s) { var x = X(s); return x ? U.n("w", x.hoist.staticLoad, 1) : "-"; }, { r: true, cls: "b" }), { key: "hhs", label: "High hook static (" + U.unit("w") + ")" }));
    cols.push(Object.assign(roCell(function (s) { var x = X(s); return x ? U.n("w", x.hoist.dynamicLoad, 1) : "-"; }, { r: true }), { key: "hhd", label: "High hook dyn. (" + U.unit("w") + ")" }));
    cols.push(Object.assign(roCell(function (s) { var x = X(s); return x && x.hoist.capacity < 999999 ? P.wlCell(x.hoist.staticLoad / x.hoist.capacity).outerHTML : "-"; }, { html: true }), { key: "wl", label: "Workload" }));
    cols.push(Object.assign(roCell(function (s) { var x = X(s); return x ? P.badge(x.hoist.status).outerHTML : "-"; }, { html: true }), { key: "st", label: "Status" }));
    // 1.22.0: load-cell reading (blank = none) and how far it is from the calculation
    cols.push({ key: "meas", label: "Measured (" + U.unit("w") + ")", type: "w", r: true, get: function (s) { return s.measured != null && s.measured !== "" ? U.n("w", s.measured, 0) : ""; }, raw: function (s) { return s.measured != null && s.measured !== "" ? String(Math.round(U.v("w", s.measured) * 10) / 10) : ""; },
      parse: function (q) { if (String(q).trim() === "") return null; var v = parseFloat(String(q).replace(/,/g, "")); return isFinite(v) && v >= 0 ? U.back("w", v) : undefined; }, set: function (s, v) { if (v === null) delete s.measured; else s.measured = v; } });
    cols.push(Object.assign(roCell(function (s, row) { var m = S.results.measured && S.results.measured.hoists[row.truss.id + ":" + s.id]; return m && m.diff !== null ? '<span class="' + (Math.abs(m.diff) > TLA.rig.MEAS_TOL ? "st w" : "mut") + '">' + TLA.rig.pctText(m.diff) + "</span>" : ""; }, { r: true, html: true }), { key: "mdiff", label: "vs calc." }));
    cols[0].key = "truss"; cols[0].label = "Truss"; cols[1].label = "At (" + U.unit("len") + ")";
    var rows = [];
    S.rig.trusses.forEach(function (t) {
      var hs = t.supports.filter(function (s) { return s.kind === "hoist"; });
      if (t.isBlock && !hs.length) return;
      rows.push({ key: "G:" + t.id, kind: "group", truss: t, label: t.name, right: hs.length + " hoist" + (hs.length === 1 ? "" : "s") + " · " + U.f("len", t.length, 2),
        acts: hs.length ? [["Mirror all", function () { P.mirrorHoistsUi(t); }], ["Copy to truss…", function () { P.copyHoistsPrompt(t); }]] : [] });
      hs.forEach(function (s) { rows.push({ key: "H:" + s.id, obj: s, truss: t, sel: { truss: t.id, support: s.id }, del: function () { t.supports.splice(t.supports.indexOf(s), 1); } }); });
      rows.push({ key: "NH:" + t.id, kind: "new", truss: t, label: "+ hoist on " + t.name + " (type its position)", sel: { truss: t.id }, create: function () { var sp = S.applyMeasure(S.hoistSupport(round(t.length / 2)), t); t.supports.push(sp); return { key: "H:" + sp.id, obj: sp, truss: t }; } });
    });
    return { cols: cols, rows: rows, hint: "Results (grey) update as you type. Hoist: type to filter (\"lode 1t\", \"prostar\", \"2 ton\"). DLF blank = from the hoist speed. Mirror all adds a hoist at each hoist's mirrored spot; Copy to truss keeps each hoist's distance from the centre. " + (st.cmp ? "* The three whole-rig joint models; high hook static uses the largest." : "Tick Compare analysis methods to see the joint-model columns.") };
  }

  /* ---------------- rendering ---------------- */
  function isRo(c, row) { return !!c.ro || !!(c.roIf && row.obj && c.roIf(row.obj)); }
  function cellHtml(c, row) {
    if (row.kind) return "";
    var v = c.get(row.obj, row);
    if (c.type === "check") return '<input type="checkbox"' + (c.val(row.obj) ? " checked" : "") + (isRo(c, row) ? " disabled" : "") + '><span class="mut">' + esc(v) + "</span>";
    return c.html ? String(v) : esc(v);
  }
  function render(container, spec) {
    st.host = container; st.cols = spec.cols; st.rows = spec.rows;
    container.textContent = "";
    var tbl = h("table", { "class": "xg" }), thead = h("thead"), tr = h("tr", null, h("th"));
    spec.cols.forEach(function (c) { tr.appendChild(h("th", { "class": (c.r ? "r " : "") + (c.ro ? "ro" : ""), text: c.label })); });
    thead.appendChild(tr); tbl.appendChild(thead);
    var tb = h("tbody"), n = 0;
    spec.rows.forEach(function (row, ri) {
      var r = h("tr", { "data-r": ri, "class": (row.kind === "group" ? "gh" : row.kind === "new" ? "new" : "") + (selRow(row) ? " selrow" : "") });
      if (row.kind === "group") {
        var td = h("td", { colspan: spec.cols.length + 1 }, row.label, row.acts && row.acts.length ? h("span", { "class": "gacts" }, row.acts.map(function (a) { return h("button", { "class": "lnk", text: a[0], onclick: function (e) { e.stopPropagation(); a[1](); } }); })) : null, h("span", { "class": "r", text: row.right || "" }));
        r.appendChild(td); tb.appendChild(r); return;
      }
      r.appendChild(h("td", { "class": "idx", title: row.kind ? "" : "Row " + (n + 1) + (row.del ? " - Delete key removes it" : ""), text: row.kind ? "" : String(++n) }));
      spec.cols.forEach(function (c, ci) {
        var ro = isRo(c, row), cls = (c.r ? "r " : "") + (ro ? "ro " : "ed ") + (c.cls || "") + " " + (c.clsOf && !row.kind ? c.clsOf(row.obj) : "");
        var td = h("td", { "class": cls, "data-c": ci });
        var cv = h("span", { "class": "cv" });
        if (row.kind === "new") cv.textContent = ci === 0 ? row.label : "";
        else cv.innerHTML = cellHtml(c, row);
        td.appendChild(cv);
        if (row.kind === "new" && ci === 0) { td.colSpan = 1; }
        r.appendChild(td);
      });
      tb.appendChild(r);
    });
    tbl.appendChild(tb); container.appendChild(tbl);
    if (spec.hint) container.appendChild(h("div", { "class": "ghint", text: spec.hint }));
    tbl.addEventListener("mousedown", onMouse);
    tbl.addEventListener("dblclick", function (e) { var td = e.target.closest("td[data-c]"); if (td && !td.classList.contains("ro")) beginEdit(); });
    tbl.addEventListener("change", onCheck);
    restoreAct();
  }
  function selRow(row) {
    var s = S.sel || {};
    if (row.kind) return false;
    if (row.sel && row.sel.load) return s.load === row.sel.load;
    if (row.sel && row.sel.support) return s.support === row.sel.support;
    return row.sel && row.sel.truss && s.truss === row.sel.truss && !s.load && !s.support;
  }
  function rowIndex(key) { for (var i = 0; i < st.rows.length; i++) if (st.rows[i].key === key) return i; return -1; }
  function colIndex(key) { for (var i = 0; i < st.cols.length; i++) if (st.cols[i].key === key) return i; return -1; }
  function tdAt(ri, ci) { return st.host && st.host.querySelector('tr[data-r="' + ri + '"] td[data-c="' + ci + '"]'); }
  function restoreAct() {
    if (!st.act) return;
    var ri = rowIndex(st.act.row), ci = colIndex(st.act.col);
    if (ri < 0 || ci < 0) { st.act = null; focusMode(); return; }
    var td = tdAt(ri, ci); if (!td) return;
    td.classList.add("act");
    td.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (st.edit) { st.edit = false; beginEdit(st.typed); st.typed = null; }
    focusMode();
  }
  function setAct(ri, ci, noSel) {
    ri = Math.max(0, Math.min(st.rows.length - 1, ri)); ci = Math.max(0, Math.min(st.cols.length - 1, ci));
    var row = st.rows[ri];
    if (row.kind === "group") { var dir = st.act && rowIndex(st.act.row) > ri ? -1 : 1, j = ri + dir; if (j < 0 || j >= st.rows.length) j = ri - dir; if (j < 0 || j >= st.rows.length) return; ri = j; row = st.rows[ri]; }
    var prev = st.act && st.act.row;
    [].forEach.call(st.host.querySelectorAll("td.act"), function (x) { x.classList.remove("act"); });
    st.act = { row: row.key, col: st.cols[ci].key };
    var td = tdAt(ri, ci); if (td) { td.classList.add("act"); td.scrollIntoView({ block: "nearest", inline: "nearest" }); }
    if (!noSel && prev !== row.key && row.sel) S.select(row.sel);   // redraws; restoreAct keeps the cell
    else focusMode();
  }
  function onMouse(e) {
    var td = e.target.closest("td[data-c]"), tr = e.target.closest("tr[data-r]");
    if (!td || !tr) { var idx = e.target.closest("td.idx"); if (idx && tr) { var row = st.rows[+tr.getAttribute("data-r")]; if (row.sel) { st.act = { row: row.key, col: st.cols[0].key }; S.select(row.sel); } } return; }
    if (e.target.tagName === "INPUT" && e.target.type === "checkbox") return;
    if (e.target.classList.contains("ci")) return;
    var ri = +tr.getAttribute("data-r"), ci = +td.getAttribute("data-c");
    var same = st.act && st.act.row === st.rows[ri].key && st.act.col === st.cols[ci].key;
    if (st.edit) commitEdit();
    if (same && !td.classList.contains("ro")) { e.preventDefault(); beginEdit(); return; }
    e.preventDefault();
    st.anchor = null;
    setAct(ri, ci);
  }
  function onCheck(e) {
    if (e.target.type !== "checkbox") return;
    var tr = e.target.closest("tr[data-r]"), td = e.target.closest("td[data-c]");
    var row = st.rows[+tr.getAttribute("data-r")], c = st.cols[+td.getAttribute("data-c")];
    if (!row || row.kind || !c.set) return;
    st.act = { row: row.key, col: c.key };
    c.set(row.obj, e.target.checked, row); S.commit();
  }

  /* ---------------- editing ---------------- */
  var editor = null;
  function beginEdit(initial) {
    if (!st.act) return;
    var ri = rowIndex(st.act.row), ci = colIndex(st.act.col), row = st.rows[ri], c = st.cols[ci];
    if (!row || !c || isRo(c, row) || (row.kind && row.kind !== "new")) return;
    if (c.type === "check") { if (!row.kind) { c.set(row.obj, !c.val(row.obj), row); S.commit(); } return; }
    var td = tdAt(ri, ci); if (!td) return;
    st.edit = true;
    var inp;
    if (c.type === "select") {
      inp = h("select", { "class": "ci" }); c.options.forEach(function (o) { var op = h("option", { value: o[0], text: o[1] }); if (!row.kind && c.raw(row.obj) === o[0]) op.selected = true; inp.appendChild(op); });
      inp.addEventListener("change", function () { commitEdit(); });
    } else {
      inp = h("input", { type: "text", "class": "ci", autocomplete: "off", value: initial != null ? initial : row.kind ? "" : c.raw(row.obj, row) });
    }
    editor = { inp: inp, ri: ri, ci: ci, picked: undefined };
    td.appendChild(inp);
    if (c.type === "ac") attachAc(inp, function (q) { return q.trim() ? c.source(q) : (c.key === "item" ? fixtureSource("") : []); }, function (v) { if (editor && editor.inp === inp) { editor.picked = v; } },
      c.key === "item" ? "Enter = pick · Tab = pick and next cell · or type a weight (\"45 lb\") for a custom load" : null);
    inp.addEventListener("keydown", onEditKey);
    inp.addEventListener("blur", function () { setTimeout(function () { if (editor && editor.inp === inp && document.activeElement !== inp) commitEdit(); }, 150); });
    inp.focus();
    if (initial != null && inp.setSelectionRange) { inp.setSelectionRange(inp.value.length, inp.value.length); inp.dispatchEvent(new Event("input")); }
    else if (inp.select) inp.select();
  }
  function onEditKey(e) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault(); e.stopPropagation();
      var dr = e.key === "Enter" ? (e.shiftKey ? -1 : 1) : 0, dc = e.key === "Tab" ? (e.shiftKey ? -1 : 1) : 0;
      setTimeout(function () { commitEdit(dr, dc); }, 0);   // let an autocomplete pick land first
    } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); }
  }
  function cancelEdit() {
    if (!editor) return;
    var ed = editor; editor = null; st.edit = false; closeAc();
    if (ed.inp.parentNode) ed.inp.parentNode.removeChild(ed.inp);
    if (st.host) st.host.focus && st.host.focus();
  }
  /** Apply the editor's value; dr/dc move the active cell afterwards (Enter / Tab). */
  function commitEdit(dr, dc) {
    if (!editor) return;
    var ed = editor; editor = null; st.edit = false; closeAc();
    var row = st.rows[ed.ri], c = st.cols[ed.ci], text = ed.inp.value;
    var v = ed.picked !== undefined ? ed.picked : c.parse(text);
    var changed = false, newKey = null;
    if (v !== undefined && !(row.kind === "new" && String(text).trim() === "" && ed.picked === undefined)) {
      var target = row;
      if (row.kind === "new") { var made = row.create(); target = made; newKey = made.key; }
      if (!(c.type === "ac" && !c.free && v === undefined)) { c.set(target.obj, v, target); changed = true; }
    } else if (v === undefined && String(text).trim() !== "" && row.kind !== "new") {
      ed.inp.classList.add("bad");
    }
    var ri = ed.ri, ci = ed.ci;
    if (newKey) st.act = { row: newKey, col: c.key };
    if (dr || dc) {
      if (newKey) { st.pendingMove = [dr || 0, dc || 0]; }
      else moveBy(ri, ci, dr || 0, dc || 0, true, dc ? "tab" : "enter");
    }
    if (changed) S.commit();
    else { if (ed.inp.parentNode) ed.inp.parentNode.removeChild(ed.inp); }
  }
  function moveBy(ri, ci, dr, dc, quiet, how) {
    if (how === "tab") { if (st.anchor == null) st.anchor = st.cols[ci].key; }
    else if (how === "enter") { if (st.anchor != null && dr) { var ai = colIndex(st.anchor); if (ai >= 0) { dc = ai - ci; } } st.anchor = null; }
    else st.anchor = null;
    var ni = ri, nc = ci + dc;
    if (nc >= st.cols.length) { nc = 0; dr = 1; } else if (nc < 0) { nc = st.cols.length - 1; dr = -1; }
    while (dc && st.rows[ri] && !st.rows[ri].kind && st.cols[nc] && isRo(st.cols[nc], st.rows[ri]) && nc > 0 && nc < st.cols.length - 1) nc += dc > 0 ? 1 : -1;   // Tab skips result columns
    if (dr) { ni = ri + dr; while (ni >= 0 && ni < st.rows.length && st.rows[ni].kind === "group") ni += dr; if (ni < 0 || ni >= st.rows.length) ni = ri; }
    var row = st.rows[ni];
    st.act = { row: row.key, col: st.cols[nc].key };
    if (!quiet) setAct(ni, nc);
    else if (row.sel && JSON.stringify(row.sel) !== JSON.stringify(currentSel())) { S.sel = { truss: row.sel.truss || null, support: row.sel.support || null, load: row.sel.load || null }; }
  }
  function currentSel() { var s = S.sel || {}; var o = {}; if (s.truss) o.truss = s.truss; if (s.support) o.support = s.support; if (s.load) o.load = s.load; return o; }
  /** Ctrl+D: copy the value from the row above into the active cell. */
  function fillDown() {
    if (!st.act) return;
    var ri = rowIndex(st.act.row), ci = colIndex(st.act.col), row = st.rows[ri], c = st.cols[ci];
    if (!row || row.kind || isRo(c, row)) return;
    var up = ri - 1; while (up >= 0 && st.rows[up].kind) up--;
    if (up < 0) return;
    var src = st.rows[up];
    var v = c.type === "check" ? c.val(src.obj) : c.type === "ac" && c.key === "item" ? src.obj : c.type === "ac" && c.key === "hoist" ? P.hoistDb(src.obj.hoistId) : c.type === "ac" && c.key === "type" ? S.db().trusses.filter(function (x) { return x.id === src.obj.trussId; })[0] : c.parse(c.raw(src.obj, src));
    if (c.key === "item") { var o = src.obj; row.obj.note = o.note; if (typeof o.fixtureLb === "number") { row.obj.fixtureLb = o.fixtureLb; row.obj.clampLb = o.clampLb || 0; } else { delete row.obj.fixtureLb; delete row.obj.clampLb; } row.obj.weight = o.weight; delete row.obj.qty; }
    else if (v !== undefined && v !== null) c.set(row.obj, v, row);
    S.commit();
  }
  /** Ctrl+V: tab-separated rows from a spreadsheet, from the active cell right and down (new rows added in the group). */
  function paste(text) {
    if (!st.act) return false;
    var lines = String(text).replace(/\r/g, "").split("\n"); if (lines.length && lines[lines.length - 1] === "") lines.pop();
    if (!lines.length) return false;
    if (lines.length === 1 && lines[0].indexOf("\t") < 0) { beginEdit(lines[0]); return true; }
    var ri = rowIndex(st.act.row), ci = colIndex(st.act.col), n = 0, bad = 0;
    lines.forEach(function (line) {
      var row = st.rows[ri];
      while (row && row.kind === "group") { ri++; row = st.rows[ri]; }
      if (!row) return;
      var target = row;
      if (row.kind === "new") { target = row.create(); } else ri++;
      line.split("\t").forEach(function (cell, k) {
        var c = st.cols[ci + k]; if (!c || isRo(c, target) || !c.set || !cell.trim()) return;   // blank pasted cells leave the value alone
        var v = c.type === "check" ? /^(1|y|yes|x|true|✓|mirror)$/i.test(cell.trim()) : c.parse(cell);
        if (v === undefined || (typeof v === "string" && c.type !== "text" && c.type !== "ac" && !cell.trim())) { if (cell.trim()) bad++; return; }
        c.set(target.obj, v, target);
      });
      n++;
    });
    S.commit();
    if (bad) setTimeout(function () { alert(n + " row(s) pasted; " + bad + " cell(s) could not be read and were skipped."); }, 0);
    return true;
  }
  function deleteRow() {
    if (!st.act) return;
    var ri = rowIndex(st.act.row), row = st.rows[ri];
    if (!row || row.kind) return;
    if (!row.del) { if (row.obj && row.obj.id && S.truss(row.obj.id) && confirm("Delete " + row.obj.name + "?")) { S.removeTruss(row.obj.id); } return; }
    row.del();
    var nx = st.rows[ri + 1]; st.act = nx ? { row: nx.key, col: st.act.col } : null;
    S.sel = row.truss ? { truss: row.truss.id, support: null, load: null } : S.sel;
    S.commit();
  }
  function onKey(e) {
    if (!st.act || !st.host || !st.host.isConnected || st.edit) return;
    if (TLA.report && TLA.report.isOpen && TLA.report.isOpen()) return;
    var tag = (e.target && e.target.tagName) || "";
    if (/INPUT|SELECT|TEXTAREA/.test(tag) && !(e.target.classList && e.target.classList.contains("ci"))) return;
    if (document.querySelector("dialog[open]")) return;
    var ri = rowIndex(st.act.row), ci = colIndex(st.act.col);
    if (ri < 0 || ci < 0) return;
    var k = e.key, handled = true;
    if (k === "ArrowDown") moveBy(ri, ci, 1, 0);
    else if (k === "ArrowUp") moveBy(ri, ci, -1, 0);
    else if (k === "ArrowRight") moveBy(ri, ci, 0, 1);
    else if (k === "ArrowLeft") moveBy(ri, ci, 0, -1);
    else if (k === "Tab") moveBy(ri, ci, 0, e.shiftKey ? -1 : 1, false, "tab");
    else if (k === "Enter") moveBy(ri, ci, e.shiftKey ? -1 : 1, 0, false, "enter");
    else if (k === "F2") beginEdit();
    else if (k === " " && st.cols[ci].type === "check") beginEdit();
    else if (k === "Escape") { st.act = null; [].forEach.call(st.host.querySelectorAll("td.act"), function (x) { x.classList.remove("act"); }); focusMode(); }
    else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "d") fillDown();
    else if (k === "Delete" || k === "Backspace") { if (e.shiftKey || k === "Delete") deleteRow(); }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); beginEdit(k); return; }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
  function onPaste(e) {
    if (!st.act || !st.host || !st.host.isConnected || st.edit) return;
    var tag = (e.target && e.target.tagName) || ""; if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    var text = (e.clipboardData || window.clipboardData).getData("text");
    if (paste(text)) e.preventDefault();
  }
  function onCopy(e) {
    if (!st.act || !st.host || !st.host.isConnected || st.edit) return;
    var tag = (e.target && e.target.tagName) || ""; if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    var ri = rowIndex(st.act.row), ci = colIndex(st.act.col), row = st.rows[ri], c = st.cols[ci];
    if (!row || row.kind) return;
    var tmp = document.createElement("div"); tmp.innerHTML = cellHtml(c, row);
    e.clipboardData.setData("text/plain", c.raw ? c.raw(row.obj, row) : tmp.textContent); e.preventDefault();
  }
  /** Whole grid as tab-separated text (dock Copy button). */
  function tsv() {
    if (!st.cols) return "";
    var out = [st.cols.map(function (c) { return c.label; }).join("\t")];
    st.rows.forEach(function (row) {
      if (row.kind) return;
      out.push(st.cols.map(function (c) { var tmp = document.createElement("div"); tmp.innerHTML = cellHtml(c, row); return c.type === "check" ? (c.val(row.obj) ? "yes" : "") : tmp.textContent.trim(); }).join("\t"));
    });
    return out.join("\n");
  }

  /* ---------------- loads focus: the plan becomes a strip of the truss being edited ---------------- */
  function focusMode() {
    var main = document.getElementById("main"), strip = document.getElementById("strip");
    if (!main || !strip) return;
    var row = st.act && st.rows && st.rows[rowIndex(st.act.row)];
    var on = TLA.app && TLA.app.step() === 2 && !st.noFocus && !!row && !!row.truss;
    var was = main.classList.contains("focus");
    main.classList.toggle("focus", on); strip.hidden = !on;
    if (on) drawStrip(strip, row.truss, row.obj);
    if (was !== on) window.dispatchEvent(new Event("resize"));
  }
  function drawStrip(box, t, cur) {
    box.textContent = "";
    var head = h("div", { "class": "sh" }, h("b", { text: t.name }), h("span", { "class": "mini", text: U.f("len", t.length, 2) + " · " + t.loads.length + " loads" + (cur && cur.id && cur.distance != null ? " · editing the load at " + P.posLabel(cur, t) : "") }), h("span", { "class": "grow" }),
      h("button", { "class": "lnk", text: "Show plan (Esc)", onclick: function () { st.noFocus = true; focusMode(); if (TLA.app) TLA.app.renderAll(); } }));
    box.appendChild(head);
    var W = 1000, pad = 20, X = function (d) { return pad + d / Math.max(t.length, 1) * (W - pad * 2); };
    var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + W + " 56"); svg.setAttribute("preserveAspectRatio", "none");
    function el(tag, a, txt) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; }
    el("rect", { x: X(0), y: 26, width: X(t.length) - X(0), height: 8, "class": "sb" });
    el("line", { x1: X(t.length / 2), x2: X(t.length / 2), y1: 20, y2: 44, "class": "cl" }); el("text", { x: X(t.length / 2) + 3, y: 53 }, "CL");
    (S.hostedBlocks ? S.hostedBlocks(t.id) : []).forEach(function (b) { var d = TLA.rig.geometry.project(t, TLA.rig.geometry.endPoint(b, b.length / 2)).distance; el("rect", { x: X(d) - 5, y: 25, width: 10, height: 10, "class": "scb" }); });
    t.supports.forEach(function (s) { if (s.kind === "hoist") el("circle", { cx: X(s.distance), cy: 30, r: 5, "class": "sh2" }); });
    t.loads.forEach(function (l) {
      var ds = [[l.distance, false]]; if (P.mirrorAt(l, t)) ds.push([t.length - l.distance, true]);
      ds.forEach(function (d) {
        var on = cur && cur.id === l.id;
        el("path", { d: "M" + (X(d[0]) - 5) + " 9 L" + (X(d[0]) + 5) + " 9 L" + X(d[0]) + " 22 Z", "class": on ? "sa" : "sl" + (d[1] ? " m" : "") });
        el("text", { x: X(d[0]) + 7, y: 16, "class": on ? "a" : "" }, U.n("w", l.weight, 0));
      });
    });
    box.appendChild(svg);
  }

  function mount(store) {
    S = store; P = TLA.panels; h = P.h;
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("paste", onPaste);
    document.addEventListener("copy", onCopy);
    window.addEventListener("resize", closeAc);
  }
  /** Draw the grid for a step (1-3) into the dock. */
  function show(container, step) {
    if (editor && editor.inp && document.activeElement === editor.inp) { st.edit = true; st.typed = editor.inp.value; }
    editor = null;
    var spec = step === 1 ? structure() : step === 2 ? loads() : hoists();
    render(container, spec);
    if (st.pendingMove && st.act) { var pm = st.pendingMove; st.pendingMove = null; moveBy(rowIndex(st.act.row), colIndex(st.act.col), pm[0], pm[1], true, pm[1] ? "tab" : "enter"); [].forEach.call(container.querySelectorAll("td.act"), function (x) { x.classList.remove("act"); }); restoreAct(); }
  }
  function leave() { st.act = null; st.edit = false; editor = null; closeAc(); focusMode(); }

  TLA.grids = {
    mount: mount, show: show, leave: leave, tsv: tsv, focusMode: focusMode, findFixture: findFixture, fixtureSource: fixtureSource, attachFixtureAc: attachFixtureAc, attachAc: attachAc,
    compare: function (v) { if (v === undefined) return st.cmp; st.cmp = !!v; }, showPlan: function (v) { if (v === undefined) return !st.noFocus; st.noFocus = !v; focusMode(); },
    active: function () { return !!st.act; }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
