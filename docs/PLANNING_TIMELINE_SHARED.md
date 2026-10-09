# Gemensam grafisk ärendeplanering – Planera och ärendeformulär

**Datum:** 2026-10-09  
**Branch:** `utveckling`

## Ett ärende, samma sparade tidplan

Båda vyerna använder och uppdaterar **samma objekt** i `data.activities`, med samma `id`, `startDate`, `endDate` och `planningYear`. Inga parallella tidsplane-tabeller, separat kalenderdatabas eller egna periodfält skapades.

- **Planera → Tidslinje:** Klicka **startmånad** och därefter **slutmånad** på samma ärenderad. Efter andra klicket normaliseras månadsvalet till första dagen i startmånaden och sista dagen i slutmånaden, inklusive skottår. Det sparas direkt med `mutation` i befintlig datakoppling och loggas som en ändring av samma `activities`-post. Årsvisa budgetbelopp ändras inte.
- **Ärende → Tid och planering:** Samma månadsrader samt valen 1 år / 3 år. Första klicket anger start och andra klicket anger slut; fälten **Fr.o.m.** och **T.o.m.** uppdateras i formuläret. Tidplanen sparas först tillsammans med resten av ärendet via **Spara ärende**. Stäng utan att spara lämnar originalet oförändrat.
- Ändra datum direkt i formuläret, så ritas den grafiska planeringen om från samma datumfält.
- Den äldre `planningMonth`, `planningQuarter` och `planningMonths` används fortfarande som visningsreserv **om exakta datum saknas**. När man sätter en ny period via månadsval rensas gammal preliminär månad/kvartal så att två tider inte motsäger varandra.
- `frontend/services/source-service.js` innehåller redan `startDate` och `endDate` som `Start` och `Slut` i **Aktiviteter**. Ingen ändring av Excelstrukturen behövs för denna funktion.
- Shared presentation/period logic ligger i `frontend/v2/planning-visual.js`; båda vyerna återanvänder samma funktioner för månadsrader och periodtolkning.

## Avgränsningar och kontroller

- Klick i grafiken planerar **hela månader**, även om ett tidigare datum hade dagsnoggrannhet. För exakta enskilda datum används de vanliga datumfälten.
- Ingen förändring av `yearAllocations`, budgetlåsning, investeringsklassning, beställningar eller huvudnavigering.
- Planeras gamla tidslinje var en **read-only visualisering**; det saknades klickkopplingar för att sätta tidsperioden.
- Den gemensamma **redigeringsdialogens** öppnings-/stängningsfunktioner är orörda efter föregående regression.
- Riktade tester täcker månadsval, perioder över årsskifte och skottår, gammal månadsplanering, identitet/budgetbelopp, rendering i båda vyerna och rätt datumfält. Full browser-e2e- och Node-testkörning på den deployade versionen återstår; kontrollera särskilt öppna/stäng ärende samt att sparningen överlever omladdning.
