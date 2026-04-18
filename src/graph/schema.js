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
    },
    termCache: {},
    lastDelta: null,
    profiles: {
      detected: [],
      applied: [],
    },
  };
}
