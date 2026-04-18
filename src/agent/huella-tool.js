#!/usr/bin/env node

import path from "path";
import { analyzeProject, traceTerm } from "../core/trace.js";
import { findDefinitions } from "../core/def.js";
import { findReferences } from "../core/refs.js";
import { discoverWorkspace } from "../workspaces/discover.js";
import {
  loadGraph,
  loadWorkspaceGraph,
  saveGraph,
  saveWorkspaceGraph,
  updateGraphSnapshot,
  updateTermSnapshot,
  updateWorkspaceSnapshot,
} from "../graph/store.js";
import {
  formatDefinitionsJson,
  formatReferencesJson,
  formatTraceJson,
} from "../output/json.js";
import { formatWorkspaceJson } from "../output/workspace.js";

function printUsage() {
  console.error("Usage:");
  console.error("  huella-tool workspace <dir>");
  console.error("  huella-tool graph [dir]");
  console.error("  huella-tool trace <term> [dir]");
  console.error("  huella-tool def <symbol> [dir]");
  console.error("  huella-tool refs <symbol> [dir]");
}

function emit(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(exitCode);
}

function fail(message, meta = {}) {
  emit({
    ok: false,
    error: {
      message,
      ...meta,
    },
  }, 1);
}

const args = process.argv.slice(2);
const [operation, firstArg, secondArg] = args;

if (!operation || operation === "--help" || operation === "-h") {
  printUsage();
  process.exit(operation ? 0 : 1);
}

try {
  if (operation === "workspace") {
    const workspaceDir = path.resolve(firstArg || process.cwd());
    const result = discoverWorkspace(workspaceDir);
    const graph = loadWorkspaceGraph(workspaceDir);
    const { graph: nextGraph } = updateWorkspaceSnapshot(graph, result);
    const graphPath = saveWorkspaceGraph(nextGraph);

    emit({
      ok: true,
      operation,
      input: {
        workspaceDir,
      },
      result: formatWorkspaceJson(result, { graphPath }),
    });
  }

  if (operation === "graph") {
    const projectDir = path.resolve(firstArg || process.cwd());
    const analysis = analyzeProject(projectDir);
    const graph = loadGraph(projectDir);
    const { graph: nextGraph } = updateGraphSnapshot(graph, analysis);
    const graphPath = saveGraph(nextGraph);

    emit({
      ok: true,
      operation,
      input: {
        projectDir,
      },
      result: {
        projectDir,
        graph: {
          path: graphPath,
          builtAt: nextGraph.builtAt,
        },
        counts: {
          catalog: analysis.fileCatalog.length,
          symbols: analysis.symbols.length,
          imports: analysis.imports.length,
          calls: analysis.calls.length,
          frameworks: analysis.frameworks.length,
          uiSurfaces: analysis.uiSurfaces.length,
          uiEdges: analysis.uiEdges.length,
          endpoints: analysis.endpoints.length,
          uiEndpointEdges: analysis.uiEndpointEdges.length,
          rpcSurfaces: analysis.rpcSurfaces.length,
          rpcFlows: analysis.rpcFlows.length,
          entrySurfaces: analysis.entrySurfaces.length,
        },
        frameworks: analysis.frameworks,
      },
    });
  }

  if (operation === "trace") {
    const term = firstArg;
    if (!term) fail("Missing term.", { operation });

    const projectDir = path.resolve(secondArg || process.cwd());
    const result = traceTerm(term, projectDir);
    const graph = loadGraph(projectDir);
    const { graph: nextGraph, previous, delta } = updateTermSnapshot(graph, result);
    const graphPath = saveGraph(nextGraph);

    emit({
      ok: true,
      operation,
      input: {
        term,
        projectDir,
      },
      result: formatTraceJson(result, { graphPath, previous, delta }),
    });
  }

  if (operation === "def" || operation === "refs") {
    const term = firstArg;
    if (!term) fail(`Missing ${operation === "def" ? "symbol" : "term"}.`, { operation });

    const projectDir = path.resolve(secondArg || process.cwd());
    const traceResult = traceTerm(term, projectDir);
    const graph = loadGraph(projectDir);
    const { graph: nextGraph } = updateTermSnapshot(graph, traceResult);
    saveGraph(nextGraph);

    const result = operation === "def"
      ? formatDefinitionsJson(findDefinitions(nextGraph, term))
      : formatReferencesJson(findReferences(nextGraph, term));

    emit({
      ok: true,
      operation,
      input: {
        term,
        projectDir,
      },
      result,
    });
  }

  fail(`Unknown operation: ${operation}`, { operation });
} catch (error) {
  fail(error instanceof Error ? error.message : "Unknown error", {
    operation,
    stack: error instanceof Error ? error.stack : null,
  });
}
