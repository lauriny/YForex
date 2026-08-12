"""Aegis command-line interface."""
from __future__ import annotations

import argparse
import os
import sys
from typing import Optional

from . import __version__
from .config.scope import ScopeError, load_scope
from .engine.orchestrator import Orchestrator
from .regression.generator import generate_regression_tests
from .reporting.report import write_reports

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _log(msg: str) -> None:
    print(msg, flush=True)


def _run_assessment(scope_path: str, out_dir: str) -> int:
    try:
        scope = load_scope(scope_path)
    except ScopeError as exc:
        _log(f"[!] scope error: {exc}")
        return 2

    orch = Orchestrator(scope, log=_log)
    result = orch.run()

    paths = write_reports(result, out_dir)
    reg = generate_regression_tests(
        result, os.path.join(out_dir, "regression"),
        scope_path=scope_path, project_root=PROJECT_ROOT,
    )

    _log("\n[*] Reports written:")
    _log(f"    markdown : {paths['markdown']}")
    _log(f"    json     : {paths['json']}")
    if reg:
        _log(f"    regression tests: {reg[0]} ({len(reg) - 1} test(s))")

    _final_summary(result)
    return 0


def _final_summary(result) -> None:
    from .model.finding import Confidence, Severity
    by_sev = lambda s: sum(1 for f in result.findings if f.severity == s)  # noqa: E731
    _log("\nASSESSMENT COMPLETE")
    _log(f"  Assets           : {', '.join(result.scope.authorized_hosts())}")
    _log(f"  Identities/Roles : {', '.join(f'{i.name}[{i.role}]' for i in result.identities)}")
    _log(f"  Endpoints        : {len(result.appmap.endpoints)}")
    _log(f"  Owned objects    : {len(result.resources.owned_objects())}")
    _log(f"  Confirmed        : {len(result.confirmed())}")
    _log(f"  Critical/High    : {by_sev(Severity.CRITICAL)}/{by_sev(Severity.HIGH)}")
    _log(f"  Medium/Low       : {by_sev(Severity.MEDIUM)}/{by_sev(Severity.LOW)}")


def _cmd_scope(args) -> int:
    try:
        scope = load_scope(args.scope)
    except ScopeError as exc:
        _log(f"[!] scope error: {exc}")
        return 2
    _log(scope.summary())
    return 0


def _cmd_assess(args) -> int:
    return _run_assessment(args.scope, args.out)


def _cmd_demo(args) -> int:
    """Start the bundled vulnerable demo app, assess it, then tear it down."""
    import tempfile
    import threading

    # Import the demo target (kept out of the aegis package on purpose).
    sys.path.insert(0, PROJECT_ROOT)
    from demo.vulnerable_app import serve_in_thread  # type: ignore

    host, port = "127.0.0.1", args.port
    httpd, thread = serve_in_thread(host, port)
    _log(f"[*] demo target running at http://{host}:{port}")
    try:
        scope_yaml = _demo_scope_yaml(host, port)
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as tf:
            tf.write(scope_yaml)
            scope_path = tf.name
        return _run_assessment(scope_path, args.out)
    finally:
        httpd.shutdown()
        thread.join(timeout=2)
        _log("[*] demo target stopped")


def _demo_scope_yaml(host: str, port: int) -> str:
    base = f"http://{host}:{port}"
    return f"""
target:
  ips: ["{host}"]
  seeds: ["{base}/"]
environment:
  production: false
  staging: true
accounts:
  - username: "alice"
    password: "alice-pw"
    role: "customer"
    login: {{url: "{base}/login", method: "POST"}}
  - username: "bob"
    password: "bob-pw"
    role: "customer"
    login: {{url: "{base}/login", method: "POST"}}
testing:
  active_testing: true
  request_delay_seconds: 0.0
  max_pages: 60
  max_depth: 4
"""


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="aegis",
        description="Scoped, authorization-first web application security assessment agent.",
    )
    p.add_argument("--version", action="version", version=f"aegis {__version__}")
    sub = p.add_subparsers(dest="command")

    ps = sub.add_parser("scope", help="validate and print a scope configuration")
    ps.add_argument("--scope", required=True, help="path to scope YAML/JSON")
    ps.set_defaults(func=_cmd_scope)

    pa = sub.add_parser("assess", help="run an assessment against a scope")
    pa.add_argument("--scope", required=True, help="path to scope YAML/JSON")
    pa.add_argument("--out", default="./out", help="output directory (default ./out)")
    pa.set_defaults(func=_cmd_assess)

    pd = sub.add_parser("demo", help="run against the bundled intentionally-vulnerable app")
    pd.add_argument("--out", default="./out", help="output directory (default ./out)")
    pd.add_argument("--port", type=int, default=8099, help="demo app port")
    pd.set_defaults(func=_cmd_demo)

    return p


def main(argv: Optional[list] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "command", None):
        parser.print_help()
        return 1
    return args.func(args)
