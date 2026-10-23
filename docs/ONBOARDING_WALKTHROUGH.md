# Introduktionsövning: från Excelkolumn till sparat avtalsfält

Övningen använder syntetiska data. Den är genomförd som teknisk kontroll;
ingen nyanställd har ännu provat guiden självständigt.

## Dag 1 – start och orientering

Starta med Node.js 24 LTS, `npm ci` och `npm run company`. Demon har egna
syntetiska värden. `npm run lokaler` startar i stället SQLite på port 8790.
Läs miljömatrisen i `ARCHITECTURE.md` före val av lagring. Entra ID/M365 är
målarkitektur, inte en färdig koppling i den lokala servern.

## Dag 2 – följ ett begrepp

Verksamhet är två avtalsfält: `business_name` och `business_description` i
`frontend/lokaler/model.js`. `view-fields.js` ger läsvyn namnen `businessName`
och `businessDescription`; `view-adapter.js` samlar tillbaka ändringar.
Det finns inget separat verksamhetsregister. Ytor ligger på Objekt.

## Dag 3 – importera och läs igen

Skapa ett Excelunderlag med `FastighetsID`, `Fastighetsnamn`, `ObjektID`,
`AvtalsID` och `Namn på verksamheten`. Använd påhittade ID:n och namn.

1. Välj en ny ren arbetsyta och **Datakällor → Läs in underlag**.
2. Godkänn kolumnmappningen. `import-schema.js` pekar källrubriken på
   `contracts.businessName`; den får inte peka på det borttagna `business`.
3. `prepareCleanImport` mappar till `agreements.business_name`. Den arbetar på
   kopior. `import-row-transaction.js` återställer misslyckade beroenden och
   behåller bara godkända tidigare delar av raden.
4. `import-result.js` validerar resultatet och skapar rapport/historik.
   Granskning och explicit sparning sker genom vald transport.
5. Ändra namnet i källunderlaget, återimportera, granska värdeskillnaden och
   spara. Ladda om och kontrollera att det godkända värdet och historiken finns.

Kontroller: `tests/clean-simplification.test.js`, `tests/import-completion.test.js`
och `npm run test:table-import-browser` testar mappning, delvisa fel,
återimport och återläsning i SQLite. `npm run test:lokaler-browser` provar
SQLite, server-Excel och lokal webbläsar-Excel.

## Dag 4 – följ underlaget till budget

Budgetens vy ligger i `view-budget.js`; kommandon i `budget-actions.js`.
`calculations.js` räknar och `budget-followup.js` äger baslinje/versioner.
Skapa och lås en budget, ändra ett underlag och kontrollera att den låsta
baslinjen ligger kvar. Skapa sedan en ny version och öppna historiken.

Kontroller: `tests/budget-actions.test.js` och
`npm run test:integration-browser` täcker bekräftelse, låsning, version,
utfall, historik och återläsning. Ett manuellt KPI-antagande påverkar bara
budgetscenariot, aldrig ordinarie avtalshyra.

## Dag 5 – genomför en avgränsad ändring

Den konkreta schemaändringen ovan har följts från källrubrik till lagrat fält
och verifierats med verklig XLSX-serialisering och webbläsartester.

Följ också **Redigera → Ångra** i en ärendeeditor: `app.js` tar emot klicket,
`editor-commands.js` växlar läsläge eller återöppnar formulärets sparade
utgångsläge. Det får inte spara data. Sparning går fortsatt genom appens
`mutation` och transport. Ett befintligt fel där knappen Ångra användes
utanför sin variabels block är rättat i `openEditor`.

Kontroller: `tests/shared-editor-mode.test.js`, `npm run test:editor-browser`
och `npm run test:issue-browser`. Gör sedan en egen liten ändring, förklara
valet av tester och be en kollega följa hela flödet. Det sista mänskliga
introduktionsprovet återstår; automatiska tester visar inte att alla nya
utvecklare förstår systemet inom en vecka.
