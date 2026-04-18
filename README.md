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
