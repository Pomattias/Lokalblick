# Lokalblick V2 – inventering och migreringsbeslut

Inventerad 2026-10-07. Bas: `utveckling` 59d89651770c9eaa2316769c9258951235aef345.
Arbetsbranch: `refactor/lokalblick-v2`. Main och utveckling ska inte ändras.

## 1. Dagens arkitektur, verifierad mot kod och historik

Det finns två parallella implementationer som ännu inte integrerats:

| Del | Utveckling | Copilot-backend |
| --- | --- | --- |
| Runtime | backend/server.mjs, statiska filer + health/geocode | backend/src/server.js, loopback + bootstrap/workspace/entity/source |
| Data service | demo eller browser-local Excel | server ersätter /services/data-service.js med company-api |
| Excel | source-service.js, SheetJS, File System Access | local-company-source-adapter.js, ExcelJS, SF/EXT read-only |
| Persistens | pendingChanges → explicit write() → Lokalblick-data modell 3 | JSON-store utanför repo, atomiska writes, master + overlays |
| Kontrakt | backend/api/openapi.yaml, delvis deklarerat men ej implementerat | docs/BACKEND_FRONTEND_CONTRACT.md, fungerande API |

`AGENTS.md` finns inte i utveckling. Copilot-instruktionerna beskriver backend-arbetsströmmen; denna produktombyggnad följer användarens uttryckliga branch- och fullstackuppdrag.

Frontend app.js: 3 888 rader / 237 kB. Innehåller state, audit, filter, beräkningar, rendering, formulär och persistens. styles.css: 6 524 rader. Fyra stylesheets laddas samtidigt; unified-design.css innehåller 158 !important. overview-list-tight.js förändrar redan renderad DOM och skapar en andra filtermekanism. overview-order.js laddas inte av index.html (kandidat för borttagning, inte bevis för att den aldrig använts).

Historiken visar separata tillägg för tät avtalslista, indexkontroller, preliminärt budgetindex, kompakt editor och dokumentlänkar/inbäddade objekt. Funktionerna är värdefulla; deras successiva render/CSS-lager är refaktoreringsområdet.

## 2. Bevara

- Stabil objektidentitet, propertyId/contractId/personId-relationer och INT/EXT som master.
- Source service: permissions, remembered handles, diff/pending changes, write recovery; baseline flyttas först efter lyckad write.
- Modell 3: läsbara relationer och dolda ID:n; Aktiviteter är kanoniska arbetsrader med kompatibilitetsvyer projects/maintenance/driftIssues/wishes.
- Budgetplaner, Budgetmål och Budgetrader; låst årsbudget är snapshot, prognos är levande.
- Backendens loopback-, origin-, path- och JSON-validering och atomiska store från backendbranchen.
- Map service / Leaflet-adapter och backendens koordinatoverlay; inga företagsadresser till publik geokodare.
- Avtalsberikningens kolumntolkning, separata hyres-/tilläggsvillkor, dokumentextraktion och avvikelserapport.

## 3. Refaktorera

- Centralisera index, årsbelopp, periodisering och budgetrader i rena moduler, dela mellan import, Avtal och Budget.
- Poängmatchning ska ge förslag, aldrig automatisk ändring. Även dubbla exakta avtalsnummer kräver granskning.
- INT/EXT ska väljas före Lokallista när båda finns; tomma nummer behålls som separata poster med källa/radidentitet.
- Sekundära värden får fylla luckor; konkurrerande värden ska granskas, inte skrivas över tyst.
- Fältprovenance, konflikter och källregister behöver egen persistens. Nuvarande Excel-schema tappar okända fält, audit metadata och delar av budgetens radidentitet.
- ensureShape får inte fylla saknade företagskollektioner med demodata.
- Separat documents/resolver: typ, referens, status; embedded:// betyder inte att filen är fristående tillgänglig efter omstart.
- V2 får egen entry, CSS och små vyer. Ingen import av app.js/CSS-overrides eller MutationObserver-layout.

## 4. Minimal målstruktur

| Lager | Ägare | Gräns |
| --- | --- | --- |
| Sources | befintlig source-service / company backend | raw workbook/bytes och handles stannar lokalt |
| Adapters | befintliga parsers + normaliserad granskningspipeline | records, suggestions, conflicts, provenance |
| Model | frontend/v2/model.js | stabila ID:n, relationer, delat urval, inga Excelkolumnnamn |
| Calculations | frontend/domain/calculations.js | rena funktioner; inget window/state/DOM |
| Presentation | frontend/v2/{app,views,editor,styles} | samma snapshot, ett filter, radlistor och inline-detalj |

Datatransport används via befintlig `LokalblickDataService.load/save` och `LokalblickSourceService`. Inga nya UI-ramverk eller komponentbibliotek krävs. Tilläggsmetadata sparas i en separat kompatibel Excel-flik; gamla flikar och ID:n behålls.

## 5. Säkerhetsgräns första steget

Initialt oförändrade: backend/server.mjs, backend/src/geocoding-service.js, coordinate-store.js, backend/api/openapi.yaml, befintliga adapter-signaturer, data service load/save/reset och source service connect/reconnect/createFile/write/setMode/status. Den befintliga entryn bevaras tills hela motsvarande arbetsflöde verifierats.

Den fungerande company-backenden integreras som en separat runtime, utan att byta geokodningsservern. V2-transporten måste uttryckligen mappa budgetData ↔ budgetPlans och datumalias. Okända kollektioner får aldrig behandlas som sparade om API inte stöder dem. Kanonisk Excel-writeback fortsätter genom sin befintliga adapter.

## 6. Risker och beslut

| Risk | Åtgärd / verifiering |
| --- | --- |
| Backend saknas i utveckling | importera fungerande implementation separat; kör dess befintliga tester |
| Data tappas vid writeback | binary XLSX roundtrip för relationer, aktiviteter, provenance, konflikter, budget och historik |
| Osäker matchning skriver fel avtal | exact unique endast; granskning med explicit val |
| KPI-serier kan ha olika bas | beräkna bara med jämförbar serie; märk Behöver kontroll vid känd konflikt, ingen hårdkodad kalendergräns |
| Endast annat månadsindex finns | välj uttryckligen oktober, aldrig årets första rad |
| Browser-import på företagets API-runtime | stäng av direkt filkoppling där; behåll backend som persistensägare |
| Excel låst/stale handle | pending changes bevaras vid fel, ingen falsk sparindikering |
| Aktiviteter och legacy-arrayer dubblerar kostnad | samma ID:n och kompatibilitetsmodell, budget räknar en gång |
| Budget låst men detaljer ändras | snapshot och mål orörda, prognos separat |
| Dokument kräver företagsåtkomst | resolver skiljer öppningsbar URL, lokal referens och återanslutningsbehov |
| CDN/importbibliotek | inga externa rådataanrop, versionslåsta bibliotek; separat arbete för helt offline drift |

`npm test` på basen kör endast syntax/preflight och misslyckas redan eftersom .env.example felaktigt flaggas som hemlighet. Detta behöver korrigeras och kompletteras med riktiga domän-/roundtriptester.

## 7. Migreringsordning och verifieringsgrindar

1. Denna inventering och wireframes i egen commit innan implementation.
2. Rena calculation/model/document-moduler och automatiserade jämförelsetester.
3. Adaptergranskning + kompatibel metadata-roundtrip; bevara write recovery.
4. Separat V2-shell som använder samma services och syntetisk demo; befintlig version kvar.
5. Översikt/Fastighet/Avtal, sedan Planera (ansvar/logg/flytta önskemål), Budget (snapshot/index/prognos), Datakällor (kö/konflikt/provenance), Karta/Personer.
6. Integrera company-runtime separat och testa API → save → reload. UI måste visa vad denna runtime faktiskt stöder.
7. Rensa endast ersatta beräkningsfunktioner och säkert obrukade delar. Ingen total radering av gamla frontend förrän verklig företagsfil och samtliga flöden godkänts.

## 8. Wireframe / struktur

Gemensamt: navigation på desktop; fem val i mobilens botten. En filterrad: Ansvarig · Organisation · Fastighetsägare, sök därunder på mobil. Aktuellt urval följer användaren. Global sparstatus visar osparade rader och Spara till Excel eller backendstatus.

| Vy | Överst | Radlista | Öppnad rad / åtgärd |
| --- | --- | --- | --- |
| Översikt | Aktuellt urval; hyra, projekt, löpande; behöver hanteras | fastighet/adress, avtal, area, årskostnad | samma fastighetskontext under raden, välj perspektiv |
| Fastighet | adress, organisation, total area/kostnad | Avtal · Projekt · Underhåll · Drift · Önskemål | inline-detalj; kompakt edit-panel med sektioner |
| Avtal | antal, total hyra/area, datakvalitet | nr, adress, area, hyra/tillägg, status | Villkor · Index · Dokument · Källa; beräknat märkt, råvärden redigerbara |
| Planera | ej fördelat som åtgärd, år | fastighet/aktivitet, ansvarig, status, period, kostnad | ändra ansvar/kvartal/månad; logga person/tid; flytta önskemål |
| Budget | år, preliminärt oktoberindex, budget/prognos/utfall | kategori, underlag, justering, budget, prognos | expandera exakt underlagsrader; skapa/lås snapshot |
| Datakällor | kanonisk arbetsfil + sparstatus | källa, typ, antal, senaste import, konflikter | anslut read-only underlag → granskningskö → acceptera → spara arbetsfil |

Mobil: samma rader med sekundär information under huvudtext, inga desktop-tabeller som krymps till oläslighet. Editor har Villkor/Ekonomi/Index/Övrigt som sektioner, inte en lång modal. Alla fält nås via sektionerna; beräknade värden visas separat.
