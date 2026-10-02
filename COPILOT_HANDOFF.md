# Copilot handoff

Repository: `Pomattias/Mattias-testsida`

Working branch: `utveckling`

Protected-by-instruction branch: `main` — do not modify.

## Current handoff state

The repository is prepared for a Copilot implementation session. This file does not authorize any specific next feature by itself.

Start every implementation session with:

```bash
git status
git branch --show-current
git rev-parse HEAD
```

Expected branch:

```text
utveckling
```

Then read:

```text
.github/copilot-instructions.md
README.md
ARCHITECTURE.md
backend/README.md
```

Inspect all relevant code under:

```text
frontend/
backend/
```

Run the repository preflight before and after work:

```bash
npm test
```

## Data safety

Do not add real LEB files, real customer/company data, local Windows paths, credentials, tokens or API keys to this repository.

Use synthetic test data only.

The public GitHub Pages site is demo-only.

## Current branch baseline before this preparation

Before adding the Copilot preparation files, `utveckling` was:

```text
71f76dbbca93006ca707550559b085ba99ab00eb
```

At that time `main` was:

```text
6774aa95dccfe6395bfca421ed12ef308fa95c95
```

Do not use the baseline above as the expected current HEAD after preparation. Always run `git rev-parse HEAD`.
