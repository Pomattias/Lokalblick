# Fastighet – enkel detaljvy och kartpositionering (2026-10-09)

## Genomfört i V2 på `utveckling`

Fastighet har nu **ett fönster utan flikar** med:

1. **Fastighetsinfo:** Fastighetsbeteckning, fastighetsägare, adress, ort.
2. **Kontaktpersoner:** fastighetsägarens kontaktperson (`property.ownerResponsiblePersonId`), vår kontaktperson (`property.responsiblePersonId`) och en läsbar lista över verksamhetsansvariga från fastighetens avtalsobjekt (`contract.businessResponsiblePersonId`, med avtalsnummer/verksamhet).
3. **Placering på kartan:** inbäddad karta från befintlig provider `LokalblickMapService` (CARTO/Leaflet via adapter). Befintliga koordinater markeras, och användaren kan klicka eller dra nålen för att välja plats. Valda koordinater sparas **först** när formuläret skickas med `Spara ändring`.

Kartan är en sekundär instans via `createAuxiliary` och ska inte ta bort kartan bakom redigeringsfönstret. Kartan använder fastighetens koordinater, annars kända fastigheter i samma ort, sedan portföljens kända koordinater. Finns ingen position alls används en neutral Sverigekarta **som visningsstart, aldrig som sparad koordinat**. Inga påhittade geokoder sparas.

Vid manuell nålförflyttning sparas även tekniskt `geoSource=manual`, `geoConfirmedAt` och `geoConfirmedBy` så att befintlig automatisk geokodning inte skriver över ett manuellt valt läge. Samtidig adressändring och manuell kartplacering ska inte radera nålen.

Källstyrda masterfält (beteckning och adress i företagsläge) förblir skrivskyddade och ändras i underlaget. Val och kompletteringar sparas via befintlig backend/Excel-funktion.

## Kontaktansvar – en uppgift, en plats

- Fastighetsägaren och fastighetsägarens kontaktperson: **fastigheten**.
- Vår kontaktperson: **fastigheten**.
- Verksamhetsansvarig: **avtalsobjektet**. Fastigheten visar vilka avtalsobjekt/personer som finns, men dubbellagrar dem inte.
- Hyresgäst: **fritext på avtalet**, verksamhet: **avtalets val från Vårdbo, Ordbo, etc.**

## Rensning i frontend och fortsatt backendarbete

Fastighetseditorn visar inte längre fält för `type`, `geoSource`, `geoConfirmedAt`, `geoConfirmedBy`, eller de automatiska flikarna Relationer/Tidplan.

**Markerade fält ska också rensas på riktigt ur backend enligt användarens beslut – detta steg tar bara bort dem ur redigerings-UI.** Deras kvarvarande tekniska beroenden behöver hanteras först:

- `type` är äldre klassificering intern/extern som fortfarande används i import och andra vyer. Ersätt vid behov med en härledd klassificering från ägarrelationen innan fysisk borttagning.
- `geoSource` används för att hindra geokodning från att skriva över manuellt fastställd kartposition. Flytta säkerhetsregeln till befintlig proveniens/koordinatmetadata innan fältet tas bort.
- `geoConfirmedAt` och `geoConfirmedBy` är metadata som redan kan knytas till ändringsloggen; kartans ursprung/ansvarighet får inte gå förlorad vid migrering.
- Granska `source-service`, importadaptrar, backendöverlägg, datafilsexport, historik och geokodning innan dess att metadatafält faktiskt avvecklas. Ta backup före datamigrering.

## Verifiering

Riktade kontroller av fält, kontaktkopplingar, manuellt val av kartposition, samspel mellan huvudkarta och editorkarta samt att fönstret inte har flikar. Ett automatiserat `tests/property-editor.test.js` har lagts till. Full CI-testning och faktiskt klicktest i deployad V2 återstår.

## Kontaktpersoner direkt i Fastighet – beslut och genomförande

- Fastighetsägarens kontaktperson och vår kontaktperson har **Byt** (befintlig väljlista), **+ Ny** och **Ändra** direkt på fastighetsvyn.
- Verksamhetsansvarig för varje avtal på fastigheten har motsvarande personväljare och åtgärder, men relationen lagras fortfarande enbart på avtalets `businessResponsiblePersonId`.
- Ny/ändra öppnar ett litet formulär i samma vy: namn, befattning, e-post. Samma `people`-register används; inget andra personregister eller extra flikar byggs.
- **Spara person** lagrar personen direkt i det gemensamma registret, och befintliga namnändringar slår igenom på alla kopplade poster. Därför är detta tydligt upplyst i personformuläret.
- **Spara ändring** i Fastighet sparar därefter aktuell personkoppling på fastighet/avtal i ett sammanhang. Pågående osparade adress-/kart- och fastighetsfält påverkas inte när ett personkort öppnas eller sparas.
- **Koppla bort** görs genom att välja `Ej kopplad` och spara fastigheten. Personen raderas inte globalt.
- Permanent radering **finns inte i fastighetsvyn** och ska ske i det centrala personregistret först efter en kontroll av referenser från fastigheter, avtal, aktiviteter, beställningar och historik. Att en person saknar koppling på en fastighet betyder inte att den är oanvänd.
- Validering: kräver namn, kontrollerar e-postformat och stoppar sparning när samma e-post redan finns på annan person.
- När man byter fastighetsägare nollställs tidigare ägarkontakt om den inte längre hör till den nya ägaren. Vår kontaktperson påverkas inte.

**Begränsning:** Formuläret sparar ett nytt personkort direkt även om man senare stänger fastigheten utan att koppla in den. Personen finns då i det gemensamma registret, eftersom den faktiskt har skapats med separat `Spara person`; använd befintliga personkort i första hand och undvik dubbletter.

**Verifiering:** riktade logik- och syntaxkontroller har utförts för personformulär, ägar-/verksamhetsanknytning, existerande val och för att bevara fastighetens redigeringsfönster. Full testsamling och interaktiv verifiering i den publicerade appen återstår.
