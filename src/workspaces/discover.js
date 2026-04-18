import fs from "fs";
import path from "path";
import { scanFilesystem } from "../scanners/filesystem.js";
import { detectFrameworks } from "../frameworks/detector.js";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  ".cache",
  ".turbo",
  "vendor",
  ".venv",
  "venv",
  "target",
  "bin",
  "obj",
]);

const REPO_MARKERS = [
  "package.json",
  "composer.json",
  "go.mod",
  "manage.py",
  "requirements.txt",
  "pyproject.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
];

export function discoverWorkspace(rootDir, options = {}) {
  const maxRepos = options.maxRepos ?? 30;
  const repoDirs = findRepoDirs(rootDir, maxRepos);
  const repos = repoDirs.map((repoDir) => analyzeRepo(repoDir));

  return {
    rootDir,
    repoCount: repos.length,
    repos,
    connections: findSharedFrameworkConnections(repos),
  };
}

function findRepoDirs(rootDir, maxRepos) {
  const results = [];
  const seen = new Set();

  function walk(dir, depth = 0) {
    if (results.length >= maxRepos) return;
    if (depth > 3) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
    const hasGit = entries.some((entry) => entry.isDirectory() && entry.name === ".git");
    const hasMarker = REPO_MARKERS.some((marker) => files.has(marker));

    if ((hasGit || hasMarker) && dir !== rootDir) {
      if (!seen.has(dir)) {
        results.push(dir);
        seen.add(dir);
      }
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") && entry.name !== ".config") continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  }

  walk(rootDir, 0);
  return results.sort((a, b) => a.localeCompare(b));
}

function analyzeRepo(repoDir) {
  const fileCatalog = scanFilesystem(repoDir, { maxFiles: 3000 });
  const frameworks = detectFrameworks(fileCatalog);

  return {
    root: repoDir,
    name: path.basename(repoDir),
    files: fileCatalog.length,
    frameworks,
    apps: detectApps(repoDir, fileCatalog, frameworks),
  };
}

function detectApps(repoDir, fileCatalog, frameworks) {
  const apps = [];

  if (fileCatalog.some((file) => /Program\.cs$/i.test(file.relPath))) {
    apps.push({
      type: "dotnet-app",
      name: path.basename(repoDir),
      entrypoints: fileCatalog.filter((file) => /Program\.cs$/i.test(file.relPath)).map((file) => file.relPath),
    });
  }

  if (fileCatalog.some((file) => /next\.config\./i.test(file.relPath) || /^pages\//.test(file.relPath) || /^app\//.test(file.relPath))) {
    apps.push({
      type: "frontend-next",
      name: path.basename(repoDir),
      entrypoints: fileCatalog
        .filter((file) => /^pages\//.test(file.relPath) || /^app\//.test(file.relPath) || /middleware\.(ts|js)$/.test(file.relPath))
        .slice(0, 20)
        .map((file) => file.relPath),
    });
  }

  if (fileCatalog.some((file) => /server\.(js|ts)$|app\.(js|ts)$|main\.go$|main\.py$|index\.php$/i.test(file.relPath))) {
    apps.push({
      type: "runtime-entry",
      name: path.basename(repoDir),
      entrypoints: fileCatalog
        .filter((file) => /server\.(js|ts)$|app\.(js|ts)$|main\.go$|main\.py$|index\.php$/i.test(file.relPath))
        .slice(0, 20)
        .map((file) => file.relPath),
    });
  }

  if (frameworks.some((item) => item.id === "aspnet-core") && fileCatalog.some((file) => /^Views\//.test(file.relPath) || /\.cshtml$/i.test(file.relPath))) {
    apps.push({
      type: "server-rendered-ui",
      name: `${path.basename(repoDir)}-mvc`,
      entrypoints: fileCatalog
        .filter((file) => /^Views\//.test(file.relPath) || /\.cshtml$/i.test(file.relPath))
        .slice(0, 20)
        .map((file) => file.relPath),
    });
  }

  if (fileCatalog.some((file) => /^public\//.test(file.relPath) || /index\.html$/i.test(file.relPath))) {
    apps.push({
      type: "static-frontend",
      name: `${path.basename(repoDir)}-ui`,
      entrypoints: fileCatalog
        .filter((file) => /^public\//.test(file.relPath) || /index\.html$/i.test(file.relPath))
        .slice(0, 20)
        .map((file) => file.relPath),
    });
  }

  return dedupeApps(apps);
}

function findSharedFrameworkConnections(repos) {
  const byFramework = new Map();

  for (const repo of repos) {
    for (const framework of repo.frameworks) {
      const items = byFramework.get(framework.id) || [];
      items.push({
        name: repo.name,
        root: repo.root,
      });
      byFramework.set(framework.id, items);
    }
  }

  return [...byFramework.entries()]
    .map(([framework, repoItems]) => {
      const repos = dedupeRepoItems(repoItems);
      return {
      type: "shared_framework",
      framework,
      repos,
      };
    })
    .filter((connection) => connection.repos.length > 1)
    .sort((a, b) => a.framework.localeCompare(b.framework));
}

function dedupeApps(apps) {
  const seen = new Set();
  return apps.filter((app) => {
    const key = `${app.type}:${app.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeRepoItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.name}:${item.root}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
