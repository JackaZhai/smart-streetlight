import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { finished } from "node:stream/promises";

const defaultComposeFile = "deploy/docker-compose.yml";
const defaultService = "mysql";
const defaultOutputDir = "backups/mysql";

export function parseArgs(argv) {
  const result = {
    composeFile: defaultComposeFile,
    service: defaultService,
    outputDir: defaultOutputDir,
    dryRun: false,
    yes: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (arg === "--yes") {
      result.yes = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, value) => value.toUpperCase());
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      result[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

export function buildBackupPlan(options = {}) {
  const timestamp = options.timestamp ?? toTimestamp(new Date());
  const outputFile = options.output ?? join(options.outputDir ?? defaultOutputDir, `smart-streetlight-${timestamp}.sql`);
  return {
    kind: "backup",
    dryRun: Boolean(options.dryRun),
    outputFile,
    command: composeExecCommand(options, backupShellCommand())
  };
}

export function buildRestorePlan(options = {}) {
  if (!options.input) {
    throw new Error("Restore requires --input <backup.sql>");
  }
  const plan = {
    kind: "restore",
    dryRun: Boolean(options.dryRun),
    yes: Boolean(options.yes),
    inputFile: options.input,
    command: composeExecCommand(options, restoreShellCommand())
  };
  validateRestoreConfirmation(plan);
  return plan;
}

export function validateRestoreConfirmation(plan) {
  if (plan.dryRun || plan.yes) {
    return true;
  }
  throw new Error("Restore is destructive. Pass --yes after confirming the target database can be overwritten.");
}

export async function runBackup(plan, runner = spawn) {
  if (plan.dryRun) {
    printPlan(plan);
    return;
  }
  await mkdir(dirname(plan.outputFile), { recursive: true });
  const output = createWriteStream(plan.outputFile);
  await runProcess(plan.command, {
    stdout: output,
    runner
  });
  await finished(output);
  console.log(`[db:backup] wrote ${plan.outputFile}`);
}

export async function runRestore(plan, runner = spawn) {
  if (plan.dryRun) {
    printPlan(plan);
    return;
  }
  await assertReadableFile(plan.inputFile);
  await runProcess(plan.command, {
    stdin: createReadStream(plan.inputFile),
    runner
  });
  console.log(`[db:restore] restored ${plan.inputFile}`);
}

export function printPlan(plan) {
  const fileLine = plan.kind === "backup" ? `output=${plan.outputFile}` : `input=${plan.inputFile}`;
  console.log(`[db:${plan.kind}] dry-run`);
  console.log(fileLine);
  console.log(plan.command.map(shellQuote).join(" "));
}

async function assertReadableFile(path) {
  const current = await stat(path);
  if (!current.isFile()) {
    throw new Error(`Restore input is not a file: ${path}`);
  }
}

function composeExecCommand(options, shellCommand) {
  return [
    "docker",
    "compose",
    "-f",
    options.composeFile ?? defaultComposeFile,
    "exec",
    "-T",
    options.service ?? defaultService,
    "sh",
    "-lc",
    shellCommand
  ];
}

function backupShellCommand() {
  return 'mysqldump --single-transaction --routines --triggers --events --no-tablespaces --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"';
}

function restoreShellCommand() {
  return 'mysql --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"';
}

function runProcess(command, options) {
  return new Promise((resolve, reject) => {
    const child = options.runner(command[0], command.slice(1), { stdio: ["pipe", "pipe", "inherit"] });

    if (options.stdin) {
      options.stdin.pipe(child.stdin);
    } else {
      child.stdin.end();
    }

    if (options.stdout) {
      child.stdout.pipe(options.stdout);
    } else {
      child.stdout.pipe(process.stdout);
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command[0]} exited with code ${code}`));
    });
  });
}

function toTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}
