# Lokalblick – inventering och plan för designharmonisering

Datum: 2026-10-13  
Bas: `utveckling`  
Arbetsgren: `refactor/design-harmonisering`  
Status: **Inventering och plan – ingen ändring av UI eller datamodell i denna fas**

## Mål och avgränsning
Samordna Lokalblicks visuella språk på iPhone och desktop genom färre, tydliga designregler och återanvändbara komponentstilar. Bevara befintliga funktioner, tillgänglighet, dataflöden och relationer.

**Orörda kontrakt:** import/berikning, Excel och lokala API:er, index-/budget-/hyresberäkningar, ansvarshistorik, journal/auditLog, objekt-/avtalsrelationer, geodata och kartbeteende, behörighet, dialogers actions, spar-/ångra-/osparat-skydd, demodata. Ingen rensning av fält eller datamodell inom detta uppdrag.

## Inventerat nuläge (2026-10-13)
| Yta | Kod / befintligt beteende | Risk och rekommendation |
| --- | --- | --- |
| Globala färger, typografi, knappar, tabeller | `frontend/v2/styles.css` | Grundstilar samexisterar med upprepade sidvisa override-regler. Skapa tokens och variantklasser; ta därefter bort enbart bekräftat redundanta regler. |
| Globalt filter och sök | `views.js:filters`; `styles.css` | En HTML-källa redan; olika CSS-varianter och sticky-justeringar. En komponentstandard för höjd, typografi, fokus och valt värde. Testa kartvyn och iOS scroll. |
| Översikt / KPI / snabblänkar | `views.js:dashboard/summaryCards`; `styles.css:.dashboard-*,.summary` | Översiktens paneler och KPI-rader är mer luftiga än Planera. Skapa compact/standard-storlek med samma spacing-skala. |
| Planera – filter, tidslinje, kort | `views.js:planning`; `styles.css:.plan-*,.issue-type-filters` | Behåll vyval och ärendekort, gör samma knappvarianter som globalt. Testa horisontell scroll samt handling av ärenden. |
| Ärende – ny/redigera/läs | `issue-editor.js`, `app.js:setEditorReadMode`, `styles.css:.issue-editor` | Mycket specifik CSS och särskild mobilhöjd. Standardisera formulärfält, drawer, rubrikrad och fast sparrad utan att störa fokus, tangentbord eller dirty state. |
| Avtal och fastighet | `contract-editor.js`, `property-editor.js` | Liknande editorstruktur men olika klasser och sidvisa höjder. Migrera till samma editor-shell-/field-stilar efter ärendevalidering. |
| Standardformulär och Verksamheter/Personer | `editor.js`, `business-editor.js`, `views.js:organization` | Använd samma formulär-/button-varianter; ändra inga form name-attribut eller inläsning. |
| Journal och historik | `activity-journal.js`, auditLog | Bibehåll separat noteringssparning, tidsstämpel, avsändare samt ändringar i kostnad/tidplan. Enhetlig kompakt visning. |
| Kartan | `app.js` + karttjänsten | Avviker avsiktligt i höjdanvändning. Bevara kartans viewport, interaktiva kontroller, filter och bottom-nav. |
| Import och dialoger | `app.js` + `styles.css:.import-*` | Viktiga egna layoutkrav för mappning av Excelkolumner. Bör endast få gemensamma färg/knapp-/dialogtokens; bevara tabellscroll och focus. |

Kontrollerade filer: `frontend/v2/styles.css` (1 526 rader, 26 `@media`, 22 `!important`), `views.js` (951 rader), `app.js` (1 628 rader), `issue-editor.js`, `editor.js`, `business-editor.js`, `contract-editor.js`, `property-editor.js`, `index.html`.

Sök-/upprepningsindikatorer i `styles.css`: `.issue-editor` 156, `.editor` 97, `.filters` 30, `.summary` 26, `.mobile-nav` 7 förekomster. Dessa är inte antalet unika regler; de är signaturer som visar var konsolidering bör undersökas. Specifikitet, arv och ordningsberoenden måste kartläggas före borttagning.

## Gemensamma designprinciper
1. Mobile-first: kompakt visning, 2-kolumnsfält bara där texten ryms, inga horisontella sidöverskridanden.
2. En palett via befintliga CSS-variabler; lägg vid behov till `--ui-`-tokens för höjd, radie, avstånd, textstorlek, gränser, fokus och status. Undvik nya hårdkodade färger.
3. Två standardhöjder: compact (filter/tablister) och touch (primära touch-actions). Kontrollera tillgänglig träffyta separat från visuell höjd.
4. En primär, sekundär, diskret och destruktiv knappvariant. Aktivt val = konsekvent grönt, inaktivt = vit/gräns.
5. Läsning = textvärden utan inpututseende. Redigering kräver explicit `Redigera`; osparade ändringar ska kräva `Spara` eller `Ångra`, och varna vid lämna.
6. En gemensam dialog-/drawer-ram; modal på desktop, full höjd/säker footer på mobil; respektera `dvh`, safe areas och iOS-tangentbord.
7. Tillåt avsiktliga undantag (karta, breda importtabeller, mobilbottennavigering).
8. Designändringar får inte ändra semantik eller automatiskt sätta data.

## Plan: små PR:er, tillämpa efter test
### PR 1 – Tokens och inventeringskatalog
- Skapa gemensamma `--ui-`-tokens och `ui-button/ui-field/ui-card/ui-filter`-varianter utan att ta bort gamla selectors.
- Skriv en enkel HTML/CSS-komponentöversikt eller intern testsida, utan produktionsdata.
- Dokumentera accepterade mått/varianter och kända undantag.
- Test: desktop 1440 px, surfplatta ~768 px, iPhone 390/430 px; visuella kontroller.

### PR 2 – Globalt mobilfilter och navigering
- Tilldela samma filter- och sökklasser från en gemensam renderfunktion.
- Konsolidera sticky filter, z-index och mobilnav; inga förändringar i filterdata eller urvalslogik.
- Test: alla fem huvudvyer; filtrering per ansvarig/verksamhet/fastighetsägare, sök, scroll och karta.

### PR 3 – Översikt, Planera, Budget: kort/knappar/tabeller
- Byt till gemensamma visuella klassvarianter; bevara knapparnas `data-*`-attribut och events.
- Ta bort dubblett-CSS först efter att alla vyer återgivits korrekt.
- Test: alla KPI-värden, budgeturval, tidslinje, årsväxling, kortnavigation, skapa ärende.

### PR 4 – Formulär och läsläge
- Normalisera `editor`-ram, fält/label, grupper, modalhöjd och sticky safe-area footer.
- Byt visuella varianter i Ärende först; därefter Avtal, Fastighet och standardeditor.
- Test: nytt ärende, läsläge→Redigera, ändring av typ/objekt/fas, checkbox Värdehöjande, belopp/datum, Ångra/Spara, sparad journal, avbryt med osparade ändringar och iOS-tangentbord.

### PR 5 – Historik, specialdialoger och CSS-städning
- Harmonisera historikrader och noteringar; behåll auditLog och personstämplar.
- Migrera specialdialoger successivt; exkludera kart-/Exceltabellernas specifika layout.
- Rensa endast bevisat duplicerade/osynliga regler efter regressionstester.
- Kontrollera att `!important` minskar där det går utan att stilprioritet bryts.

## Godkännandekrav före merge till utveckling
- Ingen ändring i lagringsformat, entity-ID, FK, schema, import/berikning, budget-/hyreslogik eller lokalt API.
- Befintliga `data-*`-actions, `name` på inputfält och tillgängliga kontrollnamn fungerar fortsatt.
- Visuellt likvärdiga filter/knappar/kort/dialoger på mobila huvudvyer.
- Scroll och sticky header fungerar utan att blockera kartan eller modaler.
- Spara/Ångra och varning för osparat: befintliga och nya ärenden, noteringsutkast, fastighet och avtal.
- Regressionstest med syntetiska demodata och med avskild testkopia av Excelanslutning. **Ingen produktions-/företagsdata får lämna företagsdomänen.**
- JS-syntax-/byggkontroll samt manuell eller automatiserad mobil- och desktopskärmbildjämförelse.
- Rollbackbar PR per steg; merge först efter granskning. `main` ändras inte.

## Genomförandeordning
1. Godkänn inventering och visuella standardprinciper.
2. Arbeta på `refactor/design-harmonisering` från `utveckling`.
3. Leverera PR 1, testa, sedan PR 2–5 stegvis.
4. Begär mobilskärmbilder bara där faktisk enhetsverifiering behövs.
5. Uppdatera denna checklista när testutfall finns.

**Inga UI-ändringar har utförts i samband med denna inventeringsfil.**
