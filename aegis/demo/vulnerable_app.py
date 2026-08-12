"""Intentionally-vulnerable demo target for developing/testing Aegis LOCALLY.

This is NOT a real application and must never be exposed. It exists so the agent
has a controlled target with known, planted flaws:

  * IDOR / BOLA on GET /api/orders/{id}          (no object-level ownership check)
  * IDOR / BOLA on GET /api/orders/{id}/invoice  (same, systemic)
  * Session cookie set without HttpOnly / SameSite
  * No security response headers (CSP, X-Frame-Options, …)

A correctly-protected endpoint (GET /api/profile) is included for contrast.

Users:  alice / alice-pw   (owns order 1)
        bob   / bob-pw     (owns order 2)
"""
from __future__ import annotations

import json
import re
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

USERS = {"alice": "alice-pw", "bob": "bob-pw"}

# order_id -> {owner, data}
ORDERS = {
    "1": {"owner": "alice", "item": "Blue Widget", "total": "49.00", "address": "Alice St 1"},
    "2": {"owner": "bob", "item": "Red Gadget", "total": "99.00", "address": "Bob Ave 2"},
}

# session token -> username
SESSIONS: dict = {}


def _order_json(oid: str) -> bytes:
    o = ORDERS[oid]
    return json.dumps({"id": oid, "owner": o["owner"], "item": o["item"],
                       "total": o["total"], "address": o["address"]}).encode()


def _invoice_json(oid: str) -> bytes:
    o = ORDERS[oid]
    return json.dumps({"invoice_for_order": oid, "owner": o["owner"],
                       "amount": o["total"]}).encode()


class Handler(BaseHTTPRequestHandler):
    server_version = "DemoVuln/0.1"

    # -- helpers ------------------------------------------------------------
    def _user(self):
        cookie = self.headers.get("Cookie", "")
        m = re.search(r"session=([A-Za-z0-9_\-]+)", cookie)
        if not m:
            return None
        return SESSIONS.get(m.group(1))

    def _send(self, code, body=b"", ctype="application/json", extra_headers=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra_headers or {}).items():
            self.send_header(k, v)
        # NOTE: deliberately no CSP / X-Frame-Options / X-Content-Type-Options.
        self.end_headers()
        if body:
            self.wfile.write(body)

    def log_message(self, *args):  # silence default logging
        return

    # -- routing ------------------------------------------------------------
    def do_GET(self):
        path = urlparse(self.path).path
        user = self._user()

        if path == "/":
            html = (b"<!doctype html><html><body><h1>Demo Shop</h1>"
                    b"<a href='/dashboard'>My Dashboard</a></body></html>")
            return self._send(200, html, "text/html")

        if path == "/dashboard":
            if not user:
                return self._send(401, b'{"error":"login required"}')
            # link ONLY to this user's own objects (establishes ownership)
            own = [oid for oid, o in ORDERS.items() if o["owner"] == user]
            links = "".join(
                f"<a href='/api/orders/{oid}'>Order {oid}</a>"
                f"<a href='/api/orders/{oid}/invoice'>Invoice {oid}</a>"
                for oid in own
            )
            html = (f"<!doctype html><html><body><h1>Welcome {user}</h1>"
                    f"<a href='/api/orders'>My Orders (API)</a>"
                    f"<a href='/api/profile'>My Profile</a>{links}</body></html>").encode()
            return self._send(200, html, "text/html")

        if path == "/api/profile":
            # PROPERLY protected: returns only the caller's own data, no id param.
            if not user:
                return self._send(401, b'{"error":"login required"}')
            return self._send(200, json.dumps({"username": user, "role": "customer"}).encode())

        if path == "/api/orders":
            if not user:
                return self._send(401, b'{"error":"login required"}')
            own = {oid: o for oid, o in ORDERS.items() if o["owner"] == user}
            return self._send(200, json.dumps({"orders": list(own.keys())}).encode())

        m = re.fullmatch(r"/api/orders/(\w+)", path)
        if m:
            if not user:
                return self._send(401, b'{"error":"login required"}')
            oid = m.group(1)
            if oid not in ORDERS:
                return self._send(404, b'{"error":"not found"}')
            # *** VULN: no check that ORDERS[oid]["owner"] == user (IDOR/BOLA) ***
            return self._send(200, _order_json(oid))

        m = re.fullmatch(r"/api/orders/(\w+)/invoice", path)
        if m:
            if not user:
                return self._send(401, b'{"error":"login required"}')
            oid = m.group(1)
            if oid not in ORDERS:
                return self._send(404, b'{"error":"not found"}')
            # *** VULN: same missing ownership check on the invoice ***
            return self._send(200, _invoice_json(oid))

        return self._send(404, b'{"error":"not found"}')

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length).decode() if length else ""
        form = {k: v[0] for k, v in parse_qs(raw).items()}

        if path == "/login":
            u, p = form.get("username", ""), form.get("password", "")
            if USERS.get(u) == p:
                token = secrets.token_hex(16)
                SESSIONS[token] = u
                # VULN: cookie missing HttpOnly and SameSite.
                return self._send(
                    200, json.dumps({"status": "ok", "user": u}).encode(),
                    extra_headers={"Set-Cookie": f"session={token}; Path=/"},
                )
            return self._send(401, b'{"error":"invalid credentials"}')

        return self._send(404, b'{"error":"not found"}')


def make_server(host: str = "127.0.0.1", port: int = 8099) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), Handler)


def serve_in_thread(host: str = "127.0.0.1", port: int = 8099):
    httpd = make_server(host, port)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, thread


if __name__ == "__main__":
    import sys
    p = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    srv = make_server("127.0.0.1", p)
    print(f"Demo vulnerable app on http://127.0.0.1:{p}  (Ctrl-C to stop)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping")
        srv.shutdown()
