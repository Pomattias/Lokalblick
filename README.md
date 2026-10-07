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

## Lokalblick V2 (separat migreringsversion)

Se `docs/LOKALBLICK_V2.md` för inventering, bevarandegräns, målarkitektur och wireframes.

- Publik/local demo: `npm run company`, öppna `http://127.0.0.1:8787/v2/index.html`.
- Befintlig frontend finns kvar på `/index.html`, med länk till V2.
- Lokal API-version: `npm run setup:company`, sedan `npm run company:api` och samma `/v2/index.html`. Den fungerande backendimplementationen från `copilot-backend` ligger isolerad i `backend/company/`. Den skriver kompletteringar till backendstore; INT/SF och EXT är read-only.
- Kanonisk Excel: anslut arbetsfilen under Datakällor. Ändringar hålls pending tills **Spara till Excel** lyckas. Projekt-, underhålls-, drift- och önskemålslistor går via granskningskö.
- `npm test` kör domän-, import-, binära Excel-roundtrip-, skrivfels- och API-persistenstester.
- `npx playwright install chromium`, sedan `npm run test:browser` för desktop/mobil. En befintlig Chromium kan anges med `CHROMIUM_EXECUTABLE_PATH`.

Verkliga arbetsfiler, dokument och företagsdata ska fortsatt ligga utanför repo. V2 är en stegvis migrering; den tidigare frontend behålls tills återstående specialflöden och verklig företagsanslutning verifierats.

## Aktuell frontend i utveckling

Startadressen öppnar Lokalblick V2. Budgetens låsbekräftelse (`danger`), versionshistorik och slutkostnad använder samma service i V2 och den tidigare vyn. Mobil och desktop använder samma färgvariabler. Den tidigare vyn finns på `index.html?legacy=1` och via länken **Tidigare vy**.

Verifiering: `npm ci`, `npm test`, `npx playwright install chromium --only-shell`, därefter `npm run test:browser`, `npm run test:integration-browser`, `npm run test:budget-browser` och `npm run test:map-browser`. Verklig företagsfil och Windows/OneDrive-filhandtag återstår att verifiera lokalt.
