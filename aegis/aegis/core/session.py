"""SessionManager — turns scope accounts into authenticated identities."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from ..config.scope import Account, Scope
from .evidence import EvidenceLog
from .guard import ScopeGuard
from .http import HttpClient


@dataclass
class Identity:
    """An authenticated (or anonymous) identity plus its client."""
    name: str
    role: str
    client: HttpClient
    authenticated: bool


class SessionManager:
    def __init__(self, scope: Scope, guard: ScopeGuard, evidence: EvidenceLog):
        self.scope = scope
        self.guard = guard
        self.evidence = evidence
        self._identities: Dict[str, Identity] = {}

    def _new_client(self, identity: str) -> HttpClient:
        return HttpClient(
            self.guard,
            self.evidence,
            identity=identity,
            delay_seconds=self.scope.request_delay_seconds,
        )

    def anonymous(self) -> Identity:
        if "-anon-" not in self._identities:
            client = self._new_client("anon")
            self._identities["-anon-"] = Identity("anon", "guest", client, authenticated=False)
        return self._identities["-anon-"]

    def login_all(self) -> List[Identity]:
        """Authenticate every account in scope. Returns the successful identities."""
        out: List[Identity] = []
        for acct in self.scope.accounts:
            ident = self._login(acct)
            if ident is not None:
                out.append(ident)
        return out

    def _login(self, acct: Account) -> Optional[Identity]:
        client = self._new_client(acct.username)
        spec = acct.login
        authenticated = False

        if spec is None:
            # No login mechanism supplied — treat as an unauthenticated identity.
            authenticated = False
        elif spec.bearer_token:
            client.default_headers["Authorization"] = f"Bearer {spec.bearer_token}"
            authenticated = True
        elif spec.cookie:
            client.default_headers["Cookie"] = spec.cookie
            authenticated = True
        else:
            # Form login.
            fields = dict(spec.extra_fields)
            fields[spec.username_field] = acct.username
            fields[spec.password_field] = acct.password
            resp = client.request(spec.method, spec.url, data=fields)
            # Consider it authenticated if we got a session cookie or a redirect/200.
            got_cookie = len(client.cookie_jar) > 0 or bool(resp.get_set_cookies())
            authenticated = got_cookie or resp.status in (200, 302, 303)

        ident = Identity(acct.username, acct.role, client, authenticated)
        self._identities[acct.username] = ident
        return ident

    def identities(self) -> List[Identity]:
        return list(self._identities.values())
