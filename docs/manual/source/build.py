"""Build the Truss Grid Analyzer manual from guide.src.html and quickstart.src.html:
  ../Truss Grid Analyzer - User Guide (v<VER>).html   searchable, self-contained (images inlined)
  ../Truss Grid Analyzer - User Guide (v<VER>).pdf
  ../Truss Grid Analyzer - Quick Start (v<VER>).pdf
Run from this folder: python build.py   (screenshots: python capture.py, python tutorial.py)
Source markup: [[img file|caption|width%]], [[pins file|caption|width%|n@x,y;n@x,y]] (x, y in % of the image),
{{pin n}}, {{VER}}, {{DATE}}; <section class="chapter"><h2>...</h2>...; h2/h3 are numbered and given ids here."""
import base64
import html
import io
import pathlib
import re

from PIL import Image

VER = "1.24.0"
DATE = "24 September 2026"
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent
CSS = (HERE / "manual.css").read_text(encoding="utf-8")
TITLE = "Truss Grid Analyzer - User Guide"
CREDIT = ('<p class="credit">By <b>G.E. Simmons Falk</b>. Truss Grid Analyzer is an expansion, for indeterminate grids, of '
          '<i>Truss Load Analyzer - EOT</i> by <b>Delbert L. Hall and Jon Sogoian</b>, the originators of the program.</p>')


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"<[^>]+>", "", s).lower()).strip("-")


def macros(src, img_url):
    def fig(m):
        kind, body = m.group(1), m.group(2)
        parts = [p.strip() for p in body.split("|")]
        name, cap = parts[0], parts[1] if len(parts) > 1 else ""
        width = parts[2] if len(parts) > 2 and parts[2] else "100"
        pins = ""
        if kind == "pins" and len(parts) > 3:
            for p in parts[3].split(";"):
                n, xy = p.split("@")
                x, y = xy.split(",")
                pins += f'<span class="pin" style="left:{x}%;top:{y}%">{n.strip()}</span>'
        alt = html.escape(re.sub(r"<[^>]+>", "", cap), quote=True)
        style = f"width:calc({width}% - 40px)" if pins else f"width:{width}%"
        return (f'<figure><div class="frame{" pinned" if pins else ""}" style="{style}"><img src="{img_url(name)}" alt="{alt}" style="width:100%">{pins}</div>'
                + (f"<figcaption>{cap}</figcaption>" if cap else "") + "</figure>")
    src = re.sub(r"\[\[(img|pins)\s+(.+?)\]\]", fig, src, flags=re.S)
    src = re.sub(r"\{\{pin (\w+)\}\}", r'<span class="pin">\1</span>', src)
    src = re.sub(r"(<table[^>]*>)\s*(<tr>\s*<th.*?</tr>)", r"\1<thead>\2</thead>", src, flags=re.S)
    return src.replace("{{VER}}", VER).replace("{{DATE}}", DATE)


def number(src):
    """Number h2 (chapters) and h3, give them ids; returns (html, toc [(level, num, text, id)])."""
    toc, n2, n3 = [], 0, 0

    def h(m):
        nonlocal n2, n3
        lvl, attrs, text = m.group(1), m.group(2) or "", m.group(3)
        if "data-nonum" in attrs:
            return m.group(0)
        if lvl == "2":
            n2 += 1; n3 = 0; num = f"{n2}"
        else:
            n3 += 1; num = f"{n2}.{n3}"
        idm = re.search(r'id="([^"]+)"', attrs)
        hid = idm.group(1) if idm else f"s{num.replace('.', '-')}-{slug(text)[:40]}"
        toc.append((int(lvl), num, text, hid))
        return f'<h{lvl} id="{hid}"><span class="num">{num}</span>{text}</h{lvl}>'
    out = re.sub(r"<h([23])((?:\s[^>]*)?)>(.*?)</h\1>", h, src, flags=re.S)
    return out, toc


def inline_img(name, cache={}):
    if name not in cache:
        im = Image.open(HERE / "img" / name)
        if im.width > 1600:
            im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        buf = io.BytesIO()
        if name.endswith(".png"):
            im.save(buf, "PNG", optimize=True); mime = "png"
        else:
            im.convert("RGB").save(buf, "JPEG", quality=80, optimize=True, progressive=True); mime = "jpeg"
        cache[name] = f"data:image/{mime};base64," + base64.b64encode(buf.getvalue()).decode()
    return cache[name]


def file_img(name):
    return (HERE / "img" / name).as_uri()


# ------------------------------------------------------------------ searchable web guide
WEB_JS = r"""
(function () {
  var q = document.getElementById('q'), out = document.getElementById('hits'), main = document.getElementById('content');
  var blocks = [].slice.call(main.querySelectorAll('h2,h3,h4,p,li,td,th,figcaption,.box > b'));
  blocks = blocks.filter(function (b) { return !b.querySelector('p,li,td,h3,h4'); });
  var index = blocks.map(function (b) {
    var sec = b.closest('section'), h = null, el = b;
    while (el && !h) { var prev = el.previousElementSibling; while (prev && !/^H[23]$/.test(prev.tagName)) prev = prev.previousElementSibling; if (prev) h = prev; else el = el.parentElement; if (el === main) break; }
    if (/^H[23]$/.test(b.tagName)) h = b;
    return { el: b, text: b.textContent.replace(/\s+/g, ' ').trim(), where: h ? title(h) : (sec && sec.querySelector('h2') ? title(sec.querySelector('h2')) : 'Title page') };
  });
  function title(h) { var n = h.querySelector('.num'); return n ? n.textContent + '  ' + h.textContent.slice(n.textContent.length) : h.textContent; }
  function esc(s) { return s.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function clearMarks() { [].slice.call(main.querySelectorAll('mark.hit')).forEach(function (m) { var t = document.createTextNode(m.textContent); m.parentNode.replaceChild(t, m); t.parentNode.normalize(); }); }
  function markIn(el, words) {
    var tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), nodes = [], n;
    while ((n = tw.nextNode())) nodes.push(n);
    nodes.forEach(function (node) {
      var s = node.nodeValue, low = s.toLowerCase(), spans = [];
      words.forEach(function (w) { var i = 0; while ((i = low.indexOf(w, i)) >= 0) { spans.push([i, i + w.length]); i += w.length; } });
      if (!spans.length) return;
      spans.sort(function (a, b) { return a[0] - b[0]; });
      var frag = document.createDocumentFragment(), at = 0;
      spans.forEach(function (sp) { if (sp[0] < at) return; frag.appendChild(document.createTextNode(s.slice(at, sp[0]))); var m = document.createElement('mark'); m.className = 'hit'; m.textContent = s.slice(sp[0], sp[1]); frag.appendChild(m); at = sp[1]; });
      frag.appendChild(document.createTextNode(s.slice(at)));
      node.parentNode.replaceChild(frag, node);
    });
  }
  function run() {
    var v = q.value.trim().toLowerCase(), words = v.split(/\s+/).filter(Boolean);
    clearMarks(); out.innerHTML = '';
    document.body.classList.toggle('searching', !!words.length);
    if (!words.length || v.length < 2) { out.hidden = true; return; }
    var hits = index.filter(function (x) { var t = (x.text + ' ' + x.where).toLowerCase(); return words.every(function (w) { return t.indexOf(w) >= 0; }) && words.some(function (w) { return x.text.toLowerCase().indexOf(w) >= 0; }); });
    out.hidden = false;
    var head = document.createElement('div'); head.className = 'hh'; head.textContent = hits.length ? hits.length + (hits.length === 1 ? ' match' : ' matches') + (hits.length > 80 ? ' - showing the first 80' : '') : 'No matches. Try fewer or shorter words.'; out.appendChild(head);
    hits.slice(0, 80).forEach(function (x) {
      var t = x.text, low = t.toLowerCase(), i = Math.max(0, low.indexOf(words[0]) - 60), snip = (i ? '…' : '') + t.slice(i, i + 170) + (t.length > i + 170 ? '…' : '');
      var h = esc(snip); words.forEach(function (w) { h = h.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); });
      var a = document.createElement('a'); a.href = '#'; a.innerHTML = '<b>' + esc(x.where) + '</b><span>' + h + '</span>';
      a.onclick = function (e) { e.preventDefault(); out.hidden = true; markIn(x.el, words); x.el.scrollIntoView({ block: 'center' }); x.el.classList.remove('flash'); void x.el.offsetWidth; x.el.classList.add('flash'); if (innerWidth < 900) document.body.classList.remove('nav-open'); };
      out.appendChild(a);
    });
  }
  var timer; q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 120); });
  q.addEventListener('focus', function () { if (q.value.trim().length >= 2 && out.childNodes.length) out.hidden = false; });
  document.addEventListener('click', function (e) { if (!e.target.closest('#hits') && e.target !== q) out.hidden = true; });
  q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; run(); } if (e.key === 'Enter') { var a = out.querySelector('a'); if (a) a.click(); } });
  document.addEventListener('keydown', function (e) { if ((e.key === '/' || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) && document.activeElement !== q) { e.preventDefault(); q.focus(); q.select(); } });
  document.getElementById('navbtn').onclick = function () { document.body.classList.toggle('nav-open'); };
  // highlight the current chapter in the table of contents
  var links = [].slice.call(document.querySelectorAll('#toc a')), heads = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
  function spy() { var y = 90, cur = 0; heads.forEach(function (h, i) { if (h && h.getBoundingClientRect().top < y) cur = i; }); links.forEach(function (a, i) { a.classList.toggle('on', i === cur); }); var on = links[cur], nav = document.getElementById('toc'); if (on && (on.offsetTop < nav.scrollTop + 20 || on.offsetTop > nav.scrollTop + nav.clientHeight - 40)) nav.scrollTop = on.offsetTop - nav.clientHeight / 3; }
  document.addEventListener('scroll', spy, { passive: true }); spy();
  links.forEach(function (a) { a.addEventListener('click', function () { if (innerWidth < 900) document.body.classList.remove('nav-open'); }); });
})();
"""

WEB_CSS = r"""
body { background: var(--paper); }
.top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 14px; padding: 10px 20px; background: var(--paper); border-bottom: 1px solid var(--line); }
.top .t { font-weight: 700; white-space: nowrap; } .top .v { color: var(--muted); font-size: .88em; white-space: nowrap; }
.top .grow { flex: 1; }
#q { width: min(440px, 100%); font: inherit; padding: 7px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--soft); color: var(--ink); }
#q:focus { outline: 2px solid var(--accent); background: var(--paper); }
#navbtn { display: none; font: inherit; border: 1px solid var(--line); background: var(--paper); color: var(--ink); border-radius: 6px; padding: 5px 10px; }
.wrap { display: grid; grid-template-columns: 290px minmax(0, 1fr); }
nav#toc { position: sticky; top: 55px; align-self: start; height: calc(100vh - 55px); overflow: auto; padding: 16px 12px 40px 20px; border-right: 1px solid var(--line); font-size: .9em; }
nav#toc a { display: block; padding: 3px 8px; border-radius: 4px; color: var(--ink-2); text-decoration: none; }
nav#toc a.l3 { padding-left: 26px; font-size: .93em; color: var(--muted); }
nav#toc a:hover { background: var(--soft); } nav#toc a.on { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
nav#toc .num { display: inline-block; min-width: 2.3em; color: var(--muted); font-variant-numeric: tabular-nums; }
#content { max-width: 940px; padding: 26px 40px 120px; }
#content section.chapter { padding-top: 26px; }
#content h2, #content h3 { scroll-margin-top: 70px; }
#hits { position: fixed; z-index: 6; top: 52px; right: 20px; width: min(520px, calc(100vw - 40px)); max-height: 70vh; overflow: auto; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,.18); }
#hits .hh { padding: 8px 14px; font-size: .85em; color: var(--muted); border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--paper); }
#hits a { display: block; padding: 8px 14px; border-bottom: 1px solid var(--soft); text-decoration: none; color: var(--ink); font-size: .9em; }
#hits a:hover { background: var(--soft); } #hits a b { display: block; font-size: .85em; color: var(--accent); } #hits mark, mark.hit { background: var(--mark); color: inherit; }
.flash { animation: fl 1.6s ease-out; } @keyframes fl { 0% { background: var(--mark); } 100% { background: transparent; } }
.cover { padding: 30px 0 10px; } .cover h1 { font-size: 2.1em; margin: 0 0 .2em; }
@media (max-width: 900px) {
  .wrap { grid-template-columns: 1fr; } #navbtn { display: inline-block; }
  nav#toc { display: none; position: fixed; top: 55px; left: 0; right: 0; z-index: 4; background: var(--paper); height: calc(100vh - 55px); }
  body.nav-open nav#toc { display: block; }
  #content { padding: 16px 16px 100px; } .top .v { display: none; } .row2, .side { grid-template-columns: 1fr; } .pinkey { columns: 1; }
}
@media (prefers-color-scheme: dark) {
  :root { --ink: #e6e9ed; --ink-2: #c9ced5; --muted: #98a2ae; --line: #343b44; --soft: #20262d; --paper: #15191e; --accent: #6ea2ff; --accent-soft: #1b2a44; --ok: #52c787; --ok-soft: #14301f; --warn: #f0b34a; --warn-soft: #33270f; --fail: #ff7b7b; --fail-soft: #3a1818; --mark: #6b5a12; }
  .ui { color: #cfe0ff; } h2 { border-bottom-color: var(--line); } figure img { box-shadow: none; }
}
"""


def web(guide, toc):
    body = macros(guide, inline_img)
    nav = "".join(f'<a class="l{l}" href="#{i}"><span class="num">{n}</span>{re.sub(r"<[^>]+>", "", t)}</a>' for l, n, t, i in toc)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{TITLE} (v{VER})</title><style>{CSS}{WEB_CSS}</style></head><body>
<div class="top"><button id="navbtn">☰ Contents</button><span class="t">Truss Grid Analyzer - User Guide</span><span class="v">for version {VER}</span><span class="grow"></span>
<input id="q" type="search" placeholder="Search the guide  (press / )" autocomplete="off" aria-label="Search the guide"></div>
<div id="hits" hidden></div>
<div class="wrap"><nav id="toc" aria-label="Contents">{nav}</nav><main id="content"><div class="cover"><div class="muted">Truss Grid Analyzer</div><h1>User Guide</h1><p class="muted">Written for version {VER} - {DATE}</p>{CREDIT}</div>{body}</main></div>
<script>{WEB_JS}</script></body></html>"""


# ------------------------------------------------------------------ print
PRINT_CSS = r"""
@page { size: letter; margin: 0.7in 0.75in 0.75in; }
.cover { height: 9.3in; display: flex; flex-direction: column; justify-content: center; }
.cover h1 { font-size: 34pt; margin: 0 0 .15em; line-height: 1.1; }
.cover .sub { font-size: 15pt; color: var(--ink-2); margin: 0 0 1.4em; }
.toc { break-before: page; } .toc h2 { border: 0; }
.toc a { display: flex; gap: .5em; text-decoration: none; color: var(--ink); padding: .12em 0; }
.toc a.l2 { font-weight: 600; margin-top: .45em; } .toc a.l3 { padding-left: 2.2em; font-size: .95em; color: var(--ink-2); }
.toc .num { min-width: 2.4em; color: var(--accent); } .toc .tt { flex: 1; } .toc .pg { color: var(--muted); font-variant-numeric: tabular-nums; }
.side figure img, .row2 figure img { max-height: 8.3in; width: auto !important; margin: 0 auto; }
"""


def printable(src, toc, cover, with_toc=True, pages=None):
    pages = pages or {}
    body = macros(src, inline_img)
    toc_html = ""
    if with_toc:
        toc_html = '<div class="toc"><h2 data-nonum>Contents</h2>' + "".join(
            f'<a class="l{l}" href="#{i}"><span class="num">{n}</span><span class="tt">{re.sub(r"<[^>]+>", "", t)}</span><span class="pg">{pages.get(i, "")}</span></a>' for l, n, t, i in toc) + "</div>"
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{TITLE}</title><style>{CSS}{PRINT_CSS}</style></head>
<body>{cover}{toc_html}{body}</body></html>"""


FOOT = ('<div style="width:100%;font:7.5pt Segoe UI,sans-serif;color:#666;padding:0 0.75in;display:flex;justify-content:space-between">'
        '<span>{title} - written for Truss Grid Analyzer v' + VER + '</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>')


def outline_fix(path):
    """Chrome doubles h2 titles in the PDF outline ("11About this guideAbout this guide"): rebuild each title, and
    return the outline entries in order as (title, page index)."""
    import pypdf
    from pypdf.generic import NameObject, TextStringObject
    w = pypdf.PdfWriter(clone_from=str(path))
    found = []
    def fix(t):
        m = re.match(r"^(\d+(?:\.\d+)?)\1(.+)$", t)
        if m and len(m.group(2)) % 2 == 0 and m.group(2)[:len(m.group(2)) // 2] == m.group(2)[len(m.group(2)) // 2:]:
            return m.group(1) + "  " + m.group(2)[:len(m.group(2)) // 2]
        if len(t) % 2 == 0 and t[:len(t) // 2] == t[len(t) // 2:]:
            return t[:len(t) // 2]
        return re.sub(r"^(\d+\.\d+)(\S)", r"\1  \2", t)
    pages = {p.indirect_reference.idnum: k for k, p in enumerate(w.pages)}
    def walk(node):
        while node is not None:
            n = node.get_object()
            t = fix(str(n["/Title"]))
            n[NameObject("/Title")] = TextStringObject(t)
            dest = n.get("/Dest")
            pg = None
            if dest is not None:
                d = dest.get_object()
                if isinstance(d, list) or hasattr(d, "__getitem__"):
                    try: pg = pages.get(d[0].idnum)
                    except Exception: pg = None
            found.append((t, pg))
            if "/First" in n: walk(n["/First"])
            node = n.get("/Next")
    root = w._root_object.get("/Outlines")
    if root is not None and "/First" in root.get_object():
        walk(root.get_object()["/First"])
    w.write(str(path))
    return found


def to_pdf(chrome, html_text, name, title):
    tmp = HERE / f"_{slug(name)}.html"
    tmp.write_text(html_text, encoding="utf-8")
    chrome.goto(tmp.as_uri(), 2.0)
    opts = dict(displayHeaderFooter=True, headerTemplate="<span></span>", footerTemplate=FOOT.replace("{title}", title))
    try:
        chrome.pdf(str(OUT / name), generateDocumentOutline=True, **opts)
    except RuntimeError:
        chrome.pdf(str(OUT / name), **opts)
    tmp.unlink()
    outline_fix(OUT / name)
    import pymupdf
    with pymupdf.open(str(OUT / name)) as d:
        found = [(t, p - 1) for lvl, t, p in d.get_toc() if p > 0]
    print("wrote", OUT / name)
    return found


if __name__ == "__main__":
    from cdp import Chrome
    guide, toc = number("\n".join(p.read_text(encoding="utf-8") for p in sorted(HERE.glob("guide-*.src.html"))))
    (OUT / f"{TITLE} (v{VER}).html").write_text(web(guide, toc), encoding="utf-8")
    print("wrote", OUT / f"{TITLE} (v{VER}).html")
    qs_src, qs_toc = number((HERE / "quickstart.src.html").read_text(encoding="utf-8"))
    cover_g = (f'<div class="cover"><div class="muted">Truss Grid Analyzer</div><h1>User Guide</h1><p class="sub">How to build a rig, load it, hang it and read the results</p>'
               f'<div><div class="versionbox"><b>Written for version {VER}</b><br>{DATE}</div></div>{CREDIT}'
               f'<p class="muted small" style="margin-top:2.5em;max-width:5.6in">This guide is written for version {VER} and is not updated for every release. Later versions may look or behave differently; the version you are running is shown next to the app name in the header. '
               f'A searchable copy of this guide is supplied as an HTML file with the same name.</p></div>')
    cover_q = (f'<div class="cover"><div class="muted">Truss Grid Analyzer</div><h1>Quick Start</h1><p class="sub">Your first rig in ten minutes</p>'
               f'<div><div class="versionbox"><b>Written for version {VER}</b><br>{DATE}</div></div>{CREDIT}'
               f'<p class="muted small" style="margin-top:2.5em;max-width:5.6in">For everything else, see the full User Guide (PDF, or the searchable HTML copy). The guides are written for version {VER} and are not updated for every release.</p></div>')
    c = Chrome(1200, 900, 1)
    try:
        found = to_pdf(c, printable(guide, toc, cover_g), f"{TITLE} (v{VER}).pdf", "User Guide")
        by_title = {}
        for t, pg in found:
            if pg is not None: by_title.setdefault(re.sub(r"\s+", " ", t).strip(), pg + 1)
        pages = {}
        for l, n, t, i in toc:
            key = re.sub(r"\s+", " ", f"{n} {html.unescape(re.sub(r'<[^>]+>', '', t))}").strip()
            if key in by_title: pages[i] = by_title[key]
        if len(pages) != len(toc): print("warning: page found for", len(pages), "of", len(toc), "headings:", [n for l, n, t, i in toc if i not in pages][:10])
        to_pdf(c, printable(guide, toc, cover_g, pages=pages), f"{TITLE} (v{VER}).pdf", "User Guide")
        to_pdf(c, printable(qs_src, qs_toc, cover_q, with_toc=False), f"Truss Grid Analyzer - Quick Start (v{VER}).pdf", "Quick Start")
    finally:
        c.close()
