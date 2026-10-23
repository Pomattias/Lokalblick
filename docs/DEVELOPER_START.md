# Första veckan i Lokalblick

Detta är läsordningen för en ny utvecklare på `utveckling`. Aktuella körlägen
finns i [arkitekturen](../ARCHITECTURE.md). Daterade beslutsdokument beskriver
beslut vid den tidpunkten. [Aktuell modell](CURRENT_MODEL_AND_TESTS.md) gäller
före äldre texter. Interna prototypformat migreras inte.

## Starta med syntetiska data

Använd Node.js **24 LTS**, samma version som CI. Den lokala SQLite-servern
använder `node:sqlite`; `package.json` anger fortfarande den äldre miniminivån
20 för andra körlägen. Alla kommandon körs från repots rot.

```sh
npm ci
npm test
npm run company
```

Öppna `http://127.0.0.1:8787`. Det visar V2 med syntetisk demo tills en annan
datakälla aktivt ansluts. Azure Maps-nyckel behövs bara för riktig geokodning.
Läs aldrig in företagets filer i en extern utvecklingsmiljö.

För den rena modellen med lokal databas: stoppa servern och kör
`npm run lokaler`, öppna `http://127.0.0.1:8790`. Databasen börjar tom.
`npm run lokaler:excel` använder i stället en lokal Excel-arbetsbok.
Se [startguiden](../START-LOKALER.md) för lagring, filbehörigheter och backup.

## Läs koden i denna ordning

| Fråga | Börja här |
| --- | --- |
| Hur startar appen? | `frontend/v2/index.html`, sedan `init()` i `frontend/v2/app.js` |
| Var definieras lagrade fält och relationer? | `frontend/lokaler/model.js`, `finance-model.js`, `maintenance-model.js` |
| Varför har vyerna andra fältnamn? | `frontend/lokaler/view-fields.js` och `view-adapter.js` |
| Hur väljs lagring? | `frontend/v2/transport.js` → `frontend/lokaler/workspace-transport.js` |
| Hur förbereds en import? | `services/import-engine.js` → `lokaler/import-schema.js` → `lokaler/import-model.js` → `lokaler/import-row-transaction.js` → `lokaler/import-result.js` (under `frontend/`) |
| Var beräknas belopp? | `frontend/domain/calculations.js`, `frontend/lokaler/finance-view.js` |
| Var hanteras budgetknappar och versioner? | `frontend/v2/budget-actions.js`, `frontend/domain/budget-followup.js` |
| Hur byts vy och editorläge? | `frontend/v2/navigation.js`, `editor-commands.js` och `editor-frame.js` |
| Var renderas vyerna? | `frontend/v2/views.js` är ingång; `view-portfolio.js`, `view-budget.js`, `view-planning.js` och `view-sources.js` äger respektive vy |
| Hur läses och kodas källarbetsböcker? | `frontend/services/source-workbook.js`; filhandtag och importorkestrering ligger i `source-service.js` |
| Var sparas den lokala databasen? | `backend/lokaler/server.mjs` → `backend/lokaler/store.js` |

Appen blandar ES-moduler med äldre skript som installerar `Lokalblick*` på
`globalThis`. `frontend/v2/index.html` visar laddningsordningen. Vid felsökning
av en saknad tjänst, kontrollera både skriptladdning och vald transport.

## Begrepp mellan lagring och vy

| Verksamhetsbegrepp | Ren lagring | V2:s beräknade läsvy |
| --- | --- | --- |
| Part, exempelvis ägare eller hyresgäst | `parties` | `organizations` |
| Avtal | `agreements` | `contracts` |
| Ärende: projekt, underhåll, drift, önskemål eller utredning | `issues` | `activities` |
| Daterad personkoppling | `contacts` | `assignments` |
| Hyra eller tillägg med egna villkor | `agreement_items` | `agreementItems` |
| Fastighetens återkommande kostnad | `recurring_costs` | `recurringCosts` |
| Faktura eller årsutfall | `cost_evidence` | `costEvidence` |

`view-adapter.js` projekterar och samlar tillbaka data. Läsvyn är ingen extra
lagringsmodell. Avtalets fastighet och objektets yta kan visas på avtalet utan
att lagras där. `view-fields.js` är den exakta fältöversättningen.
Company-källadaptern är en separat anslutning. Den är inte en migrering av
prototypdatabaser. Verksamhetsnamn och beskrivning lagras på Avtal; ytor på Objekt.

## Regler att förstå före en ändring

- **Identitet:** AvtalsID är avtalsnumret. Skiljetecken bevaras; `9(1)` och `91`
  är olika avtal. Osäker matchning kräver granskning, inte en gissad relation.
- **Import:** `prepareCleanImport` arbetar på kopior och sparar ingenting.
  Resultatet innehåller `clean` (lagring), `data` (läsvy) och `report`.
  Valfria fel kan lämnas för rättning. Ett validerat tidigare steg kan behållas
  när ett senare beroende på samma källrad avvisas. Hela resultatet valideras
  före sparning. Identitets-, relations- och ekonomifel får inte godtyckligt
  bli tomma fält. Se `tests/import-completion.test.js` och `tests/table-import.test.js`.
- **KPI:** Ordinarie avtalshyra använder avtalsvillkor och fastställd KPI.
  Manuellt index gäller bara budgetscenariot. Se
  [KPI-kontraktet](KPI_AND_BUDGET_SCENARIO.md) och `tests/kpi-scenario-separation.test.js`.
- **Budget:** Låsning sparar en baslinje. Senare källändringar påverkar prognos,
  inte den låsta historiken. Ny version bevarar den tidigare versionen.
  Se `tests/budget-actions.test.js` och `tests/budget-proposal.test.js`.
- **Underhåll:** En brist länkas till ett vanligt underhållsärende. En senare
  OK-bedömning avslutar inte ärendet automatiskt. Se startguiden och
  `tests/maintenance.test.js`.

## Fem dagars introduktion

1. **Dag 1:** Starta demon, kör tester och förklara skillnaden mellan demo,
   webbläsararbetsyta, lokal databas och äldre företagsanslutning.
2. **Dag 2:** Följ Fastighet → Objekt → Avtal och en personkoppling genom
   lagring och läsvy. Förklara varför samma begrepp har två tekniska namn.
3. **Dag 3:** Skapa ett syntetiskt Excelunderlag med FastighetsID, Fastighetsnamn,
   ObjektID och AvtalsID. Importera det i en ren lokal arbetsyta. Återimportera
   ett ändrat namn, granska värdeskillnaden och kontrollera historiken.
4. **Dag 4:** Följ en kostnad till budget, lås en budget och ändra underlaget.
   Bekräfta att baslinjen ligger kvar. Öppna en ny version och läs dess historik.
5. **Dag 5:** Genomför en liten ändring, välj relevanta tester och låt en kollega
   följa flödet från knapp → domänregel → transport → lagring → återläsning.

Målet är att självständigt kunna förklara flödet och genomföra en mindre
ändring med rätt regressionstester inom veckan.

## Verifiering och fortsatt refaktorering

`npm test` kör enhets-, import-, Excel- och API-tester samt syntax/preflight.
Webbläsartester körs separat. `npm run test:table-import-browser` täcker den
granskade importen och `npm run test:integration-browser` budget och navigation.
Installera Chromium med `npx playwright install chromium`. Tabellimporttestet
använder systemets `/usr/bin/chromium` som standard; alternativ sökväg kan anges
med `LOKALBLICK_CHROMIUM_PATH`. Integrationstestet använder Playwrights Chromium.

## Genomfört och återstående arbete

- Den ursprungliga baslinjens 54 testfel är rättade. Den samlade ändringen har
  också budgetåtgärdstester och en kontroll för start utan inläst Excelbibliotek.
- Importschema, identitet, radens återställning och slutrapport har egna moduler.
  Matchning/konvertering orkestreras av `prepareCleanImport`.
- Budgetåtgärder, navigation, editorkommandon, importdialoger och redigeringsram
  har egna moduler. `app.js` äger fortfarande mutation, sparning och montering.
- Vyer är uppdelade per ansvarsområde. `views.js` behåller den gemensamma
  ingången; formatering finns i `view-format.js`.
- `source-workbook.js` kodar arbetsböcker utan filåtkomst. Den får Excelbibliotek,
  modelltjänster och källnamn som beroenden. Biblioteket hämtas först vid behov,
  så demo och navigation fungerar även om CDN-biblioteket inte laddats.

Nästa avgränsade förbättringar är att dela importens matchning per register,
flytta återstående editorlivscykel ur `app.js` och skilja filbehörigheter från
importorkestrering i `source-service.js`. Byt därefter globala modelltjänster
mot uttryckliga ES-modulberoenden. Nya interna kompatibilitetslager behövs inte.

Se [verifieringen](REFACTOR_VALIDATION.md) och den
[genomförda introduktionsövningen](ONBOARDING_WALKTHROUGH.md). Guiden och de
tekniska flödena är kontrollerade. En faktisk nyanställds förmåga att arbeta
självständigt efter en vecka har ännu inte utvärderats.
