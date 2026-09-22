(function (g) {
  var TLA = g.TLA, add = g.__addTLATest;
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }

  add("version: MAJOR.MINOR.PATCH, and the newest history entry is this version", function () {
    eq(/^\d+\.\d+\.\d+$/.test(TLA.VERSION), true, "semantic version " + TLA.VERSION);
    eq(TLA.CHANGES[0][0], TLA.VERSION, "top of TLA.CHANGES");
  });

  add("version: every history entry names who made the change, when, and what (the original's license terms)", function () {
    TLA.CHANGES.forEach(function (c) {
      eq(c.length, 4, c[0] + " has [version, date, who, what]");
      eq(/^\d{4}-\d{2}-\d{2}$/.test(c[1]), true, c[0] + " date");
      eq(!!(c[2] && c[3]), true, c[0] + " who and what");
    });
  });

  add("version: saved rig files record the app version", function () {
    eq(JSON.parse(TLA.store.exportJSON()).appVersion, TLA.VERSION, "appVersion");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
