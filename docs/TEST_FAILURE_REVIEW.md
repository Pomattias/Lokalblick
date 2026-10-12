# Rättningar av testfel och gemensam import

Baslinje den 12 oktober 2026: 225 tester, 209 godkända och 16 underkända. Felen sorterades mot beslutade produktregler innan testförväntningar ändrades.

| Ursprungligt testfel | Klassificering | Rättning |
|---|---|---|
| XLSX roundtrip i budgetuppföljning | Testmiljö | Använd de publika läs-/skrivmetoderna i stället för att injicera privata testmetoder via en gammal textsträng. |
| Endast oktober för en egen indexserie | Funktionsfel | Serienamnet `custom` tappades och kunde använda SCB:s 1980-serie. Egen serie behåller sin identitet; september kan användas preliminärt inom rätt serie. |
| Budgetens indexsnapshot | Gammal förväntan | Snapshot innehåller månad och tydlig källa för manuellt preliminärt index. |
| Aktivitetens budgetår | Gammal förväntan | Aktivitetens faktiska period har företräde framför ett tidigare planeringsår. Årsfördelning, inklusive noll, har fortsatt företräde. |
| XLSX roundtrip med ansvar och låst budget | Testmiljö | Saknad `clone` importeras. |
| Ort sparas med historik | Testmiljö | Saknad `clone` importeras. |
| Ansvarig på önskemål | Gammal testdata | Testpersonen måste finnas innan ansvar tilldelas; referensvalideringen behålls. |
| Misslyckad Excel-skrivning och återförsök | Testmiljö | Saknad `clone` importeras; testet använder också den aktuella rubriken Bashyra, kr/år. |
| Fantomrader i Excel | Testmiljö | VM-miljön får timerfunktionerna som webbläsaren använder. |
| Flikval och importprogress | Testmiljö | Timerfunktioner tillförs; arrayer jämförs efter överföring ur VM-miljön. |
| Grunddata före berikning | Testmiljö | Jämför arrayinnehåll mellan VM och Node utan att kräva samma prototyp. Källan anges nu som fil och flik separat. |
| Äldre identitetsgranskning | Funktionsfel | Normalisering får inte stänga en osäker granskning automatiskt. Den ligger kvar med varning tills användaren gör ett uttryckligt val. Föråldrade fältvärden stoppas vid godkännande. |
| Ansvar och beställningskoppling | Funktionsfel | Verifierat verksamhetsnamn och förenlig adress används för koppling. Beställning kan knytas till en unik planerad aktivitet. Beställningen ändrar inte planeringskostnad eller kategori och skapar inte extra aktivitet vid återimport. |
| Synlig ändringslogg i Excel | Gammal förväntan | Full historik bevaras i appen och i den tekniska Excel-fliken, som är dold enligt exportupplägget. |
| Fastighetens beräknade årskostnad | Gammal förväntan | Äldre Media är alias för Tillägg och ska inte räknas en gång till. Årskostnad beräknas per avtalsperiod och lagras inte på fastigheten. |
| Underhåll som separat perspektiv | Gammal förväntan | Aktivitetstabellen använder Ärenden med typfilter Underhåll. |

Totalt: 7 testmiljöfel, 6 gamla förväntningar/testdata och 3 funktionsfel. Även ett tidigare godkänt test som krävde automatisk stängning av identitetsgranskning har ändrats till den uttryckliga beslutsregeln.

## Kompletterande funktionsrättningar

- Budgetlåsning stoppar felaktiga kalenderdatum och olösta indexvillkor. Motstridiga indextal får inte godtyckligt välja första raden. Manuellt preliminärt värde kan ersätta månadens preliminära antagande, medan fastställd oktober har företräde.
- Specialtolkarna och generell import använder `domain/import-rules.js` för identifiering, fältbeslut, källprioritet, manuellt skydd och historik. Källtolkarna behåller format- och affärstolkning, exempelvis självständiga indexvillkor för hyra och tillägg och obekräftade projektbelopp. Entydiga celler anges direkt; härledda fält behåller sina inmatningsceller.
- Blandade specialfiler läser grunddata och samlar generella underlag före kompletteringar. Objektens fastighetskoppling och avtalens objektkoppling översätts tillsammans vid kärnimport.
- Beställningsstatus hålls separat från betalstatus. Utförd beställning med noll slutkostnad blir inte åter uppskattad kostnad.
- Företagsimport har separat servergranskning och atomisk applicering. Poster, objekt, relationer, regler, granskning, budgetmetadata och historik sparas tillsammans. Stale granskning och ogiltiga relationer ger ingen delvis skrivning.
- Godkänd rättning av ett källfält ligger kvar vid efterföljande sparning. LEB-uppdatering använder också källprioritet och granskningsregler. Själva LEB-filen skrivs inte om.

Verifiering sker med syntetiska arbetsböcker, riktiga XLSX-bytes, lokala HTTP-anrop och backendomstart. Full testsvit och preflight körs före commit. Ingen skarp arbetsbok har lästs eller ändrats. Visuell webbläsarverifiering återstår i en miljö där Chromium kan starta.
