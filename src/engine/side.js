/* Circular Truss and Simple UDL calculators (parity with the original workbook's side sheets). */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});

  /**
   * Circular truss with n evenly spaced pick points.
   * opts.matchOriginal: reproduce the workbook exactly (UDL column ceil(span/5), no repetitive-use derate).
   * Default: UDL looked up at ceil(span) and the repetitive-use derate applied.
   */
  function circular(truss, n, diameter, opts) {
    opts = opts || {};
    var orig = !!opts.matchOriginal;
    var out = { n: n, diameter: diameter, messages: [] };
    if (!(n >= 1) || !(diameter > 0)) { out.error = "Enter pick points and a diameter"; return out; }
    var theta = 360 / n, R = diameter / 2;
    var half = theta / 2 * Math.PI / 180;
    var span = 2 * R * Math.sin(half);
    var sag = R - R * Math.cos(half);
    var ratio = span > 0 ? sag / span * 100 : Infinity;
    out.angle = theta; out.span = span; out.sagitta = sag; out.cantileverRatio = ratio; out.perimeter = span * n;
    out.maxSpan = truss.max_span_ft;
    out.spanTooLong = span > truss.max_span_ft;
    var idx = orig ? Math.ceil(span / 5) : Math.ceil(span - 1e-9);
    var udl = idx >= 1 && idx <= 100 ? Number(truss.udl_lb[idx - 1]) || 0 : 0;
    var k = orig ? 1 : TLA.limits.derate(truss);
    var base = udl * k / 2;
    out.baseLoad = base; out.derate = k;
    var u = ratio > 14.9999 && ratio < 30.001 ? base * 0.2 : 0;
    var v = ratio > 7.499 && ratio < 15.001 ? base * 0.35 : 0;
    var w = ratio > 0.999 && ratio < 7.501 ? base * 0.7 : 0;
    var x = ratio < 7.501 ? base : 0;
    out.bands = { pct20: u, pct35: v, pct70: w, full: x };
    if (n < 3 || u + v + w === 0) { out.tooFew = true; out.maxLoad = null; out.messages.push("Too few pick points"); }
    else out.maxLoad = Math.max(u, v, w, x);
    if (out.spanTooLong) out.messages.push("Exceeds max allowable span length");
    return out;
  }

  var HALF = {
    2: [0.5],
    3: [0.1875, 0.625],
    4: [0.133, 0.367],
    5: [0.098, 0.286, 0.232],
    6: [0.079, 0.226, 0.195],
    7: [0.066, 0.189, 0.16, 0.17],
    8: [0.056, 0.162, 0.138, 0.144],
    9: [0.0493, 0.1418, 0.1205, 0.1263, 0.1244],
    10: [0.04385, 0.1259, 0.107, 0.112, 0.1108]
  };

  /** Published-table coefficients (fractions of total load per point) as used by the workbook. */
  function simpleTable(points) {
    var h = HALF[points];
    if (!h) return null;
    var out = h.slice();
    var mirrorFrom = points % 2 === 0 ? h.length - 1 : h.length - 2;
    for (var i = mirrorFrom; i >= 0; i--) out.push(h[i]);
    return out;
  }

  /** Exact coefficients for equal spans, uniform load, no cantilevers - computed by the beam engine. */
  function simpleExact(points) {
    var b = TLA.beam.solve({ length: points - 1, supports: Array.from({ length: points }, function (_, i) { return i; }), loads: [], trussWeightPerFt: 1 });
    return b.reactions.map(function (r) { return r / b.totalLoad; });
  }

  TLA.side = { circular: circular, simpleTable: simpleTable, simpleExact: simpleExact };
})(typeof globalThis !== "undefined" ? globalThis : window);
