import fs from "fs";
import path from "path";

export function detectRpcSurfaces(fileCatalog, symbols = []) {
  const relMap = new Map(fileCatalog.map((file) => [normalizeRel(file.relPath), file]));
  const pathToRel = new Map(fileCatalog.map((file) => [normalizeRel(file.path), normalizeRel(file.relPath)]));

  const repoSymbolsByRel = new Map();
  for (const symbol of symbols) {
    const key = pathToRel.get(normalizeRel(symbol.filePath)) || normalizeRel(symbol.filePath);
    const bucket = repoSymbolsByRel.get(key) || [];
    bucket.push(symbol);
    repoSymbolsByRel.set(key, bucket);
  }

  const surfaces = [];

  for (const file of fileCatalog) {
    if (!/\/api\.(ts|js|mts|mjs|cts|cjs)$/i.test(file.relPath)) continue;
    const content = safeRead(file.path);
    if (!content) continue;

    const mod = inferRpcModule(file.relPath);
    if (!mod) continue;

    const exportRe = /export\s*{([\s\S]*?)}\s*from\s*["'`]([^"'`]+)["'`]/g;
    let match;
    while ((match = exportRe.exec(content)) !== null) {
      const names = parseExportNames(match[1]);
      const sourceRef = match[2];
      const resolved = resolveSourceModule(file.relPath, sourceRef, relMap);

      for (const item of names) {
        const handlerRel = resolved?.relPath || file.relPath;
        const handlerSymbol = findSymbolInFile(repoSymbolsByRel, handlerRel, item.localName);

        surfaces.push({
          type: "rpc-surface",
          mod,
          fun: item.exportedName,
          key: `${mod}.${item.exportedName}`,
          apiFile: file.relPath,
          handlerFile: handlerRel,
          handlerName: item.localName,
          exportedName: item.exportedName,
          symbolKind: handlerSymbol?.kind || null,
        });
      }
    }
  }

  return dedupeRpcSurfaces(surfaces);
}

export function detectRpcFlows(rpcSurfaces, symbols, calls, fileCatalog = []) {
  const pathToRel = new Map(fileCatalog.map((file) => [normalizeRel(file.path), normalizeRel(file.relPath)]));
  const symbolsByName = new Map();
  for (const symbol of symbols) {
    const bucket = symbolsByName.get(symbol.name) || [];
    bucket.push(symbol);
    symbolsByName.set(symbol.name, bucket);
  }

  const flows = [];
  for (const surface of rpcSurfaces.slice(0, 400)) {
    const entrySymbol = (symbolsByName.get(surface.handlerName) || []).find((item) =>
      (pathToRel.get(normalizeRel(item.filePath)) || normalizeRel(item.filePath)) === normalizeRel(surface.handlerFile)
    );
    if (!entrySymbol) continue;

    const steps = [`${surface.key}`, `${surface.handlerFile}#${surface.handlerName}`];
    const visited = new Set([`${surface.handlerFile}#${surface.handlerName}`]);
    let frontier = [{ file: entrySymbol.filePath, name: surface.handlerName }];

    for (let depth = 0; depth < 3; depth++) {
      const next = [];
      for (const node of frontier) {
        const outgoing = calls
          .filter((item) => item.fromFile === node.file && item.callerName === node.name)
          .slice(0, 8);

        for (const edge of outgoing) {
          const target = (symbolsByName.get(edge.calleeName) || [])[0];
          if (!target) continue;
          const relTarget = pathToRel.get(normalizeRel(target.filePath)) || normalizeRel(target.filePath);
          const key = `${relTarget}#${target.name}`;
          if (visited.has(key)) continue;
          visited.add(key);
          steps.push(key);
          next.push({ file: target.filePath, name: target.name });
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }

    flows.push({
      key: surface.key,
      handlerFile: surface.handlerFile,
      handlerName: surface.handlerName,
      steps,
    });
  }

  return flows;
}

function inferRpcModule(relPath) {
  const normalized = normalizeRel(relPath);
  const markers = ["source/apps/", "src/apps/", "apps/"];
  for (const marker of markers) {
    const idx = normalized.indexOf(marker);
    if (idx !== -1) {
      const after = normalized.slice(idx + marker.length);
      return normalizeRel(path.posix.dirname(after));
    }
  }

  const fallbackMarkers = ["source/", "src/"];
  for (const marker of fallbackMarkers) {
    const idx = normalized.indexOf(marker);
    if (idx !== -1) {
      const after = normalized.slice(idx + marker.length);
      return normalizeRel(path.posix.dirname(after));
    }
  }

  return normalizeRel(path.posix.dirname(normalized));
}

function parseExportNames(block) {
  return block
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/g, "").trim())
    .join(" ")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const aliasMatch = item.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (aliasMatch) {
        return { localName: aliasMatch[1], exportedName: aliasMatch[2] };
      }
      return { localName: item, exportedName: item };
    });
}

function resolveSourceModule(apiRelPath, sourceRef, relMap) {
  if (!sourceRef.startsWith(".")) return null;
  const baseDir = path.posix.dirname(normalizeRel(apiRelPath));
  const resolvedBase = normalizeRel(path.posix.join(baseDir, sourceRef));
  const candidates = [
    resolvedBase,
    `${resolvedBase}.ts`,
    `${resolvedBase}.js`,
    `${resolvedBase}.mts`,
    `${resolvedBase}.mjs`,
    `${resolvedBase}/index.ts`,
    `${resolvedBase}/index.js`,
    `${resolvedBase}/handler.ts`,
    `${resolvedBase}/handler.js`,
    `${resolvedBase}/index.mts`,
    `${resolvedBase}/index.mjs`,
  ];

  for (const candidate of candidates) {
    const file = relMap.get(normalizeRel(candidate));
    if (file) return file;
  }

  return null;
}

function findSymbolInFile(symbolsByRel, relPath, name) {
  return (symbolsByRel.get(normalizeRel(relPath)) || []).find((item) => item.name === name) || null;
}

function dedupeRpcSurfaces(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.key}:${item.handlerFile}:${item.handlerName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRel(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "");
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
