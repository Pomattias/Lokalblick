# Copilot backend handoff

Repository: `Pomattias/Mattias-testsida`

## Work-stream split

- Product/frontend/repository development: `utveckling` — handled in the ChatGPT workflow.
- Backend implementation: `copilot-backend` — handled by Copilot.
- Production branch: `main` — do not modify.

Copilot must treat `frontend/**` as read-only unless the user explicitly changes this rule.

## Start every Copilot backend session with

```bash
git status
git branch --show-current
git rev-parse HEAD
git fetch
```

Expected branch:

```text
copilot-backend
```

Then read:

```text
.github/copilot-instructions.md
COPILOT_HANDOFF.md
README.md
ARCHITECTURE.md
backend/README.md
```

Inspect the backend under:

```text
backend/
```

You may read `frontend/` to understand the current API contract, but do not edit it.

Run:

```bash
npm test
```

before and after backend changes.

## Integration rule

Backend commits stay on `copilot-backend`.

Do not merge or push backend commits directly into `utveckling` or `main`.

When a backend task is complete, return:
- current backend branch HEAD
- commit SHA(s)
- changed files
- test results
- API contract changes
- any frontend work that is needed

The ChatGPT/product stream will decide how to integrate the backend commits into `utveckling`.

## Data safety

Do not add real LEB files, real company/customer data, local Windows paths, credentials, tokens or API keys to the repository.

Use synthetic fixtures only.

The public GitHub Pages site remains demo-only.


## Current backend task

The current implementation specification is versioned in:

`docs/COPILOT_BACKEND_TASK.md`

Always fetch the latest `origin/copilot-backend` and read that file before implementation. Do not rely on a copied chat prompt as the source of truth.
