/* Stiffness check of the whole rig (plan-view grillage, finite elements).
 *
 * The load-path solver in rig.js treats every carrying truss as an UNYIELDING support for the trusses bolted to it.
 * That is exact only when the carrier is held up at (or close to) each connection. When a carrier is flexible and a
 * truss bolted to it has its own hoist, the carrier sags, the bolted truss sheds load to its own hoist, and the
 * load-path method UNDER-estimates that hoist. This module solves the whole rig with deflection compatibility and is
 * used as a check on the load-path numbers.
 *
 * Model: every truss is an Euler-Bernoulli beam (bending EI, torsion GJ) in the horizontal plane, loaded vertically.
 * Hoists are rigid vertical supports. Bolted connections (corner blocks) share vertical deflection; clamps/stacks share
 * vertical deflection only. Two joint models bracket the real bolted corner:
 *   hinged - connections carry vertical force only (no bending or torsion through the joint)
 *   rigid  - corner-block connections also carry bending and torsion (GJ = gjRatio x EI)
 * Only relative stiffness matters: EI is estimated from the manufacturer's published deflection (RMMS Lesson 21,
 * 20.5 x 20.5 plated: about 2.4e9 lb-in2) scaled by depth cubed, and can be scaled per truss (truss.eiScale). */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});

  function estimateEI(entry, t) {
    var d = String((entry && entry.description) || ""), ei = 1e9;
    var m = d.match(/(\d+(?:\.\d+)?)\s*"?\s*x\s*(\d+(?:\.\d+)?)/i);
    if (/pipe/i.test(d)) ei = 9e6;
    else if (m) ei = 2.4e9 * Math.pow(Math.min(parseFloat(m[1]), parseFloat(m[2])) / 20.5, 3);
    else { var n = d.match(/(\d+(?:\.\d+)?)/); if (n) ei = 2.4e9 * Math.pow(parseFloat(n[1]) / 20.5, 3) * 0.6; }
    return (ei / 144) * ((t && t.eiScale) || 1);       // lb-ft2
  }

  function key(x, y) { return Math.round(x * 1000) + "," + Math.round(y * 1000); }

  /** Solve one joint model. Returns { reactions: {truss.id:support.id -> lb}, total }. */
  function solveModel(model, rigid, gjRatio) {
    var beams = model.beams, links = model.links;
    var parent = [];
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
    // dof ids: for every (beam,node): w, rx, ry
    var count = 0;
    beams.forEach(function (bm) { bm.nodes.forEach(function (nd) { nd.w = count++; nd.rx = count++; nd.ry = count++; }); });
    for (var i = 0; i < count; i++) parent.push(i);
    links.forEach(function (lk) {
      var a = beams[lk.a].nodes[lk.na], b = beams[lk.b].nodes[lk.nb];
      union(a.w, b.w);
      if (rigid && lk.rigid) { union(a.rx, b.rx); union(a.ry, b.ry); }
    });
    var map = {}, n = 0;
    function dof(id) { var r = find(id); if (map[r] === undefined) map[r] = n++; return map[r]; }
    beams.forEach(function (bm) { bm.nodes.forEach(function (nd) { nd.W = dof(nd.w); nd.RX = dof(nd.rx); nd.RY = dof(nd.ry); }); });
    var K = []; for (i = 0; i < n; i++) K.push(new Float64Array(n));
    var F = new Float64Array(n);
    beams.forEach(function (bm) {
      var c = bm.c, s = bm.s, EI = bm.EI, GJ = gjRatio * bm.EI;
      for (var e = 0; e < bm.nodes.length - 1; e++) {
        var a = bm.nodes[e], b = bm.nodes[e + 1], L = b.d - a.d;
        if (L < 1e-9) continue;
        var dofs = [a.W, a.RX, a.RY, b.W, b.RX, b.RY];
        var k = EI / (L * L * L);
        var kb = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
        var Kl = []; for (var r = 0; r < 6; r++) Kl.push(new Float64Array(6));
        var bi = [0, 1, 3, 4];
        for (r = 0; r < 4; r++) for (var q = 0; q < 4; q++) Kl[bi[r]][bi[q]] += k * kb[r][q];
        var kt = GJ / L; Kl[2][2] += kt; Kl[5][5] += kt; Kl[2][5] -= kt; Kl[5][2] -= kt;
        // local [w, slope, twist] = T * global [w, thetaX, thetaY]
        var T = []; for (r = 0; r < 6; r++) T.push(new Float64Array(6));
        [0, 3].forEach(function (o) { T[o][o] = 1; T[o + 1][o + 1] = s; T[o + 1][o + 2] = -c; T[o + 2][o + 1] = c; T[o + 2][o + 2] = s; });
        // Kg = T' Kl T
        var KlT = []; for (r = 0; r < 6; r++) { KlT.push(new Float64Array(6)); for (q = 0; q < 6; q++) { var v = 0; for (var m = 0; m < 6; m++) v += Kl[r][m] * T[m][q]; KlT[r][q] = v; } }
        for (r = 0; r < 6; r++) for (q = 0; q < 6; q++) { var v2 = 0; for (var m2 = 0; m2 < 6; m2++) v2 += T[m2][r] * KlT[m2][q]; K[dofs[r]][dofs[q]] += v2; }
        var w = bm.w, fl = [-w * L / 2, -w * L * L / 12, 0, -w * L / 2, w * L * L / 12, 0];
        for (r = 0; r < 6; r++) { var f = 0; for (var m3 = 0; m3 < 6; m3++) f += T[m3][r] * fl[m3]; F[dofs[r]] += f; }
      }
      bm.nodes.forEach(function (nd) { if (nd.P) F[nd.W] -= nd.P; });
    });
    var fixed = {}; model.supports.forEach(function (sp) { fixed[beams[sp.b].nodes[sp.n].W] = true; });
    var free = []; for (i = 0; i < n; i++) if (!fixed[i]) free.push(i);
    var m = free.length, A = [], bvec = new Float64Array(m), maxd = 0;
    for (i = 0; i < m; i++) { A.push(new Float64Array(m)); for (var j = 0; j < m; j++) A[i][j] = K[free[i]][free[j]]; bvec[i] = F[free[i]]; if (A[i][i] > maxd) maxd = A[i][i]; }
    var rotDof = {}; beams.forEach(function (bm) { bm.nodes.forEach(function (nd) { rotDof[nd.RX] = rotDof[nd.RY] = true; }); });
    var eps = maxd * 1e-9;
    for (i = 0; i < m; i++) if (rotDof[free[i]]) A[i][i] += eps;      // removes torsion rigid-body modes in the hinged model
    for (var cidx = 0; cidx < m; cidx++) {
      var p = cidx; for (var r2 = cidx + 1; r2 < m; r2++) if (Math.abs(A[r2][cidx]) > Math.abs(A[p][cidx])) p = r2;
      if (Math.abs(A[p][cidx]) < 1e-14 * (maxd || 1)) return { ok: false };
      var tmp = A[cidx]; A[cidx] = A[p]; A[p] = tmp; var tb = bvec[cidx]; bvec[cidx] = bvec[p]; bvec[p] = tb;
      for (r2 = cidx + 1; r2 < m; r2++) { var fct = A[r2][cidx] / A[cidx][cidx]; if (fct === 0) continue; for (var c2 = cidx; c2 < m; c2++) A[r2][c2] -= fct * A[cidx][c2]; bvec[r2] -= fct * bvec[cidx]; }
    }
    var u = new Float64Array(m);
    for (i = m - 1; i >= 0; i--) { var sum = bvec[i]; for (j = i + 1; j < m; j++) sum -= A[i][j] * u[j]; u[i] = sum / A[i][i]; }
    var U = new Float64Array(n); free.forEach(function (gi, ii) { U[gi] = u[ii]; });
    var reactions = {}, byDof = {}, total = 0;
    model.supports.forEach(function (sp) { var d = beams[sp.b].nodes[sp.n].W; (byDof[d] = byDof[d] || []).push(sp); });
    Object.keys(byDof).forEach(function (d) {
      d = +d; var row = K[d], r = 0; for (var jj = 0; jj < n; jj++) r += row[jj] * U[jj]; r -= F[d];
      total += r; byDof[d].forEach(function (sp) { reactions[sp.id] = r / byDof[d].length; });
    });
    return { ok: true, reactions: reactions, total: total };
  }

  /** Build the beam/link/support model from a solved rig. */
  function build(rig, results, db) {
    var G = TLA.rig.geometry, beams = [], index = {}, links = [], supports = [], extraLoads = [];
    var byId = {}; rig.trusses.forEach(function (t) { byId[t.id] = t; });
    rig.trusses.forEach(function (t) {
      if (t.isBlock) return;
      var res = results.trusses[t.id]; if (!res) return;
      var a = (t.angle || 0) * Math.PI / 180, entry = res.dbTruss;
      var bm = { t: t, c: Math.cos(a), s: Math.sin(a), L: t.length, EI: estimateEI(entry, t), w: (t.weightless ? 0 : (entry.weight_per_ft_lb || 0)) + (Number(t.wallWeight) || 0) / (t.length || 1), pts: { 0: {}, [t.length]: {} } };
      index[t.id] = beams.length; beams.push(bm);
    });
    function pt(bm, d) {
      d = Math.min(Math.max(d, 0), bm.L);
      for (var k in bm.pts) if (Math.abs(+k - d) < 1e-6) return +k;
      bm.pts[d] = {}; return d;
    }
    beams.forEach(function (bm) {
      var res = results.trusses[bm.t.id];
      res.beam.loads.forEach(function (l) { if (l.injected) return; var d = pt(bm, l.distance); bm.pts[d].P = (bm.pts[d].P || 0) + l.weight; });
    });
    rig.trusses.forEach(function (t) {
      var host = t.isBlock ? byId[t.host || (t.attach && t.attach.b)] : null;
      // hoists on trusses and on blocks
      t.supports.forEach(function (s) {
        if (s.kind === "hoist") {
          var owner = t.isBlock ? host : t, d = t.isBlock ? blockCentre(t) : s.distance;
          if (!owner || index[owner.id] === undefined) return;
          var bm = beams[index[owner.id]], dd = pt(bm, d);
          bm.pts[dd].hoist = bm.pts[dd].hoist || []; bm.pts[dd].hoist.push(t.id + ":" + s.id);
        }
      });
      function blockCentre(b) { var hh = byId[b.host || (b.attach && b.attach.b)]; var s0 = b.supports.filter(function (x) { return x.kind === "truss" && x.onTruss === hh.id; })[0]; return s0 ? s0.onDistance : 0; }
    });
    // block weights at their position on the host line
    rig.trusses.forEach(function (b) {
      if (!b.isBlock) return;
      var hh = byId[b.host || (b.attach && b.attach.b)], r = results.trusses[b.id];
      if (!hh || index[hh.id] === undefined || !r || !r.block) return;
      var s0 = b.supports.filter(function (x) { return x.kind === "truss" && x.onTruss === hh.id; })[0];
      var bm = beams[index[hh.id]], d = pt(bm, s0 ? s0.onDistance : 0);
      bm.pts[d].P = (bm.pts[d].P || 0) + r.block.weight;
    });
    // connections
    var pending = [];
    rig.trusses.forEach(function (t) {
      if (t.isBlock) return;
      t.supports.forEach(function (s) {
        if (s.kind !== "truss") return;
        var u = byId[s.onTruss]; if (!u || index[t.id] === undefined) return;
        if (u.isBlock) {
          var hh = byId[u.host || (u.attach && u.attach.b)]; if (!hh || index[hh.id] === undefined || hh.id === t.id) return;
          var s0 = u.supports.filter(function (x) { return x.kind === "truss" && x.onTruss === hh.id; })[0];
          pending.push({ a: t.id, da: s.distance, b: hh.id, db: s0 ? s0.onDistance : 0, rigid: true });
        } else if (index[u.id] !== undefined) pending.push({ a: t.id, da: s.distance, b: u.id, db: s.onDistance, rigid: false });
      });
    });
    pending.forEach(function (p) { p.na = pt(beams[index[p.a]], p.da); p.nb = pt(beams[index[p.b]], p.db); });
    beams.forEach(function (bm) {
      bm.nodes = Object.keys(bm.pts).map(Number).sort(function (x, y) { return x - y; }).map(function (d) { return { d: d, P: bm.pts[d].P || 0, hoist: bm.pts[d].hoist }; });
    });
    pending.forEach(function (p) {
      var A = beams[index[p.a]], B = beams[index[p.b]];
      var ia = A.nodes.findIndex(function (n) { return Math.abs(n.d - p.na) < 1e-6; }), ib = B.nodes.findIndex(function (n) { return Math.abs(n.d - p.nb) < 1e-6; });
      links.push({ a: index[p.a], na: ia, b: index[p.b], nb: ib, rigid: p.rigid });
    });
    beams.forEach(function (bm, bi) {
      bm.nodes.forEach(function (nd, ni) { (nd.hoist || []).forEach(function (id) { supports.push({ b: bi, n: ni, id: id }); }); });
    });
    return { beams: beams, links: links, supports: supports };
  }

  var last = { sig: null, out: null };
  function signature(rig, results) {
    // plan position does not change the stiffness solution (only distances and angles do), so dragging reuses the last solve
    return JSON.stringify(rig, function (k, v) { return k === "x" || k === "y" ? undefined : v; }) + "|" + (results.totals ? results.totals.applied : "");
  }

  function compute(rig, results, db, opts) {
    var out = { ok: false };
    if (results.unsolved && results.unsolved.length) { out.note = "Not run: the rig has an unsolved load-path loop."; return out; }
    var model = build(rig, results, db), dofs = 0;
    model.beams.forEach(function (bm) { dofs += bm.nodes.length * 3; });
    if (!model.supports.length) { out.note = "No hoists."; return out; }
    if (dofs > 1600) { out.note = "Rig too large for the stiffness check (" + dofs + " degrees of freedom)."; return out; }
    var hinged = solveModel(model, false, 0), rigid = solveModel(model, true, opts.gjRatio || 0.3);
    if (!hinged.ok || !rigid.ok) { out.note = "The stiffness model is unstable (a truss is not held up anywhere)."; return out; }
    out.ok = true; out.hinged = hinged; out.rigid = rigid;
    return out;
  }

  /** Solve hinged and rigid models and annotate results.hoists with the stiffness-based loads. */
  function annotate(rig, results, db, opts) {
    opts = opts || {};
    var sig = signature(rig, results), out;
    if (last.sig === sig && last.out) out = last.out;
    else { out = compute(rig, results, db, opts); last = { sig: sig, out: out }; }
    results.compat = out;
    if (!out.ok) return out;
    results.hoists.forEach(function (h) {
      var id = h.truss + ":" + h.support, chain = h.hoist.hoistChain, extra = h.hoist.staticLoad - h.reaction - chain;
      var lp = h.hoist.staticLoad, hs = out.hinged.reactions[id], rs = out.rigid.reactions[id];
      if (hs === undefined || rs === undefined) return;
      var env = Math.max(lp, hs + chain + extra, rs + chain + extra);
      h.compat = { hinged: hs + chain + extra, rigid: rs + chain + extra, envelope: env };
      h.hoist.compat = h.compat;
      var higher = env > lp + Math.max(0.05 * lp, 20);
      h.compat.higher = higher;
      if (higher) {
        var cap = h.hoist.capacity;
        if (env > cap && h.hoist.status === "Good") h.hoist.status = "Check";
        results.warnings.push({ truss: h.truss, message: h.trussName + " " + (h.supportName || "hoist") + " at " + (Math.round(h.distance * 10) / 10) + " ft: a stiffness check puts it as high as " + Math.round(env) + " lb (load-path method: " + Math.round(lp) + " lb)" + (env > cap ? " - over its " + Math.round(cap) + " lb capacity" : "") });
      }
    });
    return out;
  }

  TLA.grillage = { annotate: annotate, build: build, solveModel: solveModel, estimateEI: estimateEI };
})(typeof globalThis !== "undefined" ? globalThis : window);
