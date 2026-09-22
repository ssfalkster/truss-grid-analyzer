/* Stiffness check of the whole rig (plan-view grillage, finite elements) - the "grillage method" used for bridge
 * decks and other bolted grids of beams: idealize the structure as beams meeting at nodes and solve with the direct
 * stiffness (matrix) method. The textbook grillage joint is RIGID (full bending and torsional continuity at every
 * node); only the ground/hoist supports are pinned. RMMS Lesson 40 confirms this independently: its worked CalcForge
 * 3D-frame example only sets the hoist/ground Restraints to "Pinned" and leaves the truss-to-truss joints continuous.
 *
 * The load-path solver in rig.js treats every carrying truss as an UNYIELDING support for the trusses bolted to it.
 * That is exact only when the carrier is held up at (or close to) each connection. When a carrier is flexible and a
 * truss bolted to it has its own hoist, the carrier sags, the bolted truss sheds load to its own hoist, and the
 * load-path method UNDER-estimates that hoist. This module solves the whole rig with deflection compatibility and is
 * used as a check on the load-path numbers.
 *
 * Model: every truss is an Euler-Bernoulli beam (bending EI, torsion GJ) in the horizontal plane, loaded vertically.
 * Hoists are rigid vertical supports. Bolted connections (corner blocks) always share vertical deflection; two joint
 * models bracket how much of the real bolted corner's moment/torsion actually carries across, since no manufacturer
 * publishes a stiffness for the corner-block hardware itself (RMMS Lesson 39: this is "precision guesswork"):
 *   hinged - connections carry vertical force only (the grillage method's rigid-joint assumption relaxed to a lower
 *            bound, for a corner block that turns out not to hold the joint square under load)
 *   rigid  - the textbook grillage assumption: bending and torsion also pass through the corner block
 * EI and GJ are estimated per truss type from its connector (RMMS Lesson 39):
 *   - EI is scaled from the manufacturer's published deflection (RMMS Lesson 21, 20.5 x 20.5 PLATED: about
 *     2.4e9 lb-in2) by depth cubed. That anchor point is itself a plated truss, so plated/bolted trusses (and any
 *     truss type this can't classify) use it as-is. A spigoted truss keeps its chord continuous through every
 *     joint instead of relying on a bolted end plate, and Lesson 39's own worked example (a 20.5" truss's real
 *     bending stiffness falls to about a fifth of a solid beam's once you use its 13.75" bolt-hole spacing instead
 *     of its nominal depth) points the same way for stiffness, so spigoted types get a modest, capped bonus rather
 *     than that full ratio - a lattice truss is not a solid beam, and no direct measurement is available.
 *   - GJ/EI is a connector-dependent ratio, not a flat constant: a truss cross-section (box or triangle) is a closed
 *     loop, and a closed thin-walled section is far stiffer in torsion than an open one - but a plated joint breaks
 *     that loop's continuity every panel length, while a spigoted joint (a continuous pin through both chord halves)
 *     mostly preserves it. Pipe is a true closed round section. Can be scaled per truss (truss.eiScale, applied to
 *     both EI and GJ). */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});

  var GJ_RATIO = { pipe: 0.75, spigot: 0.4, plated: 0.15 };

  /** Best guess at a truss's connector type from its catalog description. Falls back to "plated" (the more flexible
   * assumption, and the one the EI baseline itself is anchored to) when the wording doesn't say. */
  function connectorType(d) {
    if (/pipe/i.test(d)) return "pipe";
    if (/spigot|\bfork\b|\bfrk\b|supertruss/i.test(d)) return "spigot";
    return "plated";
  }

  function estimateStiffness(entry, t) {
    var d = String((entry && entry.description) || ""), kind = connectorType(d), ei;
    if (kind === "pipe") ei = 9e6;
    else {
      var m = d.match(/(\d+(?:\.\d+)?)\s*"?\s*x\s*(\d+(?:\.\d+)?)/i);
      if (m) ei = 2.4e9 * Math.pow(Math.min(parseFloat(m[1]), parseFloat(m[2])) / 20.5, 3);
      else { var n = d.match(/(\d+(?:\.\d+)?)/); ei = n ? 2.4e9 * Math.pow(parseFloat(n[1]) / 20.5, 3) * 0.6 : 1e9; }
      if (kind === "spigot") ei *= 1.5;
    }
    ei = (ei / 144) * ((t && t.eiScale) || 1);          // lb-ft2
    return { EI: ei, GJ: ei * GJ_RATIO[kind] };
  }
  function estimateEI(entry, t) { return estimateStiffness(entry, t).EI; }

  function key(x, y) { return Math.round(x * 1000) + "," + Math.round(y * 1000); }

  /** One beam element between two nodes of a truss: local stiffness Kl on [w, slope, twist] at each end, the
   * transform T (local = T * global [w, thetaX, thetaY]), Kg = T' Kl T, and the local fixed-end loads for 1 lb/ft
   * down. w and forces are positive UP; slope = dw/dx along the truss. */
  function element(bm, L) {
    var c = bm.c, s = bm.s, k = bm.EI / (L * L * L), r, q, m;
    var kb = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]];
    var Kl = []; for (r = 0; r < 6; r++) Kl.push(new Float64Array(6));
    var bi = [0, 1, 3, 4];
    for (r = 0; r < 4; r++) for (q = 0; q < 4; q++) Kl[bi[r]][bi[q]] += k * kb[r][q];
    var kt = bm.GJ / L; Kl[2][2] += kt; Kl[5][5] += kt; Kl[2][5] -= kt; Kl[5][2] -= kt;
    var T = []; for (r = 0; r < 6; r++) T.push(new Float64Array(6));
    [0, 3].forEach(function (o) { T[o][o] = 1; T[o + 1][o + 1] = s; T[o + 1][o + 2] = -c; T[o + 2][o + 1] = c; T[o + 2][o + 2] = s; });
    var KlT = [], Kg = [];
    for (r = 0; r < 6; r++) { KlT.push(new Float64Array(6)); for (q = 0; q < 6; q++) { var v = 0; for (m = 0; m < 6; m++) v += Kl[r][m] * T[m][q]; KlT[r][q] = v; } }
    for (r = 0; r < 6; r++) { Kg.push(new Float64Array(6)); for (q = 0; q < 6; q++) { var v2 = 0; for (m = 0; m < 6; m++) v2 += T[m][r] * KlT[m][q]; Kg[r][q] = v2; } }
    var fl = [-L / 2, -L * L / 12, 0, -L / 2, L * L / 12, 0], fg = [];
    for (r = 0; r < 6; r++) { var f = 0; for (m = 0; m < 6; m++) f += T[m][r] * fl[m]; fg.push(f); }
    return { L: L, Kl: Kl, T: T, Kg: Kg, fl: fl, fg: fg };
  }

  /** Solve one joint model. Returns { ok, reactions: {truss.id:support.id -> lb}, total, ... } plus what forces() and
   * attribution need: the displacements U, load vector F, each node's dofs and solveF(F) for more load cases on the
   * same (already factorised) structure. */
  function solveModel(model, rigid) {
    var beams = model.beams, links = model.links;
    var parent = [];
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }
    // dof ids: for every (beam,node): w, rx, ry
    var count = 0, ids = [];
    beams.forEach(function (bm) { ids.push(bm.nodes.map(function () { var x = [count, count + 1, count + 2]; count += 3; return x; })); });
    for (var i = 0; i < count; i++) parent.push(i);
    links.forEach(function (lk) {
      var a = ids[lk.a][lk.na], b = ids[lk.b][lk.nb];
      union(a[0], b[0]);
      if (rigid && lk.rigid) { union(a[1], b[1]); union(a[2], b[2]); }
    });
    var map = {}, n = 0;
    function dof(id) { var r = find(id); if (map[r] === undefined) map[r] = n++; return map[r]; }
    var dofs = ids.map(function (bn) { return bn.map(function (x) { return [dof(x[0]), dof(x[1]), dof(x[2])]; }); });
    var K = []; for (i = 0; i < n; i++) K.push(new Float64Array(n));
    beams.forEach(function (bm, bi) {
      bm.els = bm.els || [];
      for (var e = 0; e < bm.nodes.length - 1; e++) {
        var L = bm.nodes[e + 1].d - bm.nodes[e].d;
        if (L < 1e-9) continue;
        var el = bm.els[e] || (bm.els[e] = element(bm, L)), dd = dofs[bi][e].concat(dofs[bi][e + 1]);
        for (var r = 0; r < 6; r++) for (var q = 0; q < 6; q++) K[dd[r]][dd[q]] += el.Kg[r][q];
      }
    });
    /** Load vector for everything (origin undefined) or only the loads that belong to one truss (attribution). */
    function loadVector(origin) {
      var F = new Float64Array(n);
      beams.forEach(function (bm, bi) {
        if (origin === undefined || bm.t.id === origin) for (var e = 0; e < bm.nodes.length - 1; e++) {
          var el = bm.els[e]; if (!el) continue;
          var dd = dofs[bi][e].concat(dofs[bi][e + 1]);
          for (var r = 0; r < 6; r++) F[dd[r]] += bm.w * el.fg[r];
        }
        bm.nodes.forEach(function (nd, ni) {
          var P = origin === undefined ? nd.P : (nd.Pby && nd.Pby[origin]) || 0;
          if (P) F[dofs[bi][ni][0]] -= P;
        });
      });
      return F;
    }
    /** Load vector of a uniform load w (lb/ft, down) on one beam only. */
    function udlVector(bi, w) {
      var F = new Float64Array(n), bm = beams[bi];
      for (var e = 0; e < bm.nodes.length - 1; e++) {
        var el = bm.els[e]; if (!el) continue;
        var dd = dofs[bi][e].concat(dofs[bi][e + 1]);
        for (var r = 0; r < 6; r++) F[dd[r]] += w * el.fg[r];
      }
      return F;
    }
    var fixed = {}; model.supports.forEach(function (sp) { fixed[dofs[sp.b][sp.n][0]] = true; });
    var free = []; for (i = 0; i < n; i++) if (!fixed[i]) free.push(i);
    var m = free.length, A = [], maxd = 0;
    for (i = 0; i < m; i++) { A.push(new Float64Array(m)); for (var j = 0; j < m; j++) A[i][j] = K[free[i]][free[j]]; if (A[i][i] > maxd) maxd = A[i][i]; }
    var rotDof = {}; dofs.forEach(function (bn) { bn.forEach(function (x) { rotDof[x[1]] = rotDof[x[2]] = true; }); });
    var eps = maxd * 1e-9;
    for (i = 0; i < m; i++) if (rotDof[free[i]]) A[i][i] += eps;      // removes torsion rigid-body modes in the hinged model
    // LU factorisation with partial pivoting (in place; multipliers below the diagonal), kept for more load cases
    var perm = []; for (i = 0; i < m; i++) perm.push(i);
    for (var cidx = 0; cidx < m; cidx++) {
      var p = cidx; for (var r2 = cidx + 1; r2 < m; r2++) if (Math.abs(A[r2][cidx]) > Math.abs(A[p][cidx])) p = r2;
      if (Math.abs(A[p][cidx]) < 1e-14 * (maxd || 1)) return { ok: false, dof: free[cidx], dofs: dofs };
      var tmp = A[cidx]; A[cidx] = A[p]; A[p] = tmp; var tp = perm[cidx]; perm[cidx] = perm[p]; perm[p] = tp;
      var piv = A[cidx];
      for (r2 = cidx + 1; r2 < m; r2++) {
        var row = A[r2], fct = row[cidx] / piv[cidx]; row[cidx] = fct; if (fct === 0) continue;
        for (var c2 = cidx + 1; c2 < m; c2++) row[c2] -= fct * piv[c2];
      }
    }
    var byDof = {};
    model.supports.forEach(function (sp) { var d = dofs[sp.b][sp.n][0]; (byDof[d] = byDof[d] || []).push(sp); });
    function solveF(F) {
      var y = new Float64Array(m), ii, jj;
      for (ii = 0; ii < m; ii++) { var s = F[free[perm[ii]]], Ai = A[ii]; for (jj = 0; jj < ii; jj++) s -= Ai[jj] * y[jj]; y[ii] = s; }
      for (ii = m - 1; ii >= 0; ii--) { var s2 = y[ii], Ai2 = A[ii]; for (jj = ii + 1; jj < m; jj++) s2 -= Ai2[jj] * y[jj]; y[ii] = s2 / Ai2[ii]; }
      var U = new Float64Array(n); free.forEach(function (gi, k) { U[gi] = y[k]; });
      var reactions = {}, total = 0;
      Object.keys(byDof).forEach(function (d) {
        d = +d; var rowK = K[d], r = 0; for (var q = 0; q < n; q++) r += rowK[q] * U[q]; r -= F[d];
        total += r; byDof[d].forEach(function (sp) { reactions[sp.id] = r / byDof[d].length; });
      });
      return { U: U, u: y, reactions: reactions, total: total };
    }
    var F = loadVector(), sol = solveF(F);
    // The eps above only exists to pin down twist that nothing loads. If it ends up carrying real moment, a truss is
    // free to rotate (tip) - a mechanism, not a structure.
    var fsum = 0; for (i = 0; i < n; i++) fsum += Math.abs(F[i]);
    var leak = 0, leakDof = -1;
    for (i = 0; i < m; i++) if (rotDof[free[i]] && Math.abs(eps * sol.u[i]) > leak) { leak = Math.abs(eps * sol.u[i]); leakDof = free[i]; }
    if (leak > 1e-4 * Math.max(fsum, 1)) return { ok: false, dof: leakDof, dofs: dofs };
    return { ok: true, reactions: sol.reactions, total: sol.total, U: sol.U, F: F, dofs: dofs, supports: model.supports, rigid: rigid, loadVector: loadVector, udlVector: udlVector, solveF: solveF };
  }

  var JUMP_TOL = 1e-5;   // of the truss's largest moment: smaller steps are the solver's tiny twist stiffness, not a joint

  /** Member forces from a solved model: shear, bending moment and torque along every truss (same shape as the
   * load-path diagrams: points with shear just left/right and moment, sagging positive, plus extremes), and the
   * vertical force in every bolted connection (upward on the truss that is bolted, lb). wOf(bm) overrides the
   * uniform load a beam carries in this load case. */
  function forces(model, sol, wOf) {
    var beams = model.beams, U = sol.U, members = {}, ext = {};
    beams.forEach(function (bm, bi) {
      var nds = bm.nodes, w = wOf ? wOf(bm) : bm.w, seg = [];
      nds.forEach(function (nd, ni) { ext[bi + ":" + ni] = nd.P || 0; });
      for (var e = 0; e < nds.length - 1; e++) {
        var el = bm.els[e]; if (!el) continue;
        var da = sol.dofs[bi][e], db = sol.dofs[bi][e + 1], ug = [U[da[0]], U[da[1]], U[da[2]], U[db[0]], U[db[1]], U[db[2]]], ul = [], f = [], r, q;
        for (r = 0; r < 6; r++) { var v = 0; for (q = 0; q < 6; q++) v += el.T[r][q] * ug[q]; ul.push(v); }
        for (r = 0; r < 6; r++) { var v2 = -w * el.fl[r]; for (q = 0; q < 6; q++) v2 += el.Kl[r][q] * ul[q]; f.push(v2); }
        ext[bi + ":" + e] += f[0]; ext[bi + ":" + (e + 1)] += f[3];
        // end forces on the element: V up at the left end, moments in the slope sense; M(x) = -m1 + V1 x - w x^2 / 2
        seg[e] = { L: el.L, V: f[0], M0: -f[1], T: Math.abs(f[2]) };
      }
      var scale = 0;
      seg.forEach(function (sg) { if (sg) scale = Math.max(scale, Math.abs(sg.M0), Math.abs(sg.M0 + sg.V * sg.L - w * sg.L * sg.L / 2)); });
      var pts = [], out = { points: pts, w: w, length: bm.L, maxSag: 0, maxHog: 0, maxShear: 0, maxTorque: 0, atSag: 0, atHog: 0, atShear: 0 };
      nds.forEach(function (nd, ni) {
        var L = seg[ni - 1], R = seg[ni];
        var vl = L ? L.V - w * L.L : 0, vr = R ? R.V : 0;
        var ml = L ? L.M0 + L.V * L.L - w * L.L * L.L / 2 : null, mr = R ? R.M0 : null;
        if (ml !== null && mr !== null && Math.abs(ml - mr) > JUMP_TOL * scale + 1e-9) {
          // moment carried across a rigid joint from the truss bolted there
          pts.push({ x: nd.d, vl: vl, vr: vr, m: ml }); pts.push({ x: nd.d, vl: vl, vr: vr, m: mr, jump: true });
        } else pts.push({ x: nd.d, vl: vl, vr: vr, m: ml !== null ? ml : mr !== null ? mr : 0 });
        if (R && w > 0 && R.V > 0 && R.V - w * R.L < 0) pts.push({ x: nd.d + R.V / w, vl: 0, vr: 0, m: R.M0 + R.V * R.V / (2 * w), peak: true });
        if (R && R.T > out.maxTorque) out.maxTorque = R.T;
      });
      pts.forEach(function (p) {
        if (p.m > out.maxSag) { out.maxSag = p.m; out.atSag = p.x; }
        if (-p.m > out.maxHog) { out.maxHog = -p.m; out.atHog = p.x; }
        var v = Math.max(Math.abs(p.vl), Math.abs(p.vr));
        if (v > out.maxShear) { out.maxShear = v; out.atShear = p.x; }
      });
      out.maxMoment = Math.max(out.maxSag, out.maxHog);
      members[bm.t.id] = out;
    });
    // what is left at a node after the hoists there comes through its bolted connections: peel the link tree from
    // its leaves (a leaf node's residual is the force in its only link)
    sol.supports.forEach(function (sp) { ext[sp.b + ":" + sp.n] -= sol.reactions[sp.id]; });
    var edges = {}, adj = {}, linkForce = [];
    model.links.forEach(function (lk, li) {
      var A = lk.a + ":" + lk.na, B = lk.b + ":" + lk.nb; if (A === B) return;
      var k = A < B ? A + "|" + B : B + "|" + A;
      if (!edges[k]) { edges[k] = { u: A, v: B, links: [] }; (adj[A] = adj[A] || []).push(k); (adj[B] = adj[B] || []).push(k); }
      edges[k].links.push(li);
    });
    var queue = Object.keys(adj).filter(function (x) { return adj[x].length === 1; });
    while (queue.length) {
      var x = queue.pop(); if (!adj[x] || adj[x].length !== 1) continue;
      var k = adj[x][0], ed = edges[k], y = ed.u === x ? ed.v : ed.u, rx = ext[x];
      ed.links.forEach(function (li) { var lk = model.links[li]; linkForce[li] = (lk.a + ":" + lk.na === x ? rx : -rx) / ed.links.length; });
      ext[y] += rx; ext[x] = 0;
      adj[x] = []; adj[y] = adj[y].filter(function (z) { return z !== k; });
      if (adj[y].length === 1) queue.push(y);
    }
    var connections = {}, residual = 0, loop = false;
    model.links.forEach(function (lk, li) {
      if (linkForce[li] === undefined) { loop = true; return; }
      if (lk.feeder) connections[lk.feeder + ":" + lk.support] = (connections[lk.feeder + ":" + lk.support] || 0) + linkForce[li];
    });
    if (!loop) Object.keys(ext).forEach(function (kk) { residual = Math.max(residual, Math.abs(ext[kk])); });
    return { members: members, connections: connections, residual: residual, loop: loop };
  }

  /** Build the beam/link/support model from a solved rig. */
  function build(rig, results, db) {
    var G = TLA.rig.geometry, beams = [], index = {}, links = [], supports = [], extraLoads = [];
    var byId = {}; rig.trusses.forEach(function (t) { byId[t.id] = t; });
    rig.trusses.forEach(function (t) {
      if (t.isBlock) return;
      var res = results.trusses[t.id]; if (!res) return;
      var a = (t.angle || 0) * Math.PI / 180, entry = res.dbTruss, st = estimateStiffness(entry, t);
      var ws = t.weightless ? 0 : (entry.weight_per_ft_lb || 0);
      var bm = { t: t, c: Math.cos(a), s: Math.sin(a), L: t.length, EI: st.EI, GJ: st.GJ, w: ws + (Number(t.wallWeight) || 0) / (t.length || 1), wSelf: ws, pts: { 0: {}, [t.length]: {} } };
      index[t.id] = beams.length; beams.push(bm);
    });
    function pt(bm, d) {
      d = Math.min(Math.max(d, 0), bm.L);
      for (var k in bm.pts) if (Math.abs(+k - d) < 1e-6) return +k;
      bm.pts[d] = {}; return d;
    }
    // point loads remember which truss they belong to (for a hoist's load breakdown)
    function addP(bm, d, w, origin) {
      var p = bm.pts[d]; p.P = (p.P || 0) + w;
      p.Pby = p.Pby || {}; p.Pby[origin] = (p.Pby[origin] || 0) + w;
    }
    beams.forEach(function (bm) {
      var res = results.trusses[bm.t.id];
      res.beam.loads.forEach(function (l) { if (l.injected) return; addP(bm, pt(bm, l.distance), l.weight, bm.t.id); });
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
    // block weights, and any loads hung on a block, at the block's position on the host line
    rig.trusses.forEach(function (b) {
      if (!b.isBlock) return;
      var hh = byId[b.host || (b.attach && b.attach.b)], r = results.trusses[b.id];
      if (!hh || index[hh.id] === undefined || !r || !r.block) return;
      var s0 = b.supports.filter(function (x) { return x.kind === "truss" && x.onTruss === hh.id; })[0];
      var bm = beams[index[hh.id]], d = pt(bm, s0 ? s0.onDistance : 0);
      var own = r.beam.loads.reduce(function (a, l) { return a + (l.injected ? 0 : l.weight); }, 0);
      addP(bm, d, r.block.weight + own, b.id);
    });
    // hardware weight at a bolted connection (rig.js passes it to the truss it is bolted to, with the reaction)
    rig.trusses.forEach(function (t) {
      (t.supports || []).forEach(function (s) {
        var hw = Number(s.hardwareWeight) || 0, u = byId[s.onTruss];
        if (s.kind !== "truss" || !hw || !u || !results.trusses[t.id]) return;
        var owner = u, d = s.onDistance;
        if (u.isBlock) {
          owner = byId[u.host || (u.attach && u.attach.b)];
          var s1 = owner && u.supports.filter(function (x) { return x.kind === "truss" && x.onTruss === owner.id; })[0];
          d = s1 ? s1.onDistance : 0;
        }
        if (!owner || index[owner.id] === undefined) return;
        var bm = beams[index[owner.id]], dd = pt(bm, Number(d) || 0);
        addP(bm, dd, hw, t.id);
      });
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
          pending.push({ a: t.id, da: s.distance, b: hh.id, db: s0 ? s0.onDistance : 0, rigid: true, support: s.id });
        } else if (index[u.id] !== undefined) pending.push({ a: t.id, da: s.distance, b: u.id, db: s.onDistance, rigid: false, support: s.id });
      });
    });
    pending.forEach(function (p) { p.na = pt(beams[index[p.a]], p.da); p.nb = pt(beams[index[p.b]], p.db); });
    beams.forEach(function (bm) {
      bm.nodes = Object.keys(bm.pts).map(Number).sort(function (x, y) { return x - y; }).map(function (d) { return { d: d, P: bm.pts[d].P || 0, Pby: bm.pts[d].Pby, hoist: bm.pts[d].hoist }; });
    });
    pending.forEach(function (p) {
      var A = beams[index[p.a]], B = beams[index[p.b]];
      var ia = A.nodes.findIndex(function (n) { return Math.abs(n.d - p.na) < 1e-6; }), ib = B.nodes.findIndex(function (n) { return Math.abs(n.d - p.nb) < 1e-6; });
      links.push({ a: index[p.a], na: ia, b: index[p.b], nb: ib, rigid: p.rigid, feeder: p.a, support: p.support });
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

  var SLACK_TOL = 0.01;   // lb, as in rig.js

  /** Names of the trusses that own a degree of freedom (to say which truss is not held up). */
  function ownersOf(model, dofs, dof) {
    var names = [];
    model.beams.forEach(function (bm, bi) {
      if (dofs[bi].some(function (x) { return x.indexOf(dof) >= 0; }) && names.indexOf(bm.t.name) < 0) names.push(bm.t.name);
    });
    return names;
  }

  /** Groups of beams joined by connections that have no hoist at all (they can only fall). */
  function unheldGroups(model) {
    var parent = model.beams.map(function (_, i) { return i; });
    function find(a) { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; }
    model.links.forEach(function (lk) { parent[find(lk.b)] = find(lk.a); });
    var held = {}; model.supports.forEach(function (sp) { held[find(sp.b)] = true; });
    var groups = {};
    model.beams.forEach(function (bm, i) { var r = find(i); if (!held[r]) (groups[r] = groups[r] || []).push(bm.t.name); });
    return Object.keys(groups).map(function (k) { return groups[k]; });
  }

  /** Solve one joint model with tension-only hoists: a hoist that comes out pushing has a slack chain, so it is taken
   * out and the rig solved again, most negative first. Slack hoists report 0. */
  function solveSlack(model, rigid) {
    var sup = model.supports.slice(), slack = [];
    for (;;) {
      var r = solveModel({ beams: model.beams, links: model.links, supports: sup }, rigid);
      if (!r.ok) { r.slack = slack; r.names = ownersOf(model, r.dofs, r.dof); return r; }
      var worst = null, least = -SLACK_TOL;
      sup.forEach(function (sp) { var v = r.reactions[sp.id]; if (v < least) { least = v; worst = sp; } });
      if (!worst || sup.length <= 1) {
        slack.forEach(function (id) { r.reactions[id] = 0; });
        r.slack = slack;
        return r;
      }
      slack.push(worst.id);
      sup = sup.filter(function (sp) { return sp !== worst; });
    }
  }

  function compute(rig, results, db, opts) {
    var out = { ok: false };
    if (results.unsolved && results.unsolved.length) { out.note = "Not run: the rig has an unsolved load-path loop."; return out; }
    var model = build(rig, results, db), dofs = 0;
    model.beams.forEach(function (bm) { dofs += bm.nodes.length * 3; });
    if (!model.supports.length) { out.note = "No hoists."; return out; }
    if (dofs > 1600) { out.note = "Rig too large for the stiffness check (" + dofs + " degrees of freedom)."; return out; }
    var loose = unheldGroups(model);
    if (loose.length) {
      out.unstable = true;
      out.note = "UNSTABLE: not held up by any hoist - " + loose.map(function (g) { return g.join(" + "); }).join("; ") + ".";
      return out;
    }
    // everything the model carries, to check the solve against (equilibrium) and against the load-path total
    out.load = 0;
    model.beams.forEach(function (bm) { out.load += bm.w * bm.L; bm.nodes.forEach(function (nd) { out.load += nd.P || 0; }); });
    var hinged = solveSlack(model, false), rigid = solveSlack(model, true);
    if (!rigid.ok) {
      out.unstable = true;
      out.note = "UNSTABLE: " + (rigid.slack.length ? "once the slack hoist" + (rigid.slack.length > 1 ? "s are" : " is") + " taken out, " : "") +
        "the rig can't be held in place" + (rigid.names.length ? " (at " + rigid.names.join(", ") + ")" : "") + " - it would tip or swing. Add or move a hoist.";
      return out;
    }
    if (!hinged.ok) {
      // stable only because the bolted joints hold moment: with pinned joints part of the rig would swing
      out.hingedNote = "With pinned joints " + (hinged.names.length ? hinged.names.join(", ") : "part of the rig") +
        " would swing freely, so it relies on the corner-block joints holding moment; the hinged columns show the rigid-joint result.";
      hinged = rigid;
    }
    hinged.equilibriumError = hinged.total - out.load;
    rigid.equilibriumError = rigid.total - out.load;
    rigid.forces = forces(model, rigid);
    hinged.forces = hinged === rigid ? rigid.forces : forces(model, hinged);
    out.ok = true; out.hinged = hinged; out.rigid = rigid; out.model = model;
    return out;
  }

  /* ---- 1.3.0: the stiffness solve is the primary result ----
   * Hoist loads, bolted-connection forces and the span/cantilever table checks all come from the grillage, for both
   * joint models side by side; each check is governed by the worse of the two. The load-path numbers are kept on
   * every result as .loadPath for reference, and are what the app falls back to (with a warning) when the stiffness
   * solve can't run. */

  var MODELS = ["hinged", "rigid"], MODEL_LABEL = { hinged: "hinged joints", rigid: "rigid joints" };

  function supportOf(t, id) { return ((t && t.supports) || []).filter(function (s) { return s.id === id; })[0]; }
  function hoistEntry(db, id) { return (db.hoists || []).filter(function (h) { return h.id === id; })[0] || (db.hoists || [])[0] || null; }
  function ownLoad(t) { return (t.loads || []).reduce(function (a, l) { return a + (Number(l.weight) || 0) * (l.mirror && Math.abs(l.distance - t.length / 2) > 1e-7 ? 2 : 1); }, 0); }
  function describeSeg(s) { return s.type === "span" ? "Span " + s.index : s.type === "cantilever-left" ? "Left cantilever" : "Right cantilever"; }
  function maxUtil(l) { return l.segments.reduce(function (m, s) { return Math.max(m, s.utilization || 0); }, l.member ? l.member.utilization || 0 : 0); }
  function margin(lp) { return Math.max(0.05 * Math.abs(lp), 20); }

  /** The force a load-path "injected" load stands for, from one stiffness solve: a bolted truss's connection force,
   * or a corner block's net force on the truss it sits on. Hardware at the connection rides along, as in rig.js. */
  function injectedForce(src, sol, rig, byId, results) {
    var t = byId[src.truss], s = supportOf(t, src.support), hw = Number(s && s.hardwareWeight) || 0;
    if (!t || !t.isBlock) return (sol.forces.connections[src.truss + ":" + src.support] || 0) + hw;
    var f = 0, r = results.trusses[t.id];
    rig.trusses.forEach(function (u) {
      if (u.isBlock) return;
      (u.supports || []).forEach(function (s2) {
        if (s2.kind === "truss" && s2.onTruss === t.id) f += (sol.forces.connections[u.id + ":" + s2.id] || 0) + (Number(s2.hardwareWeight) || 0);
      });
    });
    (t.supports || []).forEach(function (s3) { if (s3.kind === "hoist") f -= sol.reactions[t.id + ":" + s3.id] || 0; });
    return f + (r && r.block ? r.block.weight : 0) + ownLoad(t) + hw;
  }

  /** The span/cantilever table checks of one truss with the loads and slack hoists of one stiffness solve. */
  function checkWith(t, res, sol, rig, byId, results, model) {
    var slack = {}; sol.slack.forEach(function (id) { slack[id] = true; });
    var sups = (t.supports || []).filter(function (s) { return !(s.kind === "hoist" && slack[t.id + ":" + s.id]); });
    if (!sups.length || !res.dbTruss) return null;
    var injected = res.injected.map(function (inj) {
      return { distance: inj.distance, weight: injectedForce(inj.source, sol, rig, byId, results), note: inj.note, source: inj.source, injected: true };
    });
    var loads = (t.loads || []).map(function (l) { return { distance: l.distance, weight: l.weight, note: l.note, mirror: l.mirror, id: l.id }; }).concat(injected);
    var truss = res.dbTruss, st = rig.settings || {};
    var beam = TLA.beam.solve({ length: t.length, supports: sups.map(function (s) { return s.distance; }), loads: loads, trussWeightPerFt: truss.weight_per_ft_lb, wallWeight: t.wallWeight, weightless: t.weightless });
    beam.active = sups;
    // moment/shear check on the stiffness solve's own diagrams, net of the truss's own weight as the tables are
    var full = sol.forces.members[t.id], net = full, bi = -1;
    model.beams.forEach(function (bm, i) { if (bm.t.id === t.id) bi = i; });
    if (full && bi >= 0 && st.cantileverSelfWeight !== true && model.beams[bi].wSelf > 0) {
      var bmT = model.beams[bi], F = sol.F.slice(), Fs = sol.udlVector(bi, bmT.wSelf);
      for (var q = 0; q < F.length; q++) F[q] -= Fs[q];
      var r = sol.solveF(F);                            // same structure, same slack hoists
      net = forces(model, { U: r.U, reactions: r.reactions, dofs: sol.dofs, supports: sol.supports }, function (b) { return b === bmT ? b.w - b.wSelf : b.w; }).members[t.id];
    }
    var limits = TLA.limits.checkTruss(truss, beam, t.wallWeight, { derate: typeof st.derate === "number" ? st.derate : undefined, cantileverSelfWeight: st.cantileverSelfWeight === true, memberDiagrams: full ? { full: full, net: net } : null });
    return { beam: beam, limits: limits, injected: injected };
  }

  /** Which joint model's table checks are worse: higher status code, then higher utilisation. */
  function worse(a, b) {
    if (!a) return "rigid"; if (!b) return "hinged";
    if (a.limits.worstCode !== b.limits.worstCode) return a.limits.worstCode > b.limits.worstCode ? "hinged" : "rigid";
    return maxUtil(a.limits) > maxUtil(b.limits) ? "hinged" : "rigid";
  }

  function applyPrimary(rig, results, db, out) {
    var byId = {}, st = rig.settings || {}, W = results.warnings;
    rig.trusses.forEach(function (t) { byId[t.id] = t; });
    results.primary = "grillage";
    // the load-path hoist and span warnings are replaced by the ones below
    for (var i = W.length - 1; i >= 0; i--) if (W[i].kind === "segment" || W[i].kind === "member" || W[i].kind === "hoist") W.splice(i, 1);

    Object.keys(results.trusses).forEach(function (id) {
      var t = byId[id], res = results.trusses[id];
      if (!t || t.isBlock) return;
      var by = { hinged: checkWith(t, res, out.hinged, rig, byId, results, out.model), rigid: checkWith(t, res, out.rigid, rig, byId, results, out.model) };
      if (!by.hinged && !by.rigid) return;
      var m = worse(by.hinged, by.rigid);
      res.loadPath = { beam: res.beam, limits: res.limits, injected: res.injected };
      res.byModel = by; res.model = m;
      res.beam = by[m].beam; res.limits = by[m].limits; res.injected = by[m].injected;
      res.memberForces = { hinged: out.hinged.forces.members[id], rigid: out.rigid.forces.members[id] };
      // the reactions shown with this truss's diagram are from the same joint model as its checks
      res.supports.forEach(function (sr) {
        var key = id + ":" + sr.support.id;
        function val(sol) { return sr.support.kind === "hoist" ? sol.reactions[key] || 0 : sol.forces.connections[key] || 0; }
        sr.loadPathReaction = sr.reaction;
        sr.byModel = { hinged: val(out.hinged), rigid: val(out.rigid) };
        sr.reaction = sr.byModel[m];
      });
      res.limits.segments.forEach(function (s) {
        if (s.code) W.push({ truss: id, kind: "segment", message: t.name + ": " + describeSeg(s) + " - " + s.status + " (" + MODEL_LABEL[m] + ")" });
      });
      var mb = res.limits.member;
      if (mb && mb.code) W.push({ truss: id, kind: "member", level: "member", message: t.name + ": " + TLA.limits.memberMessage(mb) + " (" + MODEL_LABEL[m] + ")" });
    });

    results.hoists.forEach(function (h) {
      var id = h.truss + ":" + h.support, s = supportOf(byId[h.truss], h.support);
      if (!s || out.hinged.reactions[id] === undefined || out.rigid.reactions[id] === undefined) return;
      var entry = hoistEntry(db, s.hoistId), by = {};
      MODELS.forEach(function (mm) {
        by[mm] = TLA.limits.checkHoist(entry, s.chainLength, out[mm].reactions[id], s.hardwareWeight, s.dlf, st.defaultDlf);
        by[mm].model = mm;
        if (out[mm].slack.indexOf(id) >= 0) { by[mm].slack = true; by[mm].status = "Slack"; }
      });
      var m = by.rigid.staticLoad >= by.hinged.staticLoad ? "rigid" : "hinged", gov = Object.assign({}, by[m]);
      if (results.unstable.indexOf(h.truss) >= 0) gov.status = "UNSTABLE";     // the load path says this truss tips
      var lp = { reaction: h.reaction, slack: h.slack, hoist: h.hoist };
      h.loadPath = lp; h.byModel = by; h.model = m;
      h.reaction = gov.reaction; h.slack = !!gov.slack; h.hoist = gov;
      var res = results.trusses[h.truss], sr = res && res.supports.filter(function (x) { return x.support.id === h.support; })[0];
      if (sr) {
        sr.hoist = gov; sr.slack = h.slack;
        if (!sr.byModel) { sr.loadPathReaction = lp.reaction; sr.byModel = { hinged: by.hinged.reaction, rigid: by.rigid.reaction }; sr.reaction = gov.reaction; }
      }
      var lps = lp.hoist.staticLoad;
      h.compat = gov.compat = {
        hinged: by.hinged.staticLoad, rigid: by.rigid.staticLoad, envelope: gov.staticLoad, loadPath: lps,
        slackHinged: !!by.hinged.slack, slackRigid: !!by.rigid.slack,
        higher: gov.staticLoad > lps + margin(lps), lower: gov.staticLoad < lps - margin(lps)
      };
      var where = h.trussName + " " + (h.supportName || "hoist") + " at " + (Math.round(h.distance * 10) / 10) + " ft";
      if (h.slack) W.push({ truss: h.truss, kind: "hoist", level: "slack", message: where + ": SLACK - the load would push this hoist up (with hinged and with rigid joints), so its chain goes slack and it carries nothing (only the hoist and chain weight). The rest of the rig carries its share; the results shown are with this hoist taken out." });
      else if (by.hinged.slack || by.rigid.slack) W.push({ truss: h.truss, kind: "hoist", level: "slack", message: where + ": goes SLACK with " + MODEL_LABEL[by.hinged.slack ? "hinged" : "rigid"] + " only; the " + MODEL_LABEL[m] + " result (" + Math.round(gov.staticLoad) + " lb) is used." });
      if (!h.slack && gov.status !== "Good" && gov.status !== "UNSTABLE") W.push({ truss: h.truss, kind: "hoist", message: h.trussName + " " + (h.supportName || "hoist") + ": " + gov.status + " (" + Math.round(gov.staticLoad) + " lb static, " + MODEL_LABEL[m] + ")" });
      else if (!h.slack && gov.dynamicOver) W.push({ truss: h.truss, kind: "hoist", message: h.trussName + " " + (h.supportName || "hoist") + ": dynamic load exceeds capacity (" + MODEL_LABEL[m] + ")" });
      if (h.compat.higher) W.push({ truss: h.truss, kind: "hoist", level: "info", message: where + ": " + Math.round(gov.staticLoad) + " lb from the stiffness solve, well above the load-path method's " + Math.round(lps) + " lb - the truss it is bolted to sags and sheds load onto this hoist." });
    });

    var tot = results.totals;
    tot.loadPath = { staticLoad: tot.staticLoad, dynamicLoad: tot.dynamicLoad, hoistReaction: tot.hoistReaction };
    tot.staticLoad = tot.dynamicLoad = tot.hoistChain = tot.hoistReaction = 0;
    tot.byModel = { hinged: 0, rigid: 0 };
    results.hoists.forEach(function (h) {
      tot.staticLoad += h.hoist.staticLoad; tot.dynamicLoad += h.hoist.dynamicLoad; tot.hoistChain += h.hoist.hoistChain; tot.hoistReaction += h.reaction;
      MODELS.forEach(function (mm) { tot.byModel[mm] += h.byModel ? h.byModel[mm].staticLoad : h.hoist.staticLoad; });
    });
  }

  function fallback(rig, results, out) {
    results.primary = "load-path";
    var hoists = rig.trusses.some(function (t) { return (t.supports || []).some(function (s) { return s.kind === "hoist"; }); });
    if (out.unstable || !hoists) return;
    results.warnings.push({ level: "fallback", message: "Stiffness solve not available" + (out.note ? " (" + out.note.replace(/\.$/, "") + ")" : "") +
      ": hoist loads and truss checks are from the load-path method alone, which treats every carrying truss as unyielding and can under-estimate hoists in a grid." });
  }

  /** Solve hinged and rigid models, then make them the primary result (see applyPrimary). */
  function annotate(rig, results, db, opts) {
    opts = opts || {}; db = db || TLA.data || {};
    var sig = signature(rig, results), out;
    if (last.sig === sig && last.out) out = last.out;
    else { out = compute(rig, results, db, opts); last = { sig: sig, out: out }; }
    results.compat = out;
    if (out.unstable) results.warnings.unshift({ level: "unstable", message: "Stiffness check: " + out.note });
    if (!out.ok) { fallback(rig, results, out); return out; }
    if (out.hingedNote) results.warnings.push({ level: "info", message: "Stiffness check: " + out.hingedNote });
    // self-checks: the solve balances, carries the same total weight as the load-path solve, and the connection
    // forces account for every node
    var tol = 0.5 + 1e-6 * out.load, applied = results.totals && results.totals.applied;
    if (Math.abs(out.hinged.equilibriumError) > tol || Math.abs(out.rigid.equilibriumError) > tol)
      results.warnings.push({ level: "internal", message: "Stiffness check does not balance (" + Math.round(out.hinged.equilibriumError) + " lb) - please report this rig." });
    if (typeof applied === "number" && Math.abs(out.load - applied) > tol)
      results.warnings.push({ level: "internal", message: "Stiffness check carries " + Math.round(out.load) + " lb but the load-path solve carries " + Math.round(applied) + " lb - please report this rig." });
    MODELS.forEach(function (mm) {
      var f = out[mm].forces;
      if (f.loop) results.warnings.push({ level: "internal", message: "Stiffness check (" + MODEL_LABEL[mm] + "): bolted connections meet in a closed loop at one point, so their forces can't be split - please report this rig." });
      else if (f.residual > tol) results.warnings.push({ level: "internal", message: "Stiffness check (" + MODEL_LABEL[mm] + "): connection forces are " + Math.round(f.residual) + " lb out - please report this rig." });
    });
    applyPrimary(rig, results, db, out);
    return out;
  }

  /** Where a hoist's load comes from, in the joint model that governs it: one load case per truss on the same
   * structure (same slack hoists), so the parts add up to the reaction. Falls back to the load-path breakdown. */
  function attribution(rig, results, db, trussId, supportId) {
    var out = results.compat, h = results.hoists.filter(function (x) { return x.truss === trussId && x.support === supportId; })[0];
    if (!h || results.primary !== "grillage" || !out || !out.ok || !h.model) {
      var a = TLA.rig.attribution(rig, db, trussId, supportId); if (a) a.model = "load-path"; return a;
    }
    var sol = out[h.model], id = trussId + ":" + supportId, cache = sol.attr || (sol.attr = {});
    if (!cache[id]) {
      var names = {}, parts = [];
      rig.trusses.forEach(function (t) { names[t.id] = t.name; });
      var origins = {};
      out.model.beams.forEach(function (bm) { origins[bm.t.id] = true; bm.nodes.forEach(function (nd) { Object.keys(nd.Pby || {}).forEach(function (k) { origins[k] = true; }); }); });
      if (sol.slack.indexOf(id) < 0) Object.keys(origins).forEach(function (o) {
        var r = sol.solveF(sol.loadVector(o)).reactions[id];
        if (r !== undefined && Math.abs(r) > 0.005) parts.push({ truss: o, name: names[o] || o, weight: r });
      });
      parts.sort(function (a2, b2) { return Math.abs(b2.weight) - Math.abs(a2.weight); });
      cache[id] = parts;
    }
    return { reaction: h.reaction, hoistChain: h.hoist.hoistChain, staticLoad: h.hoist.staticLoad, parts: cache[id], model: h.model };
  }

  TLA.grillage = { annotate: annotate, build: build, solveModel: solveModel, forces: forces, attribution: attribution, estimateEI: estimateEI, estimateStiffness: estimateStiffness, connectorType: connectorType, MODEL_LABEL: MODEL_LABEL };
})(typeof globalThis !== "undefined" ? globalThis : window);
