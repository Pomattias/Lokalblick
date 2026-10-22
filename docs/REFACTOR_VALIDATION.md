# Verifiering av första refaktoreringssteget

Utgångsläge: `utveckling`, commit `edbf0e675a6d97701eda36cb0e9669b5dee50922`.
Kontrollerna körs med Node.js 24.19.0, låsta npm-beroenden och syntetiska data.
Originalet körs i en separat oförändrad arbetskopia med samma beroenden.

## Omfattning

- Importschema/alias, stabila identitetshjälpare och resultatrapport har flyttats
  till separata moduler. `import-model.js` återexporterar `importSchemas` så att
  befintliga konsumenter behåller samma ingång. Matchningsregler och sparformat
  har inte ändrats.
- Budgetknapparnas åtgärder har flyttats till `v2/budget-actions.js`.
  Appens befintliga mutation, validering, historik, sparning och återställning
  används fortsatt. Beräkningsregler och låsta snapshots har inte ändrats.
- README, arkitektur och backendguide skiljer implementerade körlägen från
  framtida Entra ID/M365-stöd. Utvecklarguiden innehåller läsordning,
  begreppsöversättning och en femdagars introduktion.

## Resultat

| Kontroll | Oförändrat original | Efter refaktorering |
| --- | --- | --- |
| Samtliga enhets-, import- och API-tester | 636 godkända, 54 underkända | 642 godkända, samma 54 underkända |
| Nya budgetåtgärdstester | Saknas | 6 godkända |
| Syntax/preflight | Ingår i ordinarie kommando efter en grön svit | Separat körd och godkänd |
| Kontroll av odefinierade namn i ändrade kodmoduler | — | Godkänd |
| AST-jämförelse av importschema och radkonvertering | Referens | Oförändrad logik |
| Webbläsare: budget/integration | Stannar vid saknad `[data-year]` | Samma stopp |
| Webbläsare: tabellimport | Stannar vid saknad `[data-mapping-row]` | Samma stopp |

Felens testnamn har jämförts som mängder: inga nytillkomna eller försvunna fel.
Det är evidens för att den befintliga regressionstäckningen är bevarad, inte ett
påstående att systemet är felfritt. Webbläsarflödena är inte godkända från början
till slut; deras senare steg har inte verifierats.

Budgetens nya tester verifierar bevarad låst baslinje och versionshistorik,
avbruten bekräftelse utan sparning, ogiltiga källdatum utan delvis låsning,
scenarioåterställning utan ändrade källvillkor, skyddad låst budget och explicit
indexhämtning utan sparning av verksamhetsdata.

## Körning

```sh
npm ci
npm test
npm run check
node --test tests/budget-actions.test.js
npm run test:integration-browser
npm run test:table-import-browser
```

Webbläsarkontrollerna använder lokalt system-Chromium, utan externa kart- eller
datakällor. Tabelltestet använder sin befintliga standardsökväg `/usr/bin/chromium`.
Integrationstestets `chromium.launch` fick samma sökväg genom teststartaren;
testets operationer och förväntningar ändrades inte. Vanlig körning av det
testet använder Playwrights installerade Chromium.

## Nästa prioritet

Återställ testbaslinjen före större refaktorering. Ett konkret fel är
`ReferenceError: businessControls is not defined` i `v2/contract-editor.js`,
vilket stoppar flera avtalsredigeringstester. Andra fel rör fältkontrakt kring
verksamhetsuppgifter, äldre testunderlag och import/lagring. Bedöm varje fel mot
produktbeslut och databevarande innan kod eller testförväntningar ändras.

Browserstoppen visar var testerna saknar den förväntade kontrollen; deras
grundorsak är ännu inte fastställd. Utred UI-tillstånd och konsolfel där innan
senare steg i flödena bedöms. Ingen ny webbläsarregression har observerats vid
dessa två kontrollpunkter, men det ersätter inte en komplett godkänd körning.
