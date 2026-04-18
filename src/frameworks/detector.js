import fs from "fs";
import { getFrameworkPreferenceBoost } from "./preferences.js";

const FRAMEWORK_RULES = [
  {
    id: "aspnet-core",
    language: "csharp",
    signals: [
      { type: "path", test: /Program\.cs$/i, weight: 2 },
      { type: "content", test: /\bWebApplication\.CreateBuilder\b|\bMapControllers\s*\(|\bAddControllers\s*\(/, weight: 3 },
      { type: "content", test: /\[ApiController\]|\[Route\(/, weight: 2 },
    ],
  },
  {
    id: "spring-boot",
    language: "java",
    signals: [
      { type: "content", test: /@SpringBootApplication|SpringApplication\.run\s*\(/, weight: 4 },
      { type: "content", test: /@RestController|@Controller|@RequestMapping|@GetMapping|@PostMapping/, weight: 2 },
      { type: "path", test: /application\.(properties|ya?ml)$/i, weight: 1 },
    ],
  },
  {
    id: "laravel",
    language: "php",
    signals: [
      { type: "path", test: /artisan$/i, weight: 3 },
      { type: "path", test: /routes\/web\.php$|routes\/api\.php$/i, weight: 3 },
      { type: "path", test: /app\/Http\/Controllers\//i, weight: 2 },
      { type: "content", test: /Illuminate\\Foundation\\Application|Route::(get|post|put|patch|delete)/, weight: 2 },
    ],
  },
  {
    id: "symfony",
    language: "php",
    signals: [
      { type: "path", test: /bin\/console$/i, weight: 3 },
      { type: "path", test: /config\/routes\.ya?ml$|src\/Controller\//i, weight: 2 },
      { type: "content", test: /Symfony\\Bundle\\FrameworkBundle|#[ \t]*Route\(/, weight: 2 },
    ],
  },
  {
    id: "express",
    language: "javascript",
    signals: [
      { type: "content", test: /\bexpress\s*\(/, weight: 3 },
      { type: "content", test: /\bapp\.(get|post|put|patch|delete|use)\s*\(/, weight: 2 },
      { type: "content", test: /\bRouter\s*\(/, weight: 1 },
    ],
  },
  {
    id: "nextjs",
    language: "javascript",
    signals: [
      { type: "path", test: /next\.config\./i, weight: 3 },
      { type: "path", test: /app\/.*page\.(tsx|ts|jsx|js)$|pages\/api\//i, weight: 2 },
      { type: "content", test: /\bNextRequest\b|\bNextResponse\b|getServerSideProps|generateMetadata/, weight: 2 },
    ],
  },
  {
    id: "qwik",
    language: "javascript",
    signals: [
      { type: "content", test: /@builder\.io\/qwik|@builder\.io\/qwik-city/, weight: 4 },
      { type: "content", test: /\bcomponent\$\s*\(|routeLoader\$\s*\(|server\$\s*\(/, weight: 2 },
      { type: "path", test: /src\/routes\/.+\.(tsx|ts|jsx|js)$/i, weight: 2 },
      { type: "path", test: /vite\.config\.(ts|js|mts|mjs)$/i, weight: 1 },
    ],
  },
  {
    id: "nestjs",
    language: "javascript",
    signals: [
      { type: "content", test: /@Module\(|@Controller\(|@Injectable\(/, weight: 3 },
      { type: "content", test: /NestFactory\.create\s*\(/, weight: 3 },
      { type: "path", test: /main\.ts$/i, weight: 1 },
    ],
  },
  {
    id: "fastapi",
    language: "python",
    signals: [
      { type: "content", test: /\bFastAPI\s*\(/, weight: 4 },
      { type: "content", test: /from\s+fastapi\s+import\s+APIRouter|\bAPIRouter\s*\(/, weight: 3 },
      { type: "content", test: /@(app|router)\.(get|post|put|patch|delete)\s*\(/, weight: 2 },
    ],
  },
  {
    id: "django",
    language: "python",
    signals: [
      { type: "path", test: /manage\.py$|settings\.py$/i, weight: 3 },
      { type: "content", test: /django\.urls|from django\./, weight: 2 },
      { type: "content", test: /INSTALLED_APPS\s*=|WSGI_APPLICATION|ASGI_APPLICATION/, weight: 2 },
    ],
  },
  {
    id: "flask",
    language: "python",
    signals: [
      { type: "content", test: /from\s+flask\s+import\b|\bFlask\s*\(__name__/, weight: 4 },
      { type: "content", test: /\bBlueprint\s*\(/, weight: 2 },
      { type: "content", test: /@app\.route\s*\(|@[\w]+\.route\s*\(/, weight: 2 },
    ],
  },
  {
    id: "gin",
    language: "go",
    signals: [
      { type: "content", test: /gin\.Default\s*\(|gin\.New\s*\(/, weight: 4 },
      { type: "content", test: /\.GET\s*\(|\.POST\s*\(|\.PUT\s*\(|\.PATCH\s*\(|\.DELETE\s*\(/, weight: 1 },
    ],
  },
  {
    id: "fiber",
    language: "go",
    signals: [
      { type: "content", test: /fiber\.New\s*\(/, weight: 4 },
      { type: "content", test: /\.Get\s*\(|\.Post\s*\(|\.Put\s*\(|\.Patch\s*\(|\.Delete\s*\(/, weight: 1 },
    ],
  },
  {
    id: "echo",
    language: "go",
    signals: [
      { type: "content", test: /echo\.New\s*\(/, weight: 4 },
      { type: "content", test: /\.GET\s*\(|\.POST\s*\(|\.PUT\s*\(|\.PATCH\s*\(|\.DELETE\s*\(/, weight: 1 },
    ],
  },
];

export function detectFrameworks(fileCatalog) {
  const scores = new Map();
  const evidence = new Map();

  for (const file of fileCatalog) {
    if (isFixtureLikePath(file.relPath)) continue;

    const relevantRules = FRAMEWORK_RULES.filter((rule) =>
      !rule.language || matchesLanguage(file, rule.language)
    );

    if (relevantRules.length === 0) continue;

    const content = shouldReadContent(relevantRules) ? readFile(file.path) : null;

    for (const rule of relevantRules) {
      for (const signal of rule.signals) {
        const matched = signal.type === "path"
          ? signal.test.test(file.relPath) || signal.test.test(file.path)
          : Boolean(content && signal.test.test(content));

        if (!matched) continue;

        scores.set(rule.id, (scores.get(rule.id) || 0) + signal.weight);

        const items = evidence.get(rule.id) || [];
        items.push({
          type: signal.type,
          filePath: file.path,
          relPath: file.relPath,
          weight: signal.weight,
          pattern: signal.test.toString(),
        });
        evidence.set(rule.id, items);
      }
    }
  }

  return [...scores.entries()]
    .filter(([, score]) => score >= 3)
    .map(([id, score]) => ({
      id,
      score,
      preferenceBoost: getFrameworkPreferenceBoost(id),
      rankScore: score + getFrameworkPreferenceBoost(id),
      evidence: (evidence.get(id) || []).slice(0, 8),
    }))
    .sort((a, b) => b.rankScore - a.rankScore || b.score - a.score || a.id.localeCompare(b.id));
}

function matchesLanguage(file, language) {
  return file.type === "source" && detectLanguageFromExt(file.ext) === language;
}

function detectLanguageFromExt(ext) {
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "javascript";
  if (ext === ".py") return "python";
  if (ext === ".cs") return "csharp";
  if (ext === ".go") return "go";
  if (ext === ".java") return "java";
  if (ext === ".php") return "php";
  return null;
}

function shouldReadContent(rules) {
  return rules.some((rule) => rule.signals.some((signal) => signal.type === "content"));
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function isFixtureLikePath(relPath) {
  return /(^|\/)(tests?\/fixtures|fixtures|examples|samples|__tests__)(\/|$)/i.test(relPath);
}
