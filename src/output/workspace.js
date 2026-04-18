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
    lines.push(`    config targets: ${repo.configTargets?.length ?? 0}`);
  }

  if (result.connections.length > 0) {
    lines.push("");
    lines.push("Connections");
    for (const connection of result.connections) {
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
    for (const pathItem of result.networkPaths.slice(0, 20)) {
      if (pathItem.type === "local_flow") {
        lines.push(`  ${pathItem.fromRepo}: ${pathItem.from} -> ${pathItem.route}`);
        lines.push(`    endpoint: ${pathItem.endpoint}`);
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
