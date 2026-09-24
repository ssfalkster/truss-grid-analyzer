/* Calculation sheet (1.14.0): a printable record of one rig's calculations - every input, the formulas with the
 * numbers put in, each table lookup (row and value), each check, the hoist load arithmetic and the self-checks
 * (equilibrium) - laid out so a second person can check them by hand or rebuild the rig in another program.
 * Read-only: it shows what the solve already computed (S.results) and never changes a result. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});
  var S = null, U = TLA.units;
  var FT_M = 0.3048;
  function P() { return TLA.panels; }
  function h() { return P().h.apply(null, arguments); }
  function fmt(n, d) { return P().fmt(n, d); }
  function $(id) { return document.getElementById(id); }

  /* ---- formatting (shown units) ---- */
  /** A value that rounds to zero at d decimals is shown as 0, not -0. */
  function z(x, d) { return Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x; }
  function W(x, d) { d = d == null ? 1 : d; return U.f("w", z(x, d), d); }
  function Wn(x, d) { d = d == null ? 1 : d; return U.n("w", z(x, d), d); }
  function Lf(x, d) { return U.f("len", x, d == null ? 2 : d); }
  function Ln(x, d) { return U.n("len", x, d == null ? 2 : d); }
  function Mf(x) { return U.f("mom", x, 0); }
  function pct(x) { return isFinite(x) ? fmt(x * 100, 1) + "%" : "over (no capacity)"; }
  function modelName(m) { return m === "load-path" ? "load-path method" : TLA.grillage.MODEL_LABEL[m] || m; }
  function shortModel(m) {
    var d = /\+dyn$/.test(m); if (d) m = m.slice(0, -4);
    return (m === "hinged" ? "Hinged" : m === "rigid" ? "Rigid" : /^semi/.test(m) ? "Semi " + m.slice(4) + " EI/L" : m) + (d ? ", hung dyn." : "");
  }

  /** Which table row a span is read from, as limits.tableAt reads it: rounded up to the next whole foot, or whole
   * metre for a truss whose data is native metric. */
  function lookup(truss, kind, len) {
    var metric = truss.units === "metric" && truss[kind + "_kg"], arr = metric ? truss[kind + "_kg"] : truss[kind + "_lb"];
    var n = Math.max(1, Math.ceil((metric ? len * FT_M : len) - 1e-9));
    return { row: n, unit: metric ? "m" : "ft", value: TLA.limits.tableAt(truss, kind, len), past: !arr || n > arr.length };
  }
  function rowText(r) { return r.row + " " + r.unit + " row" + (r.past ? " (past the end of the table: 0)" : ""); }
  function kindName(k) { return k === "cpl" ? "CPL" : "UDL"; }

  /** Short, stable fingerprint of the rig's inputs (FNV-1a), so a checker can tell the sheet matches a rig file. */
  function fingerprint(rig) {
    var s = JSON.stringify(rig, function (k, v) { return k === "report" ? undefined : v; }), x = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
    return ("0000000" + x.toString(16)).slice(-8).toUpperCase();
  }
  function stamp(d) {
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* ---- small builders ---- */
  function table(cls, head, rows, foot) {
    var t = h("table", { "class": "rt " + (cls || "") });
    if (head) t.appendChild(h("thead", null, h("tr", null, head.map(function (c) { return typeof c === "string" ? h("th", { text: c }) : h("th", { "class": c[1] || "", text: c[0] }); }))));
    t.appendChild(h("tbody", null, rows));
    if (foot) t.appendChild(h("tfoot", null, foot));
    return t;
  }
  function td(text, cls) { return h("td", { "class": cls || "", text: text == null ? "" : String(text) }); }
  function tdr(text, cls) { return td(text, "r " + (cls || "")); }
  function statusCell(st, bad) { return h("td", { "class": "st " + (bad ? "fail" : st === "Good" || st === "Pass" ? "ok" : "warn"), text: TLA.panels.statusText(st) }); }
  function sec(root, num, title) {
    var s = h("section", { "class": "rsec" }, h("h2", null, h("span", { "class": "n", text: num }), " " + title));
    root.appendChild(s); return s;
  }
  function para(text, cls) { return h("p", { "class": cls || "", text: text }); }
  function work(text) { return h("div", { "class": "work", text: text }); }

  /* ---- typeset maths (1.17.0): each check written as formula = numbers = result, with real fractions and
   * subscripts, so a checker can follow it line by line. Plain spans and CSS - no library, works offline and prints. */
  var X = " × ", MINUS = " − ", LE = " ≤ ", GT = " > ";
  function mv(base, sub) { return h("span", { "class": "mv" }, base, sub ? h("sub", { text: sub }) : null); }
  function fr(num, den) { return h("span", { "class": "fr" }, h("span", { "class": "nu" }, num), h("span", { "class": "de" }, den)); }
  /** One line of working: label, then the parts joined by " = " (the last part is the result, in bold). */
  function ml(label, parts, cls) {
    var out = [];
    parts.forEach(function (p, i) { if (i) out.push(h("span", { "class": "eq", text: " = " })); out.push(i && i === parts.length - 1 ? h("b", null, p) : p); });
    return h("div", { "class": "ml " + (label ? "" : "nl ") + (cls || "") }, label ? h("span", { "class": "ml-l", text: label }) : null, h("span", { "class": "ml-e" }, out));
  }
  /** A comparison line: value <= limit -> workload / status. */
  function mcmp(label, lhs, value, limit, ok, tail) {
    return h("div", { "class": "ml " + (ok ? "ok" : "fail") }, label ? h("span", { "class": "ml-l", text: label }) : null,
      h("span", { "class": "ml-e" }, lhs, h("span", { "class": "eq", text: " = " }), h("b", { text: value }), ok ? LE : GT, limit, tail ? h("span", { "class": "ml-t", text: "  → " + tail }) : null));
  }
  function calcs(title, lines, note) { return h("div", { "class": "calcs" }, title ? h("div", { "class": "calcs-h", text: title }) : null, lines, note ? h("div", { "class": "calcs-n", text: note }) : null); }

  /* ---- what the sheet needs from the results ---- */
  function hoistEntry(s) { return TLA.limits.supportEntry(s, S.db(), S.rig.settings); }
  function supportOf(t, id) { return (t.supports || []).filter(function (s) { return s.id === id; })[0]; }
  function trussEntry(t) { return t.custom || S.db().trusses.filter(function (x) { return x.id === t.trussId; })[0] || null; }
  function whereLoad(beam, x) {
    var p = beam.positions, n = p.length;
    if (!n) return null;
    if (x < p[0]) return "cantilever-left";
    if (x >= p[n - 1]) return "cantilever-right";
    for (var i = n - 2; i >= 0; i--) if (p[i] <= x) return "span" + (i + 1);
    return null;
  }
  function segName(s) { return s.type === "span" ? "Span " + s.index : s.type === "cantilever-left" ? "Left cantilever" : "Right cantilever"; }
  function segKey(s) { return s.type === "span" ? "span" + s.index : s.type; }
  function segRange(beam, s) {
    var p = beam.positions, n = p.length;
    if (s.type === "cantilever-left") return [0, p[0]];
    if (s.type === "cantilever-right") return [p[n - 1], beam.length];
    return [p[s.index - 1], p[s.index]];
  }
  function derateWhy(truss, k) {
    var st = S.rig.settings || {};
    if (typeof st.derate === "number") return "set for the whole rig";
    if (typeof truss.derate === "number") return "from the truss data (generic truss)";
    return truss.repetitive_use ? "the table already includes the repetitive-use factor" : "ANSI repetitive-use factor";
  }

  /* ================================================================ sheet */
  function build() {
    var r = S.results, rig = S.rig, st = rig.settings || {}, rep = rig.report || {}, db = S.db();
    var grill = r.primary === "grillage", MODELS = grill ? r.models || [] : [];
    var now = new Date(), fp = fingerprint(rig);
    var sheet = h("div", { "class": "sheet" });
    var num = 0;
    function next() { return String(++num); }

    // hoist ids used throughout
    var hid = {};
    var nH = 0, nD = 0;                                   // hoists H1, H2...; dead hangs DH1, DH2... (1.22.0)
    r.hoists.forEach(function (x) { hid[x.truss + ":" + x.support] = x.hoist.dead ? "DH" + (++nD) : "H" + (++nH); });
    var byId = {}; rig.trusses.forEach(function (t) { byId[t.id] = t; });
    var lines = r.order.map(function (id) { return byId[id]; }).filter(function (t) { return t && !t.isBlock; });
    rig.trusses.forEach(function (t) { if (!t.isBlock && lines.indexOf(t) < 0) lines.push(t); });   // unsolved ones last
    var blocks = rig.trusses.filter(function (t) { return t.isBlock; });
    var warns = r.warnings.filter(function (w) { return w.level !== "note"; }), notes = r.warnings.filter(function (w) { return w.level === "note"; });

    /* ---- title block ---- */
    function field(label, key, wide) {
      var v = rep[key];
      return h("div", { "class": "tb-f" + (wide ? " wide" : "") }, h("span", { "class": "tb-l", text: label }), h("span", { "class": "tb-v" + (v ? "" : " blank"), "data-field": key, text: v || "" }));
    }
    sheet.appendChild(h("header", { "class": "tb" },
      h("div", { "class": "tb-top" },
        h("div", null, h("div", { "class": "tb-kicker", text: "Truss rig calculation sheet" }), h("h1", { text: rig.name || "Untitled rig" })),
        !lines.length ? h("div", { "class": "tb-verdict" }, h("b", { text: "Nothing to check" }), h("span", { text: "no trusses" })) :
        h("div", { "class": "tb-verdict " + (warns.length ? "fail" : "ok") }, h("b", { text: warns.length ? warns.length + " warning" + (warns.length === 1 ? "" : "s") : "All checks pass" }), h("span", { text: warns.length ? "see section 9" : "no warnings" }))),
      h("div", { "class": "tb-grid" },
        field("Project / event", "project"), field("Venue / location", "location"),
        h("div", { "class": "tb-f" }, h("span", { "class": "tb-l", text: "Calculated" }), h("span", { "class": "tb-v", text: stamp(now) })),
        h("div", { "class": "tb-f" }, h("span", { "class": "tb-l", text: "Software" }), h("span", { "class": "tb-v", text: "Truss Grid Analyzer v" + TLA.VERSION })),
        h("div", { "class": "tb-f" }, h("span", { "class": "tb-l", text: "Input fingerprint" }), h("span", { "class": "tb-v mono", title: "Changes whenever any input of the rig changes", text: fp })),
        h("div", { "class": "tb-f" }, h("span", { "class": "tb-l", text: "Units" }), h("span", { "class": "tb-v", text: U.metric() ? "metric (m, kg, kg·m) - solved in ft and lb" : "imperial (ft, lb, lb-ft)" })),
        field("Notes", "notes", true))));

    /* ---- 1. summary ---- */
    var s1 = sec(sheet, next(), "Summary of results");
    var tot = r.totals, maxH = null, maxT = null;
    r.hoists.forEach(function (x) { var c = x.hoist.capacity; if (c > 0 && c < 999999) { var u = x.hoist.staticLoad / c; if (!maxH || u > maxH.u) maxH = { u: u, x: x }; } });
    lines.forEach(function (t) {
      var res = r.trusses[t.id]; if (!res) return;
      res.limits.segments.forEach(function (sg) { if (!sg.skipped && isFinite(sg.utilization) && (!maxT || sg.utilization > maxT.u)) maxT = { u: sg.utilization, t: t, what: segName(sg) }; });
      var mb = res.limits.member;
      if (mb && isFinite(mb.utilization) && (!maxT || mb.utilization > maxT.u)) maxT = { u: mb.utilization, t: t, what: mb.momentUtil >= mb.shearUtil ? "bending moment" : "shear" };
    });
    s1.appendChild(table("kv", null, [
      h("tr", null, td("Method (primary result)"), td(grill ? "Whole-rig analysis; every check uses the worst of the joint models " + MODELS.map(modelName).join(", ") : "Load-path method (whole-rig analysis not available" + (r.compat && r.compat.note ? ": " + U.text(r.compat.note) : "") + ")")),
      h("tr", null, td("Trusses / corner blocks / hoists"), td(lines.length + " / " + blocks.length + " / " + tot.count)),
      h("tr", null, td("Total weight carried by the rig"), td(W(tot.applied, 1) + " (loads, truss and block self weight, UDL, hardware at bolted connections)")),
      h("tr", null, td("Total high hook load, static"), td(W(tot.staticLoad, 1) + " (incl. hoists, chain and hoist hardware" + (Number(st.addPercent) > 0 ? ", + " + st.addPercent + "%" : "") + ")")),
      h("tr", null, td("Total high hook load, dynamic"), td(W(tot.dynamicLoad, 1))),
      h("tr", null, td("Highest hoist workload"), td(maxH ? pct(maxH.u) + " - " + hid[maxH.x.truss + ":" + maxH.x.support] + " on " + maxH.x.trussName : "-")),
      h("tr", null, td("Highest truss workload"), td(maxT ? pct(maxT.u) + " - " + maxT.t.name + ", " + maxT.what : "-")),
      h("tr", null, td("Warnings"), td(warns.length ? warns.length + " (section 9)" : "none") )
    ]));

    /* ---- 2. basis ---- */
    var s2 = sec(sheet, next(), "Basis of calculation");
    s2.appendChild(h("ul", { "class": "basis" },
      h("li", { text: "Trusses are beams along their centerline, carrying point loads, their self weight and any UDL spread over the whole length. Lengths and positions are measured from the start of each truss line (corner blocks included)." }),
      grill ? h("li", { text: "Hoist loads, the forces in bolted connections and the loads every check sees come from a whole-rig analysis: trusses are Timoshenko beams (bending EI, shear GA, torsion GJ) meeting at the corner blocks; hoists are rigid supports at one level" + (Number(st.hoistStiffness) > 0 ? " - here springs of " + U.f("stiff", st.hoistStiffness, 0) : "") + ". The corner-block joints are solved hinged (vertical force only), semi-rigid (rotational springs of 1, 4 and 16 x EI/L of the lighter truss) and rigid, and each hoist and each truss is checked with the joint model that loads it hardest." }) : null,
      grill ? null : h("li", { text: "The load-path method (each truss a continuous beam solved with the three-moment equation, the reaction of a bolted truss passed to its carrier as a point load) is the result used here." }),
      h("li", { text: "A chain can only pull: a hoist whose reaction comes out negative is taken out (Slack) and the rig solved again. A truss left with one support point is unstable." }),
      levelNote() ? h("li", { text: levelNote() }) : null,
      allowNote() ? h("li", { text: allowNote() }) : null,
      tot.hung ? h("li", { text: "Hoists hung below a truss (marked 'below' in section 4): the hoist's chain joins the two trusses, so the truss above (the carrier) sags with the load and the truss below shares load with its other hoists. The carrier carries the hung hoist's high hook load; the carrier - and every truss bolted to it - is also checked with the hung hoist's high hook DYNAMIC load as a point load (columns marked 'hung dyn.'), and the worse result is used. " +
        (st.hungDynamic === false ? "Rig setting: the carrier's own hoists take the hung hoist's static load." : "The carrier's own hoists take the dynamic load too (rig setting, on by default).") + " Hung hoists are not added into the totals: their load reaches the structure through the carrier's hoists." }) : null,
      h("li", { text: "Capacities come from the manufacturer's (or the Truss Load Analyzer workbook's) span tables, reading the row at the span rounded UP to the next whole foot (whole metre for native metric tables), multiplied by the repetitive-use factor k." })));
    var sw = TLA.limits.countSelfWeight(st), ap = Number(st.addPercent) > 0;
    /** Allowances (1.22.0): cable per length and load factors by category. */
    function allowNote() {
      var parts = [], cabT = rig.trusses.filter(function (t) { return TLA.rig.cableOf(t, st) > 0; });
      if (cabT.length) parts.push("Cable allowance added to the UDL of " + (cabT.length === rig.trusses.filter(function (t) { return !t.isBlock; }).length ? "every truss" : cabT.map(function (t) { return t.name; }).join(", ")) +
        (Number(st.cablePerFt) > 0 ? " (rig: " + U.f("wpl", st.cablePerFt, 2) + ")" : "") + ".");
      var lf = st.loadFactors || {}, fs = TLA.rig.LOAD_CATS.filter(function (c) { return Number(lf[c[0]]) > 0 && Number(lf[c[0]]) !== 1; });
      if (fs.length) parts.push("Load factors by category: " + fs.map(function (c) { return c[1] + " x " + lf[c[0]]; }).join(", ") + " - each load's weight is multiplied by its category's factor before any calculation (the weights in sections 6 and 7 include it).");
      return parts.join(" ");
    }
    /** Hoist levels (1.22.0): designed offsets and the out-of-level tolerance. */
    function levelNote() {
      var offs = [];
      r.hoists.forEach(function (x) { var s0 = supportOf(byId[x.truss], x.support); if (s0 && Number(s0.level)) offs.push(hid[x.truss + ":" + x.support] + " " + (s0.level > 0 ? "+" : "") + U.f("inch", s0.level, 2)); });
      var tl = Number(st.levelTolerance) > 0 ? Number(st.levelTolerance) : 0;
      if (!offs.length && !tl) return "";
      return (offs.length ? "Designed hoist levels: every hoist at one level except " + offs.join(", ") + " (higher +, lower -); the whole-rig analysis solves the rig with those points moved. " : "") +
        (tl ? "Out-of-level tolerance ±" + U.f("inch", tl, 2) + ": any hoist may be that far off its level, each on its own. Each hoist's check adds the worst it could see - the sum of what every hoist alone running " + U.f("inch", tl, 2) + " high or low does to it (4b, + Level)." : "");
    }
    var fx = [
      ["F1", "Span", "Capacity = CPL(row) x k x f,  f = (UDL(row) x k - w_udl x L) / (UDL(row) x k).  Pass if the sum of point loads on the span <= capacity and L <= the table's maximum span."],
      ["F2", "Cantilever", "L_c <= maximum span / 4.  Capacity = CPL(row for 4 x L_c) x k.  Load = point loads on it + w_udl x L_c" + (sw ? " + w_self x L_c" : "") + ".  Pass if load <= capacity."],
      ["F3", "Moment / shear", (sw ? "M_allow = k x min( max over the table of (CPL x L / 4 + w_self x L^2 / 8) , max of (UDL x L / 8 + w_self x L^2 / 8) ),  V_allow = k x max over the table of (CPL / 2 + w_self x L / 2, UDL / 2 + w_self x L / 2). The tables are loads on top of the truss's self weight, so its moment and shear are added back; the diagrams include the self weight."
        : "M_allow = k x min( max over the table of CPL x L / 4 , max of UDL x L / 8 ),  V_allow = k x max over the table of (CPL / 2, UDL / 2). The diagrams leave out the truss's self weight.") + " Estimates from the tables, not published values."],
      ["F4", "High hook static", "High hook = low hook R" + (Number(st.addPercent) > 0 ? " x (1 + " + st.addPercent + "/100)" : "") + " + hoist weight + chain weight per " + U.unit("len") + " x chain length + hardware.  Good if high hook <= rated capacity."],
      ["F5", "High hook dynamic", "Dynamic = high hook x DLF,  DLF = hoist speed (fpm) / 60 + 1 unless typed on the hoist; " + fmt(typeof st.defaultDlf === "number" ? st.defaultDlf : 1.25, 3) + " if the speed is unknown. Flagged if dynamic > capacity."],
      ["F6", "Factor k", typeof st.derate === "number" ? "k = " + st.derate + " for every truss (rig setting)." : "k = 0.85 (ANSI repetitive use) unless the table already includes it (k = 1); generic Universal trusses 0.75."],
      ["F7", "Deflection", "d = the largest sag of a span below the straight line between its two supports, from the whole-rig analysis (worst joint model), so a support that moves (a hoist that stretches, a carrier truss that sags) is not counted against the span. Limit L / n: the maker's published n where there is one (past it the truss fails), else the rig default L/" + (Number(st.deflectionLimit) > 0 ? st.deflectionLimit : TLA.limits.DEFL_DEFAULT) + " (past it is a warning). Cantilever tips are reported, not checked."]
    ];
    // the same formulas typeset (1.17.0); the sentence under each keeps the conditions and notes
    var fxMath = {
      F1: [ml(null, [[mv("C"), " = CPL", X, mv("k"), X, mv("f")]]), ml(null, [[mv("f"), " = ", fr(["UDL", X, mv("k"), MINUS, mv("w", "udl"), X, mv("L")], ["UDL", X, mv("k")])]]), h("div", { "class": "ml" }, h("span", { "class": "ml-l", text: "pass if" }), h("span", { "class": "ml-e" }, mv("ΣP"), LE, mv("C"), "  and  ", mv("L"), LE, mv("L", "max")))],
      F2: [ml(null, [[mv("C"), " = CPL(4", mv("L", "c"), ")", X, mv("k")]]), h("div", { "class": "ml" }, h("span", { "class": "ml-l", text: "pass if" }), h("span", { "class": "ml-e" }, mv("ΣP"), " + ", mv("w", "udl"), X, mv("L", "c"), sw ? [" + ", mv("w", "self"), X, mv("L", "c")] : null, LE, mv("C"), "  and  ", mv("L", "c"), LE, fr(mv("L", "max"), "4")))],
      F3: [ml(null, [[mv("M", "allow"), " = ", mv("k"), X, "min( max ", fr(["CPL", X, mv("L")], "4"), sw ? [" + ", fr([mv("w", "self"), X, mv("L"), "²"], "8")] : null, ", max ", fr(["UDL", X, mv("L")], "8"), sw ? [" + ", fr([mv("w", "self"), X, mv("L"), "²"], "8")] : null, " )"]]),
        ml(null, [[mv("V", "allow"), " = ", mv("k"), X, "max( ", fr("CPL", "2"), sw ? [" + ", fr([mv("w", "self"), X, mv("L")], "2")] : null, ", ", fr("UDL", "2"), sw ? [" + ", fr([mv("w", "self"), X, mv("L")], "2")] : null, " )"]])],
      F4: [ml(null, [["High hook = ", mv("R"), ap ? [X, "(1 + " + st.addPercent + "/100)"] : null, " + ", mv("W", "hoist"), " + ", mv("w", "chain"), X, mv("L", "chain"), " + ", mv("W", "hardware")]])],
      F5: [ml(null, [["Dynamic = High hook", X, "DLF"]]), ml(null, [["DLF = ", fr(mv("v"), "60"), " + 1"]])],
      F6: [],
      F7: [h("div", { "class": "ml" }, h("span", { "class": "ml-l", text: "pass if" }), h("span", { "class": "ml-e" }, mv("d"), LE, fr(mv("L"), mv("n"))))]
    };
    s2.appendChild(table("fx", ["", "Check", "Formula"], fx.map(function (f) { return h("tr", null, td(f[0], "mono b"), td(f[1]), h("td", null, fxMath[f[0]] && fxMath[f[0]].length ? h("div", { "class": "fxm" }, fxMath[f[0]]) : null, h("div", { "class": fxMath[f[0]] && fxMath[f[0]].length ? "fxn" : "", text: f[2] }))); })));
    s2.appendChild(table("kv small", null, [
      h("tr", null, td("Truss self weight in cantilever / moment-shear checks"), td(sw ? "counted (default): added to cantilever loads; in the moment/shear forces and, added back, in their capacities" : "not counted (turned off for this rig)")),
      h("tr", null, td("Repetitive-use factor"), td(typeof st.derate === "number" ? String(st.derate) + " (whole rig)" : "per truss data")),
      h("tr", null, td("Default dynamic factor"), td(fmt(typeof st.defaultDlf === "number" ? st.defaultDlf : 1.25, 3))),
      h("tr", null, td("Add % to hoist loads"), td(Number(st.addPercent) > 0 ? st.addPercent + "%" : "none")),
      h("tr", null, td("Hoist stiffness"), td(Number(st.hoistStiffness) > 0 ? U.f("stiff", st.hoistStiffness, 0) : "rigid"))
    ]));

    /* ---- 3. plan ---- */
    var s3 = sec(sheet, next(), "Plan");
    var fig = planFigure(hid);
    s3.appendChild(fig || para("No trusses.", "mut"));

    /* ---- 4. hoists ---- */
    var s4 = sec(sheet, next(), "Hoists");
    if (!r.hoists.length) s4.appendChild(para("No hoists.", "mut"));
    else {
      s4.appendChild(para("4a. Low hook load R at each hoist (the reaction: what the rig hangs on the hook) from each joint model; the governing value (largest) is used below.", "cap"));
      var headA = ["Hoist", "Truss", ["At (" + U.unit("len") + ")", "r"], "Hoist model"].concat(MODELS.map(function (m) { return [shortModel(m), "r"]; })).concat([["Low hook R used", "r"], "From"]);
      s4.appendChild(table("small", headA.map(function (c) { return typeof c === "string" ? c : c; }), r.hoists.map(function (x) {
        var e0 = hoistEntry(supportOf(byId[x.truss], x.support) || {}) || {};
        var cells = [td(hid[x.truss + ":" + x.support], "b"), td(x.trussName + (x.hung && byId[x.hung] ? " (below " + byId[x.hung].name + ")" : "")), tdr(Ln(x.distance)), td(e0.dead ? "Dead hang, " + (e0.rope ? e0.rope.name : "WLL typed") : e0.description ? String(e0.description).trim() + " " + (e0.capacity_label || "") : "-", "nw")];
        MODELS.forEach(function (m) { var c = x.byModel && x.byModel[m]; cells.push(tdr(c ? Wn(c.reaction) + (c.slack ? " slack" : "") : "-", x.model === m ? "b" : "")); });
        cells.push(tdr(Wn(x.reaction), "b"), td(x.model ? shortModel(x.model) : "load path", "nw"));
        return h("tr", null, cells);
      })));
      s4.appendChild(para("4b. Hoist load (F4, F5). Chain = chain weight per " + U.unit("len") + " x chain length.", "cap"));
      var sum = { r: 0, a: 0, hw: 0, ch: 0, hd: 0, s: 0, d: 0 }, tl4 = r.hoists.some(function (x) { return x.level; });
      var rowsB = r.hoists.map(function (x) {
        var t = byId[x.truss], s = supportOf(t, x.support) || {}, e = hoistEntry(s) || {}, hx = x.hoist;
        var body = Number(e.weight_lb) || 0, perFt = Number(e.chain_weight_per_ft_lb) || 0, cl = Number(e.dead ? s.ropeLength : s.chainLength) || 0, chain = perFt * cl, hw = Number(s.hardwareWeight) || 0;
        var dlfSrc = Number(s.dlf) > 0 ? "typed" : e.dead ? "dead hang, static" : Number(e.speed_fpm) > 0 ? fmt(e.speed_fpm, 1) + " fpm / 60 + 1" + (U.metric() ? ", " + U.f("speed", e.speed_fpm, 1) : "") : Number(e.capacity_lb) >= 999999 ? "no hoist" : "default";
        if (!x.hung) { sum.r += hx.reaction; sum.a += hx.added || 0; sum.l = (sum.l || 0) + (x.level ? x.level.add : 0); sum.hw += body; sum.ch += chain; sum.hd += hw; sum.s += hx.staticLoad; sum.d += hx.dynamicLoad; }
        var cap = hx.capacity >= 999999 ? null : hx.capacity, bad = hx.status !== "Good";
        return h("tr", null, td(hid[x.truss + ":" + x.support], "b"),
          tdr(Wn(hx.reaction)), tl4 ? tdr(x.level ? Wn(x.level.add) : "-") : null, tdr(hx.added ? Wn(hx.added) : "-"), tdr(Wn(body)),
          tdr(perFt ? U.n("wpl", perFt, 2) + " x " + Ln(cl, 1) + " = " + Wn(chain) : "-"), tdr(hw ? Wn(hw) : "-"),
          tdr(Wn(hx.staticLoad), "b"), h("td", { "class": "r" }, fmt(hx.dynamicFactor, 3), h("span", { "class": "sub2", text: dlfSrc })), tdr(Wn(hx.dynamicLoad)),
          tdr(cap ? Wn(cap, 0) : "none"), tdr(cap ? pct(hx.staticLoad / cap) : "-"),
          statusCell(hx.status + (hx.dynamicOver ? ", dynamic over" : ""), bad || hx.dynamicOver));
      });
      s4.appendChild(table("small", ["Hoist", ["Low hook R", "r"]].concat(tl4 ? [["+ Level", "r"]] : []).concat([["+ Add %", "r"], ["Hoist", "r"], ["Chain", "r"], ["Hardware", "r"], ["High hook", "r"], ["DLF", "r"], ["High hook dyn.", "r"], ["Capacity", "r"], ["Workload", "r"], "Status"]), rowsB,
        h("tr", null, td("Total"), tdr(Wn(sum.r)), tl4 ? tdr(sum.l ? Wn(sum.l) : "-") : null, tdr(sum.a ? Wn(sum.a) : "-"), tdr(Wn(sum.hw)), tdr(Wn(sum.ch)), tdr(sum.hd ? Wn(sum.hd) : "-"), tdr(Wn(sum.s), "b"), td(""), tdr(Wn(sum.d)), td(""), td(""), td(""))));
      s4.appendChild(para("All weights in " + U.unit("w") + ". High hook = low hook R + Add % + Hoist + Chain + Hardware." + (nD ? " Dead hangs (DH): Chain = the rope (weight per " + U.unit("len") + " x length), no hoist; Capacity = WLL = the rope's minimum breaking strength / " + TLA.limits.ropeFactor(st) + " (design factor, Rig settings), or the typed assembly WLL if lower; static (DLF 1.0 unless typed)." : "") + (tot.hung ? " The totals leave out the hoists hung below a truss (their load is in the carrier's hoists)." : ""), "cap"));
    }

    // 1.22.0: load-cell readings against the calculation
    var mss = r.measured;
    if (mss && mss.any && r.hoists.length) {
      s4.appendChild(para("4c. Measured loads (load cells reading the " + (mss.reads === "low" ? "low hook load" : "high hook static load") + ") against the calculation, per assembly; flagged past " + Math.round(mss.tol * 100) + "% of the total.", "cap"));
      s4.appendChild(table("small", ["Assembly", ["Cells", "r"], ["Measured", "r"], ["Calculated", "r"], ["Difference", "r"]], mss.assemblies.map(function (a) {
        return h("tr", null, td(a.names.join(", ")), tdr(a.n + " of " + a.of), tdr(Wn(a.measured)), tdr(Wn(a.calc)), td(a.diff === null ? "-" : TLA.rig.pctText(a.diff), a.over ? "fail" : "ok"));
      })));
    }

    /* ---- 5. equilibrium ---- */
    var s5 = sec(sheet, next(), "Equilibrium (self-checks)");
    var eqRows = [h("tr", null, td("Weight carried"), tdr(W(tot.applied, 1)), td(""))];
    if (grill && r.compat && r.compat.ok) {
      eqRows.push(h("tr", null, td("Weight in the whole-rig model"), tdr(W(r.compat.load, 1)), td(Math.abs(r.compat.load - tot.applied) <= 0.5 + 1e-6 * r.compat.load ? "agrees" : "DIFFERS", Math.abs(r.compat.load - tot.applied) <= 0.5 + 1e-6 * r.compat.load ? "ok" : "fail")));
      MODELS.forEach(function (m) {
        var sumR = r.hoists.reduce(function (a, x) { return a + (!x.hung && x.byModel && x.byModel[m] ? x.byModel[m].reaction : 0); }, 0), err = r.compat[m] ? r.compat[m].equilibriumError : NaN;
        eqRows.push(h("tr", null, td("Sum of hoist reactions, " + modelName(m)), tdr(W(sumR, 1)), td("out of balance by " + W(err, 3), Math.abs(err) <= 0.5 + 1e-6 * r.compat.load ? "ok" : "fail")));
      });
    }
    var lpSum = r.hoists.reduce(function (a, x) { return a + (x.hung ? 0 : x.reaction); }, 0);
    if (!grill) eqRows.push(h("tr", null, td("Sum of hoist reactions, load-path method"), tdr(W(lpSum, 1)), td("difference " + W(lpSum - tot.applied, 3), Math.abs(lpSum - tot.applied) <= 0.5 ? "ok" : "warn")));
    s5.appendChild(table("kv wide", null, eqRows));
    s5.appendChild(para("Every model must carry the whole weight: the hoist reactions of each joint model add up to the weight carried. Each truss below also shows its own balance (loads = reactions).", "cap"));

    /* ---- 6. trusses ---- */
    var s6 = sec(sheet, next(), "Trusses");
    s6.appendChild(para("Trusses in order: a truss that is bolted to another comes before the truss that carries it. Positions from the start of the line.", "cap"));
    lines.forEach(function (t, i) { s6.appendChild(trussBlock(t, "6." + (i + 1), hid, MODELS, grill)); });

    /* ---- 7. connections and blocks ---- */
    var s7 = sec(sheet, next(), "Bolted connections and corner blocks");
    var conRows = [];
    rig.trusses.forEach(function (t) {
      if (t.isBlock) return;
      var res = r.trusses[t.id];
      (t.supports || []).forEach(function (s) {
        if (s.kind !== "truss") return;
        var u = byId[s.onTruss], sr = res && res.supports.filter(function (q) { return q.support.id === s.id; })[0];
        // a corner block: say where it sits on the line it is part of
        var host = u && u.isBlock ? byId[u.host || (u.attach && u.attach.b)] : null, hs = host && (u.supports || []).filter(function (q) { return q.kind === "truss" && q.onTruss === host.id; })[0];
        var cells = [td(t.name), tdr(Ln(s.distance)), td(u ? u.name + (host ? " (on " + host.name + ")" : "") : "?"), tdr(Ln(hs ? hs.onDistance || 0 : s.onDistance || 0)), td(s.mount === "above" ? "sits on top" : s.mount === "below" ? "clamped below" : u && u.isBlock ? "bolted to block" : "bolted")];
        if (!grill) cells.push(tdr(sr ? Wn(sr.reaction) : "-"));
        MODELS.forEach(function (m) { cells.push(tdr(sr && sr.byModel && sr.byModel[m] != null ? Wn(sr.byModel[m]) : "-", res && res.model === m ? "b" : "")); });
        cells.push(tdr(s.hardwareWeight ? Wn(s.hardwareWeight) : "-"));
        conRows.push(h("tr", null, cells));
      });
    });
    if (conRows.length) {
      s7.appendChild(para("Force passed from each truss to the part it is bolted to (" + U.unit("w") + ", downward on the carrier). Bold: the joint model that governs the bolted truss's checks.", "cap"));
      s7.appendChild(table("small", ["Truss", ["At (" + U.unit("len") + ")", "r"], "Onto", ["At (" + U.unit("len") + ")", "r"], "How"].concat(grill ? [] : [["Force", "r"]]).concat(MODELS.map(function (m) { return [shortModel(m), "r"]; })).concat([["Hardware", "r"]]), conRows));
    } else s7.appendChild(para("No bolted connections.", "mut"));
    if (blocks.length) {
      s7.appendChild(para("Corner blocks (their weight is carried by the truss line they are part of).", "cap"));
      s7.appendChild(table("small", ["Block", "Type", "Part of", ["Weight (" + U.unit("w") + ")", "r"], ["Faces used / ways", "r"], "Bolted here"], blocks.map(function (b) {
        var res = r.trusses[b.id], bk = res && res.block, ty = bk && bk.type, host = byId[b.host || (b.attach && b.attach.b)];
        var bolted = rig.trusses.filter(function (o) { return (o.supports || []).some(function (s) { return s.kind === "truss" && s.onTruss === b.id; }); }).map(function (o) { return o.name; });
        var full = bk && bk.waysAvailable && bk.waysUsed > bk.waysAvailable;
        return h("tr", null, td(b.name), td(ty ? (ty.family.indexOf(ty.manufacturer.split(" ")[0]) === 0 ? "" : ty.manufacturer + " ") + ty.family + " - " + ty.name + (ty.code ? " (" + ty.code + ")" : "") : "unknown"), td(host ? host.name : "-"),
          tdr(bk ? Wn(bk.weight) + (typeof b.weightOverride === "number" ? " (typed)" : "") : "-"), tdr(bk ? bk.waysUsed + (bk.waysAvailable ? " / " + bk.waysAvailable : "") : "-", full ? "fail" : ""), td(bolted.join(", ")));
      })));
    }

    /* ---- 8. independent check ---- */
    var s8 = sec(sheet, next(), "How to check this independently");
    s8.appendChild(h("ol", { "class": "basis" },
      h("li", { text: "Inputs: compare sections 4, 6 and 7 with the rigging plot (truss models, lengths, positions, loads, hoists, chain lengths). The input fingerprint " + fp + " matches the rig file this sheet was made from." }),
      h("li", { text: "Table checks: read each manufacturer's table at the row given, apply k, and redo the arithmetic written under each check (F1-F3)." }),
      h("li", { text: "Balance: in every truss the listed loads add up to its listed reactions; the reactions of all hoists add up to the weight carried (section 5)." }),
      h("li", { text: "Two-support trusses: their reactions follow from statics alone (moments about one support, shown under the truss)." }),
      grill ? h("li", { text: "Grids and continuous trusses: rebuild the rig in a 3D frame program (e.g. CalcForge 3D Structural Analysis / PyNite): a node at every hoist, joint and load, hoists pinned, truss-to-truss joints continuous (rigid) or released (hinged), the EI and GJ listed for each truss, loads as listed. Its reactions should match the Rigid and Hinged columns (it leaves out shear deformation, so short, stiff spans may differ a little). The app's 'Export whole-rig model' writes the same model for tools/pynite_check.py." }) : null,
      h("li", { text: "Hoists: redo section 4b (F4, F5) with the hoist's rated capacity, weight, chain weight and speed from its data sheet." })));

    /* ---- 9. warnings ---- */
    var s9 = sec(sheet, next(), "Warnings and notes");
    if (!warns.length && !notes.length) s9.appendChild(para("None.", "ok"));
    if (warns.length) s9.appendChild(h("ol", { "class": "warns" }, warns.map(function (w) { return h("li", { text: U.text(w.message) }); })));
    if (notes.length) { s9.appendChild(para("Notes:", "cap")); s9.appendChild(h("ul", { "class": "warns notes" }, notes.map(function (w) { return h("li", { text: U.text(w.message) }); }))); }

    /* ---- names (no signature blocks) ---- */
    sheet.appendChild(h("section", { "class": "rsec sign" },
      h("div", { "class": "signs" },
        ["Prepared by", "Checked by"].map(function (who, i) {
          var key = i ? "checkedBy" : "preparedBy";
          return h("div", { "class": "signname" }, h("span", { "class": "sl", text: who }), h("span", { "class": "sv" + (rep[key] ? "" : " blank"), "data-field": key, text: rep[key] || "" }));
        })),
      h("p", { "class": "disc", text: "This sheet shows how the loads and checks were calculated so they can be verified. It is not a substitute for the judgement of a qualified person: the user is responsible for verifying the results, the rig as built, the hardware ratings and the rigging points before using them to make rigging decisions. Capacities are only as good as the truss and hoist data entered, and allowable moment and shear are estimates from the manufacturer's tables." }),
      h("p", { "class": "disc", text: "Truss Grid Analyzer v" + TLA.VERSION + " by G.E. Simmons Falk - a rebuild of Truss Load Analyzer - EOT by Delbert L. Hall and Jon Sogoian, the originators of the program. Free software; see the About dialog for the version history and license." })));
    return sheet;
  }

  /* ---------------------------------------------------------------- one truss */
  function trussBlock(t, id, hid, MODELS, grill) {
    var r = S.results, res = r.trusses[t.id], e = trussEntry(t), st = S.rig.settings || {};
    var box = h("div", { "class": "tblock" });
    var status = res ? (TLA.plan.trussStatus(res).bad ? "check warnings" : "all checks pass") : "not solved";
    box.appendChild(h("h3", null, h("span", { "class": "n", text: id }), " " + t.name + " ", h("span", { "class": "tstat " + (res && !TLA.plan.trussStatus(res).bad ? "ok" : "fail"), text: status })));
    if (!e) { box.appendChild(para("Truss type not found in the database.", "fail")); return box; }
    if (!res) { box.appendChild(para("Not solved: it depends on a load-path loop or a missing truss/support (see warnings).", "fail")); return box; }
    var lim = res.limits, k = lim.derate, beam = res.beam, sec2 = res.section;

    // data
    var src = P().trussSource(e);
    var data = [
      ["Truss", (e.manufacturer || "Custom") + " " + String(e.description || "").trim() + (e.source ? " (" + (e.source === "MFG" ? "manufacturer data" : e.source === "TLA" ? "Truss Load Analyzer workbook" : e.source === "User" ? "custom entry" : e.source) + ")" : "")],
      ["Data source", src.replace(/^Source: /, "") || "-"],
      ["Self weight", t.weightless ? "not counted (weightless)" : U.f("wpl", e.weight_per_ft_lb, 2) + " x " + Lf(beam.length, 3) + " = " + W(beam.wSelf * beam.length, 1)],
      ["UDL", (function () {
        var cab = TLA.rig.cableOf(t, S.rig.settings), typed = Number(t.wallWeight) || 0, tot = typed + cab * t.length;
        if (!tot) return "none";
        return (cab ? (typed ? W(typed, 1) + " typed + " : "") + "cable " + U.f("wpl", cab, 2) + " x " + Ln(t.length, 2) + " = " + W(tot, 1) : W(typed, 1)) + " over the whole line = " + U.f("wpl", beam.wDist, 2);
      })()],
      ["Line length", Lf(t.length, 3) + (t.blocksAdded ? " (" + Lf(t.pieceLength != null ? t.pieceLength : t.length, 3) + " truss + " + Lf(t.blocksAdded, 3) + " corner blocks)" : "")],
      ["Maximum span / cantilever", Lf(lim.maxSpan, 2) + " / " + Lf(lim.maxCantilever, 2) + " (= max span / 4)"],
      ["Repetitive-use factor k", fmt(k, 3) + " (" + derateWhy(e, k) + ")"]
    ];
    if (res.model) data.push(["Checked with", modelName(res.model) + " - the joint model that loads this truss hardest"]);
    if (sec2) data.push(["Stiffness (whole-rig analysis)", "EI " + U.v("ei", sec2.EI * 144).toExponential(3) + " " + U.unit("ei") + ", GA " + U.v("w", sec2.GA).toExponential(3) + " " + U.unit("w") + ", GJ " + U.v("ei", sec2.GJ * 144).toExponential(3) + " " + U.unit("ei") +
      " (" + (sec2.source === "tables" ? "estimated from the tables" : sec2.source === "section" ? "from section data" : sec2.source) + (sec2.scale !== 1 ? ", x" + sec2.scale : "") + ")"]);
    box.appendChild(table("kv small", null, data.map(function (d) { return h("tr", null, td(d[0]), td(d[1])); })));

    // loads
    var loads = beam.loads.map(function (l, i) { return { l: l, i: i }; }).sort(function (a, b) { return a.l.distance - b.l.distance || a.i - b.i; });
    var tag = {};
    var lrows = loads.map(function (o, j) {
      var l = o.l, n = "P" + (j + 1); tag[o.i] = n;
      var what = l.injected ? "reaction of " + String(l.note || "").replace(/^from /, "") + (res.model ? " (" + shortModel(res.model).toLowerCase() + ")" : "") : (l.note || "load") + (l.mirrored ? " (mirror)" : "");
      var at = whereLoad(beam, l.distance), sg = lim.segments.filter(function (s) { return segKey(s) === at; })[0];
      return h("tr", null, td(n, "b"), tdr(Ln(l.distance, 3)), tdr(Wn(l.weight)), td(what), td(sg ? segName(sg) : ""));
    });
    var pSum = beam.loads.reduce(function (a, l) { return a + l.weight; }, 0);
    if (beam.wSelf) lrows.push(h("tr", null, td("w_self", "b"), tdr("0 - " + Ln(beam.length, 3)), tdr(Wn(beam.wSelf * beam.length)), td(U.f("wpl", beam.wSelf, 2) + " self weight"), td("")));
    if (beam.wDist) lrows.push(h("tr", null, td("w_udl", "b"), tdr("0 - " + Ln(beam.length, 3)), tdr(Wn(beam.wDist * beam.length)), td(U.f("wpl", beam.wDist, 2) + " UDL"), td("")));
    box.appendChild(para("Loads on the truss", "sub"));
    box.appendChild(table("small", ["", ["At (" + U.unit("len") + ")", "r"], ["Weight (" + U.unit("w") + ")", "r"], "Load", "On"], lrows,
      h("tr", null, td("Total"), td(""), tdr(Wn(beam.totalLoad), "b"), td("point loads " + W(pSum, 1) + " + uniform " + W(beam.w * beam.length, 1)), td(""))));

    // reactions
    var rrows = [], sumGov = 0, sumBy = {};
    MODELS.forEach(function (m) { sumBy[m] = 0; });
    res.supports.forEach(function (sr) {
      var s = sr.support, isH = s.kind === "hoist", key = t.id + ":" + s.id, other = S.truss(s.onTruss);
      sumGov += sr.reaction;
      var cells = [td(isH ? hid[key] || "hoist" : "bolt", "b"), tdr(Ln(s.distance, 3)), td(isH ? "hoist" + (sr.slack ? " (slack)" : "") : (s.mount === "above" ? "on top of " : s.mount === "below" ? "clamped below " : "bolted to ") + (other ? other.name : "?"))];
      if (!MODELS.length) cells.push(tdr(Wn(sr.reaction)));
      MODELS.forEach(function (m) { var v = sr.byModel && sr.byModel[m]; sumBy[m] += v || 0; cells.push(tdr(v != null ? Wn(v) : "-", res.model === m ? "b" : "")); });
      rrows.push(h("tr", null, cells));
    });
    var foot = [td("Sum"), td(""), td("")].concat(MODELS.length ? [] : [tdr(Wn(sumGov))]).concat(MODELS.map(function (m) { return tdr(Wn(sumBy[m]), res.model === m ? "b" : ""); }));
    box.appendChild(para("Reactions (" + U.unit("w") + ", upward on this truss)", "sub"));
    if (MODELS.length) box.appendChild(para("Bold: the joint model it is checked with.", "cap"));
    box.appendChild(table("small", ["", ["At (" + U.unit("len") + ")", "r"], "Support"].concat(MODELS.length ? [] : [["Reaction", "r"]]).concat(MODELS.map(function (m) { return [shortModel(m), "r"]; })), rrows, h("tr", null, foot)));
    var diff = sumGov - beam.totalLoad;
    box.appendChild(work("Balance: loads " + W(beam.totalLoad, 1) + " - reactions " + W(sumGov, 1) + " = " + W(-diff, 3) + (Math.abs(diff) <= 0.5 + 1e-6 * Math.abs(beam.totalLoad) ? "  (balances)" : "  (DOES NOT BALANCE)")));

    // statics for two supports
    var pos = beam.positions;
    if (pos.length === 2) {
      var a = pos[0], b = pos[1], sp = b - a, mP = 0;
      beam.loads.forEach(function (l) { mP += l.weight * (l.distance - a); });
      var mW = beam.w * beam.length * (beam.length / 2 - a), rB = (mP + mW) / sp, rA = beam.totalLoad - rB;
      box.appendChild(work("Statics (two supports at " + Ln(a, 3) + " and " + Ln(b, 3) + " " + U.unit("len") + "): moments about the first, R2 = [sum P x (x - " + Ln(a, 3) + ") + w L (L/2 - " + Ln(a, 3) + ")] / " + Ln(sp, 3) +
        " = [" + U.n("mom", mP, 1) + " + " + U.n("mom", mW, 1) + "] / " + Ln(sp, 3) + " = " + W(rB, 1) + ";  R1 = " + W(beam.totalLoad, 1) + " - " + W(rB, 1) + " = " + W(rA, 1) + "." +
        (grill && Math.abs(res.supports.reduce(function (acc, sr) { return acc + (Math.abs(sr.support.distance - b) < 1e-6 ? sr.reaction : 0); }, 0) - rB) > 0.5 ? " The reactions above (whole-rig analysis) differ from statics because " + (res.model === "hinged" ? "the bolted trusses' forces differ between joint models" : "the joints pass moment into this truss") + "." : "")));
    } else if (pos.length > 2) {
      box.appendChild(work("Continuous beam over " + pos.length + " supports: support moments by the three-moment equation with the loads above (hogging +, " + U.unit("mom") + "): " +
        beam.moments.map(function (m, i) { return "M" + (i + 1) + " = " + U.n("mom", m, 1); }).join(", ") + ". These treat the supports as unyielding; the reactions above are from the " + (res.model ? "whole-rig analysis" : "same beam") + "."));
    }

    // diagrams
    var fig = h("div", { "class": "rfig" }, P().elevation(t, res));
    var fd = P().forceDiagrams(res); if (fd) fig.appendChild(fd);
    var dd = P().deflectionDiagram(t, res); if (dd) fig.appendChild(dd);   // 1.25.0
    box.appendChild(fig);

    // table checks
    var crows = [], works = [];
    lim.segments.forEach(function (s) {
      if (s.skipped) return;
      var rg = segRange(beam, s), onIt = [];
      beam.loads.forEach(function (l, i) { if (whereLoad(beam, l.distance) === segKey(s)) onIt.push(tag[i]); });
      onIt.sort(function (a, b) { return a.slice(1) - b.slice(1); });
      var bad = !!s.code, kk = fmt(k, 3), lines = [], rows;
      var title = segName(s) + " (" + Ln(rg[0], 3) + " - " + Lf(rg[1], 3) + ")";
      var loadSum = onIt.length ? onIt.join(" + ") : "no point loads";
      if (s.type === "span") {
        var cp = lookup(e, "cpl", s.length), ud = lookup(e, "udl", s.length);
        rows = "Table rows read (span rounded up): CPL at the " + rowText(cp) + " = " + W(cp.value, 0) + ", UDL at the " + rowText(ud) + " = " + W(ud.value, 0) + ".";
        lines.push(mcmp("Length", mv("L"), Lf(s.length, 3), [mv("L", "max"), " = " + Lf(s.maxLength, 1)], !s.lengthFail));
        if (!(s.udlMax > 0)) lines.push(ml("UDL share", [mv("f"), "0 (the UDL row is 0, so no capacity is taken from this row)"]));
        else if (s.udlUsed > 0) lines.push(ml("UDL share", [
          [mv("f"), " = ", fr(["UDL", X, mv("k"), MINUS, mv("w", "udl"), X, mv("L")], ["UDL", X, mv("k")])],
          fr([Wn(ud.value, 0) + X + kk + MINUS + U.n("wpl", beam.wDist, 2) + X + Ln(s.length, 3)], [Wn(ud.value, 0) + X + kk]), fmt(s.freeFraction, 4)]));
        else lines.push(ml("UDL share", [mv("f"), "1 (no UDL on this truss)"]));
        lines.push(ml("Capacity", [[mv("C"), " = CPL", X, mv("k"), X, mv("f")], Wn(cp.value, 0) + X + kk + X + fmt(s.udlMax > 0 ? s.freeFraction : 0, 4), W(s.capacity, 1)]));
        lines.push(mcmp("Load", [mv("ΣP"), " = " + loadSum], W(s.load, 1), [mv("C"), " = " + W(s.capacity, 1)], !s.loadFail, pct(s.utilization) + " workload"));
      } else {
        var cc = lookup(e, "cpl", s.length * 4), selfPart = TLA.limits.countSelfWeight(st) ? beam.wSelf * s.length : 0, sumP = s.load - beam.wDist * s.length - selfPart;
        rows = "Table row read: a cantilever is checked as a span of 4 x its length, 4 x " + Lf(s.length, 3) + " = " + Lf(s.length * 4, 3) + " - CPL at the " + rowText(cc) + " = " + W(cc.value, 0) + ".";
        lines.push(mcmp("Length", mv("L", "c"), Lf(s.length, 3), [fr(mv("L", "max"), "4"), " = " + Lf(s.maxLength, 2)], !s.lengthFail));
        lines.push(ml("Capacity", [[mv("C"), " = CPL(4", mv("L", "c"), ")", X, mv("k")], Wn(cc.value, 0) + X + kk, W(s.capacity, 1)]));
        var lhs = [mv("ΣP")];
        var nums = onIt.length ? (onIt.join(" + ") + (beam.wDist || selfPart ? " (" + Wn(sumP, 1) + ")" : "")) : "0";
        if (beam.wDist) { lhs.push(" + ", mv("w", "udl"), X, mv("L", "c")); nums += " + " + U.n("wpl", beam.wDist, 2) + X + Ln(s.length, 3); }
        if (selfPart) { lhs.push(" + ", mv("w", "self"), X, mv("L", "c")); nums += " + " + U.n("wpl", beam.wSelf, 2) + X + Ln(s.length, 3); }
        lines.push(mcmp("Load", [lhs, " = " + nums], W(s.load, 1), [mv("C"), " = " + W(s.capacity, 1)], !s.loadFail, pct(s.utilization) + " workload"));
      }
      var txt = calcs(title, lines, rows);
      crows.push(h("tr", null, td(segName(s)), tdr(Ln(s.length, 3)), tdr(Ln(s.maxLength, 2)), tdr(Wn(s.capacity)), tdr(Wn(s.load)), tdr(pct(s.utilization)), statusCell(s.status, bad)));
      works.push(txt);
    });
    box.appendChild(para("Span and cantilever checks (F1, F2)", "sub"));
    if (crows.length) {
      box.appendChild(table("small", ["Segment", ["L (" + U.unit("len") + ")", "r"], ["Max L", "r"], ["Capacity (" + U.unit("w") + ")", "r"], ["Load (" + U.unit("w") + ")", "r"], ["Workload", "r"], "Status"], crows));
      works.forEach(function (w) { box.appendChild(w); });
    } else box.appendChild(para("No spans or cantilevers to check.", "mut"));

    // moment and shear
    var mb = lim.member;
    if (mb) {
      var c = mb.capacity, at = c.at || {}, d = mb.checked;
      box.appendChild(para("Moment and shear check (F3)" + (d !== mb.diagram ? " - truss self weight left out (turned off for this rig)" : c.wSelf > 0 ? " - truss self weight included, and added back into the allowables" : ""), "sub"));
      function rowOf(q, div) { return q ? kindName(q.kind) + " " + Wn(q.load, 0) + " at the " + q.row + " " + q.unit + " row x " + Ln(q.length, 3) + " / " + div : "none"; }
      var mSide = d.maxSag >= d.maxHog ? "sagging at " + Lf(d.atSag, 2) : "hogging at " + Lf(d.atHog, 2);
      box.appendChild(table("small", ["", ["Largest", "r"], "Where", ["Allowed", "r"], ["Workload", "r"], "Status"], [
        h("tr", null, td("Bending moment"), tdr(Mf(mb.moment)), td(mSide), tdr(Mf(mb.momentAllowed)), tdr(pct(mb.momentUtil)), statusCell(mb.momentOver ? "Over" : "Good", mb.momentOver)),
        h("tr", null, td("Shear"), tdr(W(mb.shear, 1)), td("at " + Lf(d.atShear, 2)), tdr(W(mb.shearAllowed, 1)), tdr(pct(mb.shearUtil)), statusCell(mb.shearOver ? "Over" : "Good", mb.shearOver))
      ]));
      var kk3 = fmt(k, 3);
      // with self weight (1.18.0): each table entry also carries w_self x L^2 / 8 (moment) and w_self x L / 2 (shear)
      var ws = c.wSelf > 0 ? c.wSelf : 0;
      function qterm(q, div) { return q ? [fr(Wn(q.load, 0) + X + Ln(q.length, 3), String(div)), ws ? [" + ", fr(U.n("wpl", ws, 2) + X + Ln(q.length, 3) + "²", "8")] : null] : "-"; }
      var mLines = [
        ml("Allowed moment", [[mv("M", "allow"), " = ", mv("k"), X, "min(", fr(["CPL", X, mv("L")], "4"), ws ? [" + ", fr([mv("w", "self"), X, mv("L"), "²"], "8")] : null, ", ", fr(["UDL", X, mv("L")], "8"), ws ? [" + ", fr([mv("w", "self"), X, mv("L"), "²"], "8")] : null, ")"],
          [kk3 + X + "min(", qterm(at.point, 4), ", ", qterm(at.uniform, 8), ")"], [kk3 + X + Mf(c.moment)], Mf(mb.momentAllowed)]),
        mcmp("Moment", [mv("M", "max"), " (" + mSide + ")"], Mf(mb.moment), [mv("M", "allow"), " = " + Mf(mb.momentAllowed)], !mb.momentOver, pct(mb.momentUtil) + " workload"),
        ml("Allowed shear", [[mv("V", "allow"), " = ", mv("k"), X, fr(at.shear ? kindName(at.shear.kind) : "P", "2"), ws ? [" + ", fr([mv("w", "self"), X, mv("L")], "2")] : null],
          at.shear ? [kk3 + X + (ws ? "(" : ""), fr(Wn(at.shear.load, 0), "2"), ws ? [" + ", fr(U.n("wpl", ws, 2) + X + Ln(at.shear.length, 3), "2"), ")"] : null] : [W(c.shear, 1)], W(mb.shearAllowed, 1)]),
        mcmp("Shear", [mv("V", "max"), " (at " + Lf(d.atShear, 2) + ")"], W(mb.shear, 1), [mv("V", "allow"), " = " + W(mb.shearAllowed, 1)], !mb.shearOver, pct(mb.shearUtil) + " workload")
      ];
      box.appendChild(calcs(null, mLines, "Rows used: moment from " + rowOf(at.point, 4) + " and " + rowOf(at.uniform, 8) + "; shear from " + (at.shear ? kindName(at.shear.kind) + " " + Wn(at.shear.load, 0) + " at the " + at.shear.row + " " + at.shear.unit + " row" : "-") + ". Allowables are estimates from the tables, not published values."));
    }
    deflectionSection(box, res);
    return box;
  }
  /** Deflection check (F7, 1.25.0): each span's sag against L / n, and the cantilever tips (reported only). */
  function deflectionSection(box, res) {
    var dc = res.deflection; if (!dc) return;
    var maker = dc.source === "maker", IN = function (ft) { return U.f("inch", ft * 12, 2); };
    box.appendChild(para("Deflection check (F7) - limit L/" + dc.ratio + ": " + (maker ? dc.note + " (the maker's data sheet; past it the truss fails)" : "the rig default; the maker publishes no limit, so past it is a warning"), "sub"));
    var rows = dc.spans.map(function (sp) {
      var over = sp.util > 1 + 1e-9;
      return h("tr", null, td("Span " + sp.index + " (" + Ln(sp.from, 2) + " - " + Lf(sp.to, 2) + ")"), tdr(Ln(sp.length, 3)), tdr(IN(sp.max)), td("at " + Lf(sp.at, 2)), tdr(sp.max > 1e-9 ? "L/" + Math.round(sp.length / sp.max) : "-"), tdr(IN(sp.allowed)), tdr(pct(sp.util)),
        statusCell(!over ? "Good" : maker ? "Too much sag" : "Past L/" + dc.ratio + " (warning)", over && maker), td(shortModel(sp.model)));
    });
    (dc.cantilevers || []).forEach(function (c) {
      rows.push(h("tr", null, td("Cantilever, " + c.side + " end"), tdr(Ln(c.length, 3)), tdr(IN(c.tip)), td("at the tip"), tdr("-"), tdr("-"), tdr("-"), td("reported only", "mut"), td(shortModel(c.model))));
    });
    if (rows.length) box.appendChild(table("small", ["Segment", ["L (" + U.unit("len") + ")", "r"], ["Sag d", "r"], "Where", ["L/d", "r"], ["Allowed L/" + dc.ratio, "r"], ["Workload", "r"], "Status", "Joint model"], rows));
    var w = dc.spans.slice().sort(function (a, b) { return b.util - a.util; })[0];
    if (w) box.appendChild(calcs(null, [mcmp("Worst span", [mv("d"), " (span " + w.index + ")"], IN(w.max), [fr(mv("L"), String(dc.ratio)), " = " + IN(w.allowed)], w.util <= 1 + 1e-9, pct(w.util) + " workload")],
      "Sag measured from the line between the span's two supports; the drawing above exaggerates it."));
  }

  /* ---------------------------------------------------------------- plan drawing */
  /** A plan drawn for paper (not a copy of the screen): trusses to scale, coloured pass / fail, corner blocks,
   * load points, and hoists labelled H1, H2... as in the tables, with a scale bar. */
  function planFigure(hid) {
    var rig = S.rig, G = TLA.rig.geometry, NS = "http://www.w3.org/2000/svg";
    if (!rig.trusses.length) return null;
    var pts = [];
    rig.trusses.forEach(function (t) { pts.push(G.endPoint(t, 0), G.endPoint(t, t.length || 0)); });
    var x1 = Math.min.apply(null, pts.map(function (p) { return p.x; })), x2 = Math.max.apply(null, pts.map(function (p) { return p.x; }));
    var y1 = Math.min.apply(null, pts.map(function (p) { return p.y; })), y2 = Math.max.apply(null, pts.map(function (p) { return p.y; }));
    var VW = 1000, pad = 70, span = Math.max(x2 - x1, (y2 - y1) * 1.6, 1), sc = (VW - 2 * pad) / span;
    var VH = Math.max(260, Math.min(760, (y2 - y1) * sc + 2 * pad + 30));
    var ox = (VW - (x2 - x1) * sc) / 2 - x1 * sc, oy = (VH - 30 - (y2 - y1) * sc) / 2 + y2 * sc;
    function X(p) { return ox + p.x * sc; } function Y(p) { return oy - p.y * sc; }
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + VW + " " + VH); svg.setAttribute("class", "rplan");
    function add(tag, at, txt, parent) {
      var e = document.createElementNS(NS, tag);
      Object.keys(at).forEach(function (k) { e.setAttribute(k, at[k]); });
      if (txt != null) e.textContent = txt;
      (parent || svg).appendChild(e); return e;
    }
    var labels = [];
    rig.trusses.forEach(function (t) {
      if (t.isBlock) return;
      var res = S.results.trusses[t.id], bad = !res || TLA.plan.trussStatus(res).bad, a = G.endPoint(t, 0), b = G.endPoint(t, t.length || 0);
      add("line", { x1: X(a), y1: Y(a), x2: X(b), y2: Y(b), "class": "tr " + (bad ? "fail" : "ok"), "stroke-width": Math.max(4, TLA.rig.widthFt(t) * sc) });
      (t.loads || []).forEach(function (l) {
        [l.distance].concat(l.mirror && Math.abs(l.distance - t.length / 2) > 1e-7 ? [t.length - l.distance] : []).forEach(function (d) { var p = G.endPoint(t, d); add("circle", { cx: X(p), cy: Y(p), r: 3.2, "class": "ld" }); });
      });
      // names below a level truss and left of an upright one; hoist labels sit above-right, so they don't collide
      var m = G.endPoint(t, (t.length || 0) / 2), ang = (Number(t.angle) || 0) * Math.PI / 180, upright = Math.abs(Math.cos(ang)) < 0.5;
      labels.push({ x: X(m) - (upright ? 20 : 0), y: Y(m) + (upright ? 0 : 22), text: t.name, rot: upright ? -90 : 0, cls: "tn" });
    });
    rig.trusses.forEach(function (t) {
      if (!t.isBlock) return;
      var c = G.endPoint(t, (t.length || 0) / 2), half = Math.max(4, (t.length || 1) * sc / 2);
      add("rect", { x: X(c) - half, y: Y(c) - half, width: half * 2, height: half * 2, "class": "cb", transform: "rotate(" + (-(t.angle || 0)) + " " + X(c) + " " + Y(c) + ")" });
    });
    rig.trusses.forEach(function (t) {
      (t.supports || []).forEach(function (s) {
        if (s.kind !== "hoist") return;
        var p = G.endPoint(t, s.distance), id = hid[t.id + ":" + s.id], x = S.results.hoists.filter(function (q) { return q.truss === t.id && q.support === s.id; })[0];
        var bad = x && x.hoist.status !== "Good";
        add("circle", { cx: X(p), cy: Y(p), r: 9, "class": "ho" + (bad ? " fail" : "") });
        add("text", { x: X(p) + 11, y: Y(p) - 11, "class": "hn" + (bad ? " fail" : "") }, id || "");
      });
    });
    labels.forEach(function (l) { add("text", { x: l.x, y: l.y, "class": l.cls, "text-anchor": "middle", "dominant-baseline": "middle", transform: l.rot ? "rotate(" + l.rot + " " + l.x + " " + l.y + ")" : "" }, l.text); });
    // scale bar: a round length about a fifth of the drawing
    var metric = U.metric(), unitFt = metric ? 1 / FT_M : 1, target = span / 5 / unitFt, steps = [1, 2, 5, 10, 20, 25, 50, 100], len = steps[0];
    steps.forEach(function (v) { if (v <= target) len = v; });
    var bx = pad, by = VH - 18, bl = len * unitFt * sc;
    add("line", { x1: bx, y1: by, x2: bx + bl, y2: by, "class": "sb" }); add("line", { x1: bx, y1: by - 5, x2: bx, y2: by + 5, "class": "sb" }); add("line", { x1: bx + bl, y1: by - 5, x2: bx + bl, y2: by + 5, "class": "sb" });
    add("text", { x: bx + bl + 8, y: by + 4, "class": "sbt" }, len + (metric ? " m" : " ft"));
    add("text", { x: VW - pad, y: by + 4, "class": "sbt", "text-anchor": "end" }, "Plan, to scale. Green: truss checks pass, red: a check fails. Circles: hoists; squares: corner blocks; dots: loads.");
    return h("div", { "class": "rfig plan" }, svg);
  }

  /* ---------------------------------------------------------------- overlay */
  var FIELDS = [["project", "Project / event"], ["location", "Venue / location"], ["preparedBy", "Prepared by"], ["checkedBy", "Checked by"], ["notes", "Notes"]];
  /** Paper for the printed sheet (1.17.0): US Letter or A4, set in the rig setup and saved with the rig (in rig.report,
   * so it never changes the input fingerprint). Unset: Letter for imperial units, A4 for metric. */
  var PAPER = { letter: { page: "letter", label: "Letter (8.5 x 11 in)" }, a4: { page: "A4", label: "A4 (210 x 297 mm)" } };
  function paper() { var p = (S.rig.report || {}).paper; return PAPER[p] ? p : U.metric() ? "a4" : "letter"; }

  function open() {
    var host = $("report");
    if (!host) return;
    host.textContent = "";
    var rep = S.rig.report || {};
    var bar = h("div", { "class": "rbar" },
      h("b", { text: "Calculation sheet" }),
      FIELDS.map(function (f) {
        var i = h("input", { type: "text", value: rep[f[0]] || "", placeholder: f[1], title: f[1] + " - printed on the sheet and saved with the rig", "class": f[0] === "notes" ? "wide" : "" });
        i.addEventListener("input", function () {
          var r = S.rig.report || (S.rig.report = {});
          if (i.value.trim()) r[f[0]] = i.value; else delete r[f[0]];
          Array.prototype.forEach.call(host.querySelectorAll('[data-field="' + f[0] + '"]'), function (x) { x.textContent = i.value; x.classList.toggle("blank", !i.value.trim()); });
        });
        i.addEventListener("change", function () { S.persist(); });
        return i;
      }),
      h("span", { "class": "grow" }),
      h("button", { "class": "primary", text: "Print / save PDF", onclick: function () { window.print(); } }),
      h("button", { text: "Close", onclick: close }));
    host.appendChild(bar);
    var sheet;
    try { sheet = build(); } catch (err) { sheet = h("div", { "class": "sheet" }, para("Could not build the calculation sheet: " + err.message, "fail")); }
    sheet.classList.add("paper-" + paper());
    host.appendChild(sheet);
    var css = $("report-page") || document.head.appendChild(h("style", { id: "report-page" }));
    var foot = (S.rig.name || "rig") + " - Truss Grid Analyzer v" + TLA.VERSION + " - " + fingerprint(S.rig);
    css.textContent = "@page { size: " + PAPER[paper()].page + " portrait; @bottom-left { content: " + JSON.stringify(foot) + "; font: 8pt system-ui, sans-serif; color: #555; } @bottom-right { content: \"Page \" counter(page) \" of \" counter(pages); font: 8pt system-ui, sans-serif; color: #555; } }";
    host.hidden = false;
    document.body.classList.add("report-open");
    host.scrollTop = 0;
  }
  function close() {
    var host = $("report");
    if (host) { host.hidden = true; host.textContent = ""; }
    var css = $("report-page"); if (css) css.parentNode.removeChild(css);   // its page footer belongs to this sheet only
    document.body.classList.remove("report-open");
    S.persist();
  }

  TLA.report = {
    mount: function (store) {
      S = store;
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && document.body.classList.contains("report-open")) close(); });
    },
    open: open, close: close, build: build, paper: paper, PAPER: PAPER, isOpen: function () { return document.body.classList.contains("report-open"); }, fingerprint: fingerprint, lookup: lookup
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
