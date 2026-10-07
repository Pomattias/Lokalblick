# V2 – leverans och verifiering

## Genomfört

- Inventering och migreringsbeslut publicerades innan implementationen.
- Separat entry `frontend/v2/index.html`; inga gamla CSS-overrides eller app.js laddas i V2.
- Gemensamt urval, radlistor, fastighetskontext, Avtal, Planera, Budget, Datakällor, Organisation och Karta.
- Sektionerad editor med hela det befintliga fältschemat, märkt beräknat och tydliga relationsfält. Masteridentitet är låst för importerade avtal.
- Rena gemensamma beräkningar för hyra/tillägg, oktoberindex, periodisering, budgetrader och utfall. Beräkningsdubbletterna i gamla appen och berikningen är ersatta.
- Unique exact avtalsmatchning; poängmatchningar och konkurrerande fältvärden kräver granskning. INT/EXT prioriteras; tomma nummer hålls separata.
- Fältprovenance, historik, källregister, granskningskö, extra projektvillkor och budgetradidentitet bevaras genom kompatibel Tilläggsdata-flik. Långa JSON-värden delas utan att överskrida Excels cellgräns.
- Kompletterande Excel-listor för projekt, UH, drift, önskemål och driftbudget/utfall normaliseras via adapter och godkänns radvis. Okända fastigheter skapas inte automatiskt.
- Gemensam dokumentresolver för HTTP(S), SharePoint/OneDrive-URL, lokal referens, filnamn och inbäddad PDF. Inbäddad PDF öppnas om den finns i befintlig extraktionscache; annars krävs återanslutning.
- Den tidigare fungerande company-backenden återanvänds isolerat. V2:s metadata packas genom befintlig budgetData-kollektion och överlever restart. Ingen ny master-write eller ändrat gammalt API krävs.
- Initialt felaktig preflight-markering av .env.example rättad; riktiga miljöfiler blockeras fortsatt.

## Automatiserad verifiering

`npm test`: 38 tester, syntetiska data, inga verkliga kundfiler.

Täcker INT/EXT/SF, flera avtal per fastighet, tomma nummer, unika respektive osäkra matchningar, konflikter, indexandel noll, olika bastal och indexandelar, oktoberkrav, preliminärt index, uttryckligen olika KPI-serier, skottårsperiodisering, låst budget, utfall, Excel-binary roundtrip, projektens budgetdelar, provenance, långa metadata, dokumentresolver, pending changes vid skrivfel och efter lyckad retry, API save/load/restart, ansvarshistorik och flyttat önskemål.

`npm run test:browser`: verklig Chromium, desktop 1440×900 och mobil 390×844. Kontrollerar alla centrala vyer, editor utan desktop-scroll, avtalsändring och omladdning, ansvarstillsättning med historik, inget horisontellt mobilöverflöde och inga JavaScript-pageerrors.

Preflight och `git diff --check` passerar. V2 och budgetändringen integreras i utveckling; main ändras inte.

`npm run test:integration-browser` verifierar att startadressen öppnar V2, att budgetens danger/versionshistorik/slutkostnad noll överlever omladdning, att aktiva mobil- och desktopknappar har identiska färger samt att verkliga Leaflet-lager inte blockerar mobilnavigationen. `npm run test:budget-browser` och `npm run test:map-browser` verifierar även den tidigare vyn.

## Återstående verifiering / avgränsningar

- Företagets verkliga Lokalblick-data.xlsx och Windows/OneDrive-filhandtag har inte varit tillgängliga. Binärt syntetiskt roundtrip och simulerat låst filhandtag ersätter inte det avslutande testet i Windows 365.
- Automatisk texttolkning/OCR av godtyckliga PDF-avtal eller andra dokument är inte implementerad. Dokumentkoppling och öppning är separerad och fungerar för stödda referenser. Inbäddade Excel-objekt kan kräva återanslutning till originalet.
- Nya sekundära källor kan importeras i det befintliga lokala Excel-flödet. I company-api-runtime är nya importadaptrar en backendfunktion; direkt browser-import är avstängd där. Canonical Excel-writeback och backendstore är två bevarade runtimeval, inte en dold dubbelpersistens.
- KPI-värden måste vara på jämförbar bas. Engine stoppar uttryckligt olika serier och motstridiga index; den konverterar inte okända historiska KPI-baser automatiskt. Beloppsgolvet följer befintlig kalkylregel, inte en generell tolkning av alla avtalsklausuler.
- Karta återanvänder befintlig adapter, kräver koordinater och åtkomst till tiles. Företagsgeokodning är fortsatt en separat godkänd backendtjänst.
- Den gamla frontendens specialflöden behålls tills de verifierats mot motsvarande V2-flöde. Ingen total radering av tidigare editors, organisation/admin-specialfall eller CSS görs i denna leverans.
- Lokala browser-filkopplingar kräver Edge/Chrome och tillgänglig File System Access. API-läget följer den tidigare loopback-backendens säkerhetsmodell och är inte en ny internetexponerad/Entra-integrerad produktionsserver.
