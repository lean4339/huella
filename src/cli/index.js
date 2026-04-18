#!/usr/bin/env node

import path from "path";
import { traceTerm } from "../core/trace.js";
import { loadGraph, saveGraph, updateTermSnapshot } from "../graph/store.js";
import { formatTraceHuman } from "../output/human.js";
import { formatTraceJson } from "../output/json.js";

function printUsage() {
  console.log("Usage: huella <term> [dir] [--json]");
  console.log("");
  console.log("Examples:");
  console.log("  huella booking /path/to/repo");
  console.log("  huella createUser .");
  console.log("  huella .env/local /path/to/repo --json");
}

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const cleanArgs = args.filter((arg) => arg !== "--json");
const [termArg, dirArg] = cleanArgs;

if (!termArg || termArg === "--help" || termArg === "-h") {
  printUsage();
  process.exit(termArg ? 0 : 1);
}

const projectDir = path.resolve(dirArg || process.cwd());
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
