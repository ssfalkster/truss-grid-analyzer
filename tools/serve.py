"""Tiny static file server for development: serves ../ (the app folder) on port 8765 with caching turned off."""
import functools
import http.server
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCache, directory=ROOT)
    http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler).serve_forever()
