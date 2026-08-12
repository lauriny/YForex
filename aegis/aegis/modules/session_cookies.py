"""Insecure session cookie flags (HttpOnly / Secure / SameSite)."""
from __future__ import annotations

from typing import List
from urllib.parse import urlparse

from ..engine.context import AssessmentContext
from ..model.finding import Confidence, Finding, Severity
from .base import SecurityModule, register


def _iter_set_cookies(ctx: AssessmentContext):
    """Yield (evidence, set_cookie_value) for every Set-Cookie seen."""
    for ev in ctx.evidence.all():
        for k, v in ev.response_headers.items():
            if k.lower() == "set-cookie":
                yield ev, v


@register
class SessionCookieModule(SecurityModule):
    name = "session_cookies"
    description = "Insecure cookie attributes on session cookies"

    def run(self, ctx: AssessmentContext) -> List[Finding]:
        findings: List[Finding] = []
        seen_names = set()
        for ev, raw in _iter_set_cookies(ctx):
            name = raw.split("=", 1)[0].strip()
            low = raw.lower()
            missing = []
            if "httponly" not in low:
                missing.append("HttpOnly")
            if "samesite" not in low:
                missing.append("SameSite")
            is_https = urlparse(ev.url).scheme == "https"
            if is_https and "secure" not in low:
                missing.append("Secure")
            if not missing:
                continue
            key = (name, tuple(missing))
            if key in seen_names:
                continue
            seen_names.add(key)

            fid = ctx.next_fid("COOKIE")
            findings.append(ctx.add_finding(Finding(
                fid=fid,
                title=f"Session cookie '{name}' missing attributes: {', '.join(missing)}",
                severity=Severity.MEDIUM if "HttpOnly" in missing else Severity.LOW,
                confidence=Confidence.CONFIRMED,
                category="session-management",
                affected=ev.url,
                description=(
                    f"The cookie '{name}' set at {ev.url} is missing: {', '.join(missing)}."
                ),
                expected_behavior="Session cookies set HttpOnly, SameSite, and (on HTTPS) Secure.",
                actual_behavior=f"Cookie set as: {raw}",
                impact=(
                    "Missing HttpOnly exposes the cookie to theft via XSS; missing SameSite "
                    "enables CSRF; missing Secure allows leakage over plaintext."
                ),
                root_cause="Cookie issued without hardened attributes.",
                recommendation="Set HttpOnly; SameSite=Lax or Strict; Secure on HTTPS.",
                evidence=[ev],
                module=self.name,
            )))
        return findings
