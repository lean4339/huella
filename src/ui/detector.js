import fs from "fs";

export function detectUiSurfaces(fileCatalog) {
  const surfaces = [];

  for (const file of fileCatalog) {
    const relPath = file.relPath;

    if (/^pages\/.+\.(tsx|ts|jsx|js)$/i.test(relPath)) {
      surfaces.push(makeSurface("next-page", file, 4));
    }

    if (/^app\/.+\/page\.(tsx|ts|jsx|js)$/i.test(relPath) || /^app\/.+\/layout\.(tsx|ts|jsx|js)$/i.test(relPath)) {
      surfaces.push(makeSurface("next-app-route", file, 4));
    }

    if (/^components\/.+\.(tsx|ts|jsx|js)$/i.test(relPath)) {
      surfaces.push(makeSurface("ui-component", file, 2));
    }

    if (/(^|\/)(frontend\/src|src)\/main\.(tsx|ts|jsx|js)$/i.test(relPath)) {
      surfaces.push(makeSurface("spa-entry", file, 5));
    }

    if (/(^|\/)(frontend\/src|src)\/App\.(tsx|ts|jsx|js)$/i.test(relPath)) {
      surfaces.push(makeSurface("spa-app-shell", file, 5));
    }

    if (/(^|\/)(frontend\/src|src)\/pages\/.+\.(tsx|ts|jsx|js)$/i.test(relPath)) {
      surfaces.push(makeSurface("spa-page", file, 4));
    }

    if (/(^|\/)(frontend\/src|src)\/routes?\/.+\.(tsx|ts|jsx|js)$/i.test(relPath)) {
      surfaces.push(makeSurface("spa-route-module", file, 4));
      surfaces.push(makeSurface("qwik-route", file, 4));
    }

    if (/(^|\/)src\/components\/.+\.(tsx|ts|jsx|js)$/i.test(relPath)) {
      surfaces.push(makeSurface("qwik-component", file, 3));
    }

    if (/^Views\/.+\.cshtml$/i.test(relPath) || /\.cshtml$/i.test(relPath)) {
      surfaces.push(makeSurface("razor-view", file, 4));
      if (hasInlineScript(file.path)) {
        surfaces.push(makeSurface("view-inline-script", file, 3));
      }
    }

    if (/\/views\/.+\.(ejs|pug|hbs|mustache|twig|jsp|jspx|ftl|vm)$/i.test(relPath) || /^views\/.+\.(ejs|pug|hbs|mustache|twig|jsp|jspx|ftl|vm)$/i.test(relPath)) {
      surfaces.push(makeSurface("template-view", file, 4));
      if (hasInlineScript(file.path)) {
        surfaces.push(makeSurface("view-inline-script", file, 3));
      }
    }

    if (/^public\/index\.html$/i.test(relPath) || /(^|\/)index\.html$/i.test(relPath)) {
      surfaces.push(makeSurface("static-entry", file, 4));
    }

    if (/^public\/.+\.(js|ts)$/i.test(relPath) || /(^|\/)(app|main)\.(js|ts)$/i.test(relPath)) {
      surfaces.push(makeSurface("page-script", file, 3));
    }
  }

  return dedupeSurfaces(surfaces).sort((a, b) =>
    b.score - a.score ||
    a.type.localeCompare(b.type) ||
    a.relPath.localeCompare(b.relPath)
  );
}

function makeSurface(type, file, score) {
  return {
    type,
    path: file.path,
    relPath: file.relPath,
    layer: file.layer,
    score,
  };
}

function hasInlineScript(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return /<script\b/i.test(content);
  } catch {
    return false;
  }
}

function dedupeSurfaces(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.type}:${item.relPath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
