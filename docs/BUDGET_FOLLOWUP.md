# Årsbudget och ändringshistorik

Utgår från utveckling 59d8965. Ingen ändring av main, API-kontrakt eller befintlig Excelkoppling.

## Arbetsflöde

Skapa arbetsbudget från underlaget och lås årsbilden. Uppföljningen visar unionen av sparade och aktuella poster: oförändrad, ändrad, utgår eller ny. Budgetbelopp försvinner inte när en aktiv post undantas. Tidigare budgetrader utan stabil källidentitet jämförs bara vid en unik träff på kategori, avtals-ID och källbenämning; annars visas Behöver kontroll.

Justera budgetpost, lägg till en budgetpost eller gör en övergripande kategori­justering. Varje ändring kräver anledning; efter låsning krävs dessutom exakt `danger` i frontend. Budgeten förblir låst och föregående version sparas med tid, aktör och anledning. Detta är en avsiktlig bekräftelse, inte autentisering eller serverbehörighet.

Slutkostnad anges per år och kategori, även noll, och ersätter prognosbeloppet. Projekt kan ha både utredning och genomförande: de avslutas först när båda kategorierna har slutkostnad. Hyror har ingen slutkostnad. Borttagna slutförda åtgärders registrerade kostnader finns kvar i uppföljningen genom ändringshistoriken.

## Spårbarhet och sparande

Gemensam historik registrerar skapande, ändring och radering för fastigheter, avtal, åtgärder och budgetår. Raderingar behåller tidigare fältvärden. Budget identifieras med år, övriga objekt med ID. Historiken kapas inte längre efter 5 000 händelser. Historikknappar i uppföljningen öppnar rätt objekt eller budgetår.

Aktör hämtas från `currentUser`. Om ansluten data saknar namn/e-post måste användaren ange namn före sparande; detta är självdeklarerad identitet. Företagsmiljön kan leverera verifierad identitet via befintlig data-service. Användarens behörigheter exporteras inte till Excel.

Excel använder de befintliga synliga tabellerna och en kompletterande flik **Tilläggsdata** för fält som annars inte representeras: logg, ansvarshistorik, fullständiga budgetrader med käll-ID och inkludering, budgetversioner samt åtgärdsmetadata och slutkostnader. JSON delas i delar om högst 30 000 tecken för Excels cellgräns. Redigering gör data pending; befintlig Spara till Excel skriver arbetsfilen. API-data-service skickar fortsatt workspace-payload enligt befintligt kontrakt.

## Verifiering

`npm ci && npm test`: domänfall, låsbekräftelse, versioner, separata budgetår i logg, raderingshistorik och faktisk XLSX-skrivning/läsning med syntetiska data. Preflight inkluderar syntaxkontroll. `.env.example` innehåller enbart tomma/icke-hemliga exempel och undantas från spärren; riktiga miljöfiler är fortsatt spärrade.

`npx playwright install chromium --only-shell && npm run test:budget-browser` verifierar faktisk UI-interaktion i Chromium: fel/rätt danger, budgetversion, slutkostnad noll, sparad historik, omladdning samt mobilbredd och desktop. Skärmbilder granskades. Arbetslägeskontrollerna fanns men renderades inte på utveckling; de visas nu så att redigering och historik går att nå. Testet använder `/index.html` eftersom backendens befintliga rot-URL returnerar 404. Externa kart-/CDN-resurser isoleras från budgettestet.

Windows/OneDrive-skrivning återstår att verifiera lokalt. Den befintliga frontendens övriga mobilombyggnad ingår inte i denna avgränsade budgetändring.
