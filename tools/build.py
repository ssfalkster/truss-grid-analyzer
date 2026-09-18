"""Bundle the app into one self-contained dist/index.html (no network, works from file://).
Usage: python build.py
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
OUT = os.path.join(ROOT, "dist", "index.html")


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def main():
    html = read("index.html")
    css = re.search(r'<link rel="stylesheet" href="([^"]+)">', html)
    html = html.replace(css.group(0), "<style>\n" + read(css.group(1)) + "\n</style>")

    def inline(m):
        code = read(m.group(1)).replace("</script", "<\\/script")
        return "<script>\n" + code + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)
    print("wrote %s (%d KB)" % (os.path.normpath(OUT), os.path.getsize(OUT) // 1024))


if __name__ == "__main__":
    main()
