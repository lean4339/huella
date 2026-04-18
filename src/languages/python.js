import { createLineScanner, createSymbol, resolveRelativeFile, uniqueBy } from "./base.js";

const EXTENSIONS = [".py"];

export const pythonLanguage = {
  id: "python",
  extensions: new Set(EXTENSIONS),
  extractSymbols(content, filePath) {
    const lines = createLineScanner(content);
    const symbols = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      let match = line.match(/^\s*class\s+([A-Za-z_][\w]*)\b/);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, "class", match[1], true));
        continue;
      }

      match = line.match(/^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)\s*\(/);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, "function", match[1], true));
      }
    }

    return symbols;
  },
  extractImports(content, fromFile) {
    const imports = [];
    const lines = createLineScanner(content);

    for (const line of lines) {
      let match = line.match(/^\s*import\s+(.+)$/);
      if (match) {
        const modules = match[1].split(",").map((item) => item.trim().split(/\s+as\s+/)[0]);
        for (const specifier of modules) {
          imports.push({
            type: "import",
            fromFile,
            specifier,
            resolvedPath: specifier.startsWith(".")
              ? resolveRelativeFile(specifier.replace(/\./g, "/"), fromFile, EXTENSIONS)
              : null,
          });
        }
        continue;
      }

      match = line.match(/^\s*from\s+([.\w]+)\s+import\s+(.+)$/);
      if (match) {
        imports.push({
          type: "import",
          fromFile,
          specifier: match[1],
          resolvedPath: match[1].startsWith(".")
            ? resolveRelativeFile(match[1].replace(/\./g, "/"), fromFile, EXTENSIONS)
            : null,
        });
      }
    }

    return uniqueBy(imports, (item) => `${item.type}:${item.fromFile}:${item.specifier}`);
  },
};
