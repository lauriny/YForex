"""Security module interface and registry.

A module is one independent class of security check. It receives the shared
``AssessmentContext`` and returns findings. Modules may also read/extend the
resource model and app map (adaptive follow-up).
"""
from __future__ import annotations

from typing import Dict, List, Type

from ..engine.context import AssessmentContext
from ..model.finding import Finding


class SecurityModule:
    name: str = "base"
    description: str = ""

    def applicable(self, ctx: AssessmentContext) -> bool:
        """Whether this module should run given the scope/observations."""
        return True

    def run(self, ctx: AssessmentContext) -> List[Finding]:  # pragma: no cover - abstract
        raise NotImplementedError


MODULE_REGISTRY: Dict[str, Type[SecurityModule]] = {}


def register(cls: Type[SecurityModule]) -> Type[SecurityModule]:
    MODULE_REGISTRY[cls.name] = cls
    return cls


def default_modules() -> List[SecurityModule]:
    return [cls() for cls in MODULE_REGISTRY.values()]
