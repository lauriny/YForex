"""HttpClient — a single authenticated identity's view of the target.

Built on the standard library only (``urllib``) so the core has no third-party
dependency. The client cannot be constructed without a ``ScopeGuard`` and calls
``guard.authorize()`` before every request; there is no bypass.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from http.cookiejar import CookieJar
from typing import Dict, Optional
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

from .evidence import EvidenceLog
from .guard import ScopeGuard

_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@dataclass
class Response:
    url: str
    status: int
    headers: Dict[str, str] = field(default_factory=dict)
    body: str = ""
    elapsed_ms: float = 0.0

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300

    def header(self, name: str) -> Optional[str]:
        low = name.lower()
        for k, v in self.headers.items():
            if k.lower() == low:
                return v
        return None

    def get_set_cookies(self) -> str:
        return self.header("set-cookie") or ""


class HttpClient:
    """One identity. Carries its own cookie jar so it behaves like one logged-in user."""

    def __init__(
        self,
        guard: ScopeGuard,
        evidence: EvidenceLog,
        identity: str = "-",
        delay_seconds: float = 0.0,
        default_headers: Optional[Dict[str, str]] = None,
        timeout: float = 15.0,
    ):
        if not isinstance(guard, ScopeGuard):
            raise TypeError("HttpClient requires a ScopeGuard — no unguarded requests")
        self.guard = guard
        self.evidence = evidence
        self.identity = identity
        self.delay_seconds = delay_seconds
        self.timeout = timeout
        self.default_headers = {"User-Agent": "Aegis/0.1 (+authorized-assessment)"}
        if default_headers:
            self.default_headers.update(default_headers)
        self.cookie_jar = CookieJar()
        self._opener = urlrequest.build_opener(
            urlrequest.HTTPCookieProcessor(self.cookie_jar),
            _NoRedirect(),  # we want to observe 3xx, not silently follow
        )

    # -- low level ----------------------------------------------------------
    def request(
        self,
        method: str,
        url: str,
        data: Optional[Dict[str, str]] = None,
        headers: Optional[Dict[str, str]] = None,
        raw_body: Optional[str] = None,
    ) -> Response:
        method = method.upper()
        mutating = method in _MUTATING_METHODS
        # THE GATE — refuses before anything leaves the process.
        self.guard.authorize(url, mutating=mutating)

        if self.delay_seconds:
            time.sleep(self.delay_seconds)

        body_bytes = None
        if raw_body is not None:
            body_bytes = raw_body.encode("utf-8")
        elif data is not None:
            body_bytes = urlencode(data).encode("utf-8")

        req_headers = dict(self.default_headers)
        if headers:
            req_headers.update(headers)
        if body_bytes is not None and "Content-Type" not in req_headers:
            req_headers["Content-Type"] = "application/x-www-form-urlencoded"

        req = urlrequest.Request(url, data=body_bytes, method=method, headers=req_headers)
        start = time.time()
        status: Optional[int] = None
        resp_headers: Dict[str, str] = {}
        body_text = ""
        error: Optional[str] = None
        try:
            with self._opener.open(req, timeout=self.timeout) as resp:
                status = resp.status
                resp_headers = {k: v for k, v in resp.headers.items()}
                body_text = resp.read().decode("utf-8", errors="replace")
        except HTTPError as exc:  # 4xx/5xx still carry a useful response
            status = exc.code
            resp_headers = {k: v for k, v in (exc.headers or {}).items()}
            try:
                body_text = exc.read().decode("utf-8", errors="replace")
            except Exception:
                body_text = ""
        except URLError as exc:
            error = f"URLError: {exc.reason}"
        except Exception as exc:  # noqa: BLE001 - record anything, keep the run alive
            error = f"{type(exc).__name__}: {exc}"
        elapsed = (time.time() - start) * 1000.0

        self.evidence.record(
            identity=self.identity,
            method=method,
            url=url,
            status=status,
            request_headers=req_headers,
            request_body=(raw_body if raw_body is not None else (urlencode(data) if data else None)),
            response_headers=resp_headers,
            response_excerpt=body_text[:1000],
            elapsed_ms=elapsed,
            error=error,
        )
        return Response(
            url=url,
            status=status if status is not None else 0,
            headers=resp_headers,
            body=body_text,
            elapsed_ms=elapsed,
        )

    # -- convenience --------------------------------------------------------
    def get(self, url: str, headers: Optional[Dict[str, str]] = None) -> Response:
        return self.request("GET", url, headers=headers)

    def post(self, url: str, data: Optional[Dict[str, str]] = None,
             headers: Optional[Dict[str, str]] = None, raw_body: Optional[str] = None) -> Response:
        return self.request("POST", url, data=data, headers=headers, raw_body=raw_body)


class _NoRedirect(urlrequest.HTTPRedirectHandler):
    """Do not auto-follow redirects — Aegis needs to see 3xx responses."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None
