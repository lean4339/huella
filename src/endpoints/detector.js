import fs from "fs";

export function detectEndpoints(fileCatalog) {
  const endpoints = [];

  for (const file of fileCatalog) {
    const content = readFile(file.path);
    if (!content) continue;

    if (/Controllers\/.+Controller\.cs$/i.test(file.relPath)) {
      endpoints.push(...extractAspNetEndpoints(file.relPath, content));
    }

    if (/Program\.cs$/i.test(file.relPath) && /\bMapControllers\s*\(|\bWebApplication\.CreateBuilder\b/.test(content)) {
      endpoints.push(...extractAspNetMinimalEndpoints(file.relPath, content));
    }

    if (/source\/server\/index\.(ts|js)$/i.test(file.relPath) || /server\.(ts|js)$/i.test(file.relPath)) {
      endpoints.push(...extractExpressEndpoints(file.relPath, content));
    }

    if (/api\/routers\/.+\.py$/i.test(file.relPath) || /api\/app\.py$/i.test(file.relPath)) {
      endpoints.push(...extractFastApiEndpoints(file.relPath, content));
    }

    if (/(^|\/)app\.py$/i.test(file.relPath) && /\bfrom\s+flask\s+import\b|\bFlask\s*\(__name__/.test(content)) {
      endpoints.push(...extractFlaskEndpoints(file.relPath, content));
    }

    if (/api\/index\.php$/i.test(file.relPath)) {
      endpoints.push(...extractPhpDocumentedEndpoints(file.relPath, content));
    }
  }

  return dedupeEndpoints(endpoints);
}

function extractAspNetEndpoints(relPath, content) {
  const endpoints = [];
  const controllerMatch = content.match(/\[Route\("([^"]+)"\)\][\s\S]*?class\s+([A-Za-z_][\w]*)/m);
  const routePrefix = controllerMatch?.[1] || null;
  const controllerName = controllerMatch?.[2]?.replace(/Controller$/, "") || null;

  const methodRe = /\[(Http(Get|Post|Put|Patch|Delete))(?:\("([^"]*)"\))?\][\s\S]{0,240}?public\s+(?:async\s+)?(?:Task(?:<[^>]+>)?|ActionResult(?:<[^>]+>)?|IActionResult|[A-Za-z_][\w<>]*)\s+([A-Za-z_][\w]*)/g;
  let match;

  while ((match = methodRe.exec(content)) !== null) {
    const httpMethod = match[2].toUpperCase();
    const route = match[3] || "";
    const action = match[4];
    endpoints.push({
      type: "aspnet-api",
      file: relPath,
      method: httpMethod,
      route: buildAspNetRoute(routePrefix, controllerName, route),
      action,
      key: `${controllerName}.${action}`,
    });
  }

  return endpoints;
}

function extractAspNetMinimalEndpoints(relPath, content) {
  const endpoints = [];
  const re = /\bapp\.Map(Get|Post|Put|Patch|Delete)\(\s*"([^"]+)"/g;
  let match;

  while ((match = re.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const route = match[2].startsWith("/") ? match[2] : `/${match[2]}`;
    endpoints.push({
      type: "aspnet-minimal",
      file: relPath,
      method,
      route,
      action: null,
      key: `${method} ${route}`,
    });
  }

  return endpoints;
}

function buildAspNetRoute(prefix, controllerName, route) {
  const base = (prefix || "Api/[controller]").replace("[controller]", controllerName || "");
  const full = [base, route].filter(Boolean).join("/");
  return `/${full.replace(/^\/+/, "").replace(/\/+/g, "/")}`;
}

function extractExpressEndpoints(relPath, content) {
  const endpoints = [];
  const re = /\bapp\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    endpoints.push({
      type: "express-route",
      file: relPath,
      method: match[1].toUpperCase(),
      route: match[2],
      action: null,
      key: `${match[1].toUpperCase()} ${match[2]}`,
    });
  }
  return endpoints;
}

function extractFastApiEndpoints(relPath, content) {
  const endpoints = [];
  const prefixMatch = content.match(/APIRouter\(\s*prefix\s*=\s*["'`]([^"'`]+)["'`]/);
  const prefix = prefixMatch?.[1] || "";
  const re = /@(app|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    endpoints.push({
      type: "fastapi-route",
      file: relPath,
      method: match[2].toUpperCase(),
      route: `${prefix}${match[3]}`.replace(/\/+/g, "/"),
      action: null,
      key: `${match[2].toUpperCase()} ${prefix}${match[3]}`,
    });
  }
  return endpoints;
}

function extractFlaskEndpoints(relPath, content) {
  const endpoints = [];
  const routeRe = /@(app|[\w]+)\.route\(\s*["'`]([^"'`]+)["'`](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?/g;
  let match;

  while ((match = routeRe.exec(content)) !== null) {
    const route = match[2];
    const methodsRaw = match[3];
    const methods = methodsRaw
      ? [...methodsRaw.matchAll(/["'`]([A-Z]+)["'`]/g)].map((item) => item[1])
      : ["GET"];

    for (const method of methods) {
      endpoints.push({
        type: "flask-route",
        file: relPath,
        method,
        route,
        action: null,
        key: `${method} ${route}`,
      });
    }
  }

  return endpoints;
}

function extractPhpDocumentedEndpoints(relPath, content) {
  const endpoints = [];
  const lines = content.split("\n");
  const routeRe = /^\s*\*\s+([A-Z\/]+)\s+((?:\/api\/)[^\s←]+)(?:\s|$)/;

  for (const line of lines) {
    const match = line.match(routeRe);
    if (!match) continue;

    const methods = match[1].split("/").map((item) => item.trim()).filter(Boolean);
    const normalizedRoute = normalizeDocumentedPhpRoute(match[2]);

    for (const method of methods) {
      endpoints.push({
        type: "php-route",
        file: relPath,
        method,
        route: normalizedRoute,
        action: null,
        key: `${method} ${normalizedRoute}`,
      });
    }
  }

  return endpoints;
}

function normalizeDocumentedPhpRoute(route) {
  return route
    .replace(/\[\/\{[^}]+\}\]/g, "/:param")
    .replace(/\{[^}]+\}/g, ":param")
    .replace(/\/+/g, "/");
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function dedupeEndpoints(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.file}:${item.method}:${item.route}:${item.action ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
