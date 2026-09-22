/* App version (MAJOR.MINOR.PATCH). MAJOR is set by the owner; MINOR (new features, or any change to calculated
 * results) and PATCH (fixes that don't change results, UI and text) are bumped with each change. Newest first.
 * Shown in the header and the About dialog (the original's license asks for a history of what was changed),
 * and written into saved rig files. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  TLA.VERSION = "1.0.0";
  TLA.CHANGES = [
    ["1.0.0", "2026-09-22", "First numbered release: truss-grid load paths through corner blocks, plan and 3D views, manufacturer-table span/cantilever checks, hoist checks, and the grillage stiffness check (hinged and rigid joints, stiffness estimated per truss connector type)."]
  ];
})(typeof globalThis !== "undefined" ? globalThis : window);
