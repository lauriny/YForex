"""Report rendering: Markdown + JSON."""
from __future__ import annotations

import json
import os
from collections import Counter
from datetime import datetime, timezone
from typing import List

from ..engine.context import AssessmentResult
from ..model.finding import Confidence, Finding, Severity


def _severity_table(findings: List[Finding]) -> str:
    counts = Counter(f.severity.value for f in findings)
    order = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW, Severity.INFO]
    rows = [f"| {s.value} | {counts.get(s.value, 0)} |" for s in order]
    return "| Severity | Count |\n|----------|-------|\n" + "\n".join(rows)


def render_markdown(result: AssessmentResult) -> str:
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    scope = result.scope
    findings = result.findings
    confirmed = [f for f in findings if f.confidence == Confidence.CONFIRMED]

    lines: List[str] = []
    lines.append("# Aegis Security Assessment Report")
    lines.append("")
    lines.append(f"*Generated: {ts}*")
    lines.append("")

    # Executive summary
    lines.append("## Executive Summary")
    lines.append("")
    crit = sum(1 for f in findings if f.severity == Severity.CRITICAL)
    high = sum(1 for f in findings if f.severity == Severity.HIGH)
    lines.append(
        f"Aegis assessed the authorized scope and recorded **{len(findings)} finding(s)** "
        f"({crit} critical, {high} high) across {len(result.appmap.endpoints)} endpoint(s), "
        f"backed by {len(result.evidence)} recorded request/response exchange(s). "
        f"**{len(confirmed)}** finding(s) are confirmed and reproducible."
    )
    lines.append("")
    lines.append(_severity_table(findings))
    lines.append("")

    # Scope
    lines.append("## Scope")
    lines.append("")
    lines.append("```")
    lines.append(scope.summary())
    lines.append("```")
    lines.append("")

    # Methodology
    lines.append("## Methodology")
    lines.append("")
    lines.append(
        "Adaptive assessment loop: DISCOVER → UNDERSTAND → MODEL → HYPOTHESIZE → TEST → "
        "OBSERVE → ADAPT → VERIFY → DOCUMENT. Every request was authorized by the "
        "ScopeGuard against the configuration above; out-of-scope hosts were refused."
    )
    lines.append("")

    # Application map
    lines.append("## Application Map")
    lines.append("")
    lines.append("```")
    lines.append(result.appmap.tree())
    lines.append("```")
    lines.append("")

    # Identities / resource model
    lines.append("## Identities & Resource Model")
    lines.append("")
    for ident in result.identities:
        lines.append(f"- **{ident.name}** (role={ident.role}, authenticated={ident.authenticated})")
    lines.append("")
    owned = result.resources.owned_objects()
    if owned:
        lines.append("Discovered owned objects:")
        lines.append("")
        for obj in owned:
            lines.append(f"- `{obj.url}` — owner(s): {', '.join(sorted(obj.owners)) or '?'}")
        lines.append("")

    # Findings
    lines.append("## Findings")
    lines.append("")
    if not findings:
        lines.append("_No findings._")
    for f in findings:
        lines.append(f"### {f.fid} — {f.title}")
        lines.append("")
        lines.append(f"- **Severity:** {f.severity.value}")
        lines.append(f"- **Confidence:** {f.confidence.value}")
        lines.append(f"- **Category:** {f.category}")
        lines.append(f"- **Affected:** `{f.affected}`")
        lines.append(f"- **Module:** {f.module}")
        if f.regression_test:
            lines.append(f"- **Regression test:** `{f.regression_test}`")
        lines.append("")
        lines.append(f"**Description.** {f.description}")
        lines.append("")
        lines.append(f"**Expected.** {f.expected_behavior}")
        lines.append("")
        lines.append(f"**Actual.** {f.actual_behavior}")
        lines.append("")
        lines.append(f"**Impact.** {f.impact}")
        lines.append("")
        if f.root_cause:
            lines.append(f"**Root cause.** {f.root_cause}")
            lines.append("")
        if f.recommendation:
            lines.append(f"**Recommendation.** {f.recommendation}")
            lines.append("")
        if f.reproduction:
            lines.append("**Reproduction.**")
            lines.append("")
            for step in f.reproduction:
                lines.append(f"    {step}")
            lines.append("")
        if f.evidence:
            lines.append("**Evidence.**")
            lines.append("")
            for ev in f.evidence:
                lines.append(f"- `[{ev.identity}] {ev.method} {ev.url}` → "
                             f"HTTP {ev.status} ({round(ev.elapsed_ms)}ms)")
            lines.append("")
        lines.append("---")
        lines.append("")

    lines.append("## Conclusion")
    lines.append("")
    if crit or high:
        lines.append(
            "The target has serious access-control or configuration weaknesses that should "
            "be remediated before production exposure. Prioritise the critical/high findings, "
            "then re-run Aegis with the generated regression tests to confirm the fixes."
        )
    else:
        lines.append("No critical or high-severity issues were confirmed in this run.")
    lines.append("")
    return "\n".join(lines)


def render_json(result: AssessmentResult) -> str:
    payload = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "scope_hosts": result.scope.authorized_hosts(),
        "identities": [
            {"name": i.name, "role": i.role, "authenticated": i.authenticated}
            for i in result.identities
        ],
        "endpoints": sorted(result.appmap.endpoints.keys()),
        "owned_objects": [
            {"url": o.url, "template": o.template, "owners": sorted(o.owners)}
            for o in result.resources.owned_objects()
        ],
        "findings": [f.as_dict() for f in result.findings],
        "exchanges_recorded": len(result.evidence),
    }
    return json.dumps(payload, indent=2)


def write_reports(result: AssessmentResult, out_dir: str) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    md_path = os.path.join(out_dir, "report.md")
    json_path = os.path.join(out_dir, "report.json")
    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write(render_markdown(result))
    with open(json_path, "w", encoding="utf-8") as fh:
        fh.write(render_json(result))
    return {"markdown": md_path, "json": json_path}
