import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBackupPlan,
  buildRestorePlan,
  parseArgs,
  validateRestoreConfirmation
} from "./db-ops.mjs";

describe("database ops script planning", () => {
  it("builds a deterministic backup plan with mysqldump safety flags", () => {
    const plan = buildBackupPlan(
      parseArgs(["--timestamp", "20260702-113000", "--output-dir", "backups/mysql", "--dry-run"])
    );

    assert.equal(plan.outputFile, "backups/mysql/smart-streetlight-20260702-113000.sql");
    assert.deepEqual(plan.command, [
      "docker",
      "compose",
      "-f",
      "deploy/docker-compose.yml",
      "exec",
      "-T",
      "mysql",
      "sh",
      "-lc",
      'mysqldump --single-transaction --routines --triggers --events --no-tablespaces --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
    ]);
    assert.equal(plan.dryRun, true);
  });

  it("requires an input file and explicit confirmation for restore", () => {
    assert.throws(() => buildRestorePlan(parseArgs([])), /--input/);
    assert.throws(() => buildRestorePlan(parseArgs(["--input", "backup.sql"])), /--yes/);
  });

  it("builds a restore plan when confirmation is present", () => {
    const plan = buildRestorePlan(parseArgs(["--input", "backups/mysql/latest.sql", "--yes"]));

    assert.equal(plan.inputFile, "backups/mysql/latest.sql");
    assert.deepEqual(plan.command, [
      "docker",
      "compose",
      "-f",
      "deploy/docker-compose.yml",
      "exec",
      "-T",
      "mysql",
      "sh",
      "-lc",
      'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
    ]);
  });

  it("accepts dry-run restore without destructive confirmation", () => {
    const plan = buildRestorePlan(parseArgs(["--input", "backups/mysql/latest.sql", "--dry-run"]));

    assert.equal(plan.dryRun, true);
    assert.equal(validateRestoreConfirmation(plan), true);
  });
});
