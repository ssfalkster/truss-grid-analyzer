/* Deflection limits published by the makers (1.18.0), as span / N. A rule applies to truss entries of that maker
 * (and source, and data sheet when given). Trusses with no rule use the rig's default (Rig settings, L/160).
 * Read from the makers' data sheets 2026-09-24:
 *  - Tomcat (all 7 data sheets): "The allowable loading has been reduced to limit deflection to L/100, where L equals
 *    the simple span length."
 *  - JTE: "load limited to a maximum deflection of (span/160)" on the Galaxy 240, Galaxy 300, General Purpose 12
 *    Triangle, 20.5 Triangle and 15x15 sheets (the other JTE sheets list deflections but state no limit). */
(function (g) {
  g.TLA = g.TLA || {}; g.TLA.data = g.TLA.data || {};
  g.TLA.data.deflection = [
    { manufacturer: "Tomcat", source: "MFG", ratio: 100, note: "Tomcat data sheet: allowable loading reduced to limit deflection to L/100" },
    { manufacturer: "JTE", source: "MFG", sheet: "Galaxy-240", ratio: 160, note: "JTE data sheet: loads limited to span/160" },
    { manufacturer: "JTE", source: "MFG", sheet: "Galaxy-300", ratio: 160, note: "JTE data sheet: loads limited to span/160" },
    { manufacturer: "JTE", source: "MFG", sheet: "General-Purpose-12-Triangle", ratio: 160, note: "JTE data sheet: loads limited to span/160" },
    { manufacturer: "JTE", source: "MFG", sheet: "General-Purpose-20-5-Triangle", ratio: 160, note: "JTE data sheet: loads limited to span/160" },
    { manufacturer: "JTE", source: "MFG", sheet: "General-Purpose-Truss-15-x-15", ratio: 160, note: "JTE data sheet: loads limited to span/160" }
  ];
})(typeof globalThis !== "undefined" ? globalThis : window);
