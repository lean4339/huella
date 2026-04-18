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
