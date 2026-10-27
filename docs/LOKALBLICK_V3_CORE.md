## Native v3 registers and local API

The v3 release is a **fresh database**. There is no migration, legacy mapping,
JSON workspace replacement, or preservation of prior v2 records.

Start on a private Windows 365 computer or other trusted local machine:

```sh
LOKALER_SCHEMA=v3 npm run lokaler
```

On Windows PowerShell, use:

```powershell
$env:LOKALER_SCHEMA = 'v3'
npm run lokaler
```

The server runs on **127.0.0.1:8790**. Open
`http://127.0.0.1:8790/` to use the v3 core screens:
Fastigheter, Objekt, Avtal, Parter och Personer.
Set `LOKALER_FILE` to a private path to select a different fresh database.
The default v3 file is under the current user's private app-data directory,
not the Git repository.

`GET /api/v3/core?date=YYYY-MM-DD` reads dated versions, party-person roles,
inherited contacts and rent items. `POST /api/v3/core` saves one explicit
command per optimistic-concurrency transaction. It does **not** accept v2
workspaces. In v3 mode, the earlier `/api/lokaler` endpoints are disabled.

Object identity remains stable; the command `reviseObject` adds a later dated
version without replacing earlier measurements. `reviseAgreement` likewise
preserves old contract terms. `setRole` closes a previous assignment before
saving a new person/party link at a new date. Inheritance is resolved on read.
The API also supports parties, people, party affiliation and dated rent items.

**Current scope:** these are the first native, server-backed v3 core screens.
The former v2 frontend and its Excel/budget/import workflows are not connected
to the v3 database. The new model continues to be implemented in separate,
testable stages; unrelated v2 features are not silently given write access.

Verification: `npm run test:db-v3`, `node --test tests/lokalblick-v3-core-api.test.js`,
and the full `npm test` suite.
