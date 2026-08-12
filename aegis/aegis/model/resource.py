"""Resource model — objects, their owners, and cross-identity relationships.

An ``ObjectRef`` is a concrete, addressable object (a URL that contains an object
identifier, e.g. ``/api/orders/1``). During discovery each authenticated identity
records the object refs it can legitimately reach; the model then knows which
identity *owns* (or at least is authorized for) each object, enabling the
cross-user access-control matrix.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Set
from urllib.parse import urlparse

# Path segments that look like object identifiers.
_NUMERIC = re.compile(r"^\d+$")
_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def looks_like_id(segment: str) -> bool:
    return bool(_NUMERIC.match(segment) or _UUID.match(segment) or
                (len(segment) >= 12 and re.match(r"^[0-9a-fA-F]+$", segment)))


def templatize(url: str) -> str:
    """Turn /api/orders/123 into /api/orders/{id} for grouping."""
    parsed = urlparse(url)
    parts = []
    for seg in parsed.path.split("/"):
        parts.append("{id}" if seg and looks_like_id(seg) else seg)
    return parsed._replace(path="/".join(parts), query="", fragment="").geturl()


@dataclass
class ObjectRef:
    """A concrete object addressable by URL, e.g. /api/orders/1."""
    url: str
    template: str
    object_id: str
    # identities that could successfully read this object during discovery
    owners: Set[str] = field(default_factory=set)
    # a stable fingerprint of the owning identity's response body (for comparison)
    owner_fingerprint: str = ""
    content_type: str = ""

    def has_id(self) -> bool:
        return bool(self.object_id)


class ResourceModel:
    def __init__(self) -> None:
        self.objects: Dict[str, ObjectRef] = {}   # keyed by url

    def observe(self, url: str, identity: str, fingerprint: str = "",
                content_type: str = "") -> ObjectRef:
        """Record that ``identity`` legitimately reached the object at ``url``."""
        tpl = templatize(url)
        parsed = urlparse(url)
        oid = ""
        for seg in reversed(parsed.path.split("/")):
            if seg and looks_like_id(seg):
                oid = seg
                break
        ref = self.objects.get(url)
        if ref is None:
            ref = ObjectRef(url=url, template=tpl, object_id=oid,
                            owner_fingerprint=fingerprint, content_type=content_type)
            self.objects[url] = ref
        ref.owners.add(identity)
        if fingerprint and not ref.owner_fingerprint:
            ref.owner_fingerprint = fingerprint
        return ref

    def owned_objects(self) -> List[ObjectRef]:
        """Objects that have at least one identifiable owner and an id."""
        return [o for o in self.objects.values() if o.has_id() and o.owners]

    def templates(self) -> Set[str]:
        return {o.template for o in self.objects.values()}
