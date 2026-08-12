"""API detection and object-reference extraction from responses."""
from __future__ import annotations

import json
import re
from typing import List

from ..core.http import Response
from ..model.resource import looks_like_id

_HREF = re.compile(r"""(?:href|src|action)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
_JSON_URLISH = re.compile(r"""["'](/[A-Za-z0-9_\-/]*\d[A-Za-z0-9_\-/]*)["']""")


def classify_response(resp: Response) -> dict:
    """Return {is_api, returns_json} for a response."""
    ctype = (resp.header("content-type") or "").lower()
    returns_json = "application/json" in ctype
    if not returns_json and resp.body[:1] in ("{", "["):
        try:
            json.loads(resp.body)
            returns_json = True
        except Exception:
            returns_json = False
    is_api = returns_json or "/api/" in resp.url
    return {"is_api": is_api, "returns_json": returns_json}


def extract_object_refs(base_url: str, resp: Response) -> List[str]:
    """Pull candidate object-reference URLs (paths containing an id) from a response.

    Works for both HTML (href/action) and JSON (URL-ish string values).
    """
    from urllib.parse import urljoin, urlparse

    found = set()
    for m in _HREF.finditer(resp.body):
        found.add(m.group(1))
    if resp.body[:1] in ("{", "["):
        for m in _JSON_URLISH.finditer(resp.body):
            found.add(m.group(1))
        # also mine id-valued fields to synthesize refs against known templates
    refs = []
    base_host = urlparse(base_url).netloc
    for raw in found:
        if raw.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        absu = urljoin(base_url, raw)
        p = urlparse(absu)
        if p.netloc != base_host:
            continue
        segs = [s for s in p.path.split("/") if s]
        if any(looks_like_id(s) for s in segs):
            refs.append(p._replace(query="", fragment="").geturl())
    return sorted(set(refs))
