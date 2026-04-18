import fs from "fs";

export function detectUiEdges(fileCatalog, uiSurfaces) {
  const edges = [];
  const byRelPath = new Map(fileCatalog.map((file) => [file.relPath, file]));

  const spaEntries = uiSurfaces.filter((item) => item.type === "spa-entry");
  const spaAppShells = uiSurfaces.filter((item) => item.type === "spa-app-shell");
  const viewInlineScripts = uiSurfaces.filter((item) => item.type === "view-inline-script");

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

  for (const file of fileCatalog) {
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

function dedupeEdges(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.from}:${item.to ?? ""}:${item.evidence.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
