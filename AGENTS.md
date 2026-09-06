# AGENTS.md — MarketSystem engineering harness

This file defines how coding agents must investigate, change, validate, and finish work in this repository.

## Communication (SEMPRE)

- **Sempre se comunique com o usuário em PORTUGUÊS (pt-BR)** — em todas as respostas, relatórios, resumos e perguntas, em qualquer tarefa ou turno.
- Código, identificadores e mensagens de commit podem permanecer no padrão existente do repositório, mas a comunicação com o usuário é sempre em português.

## Product and architecture

MarketSystem is an offline-first Brazilian retail ERP/POS.

Core stack:
- React 19 + TypeScript
- Vite
- Tailwind CSS
- Dexie.js / IndexedDB as the local database
- PWA / Service Worker
- Browser integrations such as BroadcastChannel, camera/barcode scanning, printing, PDF export, and Web Audio

Important areas:
- `src/pages/PDV.tsx`: point of sale
- `src/pages/Financial.tsx`: financial analytics
- `src/pages/Inventory.tsx`: inventory
- `src/pages/CashRegister.tsx`: cash register
- `src/pages/Customers.tsx`: customers / store credit
- `src/db/`: database and seed data
- `src/types/`: shared domain types

## Non-negotiable business invariants

Treat data integrity as more important than visual polish.

- A completed sale must not silently diverge from stock, cash, payment, customer-debt, or sale-history records.
- Inventory movements must remain auditable. Never hide a mismatch by rewriting history.
- Cash opening, movement, closing, shortage, and surplus calculations must preserve their accounting meaning.
- Store-credit / debt operations must preserve customer balances and payment history.
- Financial metrics must come from real persisted data. Never invent placeholder metrics to make a screen look complete.
- Preserve historical cost information used to calculate margin/CMV when changing sale or product logic.
- Dexie schema changes must use explicit versioned migrations. Never wipe IndexedDB, reset production data, or silently reseed to make a change work.
- Preserve offline-first behavior. A core flow must not require network access unless the task explicitly changes that architecture.
- Browser-only APIs must be guarded so unsupported environments fail gracefully.

## Required engineering loop

For every task, repeat this cycle until the requested scope is complete or a stopping rule is reached:

1. **Understand**
   - Read the relevant files, types, database code, and callers before editing.
   - Trace the data flow for money, stock, sales, cash, or debt changes.
   - Distinguish root cause from visible symptom.

2. **Baseline**
   - Inspect the current worktree.
   - Run the narrowest useful validation before changing code when practical.
   - Do not assume an existing failure was caused by your work.

3. **Implement one coherent step**
   - Prefer the smallest change that completely solves one piece of the problem.
   - Reuse existing domain concepts before creating parallel abstractions.
   - Keep UI, state, persisted data, and derived analytics consistent.

4. **Validate**
   - Run `npm run harness:check` after code changes.
   - If a check fails, fix the cause rather than weakening or deleting the check.
   - When no automated test covers changed business logic, explicitly reason through at least the primary path, boundary cases, and failure/rollback path.

5. **Self-review**
   - Inspect the diff for accidental scope expansion, duplicated logic, stale state, unsafe numeric assumptions, and data migration risk.
   - Confirm no unrelated behavior was changed.

6. **Continue or stop**
   - Continue only when there is a concrete remaining step tied to the user's goal.
   - Stop when the requested behavior is implemented and validation is green.

## Priority when the task is broad

Work in this order:
1. Data corruption / accounting or inventory correctness
2. Crashes, broken sales, broken cash flow, broken debt flow
3. Incorrect financial calculations or stale persisted state
4. Reliability and offline/PWA regressions
5. Performance bottlenecks in common flows
6. UX friction in PDV and operational screens
7. Cosmetic cleanup

Do not perform speculative rewrites while higher-priority correctness issues remain.

## Safety and scope rules

- Never run destructive Git commands such as `git reset --hard`, `git clean -fd`, or forced checkout over user work.
- Never push, merge, force-push, deploy, publish, or alter remote resources unless the user explicitly asks for that action.
- Do not commit automatically from the looping harness.
- Do not install or upgrade dependencies merely to silence an error. Dependency changes require a concrete technical reason.
- Do not remove lint/type checks to make validation pass.
- Do not introduce a backend, cloud sync, authentication, or external service unless requested.
- Do not replace the local Dexie architecture as incidental refactoring.
- Do not modify seed/reset behavior in a way that can erase existing user data.
- Preserve keyboard-first PDV behavior and existing shortcuts unless the task explicitly changes them.

## Validation contract

The repository's minimum quality gate is:

```bash
npm run harness:check
```

That gate currently verifies:
- whitespace errors in the Git diff
- Oxlint
- TypeScript + Vite production build

There is not yet a dedicated automated business-logic test suite. Do not claim “all tests pass” when only lint/build were run.

## Output contract for the automated loop

When invoked by `scripts/codex-loop.mjs`, finish each iteration with exactly one marker on its own line:

- `HARNESS_STATUS: DONE` — requested goal is complete and your own validation is green.
- `HARNESS_STATUS: CONTINUE` — meaningful work remains for another bounded iteration.
- `HARNESS_STATUS: BLOCKED` — progress requires user input, unavailable credentials, missing dependencies, or an action outside the allowed sandbox.

Use `DONE` only when the original requested scope, not merely the current sub-step, is complete.
