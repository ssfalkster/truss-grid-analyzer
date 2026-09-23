"""Cross-check the app's stiffness (grillage) solve against PyNite, the 3D frame engine behind CalcForge 3D.

Usage:
    pip install PyNiteFEA            (once; tested with 3.2)
    python tools/pynite_check.py rig.grillage.json [--tol 0.5]

The JSON comes from the app: "Export stiffness model" under the hoist table (TLA.grillage.exportModel). It holds the
grillage the app builds from the rig - every truss as a beam, its bolted connections, hoists and loads - plus the
app's own reactions and member forces for the same model. This script builds that model independently in PyNite
and compares, for hinged and for rigid joints:
  - hoist reactions (summed per connection point),
  - the largest bending moment, shear and torque along every truss.

What is compared is the Euler-Bernoulli grillage (PyNite has no shear deformation, so the export leaves GA out) with
the slack hoists the app found taken out; it checks assembly, joints, supports and loads, not the section estimates.

How the grillage maps onto a 3D frame (X, Z = plan, Y = up, ft and lb, E = G = 1 so I = EI and J = GJ):
  - every truss keeps its own plan geometry, each a thousandth of a foot above the last (PyNite would otherwise
    split a truss at another's node lying on it). A rigid connection at one point is one shared node;
  - any other connection (hinged, or between points apart in plan - a corner block has size) is tied the way the
    app's grillage ties it - same vertical deflection, and the same rotations for rigid joints, ignoring the block's
    size: two long pin-ended struts up to a node high above tie the deflections, and for rigid joints an arm with its
    shear released ties the rotations. (A real block's size adds a lever arm the grillage leaves out; with a rigid arm instead, the example
    box's hoists move by up to about 2%.)
  - a flat grid under vertical load never moves in plan, so every node is held in X, Z and in rotation about Y, and
    has the same tiny rotational stiffness the app uses to hold twist that nothing loads.
"""
import argparse
import json
import math
import sys

try:
    from Pynite import FEModel3D
except ImportError:                                     # older releases
    try:
        from PyNite import FEModel3D
    except ImportError:
        sys.exit("PyNite is not installed: pip install PyNiteFEA")

TOWER = 50.0      # ft: height of the node that ties two points apart in plan
STACK = 0.001     # ft between trusses: PyNite splits a member at any node lying on it, so no truss may pass exactly
                  # through another's node
EPS = 1e-9        # x the largest EI, lb-ft/rad: twist regularisation, as in the app


class Groups:
    def __init__(self):
        self.p = {}

    def find(self, a):
        self.p.setdefault(a, a)
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]
            a = self.p[a]
        return a

    def union(self, a, b):
        a, b = self.find(a), self.find(b)
        if a != b:
            self.p[b] = a


def build(ex, joints):
    """PyNite model of the exported grillage for one joint model ("hinged" or "rigid")."""
    beams, res = ex["beams"], ex["results"][joints]
    slack = set(res.get("slack", []))
    keys = [(bi, ni) for bi, bm in enumerate(beams) for ni in range(len(bm["nodes"]))]

    def plan(k):
        bm = beams[k[0]]
        a = math.radians(bm["angle"])
        d = bm["nodes"][k[1]]["d"]
        return bm["x"] + d * math.cos(a), bm["y"] + d * math.sin(a)

    # every truss keeps its own geometry; a rigid connection at one point shares a node
    same, arms, w_grp = Groups(), [], Groups()
    for k in keys:
        same.find(k), w_grp.find(k)
    for lk in ex["links"]:
        a, b = (lk["a"], lk["na"]), (lk["b"], lk["nb"])
        w_grp.union(a, b)
        rigid = joints == "rigid" and lk["rigid"]
        pa, pb = plan(a), plan(b)
        gap = math.hypot(pa[0] - pb[0], pa[1] - pb[1])
        if gap < 1e-4 and rigid:
            same.union(a, b)
        else:
            arms.append((b, a, rigid, gap))
    fe = FEModel3D()
    fe.add_material("unit", 1.0, 1.0, 0.3, 0.0)
    max_ei = max(bm["EI"] for bm in beams)
    max_gj = max(bm["GJ"] for bm in beams)
    node_of, names = {}, {}
    for k in keys:
        r = same.find(k)
        if r not in names:
            x, y = plan(r)
            names[r] = "N%d" % len(names)
            fe.add_node(names[r], x, r[0] * STACK, y)
            fe.def_support(names[r], True, False, True, False, True, False)
            # the app's tiny twist stiffness (grillage.js eps): holds a truss pinned at both ends from spinning
            # about its own axis, which nothing loads
            fe.def_support_spring(names[r], "RX", EPS * max_ei)
            fe.def_support_spring(names[r], "RZ", EPS * max_ei)
        node_of[k] = names[r]
    # connection between points apart in plan (a corner block has size), exactly as the grillage treats it:
    #   same vertical deflection - two long pin-ended struts up to a node TOWER ft above (vertical force only);
    #   rigid joints also the same rotations - an arm with its shear released at one end, which couples rotations
    #   (bending both ways and twist) without tying the deflections
    for i, (host, feeder, rigid, _) in enumerate(arms):
        (xa, ya), (xb, yb) = plan(host), plan(feeder)
        q = "Q%d" % i
        fe.add_node(q, (xa + xb) / 2 + 1.0, TOWER, (ya + yb) / 2)     # off vertical: PyNite needs a direction; every
        # node is held in plan, so the struts tie the deflections exactly at any angle
        fe.def_support(q, True, False, True, True, True, True)
        for j, end in enumerate((host, feeder)):
            s = "T%d_%d" % (i, j)
            fe.add_section(s, 1e3 * max_ei * TOWER, 1.0, 1.0, 1.0)
            fe.add_member(s, node_of[end], q, "unit", s)
            fe.def_releases(s, Rxi=True, Ryi=True, Rzi=True, Ryj=True, Rzj=True)
        if rigid:
            s = "R%d" % i
            fe.add_section(s, 1.0, 1e3 * max_ei, 1e3 * max_ei, 1e3 * max(max_ei, max_gj))
            fe.add_member(s, node_of[host], node_of[feeder], "unit", s)
            fe.def_releases(s, Dyj=True, Dzj=True)

    members = {}
    for bi, bm in enumerate(beams):
        sec = "B%d" % bi
        fe.add_section(sec, bm["EI"], bm["EI"], bm["EI"], bm["GJ"])
        members[bm["id"]] = []
        for e in range(len(bm["nodes"]) - 1):
            i, j = node_of[(bi, e)], node_of[(bi, e + 1)]
            if bm["nodes"][e + 1]["d"] - bm["nodes"][e]["d"] < 1e-9 or i == j:
                continue
            m = "M%d_%d" % (bi, e)
            fe.add_member(m, i, j, "unit", sec)
            if bm["w"]:
                fe.add_member_dist_load(m, "FY", -bm["w"], -bm["w"])
            members[bm["id"]].append(m)
        for ni, nd in enumerate(bm["nodes"]):
            if nd["P"]:
                fe.add_node_load(node_of[(bi, ni)], "FY", -nd["P"])

    held = {}
    for sp in ex["supports"]:
        if sp["id"] in slack:
            continue
        n = node_of[(sp["b"], sp["n"])]
        held.setdefault(n, []).append(sp)
        if sp.get("k"):
            fe.def_support_spring(n, "DY", sp["k"])
        else:
            fe.def_support(n, True, True, True, False, True, False)
    offset = max([x[3] for x in arms] or [0.0])
    return fe, members, held, w_grp, node_of, offset


def compare(ex, joints, tol):
    res = ex["results"].get(joints)
    if not res or not res.get("ok"):
        print("  %s: not solved in the app - skipped" % joints)
        return True
    fe, members, held, w_grp, node_of, offset = build(ex, joints)
    fe.analyze_linear(check_statics=False)
    combo = "Combo 1"
    ok = True
    if offset > 1e-4:
        print("  (bolted points up to %.2f ft apart in plan - a corner block's size - are tied as one point, as the app does)" % offset)

    # reactions, summed per connection point (hoists sharing a point split its load any way they like)
    app, pyn = {}, {}
    for n, sps in held.items():
        node = fe.nodes[n]
        if any(sp.get("k") for sp in sps):
            r = -sum(sp["k"] for sp in sps) * node.DY[combo]
        else:
            r = node.RxnFY[combo]
        g = w_grp.find((sps[0]["b"], sps[0]["n"]))
        pyn[g] = pyn.get(g, 0.0) + r
        app[g] = app.get(g, 0.0) + sum(res["reactions"].get(sp["id"], 0.0) for sp in sps)
    worst = 0.0
    label = {}
    for sp in ex["supports"]:
        label.setdefault(w_grp.find((sp["b"], sp["n"])), sp["id"])
    print("  %s joints - hoist reactions (lb):" % joints)
    print("    %-28s %10s %10s %8s" % ("hoist / point", "app", "PyNite", "diff"))
    for g in sorted(app, key=lambda x: label[x]):
        d = app[g] - pyn[g]
        worst = max(worst, abs(d))
        print("    %-28s %10.2f %10.2f %8.3f" % (label[g], app[g], pyn[g], d))
    if worst > tol:
        ok = False
    tot_a, tot_p = sum(app.values()), sum(pyn.values())
    print("    %-28s %10.2f %10.2f" % ("total", tot_a, tot_p))

    print("  %s joints - largest member forces along each truss (app / PyNite):" % joints)
    names = {bm["id"]: bm["name"] for bm in ex["beams"]}
    for bid, ms in members.items():
        if not ms:
            continue
        m_p = max(max(abs(fe.members[m].max_moment("Mz", combo)), abs(fe.members[m].min_moment("Mz", combo))) for m in ms)
        v_p = max(max(abs(fe.members[m].max_shear("Fy", combo)), abs(fe.members[m].min_shear("Fy", combo))) for m in ms)
        t_p = max(max(abs(fe.members[m].max_torque(combo)), abs(fe.members[m].min_torque(combo))) for m in ms)
        a = res["members"].get(bid, {})
        rows = [("M lb-ft", a.get("maxMoment", 0), m_p), ("V lb", a.get("maxShear", 0), v_p), ("T lb-ft", a.get("maxTorque", 0), t_p)]
        bad = [r for r in rows if abs(r[1] - r[2]) > max(tol, 1e-3 * abs(r[2]))]
        if bad:
            ok = False
        print("    %-18s " % names[bid][:18] + "   ".join("%s %9.1f / %9.1f" % r for r in rows) + ("   <-- differs" if bad else ""))
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("model", help="exported stiffness model (JSON)")
    ap.add_argument("--tol", type=float, default=0.5, help="allowed difference, lb or lb-ft (default 0.5)")
    a = ap.parse_args()
    with open(a.model, encoding="utf-8") as f:
        ex = json.load(f)
    print("%s %s: %d trusses, %d bolted connections, %d hoists" % (ex.get("tool", "?"), ex.get("version", "?"), len(ex["beams"]), len(ex["links"]), len(ex["supports"])))
    ok = all([compare(ex, j, a.tol) for j in ("hinged", "rigid")])
    print("AGREE" if ok else "DIFFERENT - see the rows marked above")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
