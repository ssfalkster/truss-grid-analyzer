/* 1.25.2: File > New rig, Open and Load example box are one Undo step (they used to clear the undo history while the
   autosave overwrote the old rig), and Open merges the file's custom database into this browser's instead of
   replacing it. */
(function (g) {
  var TLA = g.TLA, S = TLA.store, add = g.__addTLATest;
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function names() { return S.rig.trusses.filter(function (t) { return !t.isBlock; }).map(function (t) { return t.name; }).sort().join(","); }
  function clone(o, extra) { return Object.assign(JSON.parse(JSON.stringify(o)), extra); }
  function byId(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }

  add("file: New rig is one Undo step and keeps the undo history before it; Redo goes back to the empty rig", function () {
    S.newRig();
    S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 20] });
    S.addTruss({ name: "B", x: 0, y: 10, angle: 0, length: 20, hoists: [0, 20] });
    S.newRig();
    eq(S.rig.trusses.length, 0, "empty after New");
    S.undo(); eq(names(), "A,B", "Undo brings the rig back");
    S.undo(); eq(names(), "A", "and the steps before it");
    S.redo(); S.redo(); eq(S.rig.trusses.length, 0, "Redo: the new empty rig again");
  });

  add("file: Load example box is one Undo step back to the previous rig", function () {
    S.newRig();
    S.addTruss({ name: "Mine", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 20] });
    S.loadExample();
    eq(S.rig.name, "Example box (illustrative)", "example loaded");
    if (S.rig.trusses.length < 4) throw new Error("example has " + S.rig.trusses.length + " trusses");
    S.undo(); eq(names(), "Mine", "one Undo: the previous rig, not a half-built example");
    S.redo(); eq(S.rig.name, "Example box (illustrative)", "Redo: the example again");
  });

  add("file: Open is one Undo step back to the previous rig", function () {
    S.newRig();
    S.addTruss({ name: "InFile", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 20] });
    var file = S.exportJSON();
    S.newRig();
    S.addTruss({ name: "OnScreen", x: 0, y: 0, angle: 0, length: 30, hoists: [0, 30] });
    S.importJSON(file);
    eq(names(), "InFile", "file opened");
    S.undo(); eq(names(), "OnScreen", "Undo brings back the rig that was on screen");
  });

  add("file: Open merges the file's custom trusses, blocks, hoists and fixtures; clashing ids are renumbered and the rig follows", function () {
    var keep = S.userDb;
    try {
      var bt = byId(TLA.data.trusses, S.defaultTrussId()), bh = byId(TLA.data.hoists, S.defaultHoistId()), bc = TLA.data.corners[0];
      // another browser: its own custom entries, and a rig that uses them
      S.userDb = { trusses: [clone(bt, { id: 1001, source: "User", description: "File truss" })], hoists: [clone(bh, { id: 1001, description: "File hoist" })],
        corners: [clone(bc, { id: 2001, custom: true, name: "File block" })], fixtures: [{ manufacturer: "X", fixture: "File fixture", weight_lb: 10 }] };
      S.newRig();
      var t = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 20, hoists: [0, 20], trussId: 1001 });
      S.truss(t.id).supports.forEach(function (s) { if (s.kind === "hoist") s.hoistId = 1001; });
      var blk = S.addBlockToLine(t.id, 2001, { at: "end" });
      if (typeof blk === "string") throw new Error(blk);
      S.commit();
      var file = S.exportJSON();
      // this browser: different custom entries with the same ids
      S.userDb = { trusses: [clone(bt, { id: 1001, source: "User", description: "My truss" })], hoists: [clone(bh, { id: 1001, description: "My hoist" })],
        corners: [clone(bc, { id: 2001, custom: true, name: "My block" })], fixtures: [{ manufacturer: "X", fixture: "My fixture", weight_lb: 5 }] };
      S.newRig();
      var r = S.importJSON(file);
      eq(r.added, 4, "added"); eq(r.renumbered, 3, "renumbered");
      var U = S.userDb;
      eq(U.trusses.length, 2, "trusses kept + added"); eq(byId(U.trusses, 1001).description, "My truss", "own truss untouched");
      eq(byId(U.hoists, 1001).description, "My hoist", "own hoist untouched"); eq(byId(U.corners, 2001).name, "My block", "own block untouched");
      eq(U.fixtures.map(function (f) { return f.fixture; }).join(","), "My fixture,File fixture", "fixtures");
      var A = S.rig.trusses.filter(function (x) { return x.name === "A"; })[0], B = S.rig.trusses.filter(function (x) { return x.isBlock; })[0];
      eq(byId(S.db().trusses, A.trussId).description, "File truss", "the rig's truss points at the file's entry");
      A.supports.filter(function (s) { return s.kind === "hoist"; }).forEach(function (s) { eq(byId(S.db().hoists, s.hoistId).description, "File hoist", "hoist model"); });
      eq(byId(S.db().corners, B.blockTypeId).name, "File block", "corner block type");
      var tid = A.trussId;
      // opening the same file again adds nothing and finds the entries merged the first time
      var r2 = S.importJSON(file);
      eq(r2.added, 0, "added again"); eq(r2.same, 4, "already here");
      eq(U.trusses.length, 2, "no duplicate truss");
      eq(S.rig.trusses.filter(function (x) { return x.name === "A"; })[0].trussId, tid, "same entry as the first open");
      // a file without custom entries leaves the database alone
      S.newRig(); S.importJSON(JSON.stringify({ rig: JSON.parse(JSON.stringify(S.rig)) }));
      eq(S.userDb.trusses.length, 2, "kept");
    } finally { S.userDb = keep; S.newRig(); }
  });

  add("file: custom ids are one past the highest in use, so a deleted entry's id is not reused", function () {
    var keep = S.userDb;
    try {
      S.userDb = { trusses: [{ id: 1001 }, { id: 1003 }], hoists: [], fixtures: [] };
      eq(S.nextUserId("trusses"), 1004, "truss"); eq(S.nextUserId("hoists"), 1001, "first hoist"); eq(S.nextUserId("corners"), 2001, "first block");
    } finally { S.userDb = keep; }
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
