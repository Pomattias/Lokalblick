# Första veckan i Lokalblick

Detta är läsordningen för en ny utvecklare på `utveckling`. Aktuella körlägen
finns i [arkitekturen](../ARCHITECTURE.md). Daterade beslutsdokument beskriver
beslut vid den tidpunkten; jämför fältnamn med modellens nuvarande definitioner.

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
| Hur förbereds en import? | `services/import-engine.js` → `lokaler/import-schema.js` → `lokaler/import-model.js` → `lokaler/import-result.js` (under `frontend/`) |
| Var beräknas belopp? | `frontend/domain/calculations.js`, `frontend/lokaler/finance-view.js` |
| Var hanteras budgetknappar och versioner? | `frontend/v2/budget-actions.js`, `frontend/domain/budget-followup.js` |
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
Den äldre company-adaptern har ett eget kompatibilitetsflöde.

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

Prioritera följande i små beteendebevarande ändringar:

0. **Testbaslinjen först:** det granskade utgångsläget `edbf0e6` har 54
   underkända tester. Återställ en grön svit genom att reda ut fältkontrakten
   och fel i avtalsredigeringen före nästa större uppdelning. Se
   [verifieringsresultatet](REFACTOR_VALIDATION.md); ändra inte förväntningar
   för att dölja förlorade uppgifter eller brutna affärsregler.
1. **Genomfört här:** aktuell miljömatris, läsordning och begreppslista; separata
   moduler för importschema, identitet, resultatrapport och budgetknappar.
2. **Nästa importsteg:** separera radens transaktion/checkpoints från matchning
   och konvertering. Behåll tester för delvis godkännande, ID-stabilitet,
   konflikter och misslyckad skrivning innan något flöde ersätts.
3. **Nästa UI-steg:** flytta navigation och redigeringskommandon ur `v2/app.js`;
   dela `v2/views.js` per vy. Håll en gemensam mutation- och spargräns.
4. **Lagringsgräns:** skilj Excelkodning, filbehörigheter och importorkestrering
   i `services/source-service.js`; inventera anrop före utfasning av äldre flöden.
5. **Beroenden och namn:** ersätt globala tjänster med uttryckliga modulberoenden
   där det är praktiskt. Behåll sparade nycklar och importformat; gör inga breda
   namnbyten utan kompatibilitets- och roundtripkontroller.

Räkna inte hela uppdelningen som ett femdagarsarbete. Introduktionsveckan blir
möjlig genom den sammanhängande vägledningen och tydliga modulgränser; den
återstående refaktoreringen sker successivt.
