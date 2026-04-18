import fs from "fs";

export function findReferences(graph, term) {
  const variants = [...new Set(generateTermVariants(term))];
  const exactVariantKeys = new Set(variants.map(normalizeName));

  const exactSymbols = [];
  const fuzzySymbols = [];

  for (const symbol of Object.values(graph.symbols || {})) {
    const exact = exactVariantKeys.has(normalizeName(symbol.name));
    const fuzzy = variants.some((variant) => symbol.name.toLowerCase().includes(variant.toLowerCase()));
    if (!exact && !fuzzy) continue;
    const match = {
      ...symbol,
      evidence: exact ? "exact_symbol" : "fuzzy_symbol",
    };
    if (exact) {
      exactSymbols.push(match);
    } else {
      fuzzySymbols.push(match);
    }
  }

  const matchMode = exactSymbols.length > 0 ? "exact" : "fuzzy";
  const matchingSymbols = matchMode === "exact" ? exactSymbols : fuzzySymbols;

  const symbolFiles = new Set(matchingSymbols.map((symbol) => symbol.filePath));
  const loweredVariants = variants.map((item) => item.toLowerCase());

  const importRefs = (graph.edges?.imports || [])
    .map((edge) => {
      const specifier = (edge.specifier || "").toLowerCase();
      const resolved = (edge.resolvedPath || "").toLowerCase();
      const evidence = [];

      if ([...symbolFiles].some((filePath) => filePath === edge.resolvedPath)) {
        evidence.push(matchMode === "exact" ? "exact_symbol_file" : "fuzzy_symbol_file");
      }

      const specifierExact = loweredVariants.some((variant) => normalizeName(specifier) === normalizeName(variant));
      const resolvedExact = loweredVariants.some((variant) => normalizeName(resolved) === normalizeName(variant));
      const specifierFuzzy = loweredVariants.some((variant) => specifier.includes(variant));
      const resolvedFuzzy = loweredVariants.some((variant) => resolved.includes(variant));

      if (specifierExact) evidence.push("exact_specifier");
      if (resolvedExact) evidence.push("exact_resolved_path");

      if (matchMode === "fuzzy") {
        if (specifierFuzzy) evidence.push("fuzzy_specifier");
        if (resolvedFuzzy) evidence.push("fuzzy_resolved_path");
      }

      if (evidence.length === 0) return null;

      return {
        type: edge.type,
        language: edge.language,
        fromFile: edge.fromFile,
        specifier: edge.specifier,
        resolvedPath: edge.resolvedPath,
        evidence: [...new Set(evidence)],
      };
    })
    .filter(Boolean);

  const usageRefs = findUsageReferences(graph, matchingSymbols, matchMode);

  const callersByFile = new Map();
  for (const ref of [...importRefs, ...usageRefs]) {
    const key = `${ref.type}::${ref.fromFile}::${ref.specifier || ""}::${ref.lineNumber || ""}`;
    if (!callersByFile.has(key)) callersByFile.set(key, ref);
  }

  const uniqueRefs = [...callersByFile.values()].sort((a, b) =>
    a.fromFile.localeCompare(b.fromFile) || a.specifier.localeCompare(b.specifier)
  );

  return {
    term,
    variants,
    matchMode,
    counts: {
      exact: exactSymbols.length,
      fuzzy: fuzzySymbols.length,
    },
    matchedSymbols: matchingSymbols,
    references: uniqueRefs,
  };
}

function findUsageReferences(graph, matchingSymbols, matchMode) {
  const exactNames = [...new Set(
    matchingSymbols
      .filter((symbol) => symbol.evidence === "exact_symbol")
      .map((symbol) => symbol.name)
  )];

  if (matchMode !== "exact" || exactNames.length === 0) {
    return [];
  }

  const definingFiles = new Set(matchingSymbols.map((symbol) => symbol.filePath));
  const refs = [];

  for (const file of Object.values(graph.files || {})) {
    if (!file.path || definingFiles.has(file.path)) continue;

    const content = readFile(file.path);
    if (!content) continue;

    const lines = content.split("\n");
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const matchedName = exactNames.find((name) =>
        new RegExp(`\\b${escapeRegExp(name)}\\b`).test(line)
      );

      if (!matchedName) continue;

      refs.push({
        type: "usage",
        language: detectLanguageForFile(file.path, matchingSymbols),
        fromFile: file.path,
        specifier: matchedName,
        resolvedPath: null,
        lineNumber: index + 1,
        line: line.trimEnd(),
        evidence: ["exact_symbol_usage"],
      });
    }
  }

  return refs;
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function detectLanguageForFile(filePath, matchingSymbols) {
  return matchingSymbols.find((item) => item.filePath === filePath)?.language ||
    matchingSymbols[0]?.language ||
    null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function generateTermVariants(term) {
  const variants = new Set();
  variants.add(term);
  variants.add(term.toLowerCase());

  if (term.includes("_")) {
    const camel = term.replace(/_([a-z0-9])/gi, (_, c) => c.toUpperCase());
    variants.add(camel);
    variants.add(camel.charAt(0).toLowerCase() + camel.slice(1));
    variants.add(camel.charAt(0).toUpperCase() + camel.slice(1));
    variants.add(term.toUpperCase());
  }

  if (/[a-z][A-Z]/.test(term)) {
    const snake = term.replace(/([A-Z])/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, "");
    variants.add(snake);
    variants.add(snake.toLowerCase());
  }

  return [...variants];
}
