export function formatTraceJson(result, graphMeta) {
  return {
    term: result.term,
    projectDir: result.projectDir,
    variants: result.variants,
    counts: {
      catalog: result.fileCatalog.length,
      symbols: result.symbols.length,
      imports: result.imports.length,
      calls: result.calls.length,
      frameworks: result.frameworks.length,
      uiSurfaces: result.uiSurfaces.length,
      uiEdges: result.uiEdges.length,
      endpoints: result.endpoints.length,
      uiEndpointEdges: result.uiEndpointEdges.length,
      rpcSurfaces: result.rpcSurfaces?.length ?? 0,
      rpcFlows: result.rpcFlows?.length ?? 0,
      entrySurfaces: result.entrySurfaces?.length ?? 0,
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
    frameworks: result.frameworks,
    calls: result.calls,
    uiSurfaces: result.uiSurfaces,
    uiEdges: result.uiEdges,
    endpoints: result.endpoints,
    uiEndpointEdges: result.uiEndpointEdges,
    rpcSurfaces: result.rpcSurfaces,
    rpcFlows: result.rpcFlows,
    entrySurfaces: result.entrySurfaces,
    chains: result.chains,
    solo: result.solo,
  };
}

export function formatDefinitionsJson(result) {
  return {
    term: result.term,
    variants: result.variants,
    matchMode: result.matchMode,
    counts: result.counts,
    count: result.matches.length,
    matches: result.matches,
  };
}

export function formatReferencesJson(result) {
  return {
    term: result.term,
    variants: result.variants,
    matchMode: result.matchMode,
    counts: result.counts,
    matchedSymbols: result.matchedSymbols,
    count: result.references.length,
    references: result.references,
  };
}
