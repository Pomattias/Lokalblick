# Lokalblick – Copilot repository instructions

## Work split

Lokalblick development is intentionally split between two work streams:

- ChatGPT/main product development works on branch `utveckling`.
- Copilot backend work works on branch `copilot-backend`.
- `main` must never be modified by Copilot.

Copilot owns backend implementation only unless the user explicitly says otherwise.

Copilot may normally edit:
- `backend/**`
- backend-focused tests/fixtures using synthetic data
- `docs/**` when documenting backend setup
- `package.json` and `scripts/**` only when required to run/test the backend
- API contracts that are part of the backend boundary

Copilot must NOT edit:
- `frontend/**`
- public demo UI/UX
- map UI
- product navigation/layout
- `main`

If backend changes require a frontend contract change, document the required contract/API change in the handoff instead of modifying `frontend/**`.

## Branch and Git safety

- Work only on branch `copilot-backend`.
- Never commit, merge, push, rebase, reset or otherwise modify `main`.
- Never commit backend work directly to `utveckling`.
- At the start of every task run:
  - `git status`
  - `git branch --show-current`
  - `git rev-parse HEAD`
- If the current branch is not `copilot-backend`, stop and switch to `copilot-backend` before editing.
- Pull/fetch before starting new work so the backend branch can be refreshed from `utveckling` when requested.
- Make small, descriptive commits.

## Read before changing code

Read these files first:
1. `README.md`
2. `ARCHITECTURE.md`
3. `backend/README.md`
4. `COPILOT_HANDOFF.md`

Then inspect the relevant backend code.

## Security

Never commit:
- real company or tenant data
- LEB Excel workbooks
- exported customer files
- local Windows/OneDrive/SharePoint paths that identify the organization
- API keys, passwords, tokens, cookies or credentials
- `.env` or `.env.local`
- database files containing real data

Use synthetic fixtures and placeholder paths only.

The public GitHub Pages build is demo-only and must remain demo-only.

Production/company data belongs behind the Lokalblick API/backend boundary. Frontend code must not contain server credentials or source-system secrets.

## Architecture

Keep Lokalblick provider-neutral:
- frontend -> Lokalblick data service / map service
- Lokalblick API -> repository
- repository -> source adapters
- customer master data stays in the customer-controlled environment

Do not couple the backend directly to one customer-specific environment when an adapter boundary can be used.

## Integration back to utveckling

Do not merge to `utveckling` yourself unless the user explicitly asks.

When backend work is complete:
- run `npm test`
- provide commit SHA(s)
- summarize files changed
- state any API/frontend contract impact
- leave integration/cherry-pick/merge back to `utveckling` for the ChatGPT/product-development stream

## Verification

Before committing:
- run `npm test`
- review `git status`
- confirm no real data, local paths or secrets were added
- confirm no files under `frontend/**` were modified
- summarize changed files and commits


## Backend persistence rule

For every non-demo runtime:
- backend is the single source of truth for all persisted Lokalblick data
- frontend may render and edit, but all saves must go through the Lokalblick API
- do not persist business data in localStorage, IndexedDB or browser files
- do not let frontend write directly to Excel, SharePoint, SQL or source systems
- Lokalblick-created entities and overlays must be stored in backend-controlled persistence
- synthetic public demo browser storage is the only exception
