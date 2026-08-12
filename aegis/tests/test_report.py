from aegis.config.scope import scope_from_dict
from aegis.core.evidence import EvidenceLog
from aegis.engine.context import AssessmentResult
from aegis.model.appmap import ApplicationMap
from aegis.model.finding import Confidence, Finding, Severity
from aegis.model.resource import ResourceModel
from aegis.reporting.report import render_json, render_markdown


def _result():
    scope = scope_from_dict({"target": {"ips": ["127.0.0.1"], "seeds": ["http://127.0.0.1/"]}})
    finding = Finding(
        fid="AC-01", title="IDOR", severity=Severity.HIGH, confidence=Confidence.CONFIRMED,
        category="broken-access-control", affected="http://127.0.0.1/api/orders/1",
        description="d", expected_behavior="e", actual_behavior="a", impact="i",
    )
    return AssessmentResult(
        scope=scope, appmap=ApplicationMap(), resources=ResourceModel(),
        findings=[finding], evidence=EvidenceLog(), identities=[],
    )


def test_markdown_contains_finding_and_sections():
    md = render_markdown(_result())
    assert "# Aegis Security Assessment Report" in md
    assert "AC-01" in md
    assert "Executive Summary" in md
    assert "broken-access-control" in md


def test_json_is_valid_and_has_findings():
    import json
    payload = json.loads(render_json(_result()))
    assert payload["findings"][0]["id"] == "AC-01"
    assert payload["scope_hosts"]
