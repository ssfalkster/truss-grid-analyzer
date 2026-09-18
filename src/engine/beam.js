/* Single-truss continuous beam engine (three-moment equation). Pure functions, no DOM.
 * Units: feet, pounds. Moments are hogging-positive (lb-ft).
 * Algorithm verified against Truss Load Analyzer - EOT (Hall & Sogoian) cached values. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var EPS = 1e-9;

  /** Expand loads with mirror flag into the list the solver sees. */
  function expandLoads(loads, length) {
    var out = [];
    (loads || []).forEach(function (ld) {
      var w = Number(ld.weight) || 0;
      var d = Number(ld.distance) || 0;
      out.push({ distance: d, weight: w, note: ld.note, source: ld.source, injected: ld.injected, ref: ld });
      if (ld.mirror && Math.abs(d - length / 2) > 1e-7) {
        out.push({ distance: length - d, weight: w, note: ld.note, source: ld.source, injected: ld.injected, ref: ld, mirrored: true });
      }
    });
    return out;
  }

  /** Solve tridiagonal system (sub a, diag b, super c, rhs d) with the Thomas algorithm. */
  function thomas(a, b, c, d) {
    var n = d.length;
    var cp = new Array(n), dp = new Array(n), x = new Array(n);
    cp[0] = c[0] / b[0];
    dp[0] = d[0] / b[0];
    for (var i = 1; i < n; i++) {
      var m = b[i] - a[i] * cp[i - 1];
      cp[i] = c[i] / m;
      dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
    }
    x[n - 1] = dp[n - 1];
    for (var j = n - 2; j >= 0; j--) x[j] = dp[j] - cp[j] * x[j + 1];
    return x;
  }

  /**
   * input: { length, supports:[distance...], loads:[{distance,weight,...}],
   *          trussWeightPerFt, wallWeight, weightless }
   * returns reactions aligned with the input support order.
   */
  function solve(input) {
    var length = Number(input.length) || 0;
    var warnings = [];
    var raw = (input.supports || []).map(function (s, i) { return { pos: Number(s), idx: i }; });
    if (raw.length === 0) throw new Error("At least one support is required");

    // merge coincident supports; their reaction is split equally afterwards
    raw.sort(function (a, b) { return a.pos - b.pos; });
    var groups = [];
    raw.forEach(function (s) {
      var last = groups[groups.length - 1];
      if (last && Math.abs(last.pos - s.pos) < EPS) last.members.push(s.idx);
      else groups.push({ pos: s.pos, members: [s.idx] });
    });
    var P = groups.map(function (gr) { return gr.pos; });
    var n = P.length;
    if (P[0] < -0.01 || P[n - 1] > length + 0.01) warnings.push("Support outside truss length");
    if (length < P[n - 1]) length = P[n - 1];

    var loads = expandLoads(input.loads, length);
    loads.forEach(function (l) {
      if (l.distance < -EPS || l.distance > length + EPS) warnings.push("Load at " + l.distance + " ft is outside the truss");
    });

    var wall = Number(input.wallWeight) || 0;
    var wDist = wall / (length || 1);
    var wSelf = input.weightless ? 0 : Number(input.trussWeightPerFt) || 0;
    var w = wSelf + wDist;

    var leftLen = Math.max(P[0], 0);
    var rightLen = Math.max(length - P[n - 1], 0);

    // cantilever + span load buckets
    var left = { F: 0, MF: 0 }, right = { F: 0, MF: 0 };
    var spans = [];
    for (var k = 0; k < n - 1; k++) spans.push({ start: P[k], L: P[k + 1] - P[k], pl: [], sumF: 0 });

    loads.forEach(function (l) {
      var x = l.distance;
      if (x < P[0]) { left.F += l.weight; left.MF += l.weight * (P[0] - x); return; }
      if (x >= P[n - 1]) { right.F += l.weight; right.MF += l.weight * (x - P[n - 1]); return; }
      var lo = 0, hi = n - 2;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (P[mid] <= x) lo = mid; else hi = mid - 1;
      }
      spans[lo].pl.push({ a: x - P[lo], F: l.weight });
      spans[lo].sumF += l.weight;
    });

    var Vleft = left.F + w * leftLen;
    var M1 = left.MF + 0.5 * w * leftLen * leftLen;
    var Vright = right.F + w * rightLen;
    var Mn = right.MF + 0.5 * w * rightLen * rightLen;

    // per-span simple-beam terms
    spans.forEach(function (s) {
      var L = s.L, pL = 0, pR = 0, vL = 0, vR = 0;
      s.pl.forEach(function (p) {
        var a = p.a, b = L - a, F = p.F;
        pL += (F * a * b * (L + b)) / (6 * L);
        pR += (F * a * b * (L + a)) / (6 * L);
        vL += (F * b) / L;
        vR += (F * a) / L;
      });
      pL += (w * L * L * L) / 24; pR += (w * L * L * L) / 24;
      vL += (w * L) / 2; vR += (w * L) / 2;
      s.phiL = pL; s.phiR = pR; s.VL = vL; s.VR = vR;
    });

    // support moments (hogging positive)
    var M = new Array(n);
    M[0] = M1; M[n - 1] = Mn;
    if (n === 1) { M[0] = 0; warnings.push("Single support: moment is not resisted; results are not valid"); }
    if (n >= 3) {
      var m = n - 2, A = [], B = [], C = [], D = [];
      for (var i = 0; i < m; i++) {
        var sL = spans[i], sR = spans[i + 1];
        A.push(sL.L / 6);
        B.push((sL.L + sR.L) / 3);
        C.push(sR.L / 6);
        var rhs = sL.phiR + sR.phiL;
        if (i === 0) rhs -= (sL.L / 6) * M1;
        if (i === m - 1) rhs -= (sR.L / 6) * Mn;
        D.push(rhs);
      }
      var sol = thomas(A, B, C, D);
      for (var q = 0; q < m; q++) M[q + 1] = sol[q];
    }

    // reactions per unique support
    var R = new Array(n).fill(0);
    R[0] += Vleft;
    R[n - 1] += Vright;
    if (n === 1) { R[0] = Vleft + Vright; }
    spans.forEach(function (s, k2) {
      var d = (M[k2] - M[k2 + 1]) / s.L;
      s.VLtot = s.VL + d;
      s.VRtot = s.VR - d;
      R[k2] += s.VLtot;
      R[k2 + 1] += s.VRtot;
    });

    var reactions = new Array(raw.length);
    groups.forEach(function (gr, gi) {
      gr.members.forEach(function (idx) { reactions[idx] = R[gi] / gr.members.length; });
    });

    var totalLoad = loads.reduce(function (t, l) { return t + l.weight; }, 0) + w * length;
    return {
      length: length, w: w, wSelf: wSelf, wDist: wDist,
      positions: P, sortedReactions: R, reactions: reactions, moments: M,
      left: { length: leftLen, V: Vleft, M: M1, sumF: left.F },
      right: { length: rightLen, V: Vright, M: Mn, sumF: right.F },
      spans: spans, loads: loads, totalLoad: totalLoad,
      equilibriumError: R.reduce(function (t, r) { return t + r; }, 0) - totalLoad,
      warnings: warnings
    };
  }

  TLA.beam = { solve: solve, expandLoads: expandLoads, thomas: thomas };
})(typeof globalThis !== "undefined" ? globalThis : window);
