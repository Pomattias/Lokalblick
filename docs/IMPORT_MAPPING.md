# Lokal Excelmappning och fältspårbarhet

## Genomförd ändring

V2:s ordinarie Excelimport har nu kolumnmappning och en separat resultatförhandsgranskning före lagring. Okända flikar stoppas inte längre av adapteridentifieringen när användaren väljer mappning. Kända specialadaptrar finns kvar för index, hyrestillägg och befintliga källprofiler; ändrad kolumnmappning växlar till den generella vägen.

Flöde: välj fil → välj flikar → kontrollera kopplingar → granska föreslagna ändringar → genomför import. Avbryt lämnar arbetsdatan orörd. Inläsning, fingeravtryck och analys sker i webbläsaren utan att filen skickas till en extern tjänst. Befintlig Excel- och arbetsytelagring används.

## Ansvar och återanvändning

- `source-service.js` äger kanoniska scheman, filåtkomst och Excelåterläsning. `prepareMapping` tillhandahåller samma arbetsbok som det befintliga importflödet använder.
- `import-engine.js` tolkar rubriker, återanvänder godkända schemaförslag, normaliserar datatyper och förbereder fältändringar på en kopia. Den definierar ingen alternativ affärsmodell.
- `import-mapping.js` visar ändringsbara förslag, exempelvärden, identitetskolumner, kompletterande information och resultat innan lagring.
- `import-workspace.js` och `transport.js` behåller ansvaret för lagring.
- `field-history.js` visar källor och historik hopfällbart i befintliga formulär.

Ingen ny databas eller extern AI-tjänst har införts. Specialadaptrarnas affärsberäkningar har inte ersatts av en allmän hyresmodell.

## Beslutsregler

En unik identifierare kan ge säker matchning. Samma fastighetsbeteckning med motstridig ort ger granskning. Adressmatchning kräver både unik adress och samma angivna ort. Flera kandidater hålls i granskningsunderlaget. Avtal slås aldrig ihop enbart på adress. Nytt avtal behöver fastighetskoppling; beställning behöver aktivitet. Relationer måste matcha entydigt.

Tomma importvärden raderar inte befintliga värden. Befintliga värden ger fältkonflikter om en godkänd fältprioritet inte väljer den inkommande källan. Manuella värden skyddas även när värdet avsiktligt har tömts. Manuellt godkända konflikter och identitetsval loggas.

Okända kolumner kan kopplas till ett standardfält, ignoreras eller bevaras som `supplemental` på vald objekttyp. Poster utan tillräcklig identitet bevaras med värden, cellreferenser och förklaring i `importReview`.

## Lagring och historik

`sourceRegistry` innehåller filnamn, SHA-256-fingeravtryck, flikar, importtid och uppmätta antal. Fältens `provenance` refererar till källans ID och innehåller flik, rad, cell, kolumnrubrik, originalvärde, normalisering och mappningsversion. Härledda relationer innehåller underlagets cellreferenser. Identitetsbeslut markeras som automatiska eller manuella.

`importMappings` innehåller schemaidentifiering och versionerade, godkända kolumnkopplingar. Kolumnordning ingår inte i schemaidentifieringen; återanvändning sker efter rubrik, inte gammalt kolumnindex. Ändrad regel ändrar inte äldre fältproveniens.

Mappningar, källregister och fullständig revisionshistorik lagras i arbetsfilens befintliga tekniska Tilläggsdata. Synliga Källor och Ändringslogg bevaras. API-arbetsytans metadata inkluderar även mappningsregler och fältprioriteter. Självangiven användaridentitet markeras som ej verifierad. Oförändrad återimport skapar inte nya fälthändelser.

## Verifiering och avgränsningar

15 nya automatiska tester använder syntetiska arbetsböcker. De täcker bland annat okänd struktur, rubrikrad efter inledande text, återimport, kolumnordning, två avtal på en fastighet, motstridig ort, manuellt tömda fält, månadsbelopp, hyperlänkar, källprioritet och Excelåterläsning av cellhistorik. Kompletterande formulär-, transport- och granskningskontroller körs separat.

Baslinjen före ändringen: 157 tester, 140 godkända, 17 underkända. Ett befintligt produktionsfel i PDF-länkläsning (`normalizeContractNo` saknades) har rättats. Alla återstående baslinjefel ska redovisas; hela sviten får inte beskrivas som godkänd.

Efter ändringen: 172 tester, 157 godkända, 15 underkända. De 15 nya importtesterna passerar. Den riktade gruppen med import, formulär, transport och modulstart omfattar 51 godkända tester. Preflight passerar. De 15 kvarvarande felen har samma testnamn som underkända tester i baslinjen; två tidigare underkända avtalsimporttester passerar efter rättningen av PDF-länkläsningen. Kvarvarande fel inkluderar både testharnessproblem (saknade `clone`/`setTimeout`, äldre test-API) och avvikelser i budget, ordermatchning och äldre granskning. De är inte avfärdade som enbart testproblem.

Webbläsarskriptet `scripts/import-browser-check.mjs` verifierar det verkliga importflödet med en syntetisk fil och lokalt serverad kod. Det behöver en miljö där Chromium får skapa sockets. Den aktuella Work-körmiljön blockerade Chromiumstart; visuell och fullständig webbläsarverifiering är därför inte genomförd.

Det övergripande beställningsunderlaget är större än denna ändring. Följande återstår för hela uppdraget:

- Flera oberoende tabeller på samma flik, sammanslagna rubriker och manuell rubrikradsjustering behöver mer strukturtolkning. Nu analyseras en tabell per vald flik.
- Företags-API:ts befintliga spärr för direkt Excelimport är kvar. Dess masterdataadapter behöver ett separat kontrollerat importkontrakt innan nya fastigheter och avtal får skrivas där. Den lokala Excelarbetsfilen använder det nya flödet.
- Alla specialadaptrar behöver konsolideras och få samma fullständiga cellproveniens. Den generella vägen har cellspårbarhet; äldre adaptrar kan fortfarande endast ange fil, flik och rad.
- Generell källprioritet, prioritet per informationsområde och redigering av kompletterande rubriker saknas fortfarande. Befintliga fältprioriteter återanvänds.
- Granskning kan koppla sparade osäkra poster till befintliga objekt. Att skapa en ny post ur redan sparat granskningsunderlag och avancerad batchhantering behöver kompletteras.
- Årskostnaders fullständiga beräkningsproveniens och hela representativa testmatrisen i beställningen är inte färdiga.

Ingen verklig verksamhetsfil har använts eller ändrats. Ingen Vercelversion har verifierats för denna ändring.

## Gemensamma fältnamn

Frontendens användarnamn samlas i `FRONTEND_LABELS` i den befintliga schemadefinitionen. Formulär använder `fieldCaption`, medan Excel och importförslag använder samma schema. Avtalets period benämns Giltigt fr.o.m. och Giltigt t.o.m.; den senare innebär inte uppsägning. Inflyttningsdatum och Utflyttningsdatum är separata fält. Enheter anges i rubriken för bland annat area, hyra och tidsvillkor.

Äldre Excelrubriker lagras som läsalias när rubriken byts. Därmed läses tidigare arbetsfiler utan att datum eller villkor tappas, medan nästa export får de gemensamma namnen. Interna affärsnycklar och beräkningar ändras inte. Verkliga arbetsfiler ändras först när användaren själv sparar från appen.

## Förhandsgranskning per kolumn

Steg 3 visar en rad per Excelkolumn med exempel, ändringsbart målfält, antal fältändringar och avvikelser. Användaren väljer källprioritet en gång för hela kolumnen. Regeländringen räknar om förhandsgranskningen på en kopia av arbetsdatan. Manuella värden skyddas fortfarande. Reglerna blir beständiga först när importen genomförs.

Osäkra identiteter sammanfattas per flik, objekttyp och orsak i en hopfällbar del. Antalet osäkra rader räknas utan att samma källrad räknas flera gånger för olika objekttyper. Förhandsgranskningen visar inte längre hundratals individuella val eller listor med enskilda fältändringar. Granskningsunderlaget bevaras för verkliga undantag efter importen.

Kolumnkoppling och berikningsförhandsgranskning visar nu varje importerad flik som en horisontell tabell: originalrubriker, tre sammanhängande exempelrader (med tomma celler bevarade) och målfältsval under respektive kolumn. Valet gäller hela kolumnen. Breda flikar kan scrollas horisontellt.

Årsbudget: budgetförslag visas i Hyra, Investering och Drift, med justering i kronor som fördelas proportionellt per objekt (avrundningsrest på sista objektet). Låsningen sparar belopp, grundbelopp, justering, källobjekt, indexantagande, tidpunkt och aktör i budgetplanens rader. Levande uppgifter påverkar prognosen, inte sparade rader. Aktiviteter utan explicit årsfördelning fördelas över kalendermånaderna i start-/t.o.m.-perioden; explicit årsfördelning inklusive noll har företräde. Automatisk KPI använder SCB TAB6792, fastställda tal ombasade till 1980=100, via samma API i Vercel och lokala servrar. Oktober har företräde, annars senaste publicerade månad före oktober under indexåret. Den senare används preliminärt för budgeten. Ingen verksamhetsdata skickas till SCB.

## Gemensamt underlag från flera filer (oktober 2026)

V2 kan välja flera lokala Excel-filer i samma import. Fliklistan visar ursprungligt filnamn och fliknamn; identiskt namngivna flikar har separata interna nycklar. Valda underlag tolkas och konsolideras på en kopia före lagring. Alla fastigheter behandlas före alla objekt, följt av avtal, aktiviteter och beställningar, oavsett filernas ordning. En flik kan berika flera nivåer samtidigt. Ett redan entydigt identifierat avtal kan förankra kompletteringar på sin fastighet eller sitt objekt.

Objektnummer matchas inom fastigheten. Dubbla objekt- eller fastighetskandidater, motsägande relationer och föräldralösa avtal/beställningar hålls i granskningen. Återkommande poster kompletteras; motstridiga fältvärden får källspecifika konflikter. Varje uppgift behåller originalfil, flik, rad, cell, värde och filens fingeravtryck. Förhandsgranskningen visar antal identifierade poster och återkommande kopplingar som sammanförts. Sparade kolumnregler är fil- och strukturanknutna och fungerar även när kolumner byter ordning.

`import-formats.js` tolkar datatyper automatiskt. Datum stöder ISO, svenska dag/månad/år, åttasiffriga datum och Excels båda datumsystem. Kalenderfel och tvetydiga datum får inte bli importerade datum. Numeriska fält stöder decimaltecken, tusentalsavskiljare, negativa belopp, SEK/kr/kronor och tkr/Mkr. Månadshyra räknas om till årshyra; procentformaterade Excelvärden blir procenttal. Identiteter och telefonnummer bevaras som text. Kompletterande kolumner får också ett tolkat format och värde medan originalet ligger kvar i proveniensen. Användaren väljer inte datatyp eller teknisk identitetsnyckel. Byte av målfält räknar automatiskt om formatförslaget och identifieringen.

Normal filväljare används när webbläsaren saknar `showOpenFilePicker`, utan uppladdning. Kända specialadaptrar för enskilda filer finns kvar för deras befintliga index- och tilläggsregler. Flera filer använder den generella konsolideringen; de äldre specialberäkningarna är inte automatiskt översatta till gemensamma batchregler. En tabell per flik tolkas fortfarande. Direkt Excelimport i företags-API-läge omfattas av den tidigare spärren.

Verifiering: 74 riktade importer-, format-, objekt-, transport- och förhandsgranskningstester passerar, inklusive riktiga XLSX-bytes, olika datumsystem, omvänd filordning och oförändrad återimport. Hela sviten har fortsatt 16 redan kända underkända tester. Webbläsarverifieringen kunde inte genomföras eftersom Chromium inte startade i körmiljön. Ingen verksamhetsfil har ändrats.


## Gemensamma regler och företagsimport

`frontend/domain/import-rules.js` äger de gemensamma identitets- och skrivbesluten. Generell kolumnmappning, operativ berikning, avtalstolkning, projektunderlag och kärnimport får samma källprioritet och skydd av manuella värden. Specialtolkarna föreslår fortfarande källspecifika belopp och kopplingar; deras resultat granskas av den gemensamma policyn före lagring. Osäkra projektbelopps enhet antas inte utan underlag. Exakta celler och inmatningsceller för härledda värden följer med.

Flera kända och okända filer kan väljas tillsammans. Grunddata och generella kolumner behandlas före operativa tillägg; objekt- och avtalsreferenser översätts till samma fastighets-ID. Kända specialtolkningar finns kvar även för flera filer. Ändrad kolumnmappning kan använda den generella vägen.

Företagsläget har nu samma importval i V2. Den godkända förhandsgranskningen skickas till företagets API för validering och skrivs i en enda transaktion tillsammans med regler och historik. Den tidigare generella spärren för Excelimport i företagsläget är ersatt av ett kontrollerat importkontrakt. Se `BACKEND_FRONTEND_CONTRACT.md` och `TEST_FAILURE_REVIEW.md`. Årsfördelning, index, gamla testförväntningar och verkliga funktionsfel har verifierats separat.

## Snabbare successiv berikning (12 oktober 2026)

Importen utgår från sparade poster och behandlar fastigheter före objekt, avtal och aktiviteter. Uppslag uppdateras efter varje behandlad post, så även nya fastigheter och objekt är tillgängliga för senare rader i samma import. Dubblettkandidater behålls i uppslaget och kräver fortsatt granskning. Återimport bevarar stabila ID:n och skapar ingen extra historik för oförändrade värden.

Valda flikar läses en gång per fil och flikurval inom importsesssionen och återanvänds mellan kolumnmappning och specialtolkning. Cachen är knuten till filobjektet med WeakMap och återanvänds inte mellan nya filval. Rubrik- och cellkopplingar för specialtolkarnas spårbarhet förbereds en gång per fält/flik inom respektive bearbetning. Målfältskatalogen förbereds en gång för hela den generella importen.

Förhandsgranskningen visar per tabell antal nya poster, befintliga poster som ändras och källrader med olösta granskningsärenden. Generell import visar även bearbetningstid; den omfattar förberedelse av rader, matchning och berikning men inte filväljare, XLSX-läsning, användarens granskning eller sparande. Hela importen räknas fortfarande om när kolumnkoppling eller källregel ändras; inkrementell omräkning och Web Worker är inte införda.

Kontrollerad mätning på samma syntetiska underlag och i samma Node/VM-miljö jämförde föregående kod med ändringen: 1 000 rader med fastighetsbeteckning, adress, ort, objektnummer, avtalsnummer och bashyra gav 1 000 fastigheter, 1 000 objekt och 1 000 avtal i båda versionerna. Kolumnprofilering gick från 71 ms till 8 ms; förberedelse, matchning och berikning från 5 650 ms till 121 ms. En separat spårbarhetsmätning med 1 000 rader, 30 kolumner och åtta fält per rad gick från 9 141 ms till 76 ms. Det är en enskild mätning av importmotorn, inte en garanti för total importtid i användarens webbläsare eller riktiga underlag.

Regressionstester täcker successiv import, flera avtal per objekt, samma objektnummer på olika fastigheter, oförändrad återimport, indexuppdatering efter ändrad identitet, bibehållen granskningssäkerhet, återanvändning av lästa flikar och oförändrad cellspårbarhet. Inga verksamhetsfiler har använts. Visuell verifiering kunde inte genomföras: ordinarie Chromium saknas och tillgänglig alternativ körfil startar inte.
