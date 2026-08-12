"""Orchestrator — runs the assessment pipeline.

DISCOVER → MODEL → TEST → VERIFY → DOCUMENT
"""
from __future__ import annotations

from typing import Callable, List, Optional

from ..config.scope import Scope
from ..core.evidence import EvidenceLog
from ..core.guard import ScopeGuard
from ..core.session import SessionManager
from ..discovery.crawler import Crawler
from ..modules.base import SecurityModule, default_modules
from .context import AssessmentContext, AssessmentResult

Logger = Callable[[str], None]


class Orchestrator:
    def __init__(self, scope: Scope, modules: Optional[List[SecurityModule]] = None,
                 log: Optional[Logger] = None):
        self.scope = scope
        self.guard = ScopeGuard(scope)
        self.evidence = EvidenceLog()
        self.sessions = SessionManager(scope, self.guard, self.evidence)
        self.modules = modules if modules is not None else default_modules()
        self.log = log or (lambda m: None)

    def run(self) -> AssessmentResult:
        ctx = AssessmentContext(
            scope=self.scope,
            guard=self.guard,
            evidence=self.evidence,
            sessions=self.sessions,
        )

        # -- PHASE 0: scope summary -----------------------------------------
        self.log(self.scope.summary())

        # -- PHASE: AUTHENTICATE --------------------------------------------
        self.log("\n[*] Authenticating scope accounts…")
        ctx.identities = self.sessions.login_all()
        self.sessions.anonymous()
        for ident in ctx.identities:
            self.log(f"    - {ident.name} (role={ident.role}) "
                     f"authenticated={ident.authenticated}")

        # -- PHASE: DISCOVER (per identity, so each sees its own objects) ----
        self.log("\n[*] Discovering application (per identity)…")
        crawler = Crawler(self.guard, ctx.appmap, ctx.resources,
                          max_pages=self.scope.max_pages, max_depth=self.scope.max_depth)
        crawl_identities = list(ctx.authenticated_identities()) or [self.sessions.anonymous()]
        for ident in crawl_identities:
            crawler.crawl(ident.client, self.scope.seeds)
        # anonymous view too (helps distinguish public vs private)
        crawler.crawl(self.sessions.anonymous().client, self.scope.seeds)
        self.log(f"    pages={len(ctx.appmap.pages)} endpoints={len(ctx.appmap.endpoints)} "
                 f"objects={len(ctx.resources.objects)} "
                 f"owned={len(ctx.resources.owned_objects())}")

        # -- PHASE: TEST (modules) ------------------------------------------
        self.log("\n[*] Running security modules…")
        for module in self.modules:
            try:
                if not module.applicable(ctx):
                    self.log(f"    - {module.name}: skipped (not applicable)")
                    continue
                before = len(ctx.findings)
                module.run(ctx)
                self.log(f"    - {module.name}: {len(ctx.findings) - before} finding(s)")
            except Exception as exc:  # noqa: BLE001 - a module must not abort the run
                self.log(f"    - {module.name}: ERROR {type(exc).__name__}: {exc}")

        # -- PHASE: DOCUMENT ------------------------------------------------
        ctx.findings.sort(key=lambda f: (-f.severity.rank, f.fid))
        self.log(f"\n[*] Assessment complete: {len(ctx.findings)} finding(s), "
                 f"{len(self.evidence)} exchange(s) recorded.")

        return AssessmentResult(
            scope=self.scope,
            appmap=ctx.appmap,
            resources=ctx.resources,
            findings=ctx.findings,
            evidence=self.evidence,
            identities=ctx.identities,
        )
