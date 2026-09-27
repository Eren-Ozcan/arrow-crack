import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/ui/strings.en.json";
import { t } from "@/ui/strings";
import type { StringKey } from "@/ui/strings";

/**
 * DESIGN.md 6: every user-visible line is a key in `strings.en.json`. The
 * type system already refuses a key that is not in the file; these tests
 * cover the other direction and the lookup itself.
 */

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

const SOURCE = sources(join(__dirname, "..", "src"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

/**
 * Keys in the file that no screen shows today. Each is either a line a
 * screen still has to render or one to delete; listing them here keeps a new
 * dead key from slipping in unnoticed while these are decided.
 */
const KNOWN_UNUSED: StringKey[] = [
  "home.bestScore",
  "settings.deleteConfirmTitle",
  "coach.dismiss",
];

describe("strings.en.json", () => {
  const keys = Object.keys(en) as StringKey[];

  it("has no key that no source file names, beyond the known list", () => {
    const unused = keys.filter((key) => !SOURCE.includes(`"${key}"`));
    expect(unused.sort()).toEqual([...KNOWN_UNUSED].sort());
  });

  it("has no empty line", () => {
    expect(keys.filter((key) => en[key].trim() === "")).toEqual([]);
  });

  it("uses only {word} placeholders, each closed", () => {
    for (const key of keys) {
      const line = en[key];
      const opened = (line.match(/\{/g) ?? []).length;
      const closed = (line.match(/\{\w+\}/g) ?? []).length;
      expect(opened, key).toBe(closed);
    }
  });
});

describe("t()", () => {
  it("fills every placeholder it is given", () => {
    expect(t("home.levelLabel", { level: 12 })).toBe("Level 12");
    expect(t("timed.line", { seconds: 45 })).toContain("45 seconds");
  });

  it("leaves a placeholder it was not given, so the gap is visible", () => {
    expect(t("home.levelLabel", {})).toBe("Level {level}");
  });

  it("returns the line as is without params", () => {
    expect(t("app.title")).toBe("Arrow Crack");
  });
});
