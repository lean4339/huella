import fs from "fs";
import path from "path";

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".java", ".cs", ".rb", ".php", ".rs",
]);

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function buildSnippet(lines, startLine, endLine, maxLines = 20) {
  const slice = lines.slice(startLine - 1, Math.min(endLine, startLine - 1 + maxLines));
  return slice.join("\n");
}

export function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath));
}

export function extractFileSymbols(filePath) {
  if (!isSourceFile(filePath)) return [];

  const content = readFile(filePath);
  if (!content) return [];

  const lines = content.split("\n");
  const symbols = [];

  const patterns = [
    {
      kind: "function",
      regex: /^\s*(export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
      nameIndex: 2,
      exportedIndex: 1,
    },
    {
      kind: "const-function",
      regex: /^\s*(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/,
      nameIndex: 2,
      exportedIndex: 1,
    },
    {
      kind: "const-arrow",
      regex: /^\s*(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
      nameIndex: 2,
      exportedIndex: 1,
    },
    {
      kind: "class",
      regex: /^\s*(export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)\b/,
      nameIndex: 2,
      exportedIndex: 1,
    },
  ];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (!match) continue;

      const name = match[pattern.nameIndex];
      const exported = Boolean(match[pattern.exportedIndex]);
      const startLine = index + 1;
      const endLine = Math.min(lines.length, startLine + 8);

      symbols.push({
        name,
        kind: pattern.kind,
        filePath,
        startLine,
        endLine,
        exported,
        snippet: buildSnippet(lines, startLine, endLine),
      });

      break;
    }
  }

  return symbols;
}

export function extractSymbolsFromCatalog(fileCatalog) {
  const symbols = [];
  for (const file of fileCatalog) {
    symbols.push(...extractFileSymbols(file.path));
  }
  return symbols;
}
