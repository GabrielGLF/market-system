import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const isWindows = process.platform === "win32";
const bin = (name) => (isWindows ? `${name}.cmd` : name);
const repoRoot = process.cwd();
const harnessDir = resolve(repoRoot, ".harness");

function usage() {
  console.log(`
Usage:
  npm run codex:loop -- [--max N] [--model MODEL] [--allow-dirty] "TASK"

Examples:
  npm run codex:loop -- "Audit the PDV sale finalization flow and fix the highest-risk correctness issues"
  npm run codex:loop -- --max 8 "Improve inventory reliability without changing the product UX"
  npm run codex:loop -- --model gpt-5.3-codex "Reduce duplicated financial calculations"

Notes:
  - Default maximum: 6 iterations
  - Hard maximum: 20 iterations
  - Runs Codex in workspace-write sandbox
  - Does not commit, push, merge, deploy, or install dependencies automatically
`.trim());
}

function parseArgs(argv) {
  let max = Number(process.env.CODEX_LOOP_MAX ?? 6);
  let model = process.env.CODEX_MODEL ?? null;
  let allowDirty = false;
  const taskParts = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--max") {
      max = Number(argv[++i]);
      continue;
    }

    if (arg === "--model") {
      model = argv[++i] ?? null;
      continue;
    }

    if (arg === "--allow-dirty") {
      allowDirty = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    taskParts.push(arg);
  }

  const task = taskParts.join(" ").trim();

  if (!task) {
    usage();
    process.exit(2);
  }

  if (!Number.isInteger(max) || max < 1 || max > 20) {
    console.error("[codex-loop] --max must be an integer between 1 and 20.");
    process.exit(2);
  }

  if (argv.includes("--model") && !model) {
    console.error("[codex-loop] --model requires a value.");
    process.exit(2);
  }

  return { max, model, allowDirty, task };
}

function runSync(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    return {
      code: 127,
      stdout: result.stdout ?? "",
      stderr: `${result.stderr ?? ""}\n${result.error.message}`.trim(),
    };
  }

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function gitStatus() {
  const result = runSync("git", ["status", "--porcelain=v1"]);
  if (result.code !== 0) {
    console.error("[codex-loop] Unable to inspect Git status.");
    if (result.stderr) console.error(result.stderr.trim());
    process.exit(2);
  }
  return result.stdout.trim();
}

function validate() {
  const result = runSync(process.execPath, ["scripts/harness-check.mjs"]);
  const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

  if (combined) {
    console.log(combined);
  }

  return {
    passed: result.code === 0,
    summary: combined.slice(-12000),
  };
}

function runCodex(prompt, outputFile, model) {
  return new Promise((resolveRun) => {
    const args = [
      "exec",
      "--sandbox",
      "workspace-write",
      "--ephemeral",
      "--output-last-message",
      outputFile,
    ];

    if (model) {
      args.push("--model", model);
    }

    // "-" makes Codex read the task from stdin, avoiding shell quoting and
    // command-line length problems on Windows.
    args.push("-");

    const child = spawn(bin("codex"), args, {
      cwd: repoRoot,
      stdio: ["pipe", "inherit", "inherit"],
      windowsHide: false,
    });

    child.on("error", (error) => {
      console.error(`[codex-loop] Could not start Codex CLI: ${error.message}`);
      console.error(
        "[codex-loop] Install/login to the Codex CLI first, then retry.",
      );
      resolveRun(127);
    });

    child.on("close", (code) => {
      resolveRun(code ?? 1);
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function getAgentMessage(outputFile) {
  if (!existsSync(outputFile)) return "";
  return readFileSync(outputFile, "utf8");
}

function markerFrom(message) {
  const matches = [
    ...message.matchAll(
      /^HARNESS_STATUS:\s*(DONE|CONTINUE|BLOCKED)\s*$/gim,
    ),
  ];
  return matches.at(-1)?.[1]?.toUpperCase() ?? null;
}

function buildPrompt({ task, iteration, max, previousValidation }) {
  return `
You are iteration ${iteration} of ${max} in a bounded engineering loop for MarketSystem.

ORIGINAL GOAL
${task}

MANDATORY PROCESS
- Read and obey AGENTS.md before editing.
- Inspect the current worktree, including uncommitted changes left by earlier loop iterations.
- Work on exactly the highest-value remaining step that advances the ORIGINAL GOAL.
- Prefer root-cause fixes and small coherent diffs over broad rewrites.
- Protect POS, stock, cash, customer debt, financial history, Dexie migrations, and offline-first behavior.
- Do not commit, push, merge, deploy, publish, reset, clean, force-checkout, or rewrite Git history.
- Do not install or upgrade dependencies unless the ORIGINAL GOAL explicitly requires it.
- Do not use dangerous sandbox bypass flags or depend on network access.
- Run npm run harness:check after your changes and fix failures that you caused.
- Review your own diff before finishing this iteration.

PARENT HARNESS VALIDATION FROM THE PREVIOUS STEP
${previousValidation || "No previous validation result is available yet."}

STOP CONTRACT
Finish your response with exactly one marker on its own line:
HARNESS_STATUS: DONE
HARNESS_STATUS: CONTINUE
HARNESS_STATUS: BLOCKED

Use DONE only if the entire ORIGINAL GOAL is complete and validation is green.
Use CONTINUE only if another bounded iteration has concrete useful work to do.
Use BLOCKED only if progress genuinely requires user input, unavailable credentials/dependencies, or an action outside the sandbox.
`.trim();
}

const { max, model, allowDirty, task } = parseArgs(process.argv.slice(2));

const gitProbe = runSync("git", ["rev-parse", "--show-toplevel"]);
if (gitProbe.code !== 0) {
  console.error("[codex-loop] Run this command from inside the MarketSystem Git repository.");
  process.exit(2);
}

const codexProbe = runSync(bin("codex"), ["--version"]);
if (codexProbe.code !== 0) {
  console.error("[codex-loop] Codex CLI was not found or is not working.");
  console.error("[codex-loop] Install/login to Codex CLI before running this loop.");
  process.exit(2);
}

const initialStatus = gitStatus();
if (initialStatus && !allowDirty) {
  console.error("[codex-loop] Refusing to start with a dirty worktree.");
  console.error(
    '[codex-loop] Commit/stash your work first, or explicitly use "--allow-dirty" if you accept the risk.',
  );
  process.exit(2);
}

mkdirSync(harnessDir, { recursive: true });

console.log(`[codex-loop] ${codexProbe.stdout.trim() || "Codex CLI detected"}`);
console.log(`[codex-loop] Max iterations: ${max}`);
console.log("[codex-loop] Sandbox: workspace-write");
if (model) console.log(`[codex-loop] Model override: ${model}`);

console.log("\n[codex-loop] Baseline validation");
let validation = validate();
let unchangedIterations = 0;

for (let iteration = 1; iteration <= max; iteration += 1) {
  console.log(`\n========== CODEX LOOP ${iteration}/${max} ==========\n`);

  const before = gitStatus();
  const outputFile = resolve(
    harnessDir,
    `iteration-${String(iteration).padStart(2, "0")}.md`,
  );
  const prompt = buildPrompt({
    task,
    iteration,
    max,
    previousValidation: validation.summary,
  });

  const codexExit = await runCodex(prompt, outputFile, model);
  if (codexExit !== 0) {
    console.error(`[codex-loop] Codex exited with code ${codexExit}.`);
    process.exit(codexExit);
  }

  const message = getAgentMessage(outputFile);
  const marker = markerFrom(message);
  const after = gitStatus();

  unchangedIterations = before === after ? unchangedIterations + 1 : 0;

  console.log("\n[codex-loop] Parent validation");
  validation = validate();

  if (marker === "BLOCKED") {
    console.error("[codex-loop] Agent reported BLOCKED. Inspect its last message.");
    process.exit(2);
  }

  if (marker === "DONE" && validation.passed) {
    console.log(
      `\n[codex-loop] Goal reported DONE with a green quality gate after ${iteration} iteration(s).`,
    );
    process.exit(0);
  }

  if (!marker) {
    console.warn(
      "[codex-loop] Agent returned no HARNESS_STATUS marker; treating this as CONTINUE.",
    );
  } else if (marker === "DONE" && !validation.passed) {
    console.warn(
      "[codex-loop] Agent reported DONE but the parent quality gate failed; continuing.",
    );
  }

  if (unchangedIterations >= 2) {
    console.error(
      "[codex-loop] Stopping after two iterations with no worktree change to avoid an unproductive loop.",
    );
    process.exit(validation.passed ? 2 : 1);
  }
}

if (validation.passed) {
  console.warn(
    `\n[codex-loop] Reached the ${max}-iteration limit with a green quality gate, but the agent did not report the full goal DONE.`,
  );
  process.exit(2);
}

console.error(
  `\n[codex-loop] Reached the ${max}-iteration limit and the quality gate is still failing.`,
);
process.exit(1);
