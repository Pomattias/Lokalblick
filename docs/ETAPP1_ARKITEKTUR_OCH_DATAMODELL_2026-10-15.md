# Lokalblick – etapp 1: arkitektur- och datainventering
Datum: 2026-10-15 · Gren: `utveckling` · Status: första dokumenterade revisionen, inga produktionsändringar.

## Syfte och beslut
Förenkla kod, onboarding, import och design utan att förlora funktioner, importerade data, beräkningar, budgetlåsningar eller historik. Behåll en enda beständig datakälla per informationstyp; backend är auktoritet i företagsläge. Public demo får enbart använda syntetiska data. `main` lämnas orörd.

### Verifierade observationer från utvecklingsgrenen
- `frontend/app.js` (~234 kB), `frontend/v2/app.js` (~95 kB), `frontend/v2/views.js` (~70 kB): parallella frontendgenerationer. Ta inte bort V1 innan funktionsparitet, importer och tester verifierats.
- `frontend/styles.css` (~174 kB), `frontend/unified-design.css` (~34 kB), `frontend/v2/styles.css` (~66 kB), `frontend/v2/design-system.css` (~62 kB): flera överlappande stilsystem. Inventera laddningsordning, specificitet, aktiva selektorer och variabler före rensning.
- `frontend/services/source-service.js` (~122 kB), `import-engine.js` (~32 kB) samt specialadaptrar för avtal och verksamhet: ansvar för scheman, identiteter, import och berikning måste kartläggas och konsolideras.
- `frontend/v2/model.js` innehåller aktuella samlingar och migrering från `projects`, `maintenance`, `driftIssues`, `wishes`, `investigations` m.fl. `operations` och `maintenanceStatus` finns fortfarande som teknisk kompatibilitet. Beslut om avveckling kräver test av ekonomi, importer och lagrad data.
- `docs/IMPORT_MAPPING.md` dokumenterar 15 kvarvarande testfel efter importändring och ännu ej helt harmoniserad proveniens. Kör en ny baslinje innan felstatus presenteras som aktuell.
- `docs/BACKEND_FRONTEND_CONTRACT.md`, `docs/OBJECT_MODEL.md`, `docs/CONTRACT_SIMPLIFICATION.md` och `docs/ACTIVITY_OPTION_SETTINGS.md` ger delvis olika generationers namn och kompatibilitetsfält. Källkod + körda kontraktstester ska avgöra faktiskt kontrakt.

## Föreslagen kanonisk verksamhetsmodell – fastställ före migrering
Tabeller nedan är logiska domänobjekt, inte nödvändigtvis ett krav på SQL. ID och relationer är interna stabila nycklar. Användaren väljer namn, inte UUID.

| Objekt | Nödvändiga fält / samband | Princip |
|---|---|---|
| Fastighet `properties` | id, fastighetsbeteckning, adress, ort, typ, ownerPartyId, koordinater vid behov | Fastighetens ägare är en part; ingen sparad duplicerad årskostnad |
| Objekt `objects` | id, propertyId, objektnummer, namn, area, areatyp, kategori, kapacitetsdata, start/end, predecessorIds | En fastighet har flera objekt; objekt finns utan avtal; objektnummer unikt inom fastighet |
| Avtal `contracts` | id, objectId, avtalsnummer, tenantPartyId (eller text i källunderlag tills säker identitet), avtalad area, start/end, uppsägning/förlängning, bashyra, indexvillkor, indexerbara tillägg, fastighetsskatt, dokument | Flera avtal över tid per objekt; propertyId är härledd/kompatibilitet; avtalets area skiljer sig från objektets |
| Part `organizations` | id, namn, parttyp och relevanta fastighetsägare-/hyresgästvillkor | En part kan vara fastighetsägare eller hyresgäst för flera objekt; juridiska namn får inte blandas med verksamhetsnamn |
| Person `people` | id, namn, organisationId, roll, telefon, e-post | En person kan ha flera uppdrag/kopplingar; undvik duplicerade personposter |
| Relations- och ansvarskoppling `assignments` / avgränsat `partyContacts` | id, targetType, targetId, personId, roll, fromDate/toDate, aktör/tidpunkt | Kontakt hos ägaren, kontakt hos hyresgästen, vår ansvarige, verksamhetsansvarig och ärendeansvar är olika roller. Befintliga personfält migreras kontrollerat, utan att historik försvinner |
| Ärende `activities` | id, propertyId, optional objectId/contractId, typ, kategori, status, titel, beskrivning, ansvarig, planerad period, uppskattad kostnad, kostnadskategori | En enda post för projekt/UH/drift/önskemål/utredning; samma ID i planering och ekonomi |
| Journal/händelse | id, activityId, actorId, eventAt, kommentar eller strukturerad före/efter-ändring | Append-only spårbarhet för noteringar, kostnad, tidplan och ansvar |
| Beställning `orders` | id, activityId, datum, leverantör, beställare, beställt belopp, slutkostnad, utfall | Separat transaktionsobjekt när beställning faktiskt finns; inte en kopia av ärendet |
| Budget `budgetPlans` + budgetrader | år, version, status, käll-ID, basbelopp, justering, fryst belopp, låsmetadata, prognos/utfall separat | Låst budget ändras inte när avtal eller ärende ändras |
| Källmetadata / fältproveniens | sourceId, fil, flik, rad/cell, importversion, källa, beslut, aktör och tid | Full fältspårning utan duplicerat affärsvärde |

**Modelleringsfrågor att besluta under etapp 1**: Ska `businesses` / `contractBusinesses` kvarstå för verkliga verksamheter som disponerar flera avtal och delar avtalade ytor? **Preliminärt ja**, eftersom historiska ytor/kostnadsandelar och flera verksamheter per avtal behöver stöd. Ska `assignments` vara kanonisk ansvarshistorik eller ersättas av en mer precis rollrelation? Kartlägg befintlig läsning/skrivning före beslut. Separata individuellt indexerade hyrestillägg behöver behållas/stödjas i avtalets domänmodell.

## Relationskrav för import
1. Ordning: parter/personer → fastigheter → objekt → avtal → verksamhetskopplingar → ärenden → beställningar; först analysera alla filer, sedan föreslå atomisk tillämpning.
2. Matcha först stabilt käll-ID/avtals-ID/fastighetsbeteckning med verifierad ort; unikt normaliserad adress + ort får föreslå fastighet. Matcha objekt med objektnummer **inom identifierad fastighet**. Matcha avtal med unikt avtalsnummer samt verifierad objekt/fastighetsrelation.
3. Matcha parter med stabilt käll-ID eller entydigt organisationsnamn och typ; matcha personer med säker ID eller entydig e-post + rimlig organisationskontext. Liknande namn är förslag, aldrig skäl för automatisk sammanslagning.
4. Flera fastigheter, objekt, hyresgäster, avtalskandidater eller kontaktpersoner ⇒ en samlad granskningsfråga, inte nya poster per automatik. Okända uppgifter och konfliktvärden bevaras tills beslut fattats. Tomma importceller får inte radera värden.
5. Manuell ändring ska ha skyddad proveniens. Kolumnprioritet och godkänd mappning kan återanvändas per källa och schema. Visa före/efter, matchad identitet, skapade poster, berikade fält, granskningsfall och beräkningspåverkan.
6. Företagsläge: endast godkänd lokal/autentiserad miljö får hantera skarpa data; källfil förblir read-only om inte uttrycklig export görs.

## Design: ett system
- En gemensam uppsättning CSS-tokens för färg, typografi, storlek, avstånd, ram och mobil/desktop.
- En gemensam fältrenderare som använder **samma layout i Visa och Redigera**; endast värden blir skrivbara. iPhone-redigeringsramen är dekorativ och får aldrig påverka layout.
- Samma entitetsredigerare nås från bestånd, karta, ärenden och budget. Gemensam selection-state.
- Dokumentera och verifiera faktisk CSS-importordning före borttagning av äldre stylesheets.

## Kodrensning – beslutskö
| Kandidat | Status | Beroenden som måste kartläggas |
|---|---|---|
| V1 `frontend/app.js` + äldre vy | MIGRERA SENARE | Funktionsparitet, Excel/LEB, tests, kartan, budget, mobil |
| Parallell CSS | KONSOLIDERA | Selektorbruk, cascade, breakpoints, redigeringsinvariant |
| Legacy projects/maintenance/driftIssues/wishes/investigations | MIGRERA/UTGÅ | Identifierbar idempotent migrering till activities, import, budget, historik |
| `operations`, `maintenanceStatus` | GRANSKA | Tills vidare aktiv kompatibilitet i beräkningar; avveckla inte blint |
| Dubbla avtalsfält: `annualContractDrift`, `baseAdditions` | MIGRERA | Undvik dubbelräkning; indexberäkning och årsbudget |
| `annualPropertyTax` | BEHÅLL | Egen kostnad i årshyra och budget |
| `source`, `use`, `ekotObject`, kostnadsställen, flyttdatum, `originalTerm` | UTRED FÖRE RENSNING | Spårbarhet, importschema, uppsägning och budgetPeriod |
| Blandning `tenantName`/`tenantPartyId`/`businessPartyId` | STANDARDISERA | Juridisk hyresgäst, verksamhet, personrelation och äldre overlays |
| Indexerade tillägg | BEHÅLL/UTVECKLA | Flera egna tillägg och egna indexvillkor |
| `source-service.js` och specialadaptrar | KONSOLIDERA | Schemakatalog, import, enrichment, export, provenance |

## Nästa granskning och acceptanskriterier
1. Ta ut aktuell commit-SHA, fil- och importgraf: vilka moduler importerar/anropar varandra, inklusive V1/V2.
2. Läs hela schema-katalogen och gör maskinläsbar fältlista: collection.field, typ, required, source, displayed, writes, dependencies, beräkningar, föreslagen status.
3. Kartlägg samtliga tabellers läs/skriv-API och Excel-mappningar, särskilt roller/kontakter/ägare/hyresgäst och relationernas datum.
4. Kör `npm ci`, `npm test`, browser/integrationstester och dokumentera faktiskt utfall med exakta namn och reproduktion.
5. Fastställ målmodell och migreringsplan med backup, verifierbar idempotens, rapporterade konflikter, oförändrad låst budget och noll förlorad historik.
6. Inventera aktiv CSS och alla redigerare genom mobil + desktop. Gör referensskärmar och regressionstester för Visa/Redigera.
7. Ändra inte produktionsdata, radera inte kolumner och gör ingen V1-avveckling förrän dessa kriterier passerar.

## Etapp 1 leverans
Detta är första kodgrundade nuläges-/målrapporten, **inte** påstående om genomförd fullständigt exekverad revision eller verifierade tester. Nästa leverans är detaljerad fält- och beroendematris samt exekverad testbaslinje.


## Tillägg 2026-10-15: privat lagring och utbytbar databas (fastställt arkitekturbeslut)

### Förtydligande efter granskning av äldre commits och backendkontrakt
Excel är **ett valbart privat lagringsalternativ och ett import-/exportformat**, inte Lokalblicks kanoniska databasarkitektur och inte ett krav för användaren. Kunddata får inte publiceras i GitHub, Vercels statiska assets, publika demo-API:er eller webbläsarens beständiga cache. Samma domänmodell och UI ska fungera för:
1. **Lokal filbaserad företagsmiljö**: godkänd Excelarbetsfil och/eller lokal backendägd filstore på Windows 365/OneDrive-synkat företagsutrymme. Privata transaktioner genom same-origin lokal backend. Explicit Excel-export/återskrivning med kontrollerat godkännande.
2. **Intern databas**: exempelvis SQL Server/PostgreSQL/Dataverse/M365 i företagets godkända miljö, bakom autentiserat Lokalblick-API.
3. **Extern värdlagrad databas**: endast om organisationen godkänner databehandling, region, behörigheter, åtkomst, avtal, kryptering, loggning och backup; åtkomst sker genom autentiserad serverkomponent/API, **aldrig direkt från publik frontend med kundhemligheter**.

### Gemensam, leverantörsoberoende kontraktsgräns

```
Lokalblick UI (samma för mobil och desktop)
        ↓ autentiserat Lokalblick API
Tjänstelager: behörighet, normalisering, relationer, validering,
             budgetregler, import, historik och spårbarhet
        ↓ Repository / DataStore-interface
   ┌───────────────┬───────────────────┬─────────────────────────┐
   │ Lokal fil     │ Intern databas    │ Extern databas         │
   │ Excel / JSON  │ SQL / M365 / etc. │ godkänt DB/API         │
   └───────────────┴───────────────────┴─────────────────────────┘
        ↑ read-only källadaptrar: LEB, Excel, externa API:er
```

**Separera två typer av adapter:** `SourceAdapter` (läser/importerar källmaterial och metadata) och `PersistenceAdapter` (säker beständig CRUD, transaktion, revision, historik och backup). En Excelimport ska inte i sig avgöra vilken databas som äger sparad information. Källan kan vara skrivskyddad trots att Lokalblick låter behörig användare redigera kompletteringar.

**Minimikrav för PersistenceAdapter:** `get/list/create/update/delete`, atomisk import-/batchcommit, optimistic locking/revisioner, beständig journaling/audit, schema- och migrationsversion, source-proveniens, backups/restore, roll- och tenant-isolering samt konsekvent felhantering. Kanoniskt API-kontrakt kan erbjudas via OpenAPI och kontraktstester som körs mot samtliga implementationer. Koppla inte UI till leverantörsspecifika SQL-tabeller eller Excel-flikar.

### Vad tidigare kod/commits faktiskt visar
- Commit `7dec876`: separat backendström `copilot-backend` och integration genom `utveckling`; detta är tidigare arbetssätt, inte automatiskt beslut att införa ny gren.
- Commits `b1d8bd9` och `ae626ee`: enhetlig Excelimport och framsteg till UI.
- Commit `2d29a48`: samordning av importregler med företagsbackend och tidigare testreparationer.
- `backend/company/adapters/source-adapter.js` har `health/loadCore/loadComplements/refresh`; det är en **källadapter**, inte ett fullständigt CRUD-persistenskontrakt.
- `m365-source-adapter.js` och `external-api-source-adapter.js` är i den granskade grenen fortfarande skelett med `configured:false`/icke implementerad `loadCore`. Att externa eller interna databaser kan kopplas **är arkitekturmålet**, inte verifierad färdig funktion.
- `backend/src/data-repository.js` dokumenterar leverantörsneutral gräns men flera CRUD-metoder är ännu `Not implemented`. Den existerande lokala `backend/company/data-repository.js` har separat faktisk persistens, och måste jämföras innan konsolidering.
- `docs/COMPANY-LOCAL-SETUP.md` beskriver Windows 365, lokal API på loopback och datafil utanför repo. `backend/README.md` kräver att autentisering, behörighet och hemligheter hanteras server-side.

### Nästa tekniska leverabler i etapp 1
- Inventera nuvarande **faktisk** källadapter, persistenstjänst, API-endpoints och transportvägar, inklusive fail-closed när en adapter saknas.
- Dokumentera en enda kanonisk schema- och relationskatalog med kolumntyper, validering, visning, importalias, ansvar och livscykel.
- Gör förslag för `SourceAdapter` respektive `PersistenceAdapter` och migrationsväg för lokal fil → intern/extern databas utan att ändra affärslogik.
- Definiera automatiska kontraktstester som kör samma relations-, CRUD-, import-, historik- och budgetfall mot varje lagringsadapter.
- Inventera CSS/importordning och centralisera token/design innan modulvis utrensning.
- Säkerhetskrav: datakällans lokalisering och API-host avgör vad som lämnar företagsdomänen; lokal eller privat installation måste gå att köra utan att skarpa data skickas till extern molntjänst.
