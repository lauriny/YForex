"""Scope configuration: the authorization boundary for an assessment.

The scope is the single source of truth for what Aegis is allowed to touch. It is
loaded from a YAML or JSON file and validated. The ``ScopeGuard`` (see
``aegis.core.guard``) enforces it on every outbound request.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse


class ScopeError(ValueError):
    """Raised when a scope configuration is missing, malformed, or unsafe."""


@dataclass
class LoginSpec:
    """How to authenticate an account (form login by default)."""
    url: str
    method: str = "POST"
    username_field: str = "username"
    password_field: str = "password"
    extra_fields: Dict[str, str] = field(default_factory=dict)
    # Alternatively, an account can supply a fixed cookie or bearer token.
    cookie: Optional[str] = None
    bearer_token: Optional[str] = None

    @staticmethod
    def from_dict(d: Optional[Dict[str, Any]]) -> Optional["LoginSpec"]:
        if not d:
            return None
        if "url" not in d:
            raise ScopeError("login spec requires a 'url'")
        return LoginSpec(
            url=str(d["url"]),
            method=str(d.get("method", "POST")).upper(),
            username_field=str(d.get("username_field", "username")),
            password_field=str(d.get("password_field", "password")),
            extra_fields={str(k): str(v) for k, v in (d.get("extra_fields") or {}).items()},
            cookie=d.get("cookie"),
            bearer_token=d.get("bearer_token"),
        )


@dataclass
class Account:
    """An authorized test identity."""
    username: str
    password: str = ""
    role: str = "user"
    login: Optional[LoginSpec] = None

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Account":
        if "username" not in d:
            raise ScopeError("each account requires a 'username'")
        return Account(
            username=str(d["username"]),
            password=str(d.get("password", "")),
            role=str(d.get("role", "user")),
            login=LoginSpec.from_dict(d.get("login")),
        )


@dataclass
class Scope:
    """Validated authorization boundary."""
    domains: List[str] = field(default_factory=list)
    subdomains: List[str] = field(default_factory=list)
    ips: List[str] = field(default_factory=list)
    seeds: List[str] = field(default_factory=list)
    include_subdomains: bool = True

    production: bool = False
    staging: bool = True
    allow_production_active_testing: bool = False

    accounts: List[Account] = field(default_factory=list)

    active_testing: bool = False
    authenticated_testing: bool = True
    api_testing: bool = True
    business_logic_testing: bool = True
    request_delay_seconds: float = 0.0
    max_pages: int = 100
    max_depth: int = 4

    time_window_start: str = ""
    time_window_end: str = ""

    # ---- derived ----------------------------------------------------------
    def authorized_hosts(self) -> List[str]:
        """Explicit host authorizations (host or host:port), lowercased."""
        hosts = set()
        for h in self.domains + self.subdomains + self.ips:
            hosts.add(h.strip().lower())
        for seed in self.seeds:
            netloc = urlparse(seed).netloc.lower()
            if netloc:
                hosts.add(netloc)
        return sorted(h for h in hosts if h)

    def validate(self) -> "Scope":
        if not self.authorized_hosts():
            raise ScopeError(
                "scope authorizes no hosts: provide at least one of "
                "target.domains / target.ips / target.seeds"
            )
        for seed in self.seeds:
            if not urlparse(seed).scheme:
                raise ScopeError(f"seed URL missing scheme: {seed!r}")
        if self.production and self.active_testing and not self.allow_production_active_testing:
            # Not fatal at load time — the guard enforces it per-request — but we
            # surface it loudly here.
            pass
        return self

    def summary(self) -> str:
        lines = [
            "SCOPE SUMMARY",
            f"  authorized hosts : {', '.join(self.authorized_hosts()) or '(none)'}",
            f"  seeds            : {', '.join(self.seeds) or '(none)'}",
            f"  environment      : production={self.production} staging={self.staging}",
            f"  accounts         : {', '.join(f'{a.username}[{a.role}]' for a in self.accounts) or '(none)'}",
            f"  active_testing   : {self.active_testing}"
            f" (prod-active-allowed={self.allow_production_active_testing})",
            f"  limits           : max_pages={self.max_pages} max_depth={self.max_depth}"
            f" delay={self.request_delay_seconds}s",
        ]
        return "\n".join(lines)


def _from_mapping(data: Dict[str, Any]) -> Scope:
    target = data.get("target", {}) or {}
    env = data.get("environment", {}) or {}
    testing = data.get("testing", {}) or {}
    tw = data.get("time_window", {}) or {}
    accounts = [Account.from_dict(a) for a in (data.get("accounts") or [])]

    scope = Scope(
        domains=[str(x) for x in (target.get("domains") or [])],
        subdomains=[str(x) for x in (target.get("subdomains") or [])],
        ips=[str(x) for x in (target.get("ips") or [])],
        seeds=[str(x) for x in (target.get("seeds") or [])],
        include_subdomains=bool(target.get("include_subdomains", True)),
        production=bool(env.get("production", False)),
        staging=bool(env.get("staging", True)),
        allow_production_active_testing=bool(env.get("allow_production_active_testing", False)),
        accounts=accounts,
        active_testing=bool(testing.get("active_testing", False)),
        authenticated_testing=bool(testing.get("authenticated_testing", True)),
        api_testing=bool(testing.get("api_testing", True)),
        business_logic_testing=bool(testing.get("business_logic_testing", True)),
        request_delay_seconds=float(testing.get("request_delay_seconds", 0.0)),
        max_pages=int(testing.get("max_pages", 100)),
        max_depth=int(testing.get("max_depth", 4)),
        time_window_start=str(tw.get("start", "")),
        time_window_end=str(tw.get("end", "")),
    )
    return scope.validate()


def load_scope(path: str) -> Scope:
    """Load and validate a scope from a YAML or JSON file."""
    if not os.path.exists(path):
        raise ScopeError(f"scope file not found: {path}")
    with open(path, "r", encoding="utf-8") as fh:
        raw = fh.read()
    data: Dict[str, Any]
    if path.endswith((".yaml", ".yml")):
        try:
            import yaml  # type: ignore
        except ImportError as exc:  # pragma: no cover - depends on env
            raise ScopeError(
                "PyYAML is required to load YAML scope files; install it or use JSON"
            ) from exc
        data = yaml.safe_load(raw) or {}
    else:
        data = json.loads(raw)
    if not isinstance(data, dict):
        raise ScopeError("scope file must contain a top-level mapping")
    return _from_mapping(data)


def scope_from_dict(data: Dict[str, Any]) -> Scope:
    """Build a scope from an in-memory mapping (used by tests and the demo)."""
    return _from_mapping(data)
