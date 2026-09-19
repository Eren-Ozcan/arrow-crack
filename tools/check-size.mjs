#!/usr/bin/env node
/**
 * Bundle budget gate (CI.md section 2.3). Sums the built JS and CSS and
 * fails when the total exceeds BUDGET_BYTES.
 */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const DIST = join(process.cwd(), "dist");
const BUDGET_BYTES = 600 * 1024;
const COUNTED = [".js", ".css"];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

async function main() {
  let files;
  try {
    files = await walk(DIST);
  } catch {
    console.error("size: dist/ missing — run `npm run build` first");
    process.exit(1);
  }

  let total = 0;
  for (const file of files) {
    if (!COUNTED.some((ext) => file.endsWith(ext))) continue;
    total += (await stat(file)).size;
  }

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`size: ${kb(total)} of ${kb(BUDGET_BYTES)} budget`);
  process.exit(total <= BUDGET_BYTES ? 0 : 1);
}

await main();
