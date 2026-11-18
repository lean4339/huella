# Windows path compatibility variant

This branch adds a narrow Windows compatibility fix on top of main.

The filesystem and trace layer classifiers normalize backslashes before applying
the existing layer rules. Source parsers, output paths and inference rules are
unchanged. The order-flow demo now reports its two adjacent call chains on Windows.

Run the regression tests with Node.js 18 or newer:

```sh
npm test
```

The tests cover native filesystem paths and both LF and CRLF source files. They
were run on Windows. Additional classifier comparisons confirmed that forward-slash
paths retain their previous classification; a native Linux run is still pending.

No MCP adapter changes are included in this variant.
