export const DEFAULT_FRAMEWORK_PREFERENCES = {
  nextjs: 20,
  "aspnet-core": 18,
  "spring-boot": 18,
  fastapi: 17,
  laravel: 16,
  express: 15,
  django: 14,
  nestjs: 13,
  flask: 11,
  symfony: 10,
  gin: 9,
  fiber: 8,
  echo: 7,
  qwik: 6,
};

export function getFrameworkPreferenceBoost(id) {
  const overrides = readPreferenceOverrides();
  if (Object.prototype.hasOwnProperty.call(overrides, id)) {
    return Number(overrides[id]) || 0;
  }

  return DEFAULT_FRAMEWORK_PREFERENCES[id] || 0;
}

function readPreferenceOverrides() {
  const raw = process.env.HUELLA_FRAMEWORK_PREFERENCES;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
