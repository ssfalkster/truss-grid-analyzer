/* Rig (truss grid) solver: trusses hang from hoists or are bolted to other trusses.
 * Each truss is solved with TLA.beam; reactions at "bolted to truss" connections are injected as point loads
 * on the truss they are bolted to. Fully data driven - any number of trusses / supports / nesting depth.
 *
 * rig = { trusses: [ { id, name, trussId | custom, length, weightless, wallWeight, x, y, angle,
 *                      loads: [ {id, distance, weight, note, mirror} ],
 *                      supports: [ { id, name, distance, kind: 'hoist'|'truss', hoistId, chainLength,
 *                                    onTruss, onDistance, hardwareWeight } ] } ],
 *         settings: { derate: number|null } }
 */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});

  function dbTruss(t, db) {
    if (t.custom) return t.custom;
    var found = (db.trusses || []).filter(function (x) { return x.id === t.trussId; })[0];
    return found || null;
  }
  var PIPE_OD = { "0.5": 0.84, "0.75": 1.05, "1": 1.315, "1.25": 1.66, "1.5": 1.9, "2": 2.375, "2.5": 2.875, "3": 3.5, "4": 4.5 };
  /** Plan width of a truss in inches: user override, else pipe outside diameter (nominal size), else the first dimension in the name (12x12 = 12"). */
  function widthIn(t, entry) {
    if (t && Number(t.widthIn) > 0) return Number(t.widthIn);
    if (entry && Number(entry.widthIn) > 0) return Number(entry.widthIn);
    var d = String((entry && entry.description) || ""), n = entry && entry.units === "metric" ? null : d.match(/(\d+(?:\.\d+)?)/);
    if (!n) return 12;
    if (/pipe/i.test(d)) return PIPE_OD[String(parseFloat(n[1]))] || parseFloat(n[1]) + 0.4;
    return parseFloat(n[1]);
  }
  /** Cross-section in inches for drawing: pipe is round (OD); a truss "AxB" is A wide and B deep (a single number, or a typed width, is square). */
  function sectionIn(t, entry) {
    if (t && t.isBlock) { var b = (t.length || 1) * 12; return { w: b, h: b, round: false }; }
    if (!entry && t) entry = (TLA.data && TLA.data.trusses || []).filter(function (x) { return x.id === t.trussId; })[0];
    var d = String((entry && entry.description) || ""), w = widthIn(t, entry);
    if (/pipe/i.test(d)) return { w: w, h: w, round: true };
    var m = entry && entry.units === "metric" ? null : d.match(/(\d+(?:\.\d+)?)\s*"?\s*x\s*(\d+(?:\.\d+)?)/i);
    var h = m && !(t && Number(t.widthIn) > 0) ? parseFloat(m[2]) : w;
    return { w: w, h: h, round: false };
  }
  function widthFt(t, entry) {
    if (!entry && t && !t.isBlock) entry = (TLA.data && TLA.data.trusses || []).filter(function (x) { return x.id === t.trussId; })[0];
    return widthIn(t, entry) / 12;
  }
  function dbHoist(id, db) {
    return (db.hoists || []).filter(function (h) { return h.id === id; })[0] || (db.hoists || [])[0] || null;
  }

  function dbCorner(t, db) {
    return (db.corners || []).filter(function (x) { return x.id === t.blockTypeId; })[0] || null;
  }

  /** Published weight of a corner block for this rig (variants, plates per connection, or user override). */
  function blockWeight(t, type, waysUsed) {
    if (typeof t.weightOverride === "number") return t.weightOverride;
    if (!type) return 0;
    if (type.base_lb != null) return type.base_lb + (type.per_connection_lb || 0) * waysUsed;
    if (type.variants && type.variants.length) {
      var i = typeof t.variant === "number" ? t.variant : Math.floor(type.variants.length / 2);
      return type.variants[Math.min(Math.max(i, 0), type.variants.length - 1)][1];
    }
    return type.weight_lb == null ? 0 : type.weight_lb;
  }

  /** How many block faces are used: 1 for a truss ending at the block, 2 for one running through it. */
  function faces(dist, length) { return dist < 0.01 || dist > length - 0.01 ? 1 : 2; }

  var SLACK_TOL = 0.01;   // lb - a hoist reaction below -SLACK_TOL is a pushing (slack) chain

  function solve(rig, dbIn, opts) {
    opts = opts || {};
    var db = dbIn || TLA.data || {};
    var settings = rig.settings || {};
    var warnings = [], slackSet = {}, unstable = [];
    var byId = {};
    rig.trusses.forEach(function (t) { byId[t.id] = t; });

    // corner block faces in use
    var ways = {};
    rig.trusses.forEach(function (t) { if (t.isBlock) ways[t.id] = 0; });
    rig.trusses.forEach(function (t) {
      (t.supports || []).forEach(function (s) {
        if (s.kind !== "truss") return;
        var u = byId[s.onTruss];
        if (u && u.isBlock) ways[u.id] += s.end ? (s.end === "through" ? 2 : 1) : faces(Number(s.distance) || 0, t.length);
        if (t.isBlock && u) { var od = Number(s.onDistance) || 0, hs = t.length / 2 + 0.01; ways[t.id] += (od <= hs || od >= u.length - hs) ? 1 : 2; }
      });
    });

    // dependency graph: feeder -> target
    var feeders = {}, targets = {};
    rig.trusses.forEach(function (t) { feeders[t.id] = []; targets[t.id] = []; });
    rig.trusses.forEach(function (t) {
      (t.supports || []).forEach(function (s) {
        if (s.kind !== "truss") return;
        if (!byId[s.onTruss]) { warnings.push({ truss: t.id, message: t.name + ": support '" + (s.name || s.id) + "' is bolted to a truss that does not exist" }); return; }
        if (s.onTruss === t.id) { warnings.push({ truss: t.id, message: t.name + ": a truss cannot be bolted to itself" }); return; }
        if (feeders[s.onTruss].indexOf(t.id) < 0) feeders[s.onTruss].push(t.id);
        if (targets[t.id].indexOf(s.onTruss) < 0) targets[t.id].push(s.onTruss);
      });
    });

    // Kahn topological order (feeders solved before the trusses they are bolted to)
    var pending = {}, queue = [], order = [];
    rig.trusses.forEach(function (t) { pending[t.id] = feeders[t.id].length; if (pending[t.id] === 0) queue.push(t.id); });
    while (queue.length) {
      var id = queue.shift();
      order.push(id);
      targets[id].forEach(function (tg) { if (--pending[tg] === 0) queue.push(tg); });
    }
    var unsolved = rig.trusses.filter(function (t) { return order.indexOf(t.id) < 0; }).map(function (t) { return t.id; });
    var cycles = unsolved.length ? findCycles(unsolved, targets) : [];
    if (unsolved.length) {
      warnings.push({ message: "Load-path loop or dependency on a loop: " + unsolved.map(function (i) { return byId[i].name; }).join(", ") +
        ". Give each truss in the loop a hoist support (or break the loop) so loads can flow to hoists." });
    }

    // layers: leaf trusses = 1, a truss carrying others is 1 + deepest feeder
    var layer = {};
    order.forEach(function (id2) {
      var l = 1;
      feeders[id2].forEach(function (f) { if (layer[f] != null) l = Math.max(l, layer[f] + 1); });
      layer[id2] = l;
    });

    var corner = cornerRules(rig, db, ways);
    corner.warnings.forEach(function (w) { warnings.push(w); });

    var results = {}, hoists = [], applied = 0, hoistReaction = 0;

    order.forEach(function (id3) {
      var t = byId[id3], blk = null;
      var truss;
      if (t.isBlock) {
        var ctype = dbCorner(t, db), bw = blockWeight(t, ctype, ways[t.id]);
        blk = { type: ctype, weight: bw, waysUsed: ways[t.id], waysAvailable: ctype ? ctype.ways : null };
        truss = { weight_per_ft_lb: bw / (t.length || 1), max_span_ft: 0, udl_lb: [], cpl_lb: [], repetitive_use: true };
        if (!ctype) warnings.push({ truss: t.id, message: t.name + ": corner block type not found in database" });
        else if (ctype.weight_lb == null && !ctype.variants && ctype.base_lb == null && typeof t.weightOverride !== "number") warnings.push({ truss: t.id, message: t.name + ": " + ctype.name + " weight is not published - enter your own" });
        if (ctype && blk.waysUsed > ctype.ways) warnings.push({ truss: t.id, message: t.name + ": " + blk.waysUsed + " truss ends bolted to a " + ctype.ways + "-way block" });
      } else truss = dbTruss(t, db);
      if (!truss) { warnings.push({ truss: t.id, message: t.name + ": truss type not found in database" }); return; }
      var supports = t.supports || [];
      if (!supports.length) { warnings.push({ truss: t.id, message: t.name + ": has no supports" }); return; }

      var loads = (t.loads || []).map(function (l) { return { distance: l.distance, weight: l.weight, note: l.note, mirror: l.mirror, id: l.id }; });
      var injected = [];
      feeders[t.id].forEach(function (fid) {
        var fr = results[fid];
        if (!fr) return;
        fr.supports.forEach(function (sr) {
          if (sr.support.kind === "truss" && sr.support.onTruss === t.id) {
            var wgt = sr.reaction + (Number(sr.support.hardwareWeight) || 0);
            var inj = { distance: Number(sr.support.onDistance) || 0, weight: wgt, note: "from " + byId[fid].name, source: { truss: fid, support: sr.support.id }, injected: true };
            injected.push(inj);
            loads.push(inj);
          }
        });
      });

      // A chain can only pull. A hoist that comes out pushing (negative reaction) has a slack chain: take it out and
      // solve again, most negative first, until every hoist pulls. Bolted connections carry tension and always stay.
      // opts.slack fixes the slack set instead (keeps attribution's superposition linear).
      var slack = {}, forced = opts.slack;
      if (forced) supports.forEach(function (s) { if (forced[t.id + ":" + s.id]) slack[s.id] = true; });
      function solveBeam() {
        var act = supports.filter(function (s) { return !slack[s.id]; });
        var b = TLA.beam.solve({
          length: t.length, supports: act.map(function (s) { return s.distance; }), loads: loads,
          trussWeightPerFt: truss.weight_per_ft_lb, wallWeight: t.wallWeight, weightless: t.weightless
        });
        b.active = act;
        return b;
      }
      var beam = solveBeam();
      while (!forced && beam.active.length > 1) {
        var worst = null, least = -SLACK_TOL;
        beam.active.forEach(function (s, i) { if (s.kind === "hoist" && beam.reactions[i] < least) { least = beam.reactions[i]; worst = s; } });
        if (!worst) break;
        slack[worst.id] = true;
        beam = solveBeam();
      }
      var slackIds = Object.keys(slack);
      slackIds.forEach(function (sid) { slackSet[t.id + ":" + sid] = true; });
      var reactionOf = {};
      beam.active.forEach(function (s, i) { reactionOf[s.id] = beam.reactions[i]; });
      var held = beam.positions.length;              // distinct support positions still carrying load
      var isUnstable = held < 2 && supports.length > 1 && !t.isBlock;
      if (isUnstable) {
        unstable.push(t.id);
        warnings.unshift({ truss: t.id, level: "unstable", message: t.name + ": unstable - " + (slackIds.length ? "once the slack hoist" + (slackIds.length > 1 ? "s are" : " is") + " taken out, " : "") +
          "only one support point is left, so the truss would tip. Add a hoist or bolted support, or move the load." });
      }
      var limits = t.isBlock ? { derate: 1, maxSpan: 0, maxCantilever: 0, segments: [], worstCode: 0, ok: true }
        : TLA.limits.checkTruss(truss, beam, t.wallWeight, { derate: typeof settings.derate === "number" ? settings.derate : undefined, cantileverSelfWeight: TLA.limits.countSelfWeight(settings) });

      var own = (t.loads || []).reduce(function (a, l) { return a + (Number(l.weight) || 0) * (l.mirror && Math.abs(l.distance - beam.length / 2) > 1e-7 ? 2 : 1); }, 0);
      applied += own + beam.wSelf * beam.length + (Number(t.wallWeight) || 0);
      // hardware weight at a bolted connection is injected on the connected truss, so count it once here
      supports.forEach(function (s) { if (s.kind === "truss") applied += Number(s.hardwareWeight) || 0; });

      var srs = supports.map(function (s) {
        var isSlack = !!slack[s.id], reaction = isSlack ? 0 : reactionOf[s.id];
        var rec = { support: s, reaction: reaction, slack: isSlack };
        if (s.kind === "hoist") {
          rec.hoist = TLA.limits.checkHoist(dbHoist(s.hoistId, db), s.chainLength, reaction, s.hardwareWeight, s.dlf, settings.defaultDlf, settings.addPercent);
          if (isSlack) { rec.hoist.status = "Slack"; rec.hoist.slack = true; }
          else if (isUnstable) rec.hoist.status = "UNSTABLE";      // the truss tips: this number means nothing
          hoistReaction += reaction;
          hoists.push({ truss: t.id, trussName: t.name, support: s.id, supportName: s.name, layer: layer[t.id], distance: s.distance, reaction: reaction, slack: isSlack, hoist: rec.hoist });
        }
        return rec;
      });

      results[t.id] = { truss: t.id, name: t.name, layer: layer[t.id], beam: beam, limits: limits, supports: srs, injected: injected, dbTruss: truss, block: blk };
      if (!t.isBlock) beam.warnings.forEach(function (m) { warnings.push({ truss: t.id, message: t.name + ": " + m }); });
      limits.segments.forEach(function (s) {
        if (s.code) warnings.push({ truss: t.id, kind: "segment", message: t.name + ": " + describeSeg(s) + " - " + TLA.limits.statusText(s.status) });
      });
      var mb = limits.member;
      if (mb && mb.code) warnings.push({ truss: t.id, kind: "member", level: "member", message: t.name + ": " + TLA.limits.memberMessage(mb) });
    });

    hoists.forEach(function (h) {
      if (h.slack) warnings.push({ truss: h.truss, kind: "hoist", level: "slack", message: h.trussName + " " + (h.supportName || "hoist") + " at " + (Math.round(h.distance * 10) / 10) + " ft: slack - the load would push this hoist up, so its chain goes slack and it carries nothing (only the hoist and chain weight). The other supports carry the load; the results shown are with this hoist taken out." });
      else if (h.hoist.status !== "Good" && h.hoist.status !== "UNSTABLE") warnings.push({ truss: h.truss, kind: "hoist", message: h.trussName + " " + (h.supportName || "hoist") + ": " + TLA.limits.statusText(h.hoist.status) + " (" + Math.round(h.hoist.staticLoad) + " lb static)" });
      else if (h.hoist.dynamicOver) warnings.push({ truss: h.truss, kind: "hoist", message: h.trussName + " " + (h.supportName || "hoist") + ": dynamic load exceeds capacity" });
    });

    mfgCheck(rig, db, results, settings).forEach(function (w) { warnings.push(w); });
    var bolts = boltFamilies(rig, db);
    bolts.forEach(function (b) { warnings.push({ truss: b.truss, kind: "bolt", level: b.level === "warn" ? "bolt" : "note", message: b.message }); });

    var totals = hoists.reduce(function (a, h) {
      a.staticLoad += h.hoist.staticLoad; a.dynamicLoad += h.hoist.dynamicLoad; a.hoistChain += h.hoist.hoistChain; a.count++;
      return a;
    }, { staticLoad: 0, dynamicLoad: 0, hoistChain: 0, count: 0 });
    totals.applied = applied;
    totals.hoistReaction = hoistReaction;

    return { order: order, layers: layer, trusses: results, hoists: hoists, totals: totals, warnings: warnings, cycles: cycles, unsolved: unsolved, slack: slackSet, unstable: unstable, bolts: bolts };
  }

  function describeSeg(s) {
    if (s.type === "span") return "Span " + s.index;
    return s.type === "cantilever-left" ? "Left cantilever" : "Right cantilever";
  }

  function findCycles(nodes, targets) {
    var set = {}; nodes.forEach(function (n) { set[n] = true; });
    var cycles = [], state = {}, stack = [];
    function dfs(n) {
      state[n] = 1; stack.push(n);
      (targets[n] || []).forEach(function (m) {
        if (!set[m]) return;
        if (state[m] === 1) cycles.push(stack.slice(stack.indexOf(m)));
        else if (!state[m]) dfs(m);
      });
      stack.pop(); state[n] = 2;
    }
    nodes.forEach(function (n) { if (!state[n]) dfs(n); });
    return cycles;
  }

  /* ---- plan geometry helpers (feet, angle in degrees, y up) ---- */
  function endPoint(t, d) {
    var a = (Number(t.angle) || 0) * Math.PI / 180;
    return { x: (Number(t.x) || 0) + d * Math.cos(a), y: (Number(t.y) || 0) + d * Math.sin(a) };
  }
  /** Distance along truss t of the projection of point p, and the perpendicular offset. */
  function project(t, p) {
    var a = (Number(t.angle) || 0) * Math.PI / 180;
    var dx = p.x - (Number(t.x) || 0), dy = p.y - (Number(t.y) || 0);
    return { distance: dx * Math.cos(a) + dy * Math.sin(a), offset: -dx * Math.sin(a) + dy * Math.cos(a) };
  }
  /** Where the centerlines of two trusses cross (null if parallel). Returns distances along each. */
  function crossing(a, b) {
    var ta = (Number(a.angle) || 0) * Math.PI / 180, tb = (Number(b.angle) || 0) * Math.PI / 180;
    var ax = Math.cos(ta), ay = Math.sin(ta), bx = Math.cos(tb), by = Math.sin(tb);
    var den = ax * by - ay * bx;
    if (Math.abs(den) < 1e-9) return null;
    var dx = (Number(b.x) || 0) - (Number(a.x) || 0), dy = (Number(b.y) || 0) - (Number(a.y) || 0);
    var da = (dx * by - dy * bx) / den;
    var db2 = (dx * ay - dy * ax) / den;
    return { onA: da, onB: db2, point: endPoint(a, da) };
  }


  /* ------------------------------------------------------------------ bolted parts must be one truss family
   * Bolted truss and corner blocks only mate within one manufacturer's truss family (plates, bolt patterns and
   * spigots differ even at the same nominal size): JTE 12x12 does not bolt to Christie A Type. Stacking on top /
   * clamping below (support.mount) works across families and is not checked. Branded parts that don't match are
   * warned about; generic, universal and custom parts can't be checked, so they get a note - except a generic or
   * universal truss bolted to a branded part, which is warned about. Never blocks anything. */

  var UNBRANDED = /^(generic|universal|custom)$/;
  function makerKey(m) {
    var s = String(m || "").trim().toLowerCase();
    if (/^(jte|james thomas)/.test(s)) return "jte";
    return s.split(/\s+/)[0] || "custom";
  }
  function sizeKey(s) {
    s = String(s || "").toLowerCase();
    if (/pre-?rig|\bprt\b/.test(s)) return "prerig";
    var tri = s.match(/(\d+(?:\.\d+)?)\s*"?\s*(?:tri|triangle)/);
    if (tri) return parseFloat(tri[1]) + "tri";
    var sq = s.match(/(\d+(?:\.\d+)?)\s*"?\s*x\s*(\d+(?:\.\d+)?)/);
    return sq ? parseFloat(sq[1]) + "x" + parseFloat(sq[2]) : null;
  }
  /** The family of one rig part: a truss (its database model) or a corner block (its maker's truss family); `fam` is the
   * database's product-line key (family_key), shared by every entry of one line (e.g. the workbook's and the maker's own
   * Christie A Type data). */
  function partFamily(t, db) {
    if (t.isBlock) {
      var c = dbCorner(t, db);
      if (!c) return { block: true, branded: false, generic: false, label: "unknown block type" };
      var mk = makerKey(c.manufacturer);
      return { block: true, maker: mk, branded: !c.custom && !UNBRANDED.test(mk), generic: false, type: c, fam: c.family_key || null,
        label: (mk !== "jte" && c.family.toLowerCase().indexOf(mk) === 0 ? "" : (mk === "jte" ? "JTE" : c.manufacturer) + " ") + c.family + " block" };
    }
    var e = dbTruss(t, db);
    if (!e) return { block: false, branded: false, generic: false, label: "unknown truss" };
    var m = makerKey(e.manufacturer), custom = !!t.custom || e.source === "User";
    return { block: false, maker: m, branded: !custom && !UNBRANDED.test(m), generic: !custom && /^(generic|universal)$/.test(m), entry: e, fam: e.family_key || null,
      label: (e.manufacturer || "Custom") + " " + String(e.description || "").trim() };
  }
  /** Does a branded truss model belong to the same family as a branded block of the same maker? null = can't tell. */
  function trussFitsBlock(e, c) {
    var d = String(e.description || ""), f = String(c.family || "");
    if (makerKey(e.manufacturer) === "christie") {
      var a = (d.match(/\b([A-H]) Type\b/i) || d.match(/\bType ([A-H])\b/i) || [])[1], b = (f.match(/\b([A-H]) Type\b/i) || [])[1];
      return a && b ? a.toUpperCase() === b.toUpperCase() : null;
    }
    var ts = sizeKey(d), bs = c.fits === "prerig" ? "prerig" : sizeKey(c.fits) || sizeKey(f);
    if (!ts || !bs) return null;
    if (ts !== bs) return false;
    if (makerKey(e.manufacturer) === "jte") return /supertruss/i.test(d) === /supertruss/i.test(f);
    return null;
  }
  /** "warn" / "note" / null for one bolted pair, with the reason. */
  function familyVerdict(A, B) {
    if (!A.block && !B.block && A.entry === B.entry) return null;          // one model bolts to itself
    if (!A.branded || !B.branded) {
      if ((A.generic && B.branded) || (B.generic && A.branded)) return { level: "warn", why: "a generic or universal truss does not bolt to branded truss parts" };
      return { level: "note", why: "generic, universal or custom parts - the app can't check that they bolt together; make sure they are the same truss family" };
    }
    if (A.maker !== B.maker) return { level: "warn", why: "different manufacturers' truss parts don't bolt together, even at the same size" };
    // the database's product-line key (family_key) decides when both parts have one; names are the fallback
    if (A.fam && B.fam) return A.fam === B.fam ? null : { level: "warn", why: A.block !== B.block ? "the corner block is from a different truss family" : "different truss families don't bolt together" };
    if (A.block && B.block) return A.type.family === B.type.family ? null : { level: "warn", why: "different truss families don't bolt together" };
    if (!A.block && !B.block) return A.entry === B.entry ? null : { level: "warn", why: "different truss models don't bolt together" };
    var fit = trussFitsBlock((A.block ? B : A).entry, (A.block ? A : B).type);
    if (fit === false) return { level: "warn", why: "the corner block is from a different truss family" };
    if (fit === null) return { level: "note", why: "the app can't tell whether this block is from the same truss family - check it" };
    return null;
  }
  function boltFamilies(rig, db) {
    var byId = {}, out = [], seen = {};
    rig.trusses.forEach(function (t) { byId[t.id] = t; });
    rig.trusses.forEach(function (t) {
      (t.supports || []).forEach(function (s) {
        if (s.kind !== "truss" || s.mount) return;                 // stacked / clamped: any family
        var u = byId[s.onTruss];
        if (!u || u === t) return;
        var key = [t.id, u.id].sort().join("|");
        if (seen[key]) return;
        seen[key] = true;
        var A = partFamily(t, db), B = partFamily(u, db);
        if (!(A.entry || A.type) || !(B.entry || B.type)) return;   // unknown type: warned about elsewhere
        var v = familyVerdict(A, B);
        // a custom block says nothing: compare the truss with the run the block sits in
        if (v && v.level === "note" && !t.isBlock && u.isBlock && !B.branded && u.host && byId[u.host] && u.host !== t.id) {
          var H = partFamily(byId[u.host], db), vh = familyVerdict(A, H);
          if (vh && vh.level === "warn") { v = vh; B = { label: B.label + " in " + byId[u.host].name + " (" + H.label + ")" }; }
        }
        if (v) out.push({ truss: t.id, support: s.id, onTruss: u.id, level: v.level,
          message: t.name + " (" + A.label + ") is bolted to " + u.name + " (" + B.label + "): " + v.why + (v.level === "warn" ? ". Use matching parts, or stack / clamp it instead." : ".") });
      });
    });
    return out;
  }

  /* ------------------------------------------------------------------ corner-block rules from the maker (1.11.0)
   * A block type may carry `rules` from its maker's corner-block data (so far Christie Lites A Type):
   *   boxEveryCorner - "when using the 90-degree corner block to create box trusses, the box truss structure must be
   *                    supported at every corner": blocks on a closed loop of bolted truss with no hoist at them are
   *                    warned about (one warning per box);
   *   unsupported    - [[sections, factor], ...]: the maker allows only that share of the truss table capacity where an
   *                    unsupported block joins that many truss sections or more (1/2 at 4 sections; hubs 1/3 at 6).
   * Owner's call (2026-09-23): these only WARN that the rig is outside the maker's corner-block rules - every check and
   * result is shown exactly as without them.
   * "At" the block: a hoist on the block, on the truss it sits in within its footprint + 6", or on a bolted truss within
   * 6" of the bolted end. */
  var AT_BLOCK = 0.5;
  function cornerRules(rig, db, ways) {
    var byId = {}, adj = {}, out = { warnings: [] };
    rig.trusses.forEach(function (t) { byId[t.id] = t; adj[t.id] = []; });
    rig.trusses.forEach(function (t) {
      (t.supports || []).forEach(function (s) {
        if (s.kind !== "truss" || s.mount || !byId[s.onTruss] || s.onTruss === t.id) return;
        adj[t.id].push(s.onTruss); adj[s.onTruss].push(t.id);
      });
    });
    function onLoop(id) {                                    // is there a path between two neighbours that avoids the block?
      var nb = adj[id].filter(function (x, i, a) { return a.indexOf(x) === i; });
      if (nb.length < 2) return false;
      var seen = {}; seen[id] = true; seen[nb[0]] = true;
      var q = [nb[0]];
      while (q.length) {
        var c = q.shift();
        for (var i = 0; i < adj[c].length; i++) {
          var n = adj[c][i];
          if (seen[n]) continue;
          if (nb.indexOf(n) > 0) return true;
          seen[n] = true; q.push(n);
        }
      }
      return false;
    }
    function componentKey(id) {
      var seen = {}, q = [id]; seen[id] = true;
      while (q.length) adj[q.shift()].forEach(function (n) { if (!seen[n]) { seen[n] = true; q.push(n); } });
      return Object.keys(seen).sort()[0];
    }
    function hoistNear(t, d, tol) { return (t.supports || []).some(function (h) { return h.kind === "hoist" && Math.abs((Number(h.distance) || 0) - d) <= tol + 1e-6; }); }
    var boxes = {}, order = [];
    rig.trusses.forEach(function (b) {
      if (!b.isBlock) return;
      var c = dbCorner(b, db), rules = c && c.rules;
      if (!rules) return;
      var meets = [];                                        // every truss meeting the block, and where along it
      (b.supports || []).forEach(function (s) { if (s.kind === "truss" && !s.mount && byId[s.onTruss]) meets.push({ t: byId[s.onTruss], d: Number(s.onDistance) || 0, host: true }); });
      rig.trusses.forEach(function (u) {
        (u.supports || []).forEach(function (s) { if (s.kind === "truss" && !s.mount && s.onTruss === b.id) meets.push({ t: u, d: Number(s.distance) || 0 }); });
      });
      var supported = hoistNear(b, b.length / 2, b.length) || meets.some(function (m) { return hoistNear(m.t, m.d, (m.host ? b.length / 2 : 0) + AT_BLOCK); });
      if (supported) return;
      if (rules.boxEveryCorner && onLoop(b.id)) {
        var key = componentKey(b.id);
        if (!boxes[key]) { boxes[key] = []; order.push(key); }
        boxes[key].push(b);
      }
      var n = ways[b.id] || 0, f = 1;
      (rules.unsupported || []).forEach(function (r) { if (n >= r[0]) f = Math.min(f, r[1]); });
      if (f < 1) {
        out.warnings.push({ truss: b.id, kind: "corner", level: "corner", message: b.name + ": " + c.name + " joining " + n + " truss sections with no hoist at it. The maker's corner-block data (" + c.manufacturer +
          ") allows only " + (Math.abs(f - 0.5) < 1e-9 ? "half" : Math.abs(f - 1 / 3) < 1e-9 ? "a third" : Math.round(f * 100) + "%") +
          " of the truss table capacity for the trusses meeting it there - the checks shown here use the full table capacity. Put a hoist at the block, or have it reviewed by a qualified person." });
      }
    });
    order.forEach(function (k) {
      var bl = boxes[k];
      out.warnings.push({ truss: bl[0].id, kind: "corner", level: "corner", message: "Box truss: outside the manufacturer's corner-block rules - a box built with 90-degree corner blocks must be supported at every corner, and " +
        bl.length + " of its corner blocks " + (bl.length === 1 ? "has" : "have") + " no hoist at " + (bl.length === 1 ? "it" : "them") + " (" + bl.map(function (b) { return b.name; }).join(", ") +
        "). The results shown do not account for this. Hang a hoist at each corner block, or have the rig reviewed by a qualified person." });
    });
    return out;
  }

  /* ------------------------------------------------------------------ workbook data vs the maker's own table
   * Some Truss Load Analyzer workbook rows (source TLA) allow more than the manufacturer's current table for the same
   * product line (family_key). For each truss on a TLA row, every span and cantilever it actually has is looked up in
   * both (after the repetitive-use derate, as the checks use them); where the maker's table is lower, warn and name
   * the maker's row. The TLA numbers are still what the checks use - switching the truss is the rigger's call. */
  function mfgCheck(rig, db, results, settings) {
    var out = [], trusses = db.trusses || [];
    rig.trusses.forEach(function (t) {
      var e = t.isBlock || t.custom ? null : dbTruss(t, db), r = results[t.id];
      if (!e || e.source !== "TLA" || !e.family_key || !r) return;
      var mfg = trusses.filter(function (x) { return x.source === "MFG" && x.family_key === e.family_key; });
      if (!mfg.length) return;
      var ov = typeof settings.derate === "number" ? settings.derate : undefined;
      function cap(x, kind, L) { return TLA.limits.tableAt(x, kind, L) * TLA.limits.derate(x, ov); }
      var worst = null;
      r.limits.segments.forEach(function (sg) {
        if (sg.skipped || !(sg.length > 0)) return;
        var cant = sg.type !== "span", L = cant ? sg.length * 4 : sg.length;
        (cant ? ["cpl"] : ["cpl", "udl"]).forEach(function (kind) {
          var a = cap(e, kind, L);
          mfg.forEach(function (m) {
            var b = cap(m, kind, L);
            if (a > 0 && b < a * 0.995 && (!worst || b / a < worst.ratio))
              worst = { ratio: b / a, m: m, kind: kind, a: a, b: b, seg: sg };
          });
        });
      });
      if (!worst) return;
      var sg = worst.seg, where = (sg.type === "span" ? "span " + sg.index : sg.type === "cantilever-left" ? "left cantilever" : "right cantilever") + " (" + (Math.round(sg.length * 10) / 10) + " ft)";
      out.push({ truss: t.id, kind: "data", level: "data", message: t.name + ": its truss data is from the Truss Load Analyzer workbook, and the manufacturer's own table (" +
        worst.m.description + ") allows less on its " + where + ": " + (worst.kind === "udl" ? "uniform load " : "point load ") + Math.round(worst.b) + " lb against the workbook's " +
        Math.round(worst.a) + " lb. The checks still use the workbook's numbers - switch this truss to the manufacturer's row." });
    });
    return out;
  }

  /** Where does a hoist's load come from? Superposition: solve with only one truss' own weights active at a time. */
  function attribution(rig, dbIn, trussId, supportId) {
    var db = dbIn || TLA.data || {};
    function pick(res) { return res.hoists.filter(function (h) { return h.truss === trussId && h.support === supportId; })[0]; }
    var base = solve(rig, db), target = pick(base);
    if (!target) return null;
    var parts = [];
    rig.trusses.forEach(function (t) {
      var clone = JSON.parse(JSON.stringify(rig));
      clone.trusses.forEach(function (c) {
        if (c.id === t.id) return;
        c.loads = []; c.weightless = true; c.wallWeight = 0;
        c.supports.forEach(function (s) { s.hardwareWeight = 0; });
      });
      var h = pick(solve(clone, db, { slack: base.slack }));   // same slack hoists as the full rig, so the parts add up
      if (h && Math.abs(h.reaction) > 0.005) parts.push({ truss: t.id, name: t.name, weight: h.reaction });
    });
    parts.sort(function (a, b) { return Math.abs(b.weight) - Math.abs(a.weight); });
    return { reaction: target.reaction, hoistChain: target.hoist.hoistChain, staticLoad: target.hoist.staticLoad, parts: parts };
  }

  TLA.rig = { boltFamilies: boltFamilies, sectionIn: sectionIn, widthIn: widthIn, widthFt: widthFt, solve: solve, attribution: attribution, blockWeight: blockWeight, geometry: { endPoint: endPoint, project: project, crossing: crossing } };
})(typeof globalThis !== "undefined" ? globalThis : window);
