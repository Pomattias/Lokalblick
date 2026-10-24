# Kolumnval och spårbar import

Den aktuella importen använder filens tabell som gemensam granskningsyta.
Se [granskad import](SAFE_IMPORT.md) för arbetsgång, statusar och personkopplingar
samt [lokaldata](LOCAL_DATA_IMPORT.md) för de svenska källrubrikerna.

## Kolumnval

Varje kolumn får ett ändringsbart förslag på register och fält. Färgen och
fältnamnet visar exempelvis Fastighet, Objekt, Avtal, Pris på avtal eller Person.
En flik kan innehålla uppgifter till flera register. Okända kolumner måste kopplas
eller väljas bort; de skapar inga extra verksamhetsfält.

Fältväljaren utgår från den aktuella kolumnen. Under **Fler kolumnval** finns
format, bortval, personformat, posttyp och koppling av prisvillkor. Datum och
belopp kontrolleras enligt valt målfält. En månadsuppgift kan räknas om till år
när källrubrik eller uttrycklig kolumnregel anger det.

En uttrycklig matchningsrad läses som Lokalblick-fält. Vid ett osäkert förslag
måste användaren först ange om raden innehåller fältnamn eller vanlig data.
**Hämta kolumnmall** exporterar valen för andra rubriker. Godkända kolumnval,
format och bortval sparas i arbetsytans `importMappings` och matchas mot
källrubriker; oförändrad kolumnordning krävs inte.

## Identitet och kopplingar

Sparade avtalsnummer använder sina befintliga objekt- och fastighetskopplingar.
Förvaltningsnummer är en extern fastighetsnyckel. Kostnadsställe är text på
avtalet och används inte som fastighetsidentifierare. Osäkra adress-/nummerförslag
visar kandidater och underlag; de kräver ett uttryckligt val. Motstridiga
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

Verifierat med syntetiska underlag 2026-10-24: 752 godkända tester och
syntaxkontroll av 133 JavaScript-filer. Inga skarpa verksamhetsdata används.
