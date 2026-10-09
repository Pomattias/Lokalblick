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
(our property responsibility). A contract overlay carries `tenantName` (hyresgäst, free text), `unitId`
(Verksamhet: VARDBO, ORDBO, MYND_STAB, HOF), and
`businessResponsiblePersonId` (Verksamhetsansvarig for that contract/object).
The older `businessPartyId` / `businessName` keys are compatibility data, not
the editable tenant or verksamhet fields.
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


## Model v5 workbook

The visible Lokalblick workbook is centered on Fastigheter, Avtal, Aktiviteter,
Beställningar, Parter, Personer, Budget, Budgetrader, Ändringslogg and Källor.
Older Kostnader and Status collections are accepted for compatibility and may
still feed calculations, but they are preserved as technical state instead of
being written as parallel visible business sheets. This avoids creating two
competing planning models while older data is migrated.

## Avtal contacts and verksamhet – October 2026

The contact owner and unit are intentionally independent:

- Property: `ownerPartyId` is the property owner organization; `ownerResponsiblePersonId` is the owner's contact; `responsiblePersonId` is our contact. These are selected in the property editor and only displayed in the contract.
- Contract/object: `tenantName` is arbitrary tenant text, `unitId` references Vårdbo/Ordbo/etc. and `businessResponsiblePersonId` is the verksamhetsansvarig linked to that contract.
- For one property with multiple contracts, each contract can have a different `tenantName`, `unitId` and `businessResponsiblePersonId`.
- Company runtime persists the editable contract fields via backend-owned contract overlays; the imported LEB core remains read-only.
- Source workbook export/import includes `Hyresgäst` and the existing `_unitId` / displayed `Verksamhet`. In the enrichment adapter, only an explicitly labeled `Hyresgäst` column populates `tenantName`: the unrelated legacy `Verksamhet` and `businessPartyId` fields must not silently become a tenant name.
- Legacy `businessPartyId`, `businessName`, `tenantOrgId` and old V1 source representations have not been deleted; retire them after source mapping and migration are validated against real company workbooks. Do not duplicate person data when linking contacts.
