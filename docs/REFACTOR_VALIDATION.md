# Verifiering av samlad modellrättning och moduluppdelning

Detta är verifieringen för `8d424bf`. Senare lokaldataförbättringar och deras
aktuella testresultat finns i [lokaldataimporten](LOCAL_DATA_IMPORT.md).

Utgångsläge: `utveckling`, `edbf0e675a6d97701eda36cb0e9669b5dee50922`.
Den samlade ändringen ersätter utkasten i PR #8 och PR #9 och omfattar nästa
avgränsade refaktoreringssteg. En gemensam commit skapas efter verifieringen.
Körningarna använder Node.js 24.19.0, låsta npm-beroenden, systemets Chromium
och syntetiska underlag/tillfälliga filer.

## Modell och beteende

- Aktuell modell är facit. Verksamhetsnamn/beskrivning ligger på Avtal, ytor på
  Objekt. Interna prototypformat migreras inte och gamla fält arkiveras inte.
- Extern Excel-/LEB-import finns kvar. `Kommentar verksamhet` mappar till
  verksamhetsbeskrivning och hålls skilt från avtalets vanliga kommentar.
- De ursprungliga 54 testfelen är rättade. Inaktuella formatförväntningar har
  ersatts med kontroller av nuvarande modell; inga tester hoppas över.
- Låsta budgetbaslinjer, versionsskydd, filkonflikter, återställning vid skrivfel
  och vanlig ändringshistorik kontrolleras fortsatt.
- Kartans kvarvarande zoomövergång avslutas före borttagning.
- Ärendeeditorns Ångra-knapp har rätt variabelomfattning.
- Demo och navigation kan starta utan XLSX. Kodaren får biblioteket genom en
  funktion som anropas först när en arbetsbok används.

## Modulgränser

| Ansvar | Modul |
| --- | --- |
| Importfält och externa kolumnrubriker | `frontend/lokaler/import-schema.js` |
| Stabil importidentitet | `frontend/lokaler/import-identities.js` |
| Radens återställning och godkända delsteg | `frontend/lokaler/import-row-transaction.js` |
| Slutvalidering, rapport och historik | `frontend/lokaler/import-result.js` |
| Vybyte och urval | `frontend/v2/navigation.js` |
| Recordnavigation, Redigera och Ångra | `frontend/v2/editor-commands.js` |
| Redigeringsram | `frontend/v2/editor-frame.js` |
| Importdialoger och framsteg | `frontend/v2/import-dialogs.js` |
| Budgetkommandon | `frontend/v2/budget-actions.js` |
| Portfölj, budget, planering och källgranskning | `frontend/v2/view-*.js` |
| XLSX-kodning utan filåtkomst | `frontend/services/source-workbook.js` |

Appens befintliga mutation och transport äger fortfarande sparningen.
`views.js` är kvar som gemensam export för konsumenterna.

| Huvudfil | Före | Efter, rader |
| --- | ---: | ---: |
| `frontend/v2/app.js` | 2050 | 1720 |
| `frontend/v2/views.js` | 1064 | 176 |
| `frontend/services/source-service.js` | 1659 | 1051 |
| `frontend/lokaler/import-model.js` | 547 | 485 |

Raderna har till stor del flyttats till moduler med avgränsat ansvar.
`app.js` och importmatchningen är fortfarande stora; detta är genomförda
modulgränser, inte ett påstående att all fortsatt refaktorering är färdig.

## Resultat

| Kontroll | Resultat |
| --- | --- |
| `npm test` | 697 godkända, 0 underkända, 0 överhoppade |
| Repots förkontroll | Syntaxkontroll av 126 JavaScript-filer och kontroll av filtyper |
| Kontroll av odefinierade namn i ändrade produktionsmoduler | Godkänd |
| Budget/karta i webbläsare | Låsning, bekräftelse, version, utfall, historik, återläsning och snabb navigation under zoom godkända |
| Tabellimport i webbläsare | Mappning, återimport, kontakter, SQLite och oförändrad Budget på mobil/dator godkända |
| Editorernas geometri | Visa/Redigera, fokus, text och grön ram på mobil/dator godkända |
| Ärendeflöde | Notering, historik, redigering, sparning och skydd mot förlorade ändringar godkända |
| Lagring i webbläsare | SQLite, server-Excel och webbläsar-Excel: import, återimport, redigering och återläsning godkända |
| Filåtkomst i webbläsare | Exklusivt lås, nytt försök och skydd mot extern ändring godkända |
| AST-jämförelse av vyer | Samma 61 deklarationer efter moduluppdelning |
| AST-jämförelse av källtjänst | Samma 80 funktionskroppar; biblioteks-/källnamnsåtkomst ersatt av uttryckliga beroenden |

Sökvägar i kodläsande layouttester har uppdaterats till modulen som nu äger
vyn. Ett redigeringsprov anropar nu den riktiga kommandomodulen och
ramprovet importerar den riktiga funktionen i stället för att klippa ut kodtext.
Källtjänstens VM-tester läser kodare och tjänst i samma ordning som V2.
Lagringsflödets test använder `businessName`/`business_name` och öppnar de
aktuella formulärsektionerna före redigering.

## Reproducera

```sh
npm ci
npm test
npx playwright install chromium
npm run test:integration-browser
npm run test:table-import-browser
npm run test:editor-browser
npm run test:issue-browser
npm run test:lokaler-browser
```

Integration och editorgeometri använder Playwrights Chromium. I körmiljön har
startaren valt `/usr/bin/chromium`. Tabellimport och lagringsflödet använder
system-Chromium som standard. Ärendetestets binär kan väljas med
`LOKALBLICK_CHROMIUM_PATH`.

## Introduktion och kvarvarande arbete

[Utvecklarguiden](DEVELOPER_START.md) och [övningen](ONBOARDING_WALKTHROUGH.md)
visar läsordning, modellbegrepp och ett komplett spår från källrubrik till
sparat avtalsfält. Ett faktiskt introduktionsprov med en nyanställd återstår.
Nästa kodsteg är uppdelning av registermatchning, återstående editorlivscykel
och filbehörigheter. Globala domänskript är ännu inte helt ersatta av ES-moduler.
