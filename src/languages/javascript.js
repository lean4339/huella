import { createLineScanner, createSymbol, resolveRelativeFile } from "./base.js";

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

export const javascriptLanguage = {
  id: "javascript",
  extensions: new Set(EXTENSIONS),
  extractSymbols(content, filePath) {
    const lines = createLineScanner(content);
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
        symbols.push(
          createSymbol(
            lines,
            filePath,
            index,
            pattern.kind,
            match[pattern.nameIndex],
            Boolean(match[pattern.exportedIndex])
          )
        );
        break;
      }
    }

    return symbols;
  },
  extractImports(content, fromFile) {
    const imports = [];
    const importRe = /^\s*import\s+.+?\s+from\s+["'`]([^"'`]+)["'`]/gm;
    const reexportRe = /^\s*export\s+\{[^}]+\}\s+from\s+["'`]([^"'`]+)["'`]/gm;

    let match;
    while ((match = importRe.exec(content)) !== null) {
      const specifier = match[1];
      imports.push({
        type: "import",
        fromFile,
        specifier,
        resolvedPath: resolveRelativeFile(specifier, fromFile, EXTENSIONS),
      });
    }

    while ((match = reexportRe.exec(content)) !== null) {
      const specifier = match[1];
      imports.push({
        type: "reexport",
        fromFile,
        specifier,
        resolvedPath: resolveRelativeFile(specifier, fromFile, EXTENSIONS),
      });
    }

    return imports;
  },
  extractCalls(content, filePath, symbols) {
    return extractCallsFromSymbols(filePath, symbols, /\b(?:await\s+)?(?:[A-Za-z_$][\w$]*\.)?([A-Za-z_$][\w$]*)\s*\(/g);
  },
};

function extractCallsFromSymbols(filePath, symbols, regex) {
  const calls = [];
  const ignored = new Set(["if", "for", "while", "switch", "catch", "return", "typeof", "delete", "new", "super"]);

  for (const symbol of symbols) {
    const snippet = symbol.snippet || "";
    let match;
    while ((match = regex.exec(snippet)) !== null) {
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

  return calls;
}
