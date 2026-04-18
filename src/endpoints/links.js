import fs from "fs";

export function detectUiEndpointEdges(fileCatalog, endpoints) {
  const edges = [];
  const wrapperSpecs = collectHttpWrapperSpecs(fileCatalog);

  for (const file of fileCatalog) {
    if (!isNetworkRelevantFile(file.relPath)) continue;

    const content = readFile(file.path);
    if (!content) continue;
    const edgeType = isUiRelevantFile(file.relPath) ? "ui_calls_http_endpoint" : "code_calls_http_endpoint";

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
        type: edgeType,
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
        type: edgeType,
        from: file.relPath,
        to: target.key,
        evidence: ["axios"],
      });
    }

    const axiosClients = extractAxiosClientNames(content);
    for (const clientName of axiosClients) {
      const clientRe = new RegExp(`\\b${escapeRegex(clientName)}\\.(get|post|put|patch|delete)\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, "g");
      while ((match = clientRe.exec(content)) !== null) {
        const target = findEndpointByRoute(endpoints, match[2], match[1].toUpperCase());
        if (!target) continue;
        edges.push({
          type: edgeType,
          from: file.relPath,
          to: target.key,
          evidence: ["axios_client"],
        });
      }
    }

    const reqRe = /\breq\s*\(\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]\s*,\s*(`([^`]+)`|['"`]([^'"`]+)['"`])/g;
    while ((match = reqRe.exec(content)) !== null) {
      const rawPath = match[3] ?? match[4] ?? "";
      const target = findEndpointByRoute(endpoints, `/api${rawPath}`, match[1].toUpperCase());
      if (!target) continue;
      edges.push({
        type: edgeType,
        from: file.relPath,
        to: target.key,
        evidence: ["req_wrapper"],
      });
    }

    for (const spec of wrapperSpecs) {
      const callRe = buildWrapperCallRegex(spec.name, spec.kind);
      while ((match = callRe.exec(content)) !== null) {
        const resolved = resolveWrapperCall(spec, match);
        if (!resolved) continue;
        const target = findEndpointByRoute(endpoints, resolved.route, resolved.method);
        if (!target) continue;
        edges.push({
          type: edgeType,
          from: file.relPath,
          to: target.key,
          evidence: [`http_wrapper:${spec.name}`],
        });
      }
    }

    const csharpClientRe = /\.(GetAsync|PostAsync|PutAsync|PatchAsync|DeleteAsync)\s*\(\s*["']([^"']+)["']/g;
    while ((match = csharpClientRe.exec(content)) !== null) {
      const method = match[1].replace(/Async$/, "").replace(/^./, (c) => c.toUpperCase());
      const target = findEndpointByRoute(endpoints, match[2], method.toUpperCase());
      if (!target) continue;
      edges.push({
        type: edgeType,
        from: file.relPath,
        to: target.key,
        evidence: ["csharp_httpclient"],
      });
    }

    const csharpRequestRe = /new\s+HttpRequestMessage\s*\(\s*HttpMethod\.(Get|Post|Put|Patch|Delete)\s*,\s*["']([^"']+)["']/g;
    while ((match = csharpRequestRe.exec(content)) !== null) {
      const target = findEndpointByRoute(endpoints, match[2], match[1].toUpperCase());
      if (!target) continue;
      edges.push({
        type: edgeType,
        from: file.relPath,
        to: target.key,
        evidence: ["csharp_request_message"],
      });
    }

    const pythonClientRe = /\b(?:requests|httpx)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g;
    while ((match = pythonClientRe.exec(content)) !== null) {
      const target = findEndpointByRoute(endpoints, match[2], match[1].toUpperCase());
      if (!target) continue;
      edges.push({
        type: edgeType,
        from: file.relPath,
        to: target.key,
        evidence: ["python_http_client"],
      });
    }

  }

  return dedupeEdges(edges);
}

function findEndpointByRoute(endpoints, route, method = null) {
  const normalizedRoute = normalizeRoute(route);
  return endpoints.find((endpoint) =>
    routesMatch(endpoint.route, normalizedRoute) && (!method || endpoint.method === method)
  ) || null;
}

function normalizeRoute(route) {
  if (!route) return route;

  let normalized = route
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/\?.*$/, "");

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  return normalized.replace(/\/+/g, "/");
}

function routesMatch(endpointRoute, candidateRoute) {
  const normalizedEndpoint = normalizeRoute(endpointRoute);
  const normalizedCandidate = normalizeRoute(candidateRoute);
  if (normalizedEndpoint === normalizedCandidate) return true;

  const endpointPattern = normalizedEndpoint.replace(/:param/g, "[^/]+");
  return new RegExp(`^${endpointPattern}$`).test(normalizedCandidate);
}

function collectHttpWrapperSpecs(fileCatalog) {
  const specs = [];

  for (const file of fileCatalog) {
    const content = readFile(file.path);
    if (!content) continue;

    const methodPathRe = /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?\(\s*([A-Za-z_][\w]*)\s*,\s*([A-Za-z_][\w]*)[^)]*\)\s*=>[\s\S]{0,600}?(?:fetch|axios(?:\.\w+)?\s*\()/g;
    let match;
    while ((match = methodPathRe.exec(content)) !== null) {
      const prefix = inferPathPrefix(content.slice(match.index, match.index + 700), match[3]);
      specs.push({ name: match[1], kind: "method_path", methodArgName: match[2], pathArgName: match[3], prefix });
    }

    const pathOnlyRe = /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?\(\s*([A-Za-z_][\w]*)[^)]*\)\s*=>[\s\S]{0,600}?(?:fetch|axios\.(get|post|put|patch|delete)|([A-Za-z_][\w]*)\.(get|post|put|patch|delete))/g;
    while ((match = pathOnlyRe.exec(content)) !== null) {
      const fixedMethod = (match[3] || match[5] || "").toUpperCase();
      if (!fixedMethod) continue;
      const prefix = inferPathPrefix(content.slice(match.index, match.index + 700), match[2]);
      specs.push({ name: match[1], kind: "path_only", pathArgName: match[2], fixedMethod, prefix });
    }
  }

  return dedupeWrapperSpecs(specs);
}

function inferPathPrefix(snippet, pathArgName) {
  const patterns = [
    new RegExp(`/api\\$\\{${escapeRegex(pathArgName)}\\}`),
    new RegExp(`['"\`](/api)['"\`]\\s*\\+\\s*${escapeRegex(pathArgName)}`),
  ];

  if (patterns.some((re) => re.test(snippet))) {
    return "/api";
  }

  return "";
}

function buildWrapperCallRegex(name, kind) {
  if (kind === "method_path") {
    return new RegExp(`\\b${escapeRegex(name)}\\s*\\(\\s*['"\`](GET|POST|PUT|PATCH|DELETE)['"\`]\\s*,\\s*(\`([^\\\`]+)\`|['"\`]([^'"\`]+)['"\`])`, "g");
  }

  return new RegExp(`\\b${escapeRegex(name)}\\s*\\(\\s*(\`([^\\\`]+)\`|['"\`]([^'"\`]+)['"\`])`, "g");
}

function resolveWrapperCall(spec, match) {
  if (spec.kind === "method_path") {
    const rawPath = match[3] ?? match[4] ?? "";
    return {
      method: match[1].toUpperCase(),
      route: `${spec.prefix}${rawPath}`,
    };
  }

  const rawPath = match[2] ?? match[3] ?? "";
  return {
    method: spec.fixedMethod,
    route: `${spec.prefix}${rawPath}`,
  };
}

function extractAxiosClientNames(content) {
  const names = new Set();
  const clientRe = /\b(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*axios\.create\s*\(/g;
  let match;
  while ((match = clientRe.exec(content)) !== null) {
    names.add(match[1]);
  }
  return [...names];
}

function dedupeWrapperSpecs(specs) {
  const seen = new Set();
  return specs.filter((spec) => {
    const key = `${spec.name}:${spec.kind}:${spec.fixedMethod ?? ""}:${spec.prefix ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    /^src\/.+\.(ts|tsx|js|jsx|html)$/i.test(relPath) ||
    /\.(cshtml|ejs|pug|hbs|mustache|twig|jsp|jspx|ftl|vm|tsx|jsx|html)$/i.test(relPath);
}

function isNetworkRelevantFile(relPath) {
  return isUiRelevantFile(relPath) ||
    /(^|\/)(controllers?|services?|handlers?|providers?|clients?|api|server|routers?)\//i.test(relPath) ||
    /\.(cs|py|php|ts|tsx|js|jsx)$/i.test(relPath);
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
