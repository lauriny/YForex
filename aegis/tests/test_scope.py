import pytest

from aegis.config.scope import ScopeError, scope_from_dict


def test_scope_authorizes_hosts_from_seeds_and_ips():
    scope = scope_from_dict({
        "target": {"ips": ["127.0.0.1"], "seeds": ["http://127.0.0.1:8099/"]},
    })
    hosts = scope.authorized_hosts()
    assert "127.0.0.1" in hosts
    assert "127.0.0.1:8099" in hosts


def test_scope_requires_at_least_one_host():
    with pytest.raises(ScopeError):
        scope_from_dict({"target": {}})


def test_seed_without_scheme_is_rejected():
    with pytest.raises(ScopeError):
        scope_from_dict({"target": {"seeds": ["127.0.0.1/no-scheme"]}})


def test_accounts_and_testing_flags_parse():
    scope = scope_from_dict({
        "target": {"ips": ["10.0.0.1"]},
        "accounts": [{"username": "a", "password": "p", "role": "admin",
                      "login": {"url": "http://10.0.0.1/login"}}],
        "testing": {"active_testing": True, "max_pages": 5},
    })
    assert scope.accounts[0].username == "a"
    assert scope.accounts[0].login.url == "http://10.0.0.1/login"
    assert scope.active_testing is True
    assert scope.max_pages == 5
