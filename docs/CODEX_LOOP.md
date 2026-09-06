# Looping engineering harness for Codex

This repository includes a bounded Codex loop designed to improve or repair MarketSystem without giving an agent unrestricted access to your machine.

## What it does

Each iteration:

1. Codex reads `AGENTS.md` and the original goal.
2. It inspects the current repository and previous uncommitted changes.
3. It makes one coherent improvement.
4. It runs the project quality gate.
5. The parent harness independently runs the quality gate again.
6. The loop stops when the complete goal is done, the agent is blocked, progress stalls, or the iteration limit is reached.

The loop is intentionally bounded. It is not an infinite autonomous process.

## Safety model

The runner invokes Codex with the `workspace-write` sandbox.

The harness does **not** intentionally:
- bypass the Codex sandbox
- use YOLO / danger-full-access mode
- commit or push
- merge or deploy
- install dependencies
- reset or clean the Git worktree
- alter files outside this repository

Start from a clean Git worktree unless you explicitly pass `--allow-dirty`.

## Prerequisites

Install project dependencies:

```bash
npm install
```

Make sure the Codex CLI is installed and authenticated:

```bash
codex --version
```

## Quality gate

Run only the deterministic checks:

```bash
npm run harness:check
```

This currently checks:
- `git diff --check`
- `npm run lint`
- `npm run build`

The project does not yet have a dedicated business-logic test suite, so lint/build should not be described as “all tests”.

## Run the loop

Basic:

```bash
npm run codex:loop -- "Audit the PDV sale finalization flow and fix the highest-risk correctness issues"
```

More iterations:

```bash
npm run codex:loop -- --max 10 "Improve stock integrity and auditability without changing normal user workflows"
```

Use a specific Codex model:

```bash
npm run codex:loop -- --model <model-name> "Reduce duplicated financial calculation logic safely"
```

If you intentionally want to start with local uncommitted work:

```bash
npm run codex:loop -- --allow-dirty "Continue the current refactor and make the quality gate green"
```

The default limit is 6 iterations. The hard maximum is 20.

## Good tasks for the loop

Prefer goals with an objective completion condition, for example:

```text
Audit the complete sale finalization path. Fix correctness bugs that can make
stock, sale history, payment totals, cash totals, or customer debt diverge.
Keep the current UI unless a UI change is required for correctness.
Do not change the persistence architecture.
```

```text
Find and remove duplicated financial formulas that can produce inconsistent
results between Dashboard, Financial, Pricing, and PriceCalculator. Preserve
current business definitions and make the smallest safe refactor.
```

```text
Audit IndexedDB/Dexie writes for failure handling and transaction boundaries.
Prioritize operations involving sales, stock, cash, and customer debt.
Do not reset or reseed existing user data.
```

Avoid goals such as “make the whole project perfect”; broad prompts make autonomous loops less measurable and more prone to unnecessary rewrites.

## Files

- `AGENTS.md` — engineering rules and business invariants loaded by Codex.
- `scripts/harness-check.mjs` — deterministic parent quality gate.
- `scripts/codex-loop.mjs` — bounded loop runner.
- `.harness/` — ignored local iteration outputs.
