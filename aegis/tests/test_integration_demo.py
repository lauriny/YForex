"""End-to-end: run Aegis against the bundled vulnerable demo app.

Verifies the flagship capability — cross-user object access (IDOR/BOLA) — is
discovered, modelled, tested, and confirmed, and that a regression test is emitted.
"""
import os
import socket
import tempfile

import pytest

from aegis.config.scope import scope_from_dict
from aegis.engine.orchestrator import Orchestrator
from aegis.model.finding import Confidence
from aegis.regression.generator import generate_regression_tests
from demo.vulnerable_app import serve_in_thread

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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


def _scope_for(port):
    base = f"http://127.0.0.1:{port}"
    return scope_from_dict({
        "target": {"ips": ["127.0.0.1"], "seeds": [f"{base}/"]},
        "accounts": [
            {"username": "alice", "password": "alice-pw", "role": "customer",
             "login": {"url": f"{base}/login", "method": "POST"}},
            {"username": "bob", "password": "bob-pw", "role": "customer",
             "login": {"url": f"{base}/login", "method": "POST"}},
        ],
        "testing": {"active_testing": True, "max_pages": 60, "max_depth": 4},
    })


def test_idor_is_discovered_and_confirmed(demo_server):
    result = Orchestrator(_scope_for(demo_server)).run()

    ac = [f for f in result.findings
          if f.category == "broken-access-control"
          and f.confidence == Confidence.CONFIRMED
          and f.module == "access_control"]
    assert ac, "expected at least one confirmed cross-user access-control finding"

    # both identities authenticated
    assert {i.name for i in result.identities} == {"alice", "bob"}
    assert all(i.authenticated for i in result.identities)

    # the orders IDOR must be among the findings, cross-user
    titles = " ".join(f.title for f in ac)
    assert "orders" in titles.lower()
    affected = {f.affected for f in ac}
    assert any(a.endswith("/api/orders/1") or a.endswith("/api/orders/2") for a in affected)


def test_public_and_protected_endpoints_are_not_flagged(demo_server):
    result = Orchestrator(_scope_for(demo_server)).run()
    ac = [f for f in result.findings if f.category == "broken-access-control"
          and f.confidence == Confidence.CONFIRMED]
    # /api/profile has no id and is per-user; must never be an IDOR finding.
    assert all("/api/profile" not in f.affected for f in ac)


def test_cookie_and_header_findings_present(demo_server):
    result = Orchestrator(_scope_for(demo_server)).run()
    cats = {f.category for f in result.findings}
    assert "session-management" in cats      # missing HttpOnly/SameSite
    assert "security-misconfiguration" in cats  # missing headers


def test_regression_test_is_generated(demo_server):
    result = Orchestrator(_scope_for(demo_server)).run()
    with tempfile.TemporaryDirectory() as d:
        # write a scope file for the generator to reference
        scope_path = os.path.join(d, "scope.yaml")
        base = f"http://127.0.0.1:{demo_server}"
        with open(scope_path, "w") as fh:
            fh.write(
                "target:\n  ips: ['127.0.0.1']\n  seeds: ['%s/']\n"
                "accounts:\n"
                "  - {username: alice, password: alice-pw, role: customer, login: {url: '%s/login'}}\n"
                "  - {username: bob, password: bob-pw, role: customer, login: {url: '%s/login'}}\n"
                "testing:\n  active_testing: true\n" % (base, base, base)
            )
        out = generate_regression_tests(result, os.path.join(d, "regression"),
                                        scope_path=scope_path, project_root=PROJECT_ROOT)
        assert out, "expected a regression test file to be generated"
        assert os.path.exists(out[0])
        content = open(out[0]).read()
        assert "def test_" in content
        assert "Broken access control" in content
