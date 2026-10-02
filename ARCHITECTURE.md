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
