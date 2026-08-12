"""ScopeGuard — the authorization kernel.

Every outbound request in Aegis passes through a ``ScopeGuard.authorize()`` call.
There is no code path that issues an HTTP request without first consulting the
guard (the ``HttpClient`` requires a guard to be constructed). This is what makes
Aegis safe to point at real targets: anything not explicitly authorized is refused
in-process, before a packet is sent.
"""
from __future__ import annotations

from typing import List
from urllib.parse import urlparse

from ..config.scope import Scope


class GuardError(PermissionError):
    """Base class for scope-enforcement refusals."""


class OutOfScopeError(GuardError):
    """The requested host is not in the authorized scope."""


class ActiveTestingDisabled(GuardError):
    """A mutating/active request was attempted while active_testing is off."""


class ProductionProtected(GuardError):
    """Active testing against a production target without explicit opt-in."""


def _host_of(url: str) -> str:
    return (urlparse(url).netloc or "").lower()


def _bare_host(netloc: str) -> str:
    """Strip a :port suffix, leaving the hostname/ip."""
    if netloc.startswith("[") and "]" in netloc:  # IPv6 literal
        return netloc[: netloc.index("]") + 1]
    return netloc.split(":", 1)[0]


class ScopeGuard:
    """Decides whether a request may be issued under the current scope."""

    def __init__(self, scope: Scope):
        self.scope = scope
        self._authorized = [h.lower() for h in scope.authorized_hosts()]
        # Precompute the bare-host forms for suffix (subdomain) matching.
        self._authorized_bare = {_bare_host(h) for h in self._authorized}

    # -- host authorization -------------------------------------------------
    def is_host_authorized(self, url: str) -> bool:
        netloc = _host_of(url)
        if not netloc:
            return False
        if netloc in self._authorized:  # exact host or host:port match
            return True
        bare = _bare_host(netloc)
        if bare in self._authorized_bare:  # host matches, any port
            return True
        if self.scope.include_subdomains:
            for allowed in self._authorized_bare:
                # allowed as a registrable domain authorizes its subdomains
                if bare == allowed or bare.endswith("." + allowed):
                    return True
        return False

    # -- the gate -----------------------------------------------------------
    def authorize(self, url: str, mutating: bool = False) -> None:
        """Raise if the request is not permitted. Return None if it is allowed."""
        if not self.is_host_authorized(url):
            raise OutOfScopeError(
                f"refusing request to out-of-scope host: {url!r} "
                f"(authorized: {', '.join(self._authorized) or 'none'})"
            )
        if mutating:
            if not self.scope.active_testing:
                raise ActiveTestingDisabled(
                    f"refusing mutating request to {url!r}: testing.active_testing is off"
                )
            if self.scope.production and not self.scope.allow_production_active_testing:
                raise ProductionProtected(
                    f"refusing active test against production target {url!r}: set "
                    "environment.allow_production_active_testing to override"
                )

    def out_of_scope_note(self, url: str) -> str:
        return f"OUT_OF_SCOPE_ASSET {url}"

    def authorized_hosts(self) -> List[str]:
        return list(self._authorized)
