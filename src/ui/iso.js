/* Isometric / orbit view of the rig. Trusses are drawn in one plane (a bolted box); an optional per-truss height (t.z) raises a truss. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var NS = "http://www.w3.org/2000/svg";
  var S, root, svg;

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function fmt(n) { return Math.abs(n) >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString(); }
  function view() { return S.ui.iso || (S.ui.iso = { yaw: 35, pitch: 32, scale: 8, ox: 400, oy: 300, fit: true }); }

  function project(x, y, z) {
    var v = view(), a = v.yaw * Math.PI / 180, p = v.pitch * Math.PI / 180;
    var rx = x * Math.cos(a) - y * Math.sin(a), ry = x * Math.sin(a) + y * Math.cos(a);
    return { X: v.ox + rx * v.scale, Y: v.oy - (ry * Math.sin(p) + z * Math.cos(p)) * v.scale, d: ry * Math.cos(p) - z * Math.sin(p) };
  }

  function zOf(t, depth) {
    if (typeof t.z === "number") return t.z;
    depth = depth || 0;
    if (depth > 6) return 0;
    // a truss stacked above / clamped below another sits one truss depth above / below it
    var s = t.supports.filter(function (x) { return x.kind === "truss" && (x.mount === "above" || x.mount === "below") && S.truss(x.onTruss) && !S.truss(x.onTruss).isBlock; })[0];
    if (!s) return 0;
    return zOf(S.truss(s.onTruss), depth + 1) + (s.mount === "above" ? 1.1 : -1.1);
  }
  function maxZ() { return S.rig.trusses.reduce(function (m, t) { return Math.max(m, zOf(t)); }, 0); }

  function fit() {
    var v = view(), ts = S.rig.trusses;
    if (!ts.length || !root) return;
    var ceil = maxZ() + 12;
    v.scale = 1; v.ox = 0; v.oy = 0;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    ts.forEach(function (t) {
      [0, t.length].forEach(function (d) {
        var pt = TLA.rig.geometry.endPoint(t, d);
        [0, ceil].forEach(function (z) { var q = project(pt.x, pt.y, z); minX = Math.min(minX, q.X); maxX = Math.max(maxX, q.X); minY = Math.min(minY, q.Y); maxY = Math.max(maxY, q.Y); });
      });
    });
    var W = root.clientWidth || 800, H = root.clientHeight || 500, pad = 70;
    var sc = Math.min((W - pad * 2) / Math.max(maxX - minX, 1), (H - pad * 2) / Math.max(maxY - minY, 1));
    v.scale = Math.max(1.5, Math.min(30, sc));
    v.ox = (W - (maxX - minX) * v.scale) / 2 - minX * v.scale;
    v.oy = (H - (maxY - minY) * v.scale) / 2 - minY * v.scale;
    v.fit = false;
  }

  function render() {
    if (!root) return;
    var v = view();
    if (v.fit) fit();
    var results = S.results, W = root.clientWidth || 800, H = root.clientHeight || 500;
    root.textContent = "";
    svg = el("svg", { width: W, height: H, "class": "plan-svg iso" }, root);
    var ceilZ = maxZ() + 12;
    var hl = S.sel.support && S.sel.truss ? TLA.plan.upstream(results, S.sel.truss) : null;

    // ground reference grid
    var gg = el("g", { "class": "grid" }, svg), ext = 80;
    for (var i = -ext; i <= ext; i += 10) {
      var a = project(i, -ext, 0), b = project(i, ext, 0), c = project(-ext, i, 0), d = project(ext, i, 0);
      el("line", { x1: a.X, y1: a.Y, x2: b.X, y2: b.Y }, gg); el("line", { x1: c.X, y1: c.Y, x2: d.X, y2: d.Y }, gg);
    }

    var items = S.rig.trusses.map(function (t) {
      var z = zOf(t), m = TLA.rig.geometry.endPoint(t, t.length / 2);
      return { t: t, z: z, depth: project(m.x, m.y, z).d };
    }).sort(function (a, b) { return b.depth - a.depth; });

    var zById = {};
    items.forEach(function (it) { zById[it.t.id] = it.z; });

    items.forEach(function (it) {
      var t = it.t, z = it.z, res = results.trusses[t.id];
      var dim = hl && !hl[t.id];
      var grp = el("g", { "data-truss": t.id, "class": "truss " + TLA.plan.trussClass(t, res, results) + (S.sel.truss === t.id ? " selected" : "") + (dim ? " dim" : "") }, svg);
      var tip = el("title", null, grp); tip.textContent = t.name + " - " + t.length + " ft";
      var A = TLA.rig.geometry.endPoint(t, 0), B = TLA.rig.geometry.endPoint(t, t.length), bodyW = Math.max(3, v.scale * (t.isBlock ? 1 : TLA.rig.widthFt(t, res && res.dbTruss)));
      var pa = project(A.x, A.y, z), pb = project(B.x, B.y, z);
      // vertical drop shadow to ground for depth cue
      var ga = project(A.x, A.y, 0), gb = project(B.x, B.y, 0);
      el("line", { x1: ga.X, y1: ga.Y, x2: gb.X, y2: gb.Y, "class": "shadow", "stroke-width": bodyW * 0.6 }, grp);
      var sec = TLA.rig.sectionIn(t, res && res.dbTruss), hw = sec.w / 24, hh = sec.h / 24;
      if (sec.round) {
        el("line", { x1: pa.X, y1: pa.Y, x2: pb.X, y2: pb.Y, "class": "body", "stroke-width": bodyW, "stroke-linecap": "round" }, grp);
        el("line", { x1: pa.X, y1: pa.Y - bodyW * 0.18, x2: pb.X, y2: pb.Y - bodyW * 0.18, "class": "shine", "stroke-width": Math.max(1, bodyW * 0.3), "stroke-linecap": "round" }, grp);
      } else {
        var ang = (t.angle || 0) * Math.PI / 180, nxp = -Math.sin(ang) * hw, nyp = Math.cos(ang) * hw;
        var ends = [A, B];
        function K(e, sx, sz) { return project(ends[e].x + nxp * sx, ends[e].y + nyp * sx, z + hh * sz); }
        var faces = [
          { c: [K(0, -1, 1), K(0, 1, 1), K(1, 1, 1), K(1, -1, 1)], b: 1.18 },
          { c: [K(0, -1, -1), K(0, 1, -1), K(1, 1, -1), K(1, -1, -1)], b: 0.6 },
          { c: [K(0, -1, -1), K(0, -1, 1), K(1, -1, 1), K(1, -1, -1)], b: 0.85 },
          { c: [K(0, 1, -1), K(0, 1, 1), K(1, 1, 1), K(1, 1, -1)], b: 0.72 },
          { c: [K(0, -1, -1), K(0, 1, -1), K(0, 1, 1), K(0, -1, 1)], b: 0.95 },
          { c: [K(1, -1, -1), K(1, 1, -1), K(1, 1, 1), K(1, -1, 1)], b: 0.95 }
        ];
        faces.forEach(function (f) { f.d = f.c.reduce(function (a, q) { return a + q.d; }, 0) / 4; });
        faces.sort(function (a, b) { return b.d - a.d; });
        faces.forEach(function (f) {
          el("polygon", { points: f.c.map(function (q) { return q.X + "," + q.Y; }).join(" "), "class": "body3d", style: "filter:brightness(" + f.b + ")" }, grp);
        });
      }
      el("line", { x1: pa.X, y1: pa.Y, x2: pb.X, y2: pb.Y, "class": "hit", "stroke-width": Math.max(bodyW, 14) }, grp);
      if (res) {
        var P = res.beam.positions;
        [[0, P[0]], [P[P.length - 1], t.length]].forEach(function (sg) {
          if (sg[1] - sg[0] < 1e-6) return;
          var q1 = TLA.rig.geometry.endPoint(t, sg[0]), q2 = TLA.rig.geometry.endPoint(t, sg[1]);
          var a1 = project(q1.x, q1.y, z), a2 = project(q2.x, q2.y, z);
          el("line", { x1: a1.X, y1: a1.Y, x2: a2.X, y2: a2.Y, "class": "cant", "stroke-width": Math.max(1.5, bodyW * 0.3) }, grp);
        });
        if (S.ui.showLoads) {
          res.beam.loads.forEach(function (l) {
            if (l.injected) return;
            var q = TLA.rig.geometry.endPoint(t, l.distance), a1 = project(q.x, q.y, z);
            el("path", { d: "M" + a1.X + " " + (a1.Y + bodyW * 0.5) + " l -3.5 8 l 7 0 z", "class": "arrow" + (l.mirrored ? " ghost" : "") }, grp);
          });
        }
      }
      var mid = TLA.rig.geometry.endPoint(t, t.length / 2), pm = project(mid.x, mid.y, z);
      if (S.ui.showLabels) { var lab = el("text", { x: pm.X, y: pm.Y - bodyW - 4, "class": "lbl name", "text-anchor": "middle" }, grp); lab.textContent = t.name; }

      if (res) res.supports.forEach(function (sr) {
        var s = sr.support, q = TLA.rig.geometry.endPoint(t, s.distance), p0 = project(q.x, q.y, z);
        if (s.kind === "hoist") {
          var top = project(q.x, q.y, ceilZ);
          var cls = sr.hoist.status === "Check" ? "c-warn" : sr.hoist.status !== "Good" ? "c-fail" : sr.hoist.dynamicOver ? "c-warn" : "c-ok";
          var hg = el("g", { "data-hoist": s.id, "data-truss-of": t.id, "class": "hoist " + cls + (S.sel.support === s.id ? " selected" : "") + (dim ? " dim" : "") }, svg);
          el("line", { x1: p0.X, y1: p0.Y, x2: top.X, y2: top.Y, "class": "chain" }, hg);
          el("circle", { cx: top.X, cy: top.Y, r: 5 }, hg);
          var t2 = el("text", { x: top.X, y: top.Y - 9, "class": "lbl hoist-lbl", "text-anchor": "middle" }, hg); t2.textContent = fmt(sr.hoist.staticLoad);
          var ti = el("title", null, hg); ti.textContent = (s.name || "Hoist") + ": " + fmt(sr.hoist.staticLoad) + " lb of " + fmt(sr.hoist.capacity) + " lb (" + sr.hoist.status + ")";
        } else {
          var u = S.truss(s.onTruss);
          if (u) {
            var uq = TLA.rig.geometry.endPoint(u, s.onDistance), p1 = project(uq.x, uq.y, zById[u.id] != null ? zById[u.id] : 0);
            el("line", { x1: p0.X, y1: p0.Y, x2: p1.X, y2: p1.Y, "class": "link" }, svg);
            el("circle", { cx: p1.X, cy: p1.Y, r: 3, "class": "ring" }, svg);
          }
        }
      });
    });
  }

  function mount(store, container) {
    S = store; root = container;
    var drag = null;
    root.addEventListener("pointerdown", function (e) {
      var hoist = e.target.closest && e.target.closest("[data-hoist]"), tr = e.target.closest && e.target.closest("[data-truss]");
      if (hoist) { S.sel = { truss: hoist.getAttribute("data-truss-of"), support: hoist.getAttribute("data-hoist") }; S.emit(); return; }
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (tr) { S.sel = { truss: tr.getAttribute("data-truss"), support: null }; S.emit(); return; }
      S.sel = { truss: null, support: null };
      var v = view();
      drag = { cx: e.clientX, cy: e.clientY, yaw: v.yaw, pitch: v.pitch, ox: v.ox, oy: v.oy, pan: e.shiftKey || e.button === 2 };
      S.emit();
    });
    root.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var v = view(), dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
      if (drag.pan) { v.ox = drag.ox + dx; v.oy = drag.oy + dy; }
      else { v.yaw = drag.yaw + dx * 0.4; v.pitch = Math.max(5, Math.min(85, drag.pitch + dy * 0.3)); }
      render();
    });
    function end() { drag = null; }
    root.addEventListener("pointerup", end); root.addEventListener("pointercancel", end);
    root.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    root.addEventListener("wheel", function (e) {
      e.preventDefault();
      var v = view(), r = root.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      var f = e.deltaY < 0 ? 1.15 : 1 / 1.15, ns = Math.max(1.5, Math.min(80, v.scale * f));
      v.ox = mx - (mx - v.ox) * ns / v.scale; v.oy = my - (my - v.oy) * ns / v.scale; v.scale = ns;
      render();
    }, { passive: false });
    window.addEventListener("resize", function () { if (S.ui.tab === "iso") render(); });
  }

  TLA.iso = { mount: mount, render: render, fit: function () { view().fit = true; render(); } };
})(typeof globalThis !== "undefined" ? globalThis : window);
