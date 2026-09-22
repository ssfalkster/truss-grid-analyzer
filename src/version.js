/* App version (MAJOR.MINOR.PATCH). MAJOR is set by the owner; MINOR (new features, or any change to calculated
 * results) and PATCH (fixes that don't change results, UI and text) are bumped with each change. Newest first.
 * Shown in the header and the About dialog, and written into saved rig files. The original program's license asks
 * every modified version's history to show who made the change, when, and what changed: [version, date, who, what]. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  TLA.VERSION = "1.2.0";
  TLA.CHANGES = [
    ["1.2.0", "2026-09-22", "G.E. Simmons Falk", "Shear and bending-moment diagrams for every truss, and a moment/shear check against an allowable moment and shear estimated from the manufacturer's tables. It catches what the span-by-span table check can't: bending over the supports of a continuous truss, and heavy loads right next to a support. Can flag trusses the table check passed. The 'count truss weight' option now also applies to this check."],
    ["1.1.0", "2026-09-22", "G.E. Simmons Falk", "Chain hoists can only pull: a hoist the load would push up is now shown as Slack, taken out, and the truss solved again (both the load-path and the stiffness check); a truss or rig that would tip is flagged UNSTABLE instead of showing loads. Changes results where a hoist used to show a negative load. Stiffness check fixes: hardware weight at bolted connections and loads hung on corner blocks were missing; it now checks its own balance and total against the load path, names any truss that isn't held up, and no longer lets a truss on a single hoist pass. Test added for the Rigging Math Made Simple 3D grid example."],
    ["1.0.0", "2026-09-22", "G.E. Simmons Falk", "First numbered release of Truss Grid Analyzer, a web rebuild of Truss Load Analyzer - EOT: truss-grid load paths through corner blocks, plan and 3D views, manufacturer-table span/cantilever checks, hoist checks, the grillage stiffness check (hinged and rigid joints, stiffness estimated per truss connector type), and the license file (LICENSE.md)."]
  ];
})(typeof globalThis !== "undefined" ? globalThis : window);
