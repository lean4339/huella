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
  }

  if (result.connections.length > 0) {
    lines.push("");
    lines.push("Connections");
    for (const connection of result.connections) {
      lines.push(`  ${connection.type}: ${connection.framework}`);
      lines.push(`    repos: ${connection.repos.map((repo) => `${repo.name} [${formatPath(repo.root, result.rootDir)}]`).join(", ")}`);
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
  };
}
