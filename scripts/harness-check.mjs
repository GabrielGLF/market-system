import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const command = (name) => (isWindows ? `${name}.cmd` : name);

const checks = [
  {
    name: "Git diff whitespace",
    cmd: "git",
    args: ["diff", "--check"],
  },
  {
    name: "Oxlint",
    cmd: command("npm"),
    args: ["run", "lint"],
  },
  {
    name: "TypeScript + Vite production build",
    cmd: command("npm"),
    args: ["run", "build"],
  },
];

let failed = false;

for (const check of checks) {
  process.stdout.write(`\n[harness] ${check.name}\n`);

  const result = spawnSync(check.cmd, check.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    failed = true;
    process.stderr.write(
      `[harness] Failed to start ${check.cmd}: ${result.error.message}\n`,
    );
    break;
  }

  if (result.status !== 0) {
    failed = true;
    process.stderr.write(
      `[harness] ${check.name} failed with exit code ${result.status}.\n`,
    );
    break;
  }

  process.stdout.write(`[harness] ${check.name}: OK\n`);
}

if (failed) {
  process.stderr.write("\n[harness] Quality gate FAILED.\n");
  process.exit(1);
}

process.stdout.write("\n[harness] Quality gate PASSED.\n");
