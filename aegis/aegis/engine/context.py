"""Shared assessment context passed to every module, plus the result object."""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Dict, List

from ..config.scope import Scope
from ..core.evidence import EvidenceLog
from ..core.guard import ScopeGuard
from ..core.session import Identity, SessionManager
from ..model.appmap import ApplicationMap
from ..model.finding import Finding
from ..model.resource import ResourceModel


@dataclass
class AssessmentContext:
    scope: Scope
    guard: ScopeGuard
    evidence: EvidenceLog
    sessions: SessionManager
    appmap: ApplicationMap = field(default_factory=ApplicationMap)
    resources: ResourceModel = field(default_factory=ResourceModel)
    identities: List[Identity] = field(default_factory=list)
    findings: List[Finding] = field(default_factory=list)
    _fid_counters: Dict[str, itertools.count] = field(default_factory=dict)

    def next_fid(self, prefix: str) -> str:
        counter = self._fid_counters.setdefault(prefix, itertools.count(1))
        return f"{prefix}-{next(counter):02d}"

    def authenticated_identities(self) -> List[Identity]:
        return [i for i in self.identities if i.authenticated]

    def add_finding(self, finding: Finding) -> Finding:
        self.findings.append(finding)
        return finding


@dataclass
class AssessmentResult:
    scope: Scope
    appmap: ApplicationMap
    resources: ResourceModel
    findings: List[Finding]
    evidence: EvidenceLog
    identities: List[Identity]

    def confirmed(self) -> List[Finding]:
        from ..model.finding import Confidence
        return [f for f in self.findings if f.confidence == Confidence.CONFIRMED]
