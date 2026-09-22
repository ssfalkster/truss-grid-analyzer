(function (g) {
  var TLA = g.TLA, add = g.__addTLATest;
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }

  add("version: MAJOR.MINOR.PATCH, and the newest history entry is this version", function () {
    eq(/^\d+\.\d+\.\d+$/.test(TLA.VERSION), true, "semantic version " + TLA.VERSION);
    eq(TLA.CHANGES[0][0], TLA.VERSION, "top of TLA.CHANGES");
  });

  add("version: saved rig files record the app version", function () {
    eq(JSON.parse(TLA.store.exportJSON()).appVersion, TLA.VERSION, "appVersion");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
