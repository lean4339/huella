import { createLineScanner, createSymbol, uniqueBy } from "./base.js";

export const goLanguage = {
  id: "go",
  extensions: new Set([".go"]),
  extractSymbols(content, filePath) {
    const lines = createLineScanner(content);
    const symbols = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      let match = line.match(/^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z_][\w]*)\s*\(/);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, "function", match[1], true));
        continue;
      }

      match = line.match(/^\s*type\s+([A-Za-z_][\w]*)\s+(struct|interface)\b/);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, match[2], match[1], true));
      }
    }

    return symbols;
  },
  extractImports(content, fromFile) {
    const imports = [];
    const singleRe = /^\s*import\s+"([^"]+)"/gm;
    const blockRe = /^\s*import\s+\(([\s\S]*?)^\s*\)/gm;

    let match;
    while ((match = singleRe.exec(content)) !== null) {
      imports.push({ type: "import", fromFile, specifier: match[1], resolvedPath: null });
    }

    while ((match = blockRe.exec(content)) !== null) {
      const inner = match[1];
      const itemRe = /"([^"]+)"/g;
      let item;
      while ((item = itemRe.exec(inner)) !== null) {
        imports.push({ type: "import", fromFile, specifier: item[1], resolvedPath: null });
      }
    }

    return uniqueBy(imports, (item) => `${item.type}:${item.fromFile}:${item.specifier}`);
  },
};
