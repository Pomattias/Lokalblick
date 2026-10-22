# Lokalblick architecture

This describes the implemented `utveckling` runtime. Start with
[the developer guide](docs/DEVELOPER_START.md) for the reading order,
terminology and a five-day introduction. Older dated documents record decisions
at that time; the definitions in `frontend/lokaler/model.js`, `finance-model.js`
and `maintenance-model.js` describe the current clean storage schema.

## Active app and model boundaries

`frontend/v2/` is the only active UI. `frontend/lokaler/` holds the clean storage
model and adapters used by that UI; it is not a second app. The older company
and source-workbook flows remain supported through compatibility adapters.

```text
V2 UI and view model (contracts, activities, assignments)
  -> frontend/v2/transport.js
  -> frontend/lokaler/workspace-transport.js
      -> local browser workspace / browser Excel
      -> local SQLite or server Excel API
      -> older company or source-workbook transport
```

`view-fields.js` translates field names. `view-adapter.js` projects clean data
into the V2 view and collects edits back into storage. For example, `agreements`
becomes `contracts`, `issues` becomes `activities`, and `contacts` becomes
`assignments`. Derived views do not create duplicate stored facts.

Clean recurring costs belong to properties. Each agreement item carries its
own amount, period and adjustment rules. Older source/company formats retain
read compatibility; a shared UI does not mean their persisted formats match.

## Implemented runtimes

| Runtime | Entry point | Persistence authority |
| --- | --- | --- |
| Synthetic demo, including public Pages/Vercel | `frontend/v2/index.html`; `npm run company` serves it locally | Demo service in browser storage |
| Clean local browser workspace | `withCleanWorkspace`, selected in Datakällor | IndexedDB until a workbook is attached |
| Clean browser Excel | `BrowserExcel` through `withCleanWorkspace` | Explicitly selected local workbook; IndexedDB retains the handle |
| Local SQLite | `npm run lokaler` -> `backend/lokaler/server.mjs` | `LocalStore`, default `local-data/lokaler.sqlite` |
| Local server Excel | `npm run lokaler:excel` | `LocalStore`, default `local-data/lokaler.xlsx` |
| Older company-local API | `npm run company:api` -> `backend/company/server.js` | Read-only LEB source plus backend JSON overlays |
| Older source-workbook mode | `frontend/services/source-service.js` | Selected workbook; changes remain pending until write succeeds |

`npm run company` starts `backend/server.mjs`: assets, geocoding and budget
index endpoints. It is not the general business-data persistence API.
The company-local and lokaler servers bind to loopback by default and enforce
local request boundaries. They do not implement Entra ID sign-in.

Use Node.js 24 LTS for local development and CI. The lokaler store uses
`node:sqlite`. The older `engines >=20` declaration covers earlier runtime
paths and does not establish SQLite support on Node 20.

## Persistence and private-data boundary

In API runtimes, saved changes go through the selected backend. In browser
workspace/Excel runtimes, local browser storage and direct workbook access are
implemented features. They must not be mistaken for API persistence or a
completed centrally authenticated deployment.

Imported source files remain read-only. Saving a Lokalblick workbook, whether
through the browser or local server, writes the explicitly chosen working file.
See [START-LOKALER.md](START-LOKALER.md) for concurrency, backups and file limits.
The public demo uses synthetic data. Real company data, raw documents and
credentials belong in an approved company environment, outside Git and public
preview environments. Never place provider secrets in frontend assets.

## Import and mutation boundaries

Import schema/aliases live in `frontend/lokaler/import-schema.js`. Stable
identity helpers live in `import-identities.js`; their hash inputs must remain
compatible with saved provenance and reimports. `prepareCleanImport` works on
copies, validates records and creates review entries. `import-result.js`
validates the complete prepared data and adds counts, receipts and audit history.
Preparing an import does not persist it. The UI reviews the result, then uses
the selected transport to save it.

The row checkpoint mechanism retains an already validated portion of a source
row if a later dependent record fails. It does not relax identity, relation or
financial validation. Regression examples live in `tests/import-completion.test.js`
and `tests/table-import.test.js`.

UI budget buttons are routed by `frontend/v2/budget-actions.js`. The existing
app mutation function remains responsible for validation, audit, persistence
and rollback. Calculations stay in `frontend/domain/calculations.js`; historical
budget operations stay in `frontend/domain/budget-followup.js`.

## Provider targets and geocoding

Authenticated Entra ID/M365 access, external APIs and further database
providers are architectural targets. `backend/src/data-repository.js` and the
M365/external API adapters include unimplemented methods. Do not assume these
are working integrations from their class names or API contract alone.

A future hosted company runtime must authorize the records and fields returned
to each user. Source credentials and raw master files stay behind that boundary.
Teams is a possible host, not a separate product or storage model.

Map presentation uses `LokalblickMapService` and the Leaflet adapter. Production
addresses are geocoded through an organization-approved backend provider; the
local backend supports Azure Maps. Public demo maps use synthetic positions.

## Annual budget invariant

Lokalblick treats the annual budget as a decision baseline, not as a live sum that changes when source details change.

For each year:

1. Current detail records form the budget proposal basis.
2. The user may add explicit positive or negative adjustment amounts at the relevant budget category.
3. The annual budget is the frozen detail snapshot plus those explicit adjustment amounts.
4. When the budget is locked, its detail snapshot, adjustments, targets and lock metadata are immutable baseline data.
5. Later changes to activities and recurring costs feed the current forecast, not the locked budget.
6. Actual cost is tracked separately from both budget and forecast.
7. Every budget/forecast/actual amount must remain traceable to where the cost belongs and when it is expected or incurred.

The conceptual model is:

```
detail need -> budget proposal -> locked annual budget -> forecast -> actual
```

A budget adjustment must never be hidden by rewriting source detail estimates. Example:

```
maintenance detail basis   453 700
budget adjustment           46 300
locked maintenance budget  500 000
```

The backend is the persistence authority for locked annual budget snapshots in production.


## Maintenance planning invariant

Maintenance planning is kept on an activity record of type Underhåll; the planner does not create duplicate planning objects.

Optional planning fields:

```
planningQuarter: 1..4 | null
planningMonth: 1..12 | null
```

Rules:
- quarterly planning is the default overview
- monthly planning is an optional refinement
- a month implies its quarter
- selecting a quarter clears a previously selected month
- clearing planning removes both fields
- changing timing changes the current plan/forecast, not an already locked annual budget snapshot
- the UI may show quarterly and monthly views of the same record, but there is only one activity in persistence


## Planning roll-up invariant

Lokalblick has one planning model, not separate property and portfolio plans.

Planning period fields live on the underlying work item and roll up through every view:

```
detail item -> property -> organizational area -> portfolio
```

The unified annual plan includes:
- activities of type Underhåll
- activities of type Projekt, Utredning and Drift with a planned cost
- separate recurring costs on properties or agreements

Quarterly planning is the default overview. Monthly planning is an optional refinement of the same item.

Changing a period in any planning view changes the same underlying item. Portfolio and property views only aggregate those records; they do not persist duplicate planning rows.

Roll-ups must support at least:
- cost and item count per Q1-Q4 or month 1-12
- cost by activity type, and separately recurring expenses
- cost and unplaced item count by property
- filtering by organizational area and current portfolio scope
- traceability from aggregate cost to the exact source item

Locked annual budget snapshots remain unchanged by later planning movements. Planning changes feed the current forecast and operational view.


## Selection and perspective UX invariant

Lokalblick does not have a separate "Helhet" module.

The interface is driven by two independent concepts:

```
selection + perspective
```

Selection answers **what the user is looking at**:
- Alla
- organizational area
- property
- contract / local detail when relevant

Perspective answers **what the user wants to see**:
- Alla
- Fastigheter
- Ärenden (with type filters for Underhåll, Projekt, Drift, Önskemål, Utredning)
- Avtal

Every perspective follows the same visual rule:

1. show a concise summary for the current selection at the top
2. show the source details that build that summary immediately below
3. drilling down changes the selection, not the underlying object identity
4. changing a detail updates all summaries that aggregate that same object

Example:

```
Alla + Underhåll
Vårdbo + Underhåll
Solgården + Underhåll
```

are the same Underhåll perspective at three different zoom levels.

"Alla" is a state, not a module. Organizational area/property is selection. Underhåll/Projekt/Drift/Önskemål are filters of the same Ärenden perspective; Avtal remains part of Bestånd.


## Shared selection invariant

Selection is application state, not page state.

The same current scope must follow the user between Bestånd, activities, map and economy views:

```
area / responsible / property / contract
            ↓
   shared selection state
            ↓
Bestånd · Aktiviteter · Karta · Ekonomi
```

Rules:
- changing area, responsible person, property or contract updates the shared scope
- navigating to another perspective keeps that scope
- aggregates are recalculated from the same underlying records inside the scope
- editing a source record changes every aggregate that includes that record
- clicking a property on the map changes the shared property selection and opens that property context
- annual budget decisions remain portfolio-wide until explicit allocation of budget adjustments to lower levels is modeled; filtered views therefore show scoped detail/baseline, forecast and actual without editing the global adjustment
