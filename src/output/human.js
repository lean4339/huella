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
  lines.push(`files: ${result.hits.length}`);
  lines.push(`chains: ${result.chains.length}`);
  lines.push(`solo: ${result.solo.length}`);

  if (graphMeta) {
    lines.push(`graph: ${graphMeta.graphPath}`);
    lines.push(`snapshot: chains ${graphMeta.delta.counts.chains >= 0 ? "+" : ""}${graphMeta.delta.counts.chains}, solo ${graphMeta.delta.counts.solo >= 0 ? "+" : ""}${graphMeta.delta.counts.solo}, files ${graphMeta.delta.counts.files >= 0 ? "+" : ""}${graphMeta.delta.counts.files}, catalog ${graphMeta.delta.scan.catalogFiles}`);
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
