import fs from "fs";
import path from "path";
import os from "os";
import { createEmptyGraph, createEmptyWorkspaceGraph, GRAPH_VERSION } from "./schema.js";

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

export function loadWorkspaceGraph(root = "") {
  const graphPath = getGraphPath(`${root}__workspace`);
  try {
    const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8"));
    if (graph.version !== GRAPH_VERSION) {
      return createEmptyWorkspaceGraph(root);
    }
    return graph;
  } catch {
    return createEmptyWorkspaceGraph(root);
  }
}

export function saveGraph(graph) {
  const graphPath = getGraphPath(graph.root);
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");
  return graphPath;
}

export function saveWorkspaceGraph(graph) {
  const graphPath = getGraphPath(`${graph.root}__workspace`);
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
        language: symbol.language,
        filePath: symbol.filePath,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        exported: symbol.exported,
        snippet: symbol.snippet,
      },
    ])
  );
  graph.edges.imports = (traceResult.imports || []).map((item) => ({
    type: item.type,
    language: item.language,
    fromFile: item.fromFile,
    specifier: item.specifier,
    resolvedPath: item.resolvedPath,
  }));
  graph.edges.calls = (traceResult.calls || []).map((item) => ({
    type: item.type,
    language: item.language,
    fromFile: item.fromFile,
    callerName: item.callerName,
    calleeName: item.calleeName,
  }));
  graph.edges.ui = (traceResult.uiEdges || []).map((item) => ({
    type: item.type,
    from: item.from,
    to: item.to,
    evidence: item.evidence,
  }));
  graph.edges.uiToEndpoint = (traceResult.uiEndpointEdges || []).map((item) => ({
    type: item.type,
    from: item.from,
    to: item.to,
    evidence: item.evidence,
  }));
  graph.edges.rpc = (traceResult.rpcSurfaces || []).map((item) => ({
    type: item.type,
    key: item.key,
    mod: item.mod,
    fun: item.fun,
    apiFile: item.apiFile,
    handlerFile: item.handlerFile,
    handlerName: item.handlerName,
  }));
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
      imports: (traceResult.imports || []).length,
      calls: (traceResult.calls || []).length,
      frameworks: (traceResult.frameworks || []).length,
      uiSurfaces: (traceResult.uiSurfaces || []).length,
      uiEdges: (traceResult.uiEdges || []).length,
      endpoints: (traceResult.endpoints || []).length,
      uiEndpointEdges: (traceResult.uiEndpointEdges || []).length,
      rpcSurfaces: (traceResult.rpcSurfaces || []).length,
      rpcFlows: (traceResult.rpcFlows || []).length,
      entrySurfaces: (traceResult.entrySurfaces || []).length,
    },
    at: graph.builtAt,
  };

  graph.profiles.frameworks = traceResult.frameworks || [];
  graph.profiles.uiSurfaces = traceResult.uiSurfaces || [];
  graph.profiles.rpcSurfaces = traceResult.rpcSurfaces || [];
  graph.profiles.entrySurfaces = traceResult.entrySurfaces || [];

  graph.termCache[traceResult.term] = {
    timestamp: graph.builtAt,
    counts: nextCounts,
    summary: {
      term: traceResult.term,
      projectDir: traceResult.projectDir,
      variants: traceResult.variants,
      catalogFiles: (traceResult.fileCatalog || []).length,
      symbols: (traceResult.symbols || []).length,
      imports: (traceResult.imports || []).length,
      calls: (traceResult.calls || []).length,
      frameworks: (traceResult.frameworks || []).map((item) => item.id),
      uiSurfaces: (traceResult.uiSurfaces || []).map((item) => item.type),
      uiEdges: (traceResult.uiEdges || []).map((item) => item.type),
      endpoints: (traceResult.endpoints || []).map((item) => item.key),
      uiEndpointEdges: (traceResult.uiEndpointEdges || []).map((item) => item.type),
      rpcSurfaces: (traceResult.rpcSurfaces || []).map((item) => item.key),
      rpcFlows: (traceResult.rpcFlows || []).map((item) => item.key),
      entrySurfaces: (traceResult.entrySurfaces || []).map((item) => item.key),
    },
  };

  return { graph, previous: prev, delta: graph.lastDelta };
}

export function updateGraphSnapshot(graph, analysis) {
  graph.root = analysis.projectDir;
  graph.builtAt = Date.now();
  graph.files = Object.fromEntries(
    (analysis.fileCatalog || []).map((file) => [
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
    (analysis.symbols || []).map((symbol) => [
      `${path.relative(analysis.projectDir, symbol.filePath)}::${symbol.name}::${symbol.startLine}`,
      {
        name: symbol.name,
        kind: symbol.kind,
        language: symbol.language,
        filePath: symbol.filePath,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        exported: symbol.exported,
        snippet: symbol.snippet,
      },
    ])
  );
  graph.edges.imports = (analysis.imports || []).map((item) => ({
    type: item.type,
    language: item.language,
    fromFile: item.fromFile,
    specifier: item.specifier,
    resolvedPath: item.resolvedPath,
  }));
  graph.edges.calls = (analysis.calls || []).map((item) => ({
    type: item.type,
    language: item.language,
    fromFile: item.fromFile,
    callerName: item.callerName,
    calleeName: item.calleeName,
  }));
  graph.edges.ui = (analysis.uiEdges || []).map((item) => ({
    type: item.type,
    from: item.from,
    to: item.to,
    evidence: item.evidence,
  }));
  graph.edges.uiToEndpoint = (analysis.uiEndpointEdges || []).map((item) => ({
    type: item.type,
    from: item.from,
    to: item.to,
    evidence: item.evidence,
  }));
  graph.edges.rpc = (analysis.rpcSurfaces || []).map((item) => ({
    type: item.type,
    key: item.key,
    mod: item.mod,
    fun: item.fun,
    apiFile: item.apiFile,
    handlerFile: item.handlerFile,
    handlerName: item.handlerName,
  }));
  graph.profiles.frameworks = analysis.frameworks || [];
  graph.profiles.uiSurfaces = analysis.uiSurfaces || [];
  graph.profiles.rpcSurfaces = analysis.rpcSurfaces || [];
  graph.profiles.entrySurfaces = analysis.entrySurfaces || [];
  graph.lastDelta = {
    term: null,
    counts: {
      chains: 0,
      solo: 0,
      files: 0,
    },
    scan: {
      catalogFiles: (analysis.fileCatalog || []).length,
      symbols: (analysis.symbols || []).length,
      imports: (analysis.imports || []).length,
      calls: (analysis.calls || []).length,
      frameworks: (analysis.frameworks || []).length,
      uiSurfaces: (analysis.uiSurfaces || []).length,
      uiEdges: (analysis.uiEdges || []).length,
      endpoints: (analysis.endpoints || []).length,
      uiEndpointEdges: (analysis.uiEndpointEdges || []).length,
      rpcSurfaces: (analysis.rpcSurfaces || []).length,
      rpcFlows: (analysis.rpcFlows || []).length,
      entrySurfaces: (analysis.entrySurfaces || []).length,
    },
    at: graph.builtAt,
  };

  return { graph };
}

export function updateWorkspaceSnapshot(graph, workspaceResult) {
  graph.root = workspaceResult.rootDir;
  graph.builtAt = Date.now();
  graph.repos = workspaceResult.repos;
  graph.connections = workspaceResult.connections;
  return { graph };
}
