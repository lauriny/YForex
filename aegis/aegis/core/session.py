"""SessionManager — turns scope accounts into authenticated identities."""
from __future__ import annotations

from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin

from ..config.scope import Account, Scope
from .evidence import EvidenceLog
from .guard import ScopeGuard
from .http import HttpClient


class _LoginFormParser(HTMLParser):
    """Extract the login <form>'s action and its hidden fields (e.g. CSRF tokens).

    Prefers a form that contains a password field so we target the login form and
    not some unrelated form on the page (search, newsletter, …).
    """

    def __init__(self, password_field: str):
        super().__init__(convert_charrefs=True)
        self._password_field = password_field
        self._forms: List[dict] = []
        self._cur: Optional[dict] = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "form":
            self._cur = {"action": a.get("action", ""), "hidden": {}, "has_password": False}
        elif tag == "input" and self._cur is not None:
            itype = (a.get("type") or "text").lower()
            name = a.get("name")
            if not name:
                return
            if itype == "hidden":
                self._cur["hidden"][name] = a.get("value", "")
            if itype == "password" or name == self._password_field:
                self._cur["has_password"] = True

    def handle_endtag(self, tag):
        if tag == "form" and self._cur is not None:
            self._forms.append(self._cur)
            self._cur = None

    def best(self) -> Optional[dict]:
        for f in self._forms:
            if f["has_password"]:
                return f
        return self._forms[0] if self._forms else None


def parse_login_form(html: str, base_url: str, password_field: str) -> Tuple[Dict[str, str], Optional[str]]:
    """Return (hidden_fields, absolute_action_url) for the login form on a page."""
    parser = _LoginFormParser(password_field)
    try:
        parser.feed(html)
    except Exception:
        return {}, None
    form = parser.best()
    if not form:
        return {}, None
    action = form["action"]
    action_abs = urljoin(base_url, action) if action else None
    return form["hidden"], action_abs


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
            # Form login, CSRF-aware:
            #   1) GET the login page (non-mutating) and lift any hidden fields
            #      (e.g. Shopware's _csrf_token) and the form action.
            #   2) POST credentials + hidden fields. Authentication with authorized
            #      test credentials is not the "active mutating test" the
            #      active_testing flag guards, so we mark it mutating=False.
            fields = dict(spec.extra_fields)
            post_url = spec.url
            if spec.method == "POST":
                page = client.get(spec.url)
                hidden, action = parse_login_form(page.body, spec.url, spec.password_field)
                fields.update(hidden)
                if action:
                    post_url = action
            fields[spec.username_field] = acct.username
            fields[spec.password_field] = acct.password
            resp = client.request(spec.method, post_url, data=fields, mutating=False)
            # Consider it authenticated if we got a session cookie or a redirect/200.
            got_cookie = len(client.cookie_jar) > 0 or bool(resp.get_set_cookies())
            authenticated = got_cookie or resp.status in (200, 302, 303)

        ident = Identity(acct.username, acct.role, client, authenticated)
        self._identities[acct.username] = ident
        return ident

    def identities(self) -> List[Identity]:
        return list(self._identities.values())
