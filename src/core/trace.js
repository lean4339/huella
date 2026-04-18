import path from "path";
import fs from "fs";
import { scanFilesystem } from "../scanners/filesystem.js";
import { extractSymbolsFromCatalog, isSourceFile } from "../extractors/symbols.js";

function generateTermVariants(term) {
  const variants = new Set();
  variants.add(term);
  variants.add(term.toLowerCase());

  if (term.includes("_")) {
    const camel = term.replace(/_([a-z0-9])/gi, (_, c) => c.toUpperCase());
    variants.add(camel);
    variants.add(camel.charAt(0).toLowerCase() + camel.slice(1));
    variants.add(camel.charAt(0).toUpperCase() + camel.slice(1));
    variants.add(term.toUpperCase());
  }

  if (/[a-z][A-Z]/.test(term)) {
    const snake = term.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, "");
    variants.add(snake);
    variants.add(snake.toLowerCase());
  }

  return [...variants];
}

export function extractNamedFunction(filePath, funcName) {
  const content = readFile(filePath);
  if (!content) return null;

  const lines = content.split("\n");
  const patterns = [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${funcName}\\s*\\(`),
    new RegExp(`(?:export\\s+)?const\\s+${funcName}\\s*=\\s*(?:async\\s+)?\\(`),
    new RegExp(`(?:export\\s+)?const\\s+${funcName}\\s*=\\s*(?:async\\s+)?[^=]*=>`),
  ];

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (patterns.some((re) => re.test(lines[i]))) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  let opened = false;
  let end = start;

  for (let i = start; i < Math.min(lines.length, start + 250); i++) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        depth++;
        opened = true;
      } else if (ch === "}") {
        depth--;
      }
    }

    if (opened && depth === 0) {
      end = i;
      break;
    }
  }

  const codeLines = lines.slice(start, end + 1);
  const MAX_LINES = 150;
  return {
    funcName,
    startLine: start + 1,
    endLine: end + 1,
    code: codeLines.slice(0, MAX_LINES).join("\n"),
    truncated: codeLines.length > MAX_LINES,
  };
}

function readFile(filePath) {
  try { return fs.readFileSync(filePath, "utf-8"); } catch { return null; }
}

function detectLayer(filePath) {
  if (/\/(routes?|router|api|controllers?|endpoints?|views?|pages?|graphql|resolvers?)\b/i.test(filePath)) {
    return { layer: "entry", label: "① Entry", order: 1 };
  }
  if (/\/(handlers?|services?|use.?cases?|business|logic|core|domain|modules?|jobs?|tasks?|workers?|agents?)\b/i.test(filePath)) {
    return { layer: "service", label: "② Service", order: 2 };
  }
  if (/\/(db|database|repositories?|repos?|models?|data|dal|store|queries|prisma|schema|mongo|sql|cache)\b/i.test(filePath)) {
    return { layer: "data", label: "③ Data", order: 3 };
  }
  return { layer: "file", label: "📄 File", order: 0 };
}

function findFilesWithTerm(fileCatalog, variants, limit = 60) {
  const results = [];
  for (const file of fileCatalog) {
    if (results.length >= limit) break;
    const relPathLower = file.relPath.toLowerCase();
    const pathMatches = variants.some((v) => relPathLower.includes(v.toLowerCase()));
    const content = readFile(file.path);
    if (!content) continue;
    const contentMatches = variants.some((v) => content.toLowerCase().includes(v.toLowerCase()));
    if (pathMatches || contentMatches) {
      results.push({ filePath: file.path, content, pathMatched: pathMatches });
    }
  }
  return results;
}

function extractContainingFunction(content, variants) {
  const lines = content.split("\n");

  let matchLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (variants.some((v) => lines[i].toLowerCase().includes(v.toLowerCase()))) {
      matchLine = i;
      break;
    }
  }
  if (matchLine === -1) return null;

  const funcStartRe =
    /(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+\w+|(?:export\s+)?const\s+\w+\s*(?::[^=\n]+)?\s*=\s*(?:async\s+)?\(/;

  let funcStart = -1;
  for (let i = matchLine; i >= Math.max(0, matchLine - 120); i--) {
    if (funcStartRe.test(lines[i])) { funcStart = i; break; }
  }
  if (funcStart === -1) return null;

  const nameMatch = lines[funcStart].match(/function\s+(\w+)|const\s+(\w+)/);
  const funcName = nameMatch ? (nameMatch[1] || nameMatch[2]) : null;

  let depth = 0;
  let opened = false;
  let funcEnd = -1;
  for (let j = funcStart; j < Math.min(funcStart + 250, lines.length); j++) {
    for (const ch of lines[j]) {
      if (ch === "{") { depth++; opened = true; }
      else if (ch === "}") depth--;
    }
    if (opened && depth === 0) { funcEnd = j; break; }
  }
  if (funcEnd === -1) funcEnd = funcStart;

  const MAX_LINES = 150;
  const codeLines = lines.slice(funcStart, funcEnd + 1);
  return {
    funcName,
    startLine: funcStart + 1,
    endLine: funcEnd + 1,
    code: codeLines.slice(0, MAX_LINES).join("\n"),
    truncated: codeLines.length > MAX_LINES,
  };
}

function getMatchingLines(content, variants) {
  const lines = content.split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (variants.some((v) => lines[i].toLowerCase().includes(v.toLowerCase()))) {
      hits.push({ lineNumber: i + 1, line: lines[i].trimEnd() });
    }
  }
  return hits.slice(0, 8);
}

export function traceTerm(term, projectDir) {
  const fileCatalog = scanFilesystem(projectDir);
  const symbols = extractSymbolsFromCatalog(fileCatalog);
  const variants = generateTermVariants(term);
  const files = findFilesWithTerm(fileCatalog, variants);

  const hits = [];
  for (const { filePath, content, pathMatched } of files) {
    const layerInfo = detectLayer(filePath);

    let block = null;
    if (isSourceFile(filePath)) {
      block = extractNamedFunction(filePath, term);
      if (!block) block = extractContainingFunction(content, variants);
    }
    const lines = getMatchingLines(content, variants);
    hits.push({ filePath, block, lines, pathMatched, ...layerInfo });
  }

  hits.sort((a, b) => a.order - b.order || a.filePath.localeCompare(b.filePath));

  const inChain = new Set();
  const chains = [];

  for (let i = 0; i < hits.length; i++) {
    const caller = hits[i];
    if (!caller.block?.code) continue;

    const chain = [caller];

    for (let j = i + 1; j < hits.length; j++) {
      const callee = hits[j];
      if (callee.order <= caller.order) continue;
      if (!callee.block?.funcName) continue;
      if (new RegExp(`\\b${callee.block.funcName}\\s*\\(`).test(caller.block.code)) {
        chain.push(callee);
      }
    }

    if (chain.length > 1) {
      chains.push(chain);
      inChain.add(i);
      for (let j = i + 1; j < hits.length; j++) {
        const callee = hits[j];
        if (!callee.block?.funcName) continue;
        if (chain.includes(callee)) {
          inChain.add(j);
        }
      }
    }
  }

  const solo = hits.filter((_, i) => !inChain.has(i));

  return {
    term,
    projectDir,
    variants,
    fileCatalog,
    symbols,
    hits,
    chains,
    solo,
  };
}
