/* Whole-rig analysis of the whole rig (plan-view grillage, finite elements) - the "grillage method" used for bridge
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
 * Model: every truss is a Timoshenko beam (bending EI, shear GA, torsion GJ - see section.js) in the horizontal plane,
 * loaded vertically. Hoists are rigid vertical supports, or springs when a hoist stiffness is given. Bolted connections
 * (corner blocks) always share vertical deflection; the joint models bracket how much of the real bolted corner's
 * moment/torsion actually carries across, since no manufacturer publishes a stiffness for the corner-block hardware
 * itself (RMMS Lesson 39: this is "precision guesswork"):
 *   hinged     - connections carry vertical force only (the grillage method's rigid-joint assumption relaxed to a
 *                lower bound, for a corner block that turns out not to hold the joint square under load)
 *   semi-rigid - (1.4.0) a rotational spring in the corner block, k = alpha x EI/L of the weaker truss it joins
 *                (alpha = 1, 4, 16: the range between "nominally pinned" and "rigid" in steel-joint classification),
 *                because a load share can peak between the two extremes
 *   rigid      - the textbook grillage assumption: bending and torsion also pass through the corner block
 * Every check uses the worst of all of them. Stiffness can be scaled per truss (truss.eiScale, applied to EI, GA, GJ).
 * A hoist hung below a truss (1.22.0, support.hangFrom) is a tension-only chain between its truss and the carrier; the
 * carrier (and what is bolted to it) is also checked in a "carrier case" with the hung hoist's high hook dynamic load. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});

  function estimateStiffness(entry, t) { return TLA.section.estimate(entry, t); }
  function estimateEI(entry, t) { return estimateStiffness(entry, t).EI; }

  var SWEEP = [1, 4, 16];     // semi-rigid corner blocks: rotational spring = alpha x EI/L

  /** One beam element between two nodes of a truss: local stiffness Kl on [w, slope, twist] at each end, the
   * transform T (local = T * global [w, thetaX, thetaY]), Kg = T' Kl T, and the local fixed-end loads for 1 lb/ft
   * down. w and forces are positive UP; slope = dw/dx along the truss. Timoshenko bending: phi = 12 EI / (GA L^2) is
   * the shear flexibility (0 = Euler-Bernoulli); the fixed-end loads of a uniform load are the same either way. */
  function element(bm, L) {
    var phi = bm.GA > 0 && isFinite(bm.GA) ? 12 * bm.EI / (bm.GA * L * L) : 0;
    var c = bm.c, s = bm.s, k = bm.EI / (L * L * L * (1 + phi)), r, q, m, a = (4 + phi) * L * L, b = (2 - phi) * L * L;
    var kb = [[12, 6 * L, -12, 6 * L], [6 * L, a, -6 * L, b], [-12, -6 * L, 12, -6 * L], [6 * L, b, -6 * L, a]];
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
    return { L: L, Kl: Kl, T: T, Kg: Kg, fl: fl, fg: fg, phi: phi };
  }

  /** Joint model name: "hinged", "rigid" or "semi<alpha>". */
  function jointsOf(name) {
    if (name === true || name === "rigid") return { rigid: true, semi: 0 };
    var m = /^semi(\d+(?:\.\d+)?)$/.exec(name || "");
    return { rigid: false, semi: m ? parseFloat(m[1]) : typeof name === "number" ? name : 0 };
  }

  /** Solve one joint model ("hinged", "rigid", "semi<alpha>"; true/false = rigid/hinged). Returns { ok, reactions:
   * {truss.id:support.id -> lb}, total, ... } plus what forces(), attribution and trim need: the displacements U, load
   * vector F, each node's dofs, solveF(F) for more load cases on the same (already factorised) structure, and
   * lift(id, ft) - the reactions when one hoist is raised by ft with no other load. A support with k (lb/ft) is a
   * spring (a hoist and its chain stretch); without, it is rigid. */
  function solveModel(model, joints) {
    var beams = model.beams, links = model.links, hangs = model.hangs || [], jm = jointsOf(joints), rigid = jm.rigid;
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
    // a hoist hung below a truss (1.22.0) is a chain between two trusses: one more unknown per hoist, its tension
    // (a Lagrange multiplier, scaled to the trusses' stiffness): u_lower - u_carrier = the chain shortened (0), or
    // stretched by T / k when the hoist has a stiffness
    var nw = n; n += hangs.length;
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
    var diagEl = new Float64Array(n); for (i = 0; i < n; i++) diagEl[i] = K[i][i];   // the trusses alone (sizes eps below)
    // semi-rigid corner blocks: a rotational spring about both plan axes between the two trusses' rotations
    if (jm.semi > 0) links.forEach(function (lk) {
      if (!lk.rigid) return;
      var A = beams[lk.a], B = beams[lk.b], k = jm.semi * Math.min(A.EI / A.L, B.EI / B.L), da = dofs[lk.a][lk.na], db = dofs[lk.b][lk.nb];
      [1, 2].forEach(function (j) { var p = da[j], q = db[j]; if (p === q) return; K[p][p] += k; K[q][q] += k; K[p][q] -= k; K[q][p] -= k; });
    });
    // spring hoists stay free; a rigid hoist at the same point makes the point fixed (its springs then carry nothing)
    var fixed = {}, springs = [];
    model.supports.forEach(function (sp) { if (!(sp.k > 0)) fixed[dofs[sp.b][sp.n][0]] = true; });
    model.supports.forEach(function (sp) { var d = dofs[sp.b][sp.n][0]; if (sp.k > 0 && !fixed[d]) { K[d][d] += sp.k; springs.push({ sp: sp, d: d }); } });
    var maxW = 0; for (i = 0; i < nw; i++) if (diagEl[i] > maxW) maxW = diagEl[i];
    var hangAt = hangs.map(function (hg, j) {
      var da = dofs[hg.a][hg.na][0], db = dofs[hg.b][hg.nb][0], x = nw + j, sc = Math.max(diagEl[da], diagEl[db]) || maxW || 1;
      // the two ends already move together (bolted there too), or both are held: the chain carries nothing
      if (da === db || (fixed[da] && fixed[db])) { K[x][x] = 1; return { hg: hg, x: x, s: 0 }; }
      K[da][x] -= sc; K[x][da] -= sc; K[db][x] += sc; K[x][db] += sc;
      if (hg.k > 0) K[x][x] -= sc * sc / hg.k;
      return { hg: hg, x: x, s: sc };
    });
    /** Load vector for everything (origin undefined) or only the loads that belong to one truss (attribution). */
    function loadVector(origin) {
      var F = new Float64Array(n);
      (model.extra || []).forEach(function (ex) { if (origin === undefined || ex.origin === origin) F[dofs[ex.b][ex.n][0]] -= ex.P; });
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
    var free = []; for (i = 0; i < n; i++) if (!fixed[i]) free.push(i);
    var m = free.length, A = [], diag = new Float64Array(m), maxEl = 0;
    for (i = 0; i < m; i++) { A.push(new Float64Array(m)); for (var j = 0; j < m; j++) A[i][j] = K[free[i]][free[j]]; if (diagEl[free[i]] > maxEl) maxEl = diagEl[free[i]]; }
    var rotDof = {}; dofs.forEach(function (bn) { bn.forEach(function (x) { rotDof[x[1]] = rotDof[x[2]] = true; }); });
    // A tiny twist stiffness removes torsion rigid-body modes in the hinged model. 1.5.0: sized per dof (1e-12 x that
    // dof's own truss stiffness), not 1e-12 x the stiffest dof in the rig - a 0.002 ft stub element (~1e14 without
    // shear deformation) made it strong enough to hold up a soft pipe, and the leak check then called the pipe UNSTABLE.
    var eps = new Float64Array(m);
    for (i = 0; i < m; i++) if (rotDof[free[i]]) { eps[i] = 1e-12 * (diagEl[free[i]] > 0 ? diagEl[free[i]] : maxEl); A[i][i] += eps[i]; }
    for (i = 0; i < m; i++) diag[i] = Math.abs(A[i][i]);
    // LU factorisation with partial pivoting (in place; multipliers below the diagonal), kept for more load cases.
    // 1.5.0: a pivot is "zero" relative to its own column's stiffness, not the stiffest dof in the rig.
    var perm = []; for (i = 0; i < m; i++) perm.push(i);
    for (var cidx = 0; cidx < m; cidx++) {
      var p = cidx; for (var r2 = cidx + 1; r2 < m; r2++) if (Math.abs(A[r2][cidx]) > Math.abs(A[p][cidx])) p = r2;
      if (!(Math.abs(A[p][cidx]) >= 1e-14 * (diag[cidx] || maxEl || 1))) return { ok: false, dof: free[cidx], dofs: dofs };
      var tmp = A[cidx]; A[cidx] = A[p]; A[p] = tmp; var tp = perm[cidx]; perm[cidx] = perm[p]; perm[p] = tp;
      var piv = A[cidx];
      for (r2 = cidx + 1; r2 < m; r2++) {
        var row = A[r2], fct = row[cidx] / piv[cidx]; row[cidx] = fct; if (fct === 0) continue;
        for (var c2 = cidx + 1; c2 < m; c2++) row[c2] -= fct * piv[c2];
      }
    }
    var byDof = {};
    model.supports.forEach(function (sp) { var d = dofs[sp.b][sp.n][0]; if (fixed[d] && !(sp.k > 0)) (byDof[d] = byDof[d] || []).push(sp); });
    /** set: optional imposed displacements (ft, up) - of fixed dofs ({dof: ft}), of spring hoists' tops ({id: ft}) and
     * of hoists hung below a truss (chain shortened, {id: ft}). */
    function solveF(F, set) {
      var y = new Float64Array(m), ii, jj, fd = (set && set.dofs) || {}, sd = (set && set.springs) || {}, hd = (set && set.hangs) || {};
      if (Object.keys(hd).length) { F = F.slice(); hangAt.forEach(function (h) { if (hd[h.hg.id]) F[h.x] -= h.s * hd[h.hg.id]; }); }
      for (ii = 0; ii < m; ii++) { var s = F[free[perm[ii]]], Ai = A[ii]; for (jj = 0; jj < ii; jj++) s -= Ai[jj] * y[jj]; y[ii] = s; }
      for (ii = m - 1; ii >= 0; ii--) { var s2 = y[ii], Ai2 = A[ii]; for (jj = ii + 1; jj < m; jj++) s2 -= Ai2[jj] * y[jj]; y[ii] = s2 / Ai2[ii]; }
      var U = new Float64Array(n); free.forEach(function (gi, k) { U[gi] = y[k]; });
      Object.keys(fd).forEach(function (d) { U[+d] = fd[d]; });
      var reactions = {}, total = 0;
      Object.keys(byDof).forEach(function (d) {
        d = +d; var rowK = K[d], r = 0; for (var q = 0; q < n; q++) r += rowK[q] * U[q]; r -= F[d];
        total += r; byDof[d].forEach(function (sp) { reactions[sp.id] = r / byDof[d].length; });
      });
      springs.forEach(function (x) { var r = x.sp.k * ((sd[x.sp.id] || 0) - U[x.d]); reactions[x.sp.id] = r; total += r; });
      model.supports.forEach(function (sp) { if (reactions[sp.id] === undefined) reactions[sp.id] = 0; });
      // a hung hoist's tension is its low hook load; it stays inside the rig, so it is not part of the total
      hangAt.forEach(function (h) { reactions[h.hg.id] = h.s * U[h.x]; });
      return { U: U, u: y, reactions: reactions, total: total };
    }
    /** The load vector and imposed displacements for the supports' designed levels (dz ft, up): a rigid hoist's point is
     * moved, a spring hoist's top, a hung hoist's chain shortened. Two rigid hoists at one point share the first's. */
    function levelSet(F0) {
      var F2 = F0.slice(), set = { dofs: {}, springs: {}, hangs: {} }, any = false;
      model.supports.forEach(function (sp) {
        if (!sp.dz) return;
        var d = dofs[sp.b][sp.n][0]; any = true;
        if (fixed[d]) { if (set.dofs[d] === undefined) { set.dofs[d] = sp.dz; free.forEach(function (q) { F2[q] -= K[q][d] * sp.dz; }); } }
        else { set.springs[sp.id] = sp.dz; F2[d] += sp.k * sp.dz; }
      });
      hangs.forEach(function (hg) { if (hg.dz) { set.hangs[hg.id] = hg.dz; any = true; } });
      return { F: F2, set: set, any: any };
    }
    /** Reactions when hoist `id` alone is raised by `ft` (a trim error), everything else as solved. */
    function lift(id, ft) {
      var hs = {}; if (hangAt.some(function (h) { return h.hg.id === id && h.s; })) { hs[id] = ft; return solveF(new Float64Array(n), { hangs: hs }); }
      var sp = model.supports.filter(function (x) { return x.id === id; })[0]; if (!sp) return null;
      var d = dofs[sp.b][sp.n][0], F = new Float64Array(n), set = { dofs: {}, springs: {} };
      if (fixed[d]) { free.forEach(function (q) { F[q] = -K[q][d] * ft; }); set.dofs[d] = ft; }
      else { F[d] = sp.k * ft; set.springs[id] = ft; }
      return solveF(F, set);
    }
    // 1.22.0: hoists hung at a designed level (support dz, ft up): imposed displacements of the supports' tops
    var lv = levelSet(loadVector()), F = lv.F, sol = solveF(F, lv.set);
    // The eps above only exists to pin down twist that nothing loads. If it ends up carrying real moment, a truss is
    // free to rotate (tip) - a mechanism, not a structure.
    var fsum = 0; for (i = 0; i < n; i++) fsum += Math.abs(F[i]);
    var leak = 0, leakDof = -1;
    for (i = 0; i < m; i++) if (eps[i] && Math.abs(eps[i] * sol.u[i]) > leak) { leak = Math.abs(eps[i] * sol.u[i]); leakDof = free[i]; }
    if (leak > 1e-4 * Math.max(fsum, 1)) return { ok: false, dof: leakDof, dofs: dofs };
    return { ok: true, reactions: sol.reactions, total: sol.total, U: sol.U, F: F, set: lv.set, leveled: lv.any, dofs: dofs, supports: model.supports, rigid: rigid, semi: jm.semi, loadVector: loadVector, udlVector: udlVector, solveF: solveF, lift: lift };
  }

  var JUMP_TOL = 1e-5;   // of the truss's largest moment: smaller steps are the solver's tiny twist stiffness, not a joint

  /** Member forces from a solved model: shear, bending moment and torque along every truss (same shape as the
   * load-path diagrams: points with shear just left/right and moment, sagging positive, plus extremes), and the
   * vertical force in every bolted connection (upward on the truss that is bolted, lb). wOf(bm) overrides the
   * uniform load a beam carries in this load case. */
  /** Deflected shape of one truss (1.18.0): [[x ft, w ft up], ...]. Between nodes the element carries only its uniform
   * load, so with M(x) = M0 + V x - w x^2 / 2 (sagging +, w up) the exact Timoshenko shape is the end displacements
   * joined by a straight line, plus the bending part (w'' = M / EI) and the shear part (w' = -V / GA, i.e. -M / GA),
   * each made zero at both ends. Output only - nothing else reads it. */
  function deflected(bm, nds, seg, w) {
    var EI = bm.EI, GA = bm.GA > 0 && isFinite(bm.GA) ? bm.GA : Infinity, pts = [];
    nds.forEach(function (nd, e) {
      var sg = seg[e]; if (!sg) return;
      var L = sg.L, x0 = nd.d;
      function B(x) { return (sg.M0 * x * x / 2 + sg.V * x * x * x / 6 - w * x * x * x * x / 24) / EI; }
      function Sh(x) { return isFinite(GA) ? -(sg.M0 + sg.V * x - w * x * x / 2) / GA : 0; }
      var BL = B(L), S0 = Sh(0), SL = Sh(L), n = 8;
      for (var k = e === 0 ? 0 : 1; k <= n; k++) {
        var x = L * k / n, lin = sg.wA + (sg.wB - sg.wA) * x / L;
        pts.push([x0 + x, lin + (B(x) - BL * x / L) + (Sh(x) - (S0 + (SL - S0) * x / L))]);
      }
    });
    return pts;
  }

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
        seg[e] = { L: el.L, V: f[0], M0: -f[1], T: Math.abs(f[2]), wA: ul[0], wB: ul[3] };
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
      out.defl = deflected(bm, nds, seg, w);
      members[bm.t.id] = out;
    });
    // what is left at a node after the hoists there comes through its bolted connections: peel the link tree from
    // its leaves (a leaf node's residual is the force in its only link)
    sol.supports.forEach(function (sp) { ext[sp.b + ":" + sp.n] -= sol.reactions[sp.id]; });
    // a hung hoist pulls its truss up and its carrier down; extra loads (the carrier case) sit on their node
    (model.hangs || []).forEach(function (hg) { var T = sol.reactions[hg.id] || 0; ext[hg.a + ":" + hg.na] -= T; ext[hg.b + ":" + hg.nb] += T; });
    (model.extra || []).forEach(function (ex) { ext[ex.b + ":" + ex.n] += ex.P; });
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
      var bm = { t: t, c: Math.cos(a), s: Math.sin(a), L: t.length, EI: st.EI, GA: st.GA, GJ: st.GJ, section: st, w:ws + (Number(t.wallWeight) || 0) / (t.length || 1), wSelf: ws, pts: { 0: {}, [t.length]: {} } };
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
    // hoists hung below a truss (1.22.0): a chain between the hoist's point on its truss and the carrier; the hoist,
    // chain and hardware weight hang on the carrier
    var hangPending = [];
    rig.trusses.forEach(function (t) {
      if (t.isBlock || index[t.id] === undefined) return;
      t.supports.forEach(function (s) {
        var hp = s.kind === "hoist" && s.hangFrom ? TLA.rig.hangPoint(byId, t, s) : null;
        if (!hp) return;
        var c = byId[hp.truss], d = hp.distance;
        if (c.isBlock) {
          var hh = byId[c.host || (c.attach && c.attach.b)], sb = hh && c.supports.filter(function (x) { return x.kind === "truss" && x.onTruss === hh.id; })[0];
          c = hh; d = sb ? sb.onDistance : 0;
        }
        if (!c || index[c.id] === undefined || c.id === t.id) return;
        var cb = beams[index[c.id]], dc = pt(cb, Number(d) || 0), lb = beams[index[t.id]], dl = pt(lb, s.distance);
        var w = TLA.limits.supportWeight(s, db, rig.settings) + (Number(s.hardwareWeight) || 0);
        if (w) addP(cb, dc, w, t.id);
        hangPending.push({ a: t.id, da: dl, b: c.id, db: dc, id: t.id + ":" + s.id, s: s });
      });
    });
    rig.trusses.forEach(function (t) {
      var host = t.isBlock ? byId[t.host || (t.attach && t.attach.b)] : null;
      // hoists on trusses and on blocks
      t.supports.forEach(function (s) {
        if (s.kind === "hoist" && !(s.hangFrom && hangPending.some(function (p) { return p.s === s; }))) {
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
    // hoist springs (lb/in -> lb/ft): the hoist's own stiffness, else the rig's; none = rigid
    var kRig = Number(rig.settings && rig.settings.hoistStiffness) || 0;
    // lb/in: the support's own stiffness, else - when the rig's hoists are springs - a dead hang's rope (EA / L), else
    // the rig's hoist stiffness; none = rigid (a dead hang on a rig of rigid hoists is rigid too)
    function supportK(s) {
      if (s && Number(s.stiffness) > 0) return Number(s.stiffness);
      var kr = s && s.dead && kRig > 0 ? TLA.limits.ropeStiffness(s) / 12 : 0;
      return kr > 0 ? kr : kRig;
    }
    // a designed level offset (1.22.0): support.level, inches, + = hung higher than the rest; ft here
    function levelOf(s) { var v = Number(s && s.level) || 0; return v / 12; }
    function nodeOf(bm, d) { return bm.nodes.findIndex(function (nd) { return Math.abs(nd.d - d) < 1e-6; }); }
    var hangs = hangPending.map(function (p) {
      var k = supportK(p.s), A = beams[index[p.a]], B = beams[index[p.b]];
      return { a: index[p.a], na: nodeOf(A, p.da), b: index[p.b], nb: nodeOf(B, p.db), id: p.id, k: k > 0 ? k * 12 : 0, truss: p.a, carrier: p.b, dz: levelOf(p.s) };
    });
    beams.forEach(function (bm, bi) {
      bm.nodes.forEach(function (nd, ni) {
        (nd.hoist || []).forEach(function (id) {
          var p = id.split(":"), s = supportOf(byId[p[0]], p.slice(1).join(":")), k = supportK(s);
          var sp = k > 0 ? { b: bi, n: ni, id: id, k: k * 12 } : { b: bi, n: ni, id: id }, dz = levelOf(s);
          if (dz) sp.dz = dz;
          supports.push(sp);
        });
      });
    });
    return { beams: beams, links: links, supports: supports, hangs: hangs };
  }



  var last = { sig: null, out: null };
  function signature(rig, results) {
    // plan position does not change the stiffness solution (only distances and angles do), so dragging reuses the last solve
    // (a hoist hung below a truss hooks on where the plan puts it, so then position counts)
    var hung = rig.trusses.some(function (t) { return (t.supports || []).some(function (s) { return s.kind === "hoist" && s.hangFrom; }); });
    return JSON.stringify(rig, function (k, v) { return !hung && (k === "x" || k === "y") ? undefined : v; }) + "|" + (results.totals ? results.totals.applied : "");
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
    (model.hangs || []).forEach(function (hg) { parent[find(hg.a)] = find(hg.b); });
    var held = {}; model.supports.forEach(function (sp) { held[find(sp.b)] = true; });
    var groups = {};
    model.beams.forEach(function (bm, i) { var r = find(i); if (!held[r]) (groups[r] = groups[r] || []).push(bm.t.name); });
    return Object.keys(groups).map(function (k) { return groups[k]; });
  }

  /** Solve one joint model with tension-only hoists: a hoist that comes out pushing has a slack chain, so it is taken
   * out and the rig solved again, most negative first. Slack hoists report 0. */
  function solveSlack(model, joints) {
    var sup = model.supports.slice(), hg = (model.hangs || []).slice(), slack = [];
    for (;;) {
      var r = solveModel({ beams: model.beams, links: model.links, supports: sup, hangs: hg, extra: model.extra }, joints);
      if (!r.ok) { r.slack = slack; r.names = ownersOf(model, r.dofs, r.dof); return r; }
      var worst = null, least = -SLACK_TOL;
      sup.concat(hg).forEach(function (sp) { var v = r.reactions[sp.id]; if (v < least) { least = v; worst = sp; } });
      if (!worst || (sup.indexOf(worst) >= 0 && sup.length <= 1)) {
        slack.forEach(function (id) { r.reactions[id] = 0; });
        r.slack = slack;
        return r;
      }
      slack.push(worst.id);
      sup = sup.filter(function (sp) { return sp !== worst; });
      hg = hg.filter(function (x) { return x !== worst; });
    }
  }

  function compute(rig, results, db, opts) {
    var out = { ok: false };
    if (results.unsolved && results.unsolved.length) { out.note = "Not run: the rig has an unsolved load-path loop."; return out; }
    var model = build(rig, results, db), dofs = 0;
    model.beams.forEach(function (bm) { dofs += bm.nodes.length * 3; });
    if (!model.supports.length) { out.note = "No hoists."; return out; }
    if (dofs > 1600) { out.note = "Rig too large for the whole-rig analysis (" + dofs + " degrees of freedom)."; return out; }
    var loose = unheldGroups(model);
    if (loose.length) {
      out.unstable = true;
      out.note = "Unstable: not held up by any hoist - " + loose.map(function (g) { return g.join(" + "); }).join("; ") + ".";
      return out;
    }
    // everything the model carries, to check the solve against (equilibrium) and against the load-path total
    out.load = 0;
    model.beams.forEach(function (bm) { out.load += bm.w * bm.L; bm.nodes.forEach(function (nd) { out.load += nd.P || 0; }); });
    var hinged = solveSlack(model, false), rigid = solveSlack(model, true);
    if (!rigid.ok) {
      out.unstable = true;
      out.note = "Unstable: " + (rigid.slack.length ? "once the slack hoist" + (rigid.slack.length > 1 ? "s are" : " is") + " taken out, " : "") +
        "the rig can't be held in place" + (rigid.names.length ? " (at " + rigid.names.join(", ") + ")" : "") + " - it would tip or swing. Add or move a hoist.";
      return out;
    }
    if (!hinged.ok) {
      // stable only because the bolted joints hold moment: with pinned joints part of the rig would swing
      out.hingedNote = "With pinned joints " + (hinged.names.length ? hinged.names.join(", ") : "part of the rig") +
        " would swing freely, so it relies on the corner-block joints holding moment; the hinged columns show the rigid-joint result.";
      hinged = rigid;
    }
    out.order = ["hinged"];
    out.hinged = hinged; out.rigid = rigid;
    // semi-rigid corner blocks between the two extremes (only where a corner block joins trusses)
    if (hinged !== rigid && model.links.some(function (lk) { return lk.rigid; })) SWEEP.forEach(function (alpha) {
      var key = "semi" + alpha, s = solveSlack(model, key);
      if (s.ok) { out[key] = s; out.order.push(key); }
    });
    out.order.push("rigid");
    out.order.forEach(function (m) {
      var s = out[m];
      if (s.forces) return;
      s.equilibriumError = s.total - out.load;
      s.forces = forces(model, s);
      s.hangLoad = hangLoads(model, s, rig, db, false);
    });
    out.ok = true; out.model = model;
    if (model.hangs.length) carrierCase(rig, db, model, out);
    return out;
  }

  /** What a hung hoist puts on its carrier in one solve: its high hook load (low hook + Add % + hoist, chain and
   * hardware weight), static or dynamic. The static solve itself carries only the low hook + hoist, chain and hardware
   * weight (Add % never loads a truss, as in the original). */
  function hangLoads(model, sol, rig, db, dynamic) {
    var out = {}, st = rig.settings || {}, byId = {};
    rig.trusses.forEach(function (t) { byId[t.id] = t; });
    model.hangs.forEach(function (hg) {
      var p = hg.id.split(":"), s = supportOf(byId[p[0]], p.slice(1).join(":")); if (!s) return;
      var T = sol.reactions[hg.id] || 0, c = TLA.limits.checkSupport(s, db, T, st);
      out[hg.id] = dynamic ? c.dynamicLoad : T + c.hoistChain + (Number(s.hardwareWeight) || 0);
    });
    return out;
  }

  /** The carrier case (1.22.0, owner): a truss carrying a hoist hung below it is checked with that hoist's high hook
   * DYNAMIC load - the hoist runs, its load factor acts on the carrier. For each joint model: the rig solved again with
   * each hung hoist's chain replaced by a point load on the carrier (its high hook dynamic load from the static solve)
   * and its truss held at the hoist. The trusses joined to a carrier (bolted, not hung) take the worse of this and the
   * static solve; so do their hoists, unless Rig settings turn that off (settings.hungDynamic === false). */
  function carrierCase(rig, db, model, out) {
    var parent = model.beams.map(function (_, i) { return i; });
    function find(a) { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; }
    model.links.forEach(function (lk) { parent[find(lk.b)] = find(lk.a); });
    var roots = {}, group = {};
    model.hangs.forEach(function (hg) { roots[find(hg.b)] = true; });
    model.beams.forEach(function (bm, i) { if (roots[find(i)]) group[bm.t.id] = true; });
    out.dynGroup = group; out.dynOrder = [];
    out.order.forEach(function (m) {
      var base = out[m], dyn = hangLoads(model, base, rig, db, true), sup = model.supports.slice(), extra = [];
      model.hangs.forEach(function (hg) {
        if (base.slack.indexOf(hg.id) < 0) sup.push({ b: hg.a, n: hg.na, id: "hang@" + hg.id, internal: true });
        extra.push({ b: hg.b, n: hg.nb, P: dyn[hg.id] - hangStatic(hg), origin: hg.truss });
      });
      function hangStatic(hg) { return base.hangLoad[hg.id] - (base.reactions[hg.id] || 0); }   // hoist, chain, hardware
      var mc = { beams: model.beams, links: model.links, supports: sup, hangs: [], extra: extra }, sc = solveSlack(mc, base.rigid ? "rigid" : m);
      if (!sc.ok) return;
      var load = out.load; extra.forEach(function (ex) { load += ex.P; });
      sc.equilibriumError = sc.total - load;
      sc.forces = forces(mc, sc);
      sc.hangLoad = dyn;
      sc.model = mc; sc.base = m; sc.dynamic = true;
      out[m + "+dyn"] = sc; out.dynOrder.push(m + "+dyn");
    });
  }

  /* ---- 1.3.0: the whole-rig analysis is the primary result ----
   * Hoist loads, bolted-connection forces and the span/cantilever table checks all come from the grillage, for both
   * joint models side by side (1.4.0: hinged, semi-rigid sweep, rigid); each check is governed by the worst. The load-path numbers are kept on
   * every result as .loadPath for reference, and are what the app falls back to (with a warning) when the stiffness
   * solve can't run. */

  var MODEL_LABEL = { hinged: "hinged joints", rigid: "rigid joints" };
  SWEEP.forEach(function (a) { MODEL_LABEL["semi" + a] = "semi-rigid joints (" + a + " EI/L)"; });
  // the carrier case (1.22.0): the same joint model with each hoist hung below a truss at its high hook dynamic load
  Object.keys(MODEL_LABEL).forEach(function (k) { MODEL_LABEL[k + "+dyn"] = MODEL_LABEL[k] + ", hung hoists at their dynamic load"; });
  function isSemi(m) { return /^semi/.test(m); }

  function supportOf(t, id) { return ((t && t.supports) || []).filter(function (s) { return s.id === id; })[0]; }
  function hoistEntry(db, id) { return (db.hoists || []).filter(function (h) { return h.id === id; })[0] || (db.hoists || [])[0] || null; }
  function ownLoad(t) { return (t.loads || []).reduce(function (a, l) { return a + (Number(l.weight) || 0) * (l.mirror && Math.abs(l.distance - t.length / 2) > 1e-7 ? 2 : 1); }, 0); }
  function describeSeg(s) { return s.type === "span" ? "Span " + s.index : s.type === "cantilever-left" ? "Left cantilever" : "Right cantilever"; }
  function maxUtil(l) { return l.segments.reduce(function (m, s) { return Math.max(m, s.utilization || 0); }, l.member ? l.member.utilization || 0 : 0); }
  function margin(lp) { return Math.max(0.05 * Math.abs(lp), 20); }

  /** The force a load-path "injected" load stands for, from one whole-rig analysis: a bolted truss's connection force,
   * or a corner block's net force on the truss it sits on. Hardware at the connection rides along, as in rig.js. */
  function injectedForce(src, sol, rig, byId, results) {
    if (src.hang) return (sol.hangLoad && sol.hangLoad[src.truss + ":" + src.support]) || 0;
    var t = byId[src.truss], s = supportOf(t, src.support), hw = Number(s && s.hardwareWeight) || 0;
    if (!t || !t.isBlock) return (sol.forces.connections[src.truss + ":" + src.support] || 0) + hw;
    var f = 0, r = results.trusses[t.id];
    rig.trusses.forEach(function (u) {
      if (u.isBlock) return;
      (u.supports || []).forEach(function (s2) {
        if (s2.kind === "truss" && s2.onTruss === t.id) f += (sol.forces.connections[u.id + ":" + s2.id] || 0) + (Number(s2.hardwareWeight) || 0);
        if (s2.kind === "hoist" && s2.hangFrom === t.id) f += (sol.hangLoad && sol.hangLoad[u.id + ":" + s2.id]) || 0;
      });
    });
    (t.supports || []).forEach(function (s3) { if (s3.kind === "hoist") f -= sol.reactions[t.id + ":" + s3.id] || 0; });
    return f + (r && r.block ? r.block.weight : 0) + ownLoad(t) + hw;
  }

  /** The span/cantilever table checks of one truss with the loads and slack hoists of one whole-rig analysis. */
  /** Deflection of each span of a truss (1.18.0): the sag relative to the straight line between its two supports
   * (so a carrier truss sagging under a bolted one, or a hoist stretching, is not counted against the span), worst
   * of the joint models, against span / ratio. Past a maker's published limit the truss fails; past the rig default
   * it is a warning. Cantilever tips are reported, not checked (the makers' limits are for simple spans). */
  function deflectionCheck(t, res, out, MODELS, st) {
    var lim = TLA.limits.deflectionLimit(res.dbTruss, st), spans = [], cants = [];
    MODELS.forEach(function (mm) {
      var mf = out[mm].forces.members[t.id], bw = res.byModel && res.byModel[mm];
      if (!mf || !mf.defl || !bw) return;
      var d = mf.defl, P = bw.beam.positions || [];
      function at(x) {
        for (var i = 1; i < d.length; i++) if (d[i][0] >= x - 1e-9) { var a = d[i - 1], b = d[i]; return b[0] - a[0] < 1e-12 ? b[1] : a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
        return d.length ? d[d.length - 1][1] : 0;
      }
      for (var i = 0; i + 1 < P.length; i++) {
        var a = P[i], b = P[i + 1], L = b - a; if (L < 1e-6) continue;
        var wa = at(a), wb = at(b), mx = 0, x0 = a;
        d.forEach(function (p) { if (p[0] < a - 1e-9 || p[0] > b + 1e-9) return; var rel = Math.abs(p[1] - (wa + (wb - wa) * (p[0] - a) / L)); if (rel > mx) { mx = rel; x0 = p[0]; } });
        var allowed = L / lim.ratio, u = mx / allowed, k = spans.length ? spans.filter(function (s) { return Math.abs(s.from - a) < 1e-6 && Math.abs(s.to - b) < 1e-6; })[0] : null;
        var row = { index: i + 1, from: a, to: b, length: L, max: mx, at: x0, ratio: lim.ratio, allowed: allowed, util: u, model: mm };
        if (!k) spans.push(row); else if (u > k.util) Object.assign(k, row);
      }
      if (P.length) [["left", 0, P[0]], ["right", t.length, P[P.length - 1]]].forEach(function (c) {
        if (Math.abs(c[1] - c[2]) < 1e-6) return;
        var tip = Math.abs(at(c[1]) - at(c[2])), k2 = cants.filter(function (x) { return x.side === c[0]; })[0];
        if (!k2) cants.push({ side: c[0], length: Math.abs(c[1] - c[2]), tip: tip, model: mm }); else if (tip > k2.tip) { k2.tip = tip; k2.model = mm; }
      });
    });
    if (!spans.length && !cants.length) return null;
    spans.sort(function (a, b) { return a.from - b.from; });
    spans.forEach(function (s, i) { s.index = i + 1; });
    // 1.18.0 (owner): past the maker's own published limit the truss fails - their allowable loads are set by it;
    // past the rig default (no maker limit) it is a warning only
    spans.forEach(function (s) { s.fail = lim.source === "maker" && s.util > 1 + 1e-9; });
    var util = spans.reduce(function (m, s) { return Math.max(m, s.util); }, 0);
    return { ratio: lim.ratio, source: lim.source, note: lim.note, spans: spans, cantilevers: cants, util: util, fail: spans.some(function (s) { return s.fail; }) };
  }

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
    // moment/shear check on the whole-rig analysis's own diagrams; net of self weight when the rig leaves it out
    var full = sol.forces.members[t.id], net = full, bi = -1;
    model.beams.forEach(function (bm, i) { if (bm.t.id === t.id) bi = i; });
    if (full && bi >= 0 && !TLA.limits.countSelfWeight(st) && model.beams[bi].wSelf > 0) {
      var bmT = model.beams[bi], F = sol.F.slice(), Fs = sol.udlVector(bi, bmT.wSelf);
      for (var q = 0; q < F.length; q++) F[q] -= Fs[q];
      var r = sol.solveF(F, sol.set);                   // same structure, same slack hoists, same levels
      net = forces(model, { U: r.U, reactions: r.reactions, dofs: sol.dofs, supports: sol.supports }, function (b) { return b === bmT ? b.w - b.wSelf : b.w; }).members[t.id];
    }
    var limits = TLA.limits.checkTruss(truss, beam, t.wallWeight, { derate: typeof st.derate === "number" ? st.derate : undefined, cantileverSelfWeight: TLA.limits.countSelfWeight(st), memberDiagrams: full ? { full: full, net: net } : null });
    return { beam: beam, limits: limits, injected: injected };
  }

  /** Which joint model's table checks are worst: higher status code, then higher utilisation (ties: rigid, then the
   * stiffer semi-rigid models, as before 1.4.0). */
  function worst(by, order) {
    var best = null;
    order.slice().reverse().forEach(function (m) {
      var a = by[m]; if (!a) return;
      var b = best && by[best];
      if (!b || a.limits.worstCode > b.limits.worstCode || (a.limits.worstCode === b.limits.worstCode && maxUtil(a.limits) > maxUtil(b.limits) + 1e-12)) best = m;
    });
    return best;
  }

  var TRIM_FT = 1 / 48;          // a quarter inch
  function round2(v) { return Math.round(v * 100) / 100; }
  /** Out-of-level influence (1.22.0): the reactions when each active hoist alone is raised by ft, cached on the solve. */
  function influence(sol, model, ft) {
    var c = sol.levelInf || (sol.levelInf = {});
    if (c[ft]) return c[ft];
    var out = {};
    model.supports.concat(model.hangs || []).forEach(function (sp) {
      if (sol.slack.indexOf(sp.id) >= 0 || out[sp.id]) return;
      var r = sol.lift(sp.id, ft); if (r) out[sp.id] = r.reactions;
    });
    return (c[ft] = out);
  }
  var TRIM_WARN = 0.1;           // of the hoist's capacity

  function applyPrimary(rig, results, db, out) {
    var byId = {}, st = rig.settings || {}, W = results.warnings, MODELS = out.order;
    rig.trusses.forEach(function (t) { byId[t.id] = t; });
    results.primary = "grillage";
    results.models = MODELS.slice();
    // the load-path hoist and span warnings are replaced by the ones below
    for (var i = W.length - 1; i >= 0; i--) if (W[i].kind === "segment" || W[i].kind === "member" || W[i].kind === "hoist") W.splice(i, 1);

    var DYN = out.dynOrder || [];
    Object.keys(results.trusses).forEach(function (id) {
      var t = byId[id], res = results.trusses[id];
      if (!t || t.isBlock) return;
      // a truss joined to a carrier of a hung hoist is also checked in the carrier case (listed first: ties go to the
      // static solve)
      var ML = DYN.length && out.dynGroup[id] ? DYN.concat(MODELS) : MODELS;
      var by = {}, any = false;
      ML.forEach(function (mm) { by[mm] = checkWith(t, res, out[mm], rig, byId, results, out[mm].model || out.model); if (by[mm]) any = true; });
      if (!any) return;
      var m = worst(by, ML);
      res.loadPath = { beam: res.beam, limits: res.limits, injected: res.injected };
      res.byModel = by; res.model = m;
      res.beam = by[m].beam; res.limits = by[m].limits; res.injected = by[m].injected;
      res.memberForces = {};
      ML.forEach(function (mm) { res.memberForces[mm] = out[mm].forces.members[id]; });
      var bm = out.model.beams.filter(function (b) { return b.t.id === id; })[0];
      if (bm) res.section = bm.section;
      res.deflection = deflectionCheck(t, res, out, MODELS, st);
      (res.deflection ? res.deflection.spans : []).forEach(function (sp) {
        if (sp.util > 1 + 1e-9) W.push({ truss: id, kind: "deflection", message: t.name + ": " + (sp.fail ? "Overloaded - " : "") + "span " + sp.index + " (" + (Math.round(sp.length * 100) / 100) + " ft) deflects about " + (Math.round(sp.max * 12 * 100) / 100) + " in, more than span/" + sp.ratio + " (" + (Math.round(sp.allowed * 12 * 100) / 100) + " in) - " + res.deflection.note + " (" + MODEL_LABEL[sp.model] + ")" });
      });
      // the reactions shown with this truss's diagram are from the same joint model as its checks
      res.supports.forEach(function (sr) {
        var key = id + ":" + sr.support.id;
        function val(sol) {
          if (sol.dynamic && sr.support.hangFrom) sol = out[sol.base];         // a hung hoist's own load: the static solve
          return sr.support.kind === "hoist" ? sol.reactions[key] || 0 : sol.forces.connections[key] || 0;
        }
        sr.loadPathReaction = sr.reaction;
        sr.byModel = {};
        ML.forEach(function (mm) { sr.byModel[mm] = val(out[mm]); });
        sr.reaction = sr.byModel[m];
      });
      res.limits.segments.forEach(function (s) {
        if (s.code) W.push({ truss: id, kind: "segment", message: t.name + ": " + describeSeg(s) + " - " + TLA.limits.statusText(s.status) + " (" + MODEL_LABEL[m] + ")" });
      });
      var mb = res.limits.member;
      if (mb && mb.code) W.push({ truss: id, kind: "member", level: "member", message: t.name + ": " + TLA.limits.memberMessage(mb) + " (" + MODEL_LABEL[m] + ")" });
    });

    var names = {}, touchy = [], tol = Number(st.levelTolerance) > 0 ? Number(st.levelTolerance) / 12 : 0, levelSlack = [], levelOver = [];
    results.hoists.forEach(function (h) { names[h.truss + ":" + h.support] = h.trussName + " " + (h.supportName || "hoist") + " at " + (Math.round(h.distance * 10) / 10) + " ft"; });
    results.hoists.forEach(function (h) {
      var id = h.truss + ":" + h.support, s = supportOf(byId[h.truss], h.support);
      if (!s || MODELS.some(function (mm) { return out[mm].reactions[id] === undefined; })) return;
      var by = {};
      // hoists of a carrier take a hung hoist's dynamic load too, unless Rig settings turn it off (owner, 2026-09-24)
      var HL = !h.hung && DYN.length && out.dynGroup[h.truss] && st.hungDynamic !== false ? MODELS.concat(DYN) : MODELS;
      HL.forEach(function (mm) {
        by[mm] = TLA.limits.checkSupport(s, db, out[mm].reactions[id], st);
        by[mm].model = mm;
        if (out[mm].slack.indexOf(id) >= 0) { by[mm].slack = true; by[mm].status = "Slack"; }
      });
      // governing: the largest static load (ties: rigid, then the stiffer semi-rigid models, as before 1.4.0)
      var m = "rigid";
      HL.slice().reverse().forEach(function (mm) { if (by[mm].staticLoad > by[m].staticLoad + 1e-9) m = mm; });
      var gov = Object.assign({}, by[m]);
      if (results.unstable.indexOf(h.truss) >= 0) gov.status = "UNSTABLE";     // the load path says this truss tips
      var lp = { reaction: h.reaction, slack: h.slack, hoist: h.hoist };
      h.loadPath = lp; h.byModel = by; h.model = m;
      h.reaction = gov.reaction; h.slack = !!gov.slack; h.hoist = gov;
      var res = results.trusses[h.truss], sr = res && res.supports.filter(function (x) { return x.support.id === h.support; })[0];
      if (sr) {
        sr.hoist = gov; sr.slack = h.slack;
        if (!sr.byModel) { sr.loadPathReaction = lp.reaction; sr.byModel = {}; MODELS.forEach(function (mm) { sr.byModel[mm] = by[mm].reaction; }); sr.reaction = gov.reaction; }
      }
      var lps = lp.hoist.staticLoad, semis = MODELS.filter(isSemi), slackIn = MODELS.filter(function (mm) { return by[mm].slack; });
      h.compat = gov.compat = {
        hinged: by.hinged.staticLoad, rigid: by.rigid.staticLoad, envelope: gov.staticLoad, loadPath: lps,
        semiMin: semis.length ? Math.min.apply(null, semis.map(function (mm) { return by[mm].staticLoad; })) : null,
        semiMax: semis.length ? Math.max.apply(null, semis.map(function (mm) { return by[mm].staticLoad; })) : null,
        slackHinged: !!by.hinged.slack, slackRigid: !!by.rigid.slack, slackIn: slackIn,
        higher: gov.staticLoad > lps + margin(lps), lower: gov.staticLoad < lps - margin(lps)
      };
      // trim: this hoist a quarter inch high, in the joint model that governs it (linear, same slack hoists; the static
      // solve of it when the carrier case governs)
      var tm = out[m].dynamic ? out[m].base : m, sol = out[tm];
      if (!h.slack && sol.lift) {
        var lr = sol.lift(id, TRIM_FT), other = null;
        if (lr) {
          Object.keys(lr.reactions).forEach(function (k) { if (k !== id && (!other || Math.abs(lr.reactions[k]) > Math.abs(other.lb))) other = { id: k, name: names[k] || k, lb: lr.reactions[k] }; });
          h.trim = gov.trim = { self: lr.reactions[id], other: other, model: tm };
        }
      }
      // 1.22.0: out-of-level tolerance - every hoist may be up to +/- tol off its level, each on its own. The worst
      // increase at this hoist is the sum of what each one alone does to it (linear, same slack hoists), added to its
      // low hook load for the check; the low side is reported (it may go slack)
      if (tol > 0 && !h.slack && sol.lift) {
        var inf = influence(sol, out.model, tol), dl = 0;
        Object.keys(inf).forEach(function (j) { dl += Math.abs(inf[j][id] || 0); });
        var c2 = TLA.limits.checkSupport(s, db, gov.reaction + dl, st), unst = gov.status === "UNSTABLE";
        ["added", "staticLoad", "dynamicLoad", "status", "dynamicOver"].forEach(function (k) { gov[k] = c2[k]; });
        if (unst) gov.status = "UNSTABLE";
        h.level = gov.level = { tol: tol, add: dl, low: gov.reaction - dl, model: tm };
        if (gov.reaction - dl < -SLACK_TOL) levelSlack.push(names[id]);
        if (gov.status !== "Good" && !unst && by[m].status === "Good") levelOver.push(names[id]);
      }
      var where = names[id];
      if (h.slack) W.push({ truss: h.truss, kind: "hoist", level: "slack", message: where + ": slack - the load would push this hoist up (with every joint model), so its chain goes slack and it carries nothing (only the hoist and chain weight). The rest of the rig carries its share; the results shown are with this hoist taken out." });
      else if (slackIn.length) W.push({ truss: h.truss, kind: "hoist", level: "slack", message: where + ": goes slack with " + slackIn.map(function (mm) { return MODEL_LABEL[mm]; }).join(", ") + " only; the " + MODEL_LABEL[m] + " result (" + Math.round(gov.staticLoad) + " lb) is used." });
      if (!h.slack && gov.status !== "Good" && gov.status !== "UNSTABLE") W.push({ truss: h.truss, kind: "hoist", message: h.trussName + " " + (h.supportName || "hoist") + ": " + TLA.limits.statusText(gov.status) + " (" + Math.round(gov.staticLoad) + " lb static, " + MODEL_LABEL[m] + ")" });
      else if (!h.slack && gov.dynamicOver) W.push({ truss: h.truss, kind: "hoist", message: h.trussName + " " + (h.supportName || "hoist") + ": dynamic load exceeds capacity (" + MODEL_LABEL[m] + ")" });
      if (h.trim && gov.capacity > 0 && gov.capacity < 999999 && Math.abs(h.trim.self) > TRIM_WARN * gov.capacity) touchy.push({ h: h, share: Math.abs(h.trim.self) / gov.capacity });
    });
    if (levelOver.length) W.push({ kind: "hoist", level: "level", message: "Out of level by up to ±" + round2(tol * 12) + " in on every hoist (Rig settings): " + levelOver.join(", ") + (levelOver.length === 1 ? " is" : " are") + " over capacity only because of the level allowance. Level the hoists more closely, or use bigger hoists." });
    if (levelSlack.length) W.push({ kind: "hoist", level: "level", message: "Out of level by up to ±" + round2(tol * 12) + " in: " + levelSlack.join(", ") + " could unload completely and go slack on the low side - the others then carry more. Level carefully." });
    // one warning for every trim-sensitive hoist, led by the worst
    if (touchy.length) {
      touchy.sort(function (a, b) { return b.share - a.share; });
      var w0 = touchy[0].h, t0 = w0.trim;
      W.push({ truss: w0.truss, kind: "hoist", level: "trim", message: (touchy.length === 1 ? "1 hoist is" : touchy.length + " hoists are") + " level-sensitive (a 1/4\" level error changes the load by more than " + Math.round(TRIM_WARN * 100) + "% of the hoist's capacity - short, stiff spans). Worst: " + names[w0.truss + ":" + w0.support] + " - running it 1/4\" high adds about " + Math.round(t0.self) + " lb (" + Math.round(touchy[0].share * 100) + "% of its capacity)" + (t0.other ? " and changes " + t0.other.name + " by " + Math.round(t0.other.lb) + " lb" : "") +
        (touchy.length > 1 ? ". Also: " + touchy.slice(1).map(function (x) { return names[x.h.truss + ":" + x.h.support]; }).join(", ") : "") + ". Level the hoists carefully; each hoist's panel shows its figure." });
    }

    var tot = results.totals;
    tot.loadPath = { staticLoad: tot.staticLoad, dynamicLoad: tot.dynamicLoad, hoistReaction: tot.hoistReaction };
    tot.staticLoad = tot.dynamicLoad = tot.hoistChain = tot.hoistReaction = 0;
    tot.byModel = {};
    MODELS.forEach(function (mm) { tot.byModel[mm] = 0; });
    results.hoists.forEach(function (h) {
      if (h.hung) return;                                   // inside the rig: its load reaches the structure through the carrier
      tot.staticLoad += h.hoist.staticLoad; tot.dynamicLoad += h.hoist.dynamicLoad; tot.hoistChain += h.hoist.hoistChain; tot.hoistReaction += h.reaction;
      MODELS.forEach(function (mm) { tot.byModel[mm] += h.byModel ? h.byModel[mm].staticLoad : h.hoist.staticLoad; });
    });
  }

  function fallback(rig, results, out) {
    results.primary = "load-path";
    var hoists = rig.trusses.some(function (t) { return (t.supports || []).some(function (s) { return s.kind === "hoist"; }); });
    if (out.unstable || !hoists) return;
    var st = rig.settings || {}, lev = rig.trusses.some(function (t) { return (t.supports || []).some(function (s) { return Number(s.level); }); });
    if (lev || Number(st.levelTolerance) > 0) results.warnings.push({ level: "fallback", message: "Hoist level offsets and the out-of-level tolerance need the whole-rig analysis: they are left out of these load-path results." });
    results.warnings.push({ level: "fallback", message: "Whole-rig analysis not available" + (out.note ? " (" + out.note.replace(/\.$/, "") + ")" : "") +
      ": hoist loads and truss checks are from the load-path method alone, which treats every carrying truss as unyielding and can under-estimate hoists in a grid." });
  }

  /** Solve every joint model, then make them the primary result (see applyPrimary). */
  function annotate(rig, results, db, opts) {
    opts = opts || {}; db = db || TLA.data || {}; rig = TLA.rig.effective(rig);     // cable and load factors (1.22.0)
    var sig = signature(rig, results), out;
    if (last.sig === sig && last.out) out = last.out;
    else { out = compute(rig, results, db, opts); last = { sig: sig, out: out }; }
    results.compat = out;
    if (out.unstable) results.warnings.unshift({ level: "unstable", message: "Whole-rig analysis: " + out.note });
    if (!out.ok) { fallback(rig, results, out); return out; }
    if (out.hingedNote) results.warnings.push({ level: "info", message: "Whole-rig analysis: " + out.hingedNote });
    // self-checks: the solve balances, carries the same total weight as the load-path solve, and the connection
    // forces account for every node
    var tol = 0.5 + 1e-6 * out.load, applied = results.totals && results.totals.applied;
    var bad = out.order.filter(function (mm) { return Math.abs(out[mm].equilibriumError) > tol; })[0];
    if (bad) results.warnings.push({ level: "internal", message: "Whole-rig analysis does not balance (" + Math.round(out[bad].equilibriumError) + " lb, " + MODEL_LABEL[bad] + ") - please report this rig." });
    if (typeof applied === "number" && Math.abs(out.load - applied) > tol)
      results.warnings.push({ level: "internal", message: "Whole-rig analysis carries " + Math.round(out.load) + " lb but the load-path solve carries " + Math.round(applied) + " lb - please report this rig." });
    out.order.forEach(function (mm) {
      var f = out[mm].forces;
      if (f.loop) results.warnings.push({ level: "internal", message: "Whole-rig analysis (" + MODEL_LABEL[mm] + "): bolted connections meet in a closed loop at one point, so their forces can't be split - please report this rig." });
      else if (f.residual > tol) results.warnings.push({ level: "internal", message: "Whole-rig analysis (" + MODEL_LABEL[mm] + "): connection forces are " + Math.round(f.residual) + " lb out - please report this rig." });
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
      // designed level offsets (1.22.0) move load between hoists without adding any: what is left over is theirs
      if (sol.leveled && sol.slack.indexOf(id) < 0) {
        var rest = (sol.reactions[id] || 0) - parts.reduce(function (a2, p2) { return a2 + p2.weight; }, 0);
        if (Math.abs(rest) > 0.005) parts.push({ truss: "", name: "Designed level offsets", weight: rest });
      }
      parts.sort(function (a2, b2) { return Math.abs(b2.weight) - Math.abs(a2.weight); });
      cache[id] = parts;
    }
    return { reaction: h.reaction, hoistChain: h.hoist.hoistChain, staticLoad: h.hoist.staticLoad, parts: cache[id], model: h.model };
  }

  /** The whole-rig model of a rig for an outside cross-check (tools/pynite_check.py builds it in PyNite, the engine
   * behind CalcForge 3D): Euler-Bernoulli beams (PyNite has no shear deformation, so GA is left out here), hinged and
   * rigid joints, hoist springs, with this tool's own reactions and member forces for the same model. Lengths ft,
   * forces lb, EI/GJ lb-ft2, k lb/ft. */
  function exportModel(rig, results, db) {
    db = db || TLA.data || {}; rig = TLA.rig.effective(rig);
    if (results.unsolved && results.unsolved.length) return null;
    var model = build(rig, results, db);
    if (!model.supports.length || unheldGroups(model).length) return null;
    model.beams.forEach(function (bm) { bm.GA = Infinity; bm.els = []; });
    function r6(v) { return Math.round(v * 1e6) / 1e6; }
    var ex = {
      tool: "Truss Grid Analyzer", version: TLA.VERSION, units: { length: "ft", force: "lb", EI: "lb-ft2", GJ: "lb-ft2", k: "lb/ft" },
      beams: model.beams.map(function (bm) {
        return { id: bm.t.id, name: bm.t.name, x: Number(bm.t.x) || 0, y: Number(bm.t.y) || 0, angle: Number(bm.t.angle) || 0, L: bm.L, EI: bm.EI, GJ: bm.GJ, w: bm.w,
          nodes: bm.nodes.map(function (nd) { return { d: r6(nd.d), P: nd.P || 0 }; }) };
      }),
      links: model.links.map(function (lk) { return { a: lk.a, na: lk.na, b: lk.b, nb: lk.nb, rigid: !!lk.rigid }; }),
      supports: model.supports.map(function (sp) { return sp.k > 0 ? { b: sp.b, n: sp.n, id: sp.id, k: sp.k } : { b: sp.b, n: sp.n, id: sp.id }; }),
      // hoists hung below a truss (1.22.0): a vertical tension-only link from node (a, na) up to node (b, nb), spring k
      // lb/ft or rigid - tools/pynite_check.py does not model these yet
      hangs: (model.hangs || []).map(function (hg) { return hg.k > 0 ? { a: hg.a, na: hg.na, b: hg.b, nb: hg.nb, id: hg.id, k: hg.k } : { a: hg.a, na: hg.na, b: hg.b, nb: hg.nb, id: hg.id }; }),
      results: {}
    };
    ["hinged", "rigid"].forEach(function (m) {
      var s = solveSlack(model, m);
      if (!s.ok) { ex.results[m] = { ok: false }; return; }
      var f = forces(model, s), members = {};
      Object.keys(f.members).forEach(function (id) { var x = f.members[id]; members[id] = { maxMoment: x.maxMoment, maxSag: x.maxSag, maxHog: x.maxHog, maxShear: x.maxShear, maxTorque: x.maxTorque }; });
      ex.results[m] = { ok: true, slack: s.slack, reactions: s.reactions, members: members };
    });
    return ex;
  }

  TLA.grillage = { annotate: annotate, build: build, solveModel: solveModel, solveSlack: solveSlack, forces: forces, attribution: attribution, exportModel: exportModel, estimateEI: estimateEI, estimateStiffness: estimateStiffness, MODEL_LABEL: MODEL_LABEL, SWEEP: SWEEP, TRIM_FT: TRIM_FT };
})(typeof globalThis !== "undefined" ? globalThis : window);
