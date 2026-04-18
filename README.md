# huella

`huella` is a small generic tracer for codebases with no project-specific config.

It is meant to be useful in two modes:

- local CLI for quick experiments
- future agent skill/tooling base

## Run

```bash
node cli.js <term> [dir]
```

Examples:

```bash
node cli.js booking /path/to/repo
node cli.js createUser .
```

## Current behavior

- searches source files for a term and common name variants
- classifies files into rough layers: entry, service, data
- extracts surrounding function bodies when possible
- builds probable call chains by matching function calls across layers

## Notes

This is intentionally heuristic.
It is a base for a future agent-facing skill, not a strict static analyzer.

## Agent tool

`huella` also exposes a thin JSON wrapper for agents:

```bash
npm run tool -- workspace /path/to/workspace
npm run tool -- graph /path/to/repo
npm run tool -- trace create_files /path/to/repo
npm run tool -- def create_files /path/to/repo
npm run tool -- refs create_files /path/to/repo
```

It returns a stable JSON envelope:

```json
{
  "ok": true,
  "operation": "trace",
  "input": {},
  "result": {}
}
```

Available operations:

- `workspace`: build the multi-repo workspace graph
- `graph`: build the full graph for one repo on demand
- `trace`: term trace with graph metadata
- `def`: definition lookup
- `refs`: reference lookup

## Framework ranking

Framework detection is ranked by:

- detector evidence score
- a configurable preference boost

The final order uses:

```text
rankScore = score + preferenceBoost
```

Default preference boosts:

- `nextjs: 20`
- `aspnet-core: 18`
- `spring-boot: 18`
- `fastapi: 17`
- `laravel: 16`
- `express: 15`
- `django: 14`
- `nestjs: 13`
- `flask: 11`
- `symfony: 10`
- `gin: 9`
- `fiber: 8`
- `echo: 7`
- `qwik: 6`

You can override the ranking with:

```bash
export HUELLA_FRAMEWORK_PREFERENCES='{"fastapi":25,"express":12,"qwik":15}'
```

This keeps the ranking configurable instead of hardcoding one permanent priority order.
