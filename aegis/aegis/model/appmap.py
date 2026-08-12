"""Application map — the structural picture built during discovery."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Set


@dataclass
class Page:
    url: str
    status: int
    content_type: str = ""
    links: List[str] = field(default_factory=list)
    forms: List[dict] = field(default_factory=list)   # {action, method, fields[]}
    discovered_by: str = "-"                            # identity that saw it


@dataclass
class Endpoint:
    url_template: str            # e.g. /api/orders/{id}
    methods: Set[str] = field(default_factory=set)
    is_api: bool = False
    returns_json: bool = False
    sample_urls: List[str] = field(default_factory=list)


class ApplicationMap:
    def __init__(self) -> None:
        self.pages: Dict[str, Page] = {}
        self.endpoints: Dict[str, Endpoint] = {}
        self.out_of_scope: Set[str] = set()

    def add_page(self, page: Page) -> None:
        self.pages.setdefault(page.url, page)

    def add_endpoint(self, template: str, method: str, url: str,
                     is_api: bool = False, returns_json: bool = False) -> Endpoint:
        ep = self.endpoints.get(template)
        if ep is None:
            ep = Endpoint(url_template=template, is_api=is_api, returns_json=returns_json)
            self.endpoints[template] = ep
        ep.methods.add(method.upper())
        ep.is_api = ep.is_api or is_api
        ep.returns_json = ep.returns_json or returns_json
        if url not in ep.sample_urls:
            ep.sample_urls.append(url)
        return ep

    def note_out_of_scope(self, url: str) -> None:
        self.out_of_scope.add(url)

    def tree(self) -> str:
        lines = ["Application"]
        lines.append(f"├── Pages ({len(self.pages)})")
        for url in sorted(self.pages)[:20]:
            lines.append(f"│     {url}")
        lines.append(f"├── Endpoints ({len(self.endpoints)})")
        for tpl, ep in sorted(self.endpoints.items()):
            flag = "API/JSON" if ep.returns_json else ("API" if ep.is_api else "web")
            lines.append(f"│     [{'/'.join(sorted(ep.methods))}] {tpl}  ({flag})")
        if self.out_of_scope:
            lines.append(f"└── OUT_OF_SCOPE_ASSETS ({len(self.out_of_scope)})")
            for url in sorted(self.out_of_scope)[:20]:
                lines.append(f"      {url}")
        return "\n".join(lines)
