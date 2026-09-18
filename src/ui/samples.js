/* Example rig. Illustrative only.
 * Corner blocks are components of a truss line; other trusses bolt to them at 90 degrees. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});

  function load(S, d, w, note, mirror) { return { id: S.newId("l"), distance: d, weight: w, note: note, mirror: !!mirror }; }
  function ok(err) { if (err && typeof err === "string") throw new Error(err); return err; }

  TLA.samples = {
    box: function (S) {
      S.rig.name = "Example box (illustrative)";
      var DB = S.db(), trussId = S.defaultTrussId();
      var type = S.blockFor({ trussId: trussId }), size = S.blockLength(DB.corners.filter(function (c) { return c.id === type; })[0]);
      function blockSeg(t, i) { return ok(S.addBlockToLine(t.id, type, { seg: i })); }
      function bolt(t, b, mode) { ok(S.boltToBlock(t.id, b.id, mode)); }
      function mkLine(name, x, y, angle, pieces, hoists) {
        var t = S.makeTruss({ name: name, x: x, y: y, angle: angle, length: pieces, hoists: hoists, measure: "start" });
        S.rig.trusses.push(t); return t;
      }
      // west: CB + 30' + CB
      var west = mkLine("West", 0, 0, -90, 30, [3, 16, 29]);
      var nw = ok(S.addBlockToLine(west.id, type, { at: "start" }));
      var sw = ok(S.addBlockToLine(west.id, type, { at: "end" }));
      // north / south butt against the west corner blocks: 8' + CB + 13' + CB + 9' (the corner blocks belong to West and East)
      function lineNS(name, corner, hoists) {
        var t = mkLine(name, 5, 5, 0, 30, hoists);
        bolt(t, corner, "start");
        S.startManualLayout(t);
        S.setSegment(t, 0, 8); blockSeg(t, 0);
        S.setSegment(t, 1, 13); blockSeg(t, 1);
        S.setSegment(t, 2, 9);
        return t;
      }
      var north = lineNS("North", nw, [10.5, 23.5]), south = lineNS("South", sw, [10.5, 23.5]);
      S.reconnect();
      var east = mkLine("East", 40, 0, -90, 30, [3, 16, 29]);
      var ne = ok(S.addBlockToLine(east.id, type, { at: "start" }));
      var se = ok(S.addBlockToLine(east.id, type, { at: "end" }));
      bolt(north, ne, "end"); bolt(south, se, "end");
      S.reconnect();
      // inner trusses bolt to the blocks in the north and south lines
      var nBlocks = north.layout.order.map(function (id) { return S.truss(id); }), sBlocks = south.layout.order.map(function (id) { return S.truss(id); });   // [inner W, inner E]
      var iw = mkLine("Inner W", 0, 0, -90, 30, [15]), ie = mkLine("Inner E", 0, 0, -90, 30, [15]);
      bolt(iw, nBlocks[0], "start"); bolt(iw, sBlocks[0], "end");
      bolt(ie, nBlocks[1], "start"); bolt(ie, sBlocks[1], "end");

      north.loads.push(load(S, 5, 85, "Moving light", true), load(S, 11, 85, "Moving light", true));
      south.loads.push(load(S, 5, 85, "Moving light", true), load(S, 11, 85, "Moving light", true));
      iw.loads.push(load(S, 7, 60, "Wash", true), load(S, 15, 120, "Video wall section", false));
      ie.loads.push(load(S, 7, 60, "Wash", true));
      S.measureAllFromCentre(S.rig);
      S.sel = { truss: null, support: null };
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
