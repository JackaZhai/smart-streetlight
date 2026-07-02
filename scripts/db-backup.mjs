#!/usr/bin/env node
import { buildBackupPlan, parseArgs, runBackup } from "./db-ops.mjs";

try {
  await runBackup(buildBackupPlan(parseArgs(process.argv.slice(2))));
} catch (error) {
  console.error(`[db:backup] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
