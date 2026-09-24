/* App state: rig model, selection, undo/redo, persistence, live solve.
 *
 * Corner blocks are COMPONENTS of a truss line: a host truss has a "makeup" (layout) of truss pieces and corner
 * blocks in order, e.g. CB + 3' + CB + 22' + CB + 3'. A block never slides; its plan position comes from its host.
 * Another truss bolts to a block at 90 degrees and is anchored to it (position and angle follow the block), so a
 * bolted-together grid moves as one piece. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var KEY = "tla-rig-v1";
  var listeners = [];
  var undoStack = [], redoStack = [];

  var S = (TLA.store = {
    rig: null,
    results: null,
    sel: { truss: null, support: null, load: null },
    ui: { colorMode: "util", showLoads: true, showLabels: true, view: { scale: 8, ox: 60, oy: 60 }, tab: "plan" },
    userDb: { trusses: [], hoists: [], fixtures: [], corners: [] }
  });

  function id(prefix) {
    S.rig.counter = (S.rig.counter || 0) + 1;
    return prefix + S.rig.counter;
  }
  S.newId = id;

  function db() {
    return {
      trusses: (TLA.data.trusses || []).concat(S.userDb.trusses),
      hoists: (TLA.data.hoists || []).concat(S.userDb.hoists),
      fixtures: (TLA.data.fixtures || []).concat(S.userDb.fixtures),
      corners: (TLA.data.corners || []).concat(S.userDb.corners || [])
    };
  }
  S.db = db;

  function emptyRig() {
    return { name: "Untitled rig", counter: 0, settings: { derate: null }, trusses: [] };
  }

  function round(v) { return Math.round(v * 1000) / 1000; }
  /** How a truss meets a block: "start" / "end" (butts against the block's face - the block is NOT part of its line) or "through" (passes through it). */
  function boltEnd(t, s, blk) {
    if (s.end) return s.end;
    var d = Number(s.distance) || 0, hs = blk.length / 2 + 0.01;
    return d <= hs ? "start" : d >= t.length - hs ? "end" : "through";
  }
  /** Position of the block center along X for a given way of meeting it (start/end centers lie half a block beyond the line). */
  function centreAlong(X, en, blk, d) { return en === "start" ? -blk.length / 2 : en === "end" ? X.length + blk.length / 2 : d; }
  function r4(v) { return Math.round(v * 1000000) / 1000000; }
  function sum(a) { return a.reduce(function (t, v) { return t + v; }, 0); }
  function norm360(a) { return ((a % 360) + 360) % 360; }

  function defaultTrussId() {
    var t = TLA.data.trusses.filter(function (x) { return /12"?x12"? A Type Bolted/i.test(x.description) || /12x12 Plated/.test(x.description); })[0];
    return (t || TLA.data.trusses[0]).id;
  }
  function defaultHoistId() {
    var h = TLA.data.hoists.filter(function (x) { return /Lodestar/.test(x.description) && x.capacity_label === "1 Ton"; })[0];
    return (h || TLA.data.hoists[1] || TLA.data.hoists[0]).id;
  }
  S.defaultTrussId = defaultTrussId;
  S.defaultHoistId = defaultHoistId;

  S.hoistSupport = function (distance, extra) {
    return Object.assign({ id: id("s"), name: "", distance: distance, kind: "hoist", hoistId: defaultHoistId(), chainLength: 20, hardwareWeight: 0 }, extra || {});
  };

  S.makeTruss = function (opts) {
    opts = opts || {};
    var n = S.rig.trusses.length + 1;
    var len = opts.length || 20;
    var t = {
      id: id("T"), name: opts.name || "Truss " + n, trussId: opts.trussId || defaultTrussId(), length: len,
      weightless: false, wallWeight: 0, pieceLength: len, addBlocks: true, measure: opts.measure || "center",
      x: opts.x != null ? opts.x : 0, y: opts.y != null ? opts.y : -(n - 1) * 6, angle: opts.angle || 0,
      loads: [], supports: []
    };
    (opts.hoists || [2, len - 2]).forEach(function (d) { t.supports.push(S.applyMeasure(S.hoistSupport(d), t)); });
    return t;
  };

  S.addTruss = function (opts) {
    var t = S.makeTruss(opts);
    S.rig.trusses.push(t);
    S.sel = { truss: t.id, support: null };
    S.commit();
    return t;
  };

  S.truss = function (tid) { return S.rig.trusses.filter(function (t) { return t.id === tid; })[0] || null; };

  S.removeTruss = function (tid) {
    S.rig.trusses = S.rig.trusses.filter(function (t) { return t.id !== tid; });
    S.rig.trusses.forEach(function (t) {
      t.supports = t.supports.filter(function (s) { return !(s.kind === "truss" && s.onTruss === tid); });
      t.supports.forEach(function (s) { if (s.hangFrom === tid) delete s.hangFrom; });   // its hoists hang from the structure again
      if (t.anchor && t.anchor.block === tid) delete t.anchor;
    });
    S.pruneBlocks();
    if (!S.truss(S.sel.truss)) S.sel = { truss: null, support: null };
    S.commit();
  };

  /** Drop corner blocks whose host truss was deleted (and unbolt anything that was bolted to them). */
  S.pruneBlocks = function () {
    var changed = true;
    while (changed) {
      changed = false;
      S.rig.trusses.slice().forEach(function (b) {
        if (!b.isBlock) return;
        var gone = b.host ? !S.truss(b.host) : b.attach ? !(S.truss(b.attach.a) && S.truss(b.attach.b)) : false;
        if (!gone) return;
        S.rig.trusses = S.rig.trusses.filter(function (t) { return t.id !== b.id; });
        S.rig.trusses.forEach(function (t) {
          t.supports = t.supports.filter(function (s) { return !(s.kind === "truss" && s.onTruss === b.id); });
          if (t.anchor && t.anchor.block === b.id) delete t.anchor;
        });
        changed = true;
      });
    }
  };

  /** Delete one support (a hoist or a connection) from a truss. */
  /** Set the chain length of every hoist (or only those on one truss) in one undo step. Returns how many changed. */
  S.setChains = function (len, tid) {
    var n = 0;
    if (!(len >= 0)) return 0;
    S.rig.trusses.forEach(function (t) {
      if (tid && t.id !== tid) return;
      t.supports.forEach(function (s) { if (s.kind === "hoist") { s.chainLength = round(len); n++; } });
    });
    if (n) S.commit();
    return n;
  };
  S.removeSupport = function (tid, sid) {
    var t = S.truss(tid); if (!t) return;
    t.supports = t.supports.filter(function (s) { return s.id !== sid; });
    if (S.sel.support === sid) S.sel.support = null;
    S.commit();
  };

  S.duplicateTruss = function (tid) {
    var t = S.truss(tid); if (!t || t.isBlock) return;
    var c = JSON.parse(JSON.stringify(t));
    c.id = id("T"); c.name = t.name + " copy"; c.y = (c.y || 0) - 4; c.x = (c.x || 0) + 2;
    delete c.anchor;
    if (c.layout) { c.pieces = [].concat.apply([], c.layout.pieces || []); c.pieceLength = t.pieceLength; delete c.layout; }
    c.supports = c.supports.filter(function (s) { return s.kind === "hoist"; }).map(function (s) { s.id = id("s"); return s; });
    c.loads.forEach(function (l) { l.id = id("l"); });
    S.rig.trusses.push(c); S.sel = { truss: c.id, support: null }; S.commit();
  };

  /* ------------------------------------------------------------------ geometry / layout */

  /** Recompute lengths, corner block positions, anchored trusses and plan-derived support distances. */
  S.reconnect = function () {
    var G = TLA.rig.geometry;

    function computeLines() {
      S.rig.trusses.forEach(function (t) {
        if (t.isBlock) return;
        if (typeof t.pieceLength !== "number") t.pieceLength = t.length;
        var att = S.attachedBlocks(t);
        if (t.layout && t.layout.manual) {
          syncLayout(t, att);
          t.layout.pieces.forEach(function (p, i) { if (Array.isArray(p)) t.layout.segs[i] = r4(sum(p)); });
          var sz = 0, sg = 0;
          t.layout.order.forEach(function (bid) { sz += t.layout.sizes[bid]; });
          t.layout.segs.forEach(function (v) { sg += v; });
          t.blocksAdded = r4(sz);
          t.pieceLength = r4(sg);
          t.length = r4(sg + sz);
          t.layout.centers = layoutCenters(t.layout);
          return;
        }
        if (Array.isArray(t.pieces)) t.pieceLength = r4(sum(t.pieces));
        var add = 0;
        if (t.addBlocks !== false) att.forEach(function (x) { add += x.block.length; });
        t.blocksAdded = r4(add);
        t.length = r4(t.pieceLength + add);
      });
    }

    function anchorDistance(X, an, blk) {
      if (X.layout && X.layout.manual && X.layout.centers) {
        var i = X.layout.order.indexOf(blk.id);
        if (i >= 0) return X.layout.centers[i];
      }
      return centreAlong(X, an.mode, blk, an.d || blk.length / 2);
    }

    /** Move blocks and anchored trusses into place; true when anything moved. */
    function positionPass() {
      var moved = false;
      function setPos(o, x, y, ang) {
        x = r4(x); y = r4(y);
        if (Math.abs((o.x || 0) - x) > 1e-6 || Math.abs((o.y || 0) - y) > 1e-6) moved = true;
        o.x = x; o.y = y;
        if (ang != null) { ang = r4(norm360(ang)); if (Math.abs((o.angle || 0) - ang) > 1e-6) moved = true; o.angle = ang; }
      }
      S.rig.trusses.forEach(function (b) {
        if (!b.isBlock) return;
        if (b.host) {
          var host = S.truss(b.host);
          if (!host || !host.layout || !host.layout.manual || !host.layout.centers) return;
          var i = host.layout.order.indexOf(b.id);
          if (i < 0) return;
          var c = G.endPoint(host, host.layout.centers[i]), a = (host.angle || 0) * Math.PI / 180;
          setPos(b, c.x - (b.length / 2) * Math.cos(a), c.y - (b.length / 2) * Math.sin(a), host.angle || 0);
        } else if (b.attach) {
          var ta = S.truss(b.attach.a), tb = S.truss(b.attach.b);
          if (!ta || !tb) return;
          var x = G.crossing(ta, tb);
          if (!x) return;
          var ang = (Number(tb.angle) || 0) * Math.PI / 180;
          setPos(b, x.point.x - (b.length / 2) * Math.cos(ang), x.point.y - (b.length / 2) * Math.sin(ang), tb.angle || 0);
        }
      });
      S.rig.trusses.forEach(function (X) {
        var an = X.anchor;
        if (!an) return;
        var blk = S.truss(an.block);
        if (!blk || !blk.isBlock) { delete X.anchor; return; }
        if (an.reverse) {
          var Y = S.truss(an.reverse.truss), sp = Y && Y.supports.filter(function (q) { return q.id === an.reverse.support; })[0];
          if (!Y || !sp) { delete X.anchor; return; }
          var ix = X.layout && X.layout.manual && X.layout.order.indexOf(blk.id);
          if (!(ix >= 0) || !X.layout.centers) return;
          var rv = an.reverse, iy = Y.layout && Y.layout.manual && Y.layout.centers ? Y.layout.order.indexOf(blk.id) : -1;
          var dY = iy >= 0 ? Y.layout.centers[iy] : centreAlong(Y, rv.mode || boltEnd(Y, sp, blk), blk, rv.d != null ? rv.d : sp.distance);
          var P = G.endPoint(Y, dY), c0 = X.layout.centers[ix], angR = (Y.angle || 0) + (an.rot || 90), radR = norm360(angR) * Math.PI / 180;
          setPos(X, P.x - c0 * Math.cos(radR), P.y - c0 * Math.sin(radR), angR);
          return;
        }
        var host = S.truss(blk.host || (blk.attach && blk.attach.b));
        var ang = ((host ? host.angle : blk.angle) || 0) + (an.rot || 90);
        var cc = G.endPoint(blk, blk.length / 2), d = anchorDistance(X, an, blk), rad = norm360(ang) * Math.PI / 180;
        setPos(X, cc.x - d * Math.cos(rad), cc.y - d * Math.sin(rad), ang);
      });
      return moved;
    }

    // a saved rig may already have a loop that was never closed: pull the free-standing truss onto the one that is placed
    for (var rp = 0; rp < 6; rp++) {
      var changed = false;
      S.rig.trusses.forEach(function (X) {
        if (X.isBlock || !X.anchor) return;
        X.supports.forEach(function (s) {
          if (s.kind !== "truss" || !s.fromPlan) return;
          var blk = S.truss(s.onTruss);
          if (!blk || !blk.isBlock || X.anchor.block === blk.id) return;
          var host = S.truss(blk.host || (blk.attach && blk.attach.b));
          if (!host || host.anchor || host.id === X.id || dependsOn(X, host)) return;
          var dl = ((((host.angle || 0) - (X.angle || 0) + 180) % 360) + 360) % 360 - 180;
          var ym = boltEnd(X, s, blk);
          host.anchor = { block: blk.id, mode: "reverse", rot: dl >= 0 ? 90 : -90, reverse: { truss: X.id, support: s.id, mode: ym, d: ym === "through" ? s.distance : undefined } };
          changed = true;
        });
      });
      if (!changed) break;
    }

    for (var pass = 0; pass < 12; pass++) {
      computeLines();
      if (!positionPass()) break;
    }

    S.rig.trusses.forEach(function (t) {
      t.supports.forEach(function (s) {
        if (s.kind !== "truss" || !s.fromPlan) return;
        var u = S.truss(s.onTruss); if (!u) return;
        if (u.isBlock) {
          var c1 = G.endPoint(u, u.length / 2), en = boltEnd(t, s, u);
          s.end = en;
          s.distance = en === "start" ? 0 : en === "end" ? t.length : round(G.project(t, c1).distance); s.onDistance = round(u.length / 2);
        } else if (t.isBlock) {
          var c2 = G.endPoint(t, t.length / 2);
          s.distance = round(t.length / 2); s.onDistance = round(G.project(u, c2).distance);
        } else {
          var c = G.crossing(t, u);
          if (c) { s.distance = round(c.onA); s.onDistance = round(c.onB); }
        }
      });
    });
    function centerIn(line, blockId) {
      if (!line || !line.layout || !line.layout.manual) return null;
      var i = line.layout.order.indexOf(blockId);
      return i < 0 ? null : round(line.layout.centers[i]);
    }
    S.rig.trusses.forEach(function (t) {
      t.supports.forEach(function (s) {
        if (s.kind !== "truss" || !s.fromPlan) return;
        var u = S.truss(s.onTruss); if (!u) return;
        var d;
        if (u.isBlock && (d = centerIn(t, u.id)) != null) s.distance = d;
        else if (t.isBlock && (d = centerIn(u, t.id)) != null) s.onDistance = d;
      });
    });
    S.rig.trusses.forEach(function (t) {
      (t.loads || []).forEach(function (l) { resolvePos(l, t.length); });
      t.supports.forEach(function (s) { if (!s.fromPlan) resolvePos(s, t.length); });
    });
  };

  /** Corner blocks IN a truss line (hosted by it, or that it passes through), in order along the line. A truss that only butts against a block does not include it. */
  S.attachedBlocks = function (t) {
    var G = TLA.rig.geometry, list = [];
    S.rig.trusses.forEach(function (o) {
      if (!o.isBlock) return;
      var hosted = o.supports.some(function (s) { return s.kind === "truss" && s.onTruss === t.id; });
      var through = t.supports.some(function (s) { return s.kind === "truss" && s.onTruss === o.id && boltEnd(t, s, o) === "through"; });
      if (!hosted && !through) return;
      list.push({ block: o, d: G.project(t, G.endPoint(o, o.length / 2)).distance });
    });
    list.sort(function (x, y) { return x.d - y.d; });
    return list;
  };

  function layoutCenters(L) {
    var c = [], pos = L.segs[0];
    L.order.forEach(function (bid, i) { var b = L.sizes[bid]; c.push(pos + b / 2); pos += b + L.segs[i + 1]; });
    return c;
  }

  /** Insert a block into a layout at a distance along the line by splitting the segment it falls in. */
  function insertByDistance(L, bid, size, d, carve) {
    var cs = layoutCenters(L), idx = 0;
    while (idx < cs.length && cs[idx] < d) idx++;
    var start = idx === 0 ? 0 : cs[idx - 1] + L.sizes[L.order[idx - 1]] / 2;
    var left = Math.min(Math.max(d - size / 2 - start, 0), L.segs[idx]);
    var lv = r4(left), rv = r4(L.segs[idx] - left);
    if (carve) rv = Math.max(0, r4(rv - size));
    L.segs.splice(idx, 1, lv, rv);
    L.pieces.splice(idx, 1, lv > 0 ? [lv] : [], rv > 0 ? [rv] : []);
    L.order.splice(idx, 0, bid);
    L.sizes[bid] = size;
  }

  /** Keep a manual layout in step with the blocks that are attached: removed blocks drop out, unknown ones are placed by position. */
  function syncLayout(t, att) {
    var L = t.layout, ids = att.map(function (a) { return a.block.id; });
    if (!L.pieces) L.pieces = L.segs.map(function (v) { return v > 0 ? [v] : []; });
    for (var i = L.order.length - 1; i >= 0; i--) {
      if (ids.indexOf(L.order[i]) >= 0) continue;
      L.segs.splice(i, 2, L.segs[i] + L.segs[i + 1]);
      L.pieces.splice(i, 2, (L.pieces[i] || []).concat(L.pieces[i + 1] || []));
      delete L.sizes[L.order[i]];
      L.order.splice(i, 1);
    }
    att.forEach(function (a) {
      if (L.order.indexOf(a.block.id) >= 0) { L.sizes[a.block.id] = a.block.length; return; }
      insertByDistance(L, a.block.id, a.block.length, a.d, t.addBlocks === false);
    });
  }

  /** Segment lengths implied by the current plan geometry (clamped at zero), as a starting point for a layout. */
  S.layoutDerived = function (t) {
    var att = S.attachedBlocks(t), segs = [], prev = 0;
    var total = t.addBlocks === false ? t.pieceLength : t.pieceLength + att.reduce(function (s, a) { return s + a.block.length; }, 0);
    att.forEach(function (a) {
      var size = a.block.length, d = a.d, zone = size + 0.5;
      if (d < zone) d = size / 2; else if (d > total - zone) d = total - size / 2;
      segs.push(Math.max(0, round(d - size / 2 - prev)));
      prev = d + size / 2;
    });
    segs.push(Math.max(0, round(total - prev)));
    return { att: att, segs: segs };
  };

  /** Make sure a truss has a makeup (pieces + blocks in order); a plain stick becomes one segment of pieces. */
  function ensureManual(t) {
    if (t.layout && t.layout.manual) return;
    var d = S.layoutDerived(t), sizes = {};
    d.att.forEach(function (a) { sizes[a.block.id] = a.block.length; });
    var pieces = d.segs.map(function (v) { return v > 0 ? [v] : []; });
    if (!d.att.length && Array.isArray(t.pieces)) pieces = [t.pieces.slice()];
    t.layout = { manual: true, order: d.att.map(function (a) { return a.block.id; }), sizes: sizes, segs: d.segs, pieces: pieces };
    delete t.pieces;
  }

  S.startManualLayout = function (t) { ensureManual(t); S.commit(); };
  S.resetLayout = function (t) { delete t.layout; S.commit(); };
  S.setSegment = function (t, i, v) { if (t.layout) { v = Math.max(0, v); t.layout.segs[i] = v; t.layout.pieces[i] = v > 0 ? [v] : []; S.commit(); } };
  S.addSegPiece = function (t, i, len) { if (t.layout) { t.layout.pieces[i].push(len); S.commit(); } };
  S.removeSegPiece = function (t, i, j) { if (t.layout) { t.layout.pieces[i].splice(j, 1); S.commit(); } };

  /** Build a plain stick (no blocks yet) from component pieces. */
  S.startLinePieces = function (t) { t.pieces = []; S.commit(); };
  S.addLinePiece = function (t, len) { if (!Array.isArray(t.pieces)) t.pieces = []; t.pieces.push(len); S.commit(); };
  S.removeLinePiece = function (t, j) { if (Array.isArray(t.pieces)) { t.pieces.splice(j, 1); S.commit(); } };
  S.typeLineLength = function (t) { var v = t.pieceLength; delete t.pieces; t.pieceLength = v; S.commit(); };

  /** Standard stick lengths for a truss type, plus any custom lengths the user has used. */
  S.pieceLengths = function (t) {
    var entry = S.db().trusses.filter(function (x) { return x.id === t.trussId; })[0] || {};
    var P = TLA.data.pieces, d = String(entry.description || ""), list = P.generic;
    if (/^jte$|thomas/i.test(entry.manufacturer || "")) list = P.jte;
    else if (/christie/i.test(entry.manufacturer || "")) {
      var k = (d.match(/\b([A-H]) Type/i) || [])[1];
      if (k && P.christie[k.toUpperCase()]) list = P.christie[k.toUpperCase()];
    }
    var extra = (S.ui.customPieces || []).filter(function (v) { return list.indexOf(v) < 0; });
    return list.concat(extra).sort(function (a, b) { return b - a; });
  };
  S.rememberPiece = function (v) { S.ui.customPieces = S.ui.customPieces || []; if (S.ui.customPieces.indexOf(v) < 0) { S.ui.customPieces.push(v); S.persist(); } };

  /* ------------------------------------------------------------------ measuring references */

  function resolvePos(item, L) {
    if ((item.from === "end" || item.from === "center") && typeof item.pos === "number") item.distance = round(item.from === "end" ? L - item.pos : L / 2 + item.pos);
  }
  /** Value to show for an item measured from its chosen reference (start / center / end of the whole line). */
  S.measureDisplay = function (item, L) {
    var d = Number(item.distance) || 0;
    return round(item.from === "end" ? L - d : item.from === "center" ? d - L / 2 : d);
  };
  S.measureSet = function (item, v, L) {
    if (item.from === "end" || item.from === "center") { item.pos = v; item.distance = round(item.from === "end" ? L - v : L / 2 + v); }
    else { item.distance = v; delete item.pos; }
  };
  S.measureFrom = function (item, from, L) {
    var here = item.distance;
    item.from = from;
    if (from === "start") delete item.pos; else item.pos = round(from === "end" ? L - here : here - L / 2);
  };
  /** Duplicate one load on the same truss (same spot; then edit it). */
  S.duplicateLoad = function (tid, lid) {
    var t = S.truss(tid), i = t ? t.loads.findIndex(function (l) { return l.id === lid; }) : -1;
    if (i < 0) return null;
    var c = JSON.parse(JSON.stringify(t.loads[i])); c.id = S.newId("l");
    t.loads.splice(i + 1, 0, c); S.commit();
    return c;
  };
  /** Copy loads (ids, or all when empty) to another truss, keeping each one's distance from the CENTRE of the truss. Returns { copied, clamped }. */
  S.copyLoads = function (srcId, ids, dstId) {
    var A = S.truss(srcId), B = S.truss(dstId);
    if (!A || !B || A === B) return null;
    var list = A.loads.filter(function (l) { return !ids || !ids.length || ids.indexOf(l.id) >= 0; }), clamped = 0;
    list.forEach(function (l) {
      var off = (Number(l.distance) || 0) - A.length / 2, half = B.length / 2;
      if (Math.abs(off) > half) { off = off < 0 ? -half : half; clamped++; }
      var c = JSON.parse(JSON.stringify(l)); c.id = S.newId("l"); c.from = "center"; c.pos = round(off); c.distance = round(half + off);
      B.loads.push(c);
    });
    if (list.length) S.commit();
    return { copied: list.length, clamped: clamped };
  };
  /** Add a hoist at the middle of a truss (edit its position afterwards). */
  S.addHoist = function (tid) {
    var t = S.truss(tid); if (!t) return null;
    var sp = S.applyMeasure(S.hoistSupport(round(t.length / 2)), t);
    t.supports.push(sp); S.commit(); return sp;
  };
  /** Remove every load from a truss (Undo brings them back). */
  S.clearLoads = function (tid) {
    var t = S.truss(tid); if (!t || !t.loads.length) return 0;
    var n = t.loads.length; t.loads = []; S.commit(); return n;
  };
  /** Move a load up (-1) or down (+1) in the list; only the row order changes. */
  S.moveLoad = function (tid, lid, dir) {
    var t = S.truss(tid), i = t ? t.loads.findIndex(function (l) { return l.id === lid; }) : -1, j = i + dir;
    if (i < 0 || j < 0 || j >= t.loads.length) return;
    var x = t.loads[i]; t.loads[i] = t.loads[j]; t.loads[j] = x; S.commit();
  };
  /** Drag-and-drop: put a load where another load is in the list. */
  S.reorderLoad = function (tid, lid, targetId) {
    var t = S.truss(tid); if (!t || lid === targetId) return;
    var i = t.loads.findIndex(function (l) { return l.id === lid; }), j = t.loads.findIndex(function (l) { return l.id === targetId; });
    if (i < 0 || j < 0) return;
    var x = t.loads.splice(i, 1)[0]; t.loads.splice(j, 0, x); S.commit();
  };
  /** Order the load rows by position along the truss (start to end). */
  S.sortLoads = function (tid) {
    var t = S.truss(tid); if (!t) return;
    t.loads = t.loads.map(function (l, i) { return { l: l, i: i }; }).sort(function (a, b) { return (a.l.distance - b.l.distance) || (a.i - b.i); }).map(function (o) { return o.l; });
    S.commit();
  };
  /** Corner blocks that belong to a truss, in order along its line. */
  S.hostedBlocks = function (tid) {
    var t = S.truss(tid), G = TLA.rig.geometry;
    if (!t) return [];
    return S.rig.trusses.filter(function (b) { return b.isBlock && b.host === tid; })
      .map(function (b) { return { b: b, d: G.project(t, G.endPoint(b, b.length / 2)).distance }; })
      .sort(function (a, c) { return a.d - c.d; }).map(function (o) { return o.b; });
  };
  /** Name a truss's corner blocks "<truss> CB<n>" in order along the line, starting at `start` (default 1). */
  S.renumberBlocks = function (tid, start) {
    var t = S.truss(tid), n = Number(start); if (!(n >= 0)) n = 1;
    if (!t) return 0;
    var list = S.hostedBlocks(tid);
    list.forEach(function (b, i) { b.name = t.name + " CB" + (n + i); });
    if (list.length) S.commit();
    return list.length;
  };
  /** Show every load and hoist position on every truss measured from its center (positions themselves do not change). */
  S.measureAllFromCentre = function (rig) {
    rig = rig || S.rig;
    rig.trusses.forEach(function (t) {
      if (t.isBlock) return;
      t.measure = "center";
      t.loads.forEach(function (l) { S.measureFrom(l, "center", t.length); });
      t.supports.forEach(function (s) { if (s.kind === "hoist") S.measureFrom(s, "center", t.length); });
    });
  };
  S.applyMeasure = function (item, t) {
    if (t.measure === "end" || t.measure === "center") S.measureFrom(item, t.measure, t.length);
    return item;
  };

  /* ------------------------------------------------------------------ connections */

  /** Stack on / clamp to another truss at the single point where the two centerlines cross. */
  S.addCrossingSupport = function (tid, uid, mount) {
    var t = S.truss(tid), u = S.truss(uid);
    if (!t || !u) return "Pick a truss";
    var c = TLA.rig.geometry.crossing(t, u);
    if (!c) return "Trusses are parallel - they never cross";
    var tol = 0.01;
    if (c.onA < -tol || c.onA > t.length + tol || c.onB < -tol || c.onB > u.length + tol) {
      return "The centerlines cross outside one of the trusses (" + c.onA.toFixed(2) + " ft on " + t.name + ", " + c.onB.toFixed(2) + " ft on " + u.name + ")";
    }
    t.supports.push({ id: id("s"), name: (mount === "below" ? "clamped below " : mount === "above" ? "on top of " : "bolted to ") + u.name, distance: round(c.onA), kind: "truss", onTruss: u.id, onDistance: round(c.onB), fromPlan: true, hardwareWeight: 0, mount: mount || null });
    S.commit();
    return null;
  };

  function sizeFromFits(fits) { var n = parseFloat(fits); return isFinite(n) ? n : 20; }
  S.blockLength = function (type) { return Math.round(((type && type.size_in) || sizeFromFits(type && type.fits)) / 12 * 10000) / 10000; };

  function normSize(desc) { return String(desc || "").replace(/["”\s]/g, "").toLowerCase(); }

  /** Best-guess corner block for a truss type: same manufacturer + size, preferring 6-way then 4-way. */
  S.suggestBlock = function (trussEntry) {
    var corners = S.db().corners, d = normSize(trussEntry && trussEntry.description);
    var mfr = String((trussEntry && trussEntry.manufacturer) || "").toLowerCase();
    if (mfr === "jte") mfr = "james";
    function score(c) {
      var sc = 0, fam = (c.family || "").toLowerCase();
      if (d.indexOf(c.fits) >= 0) sc += 4;
      if (mfr && (c.manufacturer.toLowerCase().indexOf(mfr.split(" ")[0]) >= 0)) sc += 3;
      if (c.kind === "corner") sc += 2; if (c.ways === 6) sc += 1;
      if (/atype/.test(d) && /christie a/.test(fam)) sc += 3;
      return sc;
    }
    var best = null;
    corners.forEach(function (c) { if (!best || score(c) > score(best)) best = c; });
    return best;
  };

  /** Suggested corner block type id for a rig truss. */
  S.blockFor = function (t) {
    var entry = S.db().trusses.filter(function (x) { return x.id === t.trussId; })[0];
    var c = S.suggestBlock(entry);
    return c ? c.id : S.db().corners[0].id;
  };

  S.newBlock = function (typeId, name) {
    var type = S.db().corners.filter(function (c) { return c.id === typeId; })[0];
    var n = S.rig.trusses.filter(function (t) { return t.isBlock; }).length + 1;
    return { id: id("B"), isBlock: true, name: name || "Block " + n, blockTypeId: typeId, length: S.blockLength(type), weightless: false, wallWeight: 0, trussId: null,
      x: 0, y: 0, angle: 0, loads: [], supports: [] };
  };

  /** Add a corner block as a component of a truss line. spec: {at:"start"} | {at:"end"} | {seg:i, piece:j} (after piece j of segment i; default after all its pieces) | {distance:d}. */
  function insertBlock(host, typeId, spec) {
    ensureManual(host);
    var L = host.layout, blk = S.newBlock(typeId);
    var count = S.rig.trusses.filter(function (b) { return b.isBlock && b.host === host.id; }).length + 1;
    blk.name = host.name + " CB" + count;
    blk.host = host.id;
    var size = blk.length;
    if (spec && typeof spec.distance === "number") insertByDistance(L, blk.id, size, spec.distance, host.addBlocks === false);
    else if (spec && spec.at === "start") { L.order.unshift(blk.id); L.segs.unshift(0); L.pieces.unshift([]); L.sizes[blk.id] = size; }
    else {
      // after piece j of segment i (default: after all of its pieces) - the pieces after it move to the next segment
      var i = spec && typeof spec.seg === "number" ? Math.min(Math.max(spec.seg, 0), L.segs.length - 1) : L.segs.length - 1;
      var here = L.pieces[i] || [], j = spec && typeof spec.piece === "number" ? Math.min(Math.max(spec.piece, 0), here.length) : here.length;
      var first = here.slice(0, j), rest = here.slice(j);
      L.pieces[i] = first; L.segs[i] = r4(sum(first));
      L.order.splice(i, 0, blk.id); L.segs.splice(i + 1, 0, r4(sum(rest))); L.pieces.splice(i + 1, 0, rest); L.sizes[blk.id] = size;
    }
    blk.supports.push({ id: id("s"), name: "part of " + host.name, distance: round(size / 2), kind: "truss", onTruss: host.id, onDistance: 0, fromPlan: true, hardwareWeight: 0 });
    S.rig.trusses.push(blk);
    return blk;
  }
  /** Add a corner block at a measured position on the whole line (from its start, center or end), splitting the run there. */
  S.addBlockAtMeasure = function (tid, typeId, value, from) {
    var t = S.truss(tid);
    if (!t || t.isBlock) return "Pick a truss";
    var type = S.db().corners.filter(function (c) { return c.id === typeId; })[0], half = S.blockLength(type) / 2;
    // measure on the line as it will be once the block is in it (the block adds its own length)
    var L = t.addBlocks === false ? t.length : t.length + 2 * half;
    var d = from === "end" ? L - value : from === "center" ? L / 2 + value : value;
    if (!(d >= half - 1e-9 && d <= L - half + 1e-9)) return "That position is outside the truss: a block center must be between " + round(half) + " and " + round(L - half) + " ft from the start.";
    var r = S.addBlockToLine(tid, typeId, { distance: d });
    return typeof r === "string" ? r : null;
  };

  S.addBlockToLine = function (tid, typeId, spec) {
    var host = S.truss(tid);
    if (!host || host.isBlock) return "Pick a truss";
    var blk = insertBlock(host, typeId, spec || { at: "end" });
    S.commit();
    return blk;
  };

  /** The trusses whose position a truss follows (the truss carrying its block, or the truss it was pulled onto). */
  function parentsOf(T) {
    if (!T || !T.anchor) return [];
    var an = T.anchor;
    if (an.reverse) { var y = S.truss(an.reverse.truss); return y ? [y] : []; }
    var b = S.truss(an.block), h = b && S.truss(b.host || (b.attach && b.attach.b));
    return h ? [h] : [];
  }
  /** Does A's position depend (however indirectly) on B? */
  function dependsOn(A, B) {
    var stack = [A], seen = {};
    for (var n = 0; stack.length && n < 400; n++) {
      var t = stack.pop();
      if (!t || seen[t.id]) continue;
      seen[t.id] = true;
      if (t !== A && t.id === B.id) return true;
      parentsOf(t).forEach(function (p) { stack.push(p); });
    }
    return false;
  }
  /** Would anchoring X to this block make X depend on itself? */
  function anchorCycle(X, blk) {
    var h = S.truss(blk.host || (blk.attach && blk.attach.b));
    return !!h && (h.id === X.id || dependsOn(h, X));
  }

  /** Bolt truss X to a corner block at 90 degrees to the truss that carries it. Position and angle then follow the block. */
  function bolt(X, blk, mode, side) {
    var G = TLA.rig.geometry, host = S.truss(blk.host || (blk.attach && blk.attach.b));
    if (!host) return "That corner block has no truss";
    if (host.id === X.id) return X.name + " already carries that corner block";
    if (X.isBlock) return "Corner blocks cannot be bolted to blocks";
    var hostAngle = host.angle || 0;
    var rel = ((((X.angle || 0) - hostAngle) % 180) + 180) % 180;
    var already = X.supports.some(function (s) { return s.kind === "truss" && s.onTruss === blk.id; });
    if (already) return X.name + " is already bolted to " + blk.name;
    var cc = G.endPoint(blk, blk.length / 2);
    var anchoring = !X.anchor && !anchorCycle(X, blk);
    // closing a loop: X is already placed, and the truss that carries this block is free-standing, so it is pulled onto X
    var reversing = !anchoring && !host.anchor && host.id !== X.id && !dependsOn(X, host);
    if (!anchoring && !reversing && Math.abs(rel - 90) > 0.5) {
      return "Trusses bolt together at 90 degrees. " + X.name + " is at " + Math.round(rel) + " degrees to " + host.name + ", so it cannot bolt to " + blk.name + ".";
    }
    if (anchoring) {
      var delta = ((((X.angle || 0) - hostAngle + 180) % 360) + 360) % 360 - 180;
      var rot = delta > 0 || delta === 0 ? 90 : -90;
      var p0 = G.project(X, cc), L = X.length;
      if (!mode || mode === "auto") {
        if (Math.abs(p0.offset) <= 0.75 && p0.distance > blk.length + 0.5 && p0.distance < L - blk.length - 0.5) mode = "through";
        else {
          var s = G.endPoint(X, 0), e = G.endPoint(X, L);
          mode = Math.hypot(s.x - cc.x, s.y - cc.y) <= Math.hypot(e.x - cc.x, e.y - cc.y) ? "start" : "end";
        }
      }
      // side: which way the truss extends from the block. "north" / "south" / "east" / "west" are plan directions (the
      // truss must be square to its carrier, so only the two directions across the carrier are possible); "left" / "right"
      // are relative to the carrier's own direction.
      var compass = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] }[side];
      if (compass) {
        var ha = hostAngle * Math.PI / 180, dot = compass[0] * -Math.sin(ha) + compass[1] * Math.cos(ha);
        if (Math.abs(dot) < 0.9) return "A truss bolted to " + host.name + " can only go across it - " + side + " is along " + host.name + ". Pick the other pair of directions.";
        if (mode === "through") rot = dot > 0 ? 90 : -90;
        else side = dot > 0 ? "left" : "right";
      }
      if ((side === "left" || side === "right") && mode !== "through") rot = ((side === "left") === (mode === "start")) ? 90 : -90;
      X.anchor = { block: blk.id, mode: mode, rot: rot, d: mode === "through" ? round(Math.min(Math.max(p0.distance, blk.length / 2), Math.max(L - blk.length / 2, blk.length / 2))) : undefined };
    }
    var pd = G.project(X, cc).distance, zn = blk.length + 0.5;
    var meets = anchoring ? mode : (pd < zn ? "start" : pd > X.length - zn ? "end" : "through");
    var sup = { id: id("s"), name: "bolted to " + blk.name, end: meets, distance: meets === "start" ? 0 : meets === "end" ? X.length : round(pd), kind: "truss", onTruss: blk.id, onDistance: round(blk.length / 2), fromPlan: true, hardwareWeight: 0 };
    X.supports.push(sup);
    if (reversing) {
      var dl = ((((host.angle || 0) - (X.angle || 0) + 180) % 360) + 360) % 360 - 180;
      var pY = G.project(X, cc).distance, zone = blk.length + 0.5;
      var ymode = pY < zone ? "start" : pY > X.length - zone ? "end" : "through";
      host.anchor = { block: blk.id, mode: "reverse", rot: dl >= 0 ? 90 : -90, reverse: { truss: X.id, support: sup.id, mode: ymode, d: ymode === "through" ? round(pY) : undefined } };
    }
    return null;
  }
  S.boltToBlock = function (tid, blockId, mode, side) {
    var X = S.truss(tid), blk = S.truss(blockId);
    if (!X || !blk) return "Pick a corner block";
    var err = bolt(X, blk, mode, side);
    if (!err) S.commit();
    return err;
  };
  /** Which side of its carrying truss a bolted truss extends to: "left" / "right" looking along the carrier. */
  S.boltSide = function (tid) {
    var X = S.truss(tid); if (!X || !X.anchor || X.anchor.mode === "through" || X.anchor.mode === "reverse") return null;
    return ((X.anchor.rot === 90) === (X.anchor.mode === "start")) ? "left" : "right";
  };
  function compassOf(dx, dy) {
    if (Math.hypot(dx, dy) < 1e-6) return null;
    if (Math.abs(dy) > 0.9 * Math.hypot(dx, dy)) return dy > 0 ? "north" : "south";
    if (Math.abs(dx) > 0.9 * Math.hypot(dx, dy)) return dx > 0 ? "east" : "west";
    return null;
  }
  /** Plan direction a bolted truss extends from its block ("north" ... "west"), or null when it is on a diagonal. */
  S.boltDirection = function (tid) {
    var X = S.truss(tid); if (!X || !X.anchor) return null;
    var blk = S.truss(X.anchor.block); if (!blk) return null;
    var G = TLA.rig.geometry, c = G.endPoint(blk, blk.length / 2), m = G.endPoint(X, X.length / 2);
    return compassOf(m.x - c.x, m.y - c.y);
  };
  /** Where a corner block sits on its truss, in words: "north end of West", "12 ft from the west end of North"... */
  S.blockWhere = function (b) {
    var host = S.truss(b.host || (b.attach && b.attach.b)); if (!host) return "";
    var G = TLA.rig.geometry, mid = G.endPoint(host, host.length / 2), c = G.endPoint(b, b.length / 2);
    var s0 = b.supports.filter(function (x) { return x.kind === "truss" && x.onTruss === host.id; })[0];
    var d = s0 ? s0.onDistance : host.length / 2, a = G.endPoint(host, 0), z = G.endPoint(host, host.length);
    var nameStart = compassOf(a.x - mid.x, a.y - mid.y), nameEnd = compassOf(z.x - mid.x, z.y - mid.y);
    var near = Math.min(d, host.length - d), atStart = d <= host.length - d;
    var end = atStart ? nameStart : nameEnd;
    if (near <= 2.5) return (end ? end + " end" : atStart ? "start" : "end") + " of " + host.name;
    if (Math.abs(d - host.length / 2) < 1.5) return "middle of " + host.name;
    return (Math.round(near * 10) / 10) + " ft from the " + (end ? end + " end" : atStart ? "start" : "end") + " of " + host.name;
  };

  /** Swing the bolted truss to the other side of the truss that carries the block (same end stays at the block). */
  S.flipBolt = function (tid) {
    var X = S.truss(tid); if (!X || !X.anchor) return;
    X.anchor.rot = -(X.anchor.rot || 90); S.commit();
  };
  /** Bolt the other end of the truss to the block, keeping it on the same side. */
  S.swapBoltEnd = function (tid) {
    var X = S.truss(tid); if (!X || !X.anchor || X.anchor.mode === "through" || X.anchor.mode === "reverse") return;
    X.anchor.mode = X.anchor.mode === "start" ? "end" : "start"; X.anchor.rot = -(X.anchor.rot || 90); S.commit();
  };

  /** Unbolt a truss from the corner block it is anchored to (it keeps its current position). */
  S.unbolt = function (tid) {
    var X = S.truss(tid);
    if (!X || !X.anchor) return;
    if (X.anchor.reverse) {
      var Yr = S.truss(X.anchor.reverse.truss), sid = X.anchor.reverse.support;
      if (Yr) Yr.supports = Yr.supports.filter(function (q) { return q.id !== sid; });
      delete X.anchor; S.commit(); return;
    }
    var bid = X.anchor.block;
    X.supports = X.supports.filter(function (s) { return !(s.kind === "truss" && s.onTruss === bid); });
    delete X.anchor;
    S.commit();
  };
  S.addToBlock = function (tid, blockId) { return S.boltToBlock(tid, blockId, "auto"); };

  /** Convenience: add a corner block to truss B where truss A meets it, and bolt A to it (A must be at 90 degrees to B). */
  S.addBlockConnection = function (aid, bid, typeId) {
    var a = S.truss(aid), b = S.truss(bid);
    if (!a || !b) return "Pick a truss";
    var c = TLA.rig.geometry.crossing(a, b), tol = 0.05;
    if (!c) return "Trusses are parallel - they never cross";
    if (c.onA < -tol || c.onA > a.length + tol || c.onB < -tol || c.onB > b.length + tol) {
      return "The centerlines cross outside one of the trusses (" + c.onA.toFixed(2) + " ft on " + a.name + ", " + c.onB.toFixed(2) + " ft on " + b.name + ")";
    }
    var rel = ((((a.angle || 0) - (b.angle || 0)) % 180) + 180) % 180;
    if (Math.abs(rel - 90) > 0.5) return "Trusses bolt together at 90 degrees - " + a.name + " and " + b.name + " are not square to each other.";
    var blk = insertBlock(b, typeId, { distance: c.onB });
    var size = blk.length, zone = size + 0.5, mode = c.onA < zone ? "start" : c.onA > a.length - zone ? "end" : "through";
    var err = bolt(a, blk, mode);
    if (err) { S.rig.trusses = S.rig.trusses.filter(function (t) { return t.id !== blk.id; }); S.reconnect(); return err; }
    S.commit();
    return null;
  };

  /* ------------------------------------------------------------------ solve / history / persistence */

  S.solve = function () {
    S.results = TLA.rig.solve(S.rig, db());
    S.rig.trusses.forEach(function (t) {
      if (t.isBlock) return;
      t.supports.forEach(function (sp) {
        if (sp.kind !== "truss" || !sp.fromPlan) return;
        var u = S.truss(sp.onTruss); if (!u || !u.isBlock) return;
        var G2 = TLA.rig.geometry, en2 = boltEnd(t, sp, u), p = G2.endPoint(t, centreAlong(t, en2, u, sp.distance)), q = G2.endPoint(u, u.length / 2), off = Math.hypot(p.x - q.x, p.y - q.y);
        if (off > 0.15) S.results.warnings.push({ truss: t.id, message: t.name + " does not meet " + u.name + " (" + S.blockWhere(u) + "): it is " + (Math.round(off * 100) / 100) + " ft off, so the lengths around this loop do not close. Check the pieces." });
      });
    });
    (function () {
      var seen = {};
      S.rig.trusses.forEach(function (X) {
        if (!X.anchor) return;
        var k = X.anchor.block + "|" + S.boltDirection(X.id) + "|" + ((X.angle % 180) + 180) % 180;
        if (S.boltDirection(X.id) && seen[k]) S.results.warnings.push({ truss: X.id, message: X.name + " and " + seen[k] + " are bolted to the same corner block on the same side, so they sit on top of each other. Bolt one of them to a different block or the other side." });
        else if (S.boltDirection(X.id)) seen[k] = X.name;
      });
    })();
    try { TLA.grillage.annotate(S.rig, S.results, db()); } catch (e) { S.results.compat = { ok: false, note: "Whole-rig analysis failed: " + e.message }; }
    return S.results;
  };

  function snapshot() { return JSON.stringify(S.rig); }
  var lastSnap = null;

  S.commit = function (opts) {
    S.reconnect();
    if (!(opts && opts.noUndo)) {
      var cur = lastSnap;
      if (cur != null) { undoStack.push(cur); if (undoStack.length > 100) undoStack.shift(); redoStack.length = 0; }
    }
    lastSnap = snapshot();
    S.persist();
    S.emit();
  };
  S.emit = function () { S.solve(); listeners.forEach(function (f) { f(); }); };
  S.on = function (f) { listeners.push(f); };
  /** Change the selection and redraw, without solving again (the rig did not change). 1.18.0: a load can be selected. */
  S.select = function (o) {
    o = o || {};
    S.sel = { truss: o.truss || null, support: o.support || null, load: o.load || null };
    listeners.forEach(function (f) { f(); });
  };

  S.undo = function () {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    S.rig = JSON.parse(undoStack.pop()); lastSnap = snapshot(); S.persist(); S.emit();
  };
  S.redo = function () {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    S.rig = JSON.parse(redoStack.pop()); lastSnap = snapshot(); S.persist(); S.emit();
  };

  S.persist = function () {
    try {
      localStorage.setItem(KEY, JSON.stringify({ rig: S.rig, userDb: S.userDb, ui: { colorMode: S.ui.colorMode, view: S.ui.view, customPieces: S.ui.customPieces || [] } }));
    } catch (e) { /* storage may be unavailable */ }
  };

  S.setRig = function (rig) {
    S.rig = rig; S.sel = { truss: null, support: null };
    undoStack.length = 0; redoStack.length = 0; lastSnap = null;
    S.commit({ noUndo: true });
  };

  S.newRig = function () { S.setRig(emptyRig()); };

  /** Move the whole rig so the middle of its footprint is at plan 0,0 (1.18.0). Free trusses move; bolted trusses and
   * corner blocks follow them, so the rig keeps its shape. One Undo step. Returns the shift [dx, dy] in ft. */
  S.centerRig = function () {
    var G = TLA.rig.geometry, minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    S.rig.trusses.forEach(function (t) { [0, t.length].forEach(function (d) { var p = G.endPoint(t, d); minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }); });
    if (!isFinite(minx)) return null;
    var dx = round(-(minx + maxx) / 2), dy = round(-(miny + maxy) / 2);
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return [0, 0];
    S.rig.trusses.forEach(function (t) { if (t.isBlock || t.anchor) return; t.x = round((Number(t.x) || 0) + dx); t.y = round((Number(t.y) || 0) + dy); });
    S.commit();
    return [dx, dy];
  };

  S.init = function () {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { saved = null; }
    if (saved && saved.rig && saved.rig.trusses) {
      S.rig = saved.rig;
      if (saved.userDb) S.userDb = saved.userDb;
      if (saved.ui) { S.ui.colorMode = saved.ui.colorMode && saved.ui.colorMode !== "layer" ? saved.ui.colorMode : "util"; /* 1.18.0: no hang-order colouring */ if (saved.ui.view) S.ui.view = saved.ui.view; if (saved.ui.customPieces) S.ui.customPieces = saved.ui.customPieces; }
      lastSnap = null; S.commit({ noUndo: true });
    } else {
      S.rig = emptyRig();
      TLA.samples.box(S);
      S.commit({ noUndo: true });
      S.ui.fit = true;
    }
  };

  S.exportJSON = function () { return JSON.stringify({ format: "truss-grid-analyzer", version: 1, appVersion: TLA.VERSION, rig: S.rig, userDb: S.userDb }, null, 2); };
  S.importJSON = function (text) {
    var o = JSON.parse(text);
    var rig = o.rig || o;
    if (!rig.trusses) throw new Error("Not a rig file");
    if (o.userDb) S.userDb = o.userDb;
    S.setRig(rig);
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
