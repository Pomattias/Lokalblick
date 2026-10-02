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
