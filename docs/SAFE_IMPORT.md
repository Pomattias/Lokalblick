# Granskad import i den aktuella datamodellen

Importen är ett utkast fram till **Spara import**. Filens tabell, kolumnval,
kopplingar och nya poster granskas på samma yta. De tidigare kolumnkorten,
radkorten och separata godkännandestegen har ersatts.

## Förstå tabellen

- Varje kolumn behåller filens rubrik. Färgen och fältnamnet visar dess register:
  fastighet, objekt, avtal, pris på avtal, person, part, ärende eller beställning.
  Rubriken innehåller fältkopplingen och **Importera inte**. Klicka på kopplingen
  för att byta fält. **Inställningar för kolumnen** i fältväljaren öppnar
  exempel, personformat, datumtolkning och villkor för avtalsposter.
- Originalvärdet visas i cellen. Bortvalda eller väntande uppgifter märks med text;
  förändrade sparade värden visar före/efter. Färg betecknar register, aldrig säkerhet.
- **🔗 Visa / ändra** i radens första kolumn öppnar den verkliga kedjan
  **Fastighet → Objekt → Avtal → Priser** och förklarar vilken identifierare som
  matchade. Ogiltiga relationer får inga pilar som antyder en säker koppling.
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
befintligt objekt. Tvetydigheter och överlappande avtalsperioder lämnas för
granskning.

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
- `frontend/v2/import-contact.js`: redigering av föreslagen person, roll och mål.
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

Verifierat med syntetiska filer 2026-10-24: 770 tester och syntaxkontroll av 135
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
förslag och val direkt i radens första kolumn. Den tidigare separata
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
