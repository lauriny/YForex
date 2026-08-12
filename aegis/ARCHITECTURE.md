# Aegis Architecture

## Design goals

1. **Authorization-first.** No request can be made outside the authorized scope.
   The `ScopeGuard` is a hard gate on the only HTTP path.
2. **Adaptive, not checklist-bound.** The engine models the application and derives
   test hypotheses from what it observes; modules can enqueue follow-up work.
3. **Evidence-backed findings.** Every finding carries the concrete request/response
   pairs that prove it, and can emit an automated regression test.
4. **Pluggable modules.** Security checks are independent units behind one interface.
5. **Dependency-light.** The core + demo run on the Python standard library so the
   MVP is reproducible anywhere.

## Layered structure

```
                 ┌─────────────────────────────────────────────┐
   CLI  ───────► │                  Engine                      │
 (aegis.cli)     │              (Orchestrator)                  │
                 │  DISCOVER → MODEL → TEST → VERIFY → DOCUMENT  │
                 └───────┬───────────────┬───────────────┬──────┘
                         │               │               │
             ┌───────────▼──┐   ┌────────▼───────┐  ┌────▼─────────┐
             │  Discovery   │   │    Modules     │  │  Reporting   │
             │ crawler, api │   │ access_control │  │ md/json/html │
             └───────┬──────┘   │ headers, cookie│  │ + regression │
                     │          └────────┬───────┘  └──────────────┘
                     │                   │
             ┌───────▼───────────────────▼──────┐
             │              Core                 │
             │  ScopeGuard · HttpClient · Session│
             │  Evidence recorder                │
             └───────────────┬──────────────────┘
                             │  (guard authorizes EVERY request)
                     ┌───────▼────────┐
                     │  Scope config  │
                     └────────────────┘
```

## Key components

### `config/scope.py` — Scope model
Typed, validated representation of the authorization boundary: domains, subdomains,
IPs, seed URLs, environment flags, test accounts, testing toggles, and time window.
Loaded from YAML or JSON.

### `core/guard.py` — ScopeGuard
The safety kernel. `authorize(url, mutating=)` decides whether a request may be
issued. Refuses out-of-scope hosts (`OutOfScopeError`), refuses active/mutating
requests when `active_testing` is off (`ActiveTestingDisabled`), and refuses active
testing on production unless explicitly allowed.

### `core/http.py` — HttpClient
Thin, per-identity HTTP client over `urllib`. Cannot be constructed without a guard;
calls `guard.authorize(...)` before every request and records an `Evidence` entry.
Carries a cookie jar so it acts as one authenticated identity.

### `core/session.py` — SessionManager
Turns scope `accounts` into authenticated `HttpClient`s via form login (or supplied
cookies/tokens). Also provides one unauthenticated client.

### `discovery/` — Application discovery
`crawler.py` does bounded, in-scope BFS collecting pages, links, forms, and
parameterised (numeric-id) URLs. `api.py` flags JSON/`/api` endpoints and object
references.

### `model/` — Domain model
`appmap.py` (application map), `resource.py` (resources + ownership per account),
`finding.py` (Finding, Severity, Confidence, Evidence references).

### `modules/` — Security modules
`base.SecurityModule` defines `run(context) -> list[Finding]`. Modules receive an
`AssessmentContext` (guard, clients per account, app map, resource model) and may
register follow-up hypotheses. Bundled: `access_control`, `security_headers`,
`session_cookies`.

### `engine/orchestrator.py` — Pipeline
Wires the phases together and produces an `AssessmentResult`.

### `reporting/report.py` + `regression/generator.py`
Render Markdown/JSON reports and emit a pytest regression suite that encodes the
"exploit before / denied after" expectation for each confirmed finding.

## The flagship check: cross-user access control

1. Log in as every provided account (≥2 needed).
2. For each identity, discover the object-reference URLs it legitimately reaches
   (its *owned* set) and fingerprint each object's response.
3. Build the ownership map: object → owning account(s).
4. Run the A→A / A→B / B→A / B→B matrix: request each owned object as every *other*
   identity.
5. A finding is raised when identity Y receives a success response that discloses
   identity X's object (status success + owner-specific marker present) — i.e. the
   server authorized an action the caller's identity should forbid.
6. Verify by re-requesting; capture both requests as evidence; emit a regression
   test asserting the cross-identity request must be denied.
