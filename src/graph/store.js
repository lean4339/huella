import fs from "fs";
import path from "path";
import os from "os";
import { createEmptyGraph, GRAPH_VERSION } from "./schema.js";

const CACHE_DIR = path.join(os.homedir(), ".cache", "huella");

export function getGraphPath(root = "") {
  const suffix = root
    ? root.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "")
    : "default";
  return path.join(CACHE_DIR, `${suffix || "default"}.graph.json`);
}

export function loadGraph(root = "") {
  const graphPath = getGraphPath(root);
  try {
    const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
    if (graph.version !== GRAPH_VERSION) {
      return createEmptyGraph(root);
    }
    return graph;
  } catch {
    return createEmptyGraph(root);
  }
}

export function saveGraph(graph) {
  const graphPath = getGraphPath(graph.root);
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");
  return graphPath;
}

export function updateTermSnapshot(graph, traceResult) {
  const prev = graph.termCache[traceResult.term] || null;
  const nextCounts = {
    chains: traceResult.chains.length,
    solo: traceResult.solo.length,
    files: traceResult.hits.length,
  };

  const prevCounts = prev?.counts || { chains: 0, solo: 0, files: 0 };

  graph.root = traceResult.projectDir;
  graph.builtAt = Date.now();
  graph.files = Object.fromEntries(
    (traceResult.fileCatalog || []).map((file) => [
      file.relPath,
      {
        path: file.path,
        ext: file.ext,
        type: file.type,
        layer: file.layer,
        size: file.size,
      },
    ])
  );
  graph.symbols = Object.fromEntries(
    (traceResult.symbols || []).map((symbol) => [
      `${path.relative(traceResult.projectDir, symbol.filePath)}::${symbol.name}::${symbol.startLine}`,
      {
        name: symbol.name,
        kind: symbol.kind,
        filePath: symbol.filePath,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        exported: symbol.exported,
        snippet: symbol.snippet,
      },
    ])
  );
  graph.lastDelta = {
    term: traceResult.term,
    counts: {
      chains: nextCounts.chains - prevCounts.chains,
      solo: nextCounts.solo - prevCounts.solo,
      files: nextCounts.files - prevCounts.files,
    },
    scan: {
      catalogFiles: (traceResult.fileCatalog || []).length,
      symbols: (traceResult.symbols || []).length,
    },
    at: graph.builtAt,
  };

  graph.termCache[traceResult.term] = {
    timestamp: graph.builtAt,
    counts: nextCounts,
    summary: {
      term: traceResult.term,
      projectDir: traceResult.projectDir,
      variants: traceResult.variants,
      catalogFiles: (traceResult.fileCatalog || []).length,
      symbols: (traceResult.symbols || []).length,
    },
  };

  return { graph, previous: prev, delta: graph.lastDelta };
}
