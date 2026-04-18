import fs from "fs";
import path from "path";

export function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

export function buildSnippet(lines, startLine, endLine, maxLines = 20) {
  const slice = lines.slice(startLine - 1, Math.min(endLine, startLine - 1 + maxLines));
  return slice.join("\n");
}

export function createLineScanner(content) {
  return content.split("\n");
}

export function createSymbol(lines, filePath, index, kind, name, exported = false, endOffset = 8) {
  const startLine = index + 1;
  const endLine = Math.min(lines.length, startLine + endOffset);
  return {
    name,
    kind,
    filePath,
    startLine,
    endLine,
    exported,
    snippet: buildSnippet(lines, startLine, endLine),
  };
}

export function statFile(candidate) {
  try {
    return fs.statSync(candidate);
  } catch {
    return null;
  }
}

export function resolveRelativeFile(specifier, fromFile, extensions = []) {
  if (!specifier || !specifier.startsWith(".")) return null;

  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    ...extensions.map((ext) => `${base}${ext}`),
    ...extensions.map((ext) => path.join(base, `index${ext}`)),
    base,
  ];

  for (const candidate of candidates) {
    const stats = statFile(candidate);
    if (stats?.isFile()) return candidate;
  }

  return null;
}

export function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
