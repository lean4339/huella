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
        const resolvedPath = resolvePythonModule(match[1], fromFile);
        imports.push({
          type: "import",
          fromFile,
          specifier: match[1],
          resolvedPath,
        });
      }
    }

    return uniqueBy(imports, (item) => `${item.type}:${item.fromFile}:${item.specifier}`);
  },
  extractCalls(content, filePath, symbols) {
    const calls = [];
    const ignored = new Set(["if", "for", "while", "with", "print", "return", "class", "def"]);

    for (const symbol of symbols) {
      const snippet = symbol.snippet || "";
      const re = /\b(?:await\s+)?(?:[A-Za-z_][\w]*\.)?([A-Za-z_][\w]*)\s*\(/g;
      let match;
      while ((match = re.exec(snippet)) !== null) {
        const callee = match[1];
        if (!callee || callee === symbol.name || ignored.has(callee)) continue;
        calls.push({
          type: "call",
          fromFile: filePath,
          callerName: symbol.name,
          calleeName: callee,
        });
      }
    }

    return uniqueBy(calls, (item) => `${item.fromFile}:${item.callerName}:${item.calleeName}`);
  },
};

function resolvePythonModule(specifier, fromFile) {
  if (!specifier.startsWith(".")) return null;

  const dots = specifier.match(/^\.+/)?.[0].length ?? 0;
  const modulePart = specifier.slice(dots).replace(/\./g, "/");
  let baseDir = fromFile;

  for (let i = 0; i < dots; i++) {
    baseDir = new URL(`file://${baseDir}/..`).pathname;
  }

  const normalizedBase = baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir;
  const relativeSpecifier = modulePart ? `./${modulePart}` : ".";

  return resolveRelativeFile(relativeSpecifier, `${normalizedBase}/__init__.py`, EXTENSIONS) ||
    resolveRelativeFile(relativeSpecifier, `${normalizedBase}/module.py`, EXTENSIONS);
}
