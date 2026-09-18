"""Corner block database (Christie Lites and James Thomas Engineering), transcribed from the
manufacturers' product pages on 2026-09-18. Writes ../data/corners.js.

Fields
  fits            truss size the block is for, normalised ("12x12", "16x16", "12tri"...)
  ways            number of truss connections the block accepts
  kind            corner | hub | angle | hinge | gate | pivot
  size_in         block edge length in inches when the maker states it (else the truss width is used)
  variants        alternative published weights (label, lb)
  base_lb + per_connection_lb   weight = base + per_connection x connections used (end/face plates)
  weight_lb       single published weight; null when the maker does not publish one
"""
import json
import os

CL = "https://www.christielites.com/"
JT = "https://www.jthomaseng.com/products/"

R = []


def add(**kw):
    kw.setdefault("variants", None)
    kw.setdefault("base_lb", None)
    kw.setdefault("per_connection_lb", None)
    kw.setdefault("weight_lb", None)
    kw.setdefault("size_in", None)
    kw.setdefault("notes", "")
    R.append(kw)


# ---- Christie Lites -------------------------------------------------------------------------
A = "Christie A Type 12\""
add(manufacturer="Christie Lites", family=A, fits="12x12", name="Corner 90 Deg 6-Way", code="TRUAA-90", kind="corner", ways=6, size_in=12.75,
    variants=[["4 bolts", 22.5], ["12 bolts", 25.5], ["24 bolts", 30]], source=CL + "a-type-12inch-corner-90-deg-6-way/228w2w15w24w422", notes="12 3/4\" square block")
add(manufacturer="Christie Lites", family=A, fits="12x12", name="Hub 6-Way", code="TRUAA-H6", kind="hub", ways=6,
    variants=[["4 bolts", 30.5], ["12 bolts", 33.5], ["24 bolts", 38]], source=CL + "a-type-12inch-hub-6-way/228w2w15w24w423")
add(manufacturer="Christie Lites", family=A, fits="12x12", name="Corner 22.5 Deg", code="TRUAA-22", kind="angle", ways=2, weight_lb=13.5, source=CL + "a-type-12inch-corner-225-deg/228w2w15w24w419", notes="with 4 bolts")
add(manufacturer="Christie Lites", family=A, fits="12x12", name="Corner 30 Deg", code="TRUAA-30", kind="angle", ways=2, weight_lb=13.5, source=CL + "a-type-12inch-corner-30-deg/228w2w15w24w420", notes="with 4 bolts")
add(manufacturer="Christie Lites", family=A, fits="12x12", name="Corner 45 Deg", code="TRUAA-45", kind="angle", ways=2, weight_lb=17, source=CL + "a-type-12inch-corner-45-deg/228w2w15w24w421", notes="with 4 bolts")
add(manufacturer="Christie Lites", family=A, fits="12x12", name="Plate Hinge", code="TRUAA-PH", kind="hinge", ways=2, weight_lb=8.5, source=CL + "a-type-12inch-plate-hinge/228w2w15w24w424", notes="with 4 bolts")

B = "Christie B Type 16\""
add(manufacturer="Christie Lites", family=B, fits="16x16", name="Blk Corner 6-Way", code="TRUBA-C6", kind="corner", ways=6, size_in=16, base_lb=37, per_connection_lb=14.25,
    source=CL + "b-type-16inch-blk-corner-6-way/228w2w15w25w443", notes="37 lb bare; each End/Face plate (TRUBA-FP, with 4 bolts and 4 pins) adds 14.25 lb; published 65.5 / 94 / 122.5 lb with 2 / 4 / 6 plates")

C = "Christie C Type 20.5\""
add(manufacturer="Christie Lites", family=C, fits="20.5x20.5", name="Corner 90 Deg 6-Way", code="TRUCA-90", kind="corner", ways=6,
    variants=[["4 bolts", 43.5], ["12 bolts", 46.5], ["24 bolts", 51]], source=CL + "c-type-20inch-corner-90-deg-6-way/228w2w15w26w452")
add(manufacturer="Christie Lites", family=C, fits="20.5x20.5", name="Corner 45 Deg", code="TRUCA-45", kind="angle", ways=2, weight_lb=26, source=CL + "c-type-20inch-corner-45-deg/228w2w15w26w", notes="with 8 bolts")
add(manufacturer="Christie Lites", family=C, fits="20.5x20.5", name="Plate Hinge", code="TRUCA-PH", kind="hinge", ways=2, weight_lb=19.5, source=CL + "c-type-20inch-plate-hinge/228w2w15w26w", notes="with 4 bolts")

G = "Christie G Type 24\""
add(manufacturer="Christie Lites", family=G, fits="24x24", name="Blk Corner 6-Way", code="TRUG0-04", kind="corner", ways=6, size_in=24, base_lb=63, per_connection_lb=40.5,
    source=CL + "g-type-24-blk-corner-6-way/228w2w15w30w476", notes="63 lb bare; published 144 / 225 / 306 lb with 2 / 4 / 6 faceplates (81 lb per 2 = 40.5 lb each, derived)")

H = "Christie H Type 24x36"
add(manufacturer="Christie Lites", family=H, fits="24x36", name="Blk Corner 4-Way", code="TRUHA-02", kind="corner", ways=4, source=CL + "h-type-24x36-blk-corner-4-way/228w2w15w171w", notes="weight not published on the product page - enter your own")

# ---- James Thomas Engineering (JTE) ----------------------------------------------------------


def jte(family, fits, name, code, kind, ways, lb, path, notes=""):
    add(manufacturer="James Thomas Engineering", family=family, fits=fits, name=name, code=code, kind=kind, ways=ways, weight_lb=lb, source=JT + path, notes=notes)


g = "General Purpose 12 x 12"
p = "aa/general-purpose-truss-12-x-12/corners-(1)/"
jte(g, "12x12", "2-Way Corner Block", "B4705", "corner", 2, 15, p + "2-way-corner-block")
jte(g, "12x12", "3-Way Corner Block", "B4705A", "corner", 3, 17.5, p + "3-way-corner-block")
jte(g, "12x12", "4-Way Corner Block", "B4706", "corner", 4, 19.5, p + "4-way-corner-block")
jte(g, "12x12", "6-Way Corner Block", "B4707", "corner", 6, 26.5, p + "6-way-corner-block")
jte(g, "12x12", "Flat Plate Hinge Section", "B4708", "hinge", 2, 14, p + "flat-plate-hinge-section")
jte("General Purpose 18 x 12", "18x12", "4-Way Corner Block", "B4608", "corner", 4, 22, "aa/general-purpose-truss-18-x-12/corners/4-way-corner-block")
g = "General Purpose 15 x 15"
p = "aa/general-purpose-truss-15-x-15/corners/"
jte(g, "15x15", "2-Way Corner Block", "B1502", "corner", 2, 18.5, p + "2-way-corner-block")
jte(g, "15x15", "3-Way Corner Block", "B1503", "corner", 3, 21, p + "3-way-corner-block")
jte(g, "15x15", "4-Way Corner Block", "B1504", "corner", 4, 24, p + "4-way-corner-block")
jte(g, "15x15", "6-Way Corner Block", "B1506", "corner", 6, 28.5, p + "6-way-corner-block")
jte(g, "15x15", "Flat Plate Hinge Section", "B1507", "hinge", 2, 20, p + "flat-plate-hinge-section")
g = "General Purpose 20.5 x 20.5"
p = "aa/general-purpose-20-5-x-20-5/corners/"
jte(g, "20.5x20.5", "4-Way Corner Block", "B4407", "corner", 4, 37, p + "4-way-corner-block")
jte(g, "20.5x20.5", "6-Way Corner Block", "B4408", "corner", 6, 42, p + "6-way-corner-block")
jte(g, "20.5x20.5", "Flat Pivot Section 0-180 deg", "B4411", "pivot", 2, 37, p + "flat-pivot-section-0-180")
jte(g, "20.5x20.5", "Universal Pivot Section 0-90 deg", "B4410", "pivot", 2, 42, p + "universal-pivot-section-0-90")
jte(g, "20.5x20.5", "Universal Pivot Section 0-270 deg", "B4409", "pivot", 2, 43, p + "universal-pivot-section-0-270")
g = "General Purpose 12 Triangle"
p = "aa/general-purpose-12-triangle/corners/"
jte(g, "12tri", "3-Way Corner Block", "B9003", "corner", 3, 18, p + "3-way-corner-block")
jte(g, "12tri", "4-Way Corner Block", "B9004", "corner", 4, 23, p + "4-way-corner-block")
jte(g, "12tri", "2-Way Corner Block", "", "corner", 2, None, p + "2-way-corner-block", "weight not published on the product page")
jte(g, "12tri", "Flat Pivot Section", "B9008", "pivot", 2, 17, p + "flat-pivot-section")
g = "General Purpose 20.5 Triangle"
p = "aa/general-purpose-20-5-triangle/corners/"
jte(g, "20.5tri", "2-Way Corner Block", "B4505", "corner", 2, 35, p + "2-way-corner-block")
jte(g, "20.5tri", "3-Way Corner Block", "B4506", "corner", 3, 39.5, p + "3-way-corner-block")
jte(g, "20.5tri", "4-Way Corner Block", "B4507", "corner", 4, 44, p + "4-way-corner-block")
jte(g, "20.5tri", "Flat Pivot Section", "B4508", "pivot", 2, 39.5, p + "flat-pivot-section")
g = "Pre-Rig Truss"
p = "aa/pre-rig-truss/corners/"
jte(g, "prerig", "4-Way Corner Block", "B4301", "corner", 4, 61.75, p + "4-way-corner-block")
jte(g, "prerig", "Universal Pivot Section 0-90 deg", "B4303", "pivot", 2, 59.5, p + "universal-pivot-section-0-90")
jte(g, "prerig", "Universal Pivot Section 0-270 deg", "B4302", "pivot", 2, 59.5, p + "universal-pivot-section-0-270")
g = "SuperTruss 12 x 12"
p = "super-truss/supertruss-12-x-12/"
jte(g, "12x12", "90 deg Corner Gate", "B1201", "gate", 2, 8, p, "corner gate (bolt-on)")
jte(g, "12x12", "3-Way Corner Gate", "B1204A", "gate", 3, 8, p)
jte(g, "12x12", "Corner Plate", "B1208", "hinge", 2, 4, p)
g = "SuperTruss 15 x 15"
jte(g, "15x15", "90 deg Corner Gate", "", "gate", 2, None, "super-truss/supertruss-15-x-15/", "weight not published on the product page")
jte(g, "15x15", "3-Way / 120 deg Gate", "", "gate", 3, None, "super-truss/supertruss-15-x-15/", "weight not published on the product page")
g = "SuperTruss 18 x 12"
jte(g, "18x12", "90 deg Corner Gate", "", "gate", 2, None, "super-truss/supertruss-18-x-12/", "weight not published on the product page")
jte(g, "18x12", "3-Way Corner Gate", "", "gate", 3, None, "super-truss/supertruss-18-x-12/", "weight not published on the product page")
g = "SuperTruss 20.5 x 30"
jte(g, "20.5x30", "3-Way Gate", "B2904", "gate", 3, 17, "super-truss/supertruss-20-5-x-30/")
jte(g, "20.5x30", "3-Way Gate with lifting point", "B2905", "gate", 3, 18, "super-truss/supertruss-20-5-x-30/")
g = "Pre-Rig SuperTruss"
p = "super-truss/pre-rig-supertruss/"
jte(g, "prerig", "60 deg Corner Gate", "B1400", "gate", 2, 36, p)
jte(g, "prerig", "90 deg Corner Gate", "B1401", "gate", 2, 16, p)
jte(g, "prerig", "3-Way Gate", "B1404", "gate", 3, 14, p)

for i, r in enumerate(R, 1):
    r["id"] = i

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "corners.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("(function(g){g.TLA=g.TLA||{};g.TLA.data=g.TLA.data||{};g.TLA.data.corners=")
    json.dump(R, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";})(typeof globalThis!=='undefined'?globalThis:window);\n")
print(len(R), "corner block entries;", sum(1 for r in R if r["weight_lb"] is None and not r["variants"] and r["base_lb"] is None), "without published weight")
