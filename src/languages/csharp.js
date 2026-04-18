import { createLineScanner, createSymbol, uniqueBy } from "./base.js";

export const csharpLanguage = {
  id: "csharp",
  extensions: new Set([".cs"]),
  extractSymbols(content, filePath) {
    const lines = createLineScanner(content);
    const symbols = [];

    const typeRe =
      /^\s*(?:\[.*\]\s*)*(?:(?:public|internal|private|protected|sealed|abstract|static|partial)\s+)*(class|interface|record|struct|enum)\s+([A-Za-z_][\w]*)\b/;
    const methodRe =
      /^\s*(?:(?:public|internal|private|protected|static|virtual|override|async|sealed|partial)\s+)+[\w<>\[\],.?]+\s+([A-Za-z_][\w]*)\s*\(/;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      let match = line.match(typeRe);
      if (match) {
        symbols.push(createSymbol(lines, filePath, index, match[1], match[2], true));
        continue;
      }

      match = line.match(methodRe);
      if (match && !["if", "for", "foreach", "while", "switch", "catch", "using", "lock"].includes(match[1])) {
        symbols.push(createSymbol(lines, filePath, index, "method", match[1], false));
      }
    }

    return uniqueBy(symbols, (item) => `${item.kind}:${item.name}:${item.startLine}`);
  },
  extractImports(content, fromFile) {
    const imports = [];
    const usingRe = /^\s*using\s+(?:[A-Za-z_][\w]*\s*=\s*)?([A-Za-z_][\w.]+)\s*;/gm;

    let match;
    while ((match = usingRe.exec(content)) !== null) {
      imports.push({
        type: "using",
        fromFile,
        specifier: match[1],
        resolvedPath: null,
      });
    }

    return imports;
  },
  extractCalls(content, filePath, symbols) {
    const calls = [];
    const ignored = new Set(["if", "for", "foreach", "while", "switch", "catch", "using", "lock", "nameof", "typeof", "new", "base", "this"]);

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
