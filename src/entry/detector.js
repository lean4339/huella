export function detectEntrySurfaces({
  apps = [],
  endpoints = [],
  rpcSurfaces = [],
  uiSurfaces = [],
  eventEdges = [],
} = {}) {
  const surfaces = [];

  for (const app of apps) {
    for (const entrypoint of app.entrypoints || []) {
      surfaces.push({
        type: "runtime-entry",
        key: `${app.type}:${entrypoint}`,
        path: entrypoint,
        score: 70,
        source: "app",
        appType: app.type,
      });
    }
  }

  for (const endpoint of endpoints) {
    surfaces.push({
      type: "http-entry",
      key: endpoint.key,
      path: endpoint.file,
      score: 90,
      source: endpoint.type,
      method: endpoint.method,
      route: endpoint.route,
      action: endpoint.action,
    });
  }

  for (const rpc of rpcSurfaces) {
    surfaces.push({
      type: "rpc-entry",
      key: rpc.key,
      path: rpc.apiFile,
      score: 95,
      source: rpc.type,
      mod: rpc.mod,
      fun: rpc.fun,
      handlerFile: rpc.handlerFile,
      handlerName: rpc.handlerName,
    });
  }

  for (const ui of uiSurfaces) {
    if (!isUiEntryType(ui.type)) continue;
    surfaces.push({
      type: "ui-entry",
      key: `${ui.type}:${ui.relPath}`,
      path: ui.relPath,
      score: 60 + (ui.score || 0),
      source: ui.type,
    });
  }

  for (const edge of eventEdges) {
    if (edge.via !== "consume_event") continue;
    surfaces.push({
      type: "event-entry",
      key: `${edge.from}:${edge.to}`,
      path: edge.from,
      score: 80,
      source: edge.via,
      target: edge.to,
    });
  }

  return dedupeEntrySurfaces(surfaces).sort((a, b) =>
    b.score - a.score ||
    a.type.localeCompare(b.type) ||
    a.key.localeCompare(b.key)
  );
}

function isUiEntryType(type) {
  return [
    "next-page",
    "next-app-route",
    "spa-entry",
    "spa-page",
    "static-entry",
    "razor-view",
    "template-view",
    "qwik-route",
  ].includes(type);
}

function dedupeEntrySurfaces(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
