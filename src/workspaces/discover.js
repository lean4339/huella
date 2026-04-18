import fs from "fs";
import path from "path";
import { scanFilesystem } from "../scanners/filesystem.js";
import { detectFrameworks } from "../frameworks/detector.js";
import { detectEndpoints } from "../endpoints/detector.js";

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
  const effectiveRepoDirs = repoDirs.length > 0 ? repoDirs : inferRootRepo(rootDir);
  const repos = effectiveRepoDirs.map((repoDir) => analyzeRepo(repoDir));
  const connections = [
    ...findSharedFrameworkConnections(repos),
    ...findConfigConnections(repos),
    ...findSharedEndpointTargets(repos),
  ];

  return {
    rootDir,
    repoCount: repos.length,
    repos,
    connections,
  };
}

function inferRootRepo(rootDir) {
  const fileCatalog = scanFilesystem(rootDir, { maxFiles: 3000 });
  const hasProjectMarkers = fileCatalog.some((file) =>
    /(^|\/)(package\.json|composer\.json|go\.mod|manage\.py|requirements\.txt|pyproject\.toml|pom\.xml|build\.gradle|build\.gradle\.kts|.*\.csproj|Program\.cs|app\.py)$/i.test(file.relPath)
  );

  return hasProjectMarkers ? [rootDir] : [];
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
  const apps = detectApps(repoDir, fileCatalog, frameworks);

  return {
    root: repoDir,
    name: path.basename(repoDir),
    files: fileCatalog.length,
    frameworks,
    apps,
    ports: dedupeNumbers(apps.flatMap((app) => app.ports || [])),
    endpoints: detectEndpoints(fileCatalog),
    configTargets: detectConfigTargets(fileCatalog),
    outboundTargets: detectOutboundTargets(fileCatalog),
  };
}

function detectApps(repoDir, fileCatalog, frameworks) {
  const apps = [];

  apps.push(...detectDotnetApps(repoDir, fileCatalog));

  if (fileCatalog.some((file) => /next\.config\./i.test(file.relPath) || /^pages\//.test(file.relPath) || /^app\//.test(file.relPath))) {
    const entrypoints = fileCatalog
      .filter((file) => /^pages\//.test(file.relPath) || /^app\//.test(file.relPath) || /middleware\.(ts|js)$/.test(file.relPath))
      .slice(0, 20)
      .map((file) => file.relPath);
    apps.push({
      type: "frontend-next",
      name: path.basename(repoDir),
      entrypoints,
      ports: detectPortsForEntryPoints(fileCatalog, entrypoints),
    });
  }

  apps.push(...detectRuntimeApps(repoDir, fileCatalog));

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

function detectDotnetApps(repoDir, fileCatalog) {
  const programFiles = fileCatalog.filter((file) => /Program\.cs$/i.test(file.relPath));
  const groups = new Map();

  for (const file of programFiles) {
    const baseDir = path.dirname(file.relPath);
    const key = findAppRoot(baseDir, ["apps", "src", "WebAPI"]) || baseDir;
    const bucket = groups.get(key) || [];
    bucket.push(file.relPath);
    groups.set(key, bucket);
  }

  return [...groups.entries()].map(([root, entrypoints]) => ({
    type: "dotnet-app",
    name: appNameFromRoot(repoDir, root),
    entrypoints,
    ports: detectPortsForEntryPoints(fileCatalog, entrypoints),
  }));
}

function detectRuntimeApps(repoDir, fileCatalog) {
  const runtimeFiles = fileCatalog.filter((file) =>
    /source\/server\/index\.(js|ts)$|server\.(js|ts)$|app\.(js|ts|py)$|main\.go$|main\.py$|index\.php$/i.test(file.relPath)
  );
  const groups = new Map();

  for (const file of runtimeFiles) {
    const baseDir = path.dirname(file.relPath);
    const key = findAppRoot(baseDir, ["apps", "services", "service", "src", "api"]) || baseDir;
    const bucket = groups.get(key) || [];
    bucket.push(file.relPath);
    groups.set(key, bucket);
  }

  return [...groups.entries()].map(([root, entrypoints]) => ({
    type: "runtime-entry",
    name: appNameFromRoot(repoDir, root),
    entrypoints: entrypoints.slice(0, 20),
    ports: detectPortsForEntryPoints(fileCatalog, entrypoints),
  }));
}

function findAppRoot(relDir, anchors) {
  const parts = relDir.split(path.sep).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (anchors.includes(parts[i]) && parts[i + 1]) {
      return path.join(...parts.slice(0, i + 2));
    }
  }
  return null;
}

function appNameFromRoot(repoDir, root) {
  const parts = root.split(path.sep).filter(Boolean);
  return parts[parts.length - 1] || path.basename(repoDir);
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

function findConfigConnections(repos) {
  const connections = [];
  const repoTokens = buildDistinctRepoTokens(repos);

  for (const sourceRepo of repos) {
    const repoTargets = [...(sourceRepo.configTargets || []), ...(sourceRepo.outboundTargets || [])];
    for (const target of repoTargets) {
      const candidates = repos.filter((repo) =>
        repo.root !== sourceRepo.root && matchesRepoTarget(repo, target, repoTokens.get(repo.root) || [])
      );

      for (const candidate of candidates) {
        const kind = classifyConfigConnection(target, candidate);
        connections.push({
          type: "config_target",
          kind,
          from: { name: sourceRepo.name, root: sourceRepo.root },
          to: { name: candidate.name, root: candidate.root },
          variable: target.variable,
          value: target.value,
          source: target.file,
        });
      }
    }
  }

  return dedupeConnections(connections);
}

function findSharedEndpointTargets(repos) {
  const serviceConnections = findConfigConnections(repos).filter((item) => item.kind === "service_target");
  const byTarget = new Map();

  for (const connection of serviceConnections) {
    const bucket = byTarget.get(connection.to.root) || [];
    bucket.push(connection);
    byTarget.set(connection.to.root, bucket);
  }

  const shared = [];
  for (const [targetRoot, connections] of byTarget.entries()) {
    const sourceRoots = [...new Set(connections.map((item) => item.from.root))];
    if (sourceRoots.length < 2) continue;

    const targetRepo = repos.find((repo) => repo.root === targetRoot);
    if (!targetRepo) continue;

    shared.push({
      type: "shared_endpoint_target",
      target: { name: targetRepo.name, root: targetRepo.root },
      consumers: dedupeRepoItems(connections.map((item) => item.from)),
      endpointCount: targetRepo.endpoints.length,
      endpointSample: targetRepo.endpoints.slice(0, 10).map((item) => item.key),
    });
  }

  return shared.sort((a, b) => a.target.name.localeCompare(b.target.name));
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

function dedupeConnections(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.from?.root ?? ""}:${item.to?.root ?? ""}:${item.variable ?? ""}:${item.value ?? ""}:${item.framework ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function detectConfigTargets(fileCatalog) {
  const targets = [];

  for (const file of fileCatalog) {
    if (!isConfigLikeFile(file.relPath)) continue;
    const content = readFile(file.path);
    if (!content) continue;

    targets.push(...extractTargetsFromContent(file.relPath, content));
  }

  return dedupeTargets(targets);
}

function detectOutboundTargets(fileCatalog) {
  const targets = [];

  for (const file of fileCatalog) {
    if (!/\.(cs|ts|js|py|php)$/i.test(file.relPath)) continue;
    const content = readFile(file.path);
    if (!content) continue;

    const directUrlRe = /\b(?:HttpRequestMessage|new\s+Uri|SendAsync|GetAsync|PostAsync|PutAsync|PatchAsync|DeleteAsync)\b[\s\S]{0,120}?["'](https?:\/\/[^"']+|http:\/\/localhost:\d+[^"']*)["']/g;
    let match;
    while ((match = directUrlRe.exec(content)) !== null) {
      targets.push({
        file: file.relPath,
        variable: "code_target",
        value: normalizeTargetValue(match[1]),
      });
    }

    const configRefRe = /\bGetSection\("([^"]+)"\)\["([^"]+)"\]|\bConfiguration\["([^"]+)"\]|\bGetEnvironmentVariable\("([^"]+)"\)/g;
    while ((match = configRefRe.exec(content)) !== null) {
      const variable = match[2] || match[3] || match[4];
      if (!variable) continue;
      if (!/(API|URL|Url|BaseAddress|BaseUrl|Endpoint|Uri|URI|Host|Origin|TowerURL|ProductTowerURL)/.test(variable)) continue;
      targets.push({
        file: file.relPath,
        variable,
        value: "",
      });
    }
  }

  return dedupeTargets(targets);
}

function isConfigLikeFile(relPath) {
  return /^\.env(\..+)?$/i.test(relPath) ||
    /(^|\/)\.env(\..+)?$/i.test(relPath) ||
    /(^|\/)(package\.json|appsettings(\.[^.]+)?\.json|docker-compose\.ya?ml|compose\.ya?ml|next\.config\.[^.]+|vite\.config\.[^.]+|nuxt\.config\.[^.]+)$/i.test(relPath);
}

function extractTargetsFromContent(relPath, content) {
  const targets = [];
  const envRe = /([A-Z][A-Z0-9_]*(?:API|BASE|BACKEND|SERVICE|SERVER|URL|HOST|ORIGIN)[A-Z0-9_]*)\s*[:=]\s*["']?([^"'\n]+)["']?/g;
  let match;

  while ((match = envRe.exec(content)) !== null) {
    const value = match[2].trim();
    if (!looksLikeTarget(value)) continue;
    targets.push({
      file: relPath,
      variable: match[1],
      value: normalizeTargetValue(value),
    });
  }

  const jsonUrlRe = /"(?:apiUrl|baseUrl|backendUrl|serviceUrl|serverUrl|origin|host)"\s*:\s*"([^"]+)"/gi;
  while ((match = jsonUrlRe.exec(content)) !== null) {
    const value = match[1].trim();
    if (!looksLikeTarget(value)) continue;
    targets.push({
      file: relPath,
      variable: "json_target",
      value: normalizeTargetValue(value),
    });
  }

  const genericJsonRe = /"([A-Za-z][A-Za-z0-9_:-]*(?:URL|Url|BaseAddress|BaseUrl|Address|Endpoint|Uri|URI|Host|Origin))"\s*:\s*"([^"]+)"/g;
  while ((match = genericJsonRe.exec(content)) !== null) {
    const value = match[2].trim();
    if (!looksLikeTarget(value)) continue;
    targets.push({
      file: relPath,
      variable: match[1],
      value: normalizeTargetValue(value),
    });
  }

  return targets;
}

function looksLikeTarget(value) {
  return /^https?:\/\//i.test(value) ||
    /^localhost:\d+/i.test(value) ||
    /^127\.0\.0\.1:\d+/i.test(value) ||
    /^\/api(\/|$)/i.test(value);
}

function normalizeTargetValue(value) {
  if (/^(localhost|127\.0\.0\.1):\d+/i.test(value)) {
    return `http://${value}`;
  }
  return value.replace(/\/+$/, "");
}

function classifyConfigConnection(target, candidate = null) {
  const value = String(target.value || "");
  const variable = String(target.variable || "");
  const targetPort = extractPort(value);

  if (/^\/api(\/|$)/i.test(value)) {
    return "service_target";
  }

  if (/\/(login|signin|sign-in|dashboard|admin)(\/|$)/i.test(value)) {
    return "ui_link";
  }

  if (/\b(admin|dashboard|portal|backoffice|frontend|front|web|site|auth)\b/i.test(variable)) {
    return "ui_link";
  }

  if (/\b(api|backend|service|server|gateway|graphql)\b/i.test(variable)) {
    return "service_target";
  }

  if (targetPort && candidate?.ports?.includes(targetPort)) {
    return "service_target";
  }

  if (/^https?:\/\//i.test(value) || /^localhost:\d+/i.test(value) || /^127\.0\.0\.1:\d+/i.test(value)) {
    return "external_link";
  }

  return "config_target";
}

function matchesRepoTarget(repo, target, haystack) {
  const normalizedValue = target.value.toLowerCase();
  const normalizedVariable = normalizeToken(target.variable);
  const targetPort = extractPort(target.value);

  if (/^\/api(\/|$)/i.test(target.value)) {
    return repo.frameworks.some((item) => ["express", "fastapi", "aspnet-core", "nestjs", "flask", "django", "spring-boot", "laravel", "symfony"].includes(item.id));
  }

  if (targetPort && repo.ports?.includes(targetPort)) {
    return true;
  }

  return haystack.some((needle) =>
    needle.length >= 4 && (
      normalizedValue.includes(needle) ||
      normalizedVariable.includes(needle)
    )
  );
}

function buildRepoNeedles(repo) {
  const values = new Set();
  for (const token of tokenizeValue(repo.name)) {
    values.add(token);
  }

  for (const segment of repo.root.split(path.sep)) {
    for (const token of tokenizeValue(segment)) {
      values.add(token);
    }
  }

  for (const app of repo.apps) {
    for (const token of tokenizeValue(app.name)) {
      values.add(token);
    }
    for (const entrypoint of app.entrypoints ?? []) {
      for (const token of tokenizeValue(path.basename(entrypoint, path.extname(entrypoint)))) {
        values.add(token);
      }
    }
  }

  return [...values].filter(Boolean);
}

function buildDistinctRepoTokens(repos) {
  const frequency = new Map();
  const byRepo = new Map();

  for (const repo of repos) {
    const tokens = buildRepoNeedles(repo);
    byRepo.set(repo.root, tokens);
    for (const token of new Set(tokens)) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }
  }

  const distinct = new Map();
  for (const repo of repos) {
    const tokens = (byRepo.get(repo.root) || [])
      .filter((token) => token.length >= 4)
      .filter((token) => !GENERIC_REPO_TOKENS.has(token))
      .filter((token) => (frequency.get(token) || 0) === 1);
    distinct.set(repo.root, tokens);
  }

  return distinct;
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokenizeValue(value) {
  const raw = String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/g)
    .map((item) => item.toLowerCase())
    .filter(Boolean);

  const tokens = new Set(raw);
  const normalized = normalizeToken(value);
  if (normalized) tokens.add(normalized);

  return [...tokens];
}

const GENERIC_REPO_TOKENS = new Set([
  "repo",
  "app",
  "apps",
  "src",
  "source",
  "frontend",
  "backend",
  "service",
  "services",
  "server",
  "client",
  "web",
  "www",
  "main",
  "index",
  "tower",
  "towertravel",
]);

function dedupeTargets(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.file}:${item.variable}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function detectPortsForEntryPoints(fileCatalog, entrypoints) {
  const relevantFiles = fileCatalog.filter((file) =>
    entrypoints.includes(file.relPath) ||
    /launchSettings\.json$/i.test(file.relPath) ||
    /swagger\.ya?ml$/i.test(file.relPath) ||
    /config\/index\.(ts|js)$/i.test(file.relPath) ||
    /^appsettings(\.[^.]+)?\.json$/i.test(path.basename(file.relPath))
  );

  const ports = [];
  for (const file of relevantFiles) {
    const content = readFile(file.path);
    if (!content) continue;

    const patterns = [
      /\bhttp_port\s*[:=]\s*(\d{2,5})/gi,
      /\blisten\s*\(\s*(\d{2,5})/gi,
      /\blocalhost:(\d{2,5})/gi,
      /\bapplicationUrl\b[^"\n]*https?:\/\/[^:\s"]+:(\d{2,5})/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        ports.push(Number(match[1]));
      }
    }
  }

  return dedupeNumbers(ports).filter((port) => port >= 80 && port <= 65535);
}

function extractPort(value) {
  const match = String(value || "").match(/:(\d{2,5})(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

function dedupeNumbers(items) {
  return [...new Set(items.filter((item) => Number.isFinite(item)))];
}
