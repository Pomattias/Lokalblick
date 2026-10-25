# Granskad import i den aktuella datamodellen

Importen är ett utkast fram till **Spara import**. Filens tabell, kolumnval,
kopplingar och nya poster granskas på samma yta. De tidigare kolumnkorten,
radkorten och separata godkännandestegen har ersatts.

## Förstå tabellen

- Varje kolumn behåller filens rubrik. Färgen och fältnamnet visar dess register:
  fastighet, objekt, avtal, pris på avtal, person, part, ärende eller beställning.
  Rubriken har separata val för **Tabell** och **Kolumn** samt kryssrutan
  **Importera ej**. Avmarkering återställer destination och inställningar.
  **Inställningar…** i kolumnvalet öppnar exempel, personformat, datumtolkning
  och villkor för avtalsposter.
- Filens värde eller din korrigering visas i cellen. Bortval stryks över och fel beskrivs på raden;
  förändrade sparade värden visar före/efter. Färg betecknar register, aldrig säkerhet.
- **Visa / redigera** i radens första kolumn gör cellerna redigerbara och visar kedjan
  **Fastighet → Objekt → Avtal → Priser** och förklarar vilken identifierare som
  matchade. Efter öppnade detaljer upprepas filens rubriker före nästa datarad,
  utan fler fältval. Kedjan visar **Nytt objekt** och **Nytt avtal**; generella
  väntemärken upprepas inte på varje post. Ogiltiga relationer får inga pilar
  som antyder en säker koppling.
- Personkopplingar visar **person, roll här och mål** separat. Ändra förslag
  eller lägg till en annan koppling för samma person. Ägarens kontaktperson är
  skild från fastighetsägaren, som är en part. Befintliga personkopplingar och
  deras historik ändras via registret. Ärvda ansvar visas utan att kopieras.
- Priser visar avtalsnumret, tidigare/nytt belopp och öppningsbara prisvillkor.

Fastighetsnummer, objektnummer och avtalsnummer visas som verksamhetens
nummer: **SF4201 → SF4201-001 → SF4201-001-03**. Förvaltningsobjekt `4201`
ger fastighetsnumret `SF4201` för en ny post. Objektet får avtalsnumret utan
den sista delen. Avtalsnumret ändras inte. Saknas en säker tolkning visas
att numret saknas; interna nycklar används enbart för lagrade referenser.
Befintliga kopplingar behålls och nya avtalsversioner återanvänder ett entydigt
befintligt objekt. Olika avtals-ID får gälla samtidigt på objektet, även om
datumen är lika eller saknas. Tvetydiga identifierare lämnas för granskning.

| Status | Betydelse i det aktuella utkastet |
| --- | --- |
| Skapas | En ny post har valts och kommer att skapas vid sparning. |
| Kompletteras | Tomma fält på en befintlig post fylls i. |
| Ändras | Ett tidigare värde ersätts enligt dina val. |
| Oförändrat | Befintliga verksamhetsvärden återanvänds. |
| Läses inte in | En uppgift är bortvald eller beror på en bortvald post. |
| Behöver ditt val | Fältval, värde eller koppling behöver granskas. Säkra delar kan fortfarande ingå. |

## Välj en gång och spara

1. Kontrollera kolumnförslagen i tabellrubrikerna. Ändringar räknas om automatiskt.
   Filens matchningsrad och utgångspunkt finns under **Filens rubriker och matchningsrad**.
   **Hämta kolumnmall** exporterar fältval för källor med andra rubriker.
2. Öppna **Nya poster att välja**. Fastigheter, objekt och avtal förekommer en gång
   var och är inte förmarkerade. Välj enskilda, alla möjliga i urvalet eller välj
   bort urvalet. Ett objekt kräver vald fastighet och ett avtal kräver valt objekt.
   Ett fastighetsförslag kan i stället kopplas till en befintlig fastighet.
3. Saknad beteckning visas som **Fastighetsbeteckning saknas**. Öppna radens
   **🔗 Visa / ändra** och fyll i beteckningen direkt på fastigheten i kedjan.
   Alla dess källrader uppdateras tillsammans. Lämna fältet tomt för att komplettera under
   **Fastigheter → fastigheten → Information → Redigera** efter importen.
4. Kontrollera utfallet och välj **Spara import**. Det är den enda sparningen.
   Avbryt eller Escape kastar utkastet utan att skriva till arbetsytan.

Kolumnval, värdeval och giltiga skapandebeslut behålls när andra delar granskas.
En kompletterad beteckning kräver inte nya godkännanden. Ändrad identitet eller
överordnad koppling kräver ett nytt beslut för den berörda posten. Ändrat urval
av blockerade rader kräver nytt beslut om partiell import. Ett osäkert mål som
väljs på källraden används direkt; samma koppling har ingen extra godkännanderuta.

Radtabellen visar 30 rader i taget; nya poster visar 100. Sökning och status-/registerfilter
begränsar urvalet. **Lägg till alla möjliga i urvalet** omfattar även matchande poster
utanför den synliga sidan. Sammanställningen skiljer källrader, registerposter och
personkopplingar. Nya källhänvisningar räknas inte som ändrade verksamhetsvärden.

## Vad som skyddas

- Bortvalda fastigheter återskapas inte via någon senare avtalsrad eller annan
  gissad identifierare. Beroende objekt, avtal, priser, kontakter och andra
  refererande nya poster hålls tillbaka tillsammans.
- Befintliga poster raderas inte när ett nytt förslag lämnas utanför. Befintliga
  relationer får inte flyttas genom funktionen för att koppla ett nytt förslag.
- Vid uttrycklig koppling till befintlig fastighet kompletteras dess tomma fält.
  Olika sparade uppgifter lämnas för granskning; de skrivs inte över av kopplingsvalet.
- Kolumnmallar sparar fältval och format, aldrig godkännande av registerposter.
  Nya poster i nästa fil måste därför godkännas igen.
- Historik, registerantal och importkvitto avser de uppgifter som faktiskt
  sparas. Källrader för uppskjutna poster finns i granskningsunderlaget och
  posterna kan godkännas när underlaget läses in igen.
- Tidigare granskningar från andra filer bevaras. När en tidigare uppskjuten
  post godkänns markeras dess granskning som löst.
- Låsta budgetsnapshots och skarpa Exceloriginal ändras inte av granskningen.

Parter och personer som behövs för godkända uppgifter följer med och redovisas
i sammanställningen. Automatiskt skapade personer/parter som enbart hör till
bortvalda källrader och saknar kvarvarande koppling följer inte med.
Fristående person- eller partsregister är fortfarande valda importunderlag.

## Kod och kontroll

- `frontend/v2/import-mapping.js`: en importsession, kolumn-/värdeval och sparbeslut.
- `frontend/v2/import-table.js`: filtabell, registerfärger, radförklaringar och kopplingar.
- `frontend/v2/import-approval.js`: gemensam lista för nya registerposter.
- `frontend/v2/import-row-review.js`: orsaker, filter och kopplingsval på källraderna.
- `frontend/v2/import-people.js`: samlad persontabell, personuppgifter och bolagsnamn.
- `frontend/v2/import-contact.js`: tillägg och ändring av nya personkopplingar vid källraden.
- `frontend/v2/import-cell-editor.js` och `frontend/lokaler/import-cell-edits.js`: cellredigering och isolerade källkorrigeringar.
- `frontend/lokaler/import-review.js`: isolerade kompletteringar, återanvända personer
  och giltiga beslut som följer med omräkning.
- `frontend/lokaler/import-plan.js`: skapandebeslut, beroenden, validering, historik och kvitto.
- Importmotorn har sessionsbundna identiteter för personer/kopplingar. Valda
  personkopplingar spåras i befintlig ändringshistorik, så samma källa inte
  återskapar ett ersatt förslag vid återimport. Inget extra personregister skapas.
- Befintlig workspace-transport gör den atomära skrivningen. Separat
  bakgrundsgeokodning kan därefter spara koordinater enligt befintligt flöde.

```sh
npm test
npm run test:approval-browser
npm run test:inline-import-browser
npm run test:local-data-browser
npm run test:table-import-browser
npm run test:lokaler-browser
```

Verifierat med syntetiska filer 2026-10-25: 800 tester och syntaxkontroll av 138
JavaScript-filer. Webbläsarprovet följer fil → tabell → ändrade val → API → SQLite
→ återöppning: selektiva/allmänna urval, 122 nya fastigheter, saknad beteckning
före/efter import, en person med flera roller och mål, återimport och avbrott utan
skrivning. Dator/mobil, 80 befintliga avtalskopplingar, Excel-lägen och låsta
budgetsnapshots kontrolleras separat. Ingen skarp verksamhetsdata används.

Originalceller hämtas från den redan öppnade arbetsboken. Rapportens radspår och
sessionscache lagras inte som en extra datatabell.

## Väntande rader i samma tabell

Ett väntande adressförslag är en koppling som behöver väljas, inte en extra
källrad. Alla källrader finns kvar i filtabellen även när en identifierare
eller koppling ännu inte godkänts. Varje väntande koppling visas med sitt
jämförelse direkt under sin källrad, med samma tabellutformning. Den tidigare separata
kopplingslistan har tagits bort.

**Behöver kopplas** samlar osäkra fastighets-/nummerförslag. **Behöver
kompletteras** samlar saknade beteckningar och ogiltiga valfria fält.
**Nya poster att godkänna** betyder att identiteten är känd men skapandet
inte valts. Ett kompletteringsfel visas med sin verkliga orsak även innan
posten godkänts. Statusen för sparandet hålls isär från vad raden behöver.

**Godkänn entydiga kopplingsförslag i urvalet** gäller samma sökning och
filter som tabellen, även matchande rader utanför dess synliga sida.
Flera möjliga mål kräver ett eget val på raden. Ingen koppling godkänns
av att bara visa eller filtrera tabellen. Nya poster behåller sina
separata krav på skapandebeslut.

En kolumn mappad till fastighetsbeteckning med numeriska exempel får en
upplysning om att kontrollera om det är kostnadsställen. Förslaget ändrar
inte automatiskt kolumnval eller sparade beteckningar.

Webbläsarprovet använder 154 syntetiska rader med 21 väntande kopplingar,
kontrollerar filtrerade massval, komplettering, återimport, exakt en slutlig
skrivning, återöppning av SQLite samt oförändrade låsta budgetsnapshots.

Nummerkedjan och dolda interna nycklar provas i både SQLite och Excel med
`npm run test:business-number-browser`.

Adress och namn får bara ge kopplingsförslag för rader utan fastighets-/
förvaltnings-/objekts-/avtalsnummer, mot fastigheter sparade före importen.
Första inläsningen kopplar inte ihop olika numrerade fastigheter genom namn
eller adress. Befintliga avtals- och objektkopplingar behålls; en avvikande
adress blir en fältavvikelse. Verkliga nummerkonflikter stoppas.
`npm run test:simple-import-browser` verifierar detta och samtidiga avtals-ID.

## Redigering och tydliga jämförelser

**Visa / redigera** öppnar radens celler. **Klart** avslutar redigeringen;
**Spara import** är fortfarande den enda skrivningen. Fastighetsbeteckningen
ändras i sin cell, utan ett separat formulär i kopplingskortet. Saknas kolumnen
visas en kompletteringskolumn. Delade sakuppgifter, exempelvis en fastighets
beteckning, uppdateras på alla berörda källrader. Nummer korrigeras per källrad
och går genom samma kontroll av identifierare och sparade föräldrakopplingar.
Källfilen ändras aldrig. Bortval/remappning gör en gammal cellkorrigering inaktiv.

**Personer i importen** visar en rad per person med namn, e-post, telefon,
**Bolag / organisation** och personens importresultat. Sökning och sidindelning
gäller personer. Roll, mål och antal kopplingar visas inte i personöversikten.
Bolagsnamnet hämtas från personens organisation. För fastighetsägarens
kontaktperson visas även de företrädda fastighetsbolagen, utan dubbletter.
Saknas uppgiften visas ett streck; bolag gissas inte från adresser eller
andra roller. Personuppgifter redigeras en gång för alla kopplingar.
**Ändra koppling** i källradens detaljer redigerar nya kopplingars roll och mål.
Sparade kopplingar ändras i registret. Korrigerade personuppgifter och kopplingsval spåras i befintlig
ändringshistorik, så återimport av samma underlag återanvänder personen.

Två olika slags jämförelser har olika frågor:

- **Värdeskillnad på samma nummer:** tabellen visar tidigare och inkommande rad,
  samma fastighetsnummer, beteckning och adress. Den förklarar om den tidigare
  raden kommer från samma fil eller är sparad före importen. Användaren väljer
  ett värde; detta ändrar aldrig kopplingen till en annan fastighet.
- **Kopplingsförslag vid berikning utan nummer:** filens rad jämförs med sparade
  kandidater. **Samma fastighet** väljer kopplingen. **Egen fastighet** skapar
  en egen post, med valfritt fastighetsnummer, och räknas som dess skapandebeslut.
  Ett redan registrerat nummer får inte återanvändas för en egen ny fastighet.

Första inläsningen jämför inte fastigheter genom adress eller namn.
Tabellen över nya poster visar nummer, koppling, källa och varför skapandet
behöver väljas. Befintliga fastigheter godkänns inte en gång till.

`npm run test:inline-edit-browser` följer fokuserad cell → worker → personval →
API → SQLite/server-Excel. Provet kontrollerar återimport, samma/egen fastighet,
värdejämförelser, bibehållna skapandeval, avbrott och låsta budgetsnapshots.


Olika avtals-ID begränsas inte av varandras perioder på objektet. Kontrollen
används likadant i importmotorn, modellen och lagringen. Exakta avtals-ID,
objektreferenser, giltiga datum och bashyrans villkor per avtal behålls.
