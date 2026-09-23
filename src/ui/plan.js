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
    if (mode === "layer") return "c-layer-" + (((results.layers[t.id] || 1) - 1) % 6 + 1);
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
    svg = el("svg", { width: W, height: H, "class": "plan-svg" }, root);
    var X = function (x) { return v.ox + x * sc; }, Y = function (y) { return v.oy - y * sc; };

    // grid
    var step = sc >= 20 ? 1 : sc >= 8 ? 5 : sc >= 4 ? 10 : 20;
    var gg = el("g", { "class": "grid" }, svg);
    var x0 = Math.floor((0 - v.ox) / sc / step) * step, x1 = Math.ceil((W - v.ox) / sc / step) * step;
    var y0 = Math.floor((v.oy - H) / sc / step) * step, y1 = Math.ceil(v.oy / sc / step) * step;
    for (var gx = x0; gx <= x1; gx += step) el("line", { x1: X(gx), y1: 0, x2: X(gx), y2: H, "class": gx % (step * 5) === 0 ? "major" : "" }, gg);
    for (var gy = y0; gy <= y1; gy += step) el("line", { x1: 0, y1: Y(gy), x2: W, y2: Y(gy), "class": gy % (step * 5) === 0 ? "major" : "" }, gg);

    var hl = null;
    if (S.sel.support && S.sel.truss) hl = upstream(results, S.sel.truss);

    function bw(t, res) { return Math.max(3, sc * TLA.rig.widthFt(t, res && res.dbTruss)); }
    var bodyW = 6;
    var order = S.rig.trusses.slice().sort(function (a, b) { return (results.layers[a.id] || 0) - (results.layers[b.id] || 0); });

    // trusses
    order.forEach(function (t) {
      if (t.isBlock) return;
      var res = results.trusses[t.id];
      var a = TLA.rig.geometry.endPoint(t, 0), b = TLA.rig.geometry.endPoint(t, t.length), bodyW = bw(t, res);
      var grp = el("g", { "data-truss": t.id, "class": "truss " + trussClass(t, res, results) + (S.sel.truss === t.id ? " selected" : "") + (hl && !hl[t.id] ? " dim" : "") }, svg);
      var tip = el("title", null, grp);
      tip.textContent = t.name + " - " + TLA.units.f("len", t.length, 2) + (res ? " - layer " + results.layers[t.id] : " - not solved");
      el("line", { x1: X(a.x), y1: Y(a.y), x2: X(b.x), y2: Y(b.y), "class": "body", "stroke-width": bodyW }, grp);
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
          var lg = el("g", { "class": "load" + (l.mirrored ? " ghost" : "") }, grp);
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
            var hg = el("g", { "data-hoist": s.id, "data-truss-of": t.id, "class": "hoist " + (sr.hoist.status === "Check" ? "c-warn" : sr.hoist.status !== "Good" ? "c-fail" : sr.hoist.dynamicOver ? "c-warn" : "c-ok") + (selected ? " selected" : "") }, grp);
            var tt = el("title", null, hg);
            tt.textContent = (s.name || "Hoist") + ": " + TLA.units.f("w", sr.hoist.staticLoad, 0) + " static / " + TLA.units.f("w", sr.hoist.capacity, 0) + " capacity (" + sr.hoist.status + ")";
            el("circle", { cx: X(p.x), cy: Y(p.y), r: Math.max(6, sc * 0.5) }, hg);
            if (sc >= 4 && S.ui.showLabels) {
              var off = bodyW / 2 + 9;
              var lt = el("text", { x: X(p.x) - nx * off, y: Y(p.y) + ny * off + 4, "class": "lbl hoist-lbl", "text-anchor": nx > 0.3 ? "end" : nx < -0.3 ? "start" : "middle" }, hg);
              lt.textContent = fmt(TLA.units.v("w", sr.hoist.staticLoad));
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
        var c = TLA.rig.geometry.endPoint(t, t.length / 2);
        var lab = el("text", { x: X(c.x) + nx * (bodyW / 2 + (t.isBlock ? 12 : 8)), y: Y(c.y) - ny * (bodyW / 2 + (t.isBlock ? 12 : 8)) + 4, "class": "lbl name", "text-anchor": nx > 0.3 ? "start" : nx < -0.3 ? "end" : "middle" }, grp);
        lab.textContent = t.isBlock ? t.name : t.name + " (" + TLA.units.mark(t.length, 1) + ")";
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
      if (hoist) {
        S.sel = { truss: hoist.getAttribute("data-truss-of"), support: hoist.getAttribute("data-hoist") };
        S.emit(); return;
      }
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or released pointer */ }
      if (tr) {
        var t = S.truss(tr.getAttribute("data-truss"));
        S.sel = { truss: t.id, support: null };
        if (t.isBlock || t.anchor) { S.emit(); return; }
        var w = worldFromEvent(e);
        drag = { kind: "truss", t: t, sx: w.x, sy: w.y, ox: t.x, oy: t.y, moved: false };
        S.emit();
      } else {
        S.sel = { truss: null, support: null };
        drag = { kind: "pan", cx: e.clientX, cy: e.clientY, ox: S.ui.view.ox, oy: S.ui.view.oy, moved: false };
        S.emit();
      }
    });
    root.addEventListener("pointermove", function (e) {
      if (!drag) return;
      if (drag.kind === "pan") {
        S.ui.view.ox = drag.ox + (e.clientX - drag.cx); S.ui.view.oy = drag.oy + (e.clientY - drag.cy);
        drag.moved = true; render(); return;
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
      if (drag && drag.kind === "truss" && drag.moved) S.commit();
      drag = null;
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
    trussStatus: trussStatus, utilClass: utilClass, upstream: upstream, trussClass: trussClass, svgElement: function () { return svg; }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
