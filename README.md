# Lokalblick

Lokalblick är en fastighetsapp med **en** datamodell: fastigheter, objekt, avtal, parter, personer, ansvar, ärenden, beställningar, löpande kostnader och årsbudget. Projekt, underhåll, driftärenden, önskemål och utredningar är ärendetyper – inte separata tabeller.

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

- Fastighet → objekt → avtal med en riktig part som ägare/hyresgäst och separata verksamhetsrelationer
- Gemensamma **Ärenden** för projekt, underhåll, drift, önskemål och utredningar; tidplan, journal, ansvar och kostnad
- **Löpande kostnader** direkt på fastighet eller avtal, årsbudget och årsvis utfall
- Beställningar kopplade till ärenden, inte duplicerade på varje ärendetyp
- KPI-regler för ordinarie avtalshyra separat från manuella **budgetscenarier**
- Låsta årsbudgetar, prognos, uppföljning, källspårbarhet och ansvarshistorik
- Import av externa Excel-/LEB-källor utan att skapa gamla Lokalblick-tabeller

## En enda aktiv app

`frontend/index.html` leder alltid till `frontend/v2/index.html`. V1:s separata gränssnitt, CSS och tabellmigreringar är borttagna på `utveckling`. Ingen konvertering av tidigare Lokalblick-datamodeller görs. Import från externa system är däremot en aktiv funktion.

## Miljöer

**Publik demo:** GitHub Pages/Vercel, endast demodata.

**Företagsversion:** samma frontend, men med lokal/autentiserad backend, Entra ID och företagets M365-lagring.

Se även `ARCHITECTURE.md` och `backend/README.md`.

## Om-flik och säkerhetsgräns

Appens **Om**-flik visar användaren vad som kan vara publikt och vad som ska stanna i kundens skyddade hemmamiljö. Lokalblicks frontend kan vara internetåtkomlig, medan masterdata, råfiler, API-nycklar och systemhemligheter hålls bakom ett autentiserat API/connector-lager.

## Persistensprincip

**Backend äger all beständig data.**

LEB/Excel är master för källdata. Backend äger Lokalblicks kompletteringar och overlays, inklusive geokoordinater. Excel skrivs aldrig automatiskt om.

## Körning och tester

- Starta lokal företagsmiljö med `npm run setup:company` och `npm run company:api`, enligt `backend/README.md`.
- Lokal privat Excelarbetsfil stöds. Källfiler och originalavtal förblir i godkänd företagsmiljö.
- Arkitekturen kan på sikt använda intern eller extern databas genom samma autentiserade API; M365- och externa API-adaptrar är ännu inte kompletta.
- `npm ci && npm test` kör domän-, relations-, import-, Excel-roundtrip- och API-tester samt preflight.
- `npx playwright install chromium` och `npm run test:integration-browser` är separat webbläsarregression.

All företagsdata, filer och hemligheter ska ligga utanför GitHub och Vercels publika demomiljö. Den gamla V1-vyn kan inte längre väljas.

### Ren datamodell i den befintliga appen

Förstasidan, kartan och arbetsflödena i `frontend/v2` används med den nya rena
modellen i `frontend/lokaler`. Granskad Excelimport fördelar källrader till
fastigheter, objekt, avtal, personer och personkopplingar. Kör `npm run lokaler`
för lokal SQLite-lagring, eller anslut en lokal Excel-arbetsbok i webbappen.
Den separata prototypens startsida leder nu till den befintliga appen.
Se [startguide och datamodell](START-LOKALER.md).

Ärenden utan ÄrendeID får ett beständigt nummer, exempelvis `ÄR-000001`.
Saknad eller osäker fastighets-/objektkoppling visas under **Ärenden → Status →
Att koppla**. Välj koppling via Redigera → Fler uppgifter; nummer, personansvar
och historik behålls. Inga tillfälliga fastigheter eller extra att-göra-poster skapas.

Återimport från samma fil och flik använder sparad källidentitet, inte radnummer.
Omflyttade rader stöds, liksom ändrade belopp och datum när ärendenamn och
källans kopplingsuppgifter fortfarande är entydiga. Dubbletter och osäkra
nya/ändrade rader granskas. Ange det skapade ÄrendeID i underlaget när namn eller
koppling ändras, eller när underlaget byter fil-/fliknamn. Källidentitet och
nummerserie sparas lokalt i samma Excel-arbetsbok eller SQLite-databas som övriga
uppgifter. Ursprungliga källfiler skrivs inte om.

Importen granskas och sparas samlat, med återkoppling per berört register i ordningen
Fastigheter → Objekt → Avtal → Ärenden. Valfria datum, tal och länkar som inte kan
tolkas lämnas för komplettering; övriga säkert kopplade uppgifter läses in. Tidigare
sparade värden behålls. Ekonomiska villkor, besiktningsresultat, identifierare och
relationer måste fortfarande valideras. Återkommande problem grupperas i
granskningen, medan varje berörd post, källfil, flik, rad och felvärde finns kvar.
