import fs from "fs";

export function detectUiEdges(fileCatalog, uiSurfaces, symbols = [], calls = []) {
  const edges = [];
  const viewSurfaces = uiSurfaces.filter((item) => item.type === "razor-view" || item.type === "template-view");
  const viewPaths = new Set(viewSurfaces.map((item) => item.relPath));
  const scriptSurfaces = uiSurfaces.filter((item) => item.type === "page-script");
  const scriptPaths = new Set(scriptSurfaces.map((item) => item.relPath));
  const symbolIndex = buildSymbolIndex(symbols, fileCatalog);

  const spaEntries = uiSurfaces.filter((item) => item.type === "spa-entry");
  const spaAppShells = uiSurfaces.filter((item) => item.type === "spa-app-shell");
  const viewInlineScripts = uiSurfaces.filter((item) => item.type === "view-inline-script");
  const qwikComponents = uiSurfaces.filter((item) => item.type === "qwik-component");

  for (const entry of spaEntries) {
    const content = readFile(entry.path);
    if (!content) continue;

    for (const shell of spaAppShells) {
      const importCandidates = [
        `./${basenameWithoutExt(shell.relPath)}`,
        `./${stripPrefix(shell.relPath, "frontend/src/").replace(/\.(tsx|ts|jsx|js)$/i, "")}`,
        `./${stripPrefix(shell.relPath, "src/").replace(/\.(tsx|ts|jsx|js)$/i, "")}`,
      ];

      if (importCandidates.some((candidate) => content.includes(candidate)) || content.includes("App")) {
        edges.push({
          type: "ui_entry_uses_app_shell",
          from: entry.relPath,
          to: shell.relPath,
          evidence: ["spa_import"],
        });
      }
    }
  }

  for (const view of viewInlineScripts) {
    edges.push({
      type: "ui_view_has_inline_script",
      from: view.relPath,
      to: view.relPath,
      evidence: ["inline_script"],
    });
  }

  for (const view of viewSurfaces) {
    const content = readFile(view.path);
    if (!content) continue;

    const localScriptRe = /<script[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = localScriptRe.exec(content)) !== null) {
      const resolved = normalizeViewScriptPath(match[1], scriptPaths);
      if (!resolved) continue;
      edges.push({
        type: "ui_view_loads_script",
        from: view.relPath,
        to: resolved,
        evidence: ["script_src"],
      });
    }
  }

  for (const file of fileCatalog) {
    if (!isUiLikeFile(file.relPath)) continue;

    const content = readFile(file.path);
    if (!content) continue;

    const evidence = [];
    if (/\bhttpClient\s*\(/.test(content)) evidence.push("httpClient");
    if (/\bfetch\s*\(/.test(content)) evidence.push("fetch");
    if (/\baxios\.(get|post|put|patch|delete|request)\s*\(/.test(content)) evidence.push("axios");
    if (/Route::(get|post|put|patch|delete)\s*\(/.test(content)) evidence.push("route_helper");

    if (evidence.length === 0) continue;

    edges.push({
      type: "ui_uses_http_client",
      from: file.relPath,
      to: null,
      evidence,
    });
  }

  for (const component of qwikComponents) {
    const content = readFile(component.path);
    if (!content) continue;

    if (/\bfetch\s*\(\s*_?remoteUrl\b|\bfetch\s*\(\s*remote\.url\b|\bnew\s+URL\s*\(\s*remoteUrl\b|\bnew\s+URL\s*\(\s*url\b/.test(content)) {
      edges.push({
        type: "ui_loads_remote_mfe",
        from: component.relPath,
        to: null,
        evidence: ["remote_fetch"],
      });
    }
  }

  for (const file of fileCatalog) {
    if (!/Controllers\/.+Controller\.cs$/i.test(file.relPath)) continue;

    const content = readFile(file.path);
    if (!content) continue;

    const controllerName = file.relPath.split("/").pop().replace(/Controller\.cs$/i, "");
    const actions = extractControllerActions(content);

    for (const action of actions) {
      const explicitViewRe = /return\s+(?:PartialView|View)\(\s*"(?:(?:~\/)?Views\/)?([^"()]+?)(?:\.cshtml)?"/g;
      let match;

      while ((match = explicitViewRe.exec(action.body)) !== null) {
        const target = normalizeMvcViewPath(match[1]);
        const resolved = findMatchingView(target, viewPaths);
        if (!resolved) continue;
        edges.push({
          type: "controller_action_renders_view",
          from: `${file.relPath}#${action.name}`,
          to: resolved,
          evidence: ["explicit_view"],
        });
      }

      const implicitViewRe = /return\s+View\(\s*\)/g;
      if (implicitViewRe.test(action.body)) {
        const resolved = findImplicitControllerView(controllerName, viewPaths, action.name);
        if (resolved) {
          edges.push({
            type: "controller_action_renders_view",
            from: `${file.relPath}#${action.name}`,
            to: resolved,
            evidence: ["implicit_view"],
          });
        }
      }

      const actionCalls = calls.filter((item) => item.fromFile === file.path && item.callerName === action.name);
      for (const call of actionCalls.slice(0, 12)) {
        const targets = symbolIndex.get(call.calleeName) || [];
        for (const target of targets.slice(0, 3)) {
          edges.push({
            type: "controller_action_calls",
            from: `${file.relPath}#${action.name}`,
            to: `${target.relPath}#${target.name}`,
            evidence: ["call_graph"],
          });
        }
      }
    }
  }

  return dedupeEdges(edges);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function basenameWithoutExt(relPath) {
  return relPath.split("/").pop().replace(/\.[^.]+$/, "");
}

function stripPrefix(value, prefix) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function isUiLikeFile(relPath) {
  return /(^|\/)(pages|app|components|frontend\/src|public|Views|views|templates|services|common\/services)\//i.test(relPath) ||
    /\.(tsx|ts|jsx|js|cshtml|ejs|pug|hbs|mustache|twig|jsp|jspx|ftl|vm)$/i.test(relPath);
}

function normalizeMvcViewPath(value) {
  const cleaned = value.replace(/^~\//, "").replace(/^Views\//i, "").replace(/\.cshtml$/i, "");
  return cleaned.split("\\").join("/");
}

function findMatchingView(target, viewPaths) {
  const candidates = [
    `TowerTravel.Admin.WebApp/Views/${target}.cshtml`,
    `Views/${target}.cshtml`,
    target.endsWith(".cshtml") ? target : `${target}.cshtml`,
  ];

  for (const candidate of candidates) {
    const match = [...viewPaths].find((item) => item.endsWith(candidate));
    if (match) return match;
  }

  return null;
}

function findImplicitControllerView(controllerName, viewPaths, actionName = "Index") {
  const candidate = [...viewPaths].find((item) =>
    item.endsWith(`/Views/${controllerName}/${actionName}.cshtml`) ||
    item.endsWith(`/${controllerName}/${actionName}.cshtml`) ||
    (actionName === "Index" &&
      (item.endsWith(`/Views/${controllerName}/Index.cshtml`) || item.endsWith(`/${controllerName}/Index.cshtml`)))
  );
  return candidate || null;
}

function normalizeViewScriptPath(src, scriptPaths) {
  if (!src || /^https?:\/\//i.test(src)) return null;
  const cleaned = src
    .replace(/^~\//, "")
    .replace(/^\//, "")
    .replace(/\?.*$/, "");

  const direct = [...scriptPaths].find((item) => item.endsWith(cleaned));
  if (direct) return direct;

  if (!cleaned.startsWith("wwwroot/")) {
    const prefixed = [...scriptPaths].find((item) => item.endsWith(`wwwroot/${cleaned}`));
    if (prefixed) return prefixed;
  }

  return null;
}

function extractControllerActions(content) {
  const actions = [];
  const actionRe = /^\s*(?:\[[^\]]+\]\s*)*(?:public\s+)(?:async\s+)?(?:Task(?:<[^>]+>)?|ActionResult(?:<[^>]+>)?|IActionResult)\s+([A-Za-z_][\w]*)\s*\([^)]*\)\s*\{/gm;
  let match;

  while ((match = actionRe.exec(content)) !== null) {
    const start = match.index;
    let depth = 0;
    let opened = false;
    let end = start;

    for (let i = start; i < content.length; i++) {
      const ch = content[i];
      if (ch === "{") {
        depth++;
        opened = true;
      } else if (ch === "}") {
        depth--;
      }
      if (opened && depth === 0) {
        end = i + 1;
        break;
      }
    }

    actions.push({ name: match[1], body: content.slice(start, end) });
  }

  return actions;
}

function buildSymbolIndex(symbols, fileCatalog) {
  const relByPath = new Map(fileCatalog.map((file) => [file.path, file.relPath]));
  const index = new Map();
  for (const symbol of symbols) {
    const bucket = index.get(symbol.name) || [];
    bucket.push({
      ...symbol,
      relPath: relByPath.get(symbol.filePath) || symbol.filePath,
    });
    index.set(symbol.name, bucket);
  }
  return index;
}

function dedupeEdges(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.from}:${item.to ?? ""}:${item.evidence.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
