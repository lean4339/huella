import fs from "fs";
import path from "path";

export const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".java", ".cs", ".rb", ".php", ".rs",
]);

export const TEXT_EXTENSIONS = new Set([
  ".json", ".md", ".txt", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
  ".xml", ".html", ".htm", ".css", ".scss", ".sass", ".less", ".sql",
]);

export const CONFIG_FILENAMES = new Set([
  "package.json",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
]);

export const CONFIG_PREFIXES = [
  ".env",
  "next.config.",
  "vite.config.",
  "nuxt.config.",
];

export const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out",
  "coverage", "__pycache__", ".cache", ".turbo", "vendor",
  ".venv", "venv", "target", "bin", "obj",
]);

const LAYER_RULES = [
  { re: /\/(routes?|router|api|controllers?|endpoints?|views?|pages?|graphql|resolvers?)\b/i, layer: "entry", order: 1 },
  { re: /\/(handlers?|services?|use.?cases?|business|logic|core|domain|modules?|jobs?|tasks?|workers?|agents?)\b/i, layer: "service", order: 2 },
  { re: /\/(db|database|repositories?|repos?|models?|data|dal|store|queries|prisma|schema|mongo|sql|cache)\b/i, layer: "data", order: 3 },
];

function detectLayer(filePath) {
  for (const rule of LAYER_RULES) {
    if (rule.re.test(filePath)) return { layer: rule.layer, order: rule.order };
  }
  return { layer: "file", order: 0 };
}

function detectFileType(name, ext) {
  if (CONFIG_FILENAMES.has(name) || CONFIG_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return "config";
  }
  if (name === "local" || name === "development" || name === "test" || name === "production") {
    return "config";
  }
  if (SOURCE_EXTENSIONS.has(ext)) {
    return "source";
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return "text";
  }
  return "other";
}

export function scanFilesystem(rootDir, options = {}) {
  const maxFiles = options.maxFiles ?? 5000;
  const results = [];

  function walk(dir) {
    if (results.length >= maxFiles) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (entry.name.startsWith(".") && entry.name !== ".env" && !entry.name.startsWith(".env.")) {
        if (entry.isDirectory()) continue;
      }
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const relPath = path.relative(rootDir, absPath);
      const ext = path.extname(entry.name);
      const stats = fs.statSync(absPath);
      const { layer, order } = detectLayer(absPath);
      const type = detectFileType(entry.name, ext);

      if (type === "other") continue;

      results.push({
        path: absPath,
        relPath,
        name: entry.name,
        ext,
        type,
        layer,
        order,
        size: stats.size,
      });
    }
  }

  walk(rootDir);
  return results;
}
