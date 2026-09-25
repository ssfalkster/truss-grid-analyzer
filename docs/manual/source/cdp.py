"""Minimal Chrome DevTools Protocol client (stdlib only): launch headless Chrome, evaluate JS, take screenshots,
print to PDF. Used to capture the manual's screenshots from the real app and to print the manual to PDF."""
import base64
import json
import os
import socket
import struct
import subprocess
import tempfile
import time
import urllib.request

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


class WS:
    """Just enough of RFC 6455 for CDP: masked text frames out, unmasked frames in."""

    def __init__(self, url):
        assert url.startswith("ws://")
        hostport, path = url[5:].split("/", 1)
        host, port = hostport.split(":")
        self.sock = socket.create_connection((host, int(port)))
        key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.sock.sendall(req.encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            resp += self.sock.recv(4096)
        if b" 101 " not in resp.split(b"\r\n")[0]:
            raise RuntimeError(resp.decode(errors="replace"))
        self.buf = resp.split(b"\r\n\r\n", 1)[1]

    def send(self, text):
        data = text.encode()
        head = bytearray([0x81])
        n = len(data)
        if n < 126:
            head.append(0x80 | n)
        elif n < 65536:
            head.append(0x80 | 126); head += struct.pack(">H", n)
        else:
            head.append(0x80 | 127); head += struct.pack(">Q", n)
        mask = os.urandom(4)
        head += mask
        self.sock.sendall(bytes(head) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(1 << 20)
            if not chunk:
                raise EOFError
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self):
        msg = b""
        while True:
            b1, b2 = self._read(2)
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(n)
            op = b1 & 0x0F
            if op in (0x1, 0x0, 0x2):
                msg += payload
                if b1 & 0x80:
                    return msg.decode()
            # ignore ping/pong/close


class Chrome:
    def __init__(self, width=1440, height=900, scale=1.5, port=9333):
        exe = next(p for p in CHROME_CANDIDATES if os.path.exists(p))
        self.prof = tempfile.mkdtemp(prefix="tga-chrome-")
        self.proc = subprocess.Popen([exe, "--headless=new", f"--remote-debugging-port={port}", "--remote-allow-origins=*",
                                      f"--user-data-dir={self.prof}", "--hide-scrollbars", "--no-first-run",
                                      "--disable-gpu", "--allow-file-access-from-files", f"--window-size={width},{height}", "about:blank"],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json"))
                page = next(t for t in tabs if t["type"] == "page")
                break
            except Exception:
                time.sleep(0.2)
        self.ws = WS(page["webSocketDebuggerUrl"])
        self.n = 0
        self.call("Page.enable")
        self.call("Runtime.enable")
        self.size(width, height, scale)

    def call(self, method, params=None):
        self.n += 1
        mid = self.n
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == mid:
                if "error" in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get("result", {})

    def size(self, width, height, scale=1.5):
        self.w, self.h = width, height
        self.call("Emulation.setDeviceMetricsOverride", {"width": width, "height": height, "deviceScaleFactor": scale, "mobile": False})

    def js(self, expr, wait=0.15):
        r = self.call("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True})
        if "exceptionDetails" in r:
            raise RuntimeError(f"JS error: {r['exceptionDetails'].get('exception', {}).get('description', r['exceptionDetails'])}\n{expr[:300]}")
        if wait:
            time.sleep(wait)
        return r.get("result", {}).get("value")

    def goto(self, url, wait=1.0):
        self.call("Page.navigate", {"url": url})
        time.sleep(wait)

    def shot(self, path, clip=None, quality=86):
        """clip = (x, y, w, h) in CSS px. JPEG unless the path ends in .png."""
        p = {"format": "png" if path.endswith(".png") else "jpeg", "captureBeyondViewport": False}
        if p["format"] == "jpeg":
            p["quality"] = quality
        if clip:
            x, y, w, h = clip
            p["clip"] = {"x": x, "y": y, "width": w, "height": h, "scale": 1}
        data = self.call("Page.captureScreenshot", p)["data"]
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))

    def pdf(self, path, **opts):
        o = {"printBackground": True, "preferCSSPageSize": True}
        o.update(opts)
        data = self.call("Page.printToPDF", o)["data"]
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))

    def close(self):
        try:
            self.call("Browser.close")
        except Exception:
            pass
        try:
            self.proc.wait(5)
        except Exception:
            self.proc.kill()
