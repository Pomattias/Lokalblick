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
