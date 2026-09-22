/* App version (MAJOR.MINOR.PATCH). MAJOR is set by the owner; MINOR (new features, or any change to calculated
 * results) and PATCH (fixes that don't change results, UI and text) are bumped with each change. Newest first.
 * Shown in the header and the About dialog, and written into saved rig files. The original program's license asks
 * every modified version's history to show who made the change, when, and what changed: [version, date, who, what]. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  TLA.VERSION = "1.3.0";
  TLA.CHANGES = [
    ["1.3.0", "2026-09-22", "G.E. Simmons Falk", "The stiffness (grillage) solve of the whole rig is now the primary result instead of a check: hoist loads, the forces in bolted connections, and so the loads every span and cantilever check sees, come from it. Hinged and rigid joints are shown side by side and every check uses the worse of the two; the load-path numbers of the original workbook are kept as a reference column. Changes results on grids where a carrying truss sags (single trusses on hoists are unchanged). Also: shear, moment and torque along every truss from the stiffness solve, a hoist's load breakdown from the same solve, a self-check that the connection forces balance, and a clear fallback to the load-path method when the stiffness solve can't run."],
    ["1.1.0", "2026-09-22", "G.E. Simmons Falk", "Chain hoists can only pull: a hoist the load would push up is now shown as Slack, taken out, and the truss solved again (both the load-path and the stiffness check); a truss or rig that would tip is flagged UNSTABLE instead of showing loads. Changes results where a hoist used to show a negative load. Stiffness check fixes: hardware weight at bolted connections and loads hung on corner blocks were missing; it now checks its own balance and total against the load path, names any truss that isn't held up, and no longer lets a truss on a single hoist pass. Test added for the Rigging Math Made Simple 3D grid example."],
    ["1.0.0", "2026-09-22", "G.E. Simmons Falk", "First numbered release of Truss Grid Analyzer, a web rebuild of Truss Load Analyzer - EOT: truss-grid load paths through corner blocks, plan and 3D views, manufacturer-table span/cantilever checks, hoist checks, the grillage stiffness check (hinged and rigid joints, stiffness estimated per truss connector type), and the license file (LICENSE.md)."]
  ];
})(typeof globalThis !== "undefined" ? globalThis : window);
