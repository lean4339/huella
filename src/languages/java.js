import { createLineScanner, createSymbol, uniqueBy } from "./base.js";

export const javaLanguage = {
  id: "java",
  extensions: new Set([".java"]),
  extractSymbols(content, filePath) {
    const lines = createLineScanner(content);
    const symbols = [];

    const typeRe =
      /^\s*(?:(?:public|protected|private|abstract|final|static)\s+)*(class|interface|enum|record)\s+([A-Za-z_][\w]*)\b/;
    const methodRe =
      /^\s*(?:(?:public|protected|private|static|final|abstract|synchronized)\s+)+[\w<>\[\],.?]+\s+([A-Za-z_][\w]*)\s*\(/;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      let match = line.match(typeRe);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, match[1], match[2], true));
        continue;
      }

      match = line.match(methodRe);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, "method", match[1], false));
      }
    }

    return uniqueBy(symbols, (item) => `${item.kind}:${item.name}:${item.startLine}`);
  },
  extractImports(content, fromFile) {
    const imports = [];
    const importRe = /^\s*import\s+(static\s+)?([A-Za-z_][\w.*]+)\s*;/gm;
    let match;
    while ((match = importRe.exec(content)) !== null) {
      imports.push({
        type: match[1] ? "static-import" : "import",
        fromFile,
        specifier: match[2],
        resolvedPath: null,
      });
    }
    return imports;
  },
};
