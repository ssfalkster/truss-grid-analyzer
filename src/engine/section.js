/* Section properties of a truss for the stiffness solve (1.4.0): bending EI, shear GA and torsion GJ.
 *
 * A lattice truss is not a solid beam. It bends through its chords (I = sum of chord area x distance squared, so it
 * grows with about depth squared, not depth cubed), it shears through its diagonals (on short spans that is a large
 * part of the deflection), and it twists through the diagonals of all its faces working as a closed tube.
 *
 * Real chord and diagonal sizes are not in the manufacturer tables, so by default they are ESTIMATED from the tables:
 *   - The largest moment the tables demonstrate (TLA.limits.memberCapacity: M = CPL x L / 4 or UDL x L / 8) is carried
 *     by the chords: M = sigma x I / c, with c the distance from the neutral axis to the chord that governs. With one
 *     effective chord stress sigma for every aluminium truss, EI = E x M x c / sigma. sigma is calibrated so that a
 *     20.5" box with a typical table moment (about 14,000 lb-ft) comes out at 2.5e9 lb-in2 - the stiffness of 2" x
 *     0.125" chords at 18.5" centres, and of the manufacturer's published deflection (Rigging Math Made Simple,
 *     Lesson 21). The same sigma then gives 16" and 12" boxes within about 8% of their chord-based values.
 *   - Diagonals: area DIAG_RATIO x the estimated chord area, at 45 degrees. One diagonal per panel in a face gives the
 *     face a shear stiffness E x A_d x sin^2(a) x cos(a) (a = angle between diagonal and chord). Vertical shear is
 *     carried by the vertical faces (box) or both sloping faces (triangle); torsion by all faces as a closed cell
 *     (GJ = 4 A_cell^2 / sum(b_i^2 / GA_face_i)).
 * A `section` object on the truss data entry (or on a custom truss) replaces the estimate with real sizes, inches:
 *   { shape: "box"|"triangle"|"pipe", material: "aluminum"|"steel", depthIn, widthIn,
 *     chordOD, chordWall, diagOD, diagWall, panelIn,  (pipe:) od, wall }
 * Anything left out falls back to the estimate. Units out: EI and GJ in lb-ft2, GA in lb. */
(function (g) {
  var TLA = (g.TLA = g.TLA || {});

  var MAT = {
    aluminum: { E: 10.0e6, G: 3.8e6, sigma: 6200, label: "aluminium" },
    steel: { E: 29.0e6, G: 11.2e6, sigma: 15500, label: "steel" }
  };
  var CHORD_OD = 2.0, DIAG_RATIO = 0.3, DIAG_ANGLE = 45, DEFAULT_DEPTH = 20.5;
  // schedule 40 / 80 steel pipe: nominal size -> [OD, wall 40, wall 80] (in)
  var PIPE = { "0.5": [0.84, 0.109, 0.147], "0.75": [1.05, 0.113, 0.154], "1": [1.315, 0.133, 0.179], "1.25": [1.66, 0.14, 0.191], "1.5": [1.9, 0.145, 0.2],
    "2": [2.375, 0.154, 0.218], "2.5": [2.875, 0.203, 0.276], "3": [3.5, 0.216, 0.3], "4": [4.5, 0.237, 0.337] };

  function num(v) { v = Number(v); return v > 0 ? v : 0; }
  function tubeArea(od, wall) { var id = od - 2 * wall; return Math.PI / 4 * (od * od - id * id); }
  function tubeI(od, wall) { var id = od - 2 * wall; return Math.PI / 64 * (Math.pow(od, 4) - Math.pow(id, 4)); }

  /** Shape, material and outside size (in) from the catalog description; spec fields win. A truss "AxB" is A wide and
   * B deep, as the plan and 3D views draw it (TLA.rig.sectionIn). */
  function describe(entry, spec) {
    var d = String((entry && entry.description) || "").replace(/(\d),(\d)/g, "$1.$2"), out = {};
    out.shape = spec.shape || (/pipe/i.test(d) ? "pipe" : /\btri|tri\b|triangle/i.test(d) ? "triangle" : "box");
    out.material = spec.material || (/\bstl\b|steel/i.test(d) ? "steel" : "aluminum");
    var m = d.match(/(\d+(?:\.\d+)?)\s*"?\s*x\s*(\d+(?:\.\d+)?)/i), n = d.match(/(\d+(?:\.\d+)?)/);
    if (m) { out.widthIn = parseFloat(m[1]); out.depthIn = parseFloat(m[2]); }
    else if (n && parseFloat(n[1]) >= 6 && parseFloat(n[1]) <= 72) out.widthIn = out.depthIn = parseFloat(n[1]);
    else if (n && out.shape === "pipe") out.nominal = parseFloat(n[1]);
    if (num(spec.depthIn)) out.depthIn = num(spec.depthIn);
    if (num(spec.widthIn)) out.widthIn = num(spec.widthIn);
    if (out.shape !== "pipe" && !out.depthIn) { out.depthIn = out.widthIn = DEFAULT_DEPTH; out.sizeGuessed = true; }
    if (!out.widthIn) out.widthIn = out.depthIn;
    out.sch80 = /\b80\b/.test(d);
    return out;
  }

  function pipeProps(info, spec, mat) {
    var row = PIPE[String(info.nominal)] || PIPE["1.5"];
    var od = num(spec.od) || row[0], wall = num(spec.wall) || (info.sch80 ? row[2] : row[1]);
    var I = tubeI(od, wall), A = tubeArea(od, wall);
    return { EI: mat.E * I, GA: mat.G * A / 2, GJ: mat.G * 2 * I, od: od, wall: wall, from: num(spec.od) ? "section" : "pipe size" };
  }

  /** Face shear stiffness (lb) of one lattice face: one diagonal of area ad per panel, spanning b across the face. */
  function faceGA(E, ad, b, panel) {
    var a = panel > 0 ? Math.atan2(b, panel) : DIAG_ANGLE * Math.PI / 180, s = Math.sin(a);
    return E * ad * s * s * Math.cos(a);
  }

  /** { EI, GA, GJ (lb-ft2, lb, lb-ft2), shape, material, depthIn, chordArea, diagArea, source, notes }. */
  function estimate(entry, t) {
    entry = entry || {};
    var spec = entry.section || {}, info = describe(entry, spec), mat = MAT[info.material] || MAT.aluminum, scale = (t && Number(t.eiScale) > 0 ? Number(t.eiScale) : 1);
    var r = { shape: info.shape, material: info.material, depthIn: info.depthIn, widthIn: info.widthIn, E: mat.E, notes: [] };
    if (info.shape === "pipe") {
      var p = pipeProps(info, spec, mat);
      r.EI = p.EI; r.GA = p.GA; r.GJ = p.GJ; r.depthIn = r.widthIn = p.od; r.source = p.from;
    } else {
      var od = num(spec.chordOD) || CHORD_OD, tri = info.shape === "triangle";
      var hc = Math.max(info.depthIn - od, 1), wc = Math.max(info.widthIn - od, 1);
      var hv = tri ? hc * Math.sqrt(3) / 2 : hc;               // vertical distance between chord lines
      var c = tri ? 2 * hv / 3 : hc / 2;                       // neutral axis to the chord that governs
      var M = TLA.limits && TLA.limits.memberCapacity ? TLA.limits.memberCapacity(entry).moment * 12 : 0, Ac;
      if (num(spec.chordOD) && num(spec.chordWall)) { Ac = tubeArea(spec.chordOD, spec.chordWall); r.source = "section"; }
      else if (M > 0) { Ac = tri ? M / (mat.sigma * hv) : M / (2 * mat.sigma * hc); r.source = "tables"; r.tableMoment = M / 12; }
      else { Ac = tubeArea(2, 0.125); r.source = "default chords"; r.notes.push("no table moment: 2 x 0.125 in chords assumed"); }
      // I about the horizontal axis: box = 4 chords at hc/2; triangle = 1 chord at 2hv/3 and 2 at hv/3
      var I = tri ? Ac * hv * hv * (4 / 9 + 2 / 9) : Ac * hc * hc;
      var Ad = num(spec.diagOD) && num(spec.diagWall) ? tubeArea(spec.diagOD, spec.diagWall) : DIAG_RATIO * Ac, panel = num(spec.panelIn);
      if (!(num(spec.diagOD) && num(spec.diagWall))) r.notes.push("diagonals estimated (" + DIAG_RATIO + " x chord area" + (panel ? "" : ", 45 deg") + ")");
      var GA, GJ;
      if (tri) {
        var gf = faceGA(mat.E, Ad, hc, panel);                 // all three faces alike, side hc
        GA = 2 * gf * 0.75;                                    // two faces sloping 30 deg from vertical: cos^2 = 0.75
        GJ = hc * hc * gf / 4;                                 // closed equilateral cell
      } else {
        var gv = faceGA(mat.E, Ad, hc, panel), gh = faceGA(mat.E, Ad, wc, panel);
        GA = 2 * gv;
        GJ = 4 * hc * hc * wc * wc / (2 * hc * hc / gv + 2 * wc * wc / gh);
      }
      r.EI = mat.E * I; r.GA = GA; r.GJ = GJ; r.chordArea = Ac; r.diagArea = Ad;
      if (info.sizeGuessed) r.notes.push("size not in the description: " + DEFAULT_DEPTH + " in box assumed");
    }
    r.scale = scale;
    r.EI = r.EI / 144 * scale; r.GJ = r.GJ / 144 * scale; r.GA = r.GA * scale;
    return r;
  }

  TLA.section = { estimate: estimate, describe: describe, MAT: MAT, CHORD_OD: CHORD_OD, DIAG_RATIO: DIAG_RATIO };
})(typeof globalThis !== "undefined" ? globalThis : window);
