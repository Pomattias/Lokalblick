# Lokalblick

Lokalblick är en styrningsapp för LEB-baserad fastighets- och avtalsdata med årsbudget, projekt, underhåll, drift, önskemål, personer och ansvar.

## Arkitektur

Projektet är nu delat i två tydliga lager:

```
frontend/
  index.html
  app.js
  styles.css
  data/demo-data.js
  services/data-service.js
  services/m365-api-service.js

backend/
  README.md
  api/openapi.yaml
  src/data-repository.js
```

### Frontend

Frontend innehåller UI, tabeller, diagram, formulär och verksamhetslogik.

Den publika GitHub Pages-versionen använder **endast syntetisk demodata**. Den har ingen Excel-/LEB-import och får inte användas med verklig företagsdata.

### Backend

Backend är säkerhets- och datagränsen för den framtida företagsversionen. Den ska:

- autentisera användaren med Microsoft Entra ID
- kontrollera behörighet
- läsa och skriva SharePoint / Microsoft Lists / Dataverse
- hämta aktuell LEB-fil från företagets SharePoint server-side
- normalisera SF + EXT utan att råfilen går genom den publika klienten
- bevara kompletteringar och ansvarshistorik
- bygga årsbudget från avtal och tidsatta behov

## Nuvarande funktioner

- Fastighet och Objekt/Avtal
- VÅRDBO, ORDBO, Myndighet/Stab och Hälsa & Förebyggande
- tre personnivåer: vår organisation, hyresgästen och fastighetsägaren
- ansvar på fastighet, objekt, projekt, driftärende, önskemål och UH-status
- årsbudget för hyra + drift, projekt, underhåll, driftkostnader och utredningar
- projekt med tidplan, inflyttning och budgetdelar
- underhållsstatus
- driftärenden
- önskemålslista
- budgetkoppling från tidsatta behov

## Miljöer

**Publik demo:** GitHub Pages, endast demodata.

**Företagsversion / Teams:** samma frontend, men med `m365-api-service`, Entra ID och företagets backend/M365-lagring.

Se även `ARCHITECTURE.md` och `backend/README.md`.


## Om-flik och säkerhetsgräns

Appens **Om**-flik visar användaren vad som kan vara publikt och vad som ska stanna i kundens skyddade hemmamiljö. Lokalblicks frontend kan vara internetåtkomlig, medan masterdata, råfiler, API-nycklar och systemhemligheter hålls bakom ett autentiserat API/connector-lager.
