/* Store-level tests: whole-line length, corner blocks as truss components (shared blocks add no length to a truss that
 * only butts against them), 90-degree bolting, closing loops, pieces, measuring references. */
(function (g) {
  var TLA = g.TLA, S = TLA.store, add = g.__addTLATest, G = TLA.rig.geometry;
  function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= (tol || 1e-6))) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function fresh() { S.newRig(); return S; }
  function a90() { return TLA.data.corners.filter(function (c) { return c.code === "TRUAA-90"; })[0]; }
  var SIZE = 1.0625;

  add("store: a block adds length to the line it sits in (host, or a truss that passes through it)", function () {
    fresh();
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 20, hoists: [] });
    var b = S.addTruss({ name: "B", x: 10, y: 5, angle: -90, length: 10, hoists: [] });
    eq(S.addBlockConnection(b.id, a.id, a90().id), null, "connect (B crosses A, so B passes through the block)");
    near(S.truss(a.id).length, 20 + SIZE, 1e-9, "carrying line includes its block");
    near(S.truss(b.id).length, 10 + SIZE, 1e-9, "a truss passing through the block includes it too");
    S.truss(b.id).addBlocks = false; S.commit();
    near(S.truss(b.id).length, 10, 1e-9, "block lengths can be switched off on a bolted truss");
  });

  add("store: a truss bolted to a block is turned to 90 degrees and follows the block", function () {
    fresh();
    var h = S.addTruss({ name: "Host", x: 0, y: 0, angle: 0, length: 20, hoists: [] });
    var blk = S.addBlockToLine(h.id, a90().id, { at: "end" });
    eq(typeof blk, "object", "block added");
    var x = S.addTruss({ name: "X", x: 50, y: 50, angle: 37, length: 10, hoists: [] });
    eq(S.boltToBlock(x.id, blk.id, "auto"), null, "bolt");
    var H = S.truss(h.id), X = S.truss(x.id), B = S.truss(blk.id);
    near(((X.angle - H.angle) % 180 + 180) % 180, 90, 1e-6, "square to the host");
    near(X.length, 10, 1e-9, "X is just its pieces: the shared block adds nothing");
    var centre = G.endPoint(B, B.length / 2);
    var start = G.endPoint(X, 0), end = G.endPoint(X, X.length);
    var dmin = Math.min(Math.hypot(start.x - centre.x, start.y - centre.y), Math.hypot(end.x - centre.x, end.y - centre.y));
    near(dmin, SIZE / 2, 2e-3, "an end of X stops at the block face, half a block from the block centre");
    near(centre.x, H.length - SIZE / 2, 2e-3, "block is at the end of the host line");
    var before = { x: X.x, y: X.y };
    H.x = 7; H.y = 3; S.commit();
    near(S.truss(x.id).x, before.x + 7, 1e-3, "X moves with the host in x"); near(S.truss(x.id).y, before.y + 3, 1e-3, "and in y");
    H.angle = 90; S.commit();
    near(((S.truss(x.id).angle - 90) % 180 + 180) % 180, 90, 1e-6, "turning the host turns X with it");
  });

  add("store: bolting at anything but 90 degrees is refused when the carrying truss is locked in place", function () {
    fresh();
    var h1 = S.addTruss({ name: "H1", x: 0, y: 0, angle: 0, length: 20, hoists: [] });
    var h2 = S.addTruss({ name: "H2", x: 0, y: 30, angle: 45, length: 20, hoists: [] });
    var b1 = S.addBlockToLine(h1.id, a90().id, { at: "end" }), b1b = S.addBlockToLine(h1.id, a90().id, { at: "start" }), b2 = S.addBlockToLine(h2.id, a90().id, { at: "end" });
    eq(S.boltToBlock(h2.id, b1b.id, "auto", "north"), null, "H2 is bolted to H1 and squared up: now locked in place");
    var x = S.addTruss({ name: "X", x: 30, y: 10, angle: 10, length: 10, hoists: [] });
    eq(S.boltToBlock(x.id, b1.id, "auto"), null, "first bolt squares X up");
    var err = S.boltToBlock(x.id, b2.id, "auto");
    eq(/90 degrees/.test(err || ""), true, "second bolt onto a locked truss that is not square to X is refused: " + err);
  });

  add("store: corner blocks can land between any two pieces: CB + 3 + CB + 8 + 6 + 8 + CB + 3 + CB", function () {
    fresh();
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 28, hoists: [] });
    S.addBlockToLine(a.id, a90().id, { at: "start" });
    var A = S.truss(a.id);
    while (A.layout.pieces[1].length) S.removeSegPiece(A, 1, 0);
    [3, 8, 6, 8, 3].forEach(function (v) { S.addSegPiece(A, 1, v); });
    S.addBlockToLine(a.id, a90().id, { seg: 1, piece: 1 });
    S.addBlockToLine(a.id, a90().id, { seg: 2, piece: 3 });
    S.addBlockToLine(a.id, a90().id, { at: "end" });
    A = S.truss(a.id);
    eq(JSON.stringify(A.layout.pieces), JSON.stringify([[], [3], [8, 6, 8], [3], []]), "pieces between the blocks");
    eq(A.layout.order.length, 4, "four blocks");
    near(A.length, 28 + 4 * SIZE, 1e-9, "one span");
    var c = A.layout.centers;
    near(c[0], SIZE / 2, 1e-9, "CB at the start");
    near(c[1], SIZE + 3 + SIZE / 2, 1e-9, "CB after 3");
    near(c[2], SIZE + 3 + SIZE + 22 + SIZE / 2, 1e-9, "CB after 8 + 6 + 8");
    near(c[3], SIZE + 3 + SIZE + 22 + SIZE + 3 + SIZE / 2, 1e-9, "CB at the end");
    S.addBlockToLine(a.id, a90().id, { seg: 2, piece: 1 });
    A = S.truss(a.id);
    eq(JSON.stringify(A.layout.pieces[2]), JSON.stringify([8]), "8 before the new block");
    eq(JSON.stringify(A.layout.pieces[3]), JSON.stringify([6, 8]), "6 + 8 after it");
    near(A.length, 28 + 5 * SIZE, 1e-9, "five blocks");
  });

  add("store: a corner block can be forced between the pieces of a plain stick, or at a measured spot", function () {
    fresh();
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 22, hoists: [] });
    S.startLinePieces(S.truss(a.id)); [8, 8, 6].forEach(function (v) { S.addLinePiece(S.truss(a.id), v); });
    var r = S.addBlockToLine(a.id, a90().id, { seg: 0, piece: 1 });
    eq(typeof r, "object", "block added between the first two pieces of a plain stick");
    var A = S.truss(a.id);
    eq(JSON.stringify(A.layout.pieces), JSON.stringify([[8], [8, 6]]), "pieces either side of the block");
    near(A.layout.centers[0], 8 + SIZE / 2, 1e-9, "block centre after the 8");
    near(A.length, 22 + SIZE, 1e-9, "whole line");
    eq(S.addBlockAtMeasure(a.id, a90().id, 5, "end"), null, "5 ft from the end");
    A = S.truss(a.id);
    near(A.layout.centers[A.layout.centers.length - 1], A.length - 5, 1e-6, "centre is 5 ft from the end");
    eq(/outside/.test(S.addBlockAtMeasure(a.id, a90().id, 0, "start") || ""), true, "a block cannot be centred on the very end of the line");
    eq(S.addBlockAtMeasure(a.id, a90().id, 2, "center"), null, "2 ft past the centre");
  });

  add("store: a bolted truss extends to the chosen side of its carrier, and can be flipped or turned end for end", function () {
    fresh();
    var h = S.addTruss({ name: "Host", x: 0, y: 0, angle: 0, length: 20, hoists: [] });
    var blk = S.addBlockToLine(h.id, a90().id, { seg: 0, piece: 0 });
    function bodySide(X) {
      var c = G.endPoint(X, X.length / 2), b = G.endPoint(S.truss(blk.id), SIZE / 2);
      return c.y > b.y ? 1 : -1;
    }
    var l = S.addTruss({ name: "L", x: 40, y: 40, angle: 0, length: 10, hoists: [] });
    eq(S.boltToBlock(l.id, blk.id, "start", "left"), null, "left");
    eq(bodySide(S.truss(l.id)), 1, "left = north"); eq(S.boltSide(l.id), "left", "reported side");
    S.flipBolt(l.id);
    eq(bodySide(S.truss(l.id)), -1, "flipped to the south"); eq(S.boltSide(l.id), "right", "reported side after flip");
    var r = S.addTruss({ name: "R", x: 40, y: -40, angle: 90, length: 10, hoists: [] });
    eq(S.boltToBlock(r.id, blk.id, "end", "right"), null, "right, end at block");
    eq(bodySide(S.truss(r.id)), -1, "right = south even when its END meets the block");
    S.swapBoltEnd(r.id);
    eq(bodySide(S.truss(r.id)), -1, "still south after turning it end for end"); eq(S.truss(r.id).anchor.mode, "start", "now its start meets the block");
    var X = S.truss(r.id), c = G.endPoint(S.truss(blk.id), SIZE / 2), s0 = G.endPoint(X, 0);
    near(Math.hypot(s0.x - c.x, s0.y - c.y), SIZE / 2, 2e-3, "the end at the block stops at the block face");
  });

  add("store: north and south trusses bolt to the two ends of a west truss and line up (any way West is drawn)", function () {
    [[-90, "startIsNorth"], [90, "endIsNorth"], [270, "startIsNorth"]].forEach(function (cfg) {
      fresh();
      var w = S.addTruss({ name: "West", x: 0, y: 0, angle: cfg[0], length: 30, hoists: [] });
      var A = S.addBlockToLine(w.id, a90().id, { at: "start" }), Z = S.addBlockToLine(w.id, a90().id, { at: "end" });
      var northBlk = cfg[1] === "startIsNorth" ? A : Z, southBlk = cfg[1] === "startIsNorth" ? Z : A;
      eq(/north end of West/.test(S.blockWhere(S.truss(northBlk.id))), true, "block description north (" + cfg[0] + "): " + S.blockWhere(S.truss(northBlk.id)));
      eq(/south end of West/.test(S.blockWhere(S.truss(southBlk.id))), true, "block description south (" + cfg[0] + "): " + S.blockWhere(S.truss(southBlk.id)));
      var n = S.addTruss({ name: "North", x: 60, y: -50, angle: 33, length: 30, hoists: [] });
      var s = S.addTruss({ name: "South", x: -70, y: 40, angle: 200, length: 30, hoists: [] });
      eq(S.boltToBlock(n.id, northBlk.id, "auto", "east"), null, "north bolt");
      eq(S.boltToBlock(s.id, southBlk.id, "auto", "east"), null, "south bolt");
      var N = S.truss(n.id), Sx = S.truss(s.id);
      eq(S.boltDirection(n.id), "east", "north truss goes east"); eq(S.boltDirection(s.id), "east", "south truss goes east");
      near(((N.angle - Sx.angle) % 180 + 180) % 180, 0, 1e-6, "parallel");
      var nc = G.endPoint(N, N.length / 2), sc = G.endPoint(Sx, Sx.length / 2);
      near(nc.x, sc.x, 1e-3, "same x (lined up)");
      near(Math.abs(nc.y - sc.y), 30 + SIZE, 2e-3, "one West span apart (30 ft of truss + a block, block centre to block centre)");
      eq(nc.y > sc.y, true, "North is above South");
    });
  });

  add("store: two trusses on the same block on the same side are reported as overlapping", function () {
    fresh();
    var w = S.addTruss({ name: "West", x: 0, y: 0, angle: -90, length: 30, hoists: [] });
    var A = S.addBlockToLine(w.id, a90().id, { at: "start" });
    var n = S.addTruss({ name: "North", x: 60, y: 0, angle: 0, length: 30, hoists: [] }), s = S.addTruss({ name: "South", x: 60, y: -10, angle: 0, length: 30, hoists: [] });
    S.boltToBlock(n.id, A.id, "start", "east"); S.boltToBlock(s.id, A.id, "start", "east");
    eq(S.results.warnings.some(function (x) { return /sit on top of each other/.test(x.message); }), true, "overlap warning");
    eq(S.boltToBlock(S.addTruss({ name: "Bad", x: 5, y: 5, angle: 0, length: 10, hoists: [] }).id, A.id, "start", "north").indexOf("across") > 0, true, "north is along a vertical West, so it is refused");
  });

  add("store: closing a loop - the second bolt pulls the free-standing truss onto the first (West meets both North and South)", function () {
    fresh();
    var north = S.addTruss({ name: "North", x: 0, y: 0, angle: 0, length: 28, hoists: [] });
    var south = S.addTruss({ name: "South", x: 0, y: -35, angle: 0, length: 28, hoists: [] });
    var nb = S.addBlockToLine(north.id, a90().id, { at: "start" }), sb = S.addBlockToLine(south.id, a90().id, { at: "start" });
    var west = S.addTruss({ name: "West", x: 40, y: 40, angle: 90, length: 31, hoists: [] });
    S.startLinePieces(S.truss(west.id)); [8, 6, 3, 8, 6].forEach(function (v) { S.addLinePiece(S.truss(west.id), v); });
    eq(S.boltToBlock(west.id, nb.id, "end", "south"), null, "West bolts to North's block");
    eq(S.boltToBlock(west.id, sb.id, "start", "south"), null, "and to South's block");
    var W = S.truss(west.id), N = S.truss(north.id), Sx = S.truss(south.id);
    near(W.length, 31, 1e-9, "West is just its 31 ft: the two shared blocks add nothing");
    var span = W.length + SIZE;                                    // block centre to block centre
    near(N.y - Sx.y, span, 2e-3, "South moved to exactly one West span below North");
    near(Sx.x, N.x, 2e-3, "and stayed lined up in x");
    eq(!!Sx.anchor && Sx.anchor.mode === "reverse", true, "South is now locked to West");
    eq(S.results.warnings.some(function (x) { return /does not meet/.test(x.message); }), false, "no gap warning");
    N.x += 5; N.y += 3; S.commit();
    near(S.truss(north.id).y - S.truss(south.id).y, span, 2e-3, "the box stays closed when North is moved");
    var keep = JSON.stringify(S.rig);
    S.unbolt(south.id);
    eq(!!S.truss(south.id).anchor, false, "released");
    S.setRig(JSON.parse(keep));
    // a second 31 ft truss fits exactly between the same two blocks
    var mid = S.addTruss({ name: "Middle", x: 13, y: -20, angle: 90, length: 31, hoists: [] });
    S.startLinePieces(S.truss(mid.id)); [8, 6, 3, 8, 6].forEach(function (v) { S.addLinePiece(S.truss(mid.id), v); });
    var nb2 = S.addBlockToLine(north.id, a90().id, { at: "end" }), sb2 = S.addBlockToLine(south.id, a90().id, { at: "end" });
    eq(S.boltToBlock(mid.id, nb2.id, "end", "south"), null, "Middle to North's far block");
    eq(S.boltToBlock(mid.id, sb2.id, "start", "south"), null, "and South's far block");
    eq(S.results.warnings.some(function (x) { return /does not meet/.test(x.message); }), false, "a 31 ft truss fits exactly between the two blocks");
  });

  add("store: measuring from centre and from end follows length changes", function () {
    fresh();
    var t = S.addTruss({ name: "T", length: 20, hoists: [] });
    var l = { id: S.newId("l"), distance: 8, weight: 10 };
    t.loads.push(l); S.commit();
    S.measureFrom(l, "end", t.length); S.commit();
    near(S.measureDisplay(l, t.length), 12, 1e-9, "12 ft from the end");
    S.measureSet(l, 3, t.length); S.commit();
    near(l.distance, 17, 1e-9, "3 ft from the end = 17 ft from the start");
    t.pieceLength = 30; S.commit();
    near(l.distance, 27, 1e-9, "stays 3 ft from the end when the line grows");
    S.measureFrom(l, "center", t.length); S.commit();
    near(S.measureDisplay(l, t.length), 12, 1e-9, "12 ft past centre");
    S.measureSet(l, -5, t.length); S.commit();
    near(l.distance, 10, 1e-9, "5 ft before centre");
    S.measureFrom(l, "start", t.length); S.commit();
    near(S.measureDisplay(l, t.length), 10, 1e-9, "back to start-based");
  });

  add("store: CB + 3' + CB + 22' + CB + 3' is one span with block centres from the typed segments", function () {
    fresh();
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 28, hoists: [] });
    var b1 = S.addTruss({ name: "B1", x: 0.5, y: 5, angle: -90, length: 10, hoists: [] });
    var b2 = S.addTruss({ name: "B2", x: 5.5, y: 5, angle: -90, length: 10, hoists: [] });
    var b3 = S.addTruss({ name: "B3", x: 28, y: 5, angle: -90, length: 10, hoists: [] });
    [b1, b2, b3].forEach(function (t) { eq(S.addBlockConnection(t.id, a.id, a90().id), null, "connect " + t.name); });
    var A = S.truss(a.id);
    eq(A.layout.order.length, 3, "three blocks in the line");
    eq(A.layout.segs.length, 4, "4 segments around 3 blocks");
    S.setSegment(A, 0, 0); S.setSegment(A, 1, 3); S.setSegment(A, 2, 22); S.setSegment(A, 3, 3);
    near(A.length, 28 + 3 * SIZE, 1e-6, "one span: 3 + 22 + 3 + three blocks");
    var c = A.layout.centers;
    near(c[0], SIZE / 2, 1e-6, "block 1 at the start");
    near(c[1], SIZE + 3 + SIZE / 2, 1e-6, "block 2 after 3 ft");
    near(c[2], SIZE + 3 + SIZE + 22 + SIZE / 2, 1e-6, "block 3 after 22 ft");
    [b1, b2, b3].forEach(function (t, i) { near(G.crossing(S.truss(t.id), S.truss(a.id)).onB, c[i], 2e-3, "plan crossing " + (i + 1)); });
    S.setSegment(A, 2, 20);
    near(S.truss(a.id).length, 26 + 3 * SIZE, 1e-6, "editing one piece changes the whole span");
  });

  add("store: build a stick and the segments between blocks from component pieces", function () {
    fresh();
    var cid = TLA.data.trusses.filter(function (x) { return x.manufacturer === "Christie" && /A Type/.test(x.description); })[0].id;
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 20, hoists: [], trussId: cid });
    eq(JSON.stringify(S.pieceLengths(S.truss(a.id))), JSON.stringify([8, 6, 4, 3, 2, 1]), "Christie A stick lengths");
    S.startLinePieces(S.truss(a.id));
    S.addLinePiece(S.truss(a.id), 8); S.addLinePiece(S.truss(a.id), 8); S.addLinePiece(S.truss(a.id), 4);
    near(S.truss(a.id).length, 20, 1e-9, "8 + 8 + 4");
    S.removeLinePiece(S.truss(a.id), 2); S.addLinePiece(S.truss(a.id), 6);
    near(S.truss(a.id).length, 22, 1e-9, "8 + 8 + 6");
    S.typeLineLength(S.truss(a.id));
    eq(Array.isArray(S.truss(a.id).pieces), false, "typed length again");
    near(S.truss(a.id).length, 22, 1e-9, "length kept");
    var b = S.addTruss({ name: "B", x: 4, y: 4, angle: -90, length: 8, hoists: [] });
    var c = S.addTruss({ name: "C", x: 18, y: 4, angle: -90, length: 8, hoists: [] });
    eq(S.addBlockConnection(b.id, a.id, a90().id), null, "b"); eq(S.addBlockConnection(c.id, a.id, a90().id), null, "c");
    var A = S.truss(a.id);
    eq(A.layout.segs.length, 3, "3 segments around 2 blocks");
    [0, 1, 2].forEach(function (i) { while (A.layout.pieces[i].length) S.removeSegPiece(A, i, 0); });
    S.addSegPiece(A, 0, 3); S.addSegPiece(A, 1, 8); S.addSegPiece(A, 1, 6); S.addSegPiece(A, 2, 3);
    near(A.layout.segs[1], 14, 1e-9, "8 + 6 between the blocks");
    near(A.length, 3 + 14 + 3 + 2 * SIZE, 1e-9, "one span of pieces and blocks");
    near(A.layout.centers[0], 3 + SIZE / 2, 1e-9, "first block after 3 ft");
  });

  add("store: JTE sticks are 10' and 5'", function () {
    fresh();
    var jt = TLA.data.trusses.filter(function (x) { return x.manufacturer === "JTE"; })[0];
    var a = S.addTruss({ name: "J", length: 20, hoists: [], trussId: jt.id });
    eq(JSON.stringify(S.pieceLengths(S.truss(a.id))), JSON.stringify([10, 5]), "JTE stick lengths");
    S.rememberPiece(2.5);
    eq(JSON.stringify(S.pieceLengths(S.truss(a.id))), JSON.stringify([10, 5, 2.5]), "custom length is remembered");
    S.ui.customPieces = [];
  });

  add("store: mounting above / below is kept on direct connections", function () {
    fresh();
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 20, hoists: [2, 18] });
    var p = S.addTruss({ name: "P", x: 8, y: -3, angle: 90, length: 6, hoists: [] });
    eq(S.addCrossingSupport(p.id, a.id, "below"), null, "connect");
    var s = S.truss(p.id).supports.filter(function (x) { return x.kind === "truss"; })[0];
    eq(s.mount, "below", "mount");
    near(s.onDistance, 8, 1e-6, "one point on the carrier");
  });

  add("store: corner blocks go where they are added in the makeup", function () {
    fresh();
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 10, hoists: [] });
    var c1 = S.addBlockToLine(a.id, a90().id, { at: "start" });
    var c2 = S.addBlockToLine(a.id, a90().id, { at: "end" });
    var A = S.truss(a.id);
    near(A.length, 10 + 2 * SIZE, 1e-9, "10 ft of truss + two blocks");
    eq(JSON.stringify(A.layout.order), JSON.stringify([c1.id, c2.id]), "order");
    near(A.layout.centers[0], SIZE / 2, 1e-9, "first block at the start");
    near(A.layout.centers[1], SIZE + 10 + SIZE / 2, 1e-9, "second block at the end");
    var mid = S.addBlockToLine(a.id, a90().id, { distance: 6 });
    var B = S.truss(a.id);
    eq(B.layout.order.length, 3, "three blocks");
    near(B.layout.centers[1], 6, 1e-6, "inserted at 6 ft along the line");
    var blk = S.truss(mid.id), cc = G.endPoint(blk, blk.length / 2), onLine = G.endPoint(B, B.layout.centers[1]);
    near(cc.x, onLine.x, 1e-3, "block plan position follows the makeup"); near(cc.y, onLine.y, 1e-3, "block y");
    S.removeTruss(mid.id);
    eq(S.truss(a.id).layout.order.length, 2, "removing a block takes it out of the truss");
    near(S.truss(a.id).length, 10 + 2 * SIZE, 1e-9, "and the line gets shorter by the block");
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
