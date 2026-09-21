import en from "./strings.en.json";

/**
 * The string lookup (DESIGN.md 6). v1 is English only and nothing is
 * translated, but no string is written in a screen: adding a locale is then
 * another JSON file and a lookup, not a refactor through the UI.
 */
export type StringKey = keyof typeof en;

export type StringParams = Record<string, string | number>;

const CATALOGUES: Record<string, Partial<Record<StringKey, string>>> = { en };

const DEFAULT_LANGUAGE = "en";

let language = DEFAULT_LANGUAGE;

/** Unknown languages fall back to English rather than to empty screens. */
export function setLanguage(next: string): void {
  language = next in CATALOGUES ? next : DEFAULT_LANGUAGE;
}

export function currentLanguage(): string {
  return language;
}

export function languages(): string[] {
  return Object.keys(CATALOGUES);
}

/**
 * Looks a string up and fills its `{placeholders}`. A missing string shows its
 * own key, which is ugly on purpose — a blank label hides the bug until a
 * player finds it.
 */
export function t(key: StringKey, params?: StringParams): string {
  const template = CATALOGUES[language]?.[key] ?? en[key] ?? key;
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
