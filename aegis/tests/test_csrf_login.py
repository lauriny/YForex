"""CSRF-aware form login: the SessionManager must fetch the login page, lift the
hidden token, and authenticate with email/password (no manual cookie copying).
"""
import socket

import pytest

from aegis.config.scope import scope_from_dict
from aegis.core.evidence import EvidenceLog
from aegis.core.guard import ScopeGuard
from aegis.core.session import SessionManager, parse_login_form
from demo.vulnerable_app import serve_in_thread


def test_parse_login_form_extracts_hidden_and_action():
    html = (
        "<form action='/login' method='post'>"
        "<input type='hidden' name='_csrf_token' value='abc123'>"
        "<input type='password' name='password'></form>"
    )
    hidden, action = parse_login_form(html, "https://shop.example/login", "password")
    assert hidden == {"_csrf_token": "abc123"}
    assert action == "https://shop.example/login"


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture()
def demo_server():
    port = _free_port()
    httpd, thread = serve_in_thread("127.0.0.1", port)
    yield port
    httpd.shutdown()
    thread.join(timeout=2)


def test_form_login_passes_csrf_token(demo_server):
    base = f"http://127.0.0.1:{demo_server}"
    scope = scope_from_dict({
        "target": {"ips": ["127.0.0.1"], "seeds": [f"{base}/"]},
        "accounts": [{"username": "alice", "password": "alice-pw", "role": "customer",
                      "login": {"url": f"{base}/login", "method": "POST"}}],
        "testing": {"active_testing": False},  # login must work even read-only
    })
    sm = SessionManager(scope, ScopeGuard(scope), EvidenceLog())
    idents = sm.login_all()
    assert idents and idents[0].authenticated, "CSRF-aware form login should succeed"

    # a protected endpoint confirms a real session was established
    resp = idents[0].client.get(f"{base}/api/profile")
    assert resp.ok and "alice" in resp.body


def test_login_without_form_token_is_rejected_by_demo(demo_server):
    """Sanity: the demo really enforces CSRF (so the test above proves extraction)."""
    base = f"http://127.0.0.1:{demo_server}"
    scope = scope_from_dict({
        "target": {"ips": ["127.0.0.1"], "seeds": [f"{base}/"]},
        "testing": {"active_testing": True},
    })
    from aegis.core.http import HttpClient
    client = HttpClient(ScopeGuard(scope), EvidenceLog(), identity="raw")
    # POST straight to /login without fetching the form -> no token -> 403
    resp = client.post(f"{base}/login", data={"username": "alice", "password": "alice-pw"})
    assert resp.status == 403
