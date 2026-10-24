# Komplettera med lokaldata efter en tidigare import

Läs in grundtabellen först och välj sedan **Datakällor → Läs in underlag** för
lokaldatatabellen. Samma arbetsyta används. Filerna behöver inte ha samma
kolumnordning eller filnamn.

## Identifiering och återanvändning

- **Avtalsnummer** matchar AvtalsID. Ett befintligt avtal använder sitt sparade
  ObjektID och objektets FastighetsID. Ett nummerprefix får inte skriva om
  befintliga ID:n eller flytta avtal mellan objekt.
- **Förvaltningsobjekt** är en egen källuppgift på Fastighet. Ett känt
  förvaltningsnummer återanvänder fastigheten. För en ny fastighet ger numeriska
  `4201` numret `SF4201`, medan källuppgiften behålls som `4201`. Sparade
  identiteter och kopplingar ändras inte. Ett läsbart nummer visas i gränssnittet.
- **Objektnummer** härleds vid behov från ett tredelat avtalsnummer:
  `SF4201-001-03` ger `SF4201-001`. Hela avtalsnumret behålls exakt. Ett redan
  sparat eller uttryckligt objekt går före härledningen. En ny avtalsversion
  återanvänder samma objekt när numret är entydigt; interna prefix visas inte.
- **Kostnadsställe** hör till Avtal och lagras som text, inklusive ledande nollor.
  Det används inte som identitet; flera avtal kan ha samma kostnadsställe.
- Identifierare och sparade kopplingar bestämmer hemvist. Adressavvikelser
  ändrar inte hemvisten och stoppar inte övrig säker berikning. Motstridiga
  nummer lämnas för rättning och kan inte godkännas genom ett allmänt värdeval.

Ett nytt avtal kopplas med angivna nummer eller en granskad nummerhärledning.
Adress- och namnförslag gäller endast berikning mot sparade fastigheter när
raden saknar alla fastighets-/förvaltnings-/objekts-/avtalsnummer. Vid första
inläsningen får sådana förslag inte koppla ihop olika numrerade fastigheter.
Ett objekt kan ha flera avtalsperioder, men perioderna får aldrig överlappa.

## Övergripande val

Valet visas före detaljlistorna och gäller den aktuella importen:

| Val | Beteende |
| --- | --- |
| Fyll tomma fält och granska värdeskillnader | Kompletterar saknade uppgifter. Sparade källval används; övriga skillnader visas för granskning. |
| Fyll tomma fält och behåll sparade värden | Kompletterar saknade uppgifter och behåller tidigare värden vid skillnader. |
| Uppdatera med filens entydiga värden | Använder ett entydigt nytt värde. Flera olika nya värden för samma uppgift kräver fortfarande ett val. |

Behåll/uppdatera gäller före tidigare källregler i just denna import. Reglerna
raderas inte. Undantag kan väljas per uppgift. Valet finns kvar när kolumnvalen
ändras och posterna kontrolleras igen. Identifierare, relationer och ogiltiga
värden omfattas inte av ett generellt godkännande.

Tomma celler i filen raderar inte befintliga värden. Nya fastigheter, objekt och avtal väljs i tabellen över nya poster före sparning.
Befintliga poster berikas. Se [Granskad import](SAFE_IMPORT.md). Låsta budgetsnapshots ändras inte.

## En kortare granskningslista

- Kända avtal redovisas som återanvända kopplingar, utan nya kryssrutor per rad.
- Entydiga kopplingsförslag kan väljas gemensamt för det aktuella urvalet. Jämförelsen finns vid källraden.
- Osäkra kopplingar visas öppna under **Behöver väljas**.
- Godkända kopplingar kan öppnas separat för kontroll.
- Granska filtabellen och välj nya poster i samma dialog. Saknad beteckning kan
  fyllas i nu eller efter importen. Sparning sker först vid **Spara import**.

## Kolumnernas hemvist

| Källkolumn | Lagring |
| --- | --- |
| Förvaltningsobjekt | Fastighet: `management_object_number` |
| Avtalsnummer | Avtal: `id` |
| Kostnadsställe | Avtal: `cost_center` |
| Gatuadress | Fastighet: `address` |
| Kundtyp avtal | Avtal: `customer_type` |
| Area | Objekt: `area` |
| Avtalstyp | Avtal: `agreement_type` |
| Ursprungligt giltigt fr.o.m. | Avtal: `valid_from` |
| Aktuellt giltigt t.o.m. | Avtal: `valid_to` |
| Förlängningstid | Avtal: `renewal_months` |
| Uppsägningstid | Avtal: `notice_months` |
| Uppsagd den | Avtal: `terminated_on` |
| Uppsägningsorsak | Avtal: `termination_reason` |
| Säg upp senast | Avtal: `notice_by` |
| Lokalkategori | Avtal: `eb_category` |
| Användning | Avtal: `usage` |
| Fastighetsförvaltare | Person och fastighetsägarens personkoppling på Fastighet |

`12 mån` läses som 12 månader. Kod och namn i samma förvaltarcell tolkas med
importens personformat. En person registreras en gång och återanvänds för
samma kontaktroll; uppgiften kopieras inte till varje avtal.

Ursprungligt slutdatum är en annan uppgift än aktuellt slutdatum. Den kolumnen
mappas inte automatiskt till aktuell hyrestid.

## Lagring och verifiering

Nya metadatafält är valfria. En befintlig databas för den aktuella appen får
de nya kolumnerna utan att poster, kopplingar, versionsnummer eller budgetar
skrivs om. Okända prototypkolumner och saknade obligatoriska register/fält
avvisas fortfarande. Aktuella Excel-arbetsböcker kan läsas även när nya
valfria kolumner ännu saknas; nästa sparning använder aktuell modell.

Verifiera med syntetiska underlag:

```sh
npm test
npm run test:local-data-browser
npm run test:table-import-browser
npm run test:lokaler-browser
```

Det nya webbläsarprovet läser först en grundtabell och sedan 80 kompletterande
avtal. Det kontrollerar alla lokaldatafält, ett gemensamt val som överstyr en
sparad källregel, ändrade kolumnval, mobil/dator, återimport, editorvisning och
återläsning efter SQLite-omstart. ID:n och låst budget ska vara oförändrade.
Inga skarpa filer eller verksamhetsdata används i dessa prov.

Verifierat 2026-10-24 med Node.js 24.19.0 och system-Chromium:

- `npm test`: 791 godkända, 0 underkända, 0 överhoppade.
- Syntax/förkontroll: 138 JavaScript-filer.
- Lokaldataflödet och tabellimportens webbläsartest: godkända.
- SQLite, server-Excel och webbläsar-Excel: metadatafält, redigering,
  ledande nollor, sparning och återläsning godkända.
- Kontroll av odefinierade namn i ändrade produktionsmoduler och testskript,
  samt `git diff --check`: godkända.

Granskningen visar nu även status och kopplingskedja per källrad, med skäl för
bortval och knappar som leder till rätt kolumnval eller kopplingsförslag. Se
[Granskad import](SAFE_IMPORT.md#förstå-vad-som-läses-in).

`npm run test:business-number-browser` verifierar SF-nummer, kompakta
kolumnrubriker och återimport mot både nya och befintliga poster i SQLite/Excel.

**Visa / redigera** ändrar celler direkt i importtabellen. Personer visas i en
samlad tabell med namn, e-post, telefon, roll och mål. Värdeskillnader visar
två jämförbara rader och förklarar vilket nummer som är gemensamt. Frågan om
samma eller egen fastighet används endast vid berikning utan identifierare.
Se [redigering och jämförelser](SAFE_IMPORT.md#redigering-och-tydliga-jämförelser).
