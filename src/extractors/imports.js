import fs from "fs";
import path from "path";
import { isSourceFile } from "./symbols.js";

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function resolveImportPath(specifier, fromFile) {
  if (!specifier.startsWith(".")) return null;

  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
    path.join(base, "index.mjs"),
    path.join(base, "index.cjs"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export function extractFileImports(filePath) {
  if (!isSourceFile(filePath)) return [];

  const content = readFile(filePath);
  if (!content) return [];

  const imports = [];

  const importRe = /^\s*import\s+.+?\s+from\s+["'`]([^"'`]+)["'`]/gm;
  const reexportRe = /^\s*export\s+\{[^}]+\}\s+from\s+["'`]([^"'`]+)["'`]/gm;

  let match;
  while ((match = importRe.exec(content)) !== null) {
    const specifier = match[1];
    imports.push({
      type: "import",
      fromFile: filePath,
      specifier,
      resolvedPath: resolveImportPath(specifier, filePath),
    });
  }

  while ((match = reexportRe.exec(content)) !== null) {
    const specifier = match[1];
    imports.push({
      type: "reexport",
      fromFile: filePath,
      specifier,
      resolvedPath: resolveImportPath(specifier, filePath),
    });
  }

  return imports;
}

export function extractImportsFromCatalog(fileCatalog) {
  const imports = [];
  for (const file of fileCatalog) {
    imports.push(...extractFileImports(file.path));
  }
  return imports;
}
