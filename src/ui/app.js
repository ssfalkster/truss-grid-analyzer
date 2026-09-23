/* App wiring. */
(function (g) {
  var TLA = g.TLA, S = TLA.store;
  function $(id) { return document.getElementById(id); }

  var DOCS = [
    "<h2>Truss Grid Analyzer " + TLA.VERSION + "</h2>",
    "<p>A rebuild of <b>Truss Load Analyzer - EOT</b>, created by <b>Delbert L. Hall and Jon Sogoian</b> (open-source freeware, based on their original program by Delbert Hall). The truss, chain hoist and fixture data come from their workbook. This version adds a truss-grid model where trusses are bolted to each other and hung from hoists.</p>",
    "<h3>Disclaimer</h3><p>This tool is intended for use by entertainment rigging professionals to assist them in making rigging decisions. Every attempt has been made to be accurate. However, the authors of the original program and of this rebuild are not responsible for errors in the program or the results of its use. <b>Users are responsible for verifying the results before using them to make rigging decisions.</b></p>",
    "<h3>Method and assumptions</h3><ul>",
    "<li>Each truss is a continuous beam with cantilevers, solved with Clapeyron's three-moment equation; reactions at supports are exact for the entered loads.</li>",
    "<li>Where a truss is bolted to another truss, its end reaction at that connection (plus any hardware weight, such as a corner block) is passed to the connected truss as a point load. Trusses are solved in order along the load path down to the hoists. Loops (A bolted to B and B bolted to A) are flagged, not solved. This matches how the original workbooks linked trusses. Since 1.3.0 it is shown for reference only (the Load path column): the stiffness solve below is the primary result.</li>",
    "<li><b>Bolted parts</b>: bolted truss and corner blocks only fit within one manufacturer's truss family - JTE 12x12 does not bolt to Christie A Type, even at the same size. The app warns (and draws the bolt red) when bolted parts don't match, including a generic or universal truss bolted to branded parts; generic, universal and custom parts it can't check get a note. A truss stacked on top or clamped below can be any family. It never stops you building the rig.</li>",
    "<li>Span and cantilever limits use the manufacturer tables, rounding the span up to the next foot. Maximum cantilever is one quarter of the maximum span. Point-load capacity of a span is the tabulated center point load, reduced by the share of the UDL capacity already used by any wall weight.</li>",
    "<li><b>Checked against Rigging Math Made Simple</b> (Delbert L. Hall): reactions are the statics equations from the book (load x distance to the opposite leg / span, cantilever loads subtract on the far leg, truss weight added as a load at the center of the span and of each cantilever); a span is not overloaded if the point loads on it do not exceed the table CPL for that span, reduced by the share of the UDL capacity already used by any wall weight; a cantilever must be no longer than a quarter of the maximum span and carry no more than the CPL for a span four times the cantilever length. Manufacturers' tables already subtract the truss weight, so the truss's own weight is not counted against those limits unless you tick the stricter option below the plan.</li>",
    "<li><b>Stiffness solve (primary, since 1.3.0)</b>: the load-path method treats every truss that carries another as an unyielding support. That is exact when the carrying truss is held up at each connection, but if a truss with its own hoist is bolted to a carrier that has no hoist near the connection, the carrier sags and the bolted truss sheds load to its own hoist, which the load-path method under-estimates (in a test rig by more than 2 times). So the app solves the whole rig with the grillage method: a matrix (direct-stiffness) analysis of the box as beams meeting at the corner blocks, the standard technique for a bolted grid such as a bridge deck. Hoist loads, the forces in the bolted connections, the loads each span and cantilever check sees, and the bending moment and shear used by the moment and shear check (below) all come from this solve - with rigid joints that includes moment passed through the corner blocks. Since no manufacturer publishes a stiffness for the corner-block hardware itself, the joints are modelled several ways and shown side by side - hinged (the bolt carries vertical force only), semi-rigid (since 1.4.0: the block as a rotational spring of 1, 4 and 16 x EI/L of the lighter truss it joins, the range between nominally pinned and rigid, because a hoist's share can peak in between) and rigid (bending and torsion also pass through the block, the textbook grillage assumption, and the one an independent 3D frame analysis of a similar grid also implies). Every check uses the worst of them: a hoist's total static, dynamic load and status use the largest load, and each truss is checked with the joint model that loads it hardest (named on the truss).</li>",
    "<li><b>Truss stiffness (since 1.4.0)</b>: a lattice truss is not a solid beam. It bends through its chords (so its bending stiffness EI grows with about the square of its depth), shears through its diagonals (on short spans that is a large part of its deflection, so each truss is a Timoshenko beam with a shear stiffness GA), and twists through the diagonals of all its faces working as a closed tube (GJ). Chord and diagonal sizes are not in the tables, so they are <b>estimated from the tables</b>: the largest moment the tables demonstrate is carried by the chords at one effective chord stress (calibrated so a 20.5 in box comes out at the stiffness of 2 x 0.125 in chords, which also matches the maker's published deflection in Rigging Math Made Simple), the diagonals are taken as 0.3 x the chord area at 45 degrees. Real chord and diagonal sizes in the truss data (a <i>section</i> entry: chord and diagonal OD and wall, panel length) replace the estimate. The stiffness used is shown on each truss; scale it with its Stiffness (x) field. Depth: a truss named AxB is taken as A wide and B deep, as the views draw it.</li>",
    "<li><b>Hoists and trim (since 1.4.0)</b>: hoists are rigid supports at one level unless you give a hoist stiffness (lb per inch of stretch, for the hoist and its chain) under the plan. The Trim column shows how much a hoist's load changes if it runs 1/4 in high (or low) - on short, stiff spans that can be hundreds of pounds, so a hoist whose trim change passes 10% of its capacity is flagged: level the hoists carefully, or check with a hoist stiffness.</li>",
    "<li><b>Cross-check</b>: <i>Export stiffness model</i> (under the hoist table) saves the rig's stiffness model with this app's results; <code>python tools/pynite_check.py file</code> rebuilds it in PyNite, the 3D frame engine behind CalcForge, and compares hoist reactions and member forces (without shear deformation, which PyNite doesn't model). If the stiffness solve can't run (a load-path loop, or a very large rig) the app says so and falls back to the load-path method.</li>",
    "<li><b>Moment and shear check</b>: the span and cantilever checks compare each span on its own with the tables. A continuous truss also bends over its supports (hogging) from loads in the next span, and a heavy load right beside a support puts most of its weight into shear. So the bending moment and shear are also worked out all along the truss (shown under its diagram) and compared with an allowable moment and shear <b>estimated from the manufacturer's tables</b>: every table entry is a load the maker says the truss carries, so it demonstrates a moment (point load x span / 4, or uniform load x span / 8) and a shear (half the load). The allowable moment is the largest the tables demonstrate - the smaller of the point-load and uniform-load figures - and the allowable shear the largest shear any entry demonstrates (a safe-side estimate), both with the repetitive-use factor. These are estimates, not published values; use the maker's published moment and shear where you have them. Truss self weight is left out, as in the tables, unless you tick the stricter option below the plan.</li>",
    "<li><b>Slack hoists</b>: a chain can only pull. If the loads would push a hoist up (a negative reaction - typically a hoist next to a heavily loaded span or cantilever), its chain goes slack: the hoist is shown as <b>Slack</b>, carries only its own weight, and the truss is solved again without it, so the other hoists and the span checks see the real, longer spans. If that leaves a truss with a single support point, it would tip: it is flagged <b>UNSTABLE</b> and its numbers must not be used.</li>",
    "<li><b>Units</b>: the Units switch in the toolbar shows and takes everything in feet and pounds or in metres and kilograms (moments in kg·m, hoist speed in m/min, sizes in mm). Only the display changes: the rig is stored and solved the same way, so every result and every truss or hoist choice stays exactly as it was. Trusses whose manufacturer data is metric are checked against their own metric table in either mode.</li>",
    "<li>Loads are based on ANSI repetitive-use rules: capacities are multiplied by 0.85 unless the truss data is marked as already including the repetitive-use factor (the generic <i>Universal</i> trusses from EOT 2.4 use 0.75).</li>",
    "<li>Hoist status compares the <b>static</b> load with capacity (as the original). Dynamic load = static x the hoist's dynamic load factor (speed fpm / 60 + 1, so 16 fpm = 1.267, as in EOT 2.4; a hoist with no listed speed uses the default 1.25, and any hoist can be given its own factor) and is flagged separately when it exceeds capacity.</li>",
    "<li><b>Cantilever</b>: the part of a truss that extends past its outermost support (a hoist or a bolted connection). The ANSI standards supplied (E1.2 and others) do not define it; the tool uses the rule in the original workbook and in manufacturer guidance: the maximum cantilever is one quarter of the maximum span, and the load on a cantilever must not exceed the manufacturer's center point load (CPL) for a span four times the cantilever length. Span (ANSI E1.2, 2.33) is the distance between support points.</li>",
    "<li><b>Corner blocks</b>: trusses are bolted together at corner blocks, which are special short trusses with their own weight. The block type comes from the Christie Lites and James Thomas Engineering catalogues (weights as published on their product pages; blocks that use end/face plates add weight per truss bolted on, and bolt-on blocks default to the middle published bolt count). The truss it is bolted through carries the block, and every truss bolted to it passes its end reaction into the block. Faces used are counted (a truss ending at the block uses 1, one running through it uses 2) and compared with the block's ways. Where a maker publishes no weight, enter your own on the block. Truss lengths are measured center to center of the blocks in the plan.</li>",
    "<li>Truss self weight is spread uniformly over the whole length, including cantilevers. Hoist and chain weight are added after the analysis.</li>",
    "<li>Mirror loads: a load can be mirrored about the truss centerline; the twin follows edits to the original.</li></ul>",
    "<h3>Version history</h3><ul>" + TLA.CHANGES.map(function (c) { return "<li><b>" + c[0] + "</b> (" + c[1] + ", " + c[2] + "): " + c[3] + "</li>"; }).join("") + "</ul>",
    "<h3>License terms of the original</h3><p>Free to distribute. Anyone distributing a modified version must give credit to Delbert L. Hall and Jon Sogoian as the originators, update the history to show what was changed, and not charge for new versions. The person modifying the program is responsible for the results of those modifications.</p>",
    "<h3>History</h3><ul><li>Original Truss Load Analyzer - EOT v1.0 - 2.1 (2020-2021), Hall &amp; Sogoian.</li><li>Truss Grid Analyzer (this rebuild): offline web version with truss-grid load paths, plan view, mirrored loads.</li></ul>",
    "<p><button id=\"docs-close\">Close</button></p>"
  ].join("");

  function legend() {
    var mode = S.ui.colorMode, items;
    if (mode === "layer") items = [["l1", "Layer 1 (passes load into other trusses)"], ["l2", "Layer 2"], ["l3", "Layer 3"], ["l4", "Layer 4+"]];
    else items = [["ok", mode === "hoist" ? "Hoist under 80% of capacity" : mode === "status" ? "All checks pass" : "Under 80%"], ["warn", "80-100%"], ["fail", mode === "status" ? "Failing / overloaded" : "Over 100% / failing"]];
    $("legend").innerHTML = items.map(function (i) { return '<div><i style="background:var(--' + i[0] + ')"></i>' + i[1] + "</div>"; }).join("") +
      '<div><i style="background:var(--panel);border:2px solid var(--ok);border-radius:50%"></i>Hoist (static load)</div><div><i style="background:var(--ink);transform:rotate(45deg) scale(.8)"></i>Bolted connection</div>';
  }

  function renderAll() {
    $("rigname").textContent = S.rig.name;
    $("s-color").value = S.ui.colorMode;
    $("s-units").value = TLA.units.metric() ? "metric" : "imperial";
    if (S.ui.tab !== "plan" && S.ui.tab !== "iso") return;
    legend();
    if (S.ui.tab === "iso") {
      TLA.iso.render();
      var v = S.ui.iso; if (v) { $("r-yaw").value = v.yaw; $("r-pitch").value = v.pitch; }
    } else TLA.plan.render();
    TLA.panels.inspector($("inspector"));
    TLA.panels.summary($("summary"));
  }

  function setTab(name) {
    S.ui.tab = name;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.classList.toggle("on", b.getAttribute("data-tab") === name); });
    var rig = name === "plan" || name === "iso";
    $("main").hidden = !rig; $("page").hidden = rig;
    $("plan").hidden = name !== "plan"; $("iso").hidden = name !== "iso"; $("isoctl").hidden = name !== "iso";
    if (rig) renderAll(); else TLA.tools.show(name, $("page"));
  }

  function init() {
    S.init();
    TLA.plan.mount(S, $("plan"));
    TLA.panels.mount(S);
    TLA.tools.mount(S);
    TLA.iso.mount(S, $("iso"));
    S.on(renderAll);
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.onclick = function () { setTab(b.getAttribute("data-tab")); }; });
    $("r-yaw").oninput = function (e) { S.ui.iso.yaw = parseFloat(e.target.value); TLA.iso.render(); };
    $("r-pitch").oninput = function (e) { S.ui.iso.pitch = parseFloat(e.target.value); TLA.iso.render(); };

    $("b-new").onclick = function () { if (confirm("Start a new empty rig? (Undo can bring the current one back.)")) { S.newRig(); S.ui.fit = true; S.emit(); } };
    $("b-sample").onclick = function () { S.newRig(); TLA.samples.box(S); S.commit({ noUndo: true }); S.ui.fit = true; S.emit(); };
    (function () {
      var main = $("main"), KEY = "tla-layout", lay = { w: 420, h: 250 };
      try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) lay = { w: sv.w || 420, h: sv.h || 250 }; } catch (e) { /* ignore */ }
      function apply() {
        lay.w = Math.max(260, Math.min(lay.w, main.clientWidth - 260)); lay.h = Math.max(90, Math.min(lay.h, main.clientHeight - 150));
        main.style.setProperty("--side-w", lay.w + "px"); main.style.setProperty("--bottom-h", lay.h + "px");
      }
      function handle(cls, move) {
        var h = document.createElement("div"); h.className = "split " + cls; main.appendChild(h);
        h.addEventListener("pointerdown", function (e) {
          e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add("drag");
          var r = main.getBoundingClientRect();
          function mv(ev) { move(ev, r); apply(); window.dispatchEvent(new Event("resize")); }
          function up() { h.classList.remove("drag"); h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up); try { localStorage.setItem(KEY, JSON.stringify(lay)); } catch (e2) { /* ignore */ } }
          h.addEventListener("pointermove", mv); h.addEventListener("pointerup", up);
        });
        h.addEventListener("dblclick", function () { lay = { w: 420, h: 250 }; apply(); window.dispatchEvent(new Event("resize")); try { localStorage.removeItem(KEY); } catch (e3) { /* ignore */ } });
      }
      handle("split-v", function (ev, r) { lay.w = r.right - ev.clientX; });
      handle("split-h", function (ev, r) { lay.h = r.bottom - ev.clientY; });
      window.addEventListener("resize", apply); apply();
    })();
    $("b-add").onclick = function () { S.addTruss(); };
    $("b-fit").onclick = function () { if (S.ui.tab === "iso") TLA.iso.fit(); else TLA.plan.fit(); };
    $("b-undo").onclick = function () { S.undo(); };
    $("b-redo").onclick = function () { S.redo(); };
    $("s-color").onchange = function (e) { S.ui.colorMode = e.target.value; S.persist(); renderAll(); };
    $("s-units").onchange = function (e) { var st = S.rig.settings || (S.rig.settings = {}); st.units = e.target.value === "metric" ? "metric" : undefined; S.commit(); };
    $("c-loads").onchange = function (e) { S.ui.showLoads = e.target.checked; renderAll(); };
    $("c-labels").onchange = function (e) { S.ui.showLabels = e.target.checked; renderAll(); };
    $("b-img").onclick = saveImage;
    $("b-print").onclick = function () { window.print(); };
    $("b-csv").onclick = function () {
      var csv = TLA.panels.hoistsCsv();
      if (navigator.clipboard) navigator.clipboard.writeText(csv).then(function () { flash("b-csv", "Copied"); }, function () { flash("b-csv", "Copy blocked"); });
    };
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
    $("rigname").ondblclick = function () { var n = prompt("Rig name", S.rig.name); if (n) { S.rig.name = n; S.commit(); } };

    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? S.redo() : S.undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); S.redo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && S.sel.truss && S.sel.support) { e.preventDefault(); S.removeSupport(S.sel.truss, S.sel.support); }
      else if ((e.key === "Delete" || e.key === "Backspace") && S.sel.truss) { var t = S.truss(S.sel.truss); if (t && confirm("Delete " + t.name + "?")) S.removeTruss(t.id); }
      else if (e.key.toLowerCase() === "r" && S.sel.truss) { var t2 = S.truss(S.sel.truss); if (t2) { t2.angle = ((t2.angle || 0) + 90) % 360; S.commit(); } }
    });

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
  function flash(id, text) { var b = $(id), old = b.textContent; b.textContent = text; setTimeout(function () { b.textContent = old; }, 1200); }

  window.addEventListener("DOMContentLoaded", init);
})(typeof globalThis !== "undefined" ? globalThis : window);
