"""Missing/weak security response headers."""
from __future__ import annotations

from typing import List
from urllib.parse import urlparse

from ..engine.context import AssessmentContext
from ..model.finding import Confidence, Finding, Severity
from .base import SecurityModule, register

_CHECKS = [
    ("content-security-policy", "Content-Security-Policy",
     "Mitigates XSS/data injection by restricting resource origins."),
    ("x-content-type-options", "X-Content-Type-Options",
     "Prevents MIME-type sniffing (should be 'nosniff')."),
    ("x-frame-options", "X-Frame-Options / frame-ancestors",
     "Prevents clickjacking via framing."),
    ("referrer-policy", "Referrer-Policy",
     "Limits referrer leakage of sensitive URLs."),
]


@register
class SecurityHeadersModule(SecurityModule):
    name = "security_headers"
    description = "Missing or weak HTTP security response headers"

    def run(self, ctx: AssessmentContext) -> List[Finding]:
        seeds = ctx.scope.seeds
        if not seeds:
            return []
        anon = ctx.sessions.anonymous()
        resp = anon.client.get(seeds[0])
        ev = ctx.evidence.all()[-1] if ctx.evidence.all() else None
        findings: List[Finding] = []

        for key, label, why in _CHECKS:
            if resp.header(key) is None:
                fid = ctx.next_fid("HDR")
                findings.append(ctx.add_finding(Finding(
                    fid=fid,
                    title=f"Missing security header: {label}",
                    severity=Severity.LOW,
                    confidence=Confidence.CONFIRMED,
                    category="security-misconfiguration",
                    affected=seeds[0],
                    description=f"The response does not set {label}. {why}",
                    expected_behavior=f"{label} is present with a safe value.",
                    actual_behavior=f"{label} header is absent.",
                    impact="Weakens defense-in-depth against XSS/clickjacking/info-leak.",
                    root_cause="Security headers not configured at the app/proxy layer.",
                    recommendation=f"Set {label} with an appropriate policy.",
                    evidence=[ev] if ev else [],
                    module=self.name,
                )))

        # HSTS only meaningful over https
        if urlparse(seeds[0]).scheme == "https" and resp.header("strict-transport-security") is None:
            fid = ctx.next_fid("HDR")
            findings.append(ctx.add_finding(Finding(
                fid=fid,
                title="Missing security header: Strict-Transport-Security",
                severity=Severity.LOW,
                confidence=Confidence.CONFIRMED,
                category="security-misconfiguration",
                affected=seeds[0],
                description="HSTS is not set on an HTTPS endpoint.",
                expected_behavior="Strict-Transport-Security is present.",
                actual_behavior="HSTS header absent.",
                impact="Allows SSL-stripping / downgrade on subsequent visits.",
                root_cause="HSTS not configured.",
                recommendation="Set Strict-Transport-Security with a suitable max-age.",
                evidence=[ev] if ev else [],
                module=self.name,
            )))
        return findings
