import fs from "fs";

export function detectUiEndpointEdges(fileCatalog, endpoints) {
  const edges = [];

  for (const file of fileCatalog) {
    if (!isUiRelevantFile(file.relPath)) continue;

    const content = readFile(file.path);
    if (!content) continue;

    const httpClientRe = /\bhttpClient\s*\(\s*[^,]+,\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = httpClientRe.exec(content)) !== null) {
      edges.push({
        type: "ui_calls_rpc_endpoint",
        from: file.relPath,
        to: `${match[1]}.${match[2]}`,
        evidence: ["httpClient_rpc"],
      });
    }

    const fetchRe = /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]/g;
    while ((match = fetchRe.exec(content)) !== null) {
      const target = findEndpointByRoute(endpoints, match[1]);
      if (!target) continue;
      edges.push({
        type: "ui_calls_http_endpoint",
        from: file.relPath,
        to: target.key,
        evidence: ["fetch"],
      });
    }

    const axiosRe = /\baxios\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    while ((match = axiosRe.exec(content)) !== null) {
      const target = findEndpointByRoute(endpoints, match[2], match[1].toUpperCase());
      if (!target) continue;
      edges.push({
        type: "ui_calls_http_endpoint",
        from: file.relPath,
        to: target.key,
        evidence: ["axios"],
      });
    }

  }

  return dedupeEdges(edges);
}

function findEndpointByRoute(endpoints, route, method = null) {
  return endpoints.find((endpoint) =>
    endpoint.route === route && (!method || endpoint.method === method)
  ) || null;
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function isUiRelevantFile(relPath) {
  return /(^|\/)(Views|views|templates|pages|app|components|frontend\/src|public)\//i.test(relPath) ||
    /\.(cshtml|ejs|pug|hbs|mustache|twig|jsp|jspx|ftl|vm|tsx|jsx|html)$/i.test(relPath);
}

function dedupeEdges(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.from}:${item.to}:${item.evidence.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
