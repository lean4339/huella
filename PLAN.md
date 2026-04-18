# Huella Action Plan

## Goal

Build `huella` as a read-only technical reading engine for web app repositories and development environments.

Target behavior:

- reach the practical power of `tracer` and `tower-mcp/tools/trace.js`
- work on different architectures, not only Tower
- avoid hardcoded Tower behavior in the core
- support both developers and agents
- expose stable JSON outputs and human-readable CLI output

Non-goal:

- `huella` does not write code
- `huella` does not mutate repos

---

## Product Definition

`huella` should answer questions like:

- where is this term used
- what function defines this symbol
- who calls this function
- what would break if this changes
- what config or env connects these services
- which endpoint belongs to this page or flow
- which files matter for this feature

It should do this by combining:

- file reads
- structural extraction
- config and env discovery
- graph persistence
- reverse and impact queries

---

## Core Principles

1. Core stays generic.
   No Tower-specific assumptions inside the base engine.

2. Architecture knowledge lives in profiles.
   Tower becomes a profile, not the platform.

3. Every useful answer should come from structured data.
   Human output is formatting over a graph, not the source of truth.

4. Read-only by design.
   The safest and clearest version of the tool is a powerful reader.

5. JSON is a first-class output.
   Agent usage depends on stable machine-readable results.

---

## Repository Shape

Target structure:

```text
src/
  cli/
  core/
  extractors/
  scanners/
  graph/
  profiles/
  output/
  utils/
tests/
fixtures/
cache/
```

Initial mapping:

- `src/core/trace.js`
- `src/core/reverse.js`
- `src/core/impact.js`
- `src/scanners/filesystem.js`
- `src/scanners/config.js`
- `src/scanners/env.js`
- `src/extractors/symbols.js`
- `src/extractors/imports.js`
- `src/extractors/routes.js`
- `src/graph/store.js`
- `src/graph/schema.js`
- `src/output/human.js`
- `src/output/json.js`
- `src/cli/index.js`

---

## Execution Plan

### Phase 0: Stabilize the Base

Objective:
Turn the current prototype into a small but clean project skeleton.

Tasks:

1. Move `genericTracer.js` into `src/core/trace.js`.
2. Move `cli.js` into `src/cli/index.js`.
3. Update `package.json` bin entry.
4. Keep current behavior working through the CLI.

Done when:

- `node src/cli/index.js --help` works
- `huella <term> <dir>` still works

---

### Phase 1: Define the Graph

Objective:
Create the internal model that all commands will use.

Graph V1 entities:

- `files`
- `symbols`
- `imports`
- `calls`
- `routes`
- `configs`
- `envVars`
- `connections`
- `snapshots`

Suggested schema:

```json
{
  "version": 1,
  "builtAt": 0,
  "root": "",
  "files": {},
  "symbols": {},
  "edges": {
    "imports": [],
    "calls": [],
    "defines": [],
    "usesEnv": [],
    "connectsTo": [],
    "belongsToFlow": []
  },
  "termCache": {},
  "lastDelta": null,
  "profiles": {
    "detected": [],
    "applied": []
  }
}
```

Tasks:

1. Create `src/graph/schema.js`.
2. Create `src/graph/store.js`.
3. Add load/save helpers with local cache path.
4. Add empty graph factory.

Done when:

- graph can be created and persisted locally
- graph schema is documented in code

---

### Phase 2: File System Scanner

Objective:
Read repos consistently and cheaply.

Tasks:

1. Implement recursive scanner with ignore rules.
2. Classify files by type and probable layer.
3. Cap scan size for V1 to avoid exploding on huge repos.
4. Detect supported source extensions and config files.

Output per file:

- absolute path
- relative path
- extension
- type
- layer
- size

Done when:

- scanning a repo returns a deterministic file catalog

Tests:

- ignores `node_modules`, `.git`, `dist`, `build`
- includes source and config files
- preserves relative paths correctly

---

### Phase 3: Symbol Extraction

Objective:
Extract definitions and local context better than plain grep.

Tasks:

1. Port current function extraction logic.
2. Add file symbol listing.
3. Detect classes, named exports, default exports where possible.
4. Keep extraction heuristic-first for V1, but isolated.

Outputs:

- symbol name
- kind
- file
- start/end line
- exported or not
- snippet

Done when:

- we can answer "where is this defined"
- we can answer "what symbols exist in this file"

Tests:

- function declaration
- arrow function assigned to const
- class method
- exported const

V2 improvement:

- add ranking and prioritization for trace results so the most relevant files, symbols, and flows appear first instead of relying mostly on lexical order

---

### Phase 4: Import and Call References

Objective:
Get the first serious reverse navigation layer.

Tasks:

1. Extract import statements and reexports.
2. Resolve relative imports.
3. Detect probable function calls.
4. Build reverse lookups:
   - who imports this file
   - who references this symbol

Done when:

- `huella refs <symbol>` becomes possible
- `huella def <symbol>` becomes useful

Tests:

- local imports
- barrel exports
- same-symbol false positive control

---

### Phase 5: Config and Env Scanner

Objective:
Read runtime topology, not only code topology.

Files to support in V1:

- `.env*`
- `package.json`
- `docker-compose.yml`
- `docker-compose.yaml`
- `next.config.*`
- `vite.config.*`

Tasks:

1. Parse env files into key/value entries.
2. Parse scripts in `package.json`.
3. Parse compose services and environment blocks.
4. Classify variables:
   - url
   - db
   - cache
   - queue
   - auth
   - secret
   - unknown
5. Redact secret-like values by default in human output.

Done when:

- `huella config <term>` and `huella env <term>` are possible
- graph includes service and config relationships

Tests:

- reads `.env.local`
- finds URL-like vars
- redacts secret-like values in human output
- preserves raw values internally only when explicitly intended

---

### Phase 6: Connections and Service Mapping

Objective:
Infer how apps talk to each other.

Tasks:

1. Build URL and host matchers.
2. Link env vars to service names where possible.
3. Infer `frontend -> backend` and `service -> db` edges.
4. Track confidence levels for inferred relationships.

Connection examples:

- `web -> api`
- `admin -> booking-api`
- `api -> postgres`
- `worker -> redis`

Done when:

- `huella why <term>` can explain why a config value matters

Tests:

- host match inference
- local compose service match
- API base URL match

---

### Phase 7: Trace, Reverse, Impact

Objective:
Match the useful interaction model of Tower without copying Tower logic.

Commands:

- `huella trace <term> [dir]`
- `huella reverse <term> [dir]`
- `huella impact <term> [dir]`
- `huella config <term> [dir]`
- `huella env <term> [dir]`

Definitions:

- `trace`: collect all relevant signals around a term
- `reverse`: who uses this symbol/file/config
- `impact`: what depends on this symbol/file/config

Tasks:

1. Implement `trace` over graph-backed data.
2. Implement `reverse` using reverse indexes.
3. Implement `impact` over files, symbols, env vars, and connections.
4. Add human formatter and JSON formatter.

Done when:

- outputs are stable and testable
- commands do not require Tower assumptions

Tests:

- reverse on function
- reverse on file
- impact on config file
- impact on env var

---

### Phase 8: Snapshots and Diff

Objective:
Keep structural memory like `tower-mcp/tools/trace.js`.

Tasks:

1. Add baseline per term.
2. Add delta computation between runs.
3. Expose a `diff` view in `trace`.
4. Allow cache reset by term or full graph.

Done when:

- two runs on a changing repo produce a structural diff

Tests:

- added references
- removed references
- changed connections

---

### Phase 9: Profiles

Objective:
Reach Tower-level usefulness without hardcoding Tower in the core.

V1 profiles:

- `generic-web`
- `tower-rpc`

Profile responsibilities:

- architecture conventions
- route detection rules
- service discovery hints
- scoring and prioritization

Rules:

- core can run without any profile
- profiles only enrich extraction and ranking

Done when:

- Tower-specific outcomes can be reproduced by enabling the Tower profile
- the same engine still works in non-Tower repos

Tests:

- generic repo works without profile
- Tower repo improves with profile
- profile does not mutate graph schema

---

## V2 Roadmap

These items are intentionally out of V1 scope, but they are strong next steps based on how `tower-mcp` currently reuses `tracer` as a library instead of only as a command.

### Result Ranking

- add ranking and prioritization for trace results
- boost entrypoints, api barrels, handlers, routes, and exported symbols
- de-prioritize docs and broad text matches unless explicitly requested

### Reusable Core Primitives

Turn `huella` into a set of reusable reading primitives, not only a CLI:

- `scanFilesystem`
- `extractSymbols`
- `findDefinitions`
- `traceTerm`
- `extractImports`
- `findReferences`
- `inferConnections`
- `queryImpact`

### Reverse and Impact Queries

After imports and call edges exist:

- add `huella refs <symbol>`
- add `huella reverse <symbol>`
- add `huella impact <symbol|file|config>`

### Config and Runtime Topology

Build the next layer of runtime-aware reading:

- parse `.env*`, compose files, scripts, and framework configs
- infer service-to-service relationships
- infer app-to-endpoint relationships
- track config-driven edges in the graph

### Integrations Outside the Core

Keep these outside the generic core and build them as adapters:

- Jira ticket readers
- ticket term extraction
- QA route/context helpers
- project-specific architecture hints

This follows the lesson from `tower-mcp`: some behaviors are better modeled as integrations over a reusable reading engine than as core logic.

---

## Function-by-Function Delivery Order

This is the implementation order to follow.

1. `scanFilesystem`
2. `extractSymbols`
3. `extractImports`
4. `extractCalls`
5. `scanEnvFiles`
6. `scanPackageScripts`
7. `scanComposeFiles`
8. `inferConnections`
9. `buildGraph`
10. `traceTerm`
11. `reverseLookup`
12. `impactLookup`
13. `saveSnapshot`
14. `diffSnapshot`
15. `applyProfile`

Rule:

Do not jump ahead. Each function gets:

- implementation
- fixture coverage
- integration check

---

## Testing Strategy

Three layers of testing:

### Unit

Test each extractor/scanner in isolation.

Examples:

- symbol extraction
- env parsing
- compose parsing
- import resolution

### Fixture Integration

Small fake repos under `fixtures/`.

Need fixtures for:

- basic JS app
- frontend + backend app
- env-driven multi-service app
- Tower-like RPC structure

### Final Real-Repo Validation

Target:

- run on Tower repos
- compare practical answers against current `tracer` and `tower_trace`
- verify parity of usefulness, not code similarity

Validation questions:

- can it find what `.env/local` impacts
- can it identify FE -> BE paths
- can it answer reverse on a handler/function
- can it answer impact on a table, endpoint, file, or env var

---

## Definition of Success

`huella` succeeds when:

1. It can answer the same class of questions people ask `tracer` for in Tower.
2. It can answer similar questions in repos that are not Tower.
3. It does so without hardcoding Tower logic into the core.
4. It returns stable structured output usable by an agent.
5. It remains read-only and developer-safe.

---

## Immediate Next Step

Start with Phase 0 and Phase 1 only.

Concrete first changes:

1. move code into `src/`
2. define graph schema
3. add graph persistence
4. keep current CLI working

Only after that:

5. implement `scanFilesystem`
6. create first fixtures
7. add first tests
