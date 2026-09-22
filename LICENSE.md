# Truss Grid Analyzer - License

Truss Grid Analyzer, copyright (c) 2026 **G.E. Simmons Falk**.

Based on **Truss Load Analyzer - EOT** by **Delbert L. Hall and Jon Sogoian**, who are the originators of the program.
Rebuilt with the knowledge and permission of Delbert L. Hall (2026).

## 1. Origin and the original program's terms

Truss Grid Analyzer is a web rebuild of *Truss Load Analyzer - EOT* (Excel workbooks, versions 1.0 - 2.1,
2020 - 2021) by Delbert L. Hall and Jon Sogoian. It uses that program's method (Clapeyron's three-moment equation,
manufacturer-table span and cantilever checks), its truss, chain hoist and fixture data, and its results as test
references. The rebuild is new code, and it adds the truss-grid model, plan and 3D views, and the stiffness
(grillage) check.

The original workbook is open-source freeware. It may be distributed for free, and it sets three conditions on
anyone who modifies it (quoted from the workbook):

> 1) Give credit to Delbert L Hall and Jon Sogoian as the originators of the program
> 2) Update the History section to show: your name, when you made changes, and what features/changes you made
> 3) Do not charge for new versions of the program

These conditions apply to Truss Grid Analyzer and to anything made from it.

## 2. Permission and conditions

Anyone may use, copy, modify and distribute Truss Grid Analyzer **free of charge**, provided that:

1. **Credit.** Keep this license file with every copy. Credit Delbert L. Hall and Jon Sogoian as the originators
   of the program, and G.E. Simmons Falk as the author of Truss Grid Analyzer.
2. **History.** If you modify it, add your name, the date, and what you changed to the version history (the About
   dialog, kept in `src/version.js`). Mark your copy as a modified version.
3. **No charge.** Do not charge for this program or for any version of it, modified or not.
4. **Responsibility.** The person who modifies the program is responsible for the results of those
   modifications.

## 3. Data

The truss, chain hoist and fixture data come from the manufacturers' published tables, as compiled in the original
workbook. Corner block data comes from the Christie Lites and James Thomas Engineering catalogues. The data and the
product names belong to their respective owners. Their inclusion does not mean those owners endorse this program.
Check data against the manufacturer's current publications before relying on it.

## 4. CalcForge and other references

- **CalcForge** (calcforge.com, operated by Civils.ai Pte. Ltd.) is the recommended independent tool for
  cross-checking a rig, using its *3D Structural Analysis* calculator. **No CalcForge software, code or content is
  included in or distributed with Truss Grid Analyzer**, and CalcForge does not endorse it. Using CalcForge is
  governed by CalcForge's own End User License Agreement, which the user must accept separately. That agreement
  says, among other things, that:
  - the calculators are the intellectual property of Civils.ai;
  - accounts are for a single user and must not be shared;
  - its software is for feasibility and early-stage planning only, not for detailed or "for-construction" design;
  - calculations must be signed off by a professional, competent structural engineer and verified by independent
    means.

  A CalcForge result is therefore a **check, not an approval**.
- The open-source engines behind CalcForge's calculators were read for comparison: PyNite (MIT License),
  IndeterminateBeam (MIT License) and anaStruct (GNU LGPL v3). No code from them is included. If code is ever
  adapted from one of them, its license notice must be added to this file.
- *Rigging Math Made Simple* (Delbert L. Hall) and the ANSI E1 entertainment technology standards are referenced
  for method and verification. No text from them is included.

## 5. Disclaimer - no warranty

Truss Grid Analyzer is intended for entertainment rigging professionals, to assist them in making rigging
decisions. Every attempt has been made to be accurate. It is provided "as is", without warranty of any kind.
The authors of the original program (Delbert L. Hall and Jon Sogoian), the original team, G.E. Simmons Falk and
any contributors are **not responsible for errors in the program or for the results of its use**. Users are
responsible for verifying the results before using them to make rigging decisions. This program does not replace
a qualified rigger or engineer.

## 6. Acknowledgements

- **Delbert L. Hall and Jon Sogoian**, for *Truss Load Analyzer - EOT*, and the original team credited in the
  workbook: Don Earl, Roman Pastierik, Joe Golden, Kai Vidar Bech, Coen Kortendijk, Alex Tomanovich, Michael Wells
  and Will Todd.
- **Issy Stadler, Drop Bear Productions**, for testing help.
