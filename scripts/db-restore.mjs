#!/usr/bin/env node
import { buildRestorePlan, parseArgs, runRestore } from "./db-ops.mjs";

try {
  await runRestore(buildRestorePlan(parseArgs(process.argv.slice(2))));
} catch (error) {
  console.error(`[db:restore] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
