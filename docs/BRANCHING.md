# Branches, versions and releases

Two long-lived branches:

| Branch | What it is | Version looks like |
|---|---|---|
| `main` | The released app. Only changes at a release. | `1.28.1` |
| `beta` | The next Major version, always one Major ahead of `main`. All new work happens here. | `2.0.0-beta.3` |

## Day-to-day work (on BETA)

1. Branch from `beta` (`feat/...`, `fix/...`, or a Claude session branch) and open the pull request **into `beta`**, never `main`.
2. Bump `TLA.VERSION` in `src/version.js` and add a history entry (newest first) with each change: `2.0.0-beta.N`, N counting up.
   Rebuild `dist/index.html` (`python tools/build.py`) and run `tests/run.html`; everything must pass.
3. The manual is **not** touched on BETA.

**Until 2.0.0 is released:** do not merge `main` into `beta` (PR #61's revert would remove the BETA work). GitHub shows
`beta` one commit behind `main` (the revert); that is expected. A hotfix to `main` goes into `beta` by cherry-pick instead.

## Hotfixes to `main`

If released `main` has a bug that cannot wait for the next Major: fix it on a branch from `main`, PR into `main`, bump the patch
(`1.28.2`), tag it, then merge `main` into `beta` so the fix is not lost.

## Releasing (BETA into main)

1. On `beta`, set `TLA.VERSION` to the final Major (`2.0.0`; drop the `-beta.N`), add its history entry, rebuild `dist`, run the tests.
2. Update the documentation for that version: the manual (see `docs/manual/source/README.md`), `README.md`, the Help menu
   file names in `index.html`, and the version noted in the docs.
3. Merge `beta` into `main` (pull request), and tag `main` `v2.0.0`.
   **For 2.0.0 (reminder):** `main` carries a revert of PR #59 (PR #61: an early merge of `2.0.0-beta.2` into `main`, undone
   to keep `main` at 1.28.1). Git counts those beta commits as already merged, so **revert that revert on `main` first**
   (or as the first commit of the release PR); otherwise the release leaves them out. Check the released `main` has the
   partial UDL work (`tests/udl-tests.js`). Delete this reminder once 2.0.0 is out.
4. Start the next cycle: `beta` takes the version `3.0.0-beta.1` (one Major ahead of `main` again).

## Tags

Every released version on `main` is tagged `vX.Y.Z`. BETA builds are not tagged, except when handing one out for testing (`v2.0.0-beta.N`).
