#!/usr/bin/env tsx
/**
 * CLI wrapper around the level gate (CI.md section 2.2). The checks live in
 * ./validate.ts so tests can run them without running the process.
 */
import { loadLevels } from "./levels";
import { validate } from "./validate";

async function main(): Promise<void> {
  const levels = await loadLevels();
  const seenIds = new Map<number, string>();
  let failures = 0;

  for (const { file, level } of levels) {
    const problems = validate(level);

    const duplicate = seenIds.get(level.id);
    if (duplicate) problems.push(`level id ${level.id} is also used by ${duplicate}`);
    else seenIds.set(level.id, file);

    for (const problem of problems) console.error(`FAIL ${file}: ${problem}`);
    if (problems.length > 0) failures += 1;
  }

  console.log(`levels:validate — ${levels.length} level(s), ${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
