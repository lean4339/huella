import path from "path";

function formatPath(filePath, rootDir) {
  return path.relative(rootDir, filePath) || filePath;
}

export function formatWorkspaceHuman(result, graphMeta) {
  const lines = [];
  lines.push(`workspace: ${result.rootDir}`);
  lines.push(`repos: ${result.repoCount}`);

  if (graphMeta?.graphPath) {
    lines.push(`graph: ${graphMeta.graphPath}`);
  }

  if (result.repos.length === 0) {
    lines.push("");
    lines.push("No repositories discovered.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("Repositories");
  for (const repo of result.repos.slice(0, 20)) {
    lines.push(`  ${repo.name}`);
    lines.push(`    root: ${formatPath(repo.root, result.rootDir)}`);
    lines.push(`    files: ${repo.files}`);
    lines.push(`    frameworks: ${repo.frameworks.length > 0 ? repo.frameworks.map((item) => `${item.id}(${item.score})`).join(", ") : "none"}`);
    lines.push(`    apps: ${repo.apps.length}`);
    lines.push(`    endpoints: ${repo.endpoints?.length ?? 0}`);
    lines.push(`    rpc surfaces: ${repo.rpcSurfaces?.length ?? 0}`);
    lines.push(`    entry surfaces: ${repo.entrySurfaces?.length ?? 0}`);
    lines.push(`    config targets: ${repo.configTargets?.length ?? 0}`);
  }

  if (result.connections.length > 0) {
    lines.push("");
    lines.push("Connections");
    const prioritizedConnections = [...result.connections].sort(compareWorkspaceConnection);
    for (const connection of prioritizedConnections) {
      if (connection.type === "shared_framework") {
        lines.push(`  ${connection.type}: ${connection.framework}`);
        lines.push(`    repos: ${connection.repos.map((repo) => `${repo.name} [${formatPath(repo.root, result.rootDir)}]`).join(", ")}`);
        continue;
      }

      if (connection.type === "config_target") {
        lines.push(`  ${connection.kind ?? connection.type}: ${connection.from.name} -> ${connection.to.name}`);
        lines.push(`    via: ${connection.variable}=${connection.value}`);
        lines.push(`    source: ${connection.source}`);
        continue;
      }

      if (connection.type === "server_to_server") {
        lines.push(`  server_to_server: ${connection.from.name} -> ${connection.to.name}`);
        lines.push(`    via: ${connection.variable}=${connection.value || "<config>"}`);
        lines.push(`    source: ${connection.source}`);
        continue;
      }

      if (connection.type === "shared_endpoint_target") {
        lines.push(`  ${connection.type}: ${connection.target.name}`);
        lines.push(`    consumers: ${connection.consumers.map((repo) => `${repo.name} [${formatPath(repo.root, result.rootDir)}]`).join(", ")}`);
        lines.push(`    endpoints: ${connection.endpointCount}`);
        if (connection.endpointSample?.length) {
          lines.push(`    sample: ${connection.endpointSample.slice(0, 5).join(", ")}`);
        }
      }
    }
  }

  if (result.networkPaths?.length > 0) {
    lines.push("");
    lines.push("Network Paths");
    const prioritizedPaths = [...result.networkPaths].sort(compareNetworkPath);
    for (const pathItem of prioritizedPaths.slice(0, 20)) {
      if (pathItem.type === "local_flow") {
        lines.push(`  ${pathItem.fromRepo}: ${pathItem.from} -> ${pathItem.route}`);
        lines.push(`    endpoint: ${pathItem.endpoint}`);
        continue;
      }

      if (pathItem.type === "local_rpc_flow") {
        lines.push(`  ${pathItem.fromRepo}: ${pathItem.from} -> ${pathItem.rpc}`);
        lines.push(`    handler: ${pathItem.handler}`);
        lines.push(`    flow: ${pathItem.steps.join(" -> ")}`);
        continue;
      }

      if (pathItem.type === "repo_hop") {
        lines.push(`  ${pathItem.kind}: ${pathItem.fromRepo} -> ${pathItem.toRepo}`);
        lines.push(`    via: ${pathItem.via}`);
        lines.push(`    target endpoints: ${pathItem.endpointCount}`);
        if (pathItem.endpointSample?.length) {
          lines.push(`    sample: ${pathItem.endpointSample.join(", ")}`);
        }
        continue;
      }

      if (pathItem.type === "server_hop") {
        lines.push(`  server_to_server: ${pathItem.fromRepo} -> ${pathItem.toRepo}`);
        lines.push(`    via: ${pathItem.via}`);
        lines.push(`    source: ${pathItem.source}`);
        lines.push(`    target endpoints: ${pathItem.endpointCount}`);
        if (pathItem.endpointSample?.length) {
          lines.push(`    sample: ${pathItem.endpointSample.join(", ")}`);
        }
        continue;
      }

      if (pathItem.type === "event_flow") {
        lines.push(`  ${pathItem.repo}: ${pathItem.from} -> ${pathItem.to}`);
        lines.push(`    via: ${pathItem.via}`);
        continue;
      }

      if (pathItem.type === "entry_flow") {
        lines.push(`  ${pathItem.repo}: ${pathItem.entry}`);
        lines.push(`    flow: ${pathItem.steps.join(" -> ")}`);
      }
    }
  }

  return lines.join("\n");
}

function compareWorkspaceConnection(a, b) {
  const scoreA = scoreWorkspaceConnection(a);
  const scoreB = scoreWorkspaceConnection(b);
  if (scoreA !== scoreB) return scoreB - scoreA;
  return `${a.type}:${a.from?.name ?? ""}:${a.to?.name ?? ""}`.localeCompare(`${b.type}:${b.from?.name ?? ""}:${b.to?.name ?? ""}`);
}

function scoreWorkspaceConnection(connection) {
  if (connection.type === "shared_endpoint_target") return 100;
  if (connection.type === "server_to_server") return 95;
  if (connection.type === "config_target" && connection.kind === "service_target") return 90;
  if (connection.type === "shared_framework") return 70;
  if (connection.type === "config_target" && connection.kind === "ui_link") return 20;
  if (connection.type === "config_target" && connection.kind === "external_link") return 10;
  return 0;
}

function compareNetworkPath(a, b) {
  const scoreA = scoreNetworkPath(a);
  const scoreB = scoreNetworkPath(b);
  if (scoreA !== scoreB) return scoreB - scoreA;
  return `${a.type}:${a.repo ?? a.fromRepo ?? ""}:${a.entry ?? a.from ?? ""}`.localeCompare(
    `${b.type}:${b.repo ?? b.fromRepo ?? ""}:${b.entry ?? b.from ?? ""}`
  );
}

function scoreNetworkPath(pathItem) {
  switch (pathItem.type) {
    case "entry_flow":
      return 100;
    case "local_flow":
      return 95;
    case "local_rpc_flow":
      return 94;
    case "event_flow":
      return 90;
    case "server_hop":
      return 88;
    case "repo_hop":
      if (pathItem.kind === "service_target") return 85;
      if (pathItem.kind === "ui_link") return 20;
      if (pathItem.kind === "external_link") return 10;
      return 30;
    default:
      return 0;
  }
}

export function formatWorkspaceJson(result, graphMeta) {
  return {
    workspace: result.rootDir,
    repoCount: result.repoCount,
    graph: graphMeta ? { path: graphMeta.graphPath } : null,
    repos: result.repos,
    connections: result.connections,
    networkPaths: result.networkPaths,
  };
}
