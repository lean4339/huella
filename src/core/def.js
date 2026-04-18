export function findDefinitions(graph, term) {
  const variants = [...new Set(generateTermVariants(term))];
  const exactVariantKeys = new Set(variants.map(normalizeName));

  const exactMatches = [];
  const fuzzyMatches = [];

  for (const [id, symbol] of Object.entries(graph.symbols || {})) {
    const exact = exactVariantKeys.has(normalizeName(symbol.name));
    const fuzzy = variants.some((variant) =>
      symbol.name.toLowerCase().includes(variant.toLowerCase())
    );

    if (!exact && !fuzzy) continue;

    const match = {
      id,
      ...symbol,
      evidence: exact ? "exact_symbol" : "fuzzy_symbol",
    };

    if (exact) {
      exactMatches.push(match);
    } else {
      fuzzyMatches.push(match);
    }
  }

  const matchMode = exactMatches.length > 0 ? "exact" : "fuzzy";
  const matches = matchMode === "exact" ? exactMatches : fuzzyMatches;

  matches.sort((a, b) =>
    Number(b.exported) - Number(a.exported) ||
    a.filePath.localeCompare(b.filePath) ||
    a.startLine - b.startLine
  );

  return {
    term,
    variants,
    matchMode,
    counts: {
      exact: exactMatches.length,
      fuzzy: fuzzyMatches.length,
    },
    matches,
  };
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
