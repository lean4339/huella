import fs from "fs";

export function detectEndpoints(fileCatalog) {
  const endpoints = [];

  for (const file of fileCatalog) {
    const content = readFile(file.path);
    if (!content) continue;

    if (/Controllers\/.+Controller\.cs$/i.test(file.relPath)) {
      endpoints.push(...extractAspNetEndpoints(file.relPath, content));
    }

    if (/source\/server\/index\.(ts|js)$/i.test(file.relPath) || /server\.(ts|js)$/i.test(file.relPath)) {
      endpoints.push(...extractExpressEndpoints(file.relPath, content));
    }

    if (/api\/routers\/.+\.py$/i.test(file.relPath) || /api\/app\.py$/i.test(file.relPath)) {
      endpoints.push(...extractFastApiEndpoints(file.relPath, content));
    }
  }

  return dedupeEndpoints(endpoints);
}

function extractAspNetEndpoints(relPath, content) {
  const endpoints = [];
  const controllerMatch = content.match(/\[Route\("([^"]+)"\)\][\s\S]*?class\s+([A-Za-z_][\w]*)/m);
  const routePrefix = controllerMatch?.[1] || null;
  const controllerName = controllerMatch?.[2]?.replace(/Controller$/, "") || null;

  const attrRe = /\[(Http(Get|Post|Put|Patch|Delete))\("([^"]*)"\)\][\s\S]{0,120}?public\s+(?:async\s+)?Task<[^>]+>|public\s+(?:async\s+)?ActionResult\s+([A-Za-z_][\w]*)/g;
  const methodRe = /\[(Http(Get|Post|Put|Patch|Delete))\("([^"]*)"\)\][\s\S]{0,200}?(?:public\s+(?:async\s+)?(?:Task<[^>]+>|ActionResult(?:<[^>]+>)?)\s+([A-Za-z_][\w]*))/g;
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
