# Lokalblick architecture

## Separation

```
frontend/
  UI, tables, charts, forms
  services/data-service.js   <- public demo adapter
  data/demo-data.js          <- synthetic data only

backend/
  API contract
  authentication boundary
  M365 repository boundary
  server-side LEB refresh
```

The frontend must not know whether production data is stored in SharePoint
Lists, Dataverse, or another approved Microsoft 365 store. It only knows the
API contract.

## Environments

### Public demo
GitHub Pages. Synthetic data only. No LEB import. No company data.

### Company / Teams
Authenticated with Microsoft Entra ID. The same frontend is hosted inside the
company environment and points to the authenticated backend. The backend reads
and writes the approved Microsoft 365 data sources.

## Migration rule

UI and business logic stay reusable. Only these adapters change:

```
demo dataService  ->  m365 API dataService
demo auth         ->  Entra ID
GitHub Pages      ->  company-hosted web app / Teams tab
```


## Map boundary

The public demo may use public map tiles with synthetic coordinates only. Production property addresses are not geocoded from the browser. Coordinates are supplied by the authenticated backend using an organization-approved map/geocoding provider.


## Provider adapters

Lokalblick is intentionally provider-neutral.

### Map

```
app.js
  -> LokalblickMapService
      -> LeafletMapAdapter (demo)
      -> AzureMapsAdapter (future)
      -> MapboxAdapter (future)
      -> customer GIS adapter (future)
```

The UI never calls a map SDK directly.

### Data

```
Lokalblick API
  -> LokalblickRepository
      -> M365SourceAdapter
      -> ExternalApiSourceAdapter
      -> SQL/Dataverse adapter
      -> other customer source adapters
```

All adapters return the same normalized Lokalblick model. Teams is one host, not the product boundary.


## Public vs private security boundary

The user-facing architecture is intentionally explained as three zones:

1. Public/external Lokalblick product: UI, map rendering and sign-in shell.
2. Authenticated API/connector boundary: authorization, normalization, filtering and logging.
3. Customer-controlled private data environment: master data, raw documents, system credentials and source APIs.

Only the records and fields an authenticated user is authorized to view cross from the private environment to the frontend. Source credentials and raw master data never belong in public frontend assets.


## Backend is the persistence authority

For every non-demo runtime, the backend is the single persistence authority.

The frontend may:
- fetch data from the Lokalblick API
- display data
- edit data in forms
- hold temporary unsaved UI state

The frontend must not:
- persist business data in localStorage, IndexedDB or browser files
- become a second source of truth
- write directly to Excel, SharePoint, SQL or other source systems
- store API keys, credentials or source-system secrets

Every saved create/update/delete action goes through the Lokalblick API and is persisted by the backend.

Source/master data such as LEB may remain read-only in its source system. Lokalblick-created data and overlays — including projects, people, assignments, maintenance, drift issues, wishes, investigations, budgets, coordinates and object complements — are persisted in backend-controlled storage.

The public GitHub Pages demo is the only exception: synthetic demo state may use browser storage because it contains no real customer data.


## Annual budget invariant

Lokalblick treats the annual budget as a decision baseline, not as a live sum that changes when source details change.

For each year:

1. Current detail records form the budget proposal basis.
2. The user may add explicit positive or negative adjustment amounts at the relevant budget category.
3. The annual budget is the frozen detail snapshot plus those explicit adjustment amounts.
4. When the budget is locked, its detail snapshot, adjustments, targets and lock metadata are immutable baseline data.
5. Later changes to maintenance, projects, operations, wishes and other source details feed the current forecast, not the locked budget.
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

Maintenance planning is kept on the same maintenance record; the planner does not create duplicate planning objects.

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
- the UI may show quarterly and monthly views of the same record, but there is only one maintenance item in persistence
