/* App version (MAJOR.MINOR.PATCH). MAJOR is set by the owner; MINOR (new features, or any change to calculated
 * results) and PATCH (fixes that don't change results, UI and text) are bumped with each change. Newest first.
 * Shown in the header and the About dialog, and written into saved rig files. The original program's license asks
 * every modified version's history to show who made the change, when, and what changed: [version, date, who, what]. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  TLA.VERSION = "1.0.0";
  TLA.CHANGES = [
    ["1.0.0", "2026-09-22", "G.E. Simmons Falk", "First numbered release of Truss Grid Analyzer, a web rebuild of Truss Load Analyzer - EOT: truss-grid load paths through corner blocks, plan and 3D views, manufacturer-table span/cantilever checks, hoist checks, the grillage stiffness check (hinged and rigid joints, stiffness estimated per truss connector type), and the license file (LICENSE.md)."]
  ];
})(typeof globalThis !== "undefined" ? globalThis : window);
