# Lokalblick backend task — company-local v1

Status: READY FOR IMPLEMENTATION

This document is the authoritative implementation specification for the current Copilot backend task.

## Branch and scope

Work on the existing Copilot agent branch created from base branch:

`copilot-backend`

Do not modify:
- `frontend/**`
- `utveckling`
- `main`

If backend work requires a frontend contract change, document it in:

`docs/BACKEND_FRONTEND_CONTRACT.md`

Do not edit frontend code.

## Core architecture rule

For every non-demo runtime, backend is the only source of truth for persisted Lokalblick data.

Frontend may:
- fetch through Lokalblick API
- display data
- edit forms
- hold temporary unsaved UI state

Frontend must not:
- persist business data in localStorage
- persist business data in IndexedDB
- use browser files as a datastore
- write directly to Excel, SharePoint, SQL or other source systems
- contain source-system credentials or API secrets

All persisted changes follow:

Frontend -> Lokalblick API -> backend -> backend-controlled persistence

The public synthetic GitHub Pages demo is the only exception where browser storage may be used.

LEB/Excel is read-only source/master data for selected core fields. Lokalblick never writes back to LEB.

## Goal

On a Windows 365 machine, a user should later be able to run:

```bash
npm run setup:company
npm run company
```

and open:

`http://127.0.0.1:8787`

The real LEB workbook remains outside this Git repository in a local or OneDrive/SharePoint-synced company folder.

No real company data is needed or permitted for implementation.

## 1. local-company source adapter

Create a provider-neutral adapter, e.g.:

`backend/src/adapters/local-company-source-adapter.js`

Read the workbook path only from environment configuration:

`LOKALBLICK_LEB_PATH`

The browser/client/API must never be allowed to submit arbitrary local filesystem paths.

Use an appropriate maintained Node Excel library such as `exceljs` unless the repository already has a better fit.

## 2. LEB normalization

Read worksheets:

- `SF`
- `EXT`

### SF columns

- Förvaltningsobjekt
- Avtalsnummer
- Kostnadsställe
- Gatuadress
- Kundtyp avtal
- Area
- Avtalstyp
- Ursprungligt giltigt fr.o.m.
- Aktuellt giltigt t.o.m.
- Förlängningstid
- Uppsägningstid
- Uppsagd den
- Uppsägningsorsak
- Säg upp senast
- Lokalkategori
- Användning
- Fastighetsförvaltare

### EXT columns

- Förvaltningsobjekt
- Avtalsnummer
- Fast.bet.
- Adress
- Lev.namn
- Area
- Avtalstyp
- Ursprungligt giltigt t.o.m.
- Aktuellt giltigt t.o.m.
- Förlängningstid
- Uppsägningstid
- Uppsagd den
- Uppsägningsorsak
- Säg upp senast
- Lokalkategori
- Användning
- Handläggare (id)

### Important semantic difference

SF contains:

`Ursprungligt giltigt fr.o.m.`

EXT contains:

`Ursprungligt giltigt t.o.m.`

These MUST remain separate semantic fields and must not be normalized into the same meaning.

### Stable identities

Property:

`propertyId = Förvaltningsobjekt`

Contract/object for SF:

`contractId = SF|<Avtalsnummer>`

Contract/object for EXT:

`contractId = EXT|<Avtalsnummer>`

Never use address as a primary key.

One property may have multiple contracts/objects.

## 3. Backend-controlled persistence

Create separate backend persistence for all Lokalblick-owned data.

For company-local v1 a server-side JSON file is acceptable.

Configure it through:

`LOKALBLICK_DATA_PATH`

This file is backend storage. Frontend must never read or write it directly.

Persist Lokalblick-owned entities and data such as:

- organizations
- people
- assignments
- projects
- maintenance
- maintenanceStatus
- operations / drift costs
- driftIssues
- wishes
- investigations
- user-owned budget data
- coordinates
- comments/status data when present
- contract/object overlays

Contract overlays may include:

- annualRent
- annualContractDrift
- employees
- users
- rooms
- commonArea
- apartmentArea
- tenantOrgId
- ownerOrgId

Overlays are keyed by stable `contractId`.

A source refresh must preserve backend-owned data for stable IDs.

Write JSON atomically:

temporary file -> successful write -> rename/replace

Do not build event sourcing or an advanced audit engine in this version.

## 4. Coordinates

Support optional initial import from:

`LOKALBLICK_COORDINATES_PATH`

Example synthetic format:

```json
{
  "PROPERTY-ID": {
    "latitude": 55.6,
    "longitude": 13.0
  }
}
```

Key is `propertyId`.

After import/update, coordinates are backend-owned persisted Lokalblick data.

Do not implement automatic public geocoding.

A property without coordinates must still work normally; it simply will not be plotted on the map.

## 5. Local server

Implement a small Node server.

Defaults:

```text
LOKALBLICK_HOST=127.0.0.1
LOKALBLICK_PORT=8787
```

Allow binding only to:

- `127.0.0.1`
- `localhost`
- `::1`

Any other configured host must stop startup with a clear security error.

Do not enable permissive/open CORS.

Serve the existing frontend from the same origin without modifying `frontend/**`.

## 6. API

Implement at least:

### GET /api/health

Basic service health only.

### GET /api/source/status

Return only:
- source type
- file found
- SF row count
- EXT row count
- property count
- contract count
- last modified

Must not return:
- addresses
- person names
- landlords
- business/customer data
- filesystem paths
- credentials

### GET /api/bootstrap

Return the current merged model:

read-only LEB core + backend-persisted Lokalblick data

### PATCH /api/workspace

Persist Lokalblick-owned data server-side.

This is real backend persistence, not browser cache persistence.

Never write LEB core data back to Excel.

### POST /api/source/refresh

Re-read LEB and merge:

new read-only LEB core + existing backend persistence

### CRUD

Implement consistent backend CRUD for Lokalblick-owned entities, including delete where appropriate.

Validate entity names and payload shape.

The client must never be able to control local source/data filesystem paths via an API request.

## 7. Environment

Create:

`backend/.env.example`

with placeholders only:

```text
LOKALBLICK_SOURCE=local-company
LOKALBLICK_HOST=127.0.0.1
LOKALBLICK_PORT=8787
LOKALBLICK_LEB_PATH=
LOKALBLICK_DATA_PATH=
LOKALBLICK_COORDINATES_PATH=
```

Real `.env` and `.env.local` must remain ignored and untracked.

## 8. Setup command

Implement:

`npm run setup:company`

Interactively ask for:

1. local LEB workbook
2. backend data JSON path
3. optional coordinates JSON path

The setup command must:
- verify the workbook exists
- verify worksheets SF and EXT exist
- display only SF and EXT row counts
- create local `.env.local`
- never copy the workbook into the repository
- never print customer data
- never commit `.env.local`

## 9. Start command

Implement:

`npm run company`

It should start the application at:

`http://127.0.0.1:8787`

## 10. Persistence behavior

All user-created or edited Lokalblick data must be persistable server-side.

Examples:

- Person
- Organisation
- Assignment
- Project
- Maintenance
- MaintenanceStatus
- DriftCost / operations
- DriftIssue
- Wish
- Investigation
- user-owned budget data
- Coordinates
- Contract overlays

After save, `GET /api/bootstrap` must reflect the change.

A server restart/reload of persistence must not lose saved data.

## 11. Tests

Use synthetic fixtures only.

Test at minimum:

### LEB parsing
- SF parsing
- EXT parsing
- SF original valid FROM semantics
- EXT original valid TO semantics
- stable propertyId
- stable SF contractId
- stable EXT contractId
- multiple contracts on one property
- address is never used as an ID

### Persistence/merge
- LEB + backend data merge
- backend data survives source refresh
- backend data survives persistence reload/server restart
- removed source contract is not accidentally reused as another contract

### CRUD/API
- create
- update
- delete
- bootstrap reflects saved data

### Coordinates
- coordinates merge
- missing coordinates work

### Security
- default host is localhost
- non-local bind host is rejected
- source/status does not leak sensitive data or paths
- no tracked real data/secrets

### Scope
- `frontend/**` remains unchanged

## 12. Documentation

Create:

`docs/COMPANY-LOCAL-SETUP.md`

Title:

`Använd Lokalblick med företagets data på Windows 365`

Explain the flow:

SharePoint/Teams -> OneDrive-synced folder -> LEB -> Lokalblick backend -> Lokalblick API -> frontend

Document:

1. sync the company folder
2. locate LEB locally
3. run `npm run setup:company`
4. select LEB
5. select backend data file
6. optionally select coordinates file
7. run `npm run company`
8. open localhost

Explain clearly:

- GitHub Pages = synthetic demo
- Windows 365 localhost = real application
- LEB = read-only master source
- backend data = all user-created/edited Lokalblick data
- frontend = UI only

If a frontend contract change is needed, document it in:

`docs/BACKEND_FRONTEND_CONTRACT.md`

Do not modify frontend.

## 13. Security/data handling

Do not use or commit:
- real LEB files
- real company/customer data
- real addresses
- real person data
- customer-identifying Windows paths
- API keys
- credentials

Use synthetic fixtures only.

## 14. Final verification

Run:

```bash
npm test
git status
git diff --stat
```

Also run all new backend tests.

Verify:
- `frontend/**` unchanged
- `main` unchanged
- `utveckling` unchanged
- no tracked XLS/XLSX files
- no tracked `.env` or `.env.local`
- no credentials
- no real Windows/company paths in diff

Make small logical commits on the agent branch.

Do not merge into `utveckling` or `main`.

If creating a PR, use:

`base = copilot-backend`

## Final report

Return:
- working branch
- HEAD
- commits
- changed files
- dependencies
- API endpoints
- persistence model
- tests/results
- how `npm run setup:company` works
- how `npm run company` works
- exact Windows 365 steps for the user
- any frontend contract requirements
