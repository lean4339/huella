export function findDefinitions(graph, term) {
  const variants = generateTermVariants(term).map((item) => item.toLowerCase());

  const matches = Object.entries(graph.symbols || {})
    .filter(([, symbol]) => variants.some((variant) => symbol.name.toLowerCase().includes(variant)))
    .map(([id, symbol]) => ({ id, ...symbol }));

  matches.sort((a, b) =>
    Number(b.exported) - Number(a.exported) ||
    a.filePath.localeCompare(b.filePath) ||
    a.startLine - b.startLine
  );

  return {
    term,
    variants: [...new Set(variants)],
    matches,
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
