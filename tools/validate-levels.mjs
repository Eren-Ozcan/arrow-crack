#!/usr/bin/env node
/**
 * Level validation gate (CI.md section 2.2).
 *
 * Milestone 0: walks the level directory and enforces nothing beyond "the
 * files parse". Each check listed in CI.md is added as the engine and the
 * solver land (milestones 1 and 2). An empty level set is not an error yet.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const LEVELS_DIR = join(process.cwd(), "src", "levels", "data");

async function listLevelFiles() {
  try {
    const entries = await readdir(LEVELS_DIR);
    return entries.filter((name) => name.endsWith(".json")).sort();
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function main() {
  const files = await listLevelFiles();
  const failures = [];

  for (const file of files) {
    const path = join(LEVELS_DIR, file);
    try {
      JSON.parse(await readFile(path, "utf8"));
    } catch (err) {
      failures.push(`${file}: ${err.message}`);
    }
  }

  for (const failure of failures) console.error(`FAIL ${failure}`);

  console.log(
    `levels:validate — ${files.length} level file(s), ${failures.length} failure(s)`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

await main();
