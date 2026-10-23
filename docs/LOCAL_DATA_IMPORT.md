# Komplettera med lokaldata efter en tidigare import

Läs in grundtabellen först och välj sedan **Datakällor → Läs in underlag** för
lokaldatatabellen. Samma arbetsyta används. Filerna behöver inte ha samma
kolumnordning eller filnamn.

## Identifiering och återanvändning

- **Avtalsnummer** matchar AvtalsID. Ett befintligt avtal använder sitt sparade
  ObjektID och objektets FastighetsID. Ett nummerprefix får inte skriva om
  befintliga ID:n eller flytta avtal mellan objekt.
- **Förvaltningsobjekt** är en egen källuppgift på Fastighet. Ett känt
  förvaltningsnummer återanvänder fastigheten. Om numret redan används som ett
  sparat FastighetsID kan samma fastighet återanvändas utan att ID:t ändras.
- **Kostnadsställe** hör till Avtal och lagras som text, inklusive ledande nollor.
  Det används inte som identitet; flera avtal kan ha samma kostnadsställe.
- Adress och andra identifierare kontrolleras tillsammans. Om de pekar på olika
  befintliga fastigheter eller objekt lämnas raden för rättning. Ett
  övergripande val av värden kan inte godkänna en motstridig koppling.

Ett nytt avtal utan sparad objektkoppling måste kunna kopplas säkert. En unik
adress ger ett förslag som kan godkännas samlat. En tvetydig adress kräver ett
enskilt val. Riktiga ID-kolumner och redan sparade kopplingar går före gissningar
från avtalsnumrets utseende.

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

Tomma celler i filen raderar inte befintliga värden. Nya giltiga poster kan
läggas till, medan befintliga poster berikas. Låsta budgetsnapshots ändras inte.

## En kortare granskningslista

- Kända avtal redovisas som återanvända kopplingar, utan nya kryssrutor per rad.
- Nya entydiga förslag har en gemensam godkännandeknapp. Listan är hopfälld.
- Osäkra kopplingar visas öppna under **Behöver väljas**.
- Godkända kopplingar kan öppnas separat för kontroll.
- Sparning sker först när **Genomför import** väljs.

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

Verifierat 2026-10-23 med Node.js 24.19.0 och system-Chromium:

- `npm test`: 708 godkända, 0 underkända, 0 överhoppade.
- Syntax/förkontroll: 127 JavaScript-filer.
- Lokaldataflödet och tabellimportens webbläsartest: godkända.
- SQLite, server-Excel och webbläsar-Excel: metadatafält, redigering,
  ledande nollor, sparning och återläsning godkända.
- Kontroll av odefinierade namn i ändrade produktionsmoduler och testskript,
  samt `git diff --check`: godkända.
