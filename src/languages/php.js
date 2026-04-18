import { createLineScanner, createSymbol, resolveRelativeFile, uniqueBy } from "./base.js";

export const phpLanguage = {
  id: "php",
  extensions: new Set([".php"]),
  extractSymbols(content, filePath) {
    const lines = createLineScanner(content);
    const symbols = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      let match = line.match(/^\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_][\w]*)\b/);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, "class", match[1], true));
        continue;
      }

      match = line.match(/^\s*interface\s+([A-Za-z_][\w]*)\b/);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, "interface", match[1], true));
        continue;
      }

      match = line.match(/^\s*trait\s+([A-Za-z_][\w]*)\b/);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, "trait", match[1], true));
        continue;
      }

      match = line.match(/^\s*(?:public|protected|private)?\s*function\s+([A-Za-z_][\w]*)\s*\(/);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, "function", match[1], true));
      }
    }

    return symbols;
  },
  extractImports(content, fromFile) {
    const imports = [];
    const useRe = /^\s*use\s+([A-Za-z_\\][A-Za-z0-9_\\]*)\s*;/gm;
    const includeRe = /\b(?:require|require_once|include|include_once)\s*(?:\(?\s*__DIR__\s*\.\s*)?["']([^"']+)["']\s*\)?/gm;

    let match;
    while ((match = useRe.exec(content)) !== null) {
      imports.push({
        type: "use",
        fromFile,
        specifier: match[1],
        resolvedPath: null,
      });
    }

    while ((match = includeRe.exec(content)) !== null) {
      const specifier = match[1];
      imports.push({
        type: "include",
        fromFile,
        specifier,
        resolvedPath: specifier.startsWith(".") ? resolveRelativeFile(specifier, fromFile, [".php"]) : null,
      });
    }

    return uniqueBy(imports, (item) => `${item.type}:${item.fromFile}:${item.specifier}`);
  },
};
