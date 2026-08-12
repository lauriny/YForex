"""Evidence capture: every request/response Aegis issues is recorded here so that
findings can point at concrete, reproducible proof.
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Dict, List, Optional

_counter = itertools.count(1)


@dataclass
class Evidence:
    """A single request/response exchange."""
    eid: int
    identity: str            # which authenticated identity issued it ("-" = anon)
    method: str
    url: str
    status: Optional[int]
    request_headers: Dict[str, str] = field(default_factory=dict)
    request_body: Optional[str] = None
    response_headers: Dict[str, str] = field(default_factory=dict)
    response_excerpt: str = ""
    elapsed_ms: float = 0.0
    error: Optional[str] = None

    def as_dict(self) -> dict:
        return {
            "eid": self.eid,
            "identity": self.identity,
            "method": self.method,
            "url": self.url,
            "status": self.status,
            "elapsed_ms": round(self.elapsed_ms, 1),
            "response_excerpt": self.response_excerpt[:500],
            "error": self.error,
        }

    def curl(self) -> str:
        parts = [f"curl -i -X {self.method}"]
        if self.identity and self.identity != "-":
            parts.append(f"# as identity={self.identity}")
        if self.request_body:
            parts.append(f"--data '{self.request_body}'")
        parts.append(f"'{self.url}'")
        return " ".join(parts)


class EvidenceLog:
    """Append-only log of all exchanges in an assessment."""

    def __init__(self) -> None:
        self._items: List[Evidence] = []

    def record(self, **kwargs) -> Evidence:
        ev = Evidence(eid=next(_counter), **kwargs)
        self._items.append(ev)
        return ev

    def all(self) -> List[Evidence]:
        return list(self._items)

    def __len__(self) -> int:
        return len(self._items)
