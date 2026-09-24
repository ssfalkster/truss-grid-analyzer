/* Plan view: the rig drawn to scale, editable by dragging. SVG, no dependencies. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var NS = "http://www.w3.org/2000/svg";
  var S = null, root = null, svg = null;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function fmt(n) { return Math.abs(n) >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString(); }

  /** Worst utilization and pass/fail for a solved truss. */
  function trussStatus(res) {
    var u = 0, bad = false;
    if (!res) return { util: 0, bad: false, solved: false };
    res.limits.segments.forEach(function (s) {
      if (s.skipped) return;
      var v = Math.max(isFinite(s.utilization) ? s.utilization : 9, s.maxLength ? s.length / s.maxLength : 0);
      u = Math.max(u, v);
      if (s.code) bad = true;
    });
    var mb = res.limits.member;
    if (mb) { u = Math.max(u, isFinite(mb.utilization) ? mb.utilization : 9); if (mb.code) bad = true; }
    var dc = res.deflection;     // 1.18.0: past the maker's deflection limit fails the truss
    if (dc && dc.source === "maker") { u = Math.max(u, dc.util); if (dc.fail) bad = true; }
    res.supports.forEach(function (sr) {
      if (!sr.hoist) return;
      var cap = sr.hoist.capacity || 1;
      u = Math.max(u, sr.hoist.staticLoad / cap);
      if (sr.hoist.status !== "Good") bad = true;
    });
    return { util: u, bad: bad, solved: true };
  }
  function utilClass(st) { return !st.solved ? "c-unsolved" : st.bad || st.util >= 1 ? "c-fail" : st.util >= 0.8 ? "c-warn" : "c-ok"; }

  function trussClass(t, res, results) {
    var mode = S.ui.colorMode;
    if (!res) return "c-unsolved";
    var st = trussStatus(res);
    if (mode === "status") return st.bad ? "c-fail" : "c-ok";
    if (mode === "hoist") {
      var f = 0, any = false;
      res.supports.forEach(function (sr) { if (sr.hoist) { any = true; f = Math.max(f, sr.hoist.staticLoad / (sr.hoist.capacity || 1)); } });
      return !any ? "c-neutral" : f >= 1 ? "c-fail" : f >= 0.8 ? "c-warn" : "c-ok";
    }
    return utilClass(st);
  }

  function upstream(results, tid) {
    var set = {}; set[tid] = true;
    var stack = [tid];
    while (stack.length) {
      var r = results.trusses[stack.pop()];
      if (!r) continue;
      r.injected.forEach(function (inj) { if (!set[inj.source.truss]) { set[inj.source.truss] = true; stack.push(inj.source.truss); } });
    }
    return set;
  }

  function fit() {
    var ts = S.rig.trusses;
    if (!ts.length || !root) return;
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    ts.forEach(function (t) {
      [0, t.length].forEach(function (d) {
        var p = TLA.rig.geometry.endPoint(t, d);
        minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
      });
    });
    var w = root.clientWidth || 800, h = root.clientHeight || 500, pad = 70;
    var sc = Math.min((w - pad * 2) / Math.max(maxx - minx, 5), (h - pad * 2) / Math.max(maxy - miny, 5));
    sc = Math.max(2, Math.min(40, sc));
    S.ui.view = { scale: sc, ox: (w - (maxx - minx) * sc) / 2 - minx * sc, oy: (h - (maxy - miny) * sc) / 2 + maxy * sc };
  }

  function render() {
    if (!root) return;
    if (S.ui.fit) { S.ui.fit = false; fit(); }
    var v = S.ui.view, sc = v.scale, results = S.results;
    var W = root.clientWidth || 800, H = root.clientHeight || 500;
    root.textContent = "";
    var step = TLA.app && TLA.app.step ? TLA.app.step() : 0;
    svg = el("svg", { width: W, height: H, "class": "plan-svg" + (step === 1 || step === 2 ? " st" + step : "") }, root);
    var X = function (x) { return v.ox + x * sc; }, Y = function (y) { return v.oy - y * sc; };

    // grid
    var step = sc >= 20 ? 1 : sc >= 8 ? 5 : sc >= 4 ? 10 : 20;
    var gg = el("g", { "class": "grid" }, svg);
    var x0 = Math.floor((0 - v.ox) / sc / step) * step, x1 = Math.ceil((W - v.ox) / sc / step) * step;
    var y0 = Math.floor((v.oy - H) / sc / step) * step, y1 = Math.ceil(v.oy / sc / step) * step;
    for (var gx = x0; gx <= x1; gx += step) el("line", { x1: X(gx), y1: 0, x2: X(gx), y2: H, "class": gx % (step * 5) === 0 ? "major" : "" }, gg);
    for (var gy = y0; gy <= y1; gy += step) el("line", { x1: 0, y1: Y(gy), x2: W, y2: Y(gy), "class": gy % (step * 5) === 0 ? "major" : "" }, gg);
    // 1.18.0: the plan origin - hard X = 0 and Y = 0 lines, labelled
    el("line", { x1: X(0), y1: 0, x2: X(0), y2: H, "class": "origin" }, gg);
    el("line", { x1: 0, y1: Y(0), x2: W, y2: Y(0), "class": "origin" }, gg);
    var ox = Math.max(4, Math.min(W - 40, X(0) + 4)), oy = Math.max(14, Math.min(H - 4, Y(0) - 4));
    el("text", { x: ox, y: H - 34, "class": "olbl" }, gg).textContent = "X 0";
    el("text", { x: 50, y: oy, "class": "olbl" }, gg).textContent = "Y 0";

    var hl = null;
    if (S.sel.support && S.sel.truss) hl = upstream(results, S.sel.truss);

    function bw(t, res) { return Math.max(3, sc * TLA.rig.widthFt(t, res && res.dbTruss)); }
    var bodyW = 6;
    var order = S.rig.trusses.slice().sort(function (a, b) { return (results.layers[a.id] || 0) - (results.layers[b.id] || 0); });

    // trusses
    var hotGlow = [];
    order.forEach(function (t) {
      if (t.isBlock) return;
      var res = results.trusses[t.id];
      var a = TLA.rig.geometry.endPoint(t, 0), b = TLA.rig.geometry.endPoint(t, t.length), bodyW = bw(t, res);
      var grp = el("g", { "data-truss": t.id, "class": "truss " + trussClass(t, res, results) + (S.sel.truss === t.id ? " selected" : "") + (hl && !hl[t.id] ? " dim" : "") }, svg);
      var tip = el("title", null, grp);
      tip.textContent = t.name + " - " + TLA.units.f("len", t.length, 2) + (res ? " - hangs from " + TLA.panels.hangsFrom(t) : " - not solved");
      var body = el("line", { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), "class": "body", "stroke-width": bodyW }, grp);
      if (S.ui.colorMode === "hot" && res && TLA.panels.localWorkload) {
        // 1.18.0 hot spots: shade the truss along its length by local workload
        var lw = TLA.panels.localWorkload(res);
        if (lw) {
          var defs = svg.querySelector("defs") || el("defs", null, svg), gid = "hot-" + t.id;
          var gr = el("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse", x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y) }, defs);
          lw.pts.forEach(function (p) { el("stop", { offset: (p[0] / (t.length || 1)).toFixed(4), "stop-color": TLA.panels.heat(p[1]) }, gr); });
          body.setAttribute("style", "stroke:url(#" + gid + ")");
          var tp = grp.querySelector("title"); if (tp) tp.textContent += " - peak " + Math.round(lw.peak.u * 100) + "% at " + TLA.units.mark(lw.peak.x, 2);
          if (lw.peak.u >= 0.8) hotGlow.push({ p: TLA.rig.geometry.endPoint(t, lw.peak.x), u: lw.peak.u, r: Math.max(18, bodyW * 3) });
        }
      }
      el("line", { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), "class": "hit", "stroke-width": Math.max(bodyW, 14) }, grp);
      if (res) {
        var P = res.beam.positions;
        [[0, P[0]], [P[P.length - 1], t.length]].forEach(function (seg) {
          if (seg[1] - seg[0] < 1e-6) return;
          var p1 = TLA.rig.geometry.endPoint(t, seg[0]), p2 = TLA.rig.geometry.endPoint(t, seg[1]);
          el("line", { x1: X(p1.x), y1: Y(p1.y), x2: X(p2.x), y2: Y(p2.y), "class": "cant", "stroke-width": bodyW * 0.45 }, grp);
        });
      }
    });

    // hot spots: a glow radiating from the peak of any truss working at 80% or more
    hotGlow.forEach(function (hgw, i) {
      var defs = svg.querySelector("defs") || el("defs", null, svg), id = "glow-" + i, rg = el("radialGradient", { id: id }, defs), c = TLA.panels.heat(hgw.u);
      el("stop", { offset: "0", "stop-color": c, "stop-opacity": ".85" }, rg); el("stop", { offset: ".45", "stop-color": c, "stop-opacity": ".35" }, rg); el("stop", { offset: "1", "stop-color": c, "stop-opacity": "0" }, rg);
      el("circle", { cx: X(hgw.p.x), cy: Y(hgw.p.y), r: hgw.r * (hgw.u >= 1 ? 1.6 : 1.1), fill: "url(#" + id + ")", "class": "hotglow" }, svg);
    });

    // corner blocks sit on top of the truss bodies
    order.forEach(function (t) {
      if (!t.isBlock) return;
      var res = results.trusses[t.id], c = TLA.rig.geometry.endPoint(t, t.length / 2);
      var dim = hl && !hl[t.id];
      var bg = el("g", { "data-truss": t.id, "class": "blockg" + (S.sel.truss === t.id ? " selected" : "") + (dim ? " dim" : "") }, svg);
      var half = Math.max(6, sc * t.length * 0.5);
      var ti = el("title", null, bg);
      ti.textContent = t.name + (res && res.block ? " - " + (res.block.type ? res.block.type.manufacturer + " " + res.block.type.name : "") + ", " + TLA.units.f("w", res.block.weight, 1) + ", " + res.block.waysUsed + (res.block.waysAvailable ? "/" + res.block.waysAvailable : "") + " ways used" : "");
      el("rect", { x: X(c.x) - half, y: Y(c.y) - half, width: half * 2, height: half * 2, transform: "rotate(" + (-(t.angle || 0)) + " " + X(c.x) + " " + Y(c.y) + ")", "class": "blk" + (res && res.block && res.block.waysAvailable && res.block.waysUsed > res.block.waysAvailable ? " bad" : "") }, bg);
    });

    // loads, supports, labels
    order.forEach(function (t) {
      var res = results.trusses[t.id], bodyW = t.isBlock ? 6 : bw(t, res);
      var dim = hl && !hl[t.id];
      var grp = el("g", { "class": "marks" + (dim ? " dim" : "") }, svg);
      var ang = (t.angle || 0) * Math.PI / 180, nx = -Math.sin(ang), ny = Math.cos(ang);
      if (res && S.ui.showLoads) {
        res.beam.loads.forEach(function (l) {
          if (l.injected) return;
          var p = TLA.rig.geometry.endPoint(t, l.distance);
          var lg = el("g", { "class": "load" + (l.mirrored ? " ghost" : "") + (S.sel.load && l.ref && l.ref.id === S.sel.load ? " sel" : "") }, grp);
          el("path", { d: "M" + X(p.x) + " " + (Y(p.y) - 2) + " l -4 -9 l 8 0 z", "class": "arrow" }, lg);
          if (sc >= 6) {
            var tx = el("text", { x: X(p.x), y: Y(p.y) - 14, "class": "lbl small", "text-anchor": "middle" }, lg);
            tx.textContent = fmt(TLA.units.v("w", l.weight));
          }
        });
      }
      if (res) {
        res.supports.forEach(function (sr) {
          var s = sr.support, p = TLA.rig.geometry.endPoint(t, s.distance);
          var selected = S.sel.support === s.id;
          if (s.kind === "hoist") {
            var ok = sr.hoist.status === "Good" && !sr.hoist.dynamicOver;
            var hg = el("g", { "data-hoist": s.id, "data-truss-of": t.id, "class": "hoist " + (sr.hoist.status === "Check" ? "c-warn" : sr.hoist.status !== "Good" ? "c-fail" : sr.hoist.dynamicOver ? "c-warn" : "c-ok") + (selected ? " selected" : "") + (sr.hung ? " hung" : "") + (s.dead ? " dead" : "") }, grp);
            var tt = el("title", null, hg), carrier = sr.hung && S.truss(sr.hung.truss);
            tt.textContent = (s.name || (s.dead ? "Dead hang" : "Hoist")) + ": " + TLA.units.f("w", sr.hoist.staticLoad, 0) + " static / " + TLA.units.f("w", sr.hoist.capacity, 0) + (s.dead ? " WLL (" : " capacity (") + TLA.limits.statusText(sr.hoist.status) + ")" +
              (carrier ? " - hung below " + carrier.name : "");
            hoistSymbol(hg, X(p.x), Y(p.y), Math.max(6, sc * 0.5));
            if (dragHoist && dragHoist.s === s) {
              var doff = bodyW / 2 + 12;
              var dt = el("text", { x: X(p.x) + nx * doff, y: Y(p.y) - ny * doff + 4, "class": "lbl drag-lbl", "text-anchor": nx > 0.3 ? "start" : nx < -0.3 ? "end" : "middle" }, hg);
              dt.textContent = posText(t, s);
            }
            if (sc >= 4 && S.ui.showLabels) {
              var off = bodyW / 2 + 9;
              var lt = el("text", { x: X(p.x) - nx * off, y: Y(p.y) + ny * off + 4, "class": "lbl hoist-lbl", "text-anchor": nx > 0.3 ? "end" : nx < -0.3 ? "start" : "middle" }, hg);
              lt.textContent = fmt(TLA.units.v("w", sr.hoist.staticLoad));
              // 1.18.0: high hook dynamic in italics, one line further from the truss
              var away = ny * off < -0.5 ? -11 : 11;
              var dl = el("text", { x: X(p.x) - nx * off, y: Y(p.y) + ny * off + 4 + away, "class": "lbl hoist-dyn", "text-anchor": nx > 0.3 ? "end" : nx < -0.3 ? "start" : "middle" }, hg);
              dl.textContent = fmt(TLA.units.v("w", sr.hoist.dynamicLoad));
            }
          } else {
            var u = S.truss(s.onTruss);
            var fam = (S.results.bolts || []).filter(function (b) { return b.level === "warn" && b.truss === t.id && b.support === s.id; })[0];
            el("path", { d: "M" + X(p.x) + " " + (Y(p.y) - 6) + " l 6 6 l -6 6 l -6 -6 z", "class": "bear" + (fam ? " fam-warn" : "") }, grp);
            if (u) {
              var q = TLA.rig.geometry.endPoint(u, s.onDistance);
              var off = Math.hypot(q.x - p.x, q.y - p.y);
              if (off > (u.isBlock ? 1.6 : 0.05)) el("line", { x1: X(p.x), y1: Y(p.y), x2: X(q.x), y2: Y(q.y), "class": "mismatch" }, grp);
            }
          }
        });
      }
      if (S.ui.showLabels && (!t.isBlock || S.sel.truss === t.id)) {
        var c = TLA.rig.geometry.endPoint(t, t.length / 2), lab;
        if (t.isBlock) {
          lab = el("text", { x: X(c.x) + nx * (bodyW / 2 + 12), y: Y(c.y) - ny * (bodyW / 2 + 12) + 4, "class": "lbl name", "text-anchor": nx > 0.3 ? "start" : nx < -0.3 ? "end" : "middle" }, grp);
          lab.textContent = t.name;
        } else {
          // 1.13.0: the name runs along the truss, on its left-hand side, turned so it never reads upside down
          var a = (((t.angle || 0) % 360) + 360) % 360, flip = a > 90 + 1e-6 && a <= 270 + 1e-6, rd = flip ? a - 180 : a > 270 ? a - 360 : a;
          var lo = bodyW / 2 + 4, lx = X(c.x) + nx * lo, ly = Y(c.y) - ny * lo;
          lab = el("text", { x: lx, y: ly, "class": "lbl name", "text-anchor": "middle", "dominant-baseline": flip ? "hanging" : "auto", transform: "rotate(" + (-rd) + " " + lx + " " + ly + ")" }, grp);
          lab.textContent = t.name + " (" + TLA.units.mark(t.length, 1) + ")";
        }
      }
    });

    // connection rings on the supporting truss
    S.rig.trusses.forEach(function (t) {
      t.supports.forEach(function (s) {
        if (s.kind !== "truss") return;
        var u = S.truss(s.onTruss); if (!u) return;
        var q = TLA.rig.geometry.endPoint(u, s.onDistance);
        el("circle", { cx: X(q.x), cy: Y(q.y), r: 4, "class": "ring" }, svg);
      });
    });

    // "Bolt to..." (1.18.0): the corner blocks you can click
    var pk = S.ui.pick;
    if (pk && pk.kind === "block") {
      S.rig.trusses.forEach(function (b) {
        if (!b.isBlock || b.host === pk.truss) return;
        var c = TLA.rig.geometry.endPoint(b, b.length / 2), half = Math.max(9, sc * b.length * 0.5 + 5);
        var r = el("rect", { x: X(c.x) - half, y: Y(c.y) - half, width: half * 2, height: half * 2, rx: 3, "class": "pickbox", "data-pick": b.id }, svg);
        var ti = el("title", null, r); ti.textContent = "Bolt to " + b.name;
      });
    }
  }

  /** Hoist on the plan (1.18.0): a ring with cross-hairs, coloured by the hoist's status, with a dark outline so it
   * reads against the truss under it. */
  function hoistSymbol(g, x, y, r) {
    r = Math.max(r, 7);
    var e = r * 1.7, d = "M" + (x - e) + " " + y + " L" + (x + e) + " " + y + " M" + x + " " + (y - e) + " L" + x + " " + (y + e);
    el("path", { d: d, "class": "hhalo" }, g);
    el("circle", { cx: x, cy: y, r: r * 0.9, "class": "hsym" }, g);
    el("path", { d: d, "class": "hline" }, g);
    el("circle", { cx: x, cy: y, r: 2.2, "class": "hdot" }, g);
  }

  /* Hoist drag (1.9.0): a hoist slides along its truss in 1" steps (2 cm in metric), counted from the truss's
   * measuring reference (start / centerline / end), so the typed distance stays a round number. */
  var dragHoist = null;
  function hoistStep() { return TLA.units.metric() ? 0.02 / TLA.units.FT_M : 1 / 12; }
  function snapHoist(t, s, along) {
    var L = t.length, d = Math.max(0, Math.min(L, along)), st = hoistStep();
    var shown = Math.round(S.measureDisplay({ distance: d, from: s.from }, L) / st) * st;
    var back = s.from === "end" ? L - shown : s.from === "center" ? L / 2 + shown : shown;
    if (back < -1e-9) shown += s.from === "end" ? -st : st;          // a step past the truss end -> back onto it
    else if (back > L + 1e-9) shown += s.from === "end" ? st : -st;
    return Math.round(shown * 10000) / 10000;
  }
  function posText(t, s) {
    var v = S.measureDisplay(s, t.length), ref = s.from === "center" ? " from center" : s.from === "end" ? " from end" : "";
    if (TLA.units.metric()) return (Math.round(v * TLA.units.FT_M * 100) / 100).toFixed(2) + " m" + ref;
    return (TLA.panels && TLA.panels.fmtFtIn ? TLA.panels.fmtFtIn(v) : TLA.units.mark(v, 2)) + ref;
  }

  function worldFromEvent(e) {
    var r = root.getBoundingClientRect(), v = S.ui.view;
    return { x: (e.clientX - r.left - v.ox) / v.scale, y: (v.oy - (e.clientY - r.top)) / v.scale };
  }

  function bindEvents() {
    var drag = null;
    root.addEventListener("pointerdown", function (e) {
      var hoist = e.target.closest && e.target.closest("[data-hoist]");
      var tr = e.target.closest && e.target.closest("[data-truss]");
      var pk = S.ui.pick;
      if (pk) {
        var err = null, target = e.target.closest && e.target.closest("[data-pick]"), tt = tr && S.truss(tr.getAttribute("data-truss"));
        if (pk.kind === "block" && target) err = S.boltToBlock(pk.truss, target.getAttribute("data-pick"), S.ui.boltMode || "auto", S.ui.boltSide || "auto");
        else if (pk.kind === "truss" && tt && !tt.isBlock) err = S.boltToBlock(tt.id, pk.block, pk.side ? "auto" : (S.ui.boltMode || "auto"), pk.side || S.ui.boltSide || "auto");
        else if (!target && !tt) { S.ui.pick = null; S.select(S.sel); return; }
        else return;
        S.ui.pick = null;
        if (err) { alert(TLA.units.text(err)); S.select(S.sel); }
        else if (pk.kind === "truss" && tt) S.select({ truss: tt.id });
        else S.select({ truss: pk.truss });
        return;
      }
      try { root.setPointerCapture(e.pointerId); } catch (err2) { /* synthetic or released pointer */ }
      if (hoist) {
        var ht = S.truss(hoist.getAttribute("data-truss-of")), hid = hoist.getAttribute("data-hoist");
        var hs = ht && ht.supports.filter(function (x) { return x.id === hid; })[0];
        if (hs) drag = { kind: "hoist", t: ht, s: hs, cx: e.clientX, cy: e.clientY, moved: false };
        S.select({ truss: ht ? ht.id : null, support: hid }); return;
      }
      if (tr) {
        var t = S.truss(tr.getAttribute("data-truss"));
        if (t.isBlock || t.anchor) { S.select({ truss: t.id }); return; }
        var w = worldFromEvent(e);
        drag = { kind: "truss", t: t, sx: w.x, sy: w.y, ox: t.x, oy: t.y, moved: false };
        S.select({ truss: t.id });
      } else {
        drag = { kind: "pan", cx: e.clientX, cy: e.clientY, ox: S.ui.view.ox, oy: S.ui.view.oy, moved: false };
        if (S.sel.truss || S.sel.support || S.sel.load) S.select({});
      }
    });
    root.addEventListener("pointermove", function (e) {
      if (!drag) return;
      if (drag.kind === "pan") {
        S.ui.view.ox = drag.ox + (e.clientX - drag.cx); S.ui.view.oy = drag.oy + (e.clientY - drag.cy);
        drag.moved = true; render(); return;
      }
      if (drag.kind === "hoist") {
        if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 4) return;
        drag.moved = true; dragHoist = drag;
        var ht = drag.t, a = (ht.angle || 0) * Math.PI / 180, o = TLA.rig.geometry.endPoint(ht, 0), hw = worldFromEvent(e);
        var along = (hw.x - o.x) * Math.cos(a) + (hw.y - o.y) * Math.sin(a);
        var val = snapHoist(ht, drag.s, along), cur = S.measureDisplay(drag.s, ht.length);
        if (Math.abs(val - cur) < 1e-6) { render(); return; }
        S.measureSet(drag.s, val, ht.length);
        S.emit(); return;
      }
      var w = worldFromEvent(e), t = drag.t;
      var dx = w.x - drag.sx, dy = w.y - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) * S.ui.view.scale < 4) return;
      drag.moved = true;
      var nx = Math.round((drag.ox + dx) * 2) / 2, ny = Math.round((drag.oy + dy) * 2) / 2;
      if (!e.altKey) {
        // snap this truss' ends to other trusses' ends within 1.5 ft
        var best = null;
        var probe = { x: nx, y: ny, angle: t.angle, length: t.length };
        [0, t.length].forEach(function (d) {
          var p = TLA.rig.geometry.endPoint(probe, d);
          S.rig.trusses.forEach(function (o) {
            if (o.id === t.id) return;
            [0, o.length].forEach(function (od) {
              var q = TLA.rig.geometry.endPoint(o, od), dist = Math.hypot(q.x - p.x, q.y - p.y);
              if (dist < 1.5 && (!best || dist < best.dist)) best = { dist: dist, dx: q.x - p.x, dy: q.y - p.y };
            });
          });
        });
        if (best) { nx += best.dx; ny += best.dy; }
      }
      t.x = Math.round(nx * 1000) / 1000; t.y = Math.round(ny * 1000) / 1000;
      S.reconnect(); S.emit();
    });
    function end() {
      if (drag && (drag.kind === "truss" || drag.kind === "hoist") && drag.moved) S.commit();
      drag = null;
      if (dragHoist) { dragHoist = null; render(); }
    }
    root.addEventListener("pointerup", end);
    root.addEventListener("pointercancel", end);
    root.addEventListener("wheel", function (e) {
      e.preventDefault();
      var v = S.ui.view, r = root.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var f = e.deltaY < 0 ? 1.15 : 1 / 1.15, ns = Math.max(1.5, Math.min(80, v.scale * f));
      var wx = (mx - v.ox) / v.scale, wy = (v.oy - my) / v.scale;
      v.scale = ns; v.ox = mx - wx * ns; v.oy = my + wy * ns;
      render();
    }, { passive: false });
    window.addEventListener("resize", render);
  }

  TLA.plan = {
    mount: function (store, container) { S = store; root = container; bindEvents(); },
    render: render, fit: function () { fit(); render(); },
    zoom: function (f) { if (!root) return; var v = S.ui.view, mx = root.clientWidth / 2, my = root.clientHeight / 2, ns = Math.max(1.5, Math.min(80, v.scale * f)), wx = (mx - v.ox) / v.scale, wy = (v.oy - my) / v.scale; v.scale = ns; v.ox = mx - wx * ns; v.oy = my + wy * ns; render(); },
    trussStatus: trussStatus, utilClass: utilClass, upstream: upstream, trussClass: trussClass, svgElement: function () { return svg; }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
