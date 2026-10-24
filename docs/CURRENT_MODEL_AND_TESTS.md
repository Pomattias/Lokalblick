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

Verifierat 2026-10-24 med Node.js 24.19.0 och systemets Chromium:

- `npm test`: 760 godkända, 0 underkända, 0 överhoppade.
- Repots förkontroll: syntax för 134 JavaScript-filer och kontroll av filtyper.
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
