/* App wiring (1.18.0 shell: menus, steps, dock, rig settings drawer, theme). */
(function (g) {
  var TLA = g.TLA, S = TLA.store, U = TLA.units;
  function $(id) { return document.getElementById(id); }

  var DOCS = [
    "<h2>Truss Grid Analyzer " + TLA.VERSION + "</h2>",
    "<p>A rebuild of <b>Truss Load Analyzer - EOT</b>, created by <b>Delbert L. Hall and Jon Sogoian</b> (open-source freeware, based on their original program by Delbert Hall). The truss, chain hoist and fixture data come from their workbook. This version adds a truss-grid model where trusses are bolted to each other and hung from hoists.</p>",
    "<h3>Disclaimer</h3><p>This tool is intended for use by entertainment rigging professionals to assist them in making rigging decisions. Every attempt has been made to be accurate. However, the authors of the original program and of this rebuild are not responsible for errors in the program or the results of its use. <b>Users are responsible for verifying the results before using them to make rigging decisions.</b></p>",
    "<h3>Method and assumptions</h3><ul>",
    "<li>Each truss is a continuous beam with cantilevers, solved with Clapeyron's three-moment equation; reactions at supports are exact for the entered loads.</li>",
    "<li>Where a truss is bolted to another truss, its end reaction at that connection (plus any hardware weight, such as a corner block) is passed to the connected truss as a point load. Trusses are solved in order along the load path down to the hoists. Loops (A bolted to B and B bolted to A) are flagged, not solved. This matches how the original workbooks linked trusses. Since 1.3.0 it is shown for reference only (the Load path column): the whole-rig analysis below is the primary result.</li>",
    "<li><b>Truss data</b>: each truss's table is either the original Truss Load Analyzer workbook's (TLA) or the manufacturer's own data sheet (MFG - Tomcat, Christie Lites, James Thomas Engineering, Tyler Truss), with the source shown under the model. Where a workbook row allows more than the maker's current table at a span the rig actually has, the truss gets a warning naming the span and the maker's row to switch to.</li>",
    "<li><b>Corner-block rules</b>: where the maker publishes rules for its corner blocks (so far Christie Lites A Type), the app flags a box truss whose 90-degree corner blocks are not each supported by a hoist, and an unsupported block joining 4 or more sections (the maker allows only part of the truss capacity there). These are warnings only - the results are not changed.</li>",
    "<li><b>Bolted parts</b>: bolted truss and corner blocks only fit within one manufacturer's truss family - JTE 12x12 does not bolt to Christie A Type, even at the same size. The app warns (and draws the bolt red) when bolted parts don't match, including a generic or universal truss bolted to branded parts; generic, universal and custom parts it can't check get a note. A truss stacked on top or clamped below can be any family. It never stops you building the rig.</li>",
    "<li>Span and cantilever limits use the manufacturer tables, rounding the span up to the next foot. Maximum cantilever is one quarter of the maximum span. Point-load capacity of a span is the tabulated center point load, reduced by the share of the UDL capacity already used by any UDL.</li>",
    "<li><b>Checked against Rigging Math Made Simple</b> (Delbert L. Hall): reactions are the statics equations from the book (load x distance to the opposite leg / span, cantilever loads subtract on the far leg, truss weight added as a load at the center of the span and of each cantilever); a span is not overloaded if the point loads on it do not exceed the table CPL for that span, reduced by the share of the UDL capacity already used by any UDL; a cantilever must be no longer than a quarter of the maximum span and carry no more than the CPL for a span four times the cantilever length. By default the truss's self weight is added to the load on each cantilever, as the original workbook does (an option in Rig settings turns it off).</li>",
    "<li><b>Whole-rig analysis (primary, since 1.3.0)</b>: the load-path method treats every truss that carries another as an unyielding support. That is exact when the carrying truss is held up at each connection, but if a truss with its own hoist is bolted to a carrier that has no hoist near the connection, the carrier sags and the bolted truss sheds load to its own hoist, which the load-path method under-estimates (in a test rig by more than 2 times). So the app runs a whole-rig analysis (a finite element analysis, FEA, of the grid - engineers call this a grillage): a matrix (direct-stiffness) analysis of the box as beams meeting at the corner blocks, the standard technique for a bolted grid such as a bridge deck. Hoist loads, the forces in the bolted connections, the loads each span and cantilever check sees, and the bending moment and shear used by the moment and shear check (below) all come from this solve - with rigid joints that includes moment passed through the corner blocks. Since no manufacturer publishes a stiffness for the corner-block hardware itself, the joints are modelled several ways and shown side by side - hinged (the bolt carries vertical force only), semi-rigid (since 1.4.0: the block as a rotational spring of 1, 4 and 16 x EI/L of the lighter truss it joins, the range between nominally pinned and rigid, because a hoist's share can peak in between) and rigid (bending and torsion also pass through the block, the textbook grillage assumption, and the one an independent 3D frame analysis of a similar grid also implies). Every check uses the worst of them: a hoist's total static, dynamic load and status use the largest load, and each truss is checked with the joint model that loads it hardest (named on the truss).</li>",
    "<li><b>Truss stiffness (since 1.4.0)</b>: a lattice truss is not a solid beam. It bends through its chords (so its bending stiffness EI grows with about the square of its depth), shears through its diagonals (on short spans that is a large part of its deflection, so each truss is a Timoshenko beam with a shear stiffness GA), and twists through the diagonals of all its faces working as a closed tube (GJ). Chord and diagonal sizes are not in the tables, so they are <b>estimated from the tables</b>: the largest moment the tables demonstrate is carried by the chords at one effective chord stress (calibrated so a 20.5 in box comes out at the stiffness of 2 x 0.125 in chords, which also matches the maker's published deflection in Rigging Math Made Simple), the diagonals are taken as 0.3 x the chord area at 45 degrees. Real chord and diagonal sizes in the truss data (a <i>section</i> entry: chord and diagonal OD and wall, panel length) replace the estimate. The stiffness used is shown on each truss; scale it with its Stiffness (x) field. Depth: a truss named AxB is taken as A wide and B deep, as the views draw it.</li>",
    "<li><b>Hoists and level sensitivity (since 1.4.0)</b>: hoists are rigid supports at one level unless you give a hoist stiffness (lb per inch of stretch, for the hoist and its chain) in Rig settings. The Level sensitivity column shows how much a hoist's load changes if it runs 1/4 in high (or low) - on short, stiff spans that can be hundreds of pounds, so a hoist whose level sensitivity passes 10% of its capacity is flagged: level the hoists carefully, or check with a hoist stiffness.</li>",
    "<li><b>Cross-check</b>: <i>Export whole-rig model</i> (Export menu) saves the rig's whole-rig model with this app's results; <code>python tools/pynite_check.py file</code> rebuilds it in PyNite, the 3D frame engine behind CalcForge, and compares hoist reactions and member forces (without shear deformation, which PyNite doesn't model). If the whole-rig analysis can't run (a load-path loop, or a very large rig) the app says so and falls back to the load-path method.</li>",
    "<li><b>Moment and shear check</b>: the span and cantilever checks compare each span on its own with the tables. A continuous truss also bends over its supports (hogging) from loads in the next span, and a heavy load right beside a support puts most of its weight into shear. So the bending moment and shear are also worked out all along the truss (shown under its diagram) and compared with an allowable moment and shear <b>estimated from the manufacturer's tables</b>: every table entry is a load the maker says the truss carries, so it demonstrates a moment (point load x span / 4, or uniform load x span / 8) and a shear (half the load). The allowable moment is the largest the tables demonstrate - the smaller of the point-load and uniform-load figures - and the allowable shear the largest shear any entry demonstrates (a safe-side estimate), both with the repetitive-use factor. The tables are loads on top of the truss's own weight, so by default (as Delbert Hall's Stress Table Creator does) each entry's moment and shear also include the self weight (+ w x span^2 / 8 and + w x span / 2), and the moments and shears checked include it too; the option in Rig settings leaves self weight out of both. These are estimates, not published values; use the maker's published moment and shear where you have them.</li>",
    "<li><b>Slack hoists</b>: a chain can only pull. If the loads would push a hoist up (a negative reaction - typically a hoist next to a heavily loaded span or cantilever), its chain goes slack: the hoist is shown as <b>Slack</b>, carries only its own weight, and the truss is solved again without it, so the other hoists and the span checks see the real, longer spans. If that leaves a truss with a single support point, it would tip: it is flagged <b>UNSTABLE</b> and its numbers must not be used.</li>",
    "<li><b>Units</b>: the Units setting in Rig settings shows and takes everything in feet and pounds or in metres and kilograms (moments in kg·m, hoist speed in m/min, sizes in mm). Only the display changes: the rig is stored and solved the same way, so every result and every truss or hoist choice stays exactly as it was. Trusses whose manufacturer data is metric are checked against their own metric table in either mode.</li>",
    "<li>Loads are based on ANSI repetitive-use rules: capacities are multiplied by 0.85 unless the truss data is marked as already including the repetitive-use factor (the generic <i>Universal</i> trusses from EOT 2.4 use 0.75).</li>",
    "<li>Hoist status compares the <b>static</b> load with capacity (as the original). Dynamic load = static x the hoist's dynamic load factor (speed fpm / 60 + 1, so 16 fpm = 1.267, as in EOT 2.4; a hoist with no listed speed uses the default 1.25, and any hoist can be given its own factor) and is flagged separately when it exceeds capacity.</li>",
    "<li><b>Cantilever</b>: the part of a truss that extends past its outermost support (a hoist or a bolted connection). The ANSI standards supplied (E1.2 and others) do not define it; the tool uses the rule in the original workbook and in manufacturer guidance: the maximum cantilever is one quarter of the maximum span, and the load on a cantilever must not exceed the manufacturer's center point load (CPL) for a span four times the cantilever length. Span (ANSI E1.2, 2.33) is the distance between support points.</li>",
    "<li><b>Corner blocks</b>: trusses are bolted together at corner blocks, which are special short trusses with their own weight. The block type comes from the Christie Lites and James Thomas Engineering catalogues (weights as published on their product pages; blocks that use end/face plates add weight per truss bolted on, and bolt-on blocks default to the middle published bolt count). The truss it is bolted through carries the block, and every truss bolted to it passes its end reaction into the block. Faces used are counted (a truss ending at the block uses 1, one running through it uses 2) and compared with the block's ways. Where a maker publishes no weight, enter your own on the block. Truss lengths are measured center to center of the blocks in the plan.</li>",
    "<li>Truss self weight is spread uniformly over the whole length, including cantilevers. Hoist and chain weight are added after the analysis.</li>",
    "<li>Mirror loads: a load can be mirrored about the truss centerline; the twin follows edits to the original.</li>",
    "<li><b>Deflection (since 1.18.0)</b>: each truss's deflected shape comes from the whole-rig analysis (exact for the beam model between its nodes: bending plus shear, with the stiffness estimated from the tables, so it is an estimate). Each span's sag is measured from the straight line between its two supports - so a carrier truss sagging under a bolted truss, or a hoist stretching, is not counted against the span - and compared with the maker's published limit (Tomcat L/100, the JTE sheets that state L/160) or, where the maker publishes none, the rig default in Rig settings (L/160). Past a maker's limit the truss is Overloaded (the maker's allowable loads are set by that limit); past the rig default it is a warning. Cantilever tips are shown, not checked (the makers' limits are for simple spans).</li>",
    "<li><b>Hot spots (since 1.18.0)</b>: a colour mode that shades each truss along its length by its local workload - the worst of its span or cantilever table check and the bending moment and shear against their allowables at each point - to show where a truss is loaded most. The Checks section of a truss shows the same strip with the peak, the support reactions and the deflected shape.</li>",
    "<li><b>Calc sheet</b>: a printable record of the calculation for a second person to check - every input, the formulas with the numbers put in, the table row each capacity is read from, each check, each hoist's load worked out part by part, and the equilibrium self-checks - with signature boxes for the person who prepared it and the person who checked it. Print it or save it as PDF.</li></ul>",
    "<h3>Version history</h3><ul>" + TLA.CHANGES.map(function (c) { return "<li><b>" + c[0] + "</b> (" + c[1] + ", " + c[2] + "): " + c[3] + "</li>"; }).join("") + "</ul>",
    "<h3>License terms of the original</h3><p>Free to distribute. Anyone distributing a modified version must give credit to Delbert L. Hall and Jon Sogoian as the originators, update the history to show what was changed, and not charge for new versions. The person modifying the program is responsible for the results of those modifications.</p>",
    "<h3>History</h3><ul><li>Original Truss Load Analyzer - EOT v1.0 - 2.1 (2020-2021), Hall &amp; Sogoian.</li><li>Truss Grid Analyzer (this rebuild): offline web version with truss-grid load paths, plan view, mirrored loads.</li></ul>",
    "<p><button id=\"docs-close\">Close</button></p>"
  ].join("");

  /* 1.18.0 shell: steps 1 Structure -> 2 Loads -> 3 Hoists -> 4 Results; any step at any time. */
  var ui = { step: 1, rtab: "t", settings: false };
  try { var sv0 = JSON.parse(localStorage.getItem("tla-shell") || "null"); if (sv0) { ui.step = sv0.step || 1; ui.rtab = sv0.rtab || "t"; } } catch (e0) { /* ignore */ }
  function saveShell() { try { localStorage.setItem("tla-shell", JSON.stringify({ step: ui.step, rtab: ui.rtab })); } catch (e) { /* ignore */ } }
  var P = null, h = null;

  function legend() {
    var mode = S.ui.colorMode, items;
    if (mode === "hot") {
      $("legend").innerHTML = '<div class="lbl-sm">Local workload</div><div style="height:9px;width:170px;border-radius:2px;background:linear-gradient(90deg,' + [0, 0.5, 0.8, 1, 1.5].map(function (u) { return P.heat(u) + " " + (u / 1.5 * 100) + "%"; }).join(",") + ')"></div>' +
        '<div style="display:flex;justify-content:space-between;width:170px;font:10px var(--mono);color:var(--muted)"><span>0</span><span>50</span><span>80</span><span>100</span><span>150%</span></div><div class="mini">Each span&#39;s table check follows its bending moment, so the colour peaks under the loads. A glow marks the peak of any truss at 80%+.</div>';
      return;
    }
    items = mode === "status" ? [["ok", "OK"], ["fail", "Overloaded or unstable"]] : [["ok", (mode === "hoist" ? "Hoist workload" : "Workload") + " low (under 80%)"], ["warn", "High (80-100%)"], ["fail", "Overloaded (over 100%)"]];
    $("legend").innerHTML = items.map(function (i) { return '<div><i style="background:var(--' + i[0] + ')"></i>' + i[1] + "</div>"; }).join("") +
      '<div><svg width="14" height="14" viewBox="0 0 14 14" style="margin-right:4px;vertical-align:-3px"><path d="M0 7H14M7 0V14" stroke="var(--hoist)" stroke-width="1.6"/><circle cx="7" cy="7" r="4" fill="var(--panel)" stroke="var(--hoist)" stroke-width="1.8"/><circle cx="7" cy="7" r="1.3" fill="var(--hoist)"/></svg>Hoist: high hook static, <em>dynamic</em> (amber = high, red = overloaded)</div><div><i style="background:var(--ink);transform:rotate(45deg) scale(.8)"></i>Bolted connection</div>';
  }

  function counts() {
    var r = S.results, trs = S.rig.trusses.filter(function (t) { return !t.isBlock; });
    var loads = trs.reduce(function (a, t) { return a + t.loads.length; }, 0);
    var warns = r.warnings.filter(function (w) { return w.level !== "note"; }).length;
    var bad = r.hoists.filter(function (x) { return x.hoist.status !== "Good"; }).length + trs.filter(function (t) { var rr = r.trusses[t.id]; return !rr || TLA.plan.trussStatus(rr).bad; }).length;
    var maxW = r.hoists.reduce(function (m, x) { return x.hoist.capacity < 999999 ? Math.max(m, x.hoist.staticLoad / x.hoist.capacity) : m; }, 0);
    return { trusses: trs.length, loads: loads, hoists: r.hoists.length, warns: warns, bad: bad, maxW: maxW };
  }

  function stepsBar(c) {
    var lab = { 1: c.trusses + " truss" + (c.trusses === 1 ? "" : "es"), 2: String(c.loads), 3: String(c.hoists), 4: c.bad ? "✕" + c.bad : c.warns ? "▲" + c.warns : "✓" };
    var done = { 1: c.trusses > 0, 2: c.loads > 0, 3: c.hoists > 0 && !c.bad, 4: false };
    Array.prototype.forEach.call(document.querySelectorAll("#stages button"), function (b) {
      var n = +b.getAttribute("data-step"), sm = b.querySelector("small");
      b.classList.toggle("on", n === ui.step); b.classList.toggle("done", done[n] && n !== ui.step);
      sm.textContent = lab[n]; sm.className = n === 4 ? (c.bad ? "f" : c.warns ? "w" : "") : "";
    });
    var add = $("b-add");
    add.textContent = ["", "+ Truss", "+ Load", "+ Hoist", "Calc sheet"][ui.step];
  }
  function verdict(c) {
    var v = $("verdict");
    v.innerHTML = (c.trusses ? (c.bad ? '<span class="fail">● ' + c.bad + " to check</span>" : '<span class="ok">● All OK</span>') : '<span class="m">No trusses yet</span>') +
      (c.hoists ? '<span class="m">' + c.hoists + " hoists · max " + Math.round(c.maxW * 100) + "%</span>" : "") + (c.warns ? '<span class="w">▲ ' + c.warns + " warning" + (c.warns === 1 ? "" : "s") + "</span>" : "");
  }
  function modebar() {
    var pk = S.ui.pick, mb = $("modebar");
    document.body.classList.toggle("picking", !!pk);
    if (!pk) { mb.hidden = true; return; }
    var t = S.truss(pk.truss || pk.block);
    mb.hidden = false; mb.textContent = "";
    mb.appendChild(document.createTextNode(pk.kind === "block" ? "Bolt " + (t ? t.name : "the truss") + ": click a corner block" : "Bolt to " + (t ? t.name : "the block") + (pk.side ? " (" + pk.side + " face)" : "") + ": click a truss"));
    mb.appendChild(h("button", { text: "Cancel (Esc)", onclick: function () { S.ui.pick = null; renderAll(); } }));
  }

  function dockHead(step) {
    var d = $("dhead"); d.textContent = "";
    var title = { 1: ["Structure", "All trusses: type, length, position and bolting"], 2: ["Loads", "Every load on the rig, grouped by truss"], 3: ["Hoists", "Hoist points, with live results"], 4: ["Results", "Checks, totals and warnings"] }[step];
    d.appendChild(h("span", { "class": "title", text: title[0] }));
    if (step === 4) {
      var tabs = h("div", { "class": "ptabs" });
      [["t", "Trusses"], ["h", "Hoists"], ["w", "Warnings"]].forEach(function (x) {
        var c = counts(), n = x[0] === "w" ? c.warns : x[0] === "h" ? c.hoists : c.trusses;
        tabs.appendChild(h("button", { "class": ui.rtab === x[0] ? "on" : "", onclick: function () { ui.rtab = x[0]; saveShell(); renderAll(); } }, x[1], h("span", { "class": "cnt" + (x[0] === "w" && n ? " w" : ""), text: String(n) })));
      });
      d.appendChild(tabs);
      d.appendChild(h("span", { "class": "grow" }));
      d.appendChild(h("button", { "class": "ghost", text: "⧉ Copy hoist table", onclick: copyCsv }));
      return;
    }
    d.appendChild(h("span", { "class": "mini", text: title[1] }));
    d.appendChild(h("span", { "class": "grow" }));
    if (step === 2) d.appendChild(h("label", { "class": "chk", title: "While you type in this grid the plan shrinks to a strip of the truss you are on" }, h("input", { type: "checkbox", checked: TLA.grids.showPlan() === false ? false : true, onchange: function (e) { TLA.grids.showPlan(!e.target.checked); } }), "Collapse plan while typing"));
    if (step === 3) {
      d.appendChild(h("label", { "class": "chk", title: "Show the load-path (reference) and each whole-rig joint model" }, h("input", { type: "checkbox", checked: TLA.grids.compare(), onchange: function (e) { TLA.grids.compare(e.target.checked); renderAll(); } }), "Compare analysis methods"));
      var ch = h("input", { type: "text", "class": "num w50", placeholder: U.metric() ? "6" : "20", title: "Chain length for every hoist" });
      d.appendChild(h("span", { "class": "vr" }));
      d.appendChild(h("span", { "class": "lbl-sm", text: "Chain" })); d.appendChild(ch);
      d.appendChild(h("button", { "class": "ghost", text: "Set all", onclick: function () { var v = P.parseShownLen(ch.value); if (v >= 0) S.setChains(v, null); else { ch.classList.add("bad"); ch.focus(); } } }));
    }
    d.appendChild(h("span", { "class": "vr" }));
    d.appendChild(h("span", { "class": "keys" }, h("span", null, h("span", { "class": "kbd", text: "Tab" }), "next"), h("span", null, h("span", { "class": "kbd", text: "Enter" }), "down"), h("span", null, h("span", { "class": "kbd", text: "Ctrl D" }), "fill down"), h("span", null, h("span", { "class": "kbd", text: "Ctrl V" }), "paste")));
    d.appendChild(h("button", { "class": "ghost", text: "⧉ Copy", title: "Copy this grid (tab-separated, for Excel)", onclick: function () { var t = TLA.grids.tsv(); if (navigator.clipboard) navigator.clipboard.writeText(t); } }));
  }

  function renderAll() {
    var c = counts();
    $("rigname").textContent = S.rig.name;
    Array.prototype.forEach.call(document.querySelectorAll("#s-color button"), function (b) { b.classList.toggle("on", b.getAttribute("data-color") === S.ui.colorMode); });
    Array.prototype.forEach.call(document.querySelectorAll("#views button"), function (b) { b.classList.toggle("on", b.getAttribute("data-view") === S.ui.tab); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-set]"), function (b) { b.classList.toggle("on", b.getAttribute("data-theme-set") === theme()); });
    verdict(c); stepsBar(c); modebar();
    if (ui.settings) { P.settings($("setpage")); return; }
    if (S.ui.tab !== "plan" && S.ui.tab !== "iso") return;
    legend();
    if (S.ui.tab === "iso") {
      TLA.iso.render();
      var v = S.ui.iso; if (v) { $("r-yaw").value = v.yaw; $("r-pitch").value = v.pitch; }
    } else TLA.plan.render();
    P.inspector($("inspector"));
    dockHead(ui.step);
    if (ui.step === 4) { TLA.grids.leave(); P.results($("summary"), ui.rtab); }
    else TLA.grids.show($("summary"), ui.step);
  }

  function setStep(n, tab) {
    if (ui.settings) openSettings(false);
    if (n !== ui.step) TLA.grids.leave();
    ui.step = n; if (tab) ui.rtab = tab;
    saveShell();
    if (S.ui.tab !== "plan" && S.ui.tab !== "iso") setTab("plan");
    renderAll();
    window.dispatchEvent(new Event("resize"));
  }
  function setTab(name) {
    if (ui.settings) { ui.settings = false; $("setpage").hidden = true; $("b-settings").classList.remove("primary"); }
    S.ui.tab = name;
    var rig = name === "plan" || name === "iso";
    $("main").hidden = !rig; $("page").hidden = rig;
    $("plan").hidden = name !== "plan"; $("iso").hidden = name !== "iso"; $("isoctl").hidden = name !== "iso";
    if (rig) { renderAll(); return; }
    var page = $("page"); page.textContent = "";
    var label = { circular: "Circular truss", udl: "Simple UDL", fixtures: "Fixture weights", databases: "Databases" }[name];
    page.appendChild(h("div", { "class": "row-btns", style: "margin:0 0 12px" }, h("button", { text: "‹ Back to the rig", onclick: function () { setTab("plan"); } }), h("b", { text: label })));
    var box = h("div"); page.appendChild(box);
    TLA.tools.show(name, box);
    renderAll();
  }
  /** Rig settings take over the page (1.18.0); Back or Esc returns to where you were. */
  function openSettings(on) {
    ui.settings = on === undefined ? !ui.settings : !!on;
    var rig = S.ui.tab === "plan" || S.ui.tab === "iso";
    $("setpage").hidden = !ui.settings;
    $("main").hidden = ui.settings || !rig; $("page").hidden = ui.settings || rig;
    $("b-settings").classList.toggle("primary", ui.settings);
    renderAll();
    if (!ui.settings) window.dispatchEvent(new Event("resize"));
  }
  function theme() { try { return localStorage.getItem("tla-theme") || "dark"; } catch (e) { return "dark"; } }
  function setTheme(t) {
    try { localStorage.setItem("tla-theme", t); } catch (e) { /* ignore */ }
    var light = t === "light" || (t === "system" && window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
    renderAll();
  }
  function copyCsv() {
    var csv = P.hoistsCsv();
    if (navigator.clipboard) navigator.clipboard.writeText(csv);
  }
  function closePops(except) { Array.prototype.forEach.call(document.querySelectorAll(".pop"), function (p) { if (p !== except) p.hidden = true; }); }

  function init() {
    P = TLA.panels; h = P.h;
    S.init();
    TLA.plan.mount(S, $("plan"));
    P.mount(S);
    TLA.grids.mount(S);
    TLA.tools.mount(S);
    TLA.iso.mount(S, $("iso"));
    TLA.report.mount(S);
    S.on(renderAll);
    TLA.app = { step: function () { return ui.step; }, setStep: setStep, renderAll: renderAll, openSettings: openSettings, setTheme: setTheme };
    if (!S.rig.trusses.length) ui.step = 1;

    // menus
    Array.prototype.forEach.call(document.querySelectorAll("[data-pop]"), function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); var p = $(b.getAttribute("data-pop")), was = p.hidden; closePops(p); p.hidden = !was; });
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".pop")) closePops(); });
    Array.prototype.forEach.call(document.querySelectorAll(".pop button"), function (b) { b.addEventListener("click", function () { closePops(); }); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-tab]"), function (b) { b.onclick = function () { setTab(b.getAttribute("data-tab")); }; });
    Array.prototype.forEach.call(document.querySelectorAll("#views button"), function (b) { b.onclick = function () { setTab(b.getAttribute("data-view")); }; });
    Array.prototype.forEach.call(document.querySelectorAll("#stages button"), function (b) { b.onclick = function () { setStep(+b.getAttribute("data-step")); }; });
    Array.prototype.forEach.call(document.querySelectorAll("#s-color button"), function (b) { b.onclick = function () { S.ui.colorMode = b.getAttribute("data-color"); S.persist(); renderAll(); }; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-set]"), function (b) { b.onclick = function () { setTheme(b.getAttribute("data-theme-set")); }; });
    $("r-yaw").oninput = function (e) { S.ui.iso.yaw = parseFloat(e.target.value); TLA.iso.render(); };
    $("r-pitch").oninput = function (e) { S.ui.iso.pitch = parseFloat(e.target.value); TLA.iso.render(); };

    $("b-new").onclick = function () { if (confirm("Start a new empty rig? (Undo can bring the current one back.)")) { S.newRig(); ui.step = 1; saveShell(); S.ui.fit = true; S.emit(); } };
    $("b-sample").onclick = function () { S.newRig(); TLA.samples.box(S); S.commit({ noUndo: true }); S.ui.fit = true; S.emit(); };
    (function () {
      var main = $("main"), KEY = "tla-layout2", DEF = { w: 400, h: 330 }, lay = { w: DEF.w, h: DEF.h };
      try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) lay = { w: sv.w || DEF.w, h: sv.h || DEF.h }; } catch (e) { /* ignore */ }
      function apply() {
        lay.w = Math.max(320, Math.min(lay.w, main.clientWidth - 320)); lay.h = Math.max(120, Math.min(lay.h, main.clientHeight - 150));
        main.style.setProperty("--side-w", lay.w + "px"); main.style.setProperty("--bottom-h", lay.h + "px");
      }
      function handle(cls, move) {
        var hd = document.createElement("div"); hd.className = "split " + cls; hd.title = "Drag to resize, double-click to reset"; main.appendChild(hd);
        hd.addEventListener("pointerdown", function (e) {
          e.preventDefault(); hd.setPointerCapture(e.pointerId); hd.classList.add("drag");
          var r = main.getBoundingClientRect();
          function mv(ev) { move(ev, r); apply(); window.dispatchEvent(new Event("resize")); }
          function up() { hd.classList.remove("drag"); hd.removeEventListener("pointermove", mv); hd.removeEventListener("pointerup", up); try { localStorage.setItem(KEY, JSON.stringify(lay)); } catch (e2) { /* ignore */ } }
          hd.addEventListener("pointermove", mv); hd.addEventListener("pointerup", up);
        });
        hd.addEventListener("dblclick", function () { lay = { w: DEF.w, h: DEF.h }; apply(); window.dispatchEvent(new Event("resize")); try { localStorage.removeItem(KEY); } catch (e3) { /* ignore */ } });
      }
      handle("split-v", function (ev, r) { lay.w = r.right - ev.clientX; });
      handle("split-h", function (ev, r) { lay.h = r.bottom - ev.clientY; });
      window.addEventListener("resize", apply); apply();
    })();
    $("b-add").onclick = function () {
      var t = S.sel.truss && S.truss(S.sel.truss);
      if (ui.step === 4) { TLA.report.open(); return; }
      if (ui.step === 1 || !t) { S.addTruss({ hoists: [] }); return; }
      if (ui.step === 2) { var l = P.newLoad(t); S.sel = { truss: t.id, support: null, load: l.id }; S.commit(); return; }
      var sp = S.addHoist(t.id); if (sp) S.select({ truss: t.id, support: sp.id });
    };
    $("b-fit").onclick = function () { if (S.ui.tab === "iso") TLA.iso.fit(); else TLA.plan.fit(); };
    $("b-zin").onclick = function () { TLA.plan.zoom(1.25); };
    $("b-zout").onclick = function () { TLA.plan.zoom(0.8); };
    $("b-undo").onclick = function () { S.undo(); };
    $("b-redo").onclick = function () { S.redo(); };
    $("c-loads").onchange = function (e) { S.ui.showLoads = e.target.checked; renderAll(); };
    $("c-labels").onchange = function (e) { S.ui.showLabels = e.target.checked; renderAll(); };
    $("verdict").onclick = function () { setStep(4, counts().warns ? "w" : "t"); };
    $("b-settings").onclick = function () { openSettings(); };
    $("b-img").onclick = saveImage;
    $("b-print").onclick = function () { window.print(); };
    $("b-report").onclick = function () { TLA.report.open(); };
    $("b-csv").onclick = copyCsv;
    $("b-model").onclick = function () { P.exportModel(); };
    $("b-save").onclick = function () {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([S.exportJSON()], { type: "application/json" }));
      a.download = (S.rig.name || "rig").replace(/[^\w\- ]+/g, "") + ".rig.json"; a.click();
    };
    $("b-open").onclick = function () { $("f-open").click(); };
    $("f-open").onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () { try { S.importJSON(r.result); S.ui.fit = true; S.emit(); } catch (err) { alert("Could not open file: " + err.message); } };
      r.readAsText(f); e.target.value = "";
    };
    $("b-docs").onclick = function () { var d = $("docs"); d.innerHTML = DOCS; d.showModal(); $("docs-close").onclick = function () { d.close(); }; };
    $("appver").textContent = "v" + TLA.VERSION;
    $("rigname").onclick = function () { var n = prompt("Rig name", S.rig.name); if (n) { S.rig.name = n; S.commit(); } };

    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      if (TLA.report.isOpen()) return;      // the sheet shows the rig as it was when opened: no edits behind it
      if (e.key === "Escape") {
        if (S.ui.pick) { S.ui.pick = null; renderAll(); return; }
        if (ui.settings && !/INPUT|SELECT|TEXTAREA/.test(tag)) { openSettings(false); return; }
        closePops();
      }
      if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? S.redo() : S.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); S.redo(); }
      else if (e.ctrlKey || e.metaKey || e.altKey) return;
      else if ((e.key === "Delete" || e.key === "Backspace") && S.sel.truss && S.sel.load) { var tl = S.truss(S.sel.truss); e.preventDefault(); if (tl) { tl.loads = tl.loads.filter(function (l) { return l.id !== S.sel.load; }); S.sel = { truss: tl.id, support: null, load: null }; S.commit(); } }
      else if ((e.key === "Delete" || e.key === "Backspace") && S.sel.truss && S.sel.support) { e.preventDefault(); S.removeSupport(S.sel.truss, S.sel.support); }
      else if ((e.key === "Delete" || e.key === "Backspace") && S.sel.truss) { var t = S.truss(S.sel.truss); if (t && confirm("Delete " + t.name + "?")) S.removeTruss(t.id); }
      else if (e.key.toLowerCase() === "r" && S.sel.truss) { var t2 = S.truss(S.sel.truss); if (t2 && !t2.anchor && !t2.isBlock) { t2.angle = ((t2.angle || 0) + 90) % 360; S.commit(); } }
      else if (e.key.toLowerCase() === "f") { $("b-fit").click(); }
      else if (/^[1-4]$/.test(e.key)) { setStep(+e.key); }
    });
    if (window.matchMedia) matchMedia("(prefers-color-scheme: light)").addEventListener("change", function () { if (theme() === "system") setTheme("system"); });

    S.emit();
    if (S.ui.fit) { S.ui.fit = false; TLA.plan.fit(); }
  }

  /** Rasterise the visible plan/3D SVG to a PNG (styles inlined so it is self-contained). */
  function saveImage() {
    var host = S.ui.tab === "iso" ? $("iso") : $("plan"), src = host.querySelector("svg");
    if (!src) return;
    var clone = src.cloneNode(true), a = src.querySelectorAll("*"), b = clone.querySelectorAll("*");
    var props = ["fill", "stroke", "stroke-width", "stroke-dasharray", "opacity", "font-size", "font-weight", "paint-order", "text-anchor", "stroke-linecap"];
    for (var i = 0; i < a.length; i++) {
      var cs = getComputedStyle(a[i]), st = "";
      props.forEach(function (p) { st += p + ":" + cs.getPropertyValue(p) + ";"; });
      b[i].setAttribute("style", st);
    }
    var W = src.getAttribute("width"), H = src.getAttribute("height");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", W); bg.setAttribute("height", H); bg.setAttribute("fill", getComputedStyle(host).backgroundColor === "rgba(0, 0, 0, 0)" ? "#ffffff" : getComputedStyle(host).backgroundColor);
    clone.insertBefore(bg, clone.firstChild);
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    var img = new Image();
    img.onload = function () {
      var c = document.createElement("canvas"); c.width = W * 2; c.height = H * 2;
      var ctx = c.getContext("2d"); ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
      c.toBlob(function (blob) {
        var l = document.createElement("a"); l.href = URL.createObjectURL(blob);
        l.download = (S.rig.name || "rig").replace(/[^\w\- ]+/g, "") + (S.ui.tab === "iso" ? "-3d" : "-plan") + ".png"; l.click();
      });
    };
    img.src = url;
  }

  window.addEventListener("DOMContentLoaded", init);
})(typeof globalThis !== "undefined" ? globalThis : window);
