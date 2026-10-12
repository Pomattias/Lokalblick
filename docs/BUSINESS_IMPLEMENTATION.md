# Etapp 2 – verksamhet och avtalskopplingar

Utgångspunkt: utveckling, commit `8f6eca5956b01a3da0d7b8baf70d66e81126d1ed`, med sammanslagen PR #6. Direkt berörda beroenden: den befintliga importmotorn och dess identitetsregler, Excelkällans schemas/canonicalizeModel, V2:s formulär/transport och företagets lokala repository. Gemensam ansvarshistorik återanvänds. Ingen ny importmotor eller budgetmotor.

## Register och relationer

- `businesses` / Excelblad **Verksamheter**: stabilt ID, namn, typ, organisatorisk tillhörighet, organisation-ID, status, externt käll-ID. Personer kommer från befintliga people och assignments.
- `contractBusinesses` / **AvtalVerksamhet**: stabilt relations-ID, avtals-ID, verksamhets-ID, från-/till-datum, frivillig nyttjad area och kostnadsandel i procent (0–100).
- Hyresgäst är befintlig part på avtalet (`tenantPartyId`). Den är separat från nyttjande verksamheter. Exakt entydigt partsnamn kan återanvändas; liknande namn slås inte ihop. Ny entydig hyresgäst använder ett stabilt, deterministiskt ID och behåller källcellens proveniens.
- Avtalets egen ansvarige samt verksamhetens ansvarige använder PR #6-modellen. Tidigare ansvar på avtal flyttas inte automatiskt till en verksamhet; flera verksamheter kan finnas och historiken måste behålla sin ursprungliga hemvist.
- Objektets areatyp är text. Övriga befintliga avtalsfält för ekonomi, dokument och separata indexvillkor återanvänds.

## Migrering och sparning

Normalisering är idempotent. Befintliga arbetsfiler behöver ingen manuell ändring: de nya bladen skapas vid sparning. Okända historiska datum lämnas tomma. Äldre verksamhetsnamn/tillhörighet på avtal migreras till register och kopplingar. Endast käll-ID eller exakt kvalificerad identitet (namn, organisation och typ/tillhörighet) återanvänds mellan avtal. Namn utan tillräcklig identitet lämnas för bekräftelse när en kandidat redan finns. Avslutade kopplingar öppnas inte på nytt av äldre fält.

Företagsbackend sparar de nya tabellerna i samma lokala lagring som tidigare. Befintlig backup-/återställningsmekanism bevaras. Relationer med historik får inte raderas; avsluta med till-datum. Ingen automatisk rensning av äldre registerposter. Kod kan återställas genom att återgå till utgångscommit; behåll arbetsdatabackup innan en äldre kodversion används med uppdaterade arbetsfiler.

## Import och granskning

Befintlig mappning, källprioritet och beslut används. Föräldraposter identifieras före kopplingar. Källfil, flik, rad, cell och ursprungsvärde sparas i proveniens. Manuellt bekräftade värden skyddas. Samma källfingeravtryck och cell kan identifiera samma tidigare importerade verksamhet; det är inte namnmatchning mellan oberoende filer.

Flera avtalsnummer i en cell blir separata referenser. Ett gemensamt belopp eller andra avtalsvillkor kopieras inte till varje avtal: uppgiften lämnas för rättning per avtal i underlaget eller formuläret. Osäkra registeridentiteter kan bekräftas i befintlig granskningsvy. Felaktiga datum, relationer och överfördelning lämnas för granskning. Återimport av oförändrade uppgifter skapar inga nya relationer eller ändringshändelser.

Alla testunderlag är syntetiska. Ursprungliga LEB- och andra företagsfiler ändras inte och har inte skickats till externa tjänster.

## Ekonomi och gränssnitt

Avtal räknas en gång i befintlig fastighets-/budgetberäkning, oavsett antal verksamheter. Nyttjad area ger ingen implicit fördelning. Verksamhetsvyn räknar endast uttrycklig validerad kostnadsandel och periodens överlapp med avtalsåret. Summan får vara mindre än 100 procent (ofördelad rest), men inte större. Ändrad andel skapar en ny giltighetsperiod; tidigare andel bevaras.

Avtalsformuläret visar hyresgäst, kontakter, objekt/fastighet och flera verksamheter. Kopplingarna sparas först; frivillig area och andel finns sedan i en hopfällbar sektion. Verksamheter nås i befintlig navigation, med kompakt lista, befintligt formulär, ansvarshistorik och kopplade lokaler. Framtida kopplingar med komplicerade periodändringar behöver granskas separat; formuläret blockerar ett bakåtriktat byte som skulle skriva över dem.

Aktiviteter, flera beställningar, budgetlås och separat indexering av hyra/tillägg bevaras. Eventuella flera självständigt indexerade tillägg bevaras vid sparning/återläsning; en ombyggnad av deras redigering/beräkning ingår inte i denna etapp.

## Verifiering och kvarstående kontroll

`npm test`: 279/279 tester godkända. Preflight: 61 JavaScript-filer, inga blockerade företagsdata-/hemlighetsfiler. Riktade tester omfattar fler-till-fler-relationer, ansvarshistorik, Excelbytes tur/retur, lokal backend med omstart, flera överlappande filer, manuell källprioritet, osäker matchning, fleravtalsceller, daterad fördelning och befintliga kostnader/budgetlås.

Automatisk visuell kontroll kan inte genomföras här: Playwrights Chromium saknas. Följande behöver kontrolleras i den driftsatta utvecklingsversionen på desktop (1440 px) och mobil (390 px), med demo/syntetiska data:

1. Öppna Avtal; kontrollera hyresgäst, objekt/fastighet, dokument, ansvar och ekonomi.
2. Koppla två verksamheter, spara, öppna igen och ange 60/40 procent samt area; kontrollera att fastighetens hyreskostnad är oförändrad.
3. Öppna Verksamheter; kontrollera kopplade avtal/lokaler, ansvarshistorik och fördelad kostnad. Byt ansvarig med datum och kontrollera tidigare person/period.
4. Kontrollera att formulär och tabellsektioner går att läsa och använda utan överlappning; tabeller får rulla inom sin behållare på mobil.
5. Importera ett syntetiskt underlag två gånger, granska osäker matchning, spara arbetsfil och läs om.

Nästa etapp: användarverifiering med godkända företagsfiler i företagsmiljön, samt eventuellt förenklad redigering av framtida nyttjandeperioder och flera indexerade tillägg som separata uppdrag.
