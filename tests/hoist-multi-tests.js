/* 1.24.0: new hoists copy the last hoist placed; the Hoists grid (step 3) selects several hoists and edits them at once. */
(function (g) {
  var TLA = g.TLA, S = TLA.store, add = g.__addTLATest;
  function eq(a, b, msg) { if (a !== b) throw new Error((msg || "value") + ": expected " + b + " got " + a); }
  function hoistsOf(t) { return t.supports.filter(function (s) { return s.kind === "hoist"; }); }

  add("new hoist: set up like the last hoist placed (model, chain, hardware, DLF, dead hang), not its name, level, hang or reading", function () {
    S.newRig();
    var t = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 30, hoists: [] });
    var first = S.addHoist(t.id);
    eq(first.hoistId, S.defaultHoistId(), "no hoist yet: the rig default");
    var other = TLA.data.hoists.filter(function (x) { return x.id !== first.hoistId; })[3];
    first.hoistId = other.id; first.chainLength = 55; first.hardwareWeight = 9; first.dlf = 1.3;
    first.name = "SR1"; first.level = 0.5; first.measured = 800; S.commit();
    var b = S.addHoist(t.id);
    eq(b.hoistId, other.id, "model"); eq(b.chainLength, 55, "chain"); eq(b.hardwareWeight, 9, "hardware"); eq(b.dlf, 1.3, "DLF");
    eq(b.name, "", "name"); eq(b.level, undefined, "level offset"); eq(b.measured, undefined, "reading");
    b.dead = true; b.rope = "gac-1/4"; b.ropeLength = 8; b.dlf = undefined; S.commit();
    var c = S.addHoist(t.id);
    eq(c.dead, true, "dead hang"); eq(c.rope, "gac-1/4", "rope"); eq(c.ropeLength, 8, "rope length"); eq(c.dlf, undefined, "static");
    eq(S.lastHoist(), c, "the newest is now the last placed");
  });

  add("hoists grid: Ctrl/Shift+click select several hoists; Ctrl+D copies the top one to all; Delete removes them all; plain click clears", function () {
    S.newRig(); TLA.panels.mount(S); TLA.grids.mount(S);
    var a = S.addTruss({ name: "A", x: 0, y: 0, angle: 0, length: 30, hoists: [2, 15, 28] });
    var b = S.addTruss({ name: "B", x: 0, y: 10, angle: 0, length: 30, hoists: [2, 28] });
    var ha = hoistsOf(a), hb = hoistsOf(b);
    ha[0].chainLength = 60; S.commit();
    var box = document.createElement("div"); document.body.appendChild(box);
    var oldConfirm = g.confirm; g.confirm = function () { return true; };
    try {
      function show() { TLA.grids.show(box, 3); }
      // hoist rows in rig order: A @ 2, 15, 28, then B @ 2, 28
      function tdFor(n, ci) { show(); var trs = [].filter.call(box.querySelectorAll("tbody tr[data-r]"), function (r) { return !/gh|new/.test(r.className); }); return trs[n].querySelector('td[data-c="' + ci + '"]'); }
      function mouse(td, opt) { td.dispatchEvent(new MouseEvent("mousedown", Object.assign({ bubbles: true, cancelable: true }, opt || {}))); }
      function key(k, opt) { document.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ key: k, bubbles: true, cancelable: true }, opt || {}))); }
      var CHAIN = 4;   // truss, at, from, hoist, chain
      mouse(tdFor(0, CHAIN));
      eq(TLA.grids.selected().length, 0, "one click, no multi-selection");
      mouse(tdFor(1, CHAIN), { ctrlKey: true });
      eq(TLA.grids.selected().length, 2, "Ctrl+click adds a row");
      mouse(tdFor(4, CHAIN), { ctrlKey: true });
      eq(TLA.grids.selected().length, 3, "across trusses");
      show(); eq(box.querySelectorAll("tr.multi").length, 3, "rows marked"); eq(!!box.querySelector(".gmulti"), true, "selection bar");
      key("d", { ctrlKey: true });
      eq(ha[1].chainLength, 60, "Ctrl+D: copied from the top selected"); eq(hb[1].chainLength, 60, "to the last"); eq(hb[0].chainLength !== 60, true, "unselected unchanged");
      mouse(tdFor(1, CHAIN), { ctrlKey: true });
      eq(TLA.grids.selected().length, 2, "Ctrl+click again removes it");
      mouse(tdFor(2, CHAIN));
      eq(TLA.grids.selected().length, 0, "plain click outside the selection clears it");
      mouse(tdFor(3, CHAIN), { shiftKey: true });
      eq(TLA.grids.selected().length, 2, "Shift+click selects the range (A @ 28 to B @ 2)");
      key("Delete");
      eq(hoistsOf(a).length, 2, "Delete: A lost one"); eq(hoistsOf(b).length, 1, "B lost one");
      eq(TLA.grids.selected().length, 0, "selection gone");
      TLA.grids.selectRows(hoistsOf(a).map(function (s) { return "H:" + s.id; }));
      eq(TLA.grids.selected().length, 2, "Select on a truss row");
      key("Escape");
      eq(TLA.grids.selected().length, 0, "Esc clears");
    } finally {
      g.confirm = oldConfirm; TLA.grids.leave(); box.remove();
    }
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
