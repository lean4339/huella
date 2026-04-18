import path from "path";
import { readFile } from "./base.js";
import { javascriptLanguage } from "./javascript.js";
import { pythonLanguage } from "./python.js";
import { csharpLanguage } from "./csharp.js";
import { goLanguage } from "./go.js";
import { javaLanguage } from "./java.js";
import { phpLanguage } from "./php.js";

const LANGUAGES = [
  javascriptLanguage,
  pythonLanguage,
  csharpLanguage,
  goLanguage,
  javaLanguage,
  phpLanguage,
];

export const SOURCE_EXTENSIONS = new Set(
  LANGUAGES.flatMap((language) => [...language.extensions])
);

export function getLanguageAdapter(filePath) {
  const ext = path.extname(filePath);
  return LANGUAGES.find((language) => language.extensions.has(ext)) || null;
}

export function isSourceFile(filePath) {
  return Boolean(getLanguageAdapter(filePath));
}

export function extractFileSymbols(filePath) {
  const adapter = getLanguageAdapter(filePath);
  if (!adapter) return [];

  const content = readFile(filePath);
  if (!content) return [];

  return adapter.extractSymbols(content, filePath).map((symbol) => ({
    ...symbol,
    language: adapter.id,
  }));
}

export function extractSymbolsFromCatalog(fileCatalog) {
  const symbols = [];
  for (const file of fileCatalog) {
    symbols.push(...extractFileSymbols(file.path));
  }
  return symbols;
}

export function extractFileImports(filePath) {
  const adapter = getLanguageAdapter(filePath);
  if (!adapter) return [];

  const content = readFile(filePath);
  if (!content) return [];

  return adapter.extractImports(content, filePath).map((item) => ({
    ...item,
    language: adapter.id,
  }));
}

export function extractImportsFromCatalog(fileCatalog) {
  const imports = [];
  for (const file of fileCatalog) {
    imports.push(...extractFileImports(file.path));
  }
  return imports;
}
