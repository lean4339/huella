export function findReferences(graph, term) {
  const variants = generateTermVariants(term).map((item) => item.toLowerCase());

  const matchingSymbols = Object.values(graph.symbols || {}).filter((symbol) =>
    variants.some((variant) => symbol.name.toLowerCase().includes(variant))
  );

  const symbolFiles = new Set(matchingSymbols.map((symbol) => symbol.filePath));

  const importRefs = (graph.edges?.imports || [])
    .filter((edge) => {
      const specifier = (edge.specifier || "").toLowerCase();
      const resolved = (edge.resolvedPath || "").toLowerCase();
      return variants.some((variant) =>
        specifier.includes(variant) ||
        resolved.includes(variant) ||
        [...symbolFiles].some((filePath) => filePath === edge.resolvedPath)
      );
    })
    .map((edge) => ({
      type: edge.type,
      fromFile: edge.fromFile,
      specifier: edge.specifier,
      resolvedPath: edge.resolvedPath,
    }));

  const callersByFile = new Map();
  for (const ref of importRefs) {
    const key = `${ref.type}::${ref.fromFile}::${ref.specifier}`;
    if (!callersByFile.has(key)) callersByFile.set(key, ref);
  }

  const uniqueRefs = [...callersByFile.values()].sort((a, b) =>
    a.fromFile.localeCompare(b.fromFile) || a.specifier.localeCompare(b.specifier)
  );

  return {
    term,
    variants: [...new Set(variants)],
    matchedSymbols: matchingSymbols,
    references: uniqueRefs,
  };
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
