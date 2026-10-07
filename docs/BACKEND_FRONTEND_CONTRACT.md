# Backend/frontend contract

The company server serves the existing frontend assets from the same origin.
For the local company runtime only, the server supplies an API-backed
`/services/data-service.js`; the repository's public-demo frontend and its
synthetic browser-storage exception remain unchanged.

## Bootstrap and workspace

- `GET /api/bootstrap` returns `properties`, `contracts`, and the user-owned
  collections used by the UI.
- `PATCH /api/workspace` accepts user-owned collections and applicable
  property/contract overlays and coordinates. LEB core fields are never
  written to Excel or accepted as master-data updates.
- The company runtime saves the complete UI workspace through this endpoint;
  only backend-owned collections, coordinate overlays, and contract overlays
  are persisted.
- Browser storage is not used by the company runtime.

## Record APIs

User-owned entities support `GET /api/{entity}`, `POST /api/{entity}`,
`GET /api/{entity}/{id}`, `PATCH /api/{entity}/{id}`, and
`DELETE /api/{entity}/{id}`. Canonical business entities are
`organizations` (shown as **Parter** in the UI/Excel), `people`,
`activities`, `orders`, `maintenance-status`, `operations`,
`budget-data`, and overlays.

Responsibility is explicit rather than generic. A property overlay may carry
`ownerPartyId`, `ownerResponsiblePersonId`, and `responsiblePersonId`
(our property responsibility). A contract overlay may carry
`businessPartyId`, `businessName`, and `businessResponsiblePersonId`.
An activity may carry its own `responsiblePersonId`; it is intentionally
independent from the property's responsible person. Orders are separate
records linked by `activityId`.

`contacts` and legacy `assignments`, `projects`, `maintenance`,
`drift-issues`, `wishes`, and `investigations` are migration inputs
only and are not active API entities. Existing external contacts are migrated
to the explicit property/contract responsibility fields. Existing order
fields on activities are migrated to `orders`.

Properties and imported contracts are read-only LEB core. Their DELETE
operations persist backend tombstones; editable property and contract
completions belong in property overlays and contract overlays.

## Source APIs

- `GET /api/health` returns service health.
- `GET /api/source/status` returns counts, source type, file-found state, and
  modification time only.
- `POST /api/source/refresh` reloads the configured LEB and merges it with
  backend persistence.

The client must never send a filesystem path, workbook, credential, or direct
source-system write request.


## Budget persistence

Working budget values are calculated live from agreements, activities and
orders. `budget-data` keeps the budget header/metadata and UI workspace
metadata. Budget rows become a frozen snapshot only when a budget is locked.
After locking, follow-up compares the frozen budget with current forecast,
ordered values and outcome without rewriting the locked baseline.
