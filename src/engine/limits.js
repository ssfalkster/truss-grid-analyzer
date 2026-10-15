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
   * opts.derate: override the repetitive-use factor. opts.cantileverSelfWeight: also count the truss's self weight
   * against the cantilever limit (as the original workbook does) and in the moment/shear check. The app turns it on
   * unless the rig's settings turn it off (countSelfWeight, 1.18.0); left out here, only the loads (and any UDL) count.
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
   * wSelf (lb/ft, optional; 1.18.0): the tables are loads on top of the truss's self weight, so each entry also
   * demonstrates the self weight's moment and shear (Hall, Stress Table Creator): M = P L / 4 + w L^2 / 8 or
   * W L / 8 + w L^2 / 8, V = P / 2 + w L / 2 or W / 2 + w L / 2. Use it when the checked forces include self weight.
   */
  function memberCapacity(truss, wSelf) {
    var metric = truss.units === "metric" && truss.udl_kg, step = metric ? 1 / FT_M : 1, f = metric ? KG_LB : 1, w = Number(wSelf) > 0 ? Number(wSelf) : 0;
    var P = (metric ? truss.cpl_kg : truss.cpl_lb) || [], U = (metric ? truss.udl_kg : truss.udl_lb) || [];
    var mc = 0, mu = 0, v = 0, n = Math.min(metric ? Number(truss.max_span_m) || U.length : Number(truss.max_span_ft) || 100, 100);
    // the table row each figure comes from (row = span in the table's own unit), for the calculation sheet
    var at = { point: null, uniform: null, shear: null };
    function row(i, L, load, kind) { return { row: i + 1, unit: metric ? "m" : "ft", length: L, load: load, kind: kind }; }
    for (var i = 0; i < n; i++) {
      var L = (i + 1) * step, p = (Number(P[i]) || 0) * f, u = (Number(U[i]) || 0) * f, ms = w * L * L / 8, vs = w * L / 2;
      if (p > 0 && p * L / 4 + ms > mc) { mc = p * L / 4 + ms; at.point = row(i, L, p, "cpl"); }
      if (u > 0 && u * L / 8 + ms > mu) { mu = u * L / 8 + ms; at.uniform = row(i, L, u, "udl"); }
      if (p > 0 && p / 2 + vs > v) { v = p / 2 + vs; at.shear = row(i, L, p, "cpl"); }
      if (u > 0 && u / 2 + vs > v) { v = u / 2 + vs; at.shear = row(i, L, u, "udl"); }
    }
    var m = mc && mu ? Math.min(mc, mu) : mc || mu;
    return { moment: m, shear: v, momentFromPoint: mc, momentFromUniform: mu, at: at, wSelf: w };
  }

  /** Bending moment and shear along the truss (continuous-beam statics) against the table-derived capacity. With
   * opts.cantileverSelfWeight (the app's default since 1.18.0) the forces include the truss's self weight and so does
   * the capacity (memberCapacity with wSelf); without, both leave it out.
   * opts.memberDiagrams { full, net } supplies the diagrams instead (from the stiffness solve, 1.3.0). */
  function checkMember(truss, beam, k, opts) {
    var cap = memberCapacity(truss, opts.cantileverSelfWeight ? beam.wSelf : 0), given = opts.memberDiagrams, full = given ? given.full : TLA.beam.diagram(beam), net = given ? given.net : full;
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

  /* ---- dead hangs (1.22.0): a support that is just wire rope (and its shackles) from the truss to the hang point ----
   * Typical catalogue values - minimum breaking strength (lb) and weight (lb/ft). 7x19 galvanized aircraft cable per
   * MIL-DTL-83420; 6x19 IWRC, extra improved plow steel, bright (Wire Rope Users Manual). EA (lb) per d^2 (in^2) for a
   * rope spring, from the metallic area (about 0.44 d^2 for 7x19, 0.40 d^2 for 6x19 IWRC) and a rope modulus of about
   * 11e6 and 13.5e6 psi - estimates, used only when the rig's hoists are springs. Check your own rope's certificate. */
  var ROPES = [
    ["gac-1/8", "1/8\" 7x19 GAC", 0.125, 2000, 0.029], ["gac-5/32", "5/32\" 7x19 GAC", 0.15625, 2800, 0.045], ["gac-3/16", "3/16\" 7x19 GAC", 0.1875, 4200, 0.065],
    ["gac-7/32", "7/32\" 7x19 GAC", 0.21875, 5600, 0.086], ["gac-1/4", "1/4\" 7x19 GAC", 0.25, 7000, 0.11], ["gac-5/16", "5/16\" 7x19 GAC", 0.3125, 9800, 0.173],
    ["gac-3/8", "3/8\" 7x19 GAC", 0.375, 14400, 0.243],
    ["iwrc-1/4", "1/4\" 6x19 IWRC EIPS", 0.25, 6800, 0.12], ["iwrc-5/16", "5/16\" 6x19 IWRC EIPS", 0.3125, 10540, 0.18], ["iwrc-3/8", "3/8\" 6x19 IWRC EIPS", 0.375, 15100, 0.26],
    ["iwrc-7/16", "7/16\" 6x19 IWRC EIPS", 0.4375, 20400, 0.35], ["iwrc-1/2", "1/2\" 6x19 IWRC EIPS", 0.5, 26600, 0.46]
  ].map(function (r) { return { id: r[0], name: r[1], d_in: r[2], mbs_lb: r[3], weight_per_ft_lb: r[4], ea_per_d2: /^gac/.test(r[0]) ? 11e6 * 0.44 : 13.5e6 * 0.40 }; });
  var ROPE_DF = 10;      // owner, 2026-09-24: 10:1 unless Rig settings say otherwise
  function rope(id) { return ROPES.filter(function (r) { return r.id === id; })[0] || null; }
  function ropeFactor(settings) { return settings && Number(settings.ropeDesignFactor) > 0 ? Number(settings.ropeDesignFactor) : ROPE_DF; }
  /** A dead hang's working load limit: the rope's breaking strength / design factor, capped by a typed assembly WLL
   * (the weakest shackle or fitting). No rope and no WLL: 0 (always Overloaded - it must be entered). */
  function deadHangWll(s, settings) {
    var r = rope(s.rope), a = r ? r.mbs_lb / ropeFactor(settings) : Infinity, b = Number(s.wll) > 0 ? Number(s.wll) : Infinity, w = Math.min(a, b);
    return isFinite(w) ? w : 0;
  }
  /** The hoist-like entry a support is checked with: its hoist from the database, or (dead hang) the rope as the
   * "chain" (its weight per ft x the rope length), no hoist body, capacity = the dead hang's WLL. */
  function supportEntry(s, db, settings) {
    if (s && s.dead) { var r = rope(s.rope); return { dead: true, rope: r, weight_lb: 0, chain_weight_per_ft_lb: r ? r.weight_per_ft_lb : 0, speed_fpm: 0, capacity_lb: deadHangWll(s, settings) }; }
    var list = (db && db.hoists) || [];
    return list.filter(function (h) { return h.id === (s && s.hoistId); })[0] || list[0] || null;
  }
  /** Check one hoist or dead hang support (low hook reaction in, high hook loads out). A dead hang is static: factor
   * 1.0 unless one is typed (owner, 2026-09-24). */
  function checkSupport(s, db, reaction, settings) {
    settings = settings || {};
    var e = supportEntry(s, db, settings), dead = !!(s && s.dead);
    var c = checkHoist(e, dead ? s.ropeLength : s.chainLength, reaction, s.hardwareWeight, dead ? (Number(s.dlf) > 0 ? Number(s.dlf) : 1) : s.dlf, settings.defaultDlf, settings.addPercent);
    if (dead) c.dead = true;
    return c;
  }
  /** Weight hanging with a support (hoist + chain, or rope), lb - without its hardware. */
  function supportWeight(s, db, settings) {
    var e = supportEntry(s, db, settings);
    return e ? (Number(e.weight_lb) || 0) + (Number(e.chain_weight_per_ft_lb) || 0) * (Number(s.dead ? s.ropeLength : s.chainLength) || 0) : 0;
  }
  /** A dead hang's rope as a spring, lb/ft (EA / L), or 0 when unknown. */
  function ropeStiffness(s) {
    var r = s && s.dead ? rope(s.rope) : null, L = Number(s && s.ropeLength) || 0;
    return r && L > 0 ? r.ea_per_d2 * r.d_in * r.d_in / L : 0;
  }

  /** Status as shown to the user. The status values stay the workbook's words (Good, OVERLOADED...), which the code
   * compares against; what people read is OK / Overloaded / Too long / Slack / Unstable, for trusses and hoists alike. */
  function statusText(status) {
    return String(status).replace(/^Good\b/, "OK").replace(/^FAILURE\b/, "Too long and overloaded").replace(/^OVERLOADED\b/, "Overloaded")
      .replace(/^TOO LONG!/, "Too long").replace(/^UNSTABLE\b/, "Unstable").replace(/^Over$/, "Overloaded");
  }

  var DEFL_DEFAULT = 160;
  /** Deflection limit for a truss entry as span / ratio (1.18.0): the maker's published limit where there is one
   * (data/deflection.js), else the rig's default (settings.deflectionLimit, L/160). */
  function deflectionLimit(truss, settings) {
    var rules = (TLA.data && TLA.data.deflection) || [];
    var r = truss && rules.filter(function (x) { return x.manufacturer === truss.manufacturer && (!x.source || x.source === truss.source) && (!x.sheet || String(truss.source_ref || "").indexOf(x.sheet) >= 0); })[0];
    if (r) return { ratio: r.ratio, source: "maker", note: r.note };
    var d = settings && Number(settings.deflectionLimit) > 0 ? Number(settings.deflectionLimit) : DEFL_DEFAULT;
    return { ratio: d, source: "default", note: "no limit published by the maker - rig default L/" + d };
  }
  /** Rig setting: count the truss's self weight in the cantilever and moment/shear checks - on unless turned off
   * (1.18.0; saved rigs keep an explicit choice). */
  function countSelfWeight(settings) { return !settings || settings.cantileverSelfWeight !== false; }

  TLA.limits = { ROPES: ROPES, ROPE_DF: ROPE_DF, rope: rope, ropeFactor: ropeFactor, deadHangWll: deadHangWll, supportEntry: supportEntry, checkSupport: checkSupport, supportWeight: supportWeight, ropeStiffness: ropeStiffness, countSelfWeight: countSelfWeight, checkTruss: checkTruss, deflectionLimit: deflectionLimit, DEFL_DEFAULT: DEFL_DEFAULT, tableAt: tableAt, checkHoist: checkHoist, memberCapacity: memberCapacity, checkMember: checkMember, memberMessage: memberMessage, table: table, derate: derate, STATUS: STATUS, statusText: statusText };
})(typeof globalThis !== "undefined" ? globalThis : window);
