"""Capture every screenshot the manual uses from the pinned app build (app-1.24.0.html), light theme.
Run from this folder: python capture.py  -> img/*.jpg / *.png"""
import pathlib
import time
from cdp import Chrome

URL = pathlib.Path("app-1.24.0.html").resolve().as_uri()
W, H = 1440, 900
c = Chrome(W, H, 1.5)

HELPERS = r"""
window.M = {
  S: TLA.store,
  T: function (n) { return TLA.store.rig.trusses.filter(function (t) { return t.name === n; })[0]; },
  rect: function (q, pad) { var e = typeof q === 'string' ? document.querySelector(q) : q; if (!e) return null; var r = e.getBoundingClientRect(); pad = pad || 0; return [Math.max(0, r.x - pad), Math.max(0, r.y - pad), r.width + 2 * pad, r.height + 2 * pad]; },
  btn: function (txt, root) { return Array.prototype.filter.call((root || document).querySelectorAll('button'), function (b) { return b.textContent.trim() === txt && b.offsetParent; })[0]; },
  insH: function () { var i = document.getElementById('inspector'), r = i.getBoundingClientRect(), last = i.lastElementChild; var b = last ? last.getBoundingClientRect().bottom : r.bottom; return [r.x, r.y, r.width, Math.min(b - r.y + 10, innerHeight - r.y)]; },
  only: function (g) { M.collapse(); var d = document.querySelector('#inspector [data-grp="' + g + '"]'); if (d) { d.open = true; document.getElementById('inspector').scrollTop = 0; } },
  expand: function () { var b = M.btn('Expand all'); if (b) b.click(); },
  collapse: function () { var b = M.btn('Collapse all'); if (b) b.click(); },
  key: function (k, o) { document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {}))); },
  cell: function (rowPred, col) { var tds = document.querySelectorAll('#summary tr[data-r]'); for (var i = 0; i < tds.length; i++) { if (rowPred(tds[i])) { var td = tds[i].querySelector('td[data-c="' + col + '"]'); td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return true; } } return false; }
};
true
"""


def fresh(example=True, theme="light"):
    c.size(W, H)
    c.goto(URL, 1.0)
    c.js(f"localStorage.clear(); localStorage.setItem('tla-theme','{theme}'); location.reload()", 0)
    time.sleep(1.8)
    c.js(HELPERS)
    if not example:
        c.js("TLA.store.newRig(); TLA.store.ui.fit = true; TLA.store.emit();")
    c.js("TLA.app.setStep(1); TLA.plan.fit();", 0.4)


def shot(name, clip=None):
    path = f"img/{name}"
    c.shot(path, clip)
    print("  ", path)


def rect(q, pad=0):
    return c.js(f"M.rect({q!r}, {pad})", 0)


