# Lokalblick – Copilot repository instructions

## Branch and Git safety

- Work only on branch `utveckling`.
- Never commit, merge, push, rebase, reset or otherwise modify `main`.
- At the start of every task run:
  - `git status`
  - `git branch --show-current`
  - `git rev-parse HEAD`
- If the current branch is not `utveckling`, stop and switch to `utveckling` before editing.
- Make small, descriptive commits on `utveckling`.

## Read before changing code

Read these files first:
1. `README.md`
2. `ARCHITECTURE.md`
3. `backend/README.md`

Then inspect the relevant frontend/backend code.

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

Do not couple the UI directly to M365, Excel, SQL, a specific property system or a map vendor when an adapter boundary exists.

## Verification

Before committing:
- run `npm test`
- review `git status`
- confirm no real data, local paths or secrets were added
- summarize changed files and commits
