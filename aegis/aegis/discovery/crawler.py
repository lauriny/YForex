"""Bounded, in-scope application crawler.

Performs a breadth-first walk starting from the scope seeds, staying strictly
inside the authorized scope (the guard would refuse otherwise, but the crawler also
proactively skips and records out-of-scope links). It collects pages, links, forms,
and object-reference URLs, feeding the application map and resource model.
"""
from __future__ import annotations

from collections import deque
from html.parser import HTMLParser
from typing import List, Optional, Tuple
from urllib.parse import urljoin, urlparse

from ..core.guard import ScopeGuard
from ..core.http import HttpClient, Response
from ..model.appmap import ApplicationMap, Page
from ..model.resource import ResourceModel, templatize
from .api import classify_response, extract_object_refs


class _LinkFormParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: List[str] = []
        self.forms: List[dict] = []
        self._cur_form: Optional[dict] = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "a" and a.get("href"):
            self.links.append(a["href"])
        elif tag == "form":
            self._cur_form = {"action": a.get("action", ""),
                              "method": (a.get("method", "GET") or "GET").upper(),
                              "fields": []}
        elif tag in ("input", "select", "textarea") and self._cur_form is not None:
            name = a.get("name")
            if name:
                self._cur_form["fields"].append(name)

    def handle_endtag(self, tag):
        if tag == "form" and self._cur_form is not None:
            self.forms.append(self._cur_form)
            self._cur_form = None


class Crawler:
    def __init__(self, guard: ScopeGuard, appmap: ApplicationMap, resources: ResourceModel,
                 max_pages: int = 100, max_depth: int = 4):
        self.guard = guard
        self.appmap = appmap
        self.resources = resources
        self.max_pages = max_pages
        self.max_depth = max_depth

    def crawl(self, client: HttpClient, seeds: List[str]) -> None:
        seen = set()
        queue: deque[Tuple[str, int]] = deque((s, 0) for s in seeds)
        while queue and len(seen) < self.max_pages:
            url, depth = queue.popleft()
            url = url.split("#", 1)[0]
            if url in seen or depth > self.max_depth:
                continue
            if not self.guard.is_host_authorized(url):
                self.appmap.note_out_of_scope(url)
                continue
            seen.add(url)
            resp = client.get(url)
            self._ingest(client.identity, url, resp)

            # object refs → resource model
            for ref in extract_object_refs(url, resp):
                if self.guard.is_host_authorized(ref) and ref not in seen:
                    queue.append((ref, depth + 1))

            # follow same-host links
            for link in self._links(url, resp):
                if link in seen:
                    continue
                if self.guard.is_host_authorized(link):
                    queue.append((link, depth + 1))
                else:
                    self.appmap.note_out_of_scope(link)

    def _ingest(self, identity: str, url: str, resp: Response) -> None:
        cls = classify_response(resp)
        ctype = resp.header("content-type") or ""
        parser = _LinkFormParser()
        if "html" in ctype.lower() or resp.body[:15].lower().lstrip().startswith("<!doctype") \
                or "<html" in resp.body[:200].lower():
            try:
                parser.feed(resp.body)
            except Exception:
                pass
        page = Page(url=url, status=resp.status, content_type=ctype,
                    links=parser.links, forms=parser.forms, discovered_by=identity)
        self.appmap.add_page(page)

        tpl = templatize(url)
        self.appmap.add_endpoint(tpl, "GET", url,
                                 is_api=cls["is_api"], returns_json=cls["returns_json"])
        # If this URL addresses an object, record ownership for this identity.
        if tpl != url and "{id}" in tpl and resp.ok:
            fp = _fingerprint(resp.body)
            self.resources.observe(url, identity, fingerprint=fp, content_type=ctype)

    def _links(self, base: str, resp: Response) -> List[str]:
        parser = _LinkFormParser()
        try:
            parser.feed(resp.body)
        except Exception:
            return []
        out = []
        base_host = urlparse(base).netloc
        for href in parser.links:
            if href.startswith(("mailto:", "tel:", "javascript:")):
                continue
            absu = urljoin(base, href).split("#", 1)[0]
            out.append(absu)
        return out


def _fingerprint(body: str) -> str:
    """Cheap content fingerprint used to tell whose object a response represents."""
    import hashlib
    return hashlib.sha1(body.strip().encode("utf-8", "replace")).hexdigest()[:16]
