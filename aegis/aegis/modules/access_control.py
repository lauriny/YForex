"""Cross-user access control testing (IDOR / BOLA / privilege escalation).

This is the flagship module. It answers the core question of the whole assessment:
*can identity Y perform an action on identity X's object that Y should not be able
to?*

Method:
  1. From discovery, each authenticated identity has an "owned set" of object-ref
     URLs it legitimately reached, each fingerprinted.
  2. For every object owned by a single identity X, request it as every other
     authenticated identity Y (and as anonymous, to rule out genuinely public
     objects).
  3. If Y receives X's object content, the server authorized an action Y's identity
     should forbid → a confirmed broken-access-control finding.
  4. Each finding is verified by re-requesting and carries both request/response
     pairs as evidence.
"""
from __future__ import annotations

import hashlib
from typing import List, Optional

from ..core.evidence import Evidence
from ..engine.context import AssessmentContext
from ..model.finding import Confidence, Finding, Severity
from .base import SecurityModule, register


def _fp(body: str) -> str:
    return hashlib.sha1(body.strip().encode("utf-8", "replace")).hexdigest()[:16]


def _last_evidence(ctx: AssessmentContext) -> Optional[Evidence]:
    items = ctx.evidence.all()
    return items[-1] if items else None


# roles that indicate elevated privilege (used to tag vertical escalation)
_PRIVILEGED = {"admin", "manager", "employee", "staff", "superuser"}


@register
class AccessControlModule(SecurityModule):
    name = "access_control"
    description = "Cross-user object access (IDOR/BOLA) and privilege escalation"

    def applicable(self, ctx: AssessmentContext) -> bool:
        return len(ctx.authenticated_identities()) >= 2 and bool(ctx.resources.owned_objects())

    def run(self, ctx: AssessmentContext) -> List[Finding]:
        findings: List[Finding] = []
        idents = {i.name: i for i in ctx.authenticated_identities()}
        anon = ctx.sessions.anonymous()

        for obj in ctx.resources.owned_objects():
            owners = obj.owners
            # Only meaningful when a single identity owns it (a private object).
            private_owners = [o for o in owners if o in idents]
            if len(private_owners) != 1:
                continue
            owner_name = private_owners[0]
            owner = idents[owner_name]

            # Is the object actually public? If anonymous gets the same content, skip.
            anon_resp = anon.client.get(obj.url)
            if anon_resp.ok and _fp(anon_resp.body) == obj.owner_fingerprint:
                continue  # genuinely public resource, not an access-control issue

            for other_name, other in idents.items():
                if other_name == owner_name:
                    continue
                resp = other.client.get(obj.url)
                attacker_ev = _last_evidence(ctx)
                if not resp.ok:
                    continue  # server correctly denied (403/404/401/redirect)

                served_fp = _fp(resp.body)
                identical = served_fp == obj.owner_fingerprint
                substantial = len(resp.body.strip()) >= 8

                if not (identical or substantial):
                    continue

                # Verify by re-requesting.
                verify = other.client.get(obj.url)
                reproducible = verify.ok and (_fp(verify.body) == served_fp)

                confidence = Confidence.CONFIRMED if (identical and reproducible) else Confidence.LIKELY
                vertical = owner.role.lower() in _PRIVILEGED and other.role.lower() not in _PRIVILEGED
                severity = Severity.HIGH
                category = "broken-access-control"
                kind = "IDOR / BOLA (horizontal)"
                if vertical:
                    severity = Severity.CRITICAL
                    kind = "Vertical privilege escalation"

                # Re-fetch owner's own view as evidence of what the object is.
                owner_resp = owner.client.get(obj.url)
                owner_ev = _last_evidence(ctx)

                evidence: List[Evidence] = []
                if owner_ev:
                    evidence.append(owner_ev)
                if attacker_ev:
                    evidence.append(attacker_ev)

                fid = ctx.next_fid("AC")
                finding = Finding(
                    fid=fid,
                    title=f"{kind}: '{other_name}' can access {owner_name}'s object {obj.template}",
                    severity=severity,
                    confidence=confidence,
                    category=category,
                    affected=obj.url,
                    description=(
                        f"The object at {obj.url} belongs to identity '{owner_name}' "
                        f"(role={owner.role}). Identity '{other_name}' (role={other.role}), "
                        f"which does not own it, received a successful response "
                        f"(HTTP {resp.status}) disclosing the object."
                        + (" The returned content is byte-identical to the owner's view."
                           if identical else
                           " The returned content is non-empty and differs from a denial.")
                    ),
                    expected_behavior=(
                        f"The server should authorize the request against the caller's "
                        f"identity and deny '{other_name}' access to '{owner_name}'s object "
                        f"(e.g. HTTP 403/404)."
                    ),
                    actual_behavior=(
                        f"Server returned HTTP {resp.status} to '{other_name}', exposing "
                        f"'{owner_name}'s object."
                    ),
                    impact=(
                        "Any authenticated user can read (and potentially act on) other "
                        "users' objects by changing the object identifier — a privacy breach "
                        "and, for state-changing variants, direct business manipulation."
                        + (" Because the owner is a privileged role, this also crosses a "
                           "privilege boundary." if vertical else "")
                    ),
                    root_cause=(
                        "The endpoint loads the object by identifier without verifying that "
                        "the object belongs to (or is permitted for) the authenticated caller. "
                        "Authorization is missing at the object level."
                    ),
                    recommendation=(
                        "Enforce object-level authorization server-side on every access: "
                        "authenticate the user, load the object, then verify ownership/role "
                        "before returning it (deny by default). Do not rely on unguessable "
                        "IDs or hidden UI as a control."
                    ),
                    reproduction=[
                        f"1. Authenticate as '{owner_name}' and note the owned object: {obj.url}",
                        f"2. Authenticate as a different user '{other_name}'.",
                        f"3. As '{other_name}', request GET {obj.url}",
                        f"4. Observe HTTP {resp.status} returning {owner_name}'s data "
                        f"instead of a denial.",
                    ],
                    evidence=evidence,
                    module=self.name,
                )
                findings.append(ctx.add_finding(finding))

                # ADAPT: a hit on one template implies siblings may be affected too.
                self._enqueue_hypotheses(ctx, obj.template, owner_name, other_name)

        return findings

    def _enqueue_hypotheses(self, ctx: AssessmentContext, template: str,
                            owner: str, attacker: str) -> None:
        """Adaptive note: related object templates are worth checking as well.

        We surface these as informational breadcrumbs in the report rather than
        firing new requests blindly; the resource model already tests every owned
        object it discovered, so this documents the systemic nature of the flaw.
        """
        related = sorted(t for t in ctx.resources.templates() if t != template)
        if not related:
            return
        note = ctx.next_fid("AC")
        ctx.add_finding(Finding(
            fid=note,
            title=f"Systemic check: object-level authz on related endpoints ({template})",
            severity=Severity.INFO,
            confidence=Confidence.INFORMATIONAL,
            category="broken-access-control",
            affected=template,
            description=(
                f"A broken-access-control hit on {template} suggests the same missing "
                f"object-level check may exist on related endpoints. Aegis tested all "
                f"discovered owned objects; endpoints not exercised by discovery "
                f"({', '.join(related)}) should be reviewed with the same method."
            ),
            expected_behavior="All object endpoints enforce object-level authorization.",
            actual_behavior="At least one endpoint does not; related endpoints unverified.",
            impact="Potential systemic broken access control across the object model.",
            root_cause="Authorization likely implemented per-endpoint rather than centrally.",
            recommendation="Introduce a central ownership/role check applied to all object access.",
            module=self.name,
        ))
