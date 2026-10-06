# Lokalblick

Lokalblick är en styrningsapp för LEB-baserad fastighets- och avtalsdata med årsbudget, projekt, underhåll, drift, önskemål, personer och ansvar.

## Arkitektur

```text
frontend/
  UI, tabeller, diagram, formulär
  services/data-service.js       <- demo/local Excel-adapter
  services/geocoding-service.js <- backendägd koordinatberikning

backend/
  server.mjs                     <- lokal company-runtime på 127.0.0.1:8787
  api/openapi.yaml               <- API-kontrakt
  src/data-repository.js         <- provider-neutral data boundary
  src/geocoding-service.js       <- Azure Maps adapter
  src/coordinate-store.js        <- backendägt koordinatoverlay
```

### Geokodning

Riktiga fastighetsadresser geokodas inte i den publika frontend-klienten. I company-runtime går adressen till den lokala Lokalblick-backenden, som återanvänder sparad koordinat när adressen är oförändrad och annars geokodar via Azure Maps. Koordinaterna sparas i backendens coordinate overlay.

Azure Maps batch-geokodning stöder upp till 100 adresser per synkront anrop, så Lokalblick delar större importer i block om 100.

### Lokal company-runtime

Starta på Windows 365:

```powershell
npm run company
```

Öppna sedan `http://127.0.0.1:8787`.

Sätt `AZURE_MAPS_SUBSCRIPTION_KEY` i den lokala miljön. Den riktiga nyckeln ska aldrig läggas i GitHub. För produktion bör backend gå över till Microsoft Entra ID/managed identity.

## Frontend

Frontend innehåller UI, tabeller, diagram, formulär och verksamhetslogik.

Den publika Vercel/GitHub-versionen använder endast syntetisk demodata som standard. Verklig företagsdata och hemligheter ska stanna bakom den lokala/autentiserade backend-gränsen.

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

**Publik demo:** GitHub Pages/Vercel, endast demodata.

**Företagsversion:** samma frontend, men med lokal/autentiserad backend, Entra ID och företagets M365-lagring.

Se även `ARCHITECTURE.md` och `backend/README.md`.

## Om-flik och säkerhetsgräns

Appens **Om**-flik visar användaren vad som kan vara publikt och vad som ska stanna i kundens skyddade hemmamiljö. Lokalblicks frontend kan vara internetåtkomlig, medan masterdata, råfiler, API-nycklar och systemhemligheter hålls bakom ett autentiserat API/connector-lager.

## Persistensprincip

**Backend äger all beständig data.**

LEB/Excel är master för källdata. Backend äger Lokalblicks kompletteringar och overlays, inklusive geokoordinater. Excel skrivs aldrig automatiskt om.
