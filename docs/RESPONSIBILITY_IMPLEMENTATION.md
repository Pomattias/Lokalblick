# Gemensamma ansvarsrelationer

## Baslinje, avgränsning och återställning

Utgångspunkt: `utveckling`, commit `1fde1f44eb19c14782a35484163fa78ba86737ca`. Baslinjen hade 240 godkända tester och preflight OK. Arbetsgren: `feat/responsibility-history`. Inga ursprungliga LEB-filer eller verksamhetsarbetsböcker har lästs eller ändrats i utvecklingsmiljön.

Berörda beroenden: befintliga `people`, `organizations`, `assignments`, kontakt-/ansvarsmigrering i V2 och source-service, Excel-schema/teknisk metadata, gemensamma importregler och företagsbackendens CRUD/arbetslagring. Formulären använder samma personregister och befintliga komponenter. Budget-, aktivitets- och verksamhetsmodellerna byggs inte om.

Koden återställs genom att stänga PR utan sammanslagning eller återställa den samlade commiten. Vid första läsning av en befintlig lokal backendfil sparas en säkerhetskopia bredvid den: `<dataPath>.before-responsibility-v1.bak`; filen skrivs inte över vid senare starter. Stoppa backend före återställning, återställ både kodversion och JSON-filen. Säkerhetskopian stannar på den lokala datorn. Befintliga Excelarbetsböcker läses utan förhandsändring; Ansvar-fliken och kompletterande metadata skapas först vid nästa uttryckliga Excel-sparning. Ta en lokal kopia av arbetsboken före första sparningen med den nya versionen; den kopian behövs för återgång till äldre kod som saknar relationshistoriken.

## Gemensam källa

`frontend/domain/responsibility-model.js` äger migrering, aktuellt ansvar, giltighetskontroll och byte. Den befintliga `assignments`-tabellen behålls. Varje relation har stabilt ID, person, organisations-ID, roll/rollnyckel, måltyp/ID, från-/till-datum och uttryckligt delat ansvar. Organisationen är en historisk uppgift på relationen; ändring av en persons nuvarande organisation skriver inte om tidigare relationer. Ingen ny parallell tabell för personer eller parter skapas.

Direktfälten `responsiblePersonId`, `ownerResponsiblePersonId`, `businessResponsiblePersonId` och `tenantResponsiblePersonId` härleds från relationerna. Befintliga direktfält utan relation migreras med deterministiska ID:n och tomma datum. Gammal ansvarshistorik och kontaktrelationer behålls med sina ID:n. Äldre aktivitetstyper översätts till redan befintliga kanoniska aktiviteter. Gamla objektkopplingar översätts till avtal endast om ID:t faktiskt identifierar ett avtal och inte ett objekt.

Datum gäller inklusive både från- och till-dag. Ett byte från ett angivet datum avslutar föregående ansvar dagen före. Vid rättning samma dag behålls den tidigare relationen som annullerad före tillträde. Ett framtida byte flyttar inte dagens ansvar i förtid. Om senare planerade uppdrag finns måste historiken granskas innan ett tidigare byte registreras. Okända historiska datum förblir tomma. Två överlappande perioder är tillåtna endast när båda relationerna uttryckligen är delade. Vid flera aktiva relationer visas inte ett godtyckligt förstaval i ett exklusivt direktfält; personerna syns i ansvarstabellen/historiken.

Befintliga ogiltiga historiska relationer visas för rättning. De får finnas kvar oförändrade vid annan redigering, men en ny ogiltig koppling/överlappning stoppas. Relationer och poster som används i ansvarshistorik kan inte raderas via backend. Avsluta ansvaret med ett till-datum i stället.

## Part och verksamhet

Avtalets `tenantPartyId` identifierar juridisk hyresgäst och är skilt från befintliga `businessPartyId` och `unitId`. Äldre `tenantOrgId` migreras till den juridiska partkopplingen, inte till verksamheten. `tenantName` bevaras som skrivskyddad uppgift från källan. Något nytt verksamhetsregister införs inte. Relationshemvist `business` använder befintliga verksamhetsidentifierare (`unitId`), medan kontakt för ett särskilt avtal kopplas till just avtalet.

## Import och lagring

Ansvar ingår i det kanoniska Excel-schemat och frontendens arbetsdata samt backendens skrivbara entiteter. Daterade ansvarskolumner kan mappas till person, måltyp, mål och roll. Osäkra kopplingar och överlappningar hamnar för granskning. En äldre ansvarig i ett berikningsunderlag får inte återaktivera avslutat ansvar eller skriva över aktuell relation utan datum. Befintliga importregler för källprioritet, manuella värden och cellspårbarhet används även för dessa uppgifter.

Backend sparar relationerna tillsammans med övriga arbetsdata och validerar referenser och perioder. Samtidiga CRUD-tilldelningar valideras även inne i skrivkön. Arbetslagring stoppar om ansvarsrelationerna har ändrats mellan läsning och sparning. Backend skriver aldrig tillbaka till LEB.

## Testförändringar

Tester som tidigare krävde att Ansvar-tabellen/fliken skulle raderas har ändrats till kontroller av bevarad historia. Ett tidigare CRUD-test som tog bort en person och ett avtal med ansvar kontrollerar nu att historiken skyddas, och att en fristående person fortfarande kan raderas. Avtalsformulärstestet kontrollerar separat juridisk part och verksamhetspart i stället för att förbjuda den senare kopplingen. Detta är ändrade produktkrav; beräkningstester och andra förväntningar har inte lättats.

Riktade tester använder endast syntetiska data. De omfattar idempotens, bevarade ID:n/okända datum, byte/rättning samma dag/framtida ansvar, flera uppdrag, delat ansvar, referensvalidering, oförändrade organisationssnapshot, stale berikning, kolumnimport, riktiga XLSX-bytes, lokal backendomstart, säkerhetskopia, samtidiga tilldelningar och formulärens gemensamma historikmarkup.

## Nästa etapp

Verksamhetsregistret och mer omfattande partrelationer kan analyseras separat. Budget, aktiviteter, beställningar och finansiella regler behålls. Riktiga underlag och äldre tvetydiga ansvarsuppgifter måste kontrolleras i företagsmiljön. Visuell mobil-/desktopverifiering måste ske i en miljö där Chromium kan starta innan PR godkänns för sammanslagning.

## Slutkontroll

Baslinje: 240/240 tester godkända. Den samlade ändringen har 19 nya riktade tester, inklusive lokal HTTP-API-kedja med sparande, felaktig överlappning (HTTP 400) och återläsning utan delvis skrivning. Befintliga budget-, beställnings-, import- och formulärtester körs i samma fulla svit. Ett separat lokalt Playwright-flöde finns i `scripts/responsibility-browser-check.mjs` för ansvarbyte, historik och formulärbredd vid 390 och 1 280 px. Körningen här stoppades vid Chromium-start eftersom körfilen saknas (`chromium-1161/chrome-linux/chrome`). Inga visuella resultat markeras som godkända. PR lämnas som utkast tills det flödet har körts i fungerande webbläsarmiljö.

Inga Vercel-anrop för deployment, release eller projektändring ingår i uppdraget. `main` och `utveckling` ändras inte av denna arbetsgren; PR ska granskas och slås ihop separat.
