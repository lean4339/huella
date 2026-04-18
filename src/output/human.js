import path from "path";

function formatPath(filePath, projectDir) {
  return path.relative(projectDir, filePath) || filePath;
}

function pushBlock(lines, block) {
  if (!block) return;
  lines.push(`    function: ${block.funcName || "(unknown)"}`);
  lines.push(`    lines: ${block.startLine}-${block.endLine}`);
}

function pushHits(lines, hits, limit) {
  for (const hit of hits.slice(0, limit)) {
    lines.push(`    L${hit.lineNumber}: ${hit.line}`);
  }
}

export function formatTraceHuman(result, graphMeta) {
  const lines = [];
  lines.push(`term: ${result.term}`);
  lines.push(`dir: ${result.projectDir}`);
  lines.push(`variants: ${result.variants.join(", ")}`);
  lines.push(`catalog: ${result.fileCatalog.length}`);
  lines.push(`symbols: ${result.symbols.length}`);
  lines.push(`imports: ${result.imports.length}`);
  lines.push(`frameworks: ${result.frameworks.length}`);
  lines.push(`ui surfaces: ${result.uiSurfaces.length}`);
  lines.push(`files: ${result.hits.length}`);
  lines.push(`chains: ${result.chains.length}`);
  lines.push(`solo: ${result.solo.length}`);

  if (graphMeta) {
    lines.push(`graph: ${graphMeta.graphPath}`);
    lines.push(`snapshot: chains ${graphMeta.delta.counts.chains >= 0 ? "+" : ""}${graphMeta.delta.counts.chains}, solo ${graphMeta.delta.counts.solo >= 0 ? "+" : ""}${graphMeta.delta.counts.solo}, files ${graphMeta.delta.counts.files >= 0 ? "+" : ""}${graphMeta.delta.counts.files}, catalog ${graphMeta.delta.scan.catalogFiles}, symbols ${graphMeta.delta.scan.symbols}, imports ${graphMeta.delta.scan.imports}, frameworks ${graphMeta.delta.scan.frameworks}, ui ${graphMeta.delta.scan.uiSurfaces}`);
  }

  if (result.frameworks.length > 0) {
    lines.push("");
    lines.push(`Frameworks: ${result.frameworks.map((item) => `${item.id}(${item.score})`).join(", ")}`);
  }

  if (result.uiSurfaces.length > 0) {
    lines.push("");
    lines.push(`UI Surfaces: ${result.uiSurfaces.slice(0, 12).map((item) => `${item.type}:${formatPath(item.path, result.projectDir)}`).join(", ")}`);
  }

  if (result.chains.length > 0) {
    lines.push("");
    lines.push("Chains");
    for (const chain of result.chains) {
      lines.push("");
      for (const hit of chain) {
        lines.push(`  ${hit.label}  ${formatPath(hit.filePath, result.projectDir)}`);
        pushBlock(lines, hit.block);
        pushHits(lines, hit.lines, 3);
      }
    }
  }

  if (result.solo.length > 0) {
    lines.push("");
    lines.push("Solo Hits");
    for (const hit of result.solo.slice(0, 12)) {
      lines.push(`  ${hit.label}  ${formatPath(hit.filePath, result.projectDir)}`);
      pushBlock(lines, hit.block);
      pushHits(lines, hit.lines, 2);
    }
  }

  return lines.join("\n");
}

export function formatDefinitionsHuman(result, projectDir) {
  const lines = [];
  lines.push(`term: ${result.term}`);
  lines.push(`variants: ${result.variants.join(", ")}`);
  lines.push(`match mode: ${result.matchMode}`);
  lines.push(`exact matches: ${result.counts.exact}`);
  lines.push(`fuzzy matches: ${result.counts.fuzzy}`);
  lines.push(`definitions: ${result.matches.length}`);

  if (result.matches.length === 0) {
    lines.push("");
    lines.push("No definitions found.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("Definitions");
  for (const match of result.matches.slice(0, 20)) {
    lines.push(`  ${formatPath(match.filePath, projectDir)}`);
    lines.push(`    symbol: ${match.name}`);
    lines.push(`    kind: ${match.kind}${match.exported ? "  exported" : ""}`);
    lines.push(`    evidence: ${match.evidence}`);
    lines.push(`    lines: ${match.startLine}-${match.endLine}`);
    if (match.snippet) {
      const firstLine = match.snippet.split("\n")[0];
      lines.push(`    > ${firstLine}`);
    }
  }

  return lines.join("\n");
}

export function formatReferencesHuman(result, projectDir) {
  const lines = [];
  lines.push(`term: ${result.term}`);
  lines.push(`variants: ${result.variants.join(", ")}`);
  lines.push(`match mode: ${result.matchMode}`);
  lines.push(`exact matches: ${result.counts.exact}`);
  lines.push(`fuzzy matches: ${result.counts.fuzzy}`);
  lines.push(`matched symbols: ${result.matchedSymbols.length}`);
  lines.push(`references: ${result.references.length}`);

  if (result.references.length === 0) {
    lines.push("");
    lines.push("No references found.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("References");
  for (const ref of result.references.slice(0, 30)) {
    lines.push(`  ${formatPath(ref.fromFile, projectDir)}`);
    lines.push(`    type: ${ref.type}`);
    lines.push(`    import: ${ref.specifier}`);
    lines.push(`    evidence: ${ref.evidence.join(", ")}`);
    if (ref.resolvedPath) {
      lines.push(`    resolved: ${formatPath(ref.resolvedPath, projectDir)}`);
    }
    if (ref.lineNumber) {
      lines.push(`    line: ${ref.lineNumber}`);
    }
    if (ref.line) {
      lines.push(`    > ${ref.line}`);
    }
  }

  return lines.join("\n");
}
