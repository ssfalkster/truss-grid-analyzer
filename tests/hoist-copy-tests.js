/* 1.23.0: hoists can be mirrored about the centerline and copied to another truss, like loads (but as real hoists). */
(function (g) {
  var TLA = g.TLA, S = TLA.store, add = g.__addTLATest;
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function hoists(t) { return t.supports.filter(function (s) { return s.kind === "hoist"; }).map(function (s) { return s.distance; }).sort(function (a, b) { return a - b; }); }

  add("hoists: Mirror adds real hoists at L - d with the same set-up; no doubles, none on the centerline", function () {
    S.newRig();
    var t = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 30, hoists: [3, 15] });
    var s = t.supports.filter(function (q) { return q.kind === "hoist" && q.distance === 3; })[0];
    s.name = "SL1"; s.chainLength = 40; s.hardwareWeight = 12; s.dlf = 1.4; s.level = 0.25; s.measured = 900; s.from = "center"; s.pos = -12;
    S.commit();
    var r = S.mirrorHoists(t.id);
    eq(r.added.length, 1, "added (15 ft is on the centerline)"); eq(r.skipped, 1, "skipped");
    var c = r.added[0];
    near(c.distance, 27, 1e-9, "mirrored spot"); eq(c.from, "center", "keeps its measuring reference"); near(c.pos, 12, 1e-9, "shown +12 from CL");
    eq(c.hoistId, s.hoistId, "model"); eq(c.chainLength, 40, "chain"); eq(c.hardwareWeight, 12, "hardware"); eq(c.dlf, 1.4, "DLF"); eq(c.level, 0.25, "level offset");
    eq(c.name, "", "no name copied"); eq(c.measured, undefined, "no load-cell reading copied"); if (c.id === s.id) throw new Error("same id");
    eq(S.mirrorHoists(t.id).added.length, 0, "pressing Mirror all again adds nothing");
    eq(hoists(t).join(","), "3,15,27", "hoists");
    eq(S.results.hoists.filter(function (x) { return x.trussName === "A"; }).length, 3, "the new hoist is solved");
  });

  add("hoists: Copy to truss keeps the distance from the centre, clamps past the end, skips occupied spots and drops a hang on the target", function () {
    S.newRig();
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 30, hoists: [1, 15, 29] });
    var b = S.addTruss({ name: "B", x: 0, y: 10, angle: 0, length: 20, hoists: [10] });
    var dead = a.supports.filter(function (q) { return q.kind === "hoist" && q.distance === 29; })[0];
    dead.dead = true; dead.rope = "gac-3/8"; dead.ropeLength = 12; dead.hangFrom = b.id;
    S.commit();
    var r = S.copyHoists(a.id, [], b.id);
    eq(r.copied, 2, "copied"); eq(r.clamped, 2, "clamped to the ends"); eq(r.skipped, 1, "B already has a hoist at its centre");
    eq(hoists(b).join(","), "0,10,20", "B hoists");
    var c = b.supports.filter(function (q) { return q.kind === "hoist" && q.distance === 20; })[0];
    eq(c.dead, true, "dead hang copied"); eq(c.rope, "gac-3/8", "rope"); eq(c.ropeLength, 12, "rope length");
    eq(c.hangFrom, undefined, "can't hang from the truss it holds up"); eq(c.from, "center", "measured from CL"); near(c.pos, 10, 1e-9, "pos");
    eq(dead.hangFrom, b.id, "original untouched");
    var one = S.copyHoists(a.id, [a.supports.filter(function (q) { return q.distance === 1; })[0].id], b.id);
    eq(one.copied, 0, "single hoist: its spot on B is taken"); eq(one.skipped, 1, "skipped");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
