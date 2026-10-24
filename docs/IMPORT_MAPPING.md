# Kolumnval och spårbar import

Den aktuella importen använder filens tabell som gemensam granskningsyta.
Se [granskad import](SAFE_IMPORT.md) för arbetsgång, statusar och personkopplingar
samt [lokaldata](LOCAL_DATA_IMPORT.md) för de svenska källrubrikerna.

## Kolumnval

Varje kolumn får ett ändringsbart förslag på register och fält. Färgen och
fältnamnet visar exempelvis Fastighet, Objekt, Avtal, Pris på avtal eller Person.
En flik kan innehålla uppgifter till flera register. Okända kolumner måste kopplas
eller väljas bort; de skapar inga extra verksamhetsfält.

Varje källkolumn har två separata val: **Tabell** och **Kolumn**.
**Importera ej** är en kryssruta. När den avmarkeras återställs fältvalet och
tolkningen, även för datum och avtalsposter. **Inställningar…** i kolumnvalet
öppnar exempel, format, personformat, posttyp och koppling av prisvillkor.
**Sök alla fält…** öppnar sökning över registren. Inställningarna ändrar samma utkast; inget behöver väljas om. Datum och
belopp kontrolleras enligt valt målfält. En månadsuppgift kan räknas om till år
när källrubrik eller uttrycklig kolumnregel anger det.

En uttrycklig matchningsrad läses som Lokalblick-fält. Vid ett osäkert förslag
måste användaren först ange om raden innehåller fältnamn eller vanlig data.
**Hämta kolumnmall** exporterar valen för andra rubriker. Godkända kolumnval,
format och bortval sparas i arbetsytans `importMappings` och matchas mot
källrubriker; oförändrad kolumnordning krävs inte.

## Identitet och kopplingar

Sparade avtalsnummer använder sina befintliga objekt- och fastighetskopplingar.
Numeriskt förvaltningsnummer `4201` ger nya fastigheter numret `SF4201`.
Källuppgiften `4201` behålls för matchning. `SF4201-001-03` ger objekt
`SF4201-001`; hela avtalsnumret, inklusive slutdel och ledande nollor, bevaras.
Uttryckliga objektnummer och sparade kopplingar går före härledningen.
Äldre interna nycklar återanvänds via entydiga verksamhetsnummer och visas
aldrig som nummer i gränssnittet. Saknas säkert nummer visas vad som saknas. Kostnadsställe är text på
avtalet och används inte som fastighetsidentifierare. Adress- och namnmatchning får endast ge kopplingsförslag vid berikning av
fastigheter som fanns före importen, och endast när raden saknar fastighets-,
förvaltnings-, objekts- och avtalsnummer. En adress får inte konkurrera med en
angiven identifierare eller slå ihop nya poster med olika nummer.
Avvikande adresser på en identifierad post granskas som fältvärden.
Tillåtna kopplingsförslag visar kandidater direkt på källraden; de kräver ett uttryckligt val. Motstridiga
identifierare kan inte godkännas genom ett övergripande värdeval.

Personer identifieras med person-ID, e-post eller entydigt namn och part.
Personformatet kan skilja namn från en källkod i samma cell. En persons roll hör
till relationen med en fastighet, ett avtal, ett ärende eller en beställning.
Samma person kan därför ha flera kopplingar. Ägaren är en separat part;
ägarens kontaktperson är en personkoppling.

Nya fastigheter, objekt och avtal måste väljas i listan för nya poster. Beroenden
kontrolleras före sparning. Giltiga val behålls när andra kolumner ändras, medan
ändrad identitet eller förälder kräver ett nytt beslut för den berörda posten.

## Värden, historik och lagring

Tomma celler raderar inte befintliga värden. Övergripande värdeval kompletterar,
behåller eller ersätter entydiga värden; undantag kan göras per uppgift.
Manuella kompletteringar och valda personkopplingar följer med i ändringshistoriken.
Olösta värdeskillnader och fel sparas för granskning utan att säkra uppgifter
behöver gå förlorade. Saknad beteckning kan kompletteras före eller efter import.

Arbetsboken återanvänds i webbläsaren. Importmotorn räknar om ändrade kolumnval
i en återanvänd Web Worker och förkastar sena resultat från äldre val. Sökning,
filter och öppnade rader kräver ingen ny importberäkning. Sessionsidentiteter
behåller samma person-/kopplingsförslag under granskningen.

`sourceRegistry` innehåller källor och kvitton, `importMappings` kolumnval och
ändringshistoriken de val som faktiskt sparas. Rapportens radspår används för
förklaringar och lagras inte som en extra källtabell. Den ordinarie transporten
validerar och sparar det godkända utkastet atomärt i SQLite eller Excel.

## Verifiering

`npm test` kontrollerar importer, identiteter, relationer, värdeval och lagring.
`npm run test:import-browser` och `npm run test:approval-browser` kör samma
aktuella prov av fil → tabell → granskning → API → SQLite → återimport.
Det tidigare separata provet använde utgångna fält som `costCenterPremises`
och har ersatts. Kompletterande prov finns för tabellimport, lokaldata,
priser, ärenden samt server- och webbläsarbaserad Excel-lagring.

Verifierat med syntetiska underlag 2026-10-24: 783 godkända tester och
syntaxkontroll av 135 JavaScript-filer. Inga skarpa verksamhetsdata används.

Väntande källrader hanteras i samma tabell med filtren **Behöver kopplas**,
**Behöver kompletteras** och **Nya poster att godkänna**.
`npm run test:inline-import-browser` verifierar 154 rader, varav 21 väntar
på koppling, utan någon separat kopplingslista. Massval följer tabellens
urval och sökning.

`npm run test:business-number-browser` provar SF-kedjan, kompakta rubriker,
ändringsbara kolumninställningar, interna nycklar i befintliga poster, avbryt,
sparning och återimport i både SQLite och Excel.

`npm run test:simple-import-browser` provar separata val, beständiga bortval,
rubrikrader efter öppnade detaljer och första inläsning med lika namn/adresser
men olika nummer. Efterföljande avtal återanvänder objekt; överlapp avvisas.
