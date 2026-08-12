"""Finding model — the unit of assessment output."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional

from ..core.evidence import Evidence


class Severity(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"
    INFO = "Informational"

    @property
    def rank(self) -> int:
        return {"Critical": 5, "High": 4, "Medium": 3, "Low": 2, "Informational": 1}[self.value]


class Confidence(str, Enum):
    CONFIRMED = "Confirmed"
    LIKELY = "Likely"
    POTENTIAL = "Potential"
    INFORMATIONAL = "Informational"
    FALSE_POSITIVE = "False Positive"


@dataclass
class Finding:
    fid: str
    title: str
    severity: Severity
    confidence: Confidence
    category: str                      # e.g. "broken-access-control"
    affected: str                      # affected asset / endpoint
    description: str
    expected_behavior: str
    actual_behavior: str
    impact: str
    root_cause: str = ""
    recommendation: str = ""
    reproduction: List[str] = field(default_factory=list)
    evidence: List[Evidence] = field(default_factory=list)
    module: str = ""
    regression_test: str = ""          # name of the emitted regression test, if any

    def as_dict(self) -> dict:
        return {
            "id": self.fid,
            "title": self.title,
            "severity": self.severity.value,
            "confidence": self.confidence.value,
            "category": self.category,
            "affected": self.affected,
            "description": self.description,
            "expected_behavior": self.expected_behavior,
            "actual_behavior": self.actual_behavior,
            "impact": self.impact,
            "root_cause": self.root_cause,
            "recommendation": self.recommendation,
            "reproduction": self.reproduction,
            "module": self.module,
            "regression_test": self.regression_test,
            "evidence": [e.as_dict() for e in self.evidence],
        }
