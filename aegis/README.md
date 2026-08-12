# Aegis — Scoped Web Application Security Assessment Agent

Aegis is a **generic, authorization-first** web-application security assessment
framework. It does not run a blind vulnerability scanner. Instead it follows an
adaptive assessment loop —

```
DISCOVER → UNDERSTAND → MODEL → HYPOTHESIZE → TEST → OBSERVE → ADAPT → VERIFY → DOCUMENT
```

— and specialises in the class of bugs generic scanners miss: **broken access
control, cross-user object access (IDOR/BOLA), privilege escalation, and business
logic flaws**.

## Safety model (read this first)

Aegis is built to be used **only against explicitly authorized targets**. Its most
important component is the `ScopeGuard`: **every** outbound request passes through
it, and any request to a host that is not in the scope configuration is refused
before it leaves the process. There is no bypass path — the HTTP client cannot be
constructed without a guard.

Additional safety rails:

- **Passive by default.** Mutating/active requests are only issued when
  `testing.active_testing: true` is set in scope.
- **Production is protected.** Active testing against a target flagged
  `environment.production: true` is refused unless explicitly opted in with
  `environment.allow_production_active_testing: true`.
- **Newly discovered hosts are not auto-authorized.** If discovery finds a link to
  a host outside scope, it is recorded as `OUT_OF_SCOPE_ASSET` and never requested.

## Install / run (zero required third-party deps for the core)

The core and the bundled demo target run on the Python standard library only.

```bash
cd aegis
python -m aegis --help
```

## Quick start against the bundled *intentionally vulnerable* demo app

The demo app is a self-contained, deliberately-vulnerable target used purely for
developing and testing Aegis locally. It is **not** a real system.

```bash
# 1. start the demo target (in one shell)
python -m demo.vulnerable_app            # serves on http://127.0.0.1:8099

# 2. run an assessment (in another shell)
python -m aegis assess --scope examples/scope.demo.yaml --out ./out

# 3. read the report
cat out/report.md
cat out/regression/test_regressions.py
```

Or do it all in one process (starts the demo, assesses it, tears it down):

```bash
python -m aegis demo --out ./out
```

## Scope configuration

See `examples/scope.demo.yaml`. The schema is documented in
`aegis/config/scope.py`.

## Architecture

See `ARCHITECTURE.md`.

## Modules

| Module | Class of finding |
|--------|------------------|
| `access_control` | Cross-user object access (IDOR / BOLA), horizontal & vertical privilege escalation |
| `security_headers` | Missing/weak security response headers |
| `session_cookies` | Insecure cookie flags (HttpOnly / Secure / SameSite) |

Modules are pluggable — implement `SecurityModule` and register it.
