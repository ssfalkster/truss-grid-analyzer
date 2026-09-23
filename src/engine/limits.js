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

  var KG_LB = 2.20462262185, FT_M = 0.3048;

  /** A truss's allowable total UDL or centre point load (kind "udl" | "cpl", lb) on a span of len ft. 1.6.0: a truss
   * whose data is native metric (units "metric": udl_kg / cpl_kg per whole metre of span) is looked up in its own
   * table - the span rounded up to the next whole metre, as the original does in metric - and converted to lb. */
  function tableAt(truss, kind, len) {
    if (truss.units === "metric" && truss[kind + "_kg"]) return table(truss[kind + "_kg"], len * FT_M) * KG_LB;
    return table(truss[kind + "_lb"], len);
  }

  /** derate: 0.85 unless the truss data already includes the repetitive-use factor; a truss entry can carry its own
   * (EOT 2.4: the generic "Universal" trusses use 0.75). A rig-wide override wins over both. */
  function derate(truss, override) {
    if (typeof override === "number") return override;
    if (typeof truss.derate === "number") return truss.derate;
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
      var cap = tableAt(truss, "cpl", L * 4) * k;
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
      var udlMax = tableAt(truss, "udl", L) * k;
      var udlUsed = wallPerFt * L;
      var free = udlMax > 0 ? (udlMax - udlUsed) / udlMax : 0;
      var cap = tableAt(truss, "cpl", L) * k * free;
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

    var member = checkMember(truss, beam, k, opts);
    var worst = segs.reduce(function (m, s) { return Math.max(m, s.code || 0); }, member.code);
    return { derate: k, maxSpan: maxSpan, maxCantilever: maxCant, segments: segs, member: member, worstCode: worst, ok: worst === 0 };
  }

  /**
   * Allowable bending moment and shear for a truss, estimated from its manufacturer tables (lb-ft, lb; before derate).
   * Every table entry is a load the maker says the truss carries on that span, so it demonstrates a moment and a shear:
   *   centre point load P on span L: M = P L / 4, V = P / 2;   uniform load W (total) on span L: M = W L / 8, V = W / 2.
   * Moment: the largest demonstrated moment from each table, and the smaller of the two (a point load also bends the
   * chords locally, so the point-load table can be the lower one). Shear: the largest shear any entry demonstrates -
   * a lower bound on the real capacity, so it can only err on the safe side. Estimates - not published values.
   */
  function memberCapacity(truss) {
    var metric = truss.units === "metric" && truss.udl_kg, step = metric ? 1 / FT_M : 1, f = metric ? KG_LB : 1;
    var P = (metric ? truss.cpl_kg : truss.cpl_lb) || [], U = (metric ? truss.udl_kg : truss.udl_lb) || [];
    var mc = 0, mu = 0, v = 0, n = Math.min(metric ? Number(truss.max_span_m) || U.length : Number(truss.max_span_ft) || 100, 100);
    for (var i = 0; i < n; i++) {
      var L = (i + 1) * step, p = (Number(P[i]) || 0) * f, u = (Number(U[i]) || 0) * f;
      mc = Math.max(mc, p * L / 4); mu = Math.max(mu, u * L / 8); v = Math.max(v, p / 2, u / 2);
    }
    var m = mc && mu ? Math.min(mc, mu) : mc || mu;
    return { moment: m, shear: v, momentFromPoint: mc, momentFromUniform: mu };
  }

  /** Bending moment and shear along the truss (continuous-beam statics) against the table-derived capacity. Like the
   * table checks, the truss's own weight is left out (the tables already allow for it) unless opts.cantileverSelfWeight.
   * opts.memberDiagrams { full, net } supplies the diagrams instead (from the stiffness solve, 1.3.0). */
  function checkMember(truss, beam, k, opts) {
    var cap = memberCapacity(truss), given = opts.memberDiagrams, full = given ? given.full : TLA.beam.diagram(beam), net = given ? given.net : full;
    if (!given && !opts.cantileverSelfWeight && beam.wSelf > 0 && beam.positions.length) {
      var nb = TLA.beam.solve({
        length: beam.length, supports: beam.positions, trussWeightPerFt: 0, wallWeight: beam.wDist * beam.length,
        loads: beam.loads.map(function (l) { return { distance: l.distance, weight: l.weight }; })
      });
      net = TLA.beam.diagram(nb);
    }
    var mA = cap.moment * k, vA = cap.shear * k;
    var uM = mA > 0 ? net.maxMoment / mA : (net.maxMoment > 1e-6 ? Infinity : 0);
    var uV = vA > 0 ? net.maxShear / vA : (net.maxShear > 1e-6 ? Infinity : 0);
    var mOver = uM > 1 + 1e-9, vOver = uV > 1 + 1e-9, code = mOver || vOver ? 2 : 0;
    return {
      diagram: full, checked: net, momentAllowed: mA, shearAllowed: vA, capacity: cap,
      moment: net.maxMoment, shear: net.maxShear, momentUtil: uM, shearUtil: uV, utilization: Math.max(uM, uV),
      momentOver: mOver, shearOver: vOver, code: code,
      status: mOver && vOver ? "Moment and shear over" : mOver ? "Moment over" : vOver ? "Shear over" : "Good"
    };
  }

  /** Warning text for a failed moment/shear check. */
  function memberMessage(mb) {
    return mb.status + " - " + [mb.momentOver ? "bending moment " + Math.round(mb.moment) + " lb-ft is " + Math.round(mb.momentUtil * 100) + "% of about " + Math.round(mb.momentAllowed) + " lb-ft allowed" : "",
      mb.shearOver ? "shear " + Math.round(mb.shear) + " lb is " + Math.round(mb.shearUtil * 100) + "% of about " + Math.round(mb.shearAllowed) + " lb allowed" : ""].filter(Boolean).join("; ") +
      " (allowable estimated from the manufacturer's tables)";
  }

  /** Hoist + chain weight added after beam analysis; status uses STATIC load (as the original). addPct (EOT 2.4 "Add
   * Percentage"): an extra % on the load and truss weight at the point (unknown cable, a margin), before the hoist,
   * chain and hardware weight - it does not change the truss checks, as in the original. */
  function checkHoist(hoist, chainLengthFt, reaction, extraWeight, dlfOverride, defaultDlf, addPct) {
    var h = hoist || { weight_lb: 0, chain_weight_per_ft_lb: 0, speed_fpm: 0, capacity_lb: 999999 };
    var hoistChain = (Number(h.weight_lb) || 0) + (Number(h.chain_weight_per_ft_lb) || 0) * (Number(chainLengthFt) || 0);
    var added = Number(addPct) > 0 && reaction > 0 ? reaction * Number(addPct) / 100 : 0;
    var stat = reaction + added + hoistChain + (Number(extraWeight) || 0);
    var speed = Number(h.speed_fpm) || 0, dflt = Number(defaultDlf) > 0 ? Number(defaultDlf) : 1.25;
    // factor: typed override, else the hoist's speed (fpm / 60 + 1, so 16 fpm = 1.267 - EOT 2.4; was / 64), else the
    // default (none = 1.0)
    var dlf = Number(dlfOverride) > 0 ? Number(dlfOverride) : speed > 0 ? speed / 60 + 1 : (Number(h.capacity_lb) >= 999999 ? 1 : dflt);
    var dyn = stat * dlf;
    var cap = Number(h.capacity_lb) || 0;
    var status = stat < 0 ? "No Load" : stat > cap ? "Overloaded" : "Good";
    return {
      reaction: reaction, added: added, hoistChain: hoistChain, staticLoad: stat, dynamicLoad: dyn,
      dynamicFactor: dlf, capacity: cap, status: status,
      dynamicOver: dyn > cap && stat <= cap
    };
  }

  TLA.limits = { checkTruss: checkTruss, tableAt: tableAt, checkHoist: checkHoist, memberCapacity: memberCapacity, checkMember: checkMember, memberMessage: memberMessage, table: table, derate: derate, STATUS: STATUS };
})(typeof globalThis !== "undefined" ? globalThis : window);
