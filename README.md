# Lokalblick

Lokalblick är en fastighetsapp för fastigheter, objekt, avtal, parter, personer,
ansvar, ärenden, beställningar, löpande kostnader och årsbudget. Projekt,
underhåll, drift, önskemål och utredningar är ärendetyper.

## Börja här

Ny utvecklare: följ [första veckans läsordning och övningar](docs/DEVELOPER_START.md).
Använd **Node.js 24 LTS**, samma version som CI och den lokala SQLite-servern.

```sh
npm ci
npm test
npm run company
```

Öppna `http://127.0.0.1:8787`. Detta startar frontend med syntetisk demo samt
lokala hjälp-API:er för geokodning och budgetindex. Det ansluter inte automatiskt
företagets data. Azure Maps-nyckel behövs bara för geokodning.

## Körlägen och lagring

| Kommando/läge | Beständig lagring | Startadress |
| --- | --- | --- |
| `npm run company`, demo | Syntetisk demo i webbläsaren | `http://127.0.0.1:8787` |
| Ren arbetsyta i webbläsaren | IndexedDB, eller aktivt ansluten lokal Excel-arbetsbok | Samma frontend |
| `npm run lokaler` | Backendägd SQLite | `http://127.0.0.1:8790` |
| `npm run lokaler:excel` | Backendägd Excel-arbetsbok | `http://127.0.0.1:8790` |
| `npm run setup:company`, sedan `npm run company:api` | Äldre LEB-läsning och backendägd JSON med kompletteringar | `http://127.0.0.1:8787` |

Publik GitHub Pages/Vercel-demo använder syntetiska data. Företagsdata och
hemligheter ska stanna i godkänd företagsmiljö. Entra ID/M365 är en målarkitektur;
de lokala servrarna innebär inte en färdig autentiserad M365-integration.
M365- och externa API-adaptrar är ännu inte kompletta.

## Kodens ingångar

```text
frontend/v2/                 aktivt gränssnitt och beräknad läsvy
frontend/lokaler/            ren datamodell, import och lokal Excel-transport
frontend/domain/             gemensamma affärsregler och budgetberäkningar
frontend/services/           tjänster och äldre käll-/Excelkompatibilitet
backend/lokaler/             SQLite- eller Excel-lagring via lokalt API
backend/company/             äldre LEB-adapter och JSON-kompletteringar
backend/server.mjs           frontendserver, geokodning och index-API
backend/src/                 geokodning och framtida adaptergränser
```

`frontend/index.html` leder till `frontend/v2/index.html`. Den separata
prototypens startsida under `frontend/lokaler` leder också till samma app.
V1:s separata gränssnitt är avvecklat. V2 använder en beräknad läsvy av den rena
modellen. Externa källunderlag mappas vid import; interna prototypformat
konverteras inte. Se [aktuell modell](docs/CURRENT_MODEL_AND_TESTS.md).

## Data och sparning

Lagringsägaren beror på körläget. Backend äger sparning i API-lägena.
I det lokala webbläsarläget sparar appen i IndexedDB eller en uttryckligen
ansluten Excel-arbetsbok. Källunderlagen för import skrivs inte om.
Läs [arkitekturen](ARCHITECTURE.md) för gränserna och
[startguiden](START-LOKALER.md) för filkonflikter, behörigheter och backup.
Den äldre företagsanslutningen beskrivs i [company-guiden](docs/COMPANY-LOCAL-SETUP.md).

Geokodning av riktiga adresser ska ske genom en godkänd backend. Lokal
geokodning använder Azure Maps och återanvänder koordinater för oförändrade
adresser. Nyckeln ligger i lokal servermiljö, aldrig i Git eller klientkod.
Batchar delas i högst 100 adresser.

## Tester

`npm test` kör domän-, relations-, import-, Excel-roundtrip- och API-tester
samt syntax/preflight. Med Chromium installerat via
`npx playwright install chromium` körs även exempelvis
`npm run test:integration-browser`. Se utvecklarguiden för testernas olika
Chromium-inställningar. Testa med syntetiska data; håll företagets arbetsfiler
utanför repot och publika utvecklingsmiljöer.

## Importens beteende

Se [komplettering med lokaldata](docs/LOCAL_DATA_IMPORT.md) för återanvändning
av avtal, objekt och fastigheter samt övergripande val vid stora importer.

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

## Aktuell modell och verifiering

Vi bygger en ny app. Interna prototypmodeller migreras inte och borttagna fält
arkiveras inte. Skapa en ny ren arbetsyta för aktuell modell; externa Excelunderlag
kan läsas genom den granskade importen. Se [modell och testbeslut](docs/CURRENT_MODEL_AND_TESTS.md).

För kontrollerat skapande av fastigheter, objekt och avtal vid import, se
[Granskad import](docs/SAFE_IMPORT.md).
