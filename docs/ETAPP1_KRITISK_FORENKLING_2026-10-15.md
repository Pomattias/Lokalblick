# Etapp 1 – kritisk förenkling och färre val
Datum: 2026-10-15. Arbetsgren: `utveckling`. Status: kodgrundade rekommendationer, inga runtime- eller datamigreringar utförda.

## Princip
**Ett objekt, ett ansvar för varje uppgift, en primär handling per vy.** Minimera synliga val; bevara kapaciteten i datamodell och vid behov i kontextuella avancerade fält. Mindre kod är ett resultat av färre överlappande ansvarsområden, inte ett isolerat mål.

## Kritiska observationer direkt i kod
1. `frontend/v2/index.html` exponerar 12+ desktop-navigationsval (Översikt, Fastighet, Objekt, Avtal, Verksamheter, Aktiviteter, Planera, Budget, Karta, Datakällor, Organisation, Inställningar och Datamodell) samt V1-länk. Detta är för många jämställda vyer.
2. `frontend/v2/import-mapping.js` visar alltid varje importerad kolumn med **Måltabell** och **Fält**, även när matchningen är känd. Välj endast vid oklara fall; källschema/identitetsmatchning ska gå automatiskt. Behåll full mappningsvy under 'Avancerat'.
3. `frontend/v2/issue-editor.js` erbjuder fem hemvistnivåer: Fastighet, Objekt, Avtal, Verksamhet, Generellt. Behåll datastöd men föreslå automatiskt hemvist utifrån var ärendet öppnades. Visa ett enda "Kopplat till" vid standardredigering.
4. `frontend/v2/contract-editor.js` har fyra ekonomiska indexmetoder samt villkor för min/max. Behåll villkoren men visa dessa först när villkorstypen kräver det; primär vy ska sammanfatta avtalad bashyra, tillägg, fastighetsskatt och beräknad årskostnad.
5. `frontend/v2/activity-option-settings.js` ger administratören ändra ordning, aktivera/inaktivera, radera, ändra kategoriomfattning och skapa nytt för tre olika register. Lägg i avancerat administratörsläge; ordinär användare ska inte se dessa val. Klassificering till budget får inte tyst bero på fritt ändringsbara benämningar.
6. `frontend/v2/transport.js` innehåller dublettnyckeln `priceBaseAmounts` i `metadataKeys`. Ofarlig i Object.fromEntries-meningsbyggnaden men konkret kodstädning med test.
7. `frontend/v2/model.js` visar sju gamla collections som migreras och `operations`/`maintenanceStatus` lever i aktuell lista. Utrangera bara när konsument-/migreringsgraf visar att de inte behövs. Kvarvarande riktiga verksamhetsrelationer kan behöva särskilda tabeller, inte synliga moduler.
8. `frontend/v2/index.html` laddar både `styles.css` och `design-system.css` och en lång kedja av globalt laddade scripts. Rationalisera laddningsgraf och CSS-prioritet utan att oavsiktligt ändra editläget.

## UI-beslut – föreslagen målnavigering
**Fem huvudval:** Översikt · Bestånd · Ärenden · Ekonomi · Mer.
- **Översikt:** sammanfattningar, ansvar och prioriterade åtgärder; "Planera" som kontextuell periodvy av ärendena och ekonomin, inte dubbla poster.
- **Bestånd:** fastigheter → objekt → avtal i en och samma navigationshierarki. Avtal och objekt är undernivåer, inte egna toppmenyer. Karta som växlingsläge (Lista/Karta) i bestånd och relevanta översikter.
- **Ärenden:** projekt, underhåll, drift och önskemål i en lista med typfilter, tidsplan och journal. "Planera" kan behållas som växlingsläge (Lista/Plan) utan ny datamodell.
- **Ekonomi:** årskostnad, låst budget, prognos och utfall; klick går till exakt kostnadskälla. Budgetunderlag alltid från avtal och ärenden.
- **Mer:** datakällor/anslutning, organisation/personer, inställningar, importhistorik och administration. Ingen teknisk "Datamodell"-meny för slutanvändare.
- Behåll nuvarande fem mobilknappar tills användartest jämfört med förslaget; undvik stor omläggning om ingen faktisk nytta bevisas.

## Förslag: minimifält synligt, avancerade data bevaras
| Objekt | Primärvy | Visa vid behov / härled |
| --- | --- | --- |
| Fastighet | Adress, beteckning, ägare, vår ansvarige | Ort om ej utläsbar, koordinater/källa, detaljerad metadata |
| Objekt | Nummer, namn, area, kategori, verksamhet | Areanivåer, kapacitet, datum för historik, föregående objekt |
| Avtal | Nummer, hyresgäst, objekt, period, area, bashyra, tillägg, skatt, årskostnad | KPI-bastal, indexmetod/min-max, separat indexering per tillägg, uppsägning/förlängning, avtalsdokument |
| Ärende | Titel, typ, status, ansvarig, koppling, tidplan, bedömd kostnad | Kategori, prioritet, kostnadsfördelning, beställningar, journal/historik; journal tillgänglig vid öppning |
| Part/person | Namn, roll/relation, relevant kontakt | System-ID, härkomst, historiska relationer |
| Ekonomi | År, budget, prognos, utfall, avvikelse | Värden bakom beräkning, låsmetadata och indexantaganden |

**Ingen information ska raderas endast för att fältet inte syns.** Om användaren uttryckligen beslutar att ett fält ska utgå ur produkten gäller säker end-to-end-avveckling i frontend, backend, import, export, data och migrering.

## Föreslagen privat onboarding
1. **Testa demo** eller **Anslut företagets data**.
2. Under "Anslut": välj **lokal fil** eller **API-anslutning** (avancerat); offentlig UI visar aldrig någon skarp data.
3. Automatisk analys: upptäck fastighet/ägare/kontakter/objekt/avtal/ärende, matcha på säkra identifierare, bevara hela proveniensen. Visa bara grupperade konflikter.
4. Granska sammanfattning och genomför en atomisk skrivning i vald skyddad lagringsadapter. Spara mappningen.
5. Öppna Bestånd. Vid nästa import återanvänds godkänd profil.
**Skilj** källadapter (läser) från persistensadapter (äger skrivning). Ingen fejkad automatisk anslutning till M365 eller extern databas innan backend finns.

## Modellbeslut som inte får förenklas bort
- Flera objekt per fastighet och avtal över tid per objekt.
- Fastighetsägare skild från juridisk hyresgäst, verklig verksamhet och personer med tidsatta roller.
- Flera verksamheter på samma avtal med area- eller kostnadsandel via `contractBusinesses` när sådana fall förekommer.
- Flera individuellt indexerade hyrestillägg, egen fastighetsskatt och KPI-regler.
- Journal med tid/aktör och historik för kostnad, tidplan, ansvar samt låst budget som oföränderlig baslinje.
- Källspårbarhet och säker isolering för företagets lokala, interna eller externa datalagring.

## Genomförandebeslut, risk och verifiering
| Prioritet | Ändring | Riskkontroll |
| --- | --- | --- |
| P0 | Frys målmodell, dokumentera relationer och stabila ID | Referenstester för fastighet–part–person–objekt–avtal |
| P0 | Full fält-/läs-skriv-/import-/beräkningsmatris | Ingen fysisk borttagning utan migreringsprov |
| P0 | Baslinjetester och säkerhetsgräns för fil/API | Företagsdata får aldrig exponeras publikt |
| P1 | Gemensamt schema som driver etiketter/formulär/importalias | UI-regression i Visa/Redigera och Excel-roundtrip |
| P1 | Automatisk import med avancerad mappning som undantag | Säkra identiteter, noll dubbletter, idempotens |
| P1 | CSS-tokens, kort/rader/fält i ett designsystem | Visuell mobil/desktop-regression |
| P2 | Färre toppnivåer och kontextuella formulär | Bevarade funktioner via max två steg |
| P2 | Avveckla V1, äldre collections och redundanta fält | Kanoniska migrationer, testad historik och rollback |

## Öppna risker och verifieringsstatus
Rekommendationer bygger på direkt granskning av de angivna kodfilerna och tidigare arkitekturcommits. Jag har **inte** exekverat npm-testsviten, kört webbläsarregression eller inspekterat faktisk företagsdata i denna körning. Detta är inte en färdig migrering. Nästa arbetssteg: ta fram maskinläsbar fält- och användningsmatris ur schema och söka faktiska läs/skriv-referenser.
