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
