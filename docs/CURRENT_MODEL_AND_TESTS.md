# Aktuell modell och testbeslut

Vi bygger en ny app. Den aktuella datamodellen är facit. Gamla interna
prototypformat ska inte konverteras, gamla fält ska inte arkiveras och
parallella verksamhetsregister ska inte återinföras för att få tester gröna.

## Regler som gäller

- **Verksamhet:** `business_name` och `business_description` på lagrade Avtal,
  projicerade som `businessName` och `businessDescription` i gränssnittet.
- **Ytor:** ägs av Objekt. Avtal får beräknade läsvärden. Redigering av en yta
  på avtalet avvisas; importens granskning ändrar objektet.
- **Ekonomi:** hyra/tillägg finns i Avtalsposter, fastighetskostnader i sitt
  register och fakturor/årsutfall i Kostnadsunderlag. Budgeten använder dessa
  uppgifter genom den gemensamma beräkningsmotorn.
- **Lagring:** SQLite och Lokalblick-arbetsböcker följer aktuellt schema.
  Gamla interna fält och register avvisas. En ny ren arbetsyta används för
  den nya appen. Ingen bakgrundsmigrering eller logg med borttagna värden skapas.
- **Import:** externa Excel-/LEB-underlag kan ha andra rubriker eller flera
  belopp på samma rad. Den granskade importen mappar till aktuella register
  innan sparning. Det är ett aktivt importflöde, inte ett äldre internt format.
- **Historik:** nya ändringar, granskningsbeslut och låsta budgetsnapshots hör
  till den aktuella appens funktioner. En ändring i ett avtal skriver inte om
  en redan låst budget.

## Vad som rättats

- Avtalsformuläret anropade en borttagen funktion för verksamhetskontroller.
  Namn och beskrivning visas nu en gång i befintliga avtalsfält.
- SQLite-schemat hade kvar ett `business`-fält som modellen inte accepterade.
  Schemat och modellens fältnamn överensstämmer nu.
- Demodata innehöll både nya avtalsfält och gamla verksamhetsrelationer.
  Demon använder aktuella avtalsfält och kontaktroller.
- Import och källuppdatering hanterar ytor på Objekt, med källspårning och
  granskning, så att accepterade beslut kan sparas och läsas igen.
- Externa kolumnrubriker för verksamhetsbeskrivning, kategori, kontaktuppgifter,
  lägenhetsyta och avtalslänk pekar på de aktuella fälten.

## Hur testerna hanterats

Utgångsläget `edbf0e6` hade 54 underkända tester av 690. Ett fel som samma
saknade funktion kunde stoppa många tester samtidigt.

Tester med gamla interna fältnamn har uppdaterats till aktuell modell.
Migrationsfall har ersatts av kontroller för det aktuella schemat, tydlig
avvisning av gamla interna format och oförändrad låst budget vid vanlig
redigering. Kontroller för validering, atomisk sparning, återimport,
konflikter, filskrivfel och versionsskydd behålls.

Webbläsartestet för låst budget skapar/låser uttryckligen sin budget före
bekräftelseprovet. Det förlitar sig därmed inte på demots initiala budgetstatus.
Kartan avslutar pågående zoomning före borttagning, så att Leaflets fördröjda
övergång inte kraschar vid snabba sidbyten. Webbläsartestet provar även det.

## Verifiering

Kör från repots rot med Node.js 24 LTS:

```sh
npm ci
npm test
npm run test:integration-browser
npm run test:table-import-browser
```

Testerna använder syntetiska data och tillfälliga filer. Vid arbete med den
nya modellen används en ny arbetsyta; inga skarpa filer ändras av kodarbetet.

Verifierat 2026-10-25 med Node.js 24.19.0 och systemets Chromium:

- `npm test`: 827 godkända, 0 underkända, 0 överhoppade.
- Repots förkontroll: syntax för 139 JavaScript-filer och kontroll av filtyper.
- Budget-/karttest: låsning, bekräftelse, version, utfall, historik, återläsning
  och navigering under zoomning på mobil och dator.
- Tabellimport i webbläsare: mappning, återimport, kontakter, SQLite-sparning
  och oförändrad Budget på mobil och dator.

Tidigare dokument som beskriver automatisk konvertering av interna
prototypmodeller ersätts av detta beslut och aktuell modell i koden.

Moduluppdelning, samlad verifiering och första veckans övning finns i
[verifieringen](REFACTOR_VALIDATION.md), [utvecklarguiden](DEVELOPER_START.md)
och [introduktionsövningen](ONBOARDING_WALKTHROUGH.md).

## Kompletterande lokaldata

Förvaltningsobjekt finns som separat källuppgift på Fastighet. Kostnadsställe,
Kundtyp avtal och Avtalstyp finns på Avtal. Befintliga avtalskopplingar
återanvänds före tolkning av nummerprefix; kostnadsställe är ingen identifierare.
Nya valfria kolumner kan läggas till i en aktuell arbetsyta utan att dess
verksamhetsdata skrivs om. Interna prototypformat stöds fortfarande inte.
Se [lokaldataimportens regler och verifiering](LOCAL_DATA_IMPORT.md).

Granskad import och godkännande av nya registerposter beskrivs i [SAFE_IMPORT.md](SAFE_IMPORT.md).

För nya poster används förvaltningsnummer och tredelade avtalsnummer som
verksamhetsnummer: `SF4201 → SF4201-001 → SF4201-001-03`. Befintliga
referenser och låsta budgetar behålls. Interna identifierare visas inte som
fastighets-/objektnummer. Se `frontend/lokaler/business-identities.js`.
`npm run test:business-number-browser` verifierar flödet mot både SQLite
och Excel, inklusive befintliga interna nycklar och återimport.

Importtabellen har separata tabell-/kolumnval och en kryssruta för bortval.
Kopplingsförslag från adress/namn kräver en rad utan nummer och en fastighet
som fanns före importen. Nya fastigheter med olika nummer hålls isär.
`npm run test:simple-import-browser` provar hela flödet med efterföljande
avtalsperioder, samtidiga avtals-ID på samma objekt, avbryt, sparning och återimport.

`npm run test:inline-edit-browser` kontrollerar direkt cellredigering, delade
fastighetsuppgifter, personfakta/roller/mål, återimport utan persondubletter,
fokuserad cell vid sparning, jämförelser av värden och samma/egen fastighet
i SQLite och server-Excel. Skapandebeslut görs en gång och inga adresser
kopplar ihop numrerade fastigheter vid första inläsningen.


Verifierat 2026-10-25: olika avtals-ID med samma eller tomma datum får dela
objekt i import, SQLite och Excel. Den gamla SQL-spärren tas bort när en
befintlig arbetsyta öppnas, utan att registerposter eller version ändras.
Dubblett-ID vid skapande, felvända datum, objektets giltighetstid och en
samtidig bashyra per avtal valideras fortfarande.
Personöversikten visar en rad per person med bolag/organisation; kopplingarnas
roller och mål redigeras i källradens detaljer. `simultaneous-agreements.test.js`
och `import-people.test.js` täcker dessa regler.

Automatisk textmatchning vid berikning kräver entydig sparad beteckning och
adress, utan konkurrerande källnummer eller ort. Den behåller fastighetsnumret
och sparade fält. Oklara träffar visas som kompakta kandidatrader med valfri
fördjupning. `property-text-enrichment.test.js` och
`npm run test:property-enrichment-browser` verifierar regeln, historiken och
sparflödet i SQLite/server-Excel.

`import-date-display.test.js` och `npm run test:import-date-browser` täcker svensk
ISO-visning av Exceldatum, båda datumsystemen, bortvalda kolumner, oförändrade
identifierare, tydliga fältfel, tillgänglig felbeskrivning och rättning/sparning
i SQLite/server-Excel. Underliggande cellvärden och ursprungliga filer bevaras.

Berikning har en fast kompletteringsregel och ett synligt val för nya registerposter. Samma utkast kan komplettera en fastighet och utelämna objektuppgifter utan nummer. Ett bortvalt nytt bolag stoppar inte övriga giltiga fält. `npm run test:enrichment-browser` verifierar standardval, personer/bolag, selektivt/allmänt urval, kort problemlista, avbryt, återimport och mobil i SQLite/server-Excel.

## Avtal totalt och gällande avtal

Översikten räknar **Avtal totalt**, inklusive tidigare och kommande perioder.
Fastighets-, objekt- och avtalslistan räknar **Gällande avtal** enligt registrerade
avtals- och objektdatum. Dagens datum används, oberoende av prognosåret för hyran.
Start- och slutdag ingår i perioden. Saknade avtalsdatum är öppna gränser;
objektets period kan ändå göra avtalet tidigare eller kommande.

Varje avtalskort visar även en synlig fördelning mellan totalt, gällande, tidigare
och kommande. **Avtal → Tidigare och kommande avtal** innehåller historiken.
Ingen post tas bort av filtreringen och hyres-/Budgetberäkningarna ändras inte.
Regeln och summeringen finns i `frontend/v2/portfolio-context.js`.
`node scripts/agreement-counts-browser-check.mjs` provar alla fyra vyerna,
154 totalt/117 gällande, full historik och oförändrad lagring i SQLite/server-Excel.
Testfördelningen 20 tidigare + 17 kommande är syntetisk, inte en slutsats om verksamhetsdatan.
