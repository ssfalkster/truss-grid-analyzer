/* Single-truss continuous beam engine (three-moment equation). Pure functions, no DOM.
 * Units: feet, pounds. Moments are hogging-positive (lb-ft).
 * Algorithm verified against Truss Load Analyzer - EOT (Hall & Sogoian) cached values. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var EPS = 1e-9;

  /** Expand loads with mirror flag into the list the solver sees. A load with a span (2.0.0, ft) is a partial UDL:
   * its weight spread evenly over span, centered on distance; those are left out here (see expandUdls). */
  function expandLoads(loads, length) {
    var out = [];
    (loads || []).forEach(function (ld) {
      if (Number(ld.span) > 0) return;
      var w = Number(ld.weight) || 0;
      var d = Number(ld.distance) || 0;
      out.push({ distance: d, weight: w, note: ld.note, source: ld.source, injected: ld.injected, ref: ld });
      if (ld.mirror && Math.abs(d - length / 2) > 1e-7) {
        out.push({ distance: length - d, weight: w, note: ld.note, source: ld.source, injected: ld.injected, ref: ld, mirrored: true });
      }
    });
    return out;
  }

  /** Partial UDLs (2.0.0): a load with span > 0 is its weight spread evenly over [distance - span/2, distance + span/2],
   * cut to the truss. Mirrored like a point load (the twin is centered on length - distance). Each: { start, end, q
   * (lb/ft), weight, distance (center), span, note, ref, mirrored }. */
  function expandUdls(loads, length) {
    var out = [];
    (loads || []).forEach(function (ld) {
      var sp = Number(ld.span) || 0; if (!(sp > 0)) return;
      var w = Number(ld.weight) || 0, d = Number(ld.distance) || 0, q = w / sp;
      function one(c, mirrored) {
        var a = Math.max(0, c - sp / 2), b = Math.min(length, c + sp / 2);
        if (b - a < EPS) return;
        out.push({ start: a, end: b, q: q, weight: q * (b - a), distance: (a + b) / 2, span: b - a, note: ld.note, ref: ld, mirrored: !!mirrored });
      }
      one(d);
      if (ld.mirror && Math.abs(d - length / 2) > 1e-7) one(length - d, true);
    });
    return out;
  }
  /** A uniform load q over [a, b] of a span of length L (a, b from its left support): its simple-beam rotation terms
   * for the three-moment equation (6 A xbar / L at each end, as for a point load F a b (L + b) / 6L, integrated) and
   * its simple-beam end shears. */
  function udlTerms(q, a, b, L) {
    function iL(x) { return L * L * x * x - L * x * x * x + x * x * x * x / 4; }      // integral of x (L - x)(2L - x)
    function iR(x) { return L * L * x * x / 2 - x * x * x * x / 4; }                   // integral of x (L - x)(L + x)
    function vl(x) { return L * x - x * x / 2; }
    return { pL: q * (iL(b) - iL(a)) / (6 * L), pR: q * (iR(b) - iR(a)) / (6 * L), vL: q * (vl(b) - vl(a)) / L, vR: q * (b * b - a * a) / (2 * L) };
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
   * input: { length, supports:[distance...], loads:[{distance,weight,span?,...}] (span > 0: a partial UDL),
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

    var udls = expandUdls(input.loads, length);
    var wall = Number(input.wallWeight) || 0;
    var wDist = wall / (length || 1);
    var wSelf = input.weightless ? 0 : Number(input.trussWeightPerFt) || 0;
    var w = wSelf + wDist;

    var leftLen = Math.max(P[0], 0);
    var rightLen = Math.max(length - P[n - 1], 0);

    // cantilever + span load buckets
    var left = { F: 0, MF: 0 }, right = { F: 0, MF: 0 };
    var spans = [];
    for (var k = 0; k < n - 1; k++) spans.push({ start: P[k], L: P[k + 1] - P[k], pl: [], ud: [], sumF: 0 });
    // partial UDLs, cut at the supports: cantilever parts add their weight and moment about the end support; span
    // parts keep their stretch for the span terms. udl* sums are what limits.js checks them as.
    left.udls = []; right.udls = [];
    udls.forEach(function (u) {
      var a = u.start, b = Math.min(u.end, P[0]);
      if (b - a > EPS) { left.F += u.q * (b - a); left.MF += u.q * ((P[0] - a) * (P[0] - a) - (P[0] - b) * (P[0] - b)) / 2; left.udls.push({ a: a, b: b, q: u.q, ref: u }); }
      a = Math.max(u.start, P[n - 1]); b = u.end;
      if (b - a > EPS) { right.F += u.q * (b - a); right.MF += u.q * ((b - P[n - 1]) * (b - P[n - 1]) - (a - P[n - 1]) * (a - P[n - 1])) / 2; right.udls.push({ a: a, b: b, q: u.q, ref: u }); }
      spans.forEach(function (sp) {
        var a2 = Math.max(u.start, sp.start), b2 = Math.min(u.end, sp.start + sp.L);
        if (b2 - a2 > EPS) sp.ud.push({ a: a2 - sp.start, b: b2 - sp.start, q: u.q, ref: u });
      });
    });

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
      s.ud.forEach(function (u) { var tm = udlTerms(u.q, u.a, u.b, L); pL += tm.pL; pR += tm.pR; vL += tm.vL; vR += tm.vR; });
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

    var totalLoad = loads.reduce(function (t, l) { return t + l.weight; }, 0) + udls.reduce(function (t, u) { return t + u.weight; }, 0) + w * length;
    return {
      length: length, w: w, wSelf: wSelf, wDist: wDist,
      positions: P, sortedReactions: R, reactions: reactions, moments: M,
      left: { length: leftLen, V: Vleft, M: M1, sumF: left.F, udls: left.udls, udlF: left.udls.reduce(function (t, u) { return t + u.q * (u.b - u.a); }, 0) },
      right: { length: rightLen, V: Vright, M: Mn, sumF: right.F, udls: right.udls, udlF: right.udls.reduce(function (t, u) { return t + u.q * (u.b - u.a); }, 0) },
      spans: spans, loads: loads, udls: udls, totalLoad: totalLoad,
      equilibriumError: R.reduce(function (t, r) { return t + r; }, 0) - totalLoad,
      warnings: warnings
    };
  }

  /**
   * Shear and bending moment along a solved beam (statics from its reactions, loads and uniform load).
   * Sign convention: sagging moment positive (hogging over supports is negative); shear is the upward force on the
   * part to the left of the cut. Returns points at every support, load and end (shear just left and just right of
   * each), plus the peak of each uniformly loaded stretch; and the extremes.
   */
  function diagram(b) {
    var L = b.length, w = b.w, P = b.positions, R = b.sortedReactions, loads = b.loads, udls = b.udls || [];
    function qAt(x) { var q = w; udls.forEach(function (u) { if (x > u.start - EPS && x < u.end + EPS) q += u.q; }); return q; }   // load intensity
    function V(x, right) {       // shear just left (right = false) or just right of x
      var v = -w * Math.min(Math.max(x, 0), L);
      udls.forEach(function (u) { var e = Math.min(u.end, x); if (e > u.start) v -= u.q * (e - u.start); });
      P.forEach(function (p, i) { if (right ? p <= x + EPS : p < x - EPS) v += R[i]; });
      loads.forEach(function (l) { if (right ? l.distance <= x + EPS : l.distance < x - EPS) v -= l.weight; });
      return v;
    }
    function M(x) {
      var m = -w * x * x / 2;
      udls.forEach(function (u) { var e = Math.min(u.end, x); if (e > u.start) m -= u.q * (e - u.start) * (x - (u.start + e) / 2); });
      P.forEach(function (p, i) { if (p < x) m += R[i] * (x - p); });
      loads.forEach(function (l) { if (l.distance < x) m -= l.weight * (x - l.distance); });
      return m;
    }
    var xs = [0, L].concat(P).concat(loads.map(function (l) { return l.distance; })).concat([].concat.apply([], udls.map(function (u) { return [u.start, u.end]; })))
      .filter(function (x) { return x >= -EPS && x <= L + EPS; }).sort(function (a, c) { return a - c; });
    var pts = [];
    xs.forEach(function (x) { if (!pts.length || x - pts[pts.length - 1].x > 1e-7) pts.push({ x: x }); });
    pts.forEach(function (p, i) { p.vl = p.x <= EPS ? 0 : V(p.x, false); p.vr = p.x >= L - EPS ? 0 : V(p.x, true); p.m = M(p.x); p.q = i + 1 < pts.length ? qAt((p.x + pts[i + 1].x) / 2) : 0; });
    // peaks inside uniformly loaded stretches, where the shear passes through zero (every UDL end is a point, so the
    // intensity is constant between two points)
    for (var i = pts.length - 2; i >= 0; i--) {
      var a = pts[i], c = pts[i + 1], qi = qAt((a.x + c.x) / 2);
      if (qi > 0 && a.vr > 0 && c.vl < 0) { var xp = a.x + a.vr / qi; pts.splice(i + 1, 0, { x: xp, vl: 0, vr: 0, m: M(xp), peak: true, q: qi }); }
    }
    var out = { points: pts, w: w, length: L, maxSag: 0, maxHog: 0, maxShear: 0, atSag: 0, atHog: 0, atShear: 0 };
    pts.forEach(function (p) {
      if (p.m > out.maxSag) { out.maxSag = p.m; out.atSag = p.x; }
      if (-p.m > out.maxHog) { out.maxHog = -p.m; out.atHog = p.x; }
      var v = Math.max(Math.abs(p.vl), Math.abs(p.vr));
      if (v > out.maxShear) { out.maxShear = v; out.atShear = p.x; }
    });
    out.maxMoment = Math.max(out.maxSag, out.maxHog);
    return out;
  }

  TLA.beam = { solve: solve, expandLoads: expandLoads, expandUdls: expandUdls, thomas: thomas, diagram: diagram };
})(typeof globalThis !== "undefined" ? globalThis : window);
