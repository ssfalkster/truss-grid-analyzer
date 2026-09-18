/* Truss capacity checks and hoist checks, matching Truss Load Analyzer - EOT behaviour. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});

  var STATUS = { 0: "Good", 1: "TOO LONG!", 2: "OVERLOADED", 3: "FAILURE" };

  /** Table lookup by length in feet, rounding up to the next tabulated foot (conservative). */
  function table(arr, len) {
    var i = Math.ceil(len - 1e-9);
    if (i < 1) i = 1;
    if (!arr || i > arr.length) return 0;
    return Number(arr[i - 1]) || 0;
  }

  /** derate: 0.85 unless the truss data already includes the repetitive-use factor. */
  function derate(truss, override) {
    if (typeof override === "number") return override;
    return truss.repetitive_use ? 1 : 0.85;
  }

  /**
   * truss: DB entry {max_span_ft, udl_lb[], cpl_lb[], repetitive_use}
   * beam: result of TLA.beam.solve; wallWeight: lb spread over the full length.
   * opts.derate: override the repetitive-use factor. opts.cantileverSelfWeight: also count the truss's own weight
   * against the cantilever limit. Rigging Math Made Simple (Lesson 21) says manufacturers' tables already subtract the
   * truss weight, so by default only the loads (and any wall/UDL weight) are compared; the original workbook also
   * counted self weight (stricter).
   */
  function checkTruss(truss, beam, wallWeight, opts) {
    opts = opts || {};
    var k = derate(truss, opts.derate);
    var maxSpan = Number(truss.max_span_ft) || 0;
    var maxCant = maxSpan / 4;
    var wallPerFt = (Number(wallWeight) || 0) / (beam.length || 1);
    var segs = [];

    function cant(side, seg) {
      var L = seg.length;
      if (L <= 1e-9) { segs.push({ type: side, length: 0, code: 0, status: "Good", skipped: true }); return; }
      var lenFail = L > maxCant + 1e-6;
      var cap = table(truss.cpl_lb, L * 4) * k;
      var load = seg.sumF + beam.wDist * L + (opts.cantileverSelfWeight ? beam.wSelf * L : 0);
      var loadFail = load > cap + 1e-9;
      var code = (lenFail ? 1 : 0) + (loadFail ? 2 : 0);
      segs.push({
        type: side, length: L, maxLength: maxCant, load: load, loadWithSelfWeight: seg.V, capacity: cap,
        lengthFail: lenFail, loadFail: loadFail, code: code, status: STATUS[code],
        utilization: cap > 0 ? load / cap : (load > 0 ? Infinity : 0)
      });
    }

    cant("cantilever-left", beam.left);
    beam.spans.forEach(function (s, i) {
      var L = s.L;
      if (L <= 1e-9) { segs.push({ type: "span", index: i + 1, length: 0, code: 0, status: "Good", skipped: true }); return; }
      var lenFail = L > maxSpan + 1e-9;
      var udlMax = table(truss.udl_lb, L) * k;
      var udlUsed = wallPerFt * L;
      var free = udlMax > 0 ? (udlMax - udlUsed) / udlMax : 0;
      var cap = table(truss.cpl_lb, L) * k * free;
      var loadFail = s.sumF > cap + 1e-9;
      var code = (lenFail ? 1 : 0) + (loadFail ? 2 : 0);
      segs.push({
        type: "span", index: i + 1, length: L, maxLength: maxSpan, load: s.sumF, capacity: cap,
        udlMax: udlMax, udlUsed: udlUsed, freeFraction: free,
        lengthFail: lenFail, loadFail: loadFail, code: code, status: STATUS[code],
        utilization: cap > 0 ? s.sumF / cap : (s.sumF > 0 ? Infinity : 0)
      });
    });
    cant("cantilever-right", beam.right);

    var worst = segs.reduce(function (m, s) { return Math.max(m, s.code || 0); }, 0);
    return { derate: k, maxSpan: maxSpan, maxCantilever: maxCant, segments: segs, worstCode: worst, ok: worst === 0 };
  }

  /** Hoist + chain weight added after beam analysis; status uses STATIC load (as the original). */
  function checkHoist(hoist, chainLengthFt, reaction, extraWeight, dlfOverride, defaultDlf) {
    var h = hoist || { weight_lb: 0, chain_weight_per_ft_lb: 0, speed_fpm: 0, capacity_lb: 999999 };
    var hoistChain = (Number(h.weight_lb) || 0) + (Number(h.chain_weight_per_ft_lb) || 0) * (Number(chainLengthFt) || 0);
    var stat = reaction + hoistChain + (Number(extraWeight) || 0);
    var speed = Number(h.speed_fpm) || 0, dflt = Number(defaultDlf) > 0 ? Number(defaultDlf) : 1.25;
    // factor: typed override, else the hoist's speed (fpm / 64 + 1, so 16 fpm = 1.25), else the default (none = 1.0)
    var dlf = Number(dlfOverride) > 0 ? Number(dlfOverride) : speed > 0 ? speed / 64 + 1 : (Number(h.capacity_lb) >= 999999 ? 1 : dflt);
    var dyn = stat * dlf;
    var cap = Number(h.capacity_lb) || 0;
    var status = stat < 0 ? "No Load" : stat > cap ? "Overloaded" : "Good";
    return {
      reaction: reaction, hoistChain: hoistChain, staticLoad: stat, dynamicLoad: dyn,
      dynamicFactor: dlf, capacity: cap, status: status,
      dynamicOver: dyn > cap && stat <= cap
    };
  }

  TLA.limits = { checkTruss: checkTruss, checkHoist: checkHoist, table: table, derate: derate, STATUS: STATUS };
})(typeof globalThis !== "undefined" ? globalThis : window);
