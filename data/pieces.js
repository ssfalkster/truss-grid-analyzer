/* Standard truss stick lengths (feet) used by the "build from pieces" controls.
 * Christie Lites lengths are the ones listed on their trussing pages (christielites.com, 2026-09-18):
 *   A Type 12": 8' 6' 4' 3' 2' 1'    B Type 16": 8' 6' 4' 34" 2' 14"    C Type 20": 8' 4' 2'
 *   G Type 24": 8' 4' 1'             H Type 24x36: 8' 4'
 * James Thomas Engineering (JTE): 10' and 5' sections, as confirmed by the user; JTE does not list its other stick
 * lengths on its public pages (they are in a login-only PDF), so add any others as custom lengths in the app.
 * Every other truss uses the generic list below. */
(function (g) {
  g.TLA = g.TLA || {}; g.TLA.data = g.TLA.data || {};
  g.TLA.data.pieces = {
    christie: {
      A: [8, 6, 4, 3, 2, 1],
      B: [8, 6, 4, 2.8333, 2, 1.1667],
      C: [8, 4, 2],
      G: [8, 4, 1],
      H: [8, 4]
    },
    jte: [10, 5],
    generic: [10, 8, 6, 5, 4, 3, 2.5, 2, 1.5, 1]
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
