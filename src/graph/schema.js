export const GRAPH_VERSION = 1;

export function createEmptyGraph(root = "") {
  return {
    version: GRAPH_VERSION,
    builtAt: 0,
    root,
    files: {},
    symbols: {},
    edges: {
      imports: [],
      calls: [],
      defines: [],
      usesEnv: [],
      connectsTo: [],
      belongsToFlow: [],
      ui: [],
      uiToEndpoint: [],
      rpc: [],
    },
    termCache: {},
    lastDelta: null,
    profiles: {
      frameworks: [],
      uiSurfaces: [],
      rpcSurfaces: [],
      detected: [],
      applied: [],
    },
  };
}

export function createEmptyWorkspaceGraph(root = "") {
  return {
    version: GRAPH_VERSION,
    builtAt: 0,
    root,
    repos: [],
    connections: [],
  };
}
