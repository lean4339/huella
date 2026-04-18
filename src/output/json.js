export function formatTraceJson(result, graphMeta) {
  return {
    term: result.term,
    projectDir: result.projectDir,
    variants: result.variants,
    counts: {
      catalog: result.fileCatalog.length,
      symbols: result.symbols.length,
      files: result.hits.length,
      chains: result.chains.length,
      solo: result.solo.length,
    },
    graph: graphMeta ? {
      path: graphMeta.graphPath,
      delta: graphMeta.delta,
      previous: graphMeta.previous ? {
        timestamp: graphMeta.previous.timestamp,
        counts: graphMeta.previous.counts,
      } : null,
    } : null,
    chains: result.chains,
    solo: result.solo,
  };
}
