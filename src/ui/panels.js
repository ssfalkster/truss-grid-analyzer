/* Object inspectors (rig, truss, hoist, corner block, load), rig settings, results views and the elevation diagram. Plain DOM. */
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
    var s = String(str == null ? "" : str).trim().replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/\s*ft\b/i, "'").replace(/\s*in\b/i, '"');
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
      var ti = h("input", { type: "text", inputmode: "text", value: lenText(value), "class": "num " + (opts.cls || ""), title: (opts.title ? opts.title + ". " : "") + (U.metric() ? "Type meters (2.5), or 250 cm / 2500 mm; feet-inches (8'2\") also work" : "Type decimal feet (4.1667) or feet-inches (4-2, 4'2\", 4' 2 1/2\")"), placeholder: opts.placeholder, autocomplete: "off" });
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
  /** What a truss hangs from: the trusses (and corner blocks) it is bolted to, and its own hoists. */
  function hangsFrom(t) {
    var on = [], nh = 0;
    (t.supports || []).forEach(function (s) {
      if (s.kind === "hoist" && s.hangFrom && S.truss(s.hangFrom)) { var c = "hoist below " + S.truss(s.hangFrom).name; if (on.indexOf(c) < 0) on.push(c); }
      else if (s.kind === "hoist") nh++;
      else if (s.kind === "truss") { var o = S.truss(s.onTruss); if (o && on.indexOf(o.name) < 0) on.push(o.name); }
    });
    if (nh) on.push(nh === 1 ? "1 hoist" : nh + " hoists");
    return on.length ? on.join(", ") : "nothing";
  }

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
  var statusText = function (st) { return TLA.limits.statusText(st); };
  function badge(status) {
    var cls = status === "Good" ? "ok" : status === "No Load" || status === "Check" || status === "Slack" ? "warn" : "fail";
    return h("span", { "class": "badge " + cls, text: statusText(status) });
  }

  /** Labels that would overlap go to the next lane (1.25.5): items [{x, w}] (centre and width in drawing units), each
   * gets .lane (0, 1, ...) - the first lane where it clears the label before it by gap. Returns the number of lanes. */
  function lanes(items, gap) {
    var ends = [];
    items.slice().sort(function (a, b) { return a.x - b.x; }).forEach(function (it) {
      var k = 0; while (k < ends.length && it.x - it.w / 2 < ends[k] + gap) k++;
      it.lane = k; ends[k] = it.x + it.w / 2;
    });
    return ends.length;
  }
  /** Rough text width in the drawings' units (a system sans at the given font size). */
  function textW(s, size) { return String(s).length * size * 0.56; }
  /** Sag for the deflection drawing and F7 table: 3 decimals of an inch (a hundredth hid most sags); 0 below that. */
  function deflText(ft) { var v = ft * 12; return U.f("inch", Math.abs(v) < 0.0005 ? 0 : v, 3); }   // metric: mm to 2 decimals
  /** Span over sag, capped: past L/10,000 the ratio says nothing useful (it read L/315697). */
  function ldText(len, sag) { if (!(sag > 1e-9)) return "-"; var r = len / sag; return r >= 10000 ? "L/10,000+" : "L/" + fmt(Math.round(r), 0); }

  /* ---------- elevation diagram of one truss ---------- */
  /** 1.25.5: span lengths are a dimension line above the loads (they sat on the load arrows), and support labels that
   * would overlap drop to a lower lane with a leader line (end bolts and a hoist next to them ran together). */
  function elevation(t, res) {
    var W = 420, pad = 26;
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "elev");
    function add(tag, attrs, txt) {
      var e = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      if (txt != null) e.textContent = txt;
      svg.appendChild(e); return e;
    }
    var L = res.beam.length, sx = (W - pad * 2) / L, X = function (d) { return pad + d * sx; };
    var segs = res.limits.segments, P = res.beam.positions;
    var bounds = [0].concat(P).concat([L]);
    // span dimensions: laid out first, so the drawing grows downward by as many lanes as they need
    var dims = [];
    segs.forEach(function (sg, i) {
      var a = bounds[i], b = bounds[i + 1];
      if (b - a < 1e-9) return;
      var lab = U.mark(b - a, 2) + (sg.code ? " " + statusText(sg.status) : "");
      dims.push({ a: a, b: b, sg: sg, text: lab, x: X((a + b) / 2), w: textW(lab, 10) });
    });
    var nd = lanes(dims, 4), dimY = function (k) { return 12 + (nd - 1 - k) * 11; }, yb = dimY(0) + 58;
    dims.forEach(function (d) {
      var y = dimY(d.lane);
      add("line", { x1: X(d.a), x2: X(d.b), y1: dimY(0) + 4, y2: dimY(0) + 4, "class": "dim" });
      [d.a, d.b].forEach(function (x) { add("line", { x1: X(x), x2: X(x), y1: dimY(0) + 1, y2: dimY(0) + 7, "class": "dim" }); });
      if (d.lane) add("line", { x1: d.x, x2: d.x, y1: y + 2, y2: dimY(0) + 4, "class": "dim lead" });
      add("text", { x: d.x, y: y, "text-anchor": "middle", "class": "et" + (d.sg.code ? " fail" : "") }, d.text);
    });
    // beam body coloured by segment status
    dims.forEach(function (d) { add("rect", { x: X(d.a), y: yb - 6, width: (d.b - d.a) * sx, height: 12, "class": "eb " + (d.sg.code ? "fail" : d.sg.type.indexOf("cant") === 0 ? "cant" : "ok") }); });
    // loads
    res.beam.loads.forEach(function (l) {
      var x = X(l.distance);
      add("path", { d: "M" + x + " " + (yb - 6) + " l -3.5 -8 l 7 0 z", "class": "el" + (l.injected ? " inj" : l.mirrored ? " ghost" : "") });
      if (Math.abs(l.weight) > 0.5) add("text", { x: x, y: yb - 32, "text-anchor": "middle", "class": "et small rot", transform: "rotate(-60 " + x + " " + (yb - 18) + ")" }, U.n("w", l.weight, 0));
    });
    // supports + reactions: value, what, where - one label block per support, in lanes
    var labs = res.supports.map(function (sr) {
      var isH = sr.support.kind === "hoist", what = isH ? "hoist" : "bolted to " + ((S.truss(sr.support.onTruss) || {}).name || "?");
      var val = U.n("w", sr.reaction, 0), at = U.mark(sr.support.distance, 2);
      var w = Math.max(textW(val, 11), textW(what, 9), textW(at, 9)), x0 = X(sr.support.distance);
      return { sr: sr, isH: isH, what: what, val: val, at: at, x0: x0, w: w, x: Math.min(W - 2 - w / 2, Math.max(2 + w / 2, x0)) };
    });
    var nl = lanes(labs, 6), LANE = 38;
    labs.forEach(function (o) {
      var x0 = o.x0, top = yb + 18 + o.lane * LANE;
      add("path", { d: "M" + x0 + " " + (yb + 6) + " l -7 12 l 14 0 z", "class": "es " + (o.isH ? "hoist" : "bear") });
      if (o.lane || Math.abs(o.x - x0) > 1) add("line", { x1: x0, x2: o.x, y1: yb + 19, y2: top + 4, "class": "dim lead" });
      add("text", { x: o.x, y: top + 16, "text-anchor": "middle", "class": "et strong" + (o.sr.reaction < 0 ? " fail" : "") }, o.val);
      add("text", { x: o.x, y: top + 27, "text-anchor": "middle", "class": "et small" }, o.what);
      add("text", { x: o.x, y: top + 38, "text-anchor": "middle", "class": "et small" }, o.at);
    });
    svg.setAttribute("viewBox", "0 0 " + W + " " + (yb + 18 + nl * LANE + 6));
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
      "Sagging moment up. Allowable estimated from the manufacturer's tables" + (d === mb.diagram ? (mb.capacity && mb.capacity.wSelf > 0 ? "; self weight included in the moments and added back into the allowable." : ".") : "; truss self weight left out (turned off for this rig)."));
    return svg;
  }

  /* ---------- 1.18.0: where along a truss it is loaded, reactions, deflection ---------- */
  /** Colour for a local workload: green, through amber at 80%, to red at 100% and over. */
  function heat(u) {
    if (!isFinite(u)) u = 2;
    var st = [[0, [69, 192, 127]], [0.5, [124, 190, 72]], [0.8, [240, 179, 74]], [1, [255, 107, 107]], [1.5, [200, 30, 60]]];
    for (var i = 1; i < st.length; i++) if (u <= st[i][0] || i === st.length - 1) {
      var a = st[i - 1], b = st[i], f = Math.max(0, Math.min(1, (u - a[0]) / (b[0] - a[0])));
      return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(a[1][k] + (b[1][k] - a[1][k]) * f); }).join(",") + ")";
    }
  }
  /** Local workload along a solved truss (1.18.0 hot spots). Each span / cantilever's table check is spread along it
   * in the shape of its bending moment, so the colour peaks under the point load that works it hardest and fades
   * toward the supports (a triangle under one load, a curve under a UDL, the support end of a cantilever); the
   * moment and shear against their allowables are counted too. [[x, u], ...] and the peak. */
  function localWorkload(res) {
    if (!res || !res.limits) return null;
    var L = res.beam.length, P = res.beam.positions || [], segs = res.limits.segments, mb = res.limits.member;
    var bounds = [0].concat(P).concat([L]), zones = [];
    segs.forEach(function (sg, i) { var a = bounds[i], b = bounds[i + 1]; if (b - a > 1e-9 && !sg.skipped) zones.push({ a: a, b: b, u: Math.max(isFinite(sg.utilization) ? sg.utilization : 2, sg.maxLength ? sg.length / sg.maxLength : 0) }); });
    var d = mb && mb.checked, MA = mb && mb.momentAllowed > 0 ? mb.momentAllowed : 0, VA = mb && mb.shearAllowed > 0 ? mb.shearAllowed : 0;
    var pts = d && d.points ? d.points : [], w = (d && d.w) || 0;
    function mv(x) {   // moment and shear at x from the checked diagram (moment is a parabola under the UDL)
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i], n = pts[i + 1];
        if (n && x >= p.x - 1e-9 && x <= n.x + 1e-9) { var dx = x - p.x; return [p.m + p.vr * dx - w * dx * dx / 2, Math.abs(p.vr - w * dx)]; }
      }
      return [0, 0];
    }
    var xs = [0, L]; zones.forEach(function (z) { xs.push(z.a, z.b); });
    pts.forEach(function (p) { xs.push(p.x); });
    (res.beam.loads || []).forEach(function (l) { xs.push(l.distance); });
    for (var k = 1; k < 120; k++) xs.push(L * k / 120);
    xs = xs.filter(function (x) { return x >= 0 && x <= L; }).sort(function (a, b) { return a - b; });
    var M = xs.map(function (x) { return pts.length ? mv(x) : [0, 0]; });
    zones.forEach(function (z) { z.mmax = 0; xs.forEach(function (x, i) { if (x >= z.a - 1e-9 && x <= z.b + 1e-9) z.mmax = Math.max(z.mmax, Math.abs(M[i][0])); }); });
    var out = [], peak = { x: 0, u: 0 };
    xs.forEach(function (x, i) {
      var su = 0;
      zones.forEach(function (z) { if (x >= z.a - 1e-9 && x <= z.b + 1e-9) su = Math.max(su, z.mmax > 1e-9 ? z.u * Math.abs(M[i][0]) / z.mmax : z.u); });
      var u = Math.max(su, MA ? Math.abs(M[i][0]) / MA : 0, VA ? M[i][1] / VA : 0);
      out.push([x, u]); if (u > peak.u + 1e-12) peak = { x: x, u: u };
    });
    var near = (res.beam.loads || []).filter(function (l) { return !l.injected && Math.abs(l.distance - peak.x) < 0.05; })[0];
    peak.load = near ? (near.note || "load") : null;
    return { pts: out, peak: peak, length: L };
  }
  function svgBox(W, H, cls) {
    var svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("class", cls || "elev");
    svg.add = function (tag, a, txt, par) { var e = document.createElementNS(NS, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt != null) e.textContent = txt; (par || svg).appendChild(e); return e; };
    return svg;
  }
  /** A strip under the elevation shaded by local workload, with the peak marked. */
  function heatStrip(t, res) {
    var lw = localWorkload(res); if (!lw) return null;
    var W = 420, pad = 26, L = lw.length || 1, X = function (x) { return pad + x * (W - pad * 2) / L; }, svg = svgBox(W, 48), add = svg.add;
    var gid = "hs-" + t.id + "-" + Math.floor(Math.random() * 1e6), defs = add("defs", {}), gr = add("linearGradient", { id: gid, x1: 0, x2: 1, y1: 0, y2: 0 }, null, defs);
    lw.pts.forEach(function (p) { add("stop", { offset: (p[0] / L).toFixed(4), "stop-color": heat(p[1]) }, null, gr); });
    add("text", { x: pad - 22, y: 10, "class": "et small" }, "Where it works hardest - local workload, peaking under the loads");
    add("rect", { x: X(0), y: 16, width: X(L) - X(0), height: 12, rx: 2, fill: "url(#" + gid + ")" });
    var pk = lw.peak, px = X(pk.x);
    add("path", { d: "M" + px + " 30 l -4 7 l 8 0 z", "class": "el" });
    add("text", { x: px, y: 46, "text-anchor": px > W - 90 ? "end" : px < 90 ? "start" : "middle", "class": "et" + (pk.u > 1 ? " fail" : "") }, "peak " + fmt(pk.u * 100, 0) + "% at " + U.mark(pk.x, 2) + " from the start" + (pk.load ? " (under " + pk.load + ")" : ""));
    return svg;
  }
  /** Reactions at each support: arrows to scale, low hook load at hoists and the force passed at bolted connections. */
  /** 1.26.3: labels that would overlap (an end bolt next to a hoist) stack in lanes with a leader line, as in the
   * elevation (1.25.5) - upward reactions' labels above the axis, downward ones' below. */
  function reactionsDiagram(t, res) {
    var W = 420, pad = 26, L = res.beam.length || 1, X = function (x) { return pad + x * (W - pad * 2) / L; }, STEP = 24;
    var mx = res.supports.reduce(function (m, sr) { return Math.max(m, Math.abs(sr.reaction || 0)); }, 0) || 1;
    var labs = res.supports.map(function (sr) {
      var r = sr.reaction || 0, val = U.n("w", r, 0), name = sr.support.kind === "hoist" ? "hoist" : ((S.truss(sr.support.onTruss) || {}).name || "bolt");
      var w = Math.max(textW(val, 11), textW(name, 9)), x0 = X(sr.support.distance);
      return { sr: sr, r: r, up: r >= 0, val: val, name: name, x0: x0, w: w, x: Math.min(W - 2 - w / 2, Math.max(2 + w / 2, x0)) };
    });
    labs.forEach(function (o) { o.len = 8 + 28 * Math.abs(o.r) / mx; });
    var nUp = lanes(labs.filter(function (o) { return o.up; }), 6), nDn = lanes(labs.filter(function (o) { return !o.up; }), 6);
    // each side's labels sit on the side the other kind of arrow points to: clear any such arrow they would cross
    function base(side) {
      var b = side ? 14 : 16;
      labs.forEach(function (o) { if (o.up !== side) return; labs.forEach(function (a) { if (a.up !== side && Math.abs(o.x - a.x0) < o.w / 2 + 4) b = Math.max(b, a.len + 16); }); });
      return b;
    }
    var bUp = base(true), bDn = base(false);
    var yb = Math.max(50, 26 + bUp + STEP * Math.max(0, nUp - 1)), H = Math.max(yb + 44, nDn ? yb + bDn + 17 + STEP * (nDn - 1) : 0);
    var svg = svgBox(W, H), add = svg.add;
    add("text", { x: pad - 22, y: 10, "class": "et small" }, "Reactions (" + U.unit("w") + "): hoists = low hook load, bolts = force passed to the carrier");
    add("line", { x1: X(0), x2: X(L), y1: yb, y2: yb, "class": "axis" });
    labs.forEach(function (o) {
      var x = o.x0, len = o.len, isH = o.sr.support.kind === "hoist", col = isH ? "var(--accent)" : "var(--ink-2)";
      if (o.up) { add("line", { x1: x, x2: x, y1: yb + 8, y2: yb + 2 + len, stroke: col, "stroke-width": 2 }); add("path", { d: "M" + x + " " + (yb + 2) + " l -4 7 l 8 0 z", fill: col }); }
      else { add("line", { x1: x, x2: x, y1: yb - 8, y2: yb - 2 - len, stroke: "var(--fail)", "stroke-width": 2 }); add("path", { d: "M" + x + " " + (yb - 2) + " l -4 -7 l 8 0 z", fill: "var(--fail)" }); }
      var yv = o.up ? yb - bUp - STEP * o.lane : yb + bDn + STEP * o.lane, yn = o.up ? yv + 10 : yv + 11;
      if (o.lane || Math.abs(o.x - x) > 1 || (o.up ? bUp > 14 : bDn > 16)) add("line", { x1: x, x2: o.x, y1: o.up ? yb - 2 : yb + 4, y2: o.up ? yn + 2 : yv - 10, "class": "dim lead" });
      add("text", { x: o.x, y: yv, "text-anchor": "middle", "class": "et strong" + (o.r < 0 ? " fail" : "") }, o.val);
      add("text", { x: o.x, y: yn, "text-anchor": "middle", "class": "et small" }, o.name);
    });
    return svg;
  }
  /** Deflected shape from the whole-rig analysis (exaggerated), each span's sag against its limit. */
  function deflectionDiagram(t, res) {
    var dc = res.deflection; if (!dc || !res.memberForces) return null;
    var worstSpan = dc.spans.slice().sort(function (a, b) { return b.util - a.util; })[0], m = worstSpan ? worstSpan.model : res.model;
    var mf = res.memberForces[m], d = mf && mf.defl; if (!d || !d.length) return null;
    var W = 420, pad = 26, L = res.beam.length || 1, X = function (x) { return pad + x * (W - pad * 2) / L; }, y0 = 42;
    // span labels in lanes (1.25.5): short end spans ran into their neighbours
    var labs = dc.spans.map(function (sp) { var s = deflText(sp.max) + " (" + ldText(sp.length, sp.max) + ")"; return { sp: sp, text: s, x: X((sp.from + sp.to) / 2), w: textW(s, 10) }; });
    var nl = Math.max(1, lanes(labs, 6)), H = y0 + 38 + (nl - 1) * 12 + 20;
    var svg = svgBox(W, H, "elev forces"), add = svg.add;
    var mx = d.reduce(function (a, p) { return Math.max(a, Math.abs(p[1])); }, 0) || 1e-9, sc = 22 / mx;
    add("text", { x: pad - 22, y: 10, "class": "et small" }, "Deflection, exaggerated (whole-rig analysis, " + TLA.grillage.MODEL_LABEL[m] + ")");
    add("line", { x1: X(0), x2: X(L), y1: y0, y2: y0, "class": "axis", "stroke-dasharray": "3 3" });
    add("path", { d: "M" + d.map(function (p) { return X(p[0]).toFixed(1) + " " + (y0 - p[1] * sc).toFixed(1); }).join(" L"), fill: "none", stroke: worstSpan && worstSpan.util > 1 ? "var(--fail)" : "var(--accent)", "stroke-width": 2 });
    (res.beam.positions || []).forEach(function (x) { add("path", { d: "M" + X(x) + " " + (y0 + 4) + " l -5 8 l 10 0 z", "class": "es hoist" }); });
    labs.forEach(function (o) {
      var y = y0 + 32 + o.lane * 12, x = Math.min(W - 2 - o.w / 2, Math.max(2 + o.w / 2, o.x));
      if (o.lane || Math.abs(x - o.x) > 1) add("line", { x1: o.x, x2: x, y1: y0 + 14, y2: y - 9, "class": "dim lead" });
      add("text", { x: x, y: y, "text-anchor": "middle", "class": "et" + (o.sp.util > 1 ? " fail" : "") }, o.text);
    });
    add("text", { x: W / 2, y: H - 4, "text-anchor": "middle", "class": "et small" }, "Limit L/" + dc.ratio + " (" + (dc.source === "maker" ? "maker's data sheet - past it fails" : "rig default, the maker publishes none - past it warns") + "), sag from the line between the supports. Estimate.");
    return svg;
  }

  /* ---------- inspector ---------- */
  /** Hoists and bolted connections of a truss, edited in place. only = "truss": the bolted connections alone. */
  function supportsTable(container, t, res, db, only) {
    if (!only) container.appendChild(h("div", { "class": "row-btns" }, h("button", { "class": "primary", text: "+ Add hoist", title: "Add a hoist in the middle of this truss, then set its position", onclick: function () { S.addHoist(t.id); } })));
    var stbl = h("table", { "class": "tbl sup" });
    stbl.appendChild(h("thead", null, h("tr", null, h("th", { text: "At (" + U.unit("len") + ") from" }), h("th", { text: "Type" }), h("th", { text: "Detail" }), h("th", { text: "Load" }), h("th"))));
    var tb = h("tbody");
    t.supports.forEach(function (s, i) {
      if (only && s.kind !== only) return;
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
        detail.appendChild(numInput(s.dlf || "", function (v) { s.dlf = v > 0 ? v : undefined; S.commit(); }, { cls: "w50", placeholder: fmt(auto, 3), title: "Dynamic load factor. Blank = from the hoist speed (speed in fpm / 60 + 1; 16 fpm = 4.9 m/min = 1.267), or the default in Rig settings if the speed is unknown. Now " + fmt(auto, 3) }));
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
    var custom = h("input", { type: "text", "class": "num w50", placeholder: U.unit("len"), title: U.metric() ? "A stick of another length: meters (1.5), cm or mm" : "A stick of another length: decimal feet or feet-inches (2-6)" });
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
    card.title = "A corner block is part of the truss: add it at the start, the end, or after a run of truss. Other trusses then bolt to it at 90 degrees.";
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
    var atVal = h("input", { type: "text", "class": "num w60", placeholder: U.unit("len"), title: U.metric() ? "Distance of the block center: meters (3.8), cm or mm" : "Distance of the block center: decimal feet or feet-inches (4-2)" });
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

  /* ---------- object inspectors (1.18.0): rig, truss, hoist, corner block, load ---------- */
  function sel(o) { if (S.select) S.select(o || {}); else { S.sel = { truss: o && o.truss || null, support: o && o.support || null, load: o && o.load || null }; S.emit(); } }
  /** Link to the maker's own load table / data sheet (the truss entry's url), opened in a new tab (1.18.0). */
  function makerLink(x, text) {
    if (!x || !x.url) return null;
    return h("a", { href: x.url, target: "_blank", rel: "noopener noreferrer", "class": "mklink", title: "Opens the maker's own document in a new tab: " + x.url, text: (text || "maker's load table") + " ↗" });
  }
  /** A warning's text, and the maker's document it comes from when it has one (1.26.4). */
  function warnBody(w) {
    var a = w.link ? makerLink(w.link, w.link.text) : null;
    if (a) a.addEventListener("click", function (e) { e.stopPropagation(); });
    return a ? [U.text(w.message) + " ", a] : U.text(w.message);
  }
  function stSpan(cls, text) { return h("span", { "class": "st " + cls, text: text }); }
  function trussVerdict(res) {
    if (!res) return ["mut", "Not solved"];
    var st = TLA.plan.trussStatus(res);
    return st.bad ? (st.util >= 1 ? ["fail", "Overloaded"] : ["warn", "Check"]) : st.util >= 0.8 ? ["warn", "OK - high"] : ["ok", "OK"];
  }
  function crumb(parts, kind) {
    var c = h("div", { "class": "crumb" });
    parts.forEach(function (p, i) {
      if (i) c.appendChild(document.createTextNode("›"));
      c.appendChild(p[1] ? h("a", { text: p[0], onclick: p[1] }) : h("span", { text: p[0] }));
    });
    c.appendChild(h("span", { "class": "kind", text: kind }));
    return c;
  }
  function insHead(titleCtl, status, meta, acts) {
    return h("div", { "class": "ins-head" }, h("div", { "class": "t" }, titleCtl, status),
      meta && meta.length ? h("div", { "class": "meta" }, meta) : null, acts && acts.length ? h("div", { "class": "acts" }, acts) : null);
  }
  function barRow(name, u, title) {
    var ok = u != null && isFinite(u), cls = !ok ? "" : u > 1 + 1e-9 ? " f" : u >= 0.8 ? " w" : "";
    return [h("span", { "class": "n", text: name, title: title }), h("div", { "class": "bar" + cls }, h("i", { style: "width:" + (ok ? Math.min(100, u * 100) : 0) + "%" })),
      h("span", { "class": "v", text: u == null ? "-" : ok ? fmt(u * 100, 0) + "%" : "no table" })];
  }
  function wlCell(u) {
    if (u == null || !isFinite(u)) return h("span", { "class": "mini", text: "-" });
    return h("div", { "class": "wl" }, h("div", { "class": "bar" + (u > 1 ? " f" : u >= 0.8 ? " w" : "") }, h("i", { style: "width:" + Math.min(100, u * 100) + "%" })), h("span", { text: fmt(u * 100, 0) + "%" }));
  }
  function hoistRes(sid) { return (S.results.hoists || []).filter(function (x) { return x.support === sid; })[0] || null; }
  function hoistDb(id) { return S.db().hoists.filter(function (q) { return q.id === id; })[0] || null; }
  function hoistName(hd) { return hd ? (hd.brand ? hd.brand + " " : "") + String(hd.description).trim() + " " + hd.capacity_label : "-"; }
  /** What holds a support up: its hoist model, or (1.22.0) "Dead hang" and its rope. */
  function supportName(s) {
    if (!s.dead) return hoistName(hoistDb(s.hoistId));
    var r = TLA.limits.rope(s.rope);
    return "Dead hang, " + (r ? r.name : Number(s.wll) > 0 ? "rope by WLL" : "no rope set");
  }
  function posLabel(item, t) {
    var v = S.measureDisplay(item, t.length), ref = item.from === "center" ? " from CL" : item.from === "end" ? " from end" : "";
    return (item.from === "center" && v > 0 ? "+" : "") + U.n("len", v, 3) + " " + U.unit("len") + ref;
  }

  /* loads: weight = item + clamp. One load per point - every load has its own position (no quantity). */
  function loadParts(l) {
    if (typeof l.fixtureLb === "number") return { each: l.fixtureLb, clamp: Number(l.clampLb) || 0 };
    return { each: Number(l.weight) || 0, clamp: 0 };
  }
  function setLoadParts(l, p) {
    var each = Math.max(0, Number(p.each) || 0), clamp = Math.max(0, Number(p.clamp) || 0);
    delete l.qty;
    if (typeof l.fixtureLb === "number" || clamp) { l.fixtureLb = each; l.clampLb = clamp; }
    l.weight = Math.round((each + clamp) * 1000) / 1000;
  }
  /** Put a library fixture on a load: name, weight and (where the library has one) clamp weight. */
  function applyFixture(l, f) {
    l.note = f.manufacturer + " " + f.fixture; l.fixtureLb = f.weight_lb; l.clampLb = f.clamp_lb || 0;
    setLoadParts(l, { each: f.weight_lb, clamp: f.clamp_lb || 0 });
    if (!l.cat) l.cat = "lighting";                     // the fixture library is lighting (1.22.0 load categories)
  }
  /** Where the mirrored twin of a load sits (null when it has none). */
  function mirrorAt(l, t) {
    if (!l.mirror || Math.abs(l.distance - t.length / 2) < 1e-7) return null;
    var tw = { distance: t.length - l.distance, from: l.from };
    return posLabel(tw, t);
  }
  function newLoad(t, extra) {
    var l = S.applyMeasure(Object.assign({ id: S.newId("l"), distance: round(t.length / 2), weight: 0, note: "", mirror: false }, extra || {}), t);
    t.loads.push(l); return l;
  }
  /** Quick add (1.18.0): "MAC Aura @ 4", "120 lb @ -6". Position in the truss's measuring reference. */
  function quickAdd(t, text) {
    var s = String(text || "").trim(); if (!s) return "Type a fixture or a weight.";
    var at = null, m = s.match(/^(.*?)\s*@\s*(.+)$/);
    if (m) { at = parseShownLen(m[2]); if (!isFinite(at)) return "Could not read the position \"" + m[2] + "\"."; s = m[1].trim(); }
    var wm = s.match(/^(-?\d*\.?\d+)\s*(lb|lbs|kg)?$/i), l;
    if (wm) {
      var w = parseFloat(wm[1]); if (wm[2] && /kg/i.test(wm[2]) && !U.metric()) w = w / U.LB_KG; else if (!wm[2] || /kg/i.test(wm[2])) w = U.back("w", w);
      l = newLoad(t, { note: "Load" }); setLoadParts(l, { each: w, clamp: 0 });
    } else {
      var f = TLA.grids && TLA.grids.findFixture(s);
      if (!f) return "No fixture matches \"" + s + "\" - type its weight instead (e.g. 45 lb).";
      l = newLoad(t); applyFixture(l, f);
    }
    if (at != null) S.measureSet(l, at, t.length);
    S.sel = { truss: t.id, support: null, load: l.id };
    S.commit();
    return null;
  }

  function trussInspector(root, t, res, db) {
    var truss = db.trusses.filter(function (x) { return x.id === t.trussId; })[0] || (t.custom || null);
    var mfrs = [];
    db.trusses.forEach(function (x) { if (mfrs.indexOf(x.manufacturer) < 0) mfrs.push(x.manufacturer); });
    var vd = trussVerdict(res), nH = t.supports.filter(function (x) { return x.kind === "hoist"; }).length;
    root.appendChild(crumb([["Rig", function () { sel({}); }], [t.name]], "truss"));
    var quickBox;
    root.appendChild(insHead(textInput(t.name, function (v) { t.name = v || t.name; S.commit(); }, "title-input"), stSpan(vd[0], vd[1]),
      [h("b", { text: truss ? truss.manufacturer + " " + String(truss.description).trim() : "custom truss" }), h("span", { text: U.f("len", t.length, 2) }), h("span", { text: "Hangs from: " + hangsFrom(t) })],
      [h("button", { text: "+ Hoist", title: "Add a hoist in the middle of this truss", onclick: function () { var sp = S.addHoist(t.id); if (sp) sel({ truss: t.id, support: sp.id }); } }),
       h("button", { text: "+ Load", title: "Add a load: type a fixture or weight in the Loads section", onclick: function () { var d = root.querySelector('[data-grp="loads"]'); if (d) { d.open = true; } if (quickBox) { quickBox.focus(); quickBox.scrollIntoView({ block: "center" }); } } }),
       h("button", { text: "Bolt to…", title: "Then click a corner block on the plan", onclick: function () { startPick({ kind: "block", truss: t.id }); } }),
       h("button", { "class": S.ui.connected === t.id ? "on" : "", text: "Connected", title: "Show on the plan everything joined to this truss - bolted, stacked, or hung on a hoist below it - and dim the rest (to spot a part that is not connected)", onclick: function () { S.ui.connected = S.ui.connected === t.id ? null : t.id; S.emit(); } }),
       h("span", { "class": "grow" }),
       t.anchor ? null : h("button", { "class": "ghost icon", text: "⟳", title: "Rotate 90° (R)", onclick: function () { t.angle = ((t.angle || 0) + 90) % 360; S.commit(); } }),
       h("button", { "class": "ghost", text: "Duplicate", onclick: function () { S.duplicateTruss(t.id); } }),
       h("button", { "class": "ghost danger", text: "Delete", onclick: function () { if (confirm("Delete " + t.name + "?")) S.removeTruss(t.id); } })]));
    root.appendChild(h("div", { "class": "grp-tools" },
      h("button", { "class": "lnk", text: "Collapse all", onclick: function () { setAllGroups(root, false); } }),
      h("button", { "class": "lnk", text: "Expand all", onclick: function () { setAllGroups(root, true); } })));

    // 1. the truss itself
    var c = group(root, "truss", "Truss", true, truss ? U.f("wpl", truss.weight_per_ft_lb, 2) + " · span " + U.f("len", truss.max_span_ft, 0) : "");
    var cur = truss || {};
    c.appendChild(h("div", { "class": "grid2" },
      field("Manufacturer", select(mfrs.map(function (m) { return { value: m, label: m }; }), cur.manufacturer, function (v) { var first = modelsOf(db.trusses, v)[0]; if (first) { t.trussId = first.id; S.commit(); } })),
      field("Model", select(modelsOf(db.trusses, cur.manufacturer, t.trussId).map(function (x) { return { value: x.id, label: trussLabel(x) }; }), t.trussId, function (v) { t.trussId = parseInt(v, 10); S.commit(); }))));
    if (truss) c.appendChild(h("div", { "class": "sub", title: trussSource(truss) }, "Max span " + U.f("len", truss.max_span_ft, 1) + " · max cantilever " + U.f("len", truss.max_span_ft / 4, 1) + " · " + (typeof truss.derate === "number" ? truss.derate + " derate (generic data)" : truss.repetitive_use ? "repetitive-use data (no 0.85 derate)" : "0.85 repetitive-use derate") + " · ", h("span", { "class": "mini", text: trussSource(truss) }), truss.url ? [" ", makerLink(truss)] : null));
    c.appendChild(h("div", { "class": "grid3" },
      field("Truss pieces (" + U.unit("len") + ")", (t.layout && t.layout.manual) || Array.isArray(t.pieces) ? h("input", { type: "text", "class": "num", value: lenText(t.pieceLength), disabled: true, title: "Set by the pieces / segments below" }) : numInput(t.pieceLength != null ? t.pieceLength : t.length, function (v) { t.pieceLength = Math.max(0.5, v); S.commit(); }, { ft: true, title: "Total length of the truss sections in this line, before corner blocks" })),
      field("UDL (" + U.unit("w") + ")", numInput(t.wallWeight, function (v) { t.wallWeight = v; S.commit(); }, { q: "w", title: "UDL (uniformly distributed load): total weight spread evenly over the full length, e.g. a drape or LED wall" })),
      field("Measure from", select([{ value: "start", label: "start" }, { value: "center", label: "centerline" }, { value: "end", label: "end" }], t.measure || "start", function (v) { t.measure = v; S.commit(); }), "")));
    var rigCable = Number(S.rig.settings && S.rig.settings.cablePerFt) || 0, cab = TLA.rig.cableOf(t, S.rig.settings);
    c.appendChild(h("div", { "class": "grid3" },
      field("Cable (" + U.unit("wpl") + ")", cableInput(t, rigCable))));
    if (cab > 0) c.appendChild(h("div", { "class": "sub", text: "Cable allowance " + U.f("wpl", cab, 2) + " x " + U.f("len", t.length, 2) + " = " + U.f("w", cab * t.length, 1) + ", added to the UDL" + (Number(t.wallWeight) ? " (" + U.f("w", t.wallWeight, 1) + " typed)" : "") + "." }));
    c.appendChild(h("div", { "class": "linelen" },
      h("span", null, U.f("len", t.pieceLength != null ? t.pieceLength : t.length, 3) + " truss"),
      h("span", null, " + " + U.f("len", t.blocksAdded || 0, 3) + " corner blocks = "), h("b", { text: U.f("len", t.length, 3) + " whole line" }),
      t.layout && t.layout.manual ? null : h("label", { "class": "mini check", title: "Add the length of every corner block in this line to the truss pieces" }, h("input", { type: "checkbox", checked: t.addBlocks !== false, onchange: function (e) { t.addBlocks = e.target.checked; S.commit(); } }), "add block lengths")));
    if (!(t.layout && t.layout.manual)) {
      if (Array.isArray(t.pieces)) {
        c.appendChild(h("div", { "class": "layout" }, h("h4", { text: "Truss built from pieces" }),
          pieceBuilder(t, t.pieces, { add: function (len) { S.addLinePiece(t, len); }, remove: function (j) { S.removeLinePiece(t, j); }, insert: function (j) { var r = S.addBlockToLine(t.id, S.ui.blockTypeId || S.blockFor(t), { seg: 0, piece: j }); if (typeof r === "string") alert(U.text(r)); } }),
          h("div", { "class": "row-btns" }, h("button", { text: "Type a length instead", onclick: function () { S.typeLineLength(t); } }))));
      } else {
        c.appendChild(h("div", { "class": "row-btns" }, h("button", { text: "Build from pieces…", title: "Assemble this stick from the standard truss lengths (8', 6', 4'...)", onclick: function () { S.startLinePieces(t); } })));
      }
    }

    // 2. corner blocks in the line
    var nBlk = t.layout && t.layout.order ? t.layout.order.length : S.hostedBlocks ? S.hostedBlocks(t.id).length : 0;
    c = group(root, "blocks", "Corner blocks", false, nBlk ? nBlk + " in this line" : "none - add one here");
    layoutEditor(c, t);

    // 3. placement / bolting
    c = group(root, "place", "Placement", true, t.anchor ? "bolted" : "free");
    if (t.anchor && t.anchor.reverse) {
      var yr = S.truss(t.anchor.reverse.truss);
      c.appendChild(h("div", { "class": "sentence" }, "Pulled onto ", h("b", { text: yr ? yr.name : "another truss" }), " (bolted through its own corner block): position and angle follow it.",
        h("div", { "class": "row-btns" }, h("button", { text: "Flip side", onclick: function () { S.flipBolt(t.id); } }), h("button", { "class": "ghost", text: "Unbolt", onclick: function () { S.unbolt(t.id); } }))));
    } else if (t.anchor) {
      var ab = S.truss(t.anchor.block), dir = S.boltDirection(t.id);
      c.appendChild(h("div", { "class": "sentence" }, "Bolted to ", h("b", { text: ab ? ab.name : "a corner block" }),
        t.anchor.mode === "through" ? " (the block is along this truss)" : [" at its " + (t.anchor.mode === "start" ? "start" : "end") + ", extends ", h("b", { text: dir ? dir : "to the " + S.boltSide(t.id) })],
        ". Position and angle follow the block.",
        h("div", { "class": "row-btns" },
          t.anchor.mode !== "through" ? h("button", { text: "Flip side", title: "Swing this truss across to the other side of the truss that carries the block", onclick: function () { S.flipBolt(t.id); } }) : null,
          t.anchor.mode !== "through" ? h("button", { text: "Bolt other end", title: "Swap which end of this truss meets the block", onclick: function () { S.swapBoltEnd(t.id); } }) : null,
          h("button", { "class": "ghost", text: "Unbolt", onclick: function () { S.unbolt(t.id); } }))));
    } else {
      c.appendChild(h("div", { "class": "sub", text: "Free: type its plan position, drag it on the plan, or bolt it to a corner block." }));
    }
    c.appendChild(h("div", { "class": "grid3" },
      field("Plan X (" + U.unit("len") + ")", t.anchor ? lockedInput(t.x) : numInput(t.x, function (v) { t.x = v; S.commit(); }, { ft: true })),
      field("Plan Y (" + U.unit("len") + ")", t.anchor ? lockedInput(t.y) : numInput(t.y, function (v) { t.y = v; S.commit(); }, { ft: true })),
      field("Angle (deg)", t.anchor ? lockedInput(t.angle) : numInput(t.angle, function (v) { t.angle = v; S.commit(); }))));
    var blocks = S.rig.trusses.filter(function (o) { return o.isBlock && o.host !== t.id; });
    var others = S.rig.trusses.filter(function (o) { return o.id !== t.id && !o.isBlock; });
    c.appendChild(h("h4", { text: "Bolt to a corner block" }));
    c.appendChild(h("div", { "class": "row-btns" },
      h("button", { "class": "primary", text: "Bolt to…", disabled: !blocks.length, title: blocks.length ? "Then click a corner block on the plan" : "No corner blocks on other trusses yet", onclick: function () { startPick({ kind: "block", truss: t.id }); } }),
      select([{ value: "auto", label: "end: automatic" }, { value: "start", label: "its start meets the block" }, { value: "end", label: "its end meets the block" }, { value: "through", label: "the block is along it" }], S.ui.boltMode || "auto", function (v) { S.ui.boltMode = v; S.persist(); }),
      select([{ value: "auto", label: "direction: automatic" }, { value: "north", label: "extends north" }, { value: "south", label: "extends south" }, { value: "east", label: "extends east" }, { value: "west", label: "extends west" }], S.ui.boltSide || "auto", function (v) { S.ui.boltSide = v; S.persist(); })));
    if (others.length) {
      var stackOn = select(others.map(function (o) { return { value: o.id, label: o.name }; }), others[0].id, function () {});
      var mountSel = select([{ value: "above", label: "sits above" }, { value: "below", label: "clamped below" }], S.ui.mount || "above", function (v) { S.ui.mount = v; S.persist(); });
      c.appendChild(h("h4", { text: "Stack or clamp at one point" }));
      c.appendChild(h("div", { "class": "row-btns" }, mountSel, stackOn, h("button", { text: "Add", title: "Support this truss where the two centerlines cross", onclick: function () { var err = S.addCrossingSupport(t.id, stackOn.value, S.ui.mount || "above"); if (err) alert(U.text(err)); } })));
    }

    // 4. loads
    c = group(root, "loads", "Loads", true, t.loads.length ? t.loads.length + " · " + U.f("w", t.loads.reduce(function (a, l) { return a + (Number(l.weight) || 0) * (mirrorAt(l, t) ? 2 : 1); }, 0), 1) : "none");
    if (t.loads.length) {
      var lt = h("table", { "class": "tbl click" }, h("thead", null, h("tr", null, h("th", { text: "At" }), h("th", { text: "Item" }), h("th", { "class": "r", text: "Total (" + U.unit("w") + ")" }), h("th", { text: "Mirror" }))));
      var lb = h("tbody");
      t.loads.forEach(function (l) {
        var p = loadParts(l), mt = mirrorAt(l, t);
        lb.appendChild(h("tr", { "class": S.sel.load === l.id ? "sel" : "", onclick: function () { sel({ truss: t.id, load: l.id }); } },
          h("td", { "class": "mono", text: posLabel(l, t) }), h("td", { text: l.note || "load" }), h("td", { "class": "r", text: U.n("w", l.weight, 1) }), h("td", { "class": "mini", text: mt ? "✓ " + mt : "" })));
      });
      lt.appendChild(lb); c.appendChild(lt);
    }
    quickBox = h("input", { type: "text", placeholder: "Add: fixture or weight, e.g. MAC Aura @ 4  ·  120 lb @ -6", style: "flex:1;min-width:0", autocomplete: "off" });
    var qMsg = h("div", { "class": "mini" });
    function goQuick() { var err = quickAdd(t, quickBox.value); if (err) { qMsg.textContent = err; quickBox.classList.add("bad"); } }
    quickBox.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); goQuick(); } });
    if (TLA.grids && TLA.grids.attachFixtureAc) TLA.grids.attachFixtureAc(quickBox, { quick: true });
    c.appendChild(h("div", { "class": "row-btns" }, quickBox, h("button", { text: "Add", onclick: goQuick })));
    c.appendChild(qMsg);
    if (t.loads.length) c.appendChild(h("div", { "class": "row-btns" },
      h("button", { "class": "lnk", text: "Mirror all", title: "Mirror every load on this truss about its centerline", onclick: function () { t.loads.forEach(function (l) { l.mirror = true; }); S.commit(); } }),
      h("button", { "class": "lnk", text: "Copy to truss…", onclick: function () { copyLoadsPrompt(t); } }),
      h("button", { "class": "lnk", text: "Sort by position", onclick: function () { S.sortLoads(t.id); } }),
      h("button", { "class": "lnk", text: "Edit all loads in the grid", onclick: function () { if (TLA.app) TLA.app.setStep(2); } }),
      h("button", { "class": "lnk", text: "Clear all", onclick: function () { if (confirm("Remove all " + t.loads.length + " loads from " + t.name + "? (Undo brings them back.)")) S.clearLoads(t.id); } })));
    if (res && res.injected.length) c.appendChild(h("div", { "class": "sub", text: "Also carrying: " + res.injected.map(function (i) { return U.f("w", i.weight, 0) + " from " + i.note.replace("from ", "") + " at " + U.mark(i.distance, 2); }).join("; ") }));

    // 5. hoists and bolted connections
    var nB = t.supports.length - nH;
    c = group(root, "supports", "Hoists & connections", true, nH + " hoist" + (nH === 1 ? "" : "s") + (nB ? " · " + nB + " bolted" : ""));
    if (nH) {
      var ht = h("table", { "class": "tbl click" }, h("thead", null, h("tr", null, h("th", { text: "At" }), h("th", { text: "Hoist" }), h("th", { "class": "r", text: "High hook" }), h("th", { "class": "r", text: "Workload" }), h("th", { text: "Status" }))));
      var hb = h("tbody");
      t.supports.forEach(function (s) {
        if (s.kind !== "hoist") return;
        var x = hoistRes(s.id), hd = hoistDb(s.hoistId);
        hb.appendChild(h("tr", { onclick: function () { sel({ truss: t.id, support: s.id }); } },
          h("td", { "class": "mono", text: posLabel(s, t) }), h("td", { text: s.dead ? supportName(s) : hd ? String(hd.description).trim() + " " + hd.capacity_label : "-" }),
          h("td", { "class": "r", text: x ? U.n("w", x.hoist.staticLoad, 0) : "-" }),
          h("td", null, x && x.hoist.capacity < 999999 ? wlCell(x.hoist.staticLoad / x.hoist.capacity) : h("span", { "class": "mini", text: "-" })),
          h("td", null, x ? badge(x.hoist.status) : null)));
      });
      ht.appendChild(hb); c.appendChild(ht);
    }
    c.appendChild(h("div", { "class": "row-btns" }, h("button", { text: "+ Hoist", onclick: function () { var sp = S.addHoist(t.id); if (sp) sel({ truss: t.id, support: sp.id }); } }),
      nH ? h("button", { "class": "lnk", text: "Mirror all", title: "Add a hoist at the mirrored spot of every hoist on this truss (about its centerline), with the same model, chain, hardware and level offset", onclick: function () { mirrorHoistsUi(t); } }) : null,
      nH ? h("button", { "class": "lnk", text: "Copy to truss…", title: "Copy every hoist on this truss to another truss, keeping each one's distance from the center", onclick: function () { copyHoistsPrompt(t); } }) : null,
      h("button", { "class": "lnk", text: "Edit all hoists in the grid", onclick: function () { if (TLA.app) TLA.app.setStep(3); } })));
    if (nB) { c.appendChild(h("h4", { text: "Bolted connections" })); supportsTable(c, t, res, db, "truss"); }

    // 6. checks
    c = group(root, "result", "Checks", true, res ? (TLA.plan.trussStatus(res).bad ? "see warnings" : "all pass") : "not solved");
    if (res) {
      c.appendChild(h("div", { "class": "elev-wrap" }, elevation(t, res)));
      var hs = heatStrip(t, res);
      if (hs) c.appendChild(h("div", { "class": "elev-wrap" }, hs));
      c.appendChild(h("div", { "class": "elev-wrap" }, reactionsDiagram(t, res)));
      var fd = forceDiagrams(res);
      if (fd) c.appendChild(h("div", { "class": "elev-wrap" }, fd));
      var dd = deflectionDiagram(t, res);
      if (dd) c.appendChild(h("div", { "class": "elev-wrap" }, dd));
      if (res.deflection) c.appendChild(h("div", { "class": "sub" }, "Deflection limit L/" + res.deflection.ratio + ": ",
        res.deflection.source === "maker" ? [res.deflection.note + " ", makerLink(res.dbTruss, "see the data sheet")] : "the rig default - " + (res.dbTruss && res.dbTruss.url ? "the maker's table states no limit " : "no maker's limit on record "), res.deflection.source !== "maker" && res.dbTruss && res.dbTruss.url ? makerLink(res.dbTruss) : null));
      var segs = res.limits.segments.filter(function (s) { return !s.skipped; });
      var spans = segs.filter(function (s) { return s.type === "span"; }), cants = segs.filter(function (s) { return s.type !== "span"; });
      function worst(list, f) { return list.length ? list.reduce(function (m, s) { return Math.max(m, f(s)); }, 0) : null; }
      var mbr = res.limits.member;
      c.appendChild(h("div", { "class": "checks" },
        barRow("Span load", worst(spans, function (s) { return s.utilization; }), "Worst span: its point loads as a share of the table capacity for that span (less any UDL)"),
        barRow("Cantilever", worst(cants, function (s) { return Math.max(s.utilization, s.maxLength ? s.length / s.maxLength : 0); }), "Worst cantilever: load against the table, or length against a quarter of the maximum span"),
        barRow("Moment", mbr ? mbr.momentUtil : null, "Largest bending moment against the allowable estimated from the tables"),
        barRow("Shear", mbr ? mbr.shearUtil : null, "Largest shear against the allowable estimated from the tables"),
        res.deflection ? barRow("Deflection", res.deflection.util, "Worst span sag against span/" + res.deflection.ratio + (res.deflection.source === "maker" ? " - the maker's published limit: past it the truss fails" : " - rig default (the maker publishes none): past it is a warning")) : null));
      var chips = h("div", { "class": "chips" }, h("span", { "class": "chip", text: "Total " + U.f("w", res.beam.totalLoad, 0) }), h("span", { "class": "chip", text: "Derate " + res.limits.derate }));
      if (res.model) chips.appendChild(h("span", { "class": "chip", title: "The diagram, reactions and span checks shown are from the whole-rig analysis with " + TLA.grillage.MODEL_LABEL[res.model] + ", the joint model that loads this truss hardest", text: "Checked with " + TLA.grillage.MODEL_LABEL[res.model] }));
      else if (S.results.primary === "load-path") chips.appendChild(h("span", { "class": "chip", text: "Load-path method only" }));
      c.appendChild(chips);
    } else {
      c.appendChild(h("div", { "class": "note fail", text: "Not solved: it depends on a load-path loop or a missing truss/support. See the warnings." }));
    }

    // 7. advanced
    c = group(root, "adv", "Advanced", false, "height, width, stiffness");
    c.appendChild(h("div", { "class": "grid3" },
      field("Height (" + U.unit("len") + ")", numInput(t.z || 0, function (v) { t.z = v; S.commit(); }, { ft: true, title: "3D view only: raises this truss above the others" })),
      field("Width (" + U.unit("inch") + ")", numInput(t.widthIn || Math.round(TLA.rig.widthIn(t, (S.results.trusses[t.id] || {}).dbTruss) * 100) / 100, function (v) { t.widthIn = v > 0 ? v : undefined; S.commit(); }, { q: "inch", title: "Drawn width in the plan and 3D views. Taken from the truss type; type here to override" })),
      field("Stiffness (x)", numInput(t.eiScale || 1, function (v) { t.eiScale = v > 0 ? v : 1; S.commit(); }, { title: "Bending, shear and torsion stiffness relative to this truss type's estimate; used only by the whole-rig analysis" }))));
    c.appendChild(h("label", { "class": "cbline" }, h("input", { type: "checkbox", checked: t.weightless, onchange: function (e) { t.weightless = e.target.checked; S.commit(); } }), h("span", { text: "Weightless (leave out this truss's self weight)" })));
    var sec = res && res.section;
    if (sec) c.appendChild(h("div", { "class": "sub", title: sec.source === "tables" ? "Estimated from the manufacturer's tables. Real chord and diagonal sizes in the truss data replace this." : "From the truss data's section sizes." },
      "Stiffness: EI " + (U.v("ei", sec.EI * 144)).toExponential(2) + " " + U.unit("ei") + ", GA " + U.v("w", sec.GA).toExponential(2) + " " + U.unit("w") + ", GJ " + (U.v("ei", sec.GJ * 144)).toExponential(2) + " " + U.unit("ei") + " (" + sec.shape + ", " + TLA.section.MAT[sec.material].label + ", " +
      (sec.source === "tables" ? "estimated from the tables" : sec.source === "section" ? "from section data" : sec.source) + (sec.scale !== 1 ? ", x" + sec.scale : "") + ")"));
  }
  function copyLoadsPrompt(t) {
    var others = S.rig.trusses.filter(function (o) { return o.id !== t.id && !o.isBlock; });
    if (!others.length) { alert("There is no other truss to copy to."); return; }
    var name = prompt("Copy all " + t.loads.length + " loads from " + t.name + " to which truss? (keeps each load's distance from the center)\n\n" + others.map(function (o) { return o.name; }).join(", "), others[0].name);
    if (!name) return;
    var dst = others.filter(function (o) { return o.name.toLowerCase() === name.trim().toLowerCase(); })[0];
    if (!dst) { alert("No truss called \"" + name + "\"."); return; }
    var r = S.copyLoads(t.id, [], dst.id);
    if (r && r.clamped) alert(r.clamped + " load(s) were past the end of " + dst.name + " and were placed at its end.");
  }
  /** Mirror hoists (ids, or all) about the centerline (1.23.0); says what was left out. Returns the new hoists. */
  function mirrorHoistsUi(t, ids) {
    var r = S.mirrorHoists(t.id, ids);
    if (!r) return [];
    if (!r.added.length) alert(ids && ids.length === 1 ? "Nothing added: this hoist is on the centerline or already has a hoist at its mirrored spot." : "Nothing added: every hoist is on the centerline or already has a hoist at its mirrored spot.");
    else if (r.skipped) alert("Added " + r.added.length + " mirrored hoist(s). " + r.skipped + " left out: on the centerline or a hoist is already at the mirrored spot.");
    return r.added;
  }
  /** Copy hoists (ids, or all) to another truss (1.23.0), keeping each one's distance from the centre. */
  function copyHoistsPrompt(t, ids) {
    var others = S.rig.trusses.filter(function (o) { return o.id !== t.id && !o.isBlock; });
    if (!others.length) { alert("There is no other truss to copy to."); return; }
    var n = ids && ids.length ? ids.length : t.supports.filter(function (s) { return s.kind === "hoist"; }).length;
    var name = prompt("Copy " + (n === 1 && ids && ids.length ? "this hoist" : "all " + n + " hoists") + " from " + t.name + " to which truss? (keeps each hoist's distance from the center, its model, chain, hardware and level offset)\n\n" + others.map(function (o) { return o.name; }).join(", "), others[0].name);
    if (!name) return;
    var dst = others.filter(function (o) { return o.name.toLowerCase() === name.trim().toLowerCase(); })[0];
    if (!dst) { alert("No truss called \"" + name + "\"."); return; }
    var r = S.copyHoists(t.id, ids || [], dst.id), msg = [];
    if (!r) return;
    if (r.clamped) msg.push(r.clamped + " hoist(s) were past the end of " + dst.name + " and were placed at its end.");
    if (r.skipped) msg.push(r.skipped + " hoist(s) left out: " + dst.name + " already has a hoist there.");
    if (msg.length) alert((r.copied ? "Copied " + r.copied + " hoist(s) to " + dst.name + ". " : "Nothing copied. ") + msg.join(" "));
  }

  function hoistInspector(root, t, s, res, db) {
    var x = hoistRes(s.id), hd = s.dead ? null : hoistDb(s.hoistId), hoists = t.supports.filter(function (q) { return q.kind === "hoist"; }), k = hoists.indexOf(s), noun = s.dead ? "Dead hang" : "Hoist";
    var wll = s.dead ? TLA.limits.deadHangWll(s, S.rig.settings) : 0;
    root.appendChild(crumb([["Rig", function () { sel({}); }], [t.name, function () { sel({ truss: t.id }); }], [noun + " @ " + posLabel(s, t)]], "hoist"));
    root.appendChild(insHead(textInput(s.name, function (v) { s.name = v; S.commit(); }, "title-input", noun + " " + (k + 1) + " on " + t.name), x ? badge(x.hoist.status) : null,
      [h("b", { text: supportName(s) }), hd && hd.capacity_lb < 999999 ? h("span", { text: U.f("w", hd.capacity_lb, 0) + " capacity" }) : null, hd && hd.speed_fpm ? h("span", { text: U.f("speed", hd.speed_fpm, 0) }) : null,
        s.dead ? h("span", { text: wll > 0 ? U.f("w", wll, 0) + " WLL" : "no WLL" }) : null],
      [h("button", { "class": "icon", text: "‹", title: "Previous hoist on this truss", disabled: k <= 0, onclick: function () { sel({ truss: t.id, support: hoists[k - 1].id }); } }),
       h("button", { "class": "icon", text: "›", title: "Next hoist on this truss", disabled: k >= hoists.length - 1, onclick: function () { sel({ truss: t.id, support: hoists[k + 1].id }); } }),
       h("span", { "class": "grow" }),
       h("button", { "class": "ghost", text: "Mirror", title: "Add the same " + noun.toLowerCase() + " at " + posLabel({ distance: t.length - s.distance, from: s.from }, t) + " (mirrored about the centerline)", onclick: function () { var a = mirrorHoistsUi(t, [s.id]); if (a.length) sel({ truss: t.id, support: a[0].id }); } }),
       h("button", { "class": "ghost", text: "Copy to…", title: "Copy this " + noun.toLowerCase() + " to another truss, keeping its distance from the center", onclick: function () { copyHoistsPrompt(t, [s.id]); } }),
       h("button", { "class": "ghost danger", text: "Delete hoist", onclick: function () { S.removeSupport(t.id, s.id); } })]));
    var c = group(root, "hres", "Result", true, x && x.hoist.capacity < 999999 ? fmt(x.hoist.staticLoad / x.hoist.capacity * 100, 0) + "% workload" : "");
    if (x) {
      var hot = x.trim && x.hoist.capacity < 999999 && Math.abs(x.trim.self) > 0.1 * x.hoist.capacity;
      c.appendChild(h("div", { "class": "big" },
        h("div", null, h("b", { text: U.n("w", x.hoist.reaction, 1) }), h("span", { text: "low hook, " + U.unit("w") + " (the truss on the hook)" })),
        h("div", { "class": x.hoist.status !== "Good" ? "f" : "" }, h("b", { text: U.n("w", x.hoist.staticLoad, 1) }), h("span", { text: "high hook static, " + U.unit("w") })),
        h("div", { "class": x.hoist.dynamicOver ? "w" : "" }, h("b", { text: U.n("w", x.hoist.dynamicLoad, 1) }), h("span", { text: "high hook dynamic, " + U.unit("w") + " (x" + fmt(x.hoist.dynamicFactor, 3) + ")" }))));
      if (x.hoist.capacity < 999999) c.appendChild(h("div", { "class": "checks" }, barRow("Workload", x.hoist.staticLoad / x.hoist.capacity, "High hook static / capacity")));
      if (x.level) c.appendChild(h("div", { "class": "sub" + (x.level.low < 0 ? " hotline" : "") }, "Out of level ±" + U.f("inch", x.level.tol * 12, 2) + " (Rig settings): up to ", h("b", { text: "+" + U.f("w", x.level.add, 0) }), " on this hoist - included in its high hook load; on the low side " + U.f("w", x.level.low, 0) + (x.level.low < 0 ? ", so it could go slack." : ".")));
      if (x.trim) c.appendChild(h("div", { "class": "sub" + (hot ? " hotline" : "") }, "Level sensitivity: ", h("b", { text: "±" + U.f("w", Math.abs(x.trim.self), 0) }), " if this hoist runs 1/4\" (6 mm) high or low" + (x.trim.other ? "; " + x.trim.other.name + " changes by " + U.f("w", x.trim.other.lb, 0) : "") + (hot ? " - more than 10% of its capacity: level it carefully." : ".")));
      var ms = S.results.measured && S.results.measured.hoists[t.id + ":" + s.id], lowCell = S.rig.settings && S.rig.settings.cellReads === "low";
      c.appendChild(h("div", { "class": "grid2" }, field("Load cell reading (" + U.unit("w") + ")", (function () {
        var i = h("input", { type: "number", step: "any", min: 0, "class": "num", value: s.measured != null && s.measured !== "" ? Math.round(U.v("w", s.measured) * 10) / 10 : "", placeholder: "none", title: "What a load cell on this hoist reads (" + (lowCell ? "between the hoist and the truss: compared with the low hook load" : "above the hoist: compared with the high hook static load") + " - set in Rig settings). Blank = no reading." });
        i.addEventListener("change", function () { var v = parseFloat(i.value); if (i.value.trim() === "" || !(v >= 0)) delete s.measured; else s.measured = U.back("w", v); S.commit(); });
        return i;
      })())));
      if (ms && ms.diff !== null) c.appendChild(h("div", { "class": "sub" + (Math.abs(ms.diff) > TLA.rig.MEAS_TOL ? " hotline" : "") }, "Measured " + U.f("w", ms.measured, 0) + " against " + U.f("w", ms.calc, 0) + " calculated (" + (lowCell ? "low hook" : "high hook static") + "): ", h("b", { text: TLA.rig.pctText(ms.diff) }), ". One hoist can differ a lot on a rig that shares load (level, stiffness) - compare the assembly's total in the rig panel."));
      var a = TLA.grillage.attribution(S.rig, S.results, S.db(), t.id, s.id);
      if (a) {
        c.appendChild(h("table", { "class": "tbl" }, h("thead", null, h("tr", null, h("th", { text: "Where the load comes from" }), h("th", { "class": "r", text: U.unit("w") }))), h("tbody", null,
          a.parts.filter(function (p) { return Math.abs(p.weight) >= 0.05; }).map(function (p) { return h("tr", null, h("td", { text: p.name + (p.truss === t.id ? " (self weight)" : "") }), h("td", { "class": "r", text: U.n("w", p.weight, 1) })); }),
          x.level ? h("tr", null, h("td", { text: "Out-of-level allowance (±" + U.f("inch", x.level.tol * 12, 2) + ")" }), h("td", { "class": "r", text: U.n("w", x.level.add, 1) })) : null,
          x.hoist.added ? h("tr", null, h("td", { text: "Add " + S.rig.settings.addPercent + "%" }), h("td", { "class": "r", text: U.n("w", x.hoist.added, 1) })) : null,
          (Number(s.hardwareWeight) || 0) ? h("tr", null, h("td", { text: "Hardware" }), h("td", { "class": "r", text: U.n("w", s.hardwareWeight, 1) })) : null,
          h("tr", null, h("td", { text: s.dead ? "Rope" : "Hoist + chain" }), h("td", { "class": "r", text: U.n("w", a.hoistChain, 1) })),
          h("tr", null, h("td", null, h("b", { text: "High hook load (static)" })), h("td", { "class": "r" }, h("b", { text: U.n("w", a.staticLoad, 1) }))))));
        c.appendChild(h("div", { "class": "sub", text: a.model === "load-path" ? "Load-path method (whole-rig analysis not available)." : "Whole-rig analysis, " + TLA.grillage.MODEL_LABEL[a.model] + " (the joint model that loads this hoist most)." }));
      }
    }
    c = group(root, "hoist", s.dead ? "Dead hang" : "Hoist", true, "");
    c.appendChild(field("Support", select([{ value: "hoist", label: "Chain hoist" }, { value: "dead", label: "Dead hang (wire rope, no hoist)" }], s.dead ? "dead" : "hoist", function (v) { setDead(s, v === "dead"); S.commit(); }), "span3"));
    if (s.dead) {
      var sf = TLA.limits.ropeFactor(S.rig.settings);
      c.appendChild(field("Rope", select([{ value: "", label: "not in the list - WLL typed below" }].concat(TLA.limits.ROPES.map(function (r) { return { value: r.id, label: r.name + " - WLL " + U.f("w", r.mbs_lb / sf, 0) }; })), s.rope || "", function (v) { s.rope = v || undefined; S.commit(); }), "span3"));
      c.appendChild(h("div", { "class": "grid3" },
        field("Rope (" + U.unit("len") + ")", numInput(s.ropeLength || 0, function (v) { s.ropeLength = Math.max(0, v); S.commit(); }, { ft: true, title: "Rope length, for its weight (and its stretch when the rig's hoists are springs)" })),
        field("Assembly WLL (" + U.unit("w") + ")", numInput(Number(s.wll) > 0 ? s.wll : "", function (v) { s.wll = v > 0 ? v : undefined; S.commit(); }, { q: "w", placeholder: "rope", title: "The WLL of the weakest part of the assembly (shackles, fittings); caps the rope's WLL" })),
        field("Hardware (" + U.unit("w") + ")", numInput(s.hardwareWeight || 0, function (v) { s.hardwareWeight = v; S.commit(); }, { q: "w", title: "Hardware weight (shackles, beam clamp, spanset...)" }))));
      c.appendChild(h("div", { "class": "grid3" },
        field("Dyn. factor", numInput(s.dlf || "", function (v) { s.dlf = v > 0 ? v : undefined; S.commit(); }, { placeholder: "1.000 static", title: "A dead hang does not move: 1.0 unless you type a factor" }))));
      var rp = TLA.limits.rope(s.rope);
      c.appendChild(h("div", { "class": "sub" + (wll > 0 ? "" : " hotline") }, wll > 0 ? "WLL " + U.f("w", wll, 0) + (rp ? " = min(" + rp.name + " breaking strength " + U.f("w", rp.mbs_lb, 0) + " / " + sf + (Number(s.wll) > 0 ? ", assembly " + U.f("w", s.wll, 0) : "") + ")" : " (typed)") + ". Design factor " + sf + ":1 is set in Rig settings; breaking strengths are typical catalog values - check your rope's certificate."
        : "Pick the rope or type the assembly WLL - without one this dead hang is Overloaded."));
    } else {
      var hsel = select(db.hoists.map(function (q) { return { value: q.id, label: hoistName(q) + (U.metric() && q.capacity_lb < 999999 ? " (" + U.f("w", q.capacity_lb, 0) + ")" : "") + " " + U.f("speed", q.speed_fpm, 0) }; }), s.hoistId, function (v) { s.hoistId = parseInt(v, 10); S.commit(); });
      c.appendChild(field("Model", hsel, "span3"));
      var auto = x ? x.hoist.dynamicFactor : 1.25;
      c.appendChild(h("div", { "class": "grid3" },
        field("Chain (" + U.unit("len") + ")", numInput(s.chainLength || 0, function (v) { s.chainLength = Math.max(0, v); S.commit(); }, { ft: true })),
        field("Dyn. factor", numInput(s.dlf || "", function (v) { s.dlf = v > 0 ? v : undefined; S.commit(); }, { placeholder: s.dlf ? "auto" : "auto " + fmt(auto, 3), title: "Blank = from the hoist speed (fpm / 60 + 1), or the rig default if the speed is unknown" })),
        field("Hardware (" + U.unit("w") + ")", numInput(s.hardwareWeight || 0, function (v) { s.hardwareWeight = v; S.commit(); }, { q: "w", title: "Hardware weight at this hoist (shackles, spansets, beam clamp...)" }))));
    }
    c = group(root, "hpos", "Position", true, "on " + t.name);
    c.appendChild(h("div", { "class": "grid2" }, field("At (" + U.unit("len") + ") from", posCell(s, t.length)), field("Hangs from", hangSelect(t, s))));
    c.appendChild(h("div", { "class": "grid2" }, field("Level offset (" + U.unit("inch") + ")", numInput(Number(s.level) || "", function (v) { s.level = v ? v : undefined; S.commit(); }, { q: "inch", placeholder: "0 = level", title: "Hung on purpose higher (+) or lower (-) than the other hoists' level - a designed trim or rake. The whole-rig analysis solves the rig with this hoist's point moved by that much." }))));
    c.appendChild(h("div", { "class": "sub", text: "= " + U.f("len", s.distance, 3) + " from the start of " + t.name + " (" + U.f("len", t.length, 2) + "). Drag the hoist on the plan to move it in 1\" (2 cm) steps." }));
    var hp = hangInfo(t, s);
    if (hp) c.appendChild(h("div", { "class": "sub" + (hp.off ? " hotline" : "") }, "Hung below ", h("b", { text: hp.name }), ": its chain hooks on " + U.f("len", hp.distance, 2) + " from the start of " + hp.name +
      (hp.off ? " - but the hoist is not under it on the plan; move the hoist or the truss." : ". " + hp.name + " carries this hoist's high hook load, and is checked with the high hook dynamic load.")));
  }

  /** A truss's own cable allowance (1.22.0): blank = the rig's, 0 = none (so not numInput, which reads blank as 0). */
  function cableInput(t, rigCable) {
    var own = t.cablePerFt != null && t.cablePerFt !== "";
    var i = h("input", { type: "number", step: "any", min: 0, "class": "num", value: own ? Math.round(U.v("wpl", t.cablePerFt) * 10000) / 10000 : "", placeholder: rigCable ? "rig " + U.n("wpl", rigCable, 2) : "none",
      title: "Cable weight per length of this truss, added to its UDL. Blank = the rig's cable allowance (Rig settings); 0 = no cable on this truss." });
    i.addEventListener("change", function () { var v = parseFloat(i.value); t.cablePerFt = i.value.trim() === "" || !(v >= 0) ? undefined : U.back("wpl", v); S.commit(); });
    return i;
  }
  /** Turn a hoist into a dead hang (a 3/8" GAC rope as long as its chain) or back. */
  function setDead(s, on) {
    if (on) { s.dead = true; if (!s.rope && !(Number(s.wll) > 0)) s.rope = "gac-3/8"; if (s.ropeLength == null) s.ropeLength = s.chainLength || 0; s.dlf = undefined; }
    else delete s.dead;
  }
  /** Where a hoist hangs: the structure (the usual), or below another truss (1.22.0). */
  function hangSelect(t, s) {
    var opts = [{ value: "", label: "the structure" }].concat(S.rig.trusses.filter(function (o) { return o.id !== t.id && !o.isBlock; }).map(function (o) { return { value: o.id, label: "below " + o.name }; }));
    return select(opts, s.hangFrom || "", function (v) { s.hangFrom = v || undefined; S.commit(); });
  }
  function hangInfo(t, s) {
    if (!s.hangFrom) return null;
    var byId = {}; S.rig.trusses.forEach(function (o) { byId[o.id] = o; });
    var hp = TLA.rig.hangPoint(byId, t, s);
    return hp ? { name: byId[hp.truss].name, distance: hp.distance, off: hp.off } : null;
  }

  function loadInspector(root, t, l) {
    var i = t.loads.indexOf(l), p = loadParts(l), mt = mirrorAt(l, t);
    root.appendChild(crumb([["Rig", function () { sel({}); }], [t.name, function () { sel({ truss: t.id }); }], ["Load @ " + posLabel(l, t)]], "load"));
    root.appendChild(insHead(textInput(l.note, function (v) { l.note = v; S.commit(); }, "title-input", "load"), null,
      [h("b", { text: U.f("w", l.weight, 1) + (mt ? " ×2 (mirrored)" : "") }), h("span", { text: "on " + t.name })],
      [h("button", { "class": "icon", text: "‹", disabled: i <= 0, onclick: function () { sel({ truss: t.id, load: t.loads[i - 1].id }); } }),
       h("button", { "class": "icon", text: "›", disabled: i >= t.loads.length - 1, onclick: function () { sel({ truss: t.id, load: t.loads[i + 1].id }); } }),
       h("span", { "class": "grow" }),
       h("button", { "class": "ghost", text: "Duplicate", onclick: function () { var cpy = S.duplicateLoad(t.id, l.id); if (cpy) sel({ truss: t.id, load: cpy.id }); } }),
       h("button", { "class": "ghost danger", text: "Delete", onclick: function () { t.loads.splice(i, 1); S.sel = { truss: t.id, support: null, load: null }; S.commit(); } })]));
    var c = group(root, "load", "Load", true, "");
    var fx = h("input", { type: "text", value: l.note || "", placeholder: "Fixture, e.g. MAC Aura", autocomplete: "off" });
    if (TLA.grids && TLA.grids.attachFixtureAc) TLA.grids.attachFixtureAc(fx, { onPick: function (f) { applyFixture(l, f); S.commit(); } });
    fx.addEventListener("change", function () { if (fx.value !== l.note) { l.note = fx.value; S.commit(); } });
    c.appendChild(field("Item / fixture", fx, "span3"));
    function part(k) { return function (v) { var q = loadParts(l); q[k] = v; setLoadParts(l, q); S.commit(); }; }
    c.appendChild(h("div", { "class": "grid3" },
      field("Weight (" + U.unit("w") + ")", numInput(p.each, part("each"), { q: "w" })),
      field("Clamp (" + U.unit("w") + ")", numInput(p.clamp, part("clamp"), { q: "w" }))));
    c.appendChild(h("div", { "class": "sub" }, "Total ", h("b", { text: U.f("w", l.weight, 1) }), mt ? " - plus the same again mirrored at " + mt : ""));
    var lfac = TLA.rig.loadFactor(l, S.rig.settings);
    c.appendChild(h("div", { "class": "grid3" }, field("Category", select(TLA.rig.LOAD_CATS.map(function (x) { return { value: x[0], label: x[1] }; }), l.cat || "other", function (v) { l.cat = v === "other" ? undefined : v; S.commit(); }))));
    if (lfac !== 1) c.appendChild(h("div", { "class": "sub", text: "Load factor " + lfac + " for this category (Rig settings): the trusses and hoists carry " + U.f("w", l.weight * lfac, 1) + (mt ? " at each position" : "") + "." }));
    c.appendChild(field("Note", textInput(l.comment, function (v) { l.comment = v || undefined; S.commit(); }, "", "e.g. SR 1/2, cable pick"), "span3"));
    c = group(root, "lpos", "Position", true, "on " + t.name);
    c.appendChild(h("div", { "class": "grid2" }, field("At (" + U.unit("len") + ") from", posCell(l, t.length))));
    c.appendChild(h("label", { "class": "cbline" }, h("input", { type: "checkbox", checked: !!l.mirror, onchange: function (e) { l.mirror = e.target.checked; S.commit(); } }),
      h("span", { text: "Mirror about the centerline" + (Math.abs(l.distance - t.length / 2) < 1e-7 ? " (it is on the centerline, so no twin)" : " - adds the same load at " + posLabel({ distance: t.length - l.distance, from: l.from }, t)) })));
  }

  /** Which plan direction (north/east/south/west) a truss leaves a block in. */
  function faceOf(b, o) {
    var G = TLA.rig.geometry, c = G.endPoint(b, b.length / 2), a = G.endPoint(o, 0), z = G.endPoint(o, o.length);
    var far = Math.hypot(a.x - c.x, a.y - c.y) > Math.hypot(z.x - c.x, z.y - c.y) ? a : z;
    var dx = far.x - c.x, dy = far.y - c.y;
    return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "e" : "w") : (dy >= 0 ? "n" : "s");
  }
  function blockInspector(root, t, res) {
    var db = S.db(), b = res && res.block, type = db.corners.filter(function (c) { return c.id === t.blockTypeId; })[0];
    var host = S.truss(t.host || (t.attach && t.attach.b));
    root.appendChild(crumb([["Rig", function () { sel({}); }], host ? [host.name, function () { sel({ truss: host.id }); }] : ["?"], [t.name]], "corner block"));
    var full = b && b.waysAvailable && b.waysUsed > b.waysAvailable;
    root.appendChild(insHead(textInput(t.name, function (v) { t.name = v || t.name; S.commit(); }, "title-input"), b ? stSpan(full ? "fail" : "ok", full ? "Too many faces" : "OK") : null,
      [type ? h("b", { text: (type.manufacturer.indexOf("James Thomas") === 0 ? "JTE" : type.manufacturer) + " " + type.family + " · " + type.name }) : null, b ? h("span", { text: U.f("w", b.weight, 1) }) : null, h("span", { text: "part of " + (host ? host.name : "a truss") })],
      [h("button", { "class": "primary", text: "Bolt a truss here…", title: "Then click the truss on the plan", onclick: function () { startPick({ kind: "truss", block: t.id }); } }),
       h("span", { "class": "grow" }),
       host && t.host === host.id ? h("button", { "class": "ghost danger", text: "Remove from " + host.name, onclick: function () { S.removeTruss(t.id); } }) : null]));
    // faces
    var conns = [], occ = { n: [], e: [], s: [], w: [] };
    S.rig.trusses.forEach(function (o) { o.supports.forEach(function (s) { if (s.kind === "truss" && s.onTruss === t.id) conns.push(o); }); });
    if (host) { var fh = faceOf(t, host); occ[fh].push(host.name); var opp = { n: "s", s: "n", e: "w", w: "e" }[fh], G = TLA.rig.geometry, cc = G.endPoint(t, t.length / 2), ha = G.endPoint(host, 0), hz = G.endPoint(host, host.length);
      if (Math.min(Math.hypot(ha.x - cc.x, ha.y - cc.y), Math.hypot(hz.x - cc.x, hz.y - cc.y)) > t.length) occ[opp].push(host.name); }
    conns.forEach(function (o) { occ[faceOf(t, o)].push(o.name + (o.anchor && o.anchor.block === t.id && o.anchor.mode !== "through" ? " (" + o.anchor.mode + ")" : "")); });
    var c = group(root, "faces", "Faces", true, b ? b.waysUsed + (b.waysAvailable ? " of " + b.waysAvailable : "") + " used" : "");
    var fcs = h("div", { "class": "faces" }, h("div", { "class": "blk2", text: t.name }));
    [["n", "north"], ["e", "east"], ["s", "south"], ["w", "west"]].forEach(function (f) {
      var who = occ[f[0]];
      fcs.appendChild(who.length ? h("span", { "class": "fc used " + f[0], title: who.join(", "), text: who.join(", ") })
        : h("button", { "class": "fc free " + f[0], text: "+ " + f[1], title: "Bolt a truss to the " + f[1] + " face: then click the truss on the plan", onclick: function () { startPick({ kind: "truss", block: t.id, side: f[1] }); } }));
    });
    c.appendChild(fcs);
    c.appendChild(h("div", { "class": "sub", text: "Plan directions (north = up the plan). Click a free face, then the truss to bolt there." + (b && b.waysAvailable ? " The block has " + b.waysAvailable + " ways (3D faces included)." : "") }));
    c = group(root, "blk", "Block", true, "");
    c.appendChild(field("Block type", blockTypeSelect(t.blockTypeId, function (v) { t.blockTypeId = v; t.variant = undefined; var ty = db.corners.filter(function (x) { return x.id === v; })[0]; if (ty) t.length = S.blockLength(ty); S.commit(); })));
    if (type && type.variants) {
      var vi = typeof t.variant === "number" ? t.variant : Math.floor(type.variants.length / 2);
      c.appendChild(field("Hardware fitted", select(type.variants.map(function (v, i) { return { value: i, label: v[0] + " - " + U.f("w", v[1], 1) }; }), vi, function (v) { t.variant = parseInt(v, 10); S.commit(); })));
    }
    c.appendChild(h("div", { "class": "grid3" },
      field("Weight override (" + U.unit("w") + ")", numInput(typeof t.weightOverride === "number" ? t.weightOverride : "", function (v) { t.weightOverride = v > 0 ? v : undefined; S.commit(); }, { q: "w", title: "Leave blank to use the published weight", placeholder: b ? U.n("w", b.weight, 1) : "" })),
      field("Height (" + U.unit("len") + ")", numInput(t.z || 0, function (v) { t.z = v; S.commit(); }, { ft: true }))));
    if (type) c.appendChild(h("div", { "class": "sub" }, (type.family.indexOf(type.manufacturer.split(" ")[0]) === 0 ? "" : type.manufacturer + " ") + type.family + (type.code ? " - " + type.code : "") + ". ", type.notes ? type.notes + ". " : "", type.source ? h("a", { href: type.source, target: "_blank", rel: "noopener", text: "Source" }) : null));
    if (type && type.weight_lb == null && !type.variants && type.base_lb == null) c.appendChild(h("div", { "class": "note fail", text: "The maker does not publish a weight for this block - enter your own above." }));
    if (res && res.injected.length) { c = group(root, "carry", "Carrying", true, ""); c.appendChild(h("div", { "class": "sub", text: res.injected.map(function (i) { return U.f("w", i.weight, 0) + " from " + i.note.replace("from ", ""); }).join("; ") })); }
    c = group(root, "bsup", "Supports", false, t.supports.length ? t.supports.length + " (hoists and bolts)" : "none");
    supportsTable(c, t, res, db);
  }

  function rigInspector(root) {
    var trs = S.rig.trusses.filter(function (x) { return !x.isBlock; }), nb = S.rig.trusses.length - trs.length, r = S.results;
    var warns = r.warnings.filter(function (w) { return w.level !== "note"; });
    root.appendChild(crumb([["Rig"]], "rig"));
    root.appendChild(insHead(textInput(S.rig.name, function (v) { S.rig.name = v || S.rig.name; S.commit(); }, "title-input"),
      trs.length ? (r.hoists.some(function (x) { return x.hoist.status !== "Good"; }) || trs.some(function (t) { var rr = r.trusses[t.id]; return !rr || TLA.plan.trussStatus(rr).bad; }) ? stSpan("fail", "Check") : stSpan("ok", "OK")) : null,
      [h("b", { text: trs.length + " truss" + (trs.length === 1 ? "" : "es") }), h("span", { text: nb + " corner block" + (nb === 1 ? "" : "s") }), h("span", { text: r.totals.count + " hoists" }), h("span", { text: U.f("w", r.totals.staticLoad, 0) + " high hook static" }), warns.length ? h("span", { style: "color:var(--warn)", text: warns.length + " warning" + (warns.length === 1 ? "" : "s") }) : null],
      [h("button", { "class": "primary", text: "+ Truss", onclick: function () { S.addTruss({ hoists: [] }); } }), h("span", { "class": "grow" }), h("button", { "class": "ghost", text: "⚙ Rig settings", onclick: function () { if (TLA.app) TLA.app.openSettings(); } })]));
    if (!trs.length) {
      root.appendChild(h("div", { "class": "empty" }, h("p", { text: "No trusses yet. Add one, or load the example box from the File menu. Build all the trusses first (step 1), then put the loads on (step 2), then place the hoists (step 3)." }),
        h("button", { "class": "primary", text: "+ Truss", onclick: function () { S.addTruss({ hoists: [] }); } })));
      return;
    }
    // 1.22.0: load-cell readings against the calculation, per assembly
    var mss = r.measured;
    if (mss && mss.any) {
      var mc = group(root, "measured", "Measured vs calculated", true, mss.assemblies.some(function (a) { return a.over; }) ? "differs" : "within " + Math.round(mss.tol * 100) + "%");
      mc.appendChild(h("table", { "class": "tbl" }, h("thead", null, h("tr", null, h("th", { text: "Assembly" }), h("th", { "class": "r", text: "Cells" }), h("th", { "class": "r", text: "Measured" }), h("th", { "class": "r", text: "Calculated" }), h("th", { "class": "r", text: "Diff." }))),
        h("tbody", null, mss.assemblies.map(function (a) {
          return h("tr", null, h("td", { text: a.names.join(", ") }), h("td", { "class": "r", text: a.n + "/" + a.of }), h("td", { "class": "r", text: U.n("w", a.measured, 0) }), h("td", { "class": "r", text: U.n("w", a.calc, 0) }),
            h("td", { "class": "r" }, h("span", { "class": a.over ? "st w" : "", text: a.diff === null ? "-" : TLA.rig.pctText(a.diff) })));
        }))));
      mc.appendChild(h("div", { "class": "sub", text: "Load cells read the " + (mss.reads === "low" ? "low hook load (between hoist and truss)" : "high hook static load (above the hoist)") + " - Rig settings. Flagged past " + Math.round(mss.tol * 100) + "% for an assembly's total; single hoists can differ more on a rig that shares load." }));
    }
    // 1.22.0: the check-rig list - input mistakes, found on every change (click one to select what it is about)
    var chk = r.warnings.filter(function (w) { return w.kind === "check"; });
    var c = group(root, "check", "Check rig", chk.some(function (w) { return w.level === "check"; }), chk.length ? chk.length + " to look at" : "nothing found");
    if (chk.length) {
      var ul = h("ul", { "class": "warnings checklist" });
      chk.forEach(function (w) {
        ul.appendChild(h("li", { "class": w.level === "note" ? "note" : "", title: "Click to select", onclick: function () { if (w.truss) sel({ truss: w.truss, support: w.support || null, load: w.load || null }); } }, U.text(w.message)));
      });
      c.appendChild(ul);
    } else c.appendChild(h("div", { "class": "sub", text: "No input mistakes found: every load has a weight, no two hoists share a point, every bolted assembly has at least 3 hoists not in a line, bolted ends meet, and trusses that cross are joined." }));
    c = group(root, "outline", "Outline", true, "click to select");
    var ol = h("div", { "class": "outline" });
    trs.forEach(function (t) {
      var rr = r.trusses[t.id], vd = trussVerdict(rr), nh = t.supports.filter(function (s) { return s.kind === "hoist"; });
      var db = rr && rr.dbTruss;
      ol.appendChild(h("div", { "class": "o", onclick: function () { sel({ truss: t.id }); } }, h("span", { "class": "ic", text: "▸" }), h("b", { text: t.name }),
        h("span", { "class": "mini", text: (db ? db.manufacturer + " " + String(db.description).trim() : "") + " · " + U.mark(t.length, 1) }), h("span", { "class": "r" }, stSpan(vd[0], nh.length + " hoist" + (nh.length === 1 ? "" : "s")))));
      (S.hostedBlocks ? S.hostedBlocks(t.id) : []).forEach(function (b) {
        var bolted = S.rig.trusses.filter(function (o) { return o.supports.some(function (s) { return s.kind === "truss" && s.onTruss === b.id; }); }).map(function (o) { return o.name; });
        ol.appendChild(h("div", { "class": "o l2", onclick: function () { sel({ truss: b.id }); } }, h("span", { "class": "ic", text: "■" }), b.name, h("span", { "class": "r", text: bolted.length ? bolted.join(", ") : "free" })));
      });
      nh.forEach(function (s) {
        var x = hoistRes(s.id);
        ol.appendChild(h("div", { "class": "o l2", onclick: function () { sel({ truss: t.id, support: s.id }); } }, h("span", { "class": "ic", text: s.dead ? "●" : "○" }), (s.dead ? "Dead hang @ " : "Hoist @ ") + posLabel(s, t), h("span", { "class": "r", text: x ? U.f("w", x.hoist.staticLoad, 0) : "" })));
      });
      if (t.loads.length) ol.appendChild(h("div", { "class": "o l2", onclick: function () { sel({ truss: t.id }); if (TLA.app) TLA.app.setStep(2); } }, h("span", { "class": "ic", text: "▾" }), t.loads.length + " load" + (t.loads.length === 1 ? "" : "s"),
        h("span", { "class": "r", text: U.f("w", t.loads.reduce(function (a, l) { return a + (Number(l.weight) || 0) * (mirrorAt(l, t) ? 2 : 1); }, 0), 1) })));
    });
    c.appendChild(ol);
    c = group(root, "rset", "Rig settings", true, "");
    var st = S.rig.settings || {};
    c.appendChild(h("div", { "class": "sub", text: "Default dynamic factor " + (typeof st.defaultDlf === "number" ? st.defaultDlf : 1.25) + " (hoists with a speed use speed / 60 + 1) · Add " + (Number(st.addPercent) || 0) + "% · hoist stiffness " + (Number(st.hoistStiffness) > 0 ? U.f("stiff", st.hoistStiffness, 0) : "rigid") +
      " · repetitive-use " + (typeof st.derate === "number" ? st.derate : "per truss data") + " · self weight " + (TLA.limits.countSelfWeight(st) ? "counted" : "not counted") + " in cantilever and moment/shear checks · " + (U.metric() ? "metric" : "imperial") }));
    c.appendChild(h("button", { "class": "lnk", text: "Edit rig settings", onclick: function () { if (TLA.app) TLA.app.openSettings(); } }));
  }

  /** Pick mode (1.18.0): "Bolt to..." waits for a click on the plan. */
  function startPick(p) {
    S.ui.pick = p;
    if (S.sel && S.sel.load) S.sel.load = null;
    if (TLA.app) TLA.app.renderAll(); else S.emit();
  }

  function inspector(container) {
    container.textContent = "";
    var t = S.sel.truss && S.truss(S.sel.truss), db = S.db();
    if (!t) { rigInspector(container); return; }
    var res = S.results.trusses[t.id];
    if (t.isBlock) { blockInspector(container, t, res); return; }
    var s = S.sel.support && t.supports.filter(function (x) { return x.id === S.sel.support; })[0];
    if (s && s.kind === "hoist") { hoistInspector(container, t, s, res, db); return; }
    var l = S.sel.load && t.loads.filter(function (x) { return x.id === S.sel.load; })[0];
    if (l) { loadInspector(container, t, l); return; }
    trussInspector(container, t, res, db);
  }

  function round(v) { return Math.round(v * 100) / 100; }
  /** One joint model's static load in the hoist table; bold when it is the one that governs. */
  function modelCell(x, m) {
    var c = x.byModel && x.byModel[m];
    if (!c) return h("td", { "class": "r mut", text: "-" });
    var txt = U.n("w", c.staticLoad, 1) + (c.slack ? " slack" : "");
    return h("td", { "class": "r", title: "Whole-rig analysis, " + TLA.grillage.MODEL_LABEL[m] + (x.model === m ? " (governs)" : "") }, x.model === m ? h("b", { text: txt }) : txt);
  }
  /** The semi-rigid sweep's range in the hoist table; bold when one of its points governs. */
  function semiCell(x) {
    var c = x.compat;
    if (!c || c.semiMin === null || c.semiMin === undefined) return h("td", { "class": "r mut", text: "-" });
    var txt = Math.abs(c.semiMax - c.semiMin) < 0.05 ? U.n("w", c.semiMax, 1) : U.n("w", c.semiMin, 1) + " - " + U.n("w", c.semiMax, 1), gov = /^semi/.test(x.model);
    return h("td", { "class": "r nowrap", title: "Corner blocks as rotational springs of 1, 4 and 16 x EI/L (between hinged and rigid)" + (gov ? " - " + TLA.grillage.MODEL_LABEL[x.model] + " governs" : "") }, gov ? h("b", { text: txt }) : txt);
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
    tbl.appendChild(h("thead", null, h("tr", null, [["Truss"], ["Type"], ["Hangs from"], ["Length (" + L + ")", "r"], ["Longest span / max (" + L + ")", "r"], ["Span load", "r"], ["Cantilever", "r"], ["Moment", "r"], ["Shear", "r"], ["Max moment (" + U.unit("mom") + ")", "r"], ["Checked with"], ["Status"]].map(function (x) { return h("th", { "class": x[1] || "", text: x[0] }); }))));
    var tb = h("tbody");
    rows.forEach(function (t) {
      var res = r.trusses[t.id], db = res && res.dbTruss;
      var tr = h("tr", { "class": S.sel.truss === t.id && !S.sel.support ? "sel" : "", onclick: function () { S.sel = { truss: t.id, support: null }; S.emit(); } },
        h("td", { text: t.name }), h("td", { text: db ? db.manufacturer + " " + String(db.description).trim() : "-" }));
      if (!res) {
        tr.appendChild(h("td", { "class": "mut", text: hangsFrom(t) }));
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
      tr.appendChild(h("td", { text: hangsFrom(t) }));
      tr.appendChild(h("td", { "class": "r", text: U.n("len", t.length, 2) }));
      tr.appendChild(h("td", { "class": "r" + (longest && longest.lengthFail ? " over" : ""), title: "Longest span between supports, and the longest span the table allows", text: longest ? U.n("len", longest.length, 2) + " / " + U.n("len", longest.maxLength, 1) : "-" }));
      tr.appendChild(pctCell(worst(spans, function (s) { return s.utilization; }), "Worst span workload: its point loads as a share of the table capacity for that span (less any UDL)"));
      tr.appendChild(pctCell(worst(cants, function (s) { return Math.max(s.utilization, s.maxLength ? s.length / s.maxLength : 0); }), "Worst cantilever: its load against the table, or its length against a quarter of the maximum span, whichever is higher"));
      tr.appendChild(pctCell(mb ? mb.momentUtil : null, "Largest bending moment against the allowable estimated from the tables"));
      tr.appendChild(pctCell(mb ? mb.shearUtil : null, "Largest shear against the allowable estimated from the tables"));
      tr.appendChild(h("td", { "class": "r", text: mb ? U.n("mom", mb.moment, 0) : "-" }));
      tr.appendChild(h("td", { text: res.model ? TLA.grillage.MODEL_LABEL[res.model] : "load path" }));
      var segCode = segs.reduce(function (m, s) { return Math.max(m, s.code || 0); }, 0);
      if (!segCode && res.deflection && res.deflection.fail) segCode = 2;
      tr.appendChild(h("td", null, badge(segCode ? ["Good", "TOO LONG!", "OVERLOADED", "FAILURE"][segCode] : mb && mb.code ? mb.status : code ? "FAILURE" : "Good")));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); container.appendChild(tbl);
  }

  /* ---------- rig settings page (1.18.0: a full page instead of settings under the results) ---------- */
  function settings(container) {
    container.textContent = "";
    var st = S.rig.settings || (S.rig.settings = {});
    function card(title, intro, rows) { return h("div", { "class": "setcard" }, h("h3", { text: title }), intro ? h("p", { "class": "sub", text: intro }) : null, rows); }
    function row(label, ctl, help) { return h("div", { "class": "setrow" }, h("label", { "class": "setl" }, h("b", { text: label }), help ? h("span", { text: help }) : null), h("div", { "class": "setc" }, ctl)); }
    container.appendChild(h("div", { "class": "sethead" },
      h("button", { text: "‹ Back to the rig", onclick: function () { if (TLA.app) TLA.app.openSettings(false); } }),
      h("h2", { text: "Rig settings" }), h("span", { "class": "mini", text: "for " + S.rig.name + " - saved with the rig and printed on the calc sheet" })));
    var body = h("div", { "class": "setbody" });
    body.appendChild(card("Hoist loads", "How the high hook loads on the hoists are worked out.", [
      row("Default dynamic factor", numInput(typeof st.defaultDlf === "number" ? st.defaultDlf : 1.25, function (v) { st.defaultDlf = v > 0 ? v : 1.25; S.commit(); }),
        "Used when a hoist has no speed listed (a custom hoist). Hoists with a speed use speed in fpm / 60 + 1 (16 fpm = 4.9 m/min = 1.267). Any hoist can also be given its own factor."),
      row("Add % to hoist loads", numInput(Number(st.addPercent) > 0 ? st.addPercent : "", function (v) { st.addPercent = v > 0 ? v : undefined; S.commit(); }, { placeholder: "0" }),
        "An extra percentage on the load and truss weight at every hoist (unknown cable weight, a safety margin), as the original's 'Add Percentage'. Added before the hoist, chain and hardware weight; the truss checks are not changed."),
      row("Hoist stiffness (" + U.unit("stiff") + ")", numInput(Number(st.hoistStiffness) > 0 ? st.hoistStiffness : "", function (v) { st.hoistStiffness = v > 0 ? v : undefined; S.commit(); }, { q: "stiff", placeholder: "rigid" }),
        "How much a hoist and its chain stretch under load (for example " + (U.metric() ? "27 kg/mm" : "1500 lb/in") + " for a 1-ton chain hoist on a long drop - measure or ask the maker). Blank = rigid hoists, the usual assumption. Springy hoists share load more evenly and are much less level-sensitive."),
      row("Out-of-level tolerance ± (" + U.unit("inch") + ")", numInput(Number(st.levelTolerance) > 0 ? st.levelTolerance : "", function (v) { st.levelTolerance = v > 0 ? v : undefined; S.commit(); }, { q: "inch", placeholder: "off" }),
        "How far any hoist may end up off its level, each on its own (e.g. 1/4\" = 0.25). Each hoist's check then carries the worst it could see: the sum of what every hoist alone running that much high or low does to it (from the whole-rig analysis). Short, stiff spans are very level-sensitive. Blank = off (hoists exactly level). For a hoist trimmed on purpose, use its own Level offset."),
      row("Load cells read", select([{ value: "high", label: "high hook static (cell above the hoist)" }, { value: "low", label: "low hook (cell between hoist and truss)" }], st.cellReads === "low" ? "low" : "high", function (v) { st.cellReads = v === "low" ? "low" : undefined; S.commit(); }),
        "Where the load cells hang, for the Measured column of the hoists: readings are compared with that calculated load, and each assembly's total is flagged when it is more than 5% off."),
      row("Hoists hung below a truss", h("label", { "class": "cbline" }, h("input", { type: "checkbox", checked: st.hungDynamic !== false, onchange: function (e) { st.hungDynamic = e.target.checked ? undefined : false; S.commit(); } }), h("span", { text: "The carrier's hoists also take the hung hoist's dynamic load (on by default)" })),
        "A hoist hung below a truss puts its high hook load on that truss (the carrier). The carrier truss is always checked with the hung hoist's high hook dynamic load. On: the hoists holding the carrier up take it too. Off: they take the hung hoist's static load (their own dynamic factor still applies)."),
      row("Dead hang rope design factor", select([7, 8, 10].map(function (f) { return { value: String(f), label: f + ":1" + (f === TLA.limits.ROPE_DF ? " (default)" : "") }; }), String(TLA.limits.ropeFactor(st)), function (v) { st.ropeDesignFactor = +v === TLA.limits.ROPE_DF ? undefined : +v; S.commit(); }),
        "A dead hang's WLL is its rope's minimum breaking strength divided by this, capped by the assembly WLL typed on the dead hang. Dead hangs are static (dynamic factor 1.0 unless typed).")]));
    var lf = st.loadFactors || {};
    body.appendChild(card("Allowances", "Weight the drawing doesn't show: cable along the trusses, and a factor on each kind of load (e.g. 1.1 on lighting for clamps, safeties and gel frames not listed). They load the trusses and hoists like any other weight.", [
      row("Cable allowance (" + U.unit("wpl") + ")", numInput(Number(st.cablePerFt) > 0 ? st.cablePerFt : "", function (v) { st.cablePerFt = v > 0 ? v : undefined; S.commit(); }, { q: "wpl", placeholder: "none" }),
        "Cable weight per length on every truss (added to its UDL). A truss can set its own in its panel (0 = none)."),
      h("div", { "class": "setrow" }, h("label", { "class": "setl" }, h("b", { text: "Load factors" }), h("span", { text: "Each load's weight is multiplied by its category's factor (set the category on the load). 1 = as typed." })),
        h("div", { "class": "setc lfgrid" }, TLA.rig.LOAD_CATS.map(function (c) {
          return h("label", { "class": "field" }, h("span", { text: c[1] }), numInput(Number(lf[c[0]]) > 0 ? lf[c[0]] : "", function (v) { var o = st.loadFactors || (st.loadFactors = {}); if (v > 0 && v !== 1) o[c[0]] = v; else delete o[c[0]]; if (!Object.keys(o).length) delete st.loadFactors; S.commit(); }, { placeholder: "1", cls: "w50" }));
        })))]));
    body.appendChild(card("Truss checks", "The span, cantilever, moment and shear checks against the manufacturers' tables.", [
      row("Repetitive-use factor", select([{ value: "auto", label: "per truss data (0.85 unless the table includes it; Universal 0.75)" }, { value: "0.85", label: "always 0.85" }, { value: "1", label: "none (1.0)" }], typeof st.derate === "number" ? String(st.derate) : "auto", function (v) { st.derate = v === "auto" ? null : parseFloat(v); S.commit(); }),
        "ANSI repetitive-use rule: table capacities are multiplied by 0.85 unless the data already includes it."),
      row("Truss self weight", h("label", { "class": "cbline" }, h("input", { type: "checkbox", checked: TLA.limits.countSelfWeight(st), onchange: function (e) { st.cantileverSelfWeight = e.target.checked; S.commit(); } }), h("span", { text: "Count truss self weight in cantilever and moment/shear checks (on by default)" })),
        "On: the truss's self weight is added to the load on each cantilever (as the original Excel does), and the moment/shear check compares moments and shears that include self weight against table capacities with the self weight added back (CPL x L / 4 + w x L^2 / 8, CPL / 2 + w x L / 2). Off: self weight is left out of both.")]));
    var byRatio = {};
    S.db().trusses.forEach(function (x) { var l = TLA.limits.deflectionLimit(x, st); if (l.source === "maker") (byRatio[l.ratio] = byRatio[l.ratio] || []).push(x); });
    var makers = h("div", { "class": "setlinks" }, Object.keys(byRatio).map(function (k) {
      return h("div", null, h("b", { text: "L/" + k + ": " }), byRatio[k].map(function (x, i) { var nm = x.manufacturer + " " + String(x.description).trim(); return [i ? ", " : "", x.url ? h("a", { href: x.url, target: "_blank", rel: "noopener noreferrer", title: "The maker's data sheet, in a new tab", text: nm }) : nm]; }));
    }));
    body.appendChild(card("Deflection", "Each span's sag from the whole-rig analysis, measured from the line between its two supports. Past a maker's published limit the truss is Overloaded (their allowable loads are set by that limit); past this default it is a warning.", [
      row("Limit where the maker publishes none", h("div", { "class": "row-btns", style: "margin:0" }, h("span", { text: "span / " }), numInput(Number(st.deflectionLimit) > 0 ? st.deflectionLimit : TLA.limits.DEFL_DEFAULT, function (v) { st.deflectionLimit = v > 0 && v !== TLA.limits.DEFL_DEFAULT ? v : undefined; S.commit(); }, { cls: "w60" })),
        "Default L/" + TLA.limits.DEFL_DEFAULT + ". The makers' own published limits always win (each name opens the maker's data sheet):"),
      h("div", { "class": "setrow" }, makers),
    ]));
    var cmsg = h("span", { "class": "mini" });
    body.appendChild(card("Plan", "Where the rig sits on the plan. Moving it changes no result.", [
      row("Center the rig on 0,0", h("div", { "class": "row-btns", style: "margin:0" }, h("button", { text: "Center on 0,0", onclick: function () {
        var d = S.centerRig(); S.ui.fit = true;
        cmsg.textContent = !d ? "No trusses yet." : d[0] || d[1] ? "Moved " + U.f("len", d[0], 3) + " in X and " + U.f("len", d[1], 3) + " in Y (Undo moves it back)." : "Already centered.";
      } }), cmsg), "Moves the whole rig so the middle of its footprint is at X 0, Y 0. Bolted trusses and corner blocks move with the trusses they hang from, so the rig keeps its shape.")]));
    var th = (function () { try { return localStorage.getItem("tla-theme") || "dark"; } catch (e) { return "dark"; } })();
    body.appendChild(card("Display and paper", "Only what is shown and typed changes: the rig and every result stay the same.", [
      row("Theme", select([{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "system", label: "Follow the computer's setting" }], th, function (v) { if (TLA.app && TLA.app.setTheme) TLA.app.setTheme(v); }), "Dark suits a dark venue; light is easier in daylight and closer to the printed calc sheet. Kept on this computer, not in the rig file."),
      row("Units", select([{ value: "imperial", label: "imperial (ft, lb)" }, { value: "metric", label: "metric (m, kg)" }], U.metric() ? "metric" : "imperial", function (v) { st.units = v === "metric" ? "metric" : undefined; S.commit(); }), "Feet and pounds, or meters and kilograms (moments in kg·m, hoist speed in m/min, sizes in mm)."),
      U.metric() ? null : row("Show lengths as", select([{ value: "decimal", label: "decimal feet (4.1667)" }, { value: "ftin", label: "feet-inches (4'-2\")" }], st.lengthFormat === "ftin" ? "ftin" : "decimal", function (v) { st.lengthFormat = v; S.commit(); }), "You can type either way in any length box."),
      row("Calc sheet paper", select(["letter", "a4"].map(function (p) { return { value: p, label: TLA.report.PAPER[p].label }; }), TLA.report.paper(), function (v) { (S.rig.report || (S.rig.report = {})).paper = v; S.commit(); }), "Paper size the calculation sheet is laid out and printed on.")]));
    container.appendChild(body);
  }

  /* ---------- results (step 4) ---------- */
  function kpis(container) {
    var r = S.results, t = r.totals, warns = r.warnings.filter(function (w) { return w.level !== "note"; });
    var maxW = r.hoists.reduce(function (m, x) { return x.hoist.capacity < 999999 ? Math.max(m, x.hoist.staticLoad / x.hoist.capacity) : m; }, 0);
    var bad = r.hoists.filter(function (x) { return x.hoist.status !== "Good"; }).length + S.rig.trusses.filter(function (x) { var rr = r.trusses[x.id]; return !x.isBlock && (!rr || TLA.plan.trussStatus(rr).bad); }).length;
    container.appendChild(h("div", { "class": "kpis" },
      h("div", { "class": "kpi " + (bad ? "fail" : "ok") }, h("b", { text: bad ? bad + " to check" : "All OK" }), h("span", { text: S.rig.trusses.filter(function (x) { return !x.isBlock; }).length + " trusses · " + t.count + " hoists" })),
      h("div", { "class": "kpi" }, h("b", { text: U.n("w", t.staticLoad, 0) }), h("span", { text: U.unit("w") + " total high hook static" })),
      h("div", { "class": "kpi" }, h("b", { text: U.n("w", t.dynamicLoad, 0) }), h("span", { text: U.unit("w") + " total high hook dynamic" })),
      h("div", { "class": "kpi" + (maxW > 1 ? " fail" : maxW >= 0.8 ? " w" : "") }, h("b", { text: fmt(maxW * 100, 0) + "%" }), h("span", { text: "max hoist workload" })),
      h("div", { "class": "kpi" + (warns.length ? " w" : " ok") }, h("b", { text: String(warns.length) }), h("span", { text: "warning" + (warns.length === 1 ? "" : "s") }))));
  }
  function warnList(container, which) {
    var r = S.results, warns = r.warnings.filter(function (w) { return w.level !== "note"; }), notes = r.warnings.filter(function (w) { return w.level === "note"; });
    [[warns, "warnings"], [which === "all" ? notes : [], "warnings notes"]].forEach(function (g) {
      if (!g[0].length) return;
      var ul = h("ul", { "class": g[1] });
      g[0].forEach(function (w) { ul.appendChild(h("li", { title: w.truss ? "Click to select the truss" : "", onclick: function () { if (w.truss) sel({ truss: w.truss }); } }, warnBody(w))); });
      container.appendChild(ul);
    });
    if (which === "all" && !warns.length && !notes.length) container.appendChild(h("p", { "class": "ghint", text: "No warnings." }));
  }
  /** The first warning as a banner, with a way back to the step that fixes it. */
  function banner(container) {
    var warns = S.results.warnings.filter(function (w) { return w.level !== "note"; });
    if (!warns.length) return;
    var w = warns[0];
    container.appendChild(h("div", { "class": "banner" + (/overload|unstable|failure/i.test(w.message) ? " fail" : "") }, h("span", { "class": "ic", text: "▲" }), h("div", null, warnBody(w)),
      h("span", { "class": "x" }, warns.length > 1 ? h("button", { "class": "lnk", text: "All " + warns.length + " warnings", onclick: function () { if (TLA.app) TLA.app.setStep(4, "w"); } }) : null,
        w.truss ? h("button", { "class": "lnk", text: "Select truss ›", onclick: function () { sel({ truss: w.truss }); } }) : null,
        /hoist|level/i.test(w.message) ? h("button", { "class": "lnk", text: "Go to hoists (step 3) ›", onclick: function () { if (TLA.app) TLA.app.setStep(3); } }) : null)));
  }
  function hoistTable(container) {
    var r = S.results;
    var tbl = h("table", { "class": "tbl hoists" });
    tbl.appendChild(h("thead", null, h("tr", null, (function (L, W) { return [["Truss"], ["At (" + L + ")", "r"], ["Hoist"], ["Chain (" + L + ")", "r"], ["Hoist & Chain (" + W + ")", "r"], ["Hinged joints* (" + W + ")", "r"], ["Semi-rigid* (" + W + ")", "r"], ["Rigid joints* (" + W + ")", "r"], ["High hook static (" + W + ")", "r"], ["Dyn. factor", "r"], ["High hook dynamic (" + W + ")", "r"], ["Capacity (" + W + ")", "r"], ["Workload", "r"], ["Status"]]; })(U.unit("len"), U.unit("w")).map(function (x) { return h("th", { "class": x[1] || "", text: x[0] }); }))));
    var tb = h("tbody");
    r.hoists.forEach(function (x) {
      var hs = S.truss(x.truss).supports.filter(function (s) { return s.id === x.support; })[0];
      var hd = hoistDb(hs && hs.hoistId);
      tb.appendChild(h("tr", { "class": S.sel.support === x.support ? "sel" : "", onclick: function () { sel({ truss: x.truss, support: x.support }); } },
        h("td", { text: x.trussName }), h("td", { "class": "r", text: U.n("len", x.distance, 2) }),
        h("td", { text: hs && hs.dead ? supportName(hs) : hd ? String(hd.description).trim() + " " + hd.capacity_label : "-" }),
        h("td", { "class": "r", text: hs ? U.n("len", (hs.dead ? hs.ropeLength : hs.chainLength) || 0, 1) : "-" }),
        h("td", { "class": "r", title: "Hoist body + chain (chain length x weight per foot)" + (hs && hs.hardwareWeight ? " + hardware" : ""), text: U.n("w", x.hoist.staticLoad - x.hoist.reaction - (x.hoist.added || 0), 1) }),
        modelCell(x, "hinged"), semiCell(x), modelCell(x, "rigid"),
        h("td", { "class": "r", title: (x.model ? "Largest of the joint models (" + TLA.grillage.MODEL_LABEL[x.model] + ")" : "Load-path method (whole-rig analysis not available)") + (x.hoist.added ? "; includes " + U.f("w", x.hoist.added, 1) + " added (" + S.rig.settings.addPercent + "%)" : "") }, h("b", { text: U.n("w", x.hoist.staticLoad, 1) })),
        h("td", { "class": "r", text: fmt(x.hoist.dynamicFactor, 3) }),
        h("td", { "class": "r", text: U.n("w", x.hoist.dynamicLoad, 1) }),
        h("td", { "class": "r", text: x.hoist.capacity >= 999999 ? "none" : U.n("w", x.hoist.capacity, 0) }),
        h("td", { "class": "r", text: x.hoist.capacity >= 999999 ? "-" : fmt(x.hoist.staticLoad / x.hoist.capacity * 100, 0) + "%" }),
        h("td", null, badge(x.hoist.status))));
    });
    tbl.appendChild(tb);
    container.appendChild(tbl);
    if (!r.hoists.length) container.appendChild(h("p", { "class": "ghint", text: "No hoists yet - add them in step 3." }));
  }
  function footnote(container) {
    var r = S.results;
    container.appendChild(h("p", { "class": "ghint" }, r.primary === "grillage"
      ? "* Hoist loads come from a whole-rig analysis, which lets the trusses bend, shear and twist and share load, with the corner blocks modeled as hinged (vertical force only), semi-rigid (rotational springs of 1, 4 and 16 x EI/L) and rigid (bending and torsion pass through). High hook static and dynamic, % and status use the largest. Low hook = what the truss hangs on the hoist's hook; high hook = low hook + Add % + hoist, chain and hardware weight (what the structure above carries). Each truss's bending, shear and torsion stiffness is estimated from its manufacturer's tables unless the truss data gives real chord and diagonal sizes (scale it with Stiffness x). Hoists are rigid unless a hoist stiffness is set."
      : "* Whole-rig analysis not available" + (r.compat && r.compat.note ? " (" + U.text(r.compat.note) + ")" : "") + ": loads are from the load-path method alone, which treats every carrying truss as unyielding and can under-estimate hoists in a grid."));
  }
  /** Step 4: summary figures, the first warning, then Trusses / Hoists / Warnings. */
  function results(container, tab) {
    container.textContent = "";
    kpis(container);
    banner(container);
    var body = h("div");
    if (tab === "w") warnList(body, "all");
    else if (tab === "h") { hoistTable(body); footnote(body); }
    else { trussTable(body); warnList(body, "warn"); }
    container.appendChild(body);
  }
  function exportModel() {
    var ex = TLA.grillage.exportModel(S.rig, S.results, S.db()); if (!ex) { alert("The whole-rig model can't be exported for this rig."); return; }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(ex, null, 1)], { type: "application/json" }));
    a.download = (S.rig.name || "rig").replace(/[^\w\- ]+/g, "") + ".grillage.json"; a.click();
  }

  TLA.panels = {
    mount: function (store) { S = store; },
    elevation: elevation, forceDiagrams: forceDiagrams, deflText: deflText, ldText: ldText,
    parseLen: parseLen, fmtFtIn: fmtFtIn, trussLabel: trussLabel, hangsFrom: hangsFrom, statusText: statusText, modelsOf: modelsOf, trussSource: trussSource, h: h, select: select, numInput: numInput, textInput: textInput, field: field, fmt: fmt, badge: badge,
    inspector: inspector, settings: settings, heat: heat, localWorkload: localWorkload, reactionsDiagram: reactionsDiagram, deflectionDiagram: deflectionDiagram, results: results, summary: function (c) { results(c, "t"); }, kpis: kpis, exportModel: exportModel,
    loadParts: loadParts, setLoadParts: setLoadParts, applyFixture: applyFixture, mirrorAt: mirrorAt, mirrorHoistsUi: mirrorHoistsUi, copyHoistsPrompt: copyHoistsPrompt, posLabel: posLabel, newLoad: newLoad, quickAdd: quickAdd,
    hoistRes: hoistRes, hoistDb: hoistDb, hoistName: hoistName, supportName: supportName, setDead: setDead, trussVerdict: trussVerdict, wlCell: wlCell, lenText: lenText, parseShownLen: parseShownLen, modelCell: modelCell, semiCell: semiCell, posCell: posCell,
    hoistsCsv: function () {
      var L = U.unit("len"), W = U.unit("w");
      var rows = [["Truss", "At " + L, "Low hook " + W, "Hoist & Chain " + W, "Added % " + W, "Hinged joints high hook " + W, "Semi-rigid min high hook " + W, "Semi-rigid max high hook " + W, "Rigid joints high hook " + W, "High hook static " + W, "Governing", "Dynamic factor", "High hook dynamic " + W, "Capacity " + W, "Status"]];
      function r1(v) { return Math.round(U.v("w", v) * 10) / 10; }
      S.results.hoists.forEach(function (x) {
        var c = x.compat || {}, semi = c.semiMin !== null && c.semiMin !== undefined;
        rows.push([x.trussName, Math.round(U.v("len", x.distance) * 1000) / 1000, r1(x.hoist.reaction), r1(x.hoist.staticLoad - x.hoist.reaction - (x.hoist.added || 0)), r1(x.hoist.added || 0),
          x.byModel ? r1(x.byModel.hinged.staticLoad) : "", semi ? r1(c.semiMin) : "", semi ? r1(c.semiMax) : "", x.byModel ? r1(x.byModel.rigid.staticLoad) : "", r1(x.hoist.staticLoad), x.model ? TLA.grillage.MODEL_LABEL[x.model] : "load path",
          Math.round(x.hoist.dynamicFactor * 1000) / 1000, r1(x.hoist.dynamicLoad), x.hoist.capacity >= 999999 ? "none" : r1(x.hoist.capacity), x.hoist.status]);
      });
      return rows.map(function (r) { return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
