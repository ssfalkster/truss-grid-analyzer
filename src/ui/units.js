/* Display units (1.7.0): imperial or metric, per rig (rig.settings.units). The engine and the saved rig always work
 * in feet and pounds; this layer only converts what is shown and what is typed, so switching never changes a result
 * or a selection (truss, hoist, fixture). A truss whose data is native metric is still stored and checked in its
 * own units (see TLA.limits.tableAt) whichever mode is shown. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var FT_M = 0.3048, LB_KG = 0.45359237, IN_MM = 25.4, LBF_N = 4.4482216152605;

  // kind: [imperial -> metric factor, imperial unit, metric unit, extra decimals in metric]
  var Q = {
    len: [FT_M, "ft", "m", 1],
    w: [LB_KG, "lb", "kg", 0],
    wpl: [LB_KG / FT_M, "lb/ft", "kg/m", 0],
    mom: [LB_KG * FT_M, "lb-ft", "kg·m", 0],
    inch: [IN_MM, "in", "mm", -1],
    speed: [FT_M, "fpm", "m/min", 1],
    stiff: [LB_KG / IN_MM, "lb/in", "kg/mm", 2],
    ei: [LBF_N * IN_MM * IN_MM * 1e-6, "lb-in²", "N·m²", 0]
  };

  function metric() { var s = TLA.store && TLA.store.rig && TLA.store.rig.settings; return !!(s && s.units === "metric"); }
  /** Imperial value -> the number shown. */
  function v(kind, x) { return metric() ? Number(x) * Q[kind][0] : Number(x); }
  /** A number typed in the shown units -> imperial. */
  function back(kind, x) { return metric() ? Number(x) / Q[kind][0] : Number(x); }
  function unit(kind) { return Q[kind][metric() ? 2 : 1]; }
  function num(x, d) {
    if (x == null || !isFinite(x)) return "-";
    d = Math.max(0, d == null ? 1 : d);
    return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString(undefined, { maximumFractionDigits: d });
  }
  /** Decimals for a kind: d is what the imperial display uses; metric lengths get one more (0.1 ft ~ 0.03 m). */
  function dec(kind, d) { return metric() ? Math.max(0, (d == null ? 1 : d) + Q[kind][3]) : d; }
  /** Formatted number in the shown units, without the unit. */
  function n(kind, x, d) { return num(v(kind, x), dec(kind, d)); }
  /** Formatted number with its unit ("12.5 ft" / "3.81 m"). */
  function f(kind, x, d) { return n(kind, x, d) + " " + unit(kind); }
  /** Short length mark for drawings: 12.5' or 3.81 m. */
  function mark(x, d) { return metric() ? num(x * FT_M, dec("len", d)) + " m" : num(x, d) + "'"; }

  /** Text written by the engine (warnings, status notes) is in lb and ft: convert every "number unit" in it. */
  var RX = /(-?\d[\d,]*(?:\.\d+)?)(\s*)(lb-in²|lb-ft|lb\/ft|lb\/in|lb|ft|fpm)\b/g;
  var BY = { "lb-in²": "ei", "lb-ft": "mom", "lb/ft": "wpl", "lb/in": "stiff", lb: "w", ft: "len", fpm: "speed" };
  function text(s) {
    if (!metric() || s == null) return s;
    return String(s).replace(RX, function (all, x, sp, u) {
      var k = BY[u], val = parseFloat(x.replace(/,/g, "")), frac = (x.split(".")[1] || "").length;
      if (!isFinite(val)) return all;
      if (k === "ei") return (val * Q.ei[0]).toExponential(2) + " " + Q.ei[2];
      return num(val * Q[k][0], Math.max(frac + Q[k][3], k === "len" ? 2 : 0)) + " " + Q[k][2];
    }).replace(/1\/4"/g, '1/4" (6 mm)');
  }

  /** Length typed by the user -> feet. Imperial: decimal feet or feet-inches (TLA.panels.parseLen). Metric: metres,
   * or with cm / mm; feet-inches (4'2") still work in either mode. */
  function parseLength(str, parseFtIn) {
    var s = String(str == null ? "" : str).trim();
    if (!metric() || /['"’′”″]|ft|in\b/i.test(s)) return parseFtIn(s);
    var m = s.replace(",", ".").match(/^(-?\d*\.?\d+)\s*(mm|cm|m)?$/i);
    if (!m) return NaN;
    var x = parseFloat(m[1]), u = (m[2] || "m").toLowerCase();
    return (u === "mm" ? x / 1000 : u === "cm" ? x / 100 : x) / FT_M;
  }

  TLA.units = { metric: metric, v: v, back: back, unit: unit, n: n, f: f, mark: mark, text: text, dec: dec, num: num, parseLength: parseLength, Q: Q, FT_M: FT_M, LB_KG: LB_KG };
})(typeof globalThis !== "undefined" ? globalThis : window);
