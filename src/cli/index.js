#!/usr/bin/env node

import path from "path";
import { traceTerm } from "../core/trace.js";
import { findDefinitions } from "../core/def.js";
import { findReferences } from "../core/refs.js";
import { loadGraph, saveGraph, updateTermSnapshot } from "../graph/store.js";
import { formatDefinitionsHuman, formatReferencesHuman, formatTraceHuman } from "../output/human.js";
import { formatDefinitionsJson, formatReferencesJson, formatTraceJson } from "../output/json.js";

function printUsage() {
  console.log("Usage:");
  console.log("  huella <term> [dir] [--json]");
  console.log("  huella def <symbol> [dir] [--json]");
  console.log("  huella refs <symbol> [dir] [--json]");
  console.log("");
  console.log("Examples:");
  console.log("  huella booking /path/to/repo");
  console.log("  huella createUser .");
  console.log("  huella .env/local /path/to/repo --json");
  console.log("  huella def create_files /path/to/repo");
  console.log("  huella refs create_files /path/to/repo");
}

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const cleanArgs = args.filter((arg) => arg !== "--json");
const [commandOrTerm, maybeTerm, maybeDir] = cleanArgs;

if (!commandOrTerm || commandOrTerm === "--help" || commandOrTerm === "-h") {
  printUsage();
  process.exit(commandOrTerm ? 0 : 1);
}

if (commandOrTerm === "def" || commandOrTerm === "refs") {
  const symbol = maybeTerm;
  const projectDir = path.resolve(maybeDir || process.cwd());
  if (!symbol) {
    printUsage();
    process.exit(1);
  }

  const traceResult = traceTerm(symbol, projectDir);
  const graph = loadGraph(projectDir);
  const { graph: nextGraph } = updateTermSnapshot(graph, traceResult);
  saveGraph(nextGraph);

  if (commandOrTerm === "def") {
    const result = findDefinitions(nextGraph, symbol);
    if (jsonMode) {
      console.log(JSON.stringify(formatDefinitionsJson(result), null, 2));
    } else {
      console.log(formatDefinitionsHuman(result, projectDir));
    }
  } else {
    const result = findReferences(nextGraph, symbol);
    if (jsonMode) {
      console.log(JSON.stringify(formatReferencesJson(result), null, 2));
    } else {
      console.log(formatReferencesHuman(result, projectDir));
    }
  }
} else {
  const termArg = commandOrTerm;
  const projectDir = path.resolve(maybeTerm || process.cwd());
  const result = traceTerm(termArg, projectDir);

  const graph = loadGraph(projectDir);
  const { graph: nextGraph, previous, delta } = updateTermSnapshot(graph, result);
  const graphPath = saveGraph(nextGraph);

  const graphMeta = { graphPath, previous, delta };

  if (jsonMode) {
    console.log(JSON.stringify(formatTraceJson(result, graphMeta), null, 2));
  } else {
    console.log(formatTraceHuman(result, graphMeta));
  }
}
