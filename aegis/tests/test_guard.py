import pytest

from aegis.config.scope import scope_from_dict
from aegis.core.evidence import EvidenceLog
from aegis.core.guard import (
    ActiveTestingDisabled,
    OutOfScopeError,
    ProductionProtected,
    ScopeGuard,
)
from aegis.core.http import HttpClient


def _guard(**overrides):
    data = {
        "target": {"domains": ["example.com"], "seeds": ["http://example.com/"]},
        "environment": {"production": False},
        "testing": {"active_testing": False},
    }
    data.update(overrides)
    return ScopeGuard(scope_from_dict(data))


def test_in_scope_host_allowed():
    _guard().authorize("http://example.com/orders")  # no raise


def test_subdomain_allowed_when_enabled():
    g = _guard()
    assert g.is_host_authorized("http://api.example.com/v1")


def test_out_of_scope_host_refused():
    with pytest.raises(OutOfScopeError):
        _guard().authorize("http://evil.test/")


def test_mutating_refused_when_active_testing_off():
    with pytest.raises(ActiveTestingDisabled):
        _guard().authorize("http://example.com/x", mutating=True)


def test_production_active_testing_refused_without_optin():
    g = _guard(environment={"production": True},
               testing={"active_testing": True})
    with pytest.raises(ProductionProtected):
        g.authorize("http://example.com/x", mutating=True)


def test_production_active_testing_allowed_with_optin():
    g = _guard(environment={"production": True, "allow_production_active_testing": True},
               testing={"active_testing": True})
    g.authorize("http://example.com/x", mutating=True)  # no raise


def test_httpclient_cannot_be_built_without_guard():
    with pytest.raises(TypeError):
        HttpClient(object(), EvidenceLog())  # type: ignore[arg-type]


def test_httpclient_refuses_out_of_scope_before_network():
    client = HttpClient(_guard(), EvidenceLog(), identity="t")
    with pytest.raises(OutOfScopeError):
        client.get("http://evil.test/")
