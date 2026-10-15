# Ärenden – gemensam redigering och navigation (2026-10-09)

## Beslut

Lokalblick kallar verksamhetsuppgifterna **Ärenden**. Projekt, Underhåll, Drift och Önskemål är **typer på samma ärende**, inte fyra tekniskt separata dataobjekt. `activities` är fortfarande det kanoniska ID-/datalagret; att byta typ skapar ingen ny post.

**Planera** är huvudvägen för arbetet med ärenden. **Ärenden** i Översikt och länkar från en fastighet eller annan vy är alternativa vägar till exakt samma ärendepost och editor.

## Implementerat i frontend V2

- Ett enda ärendeformulär utan redigeringsflikar för alla typer: Ärende (typ, rubrik, beskrivning, status, kategori, prioritet), Hemvist (fastighet/avtal/verksamhet/generellt), Ansvarig, Tid (start, slut, planår, fas), Kostnad (bedömd kostnad, åtgärdens karaktär, ta med i budget, hyrespåslag från).
- Beräknad bedömning **Investering / Drift / Ej bedömd** återanvänder `activityEconomics` och fastighetsägarens nuvarande regler. Inget parallellt ekonomifält eller egen beräkningsmotor.
- Årsfördelningar och registrerade beställningar/utfall visas som summering i samma formulär. Fördelning av årsbelopp sker fortsatt i Planera; beställningar ligger fortsatt i nuvarande beställningsdata, inte dubbelt i ärendet.
- I Översikt finns **Ärenden** som ett huvudval, med filter Alla / Projekt / Underhåll / Drift / Önskemål. I Planera finns samma filter och knappen **Nytt ärende**.
- Samma `data-edit="activities"` används i Planera, tidslinjen, Ärenden och andra vägar.
- Ärenden kan sökas på rubrik, beskrivning och typ, utöver fastighet och avtal.
- Att ändra typ från till exempel Önskemål till Underhåll behåller `id`, proveniens, årsfördelning, orderreferenser och historik. Bara standardbudgetkategori kan följa med typbytet när kategorin fortfarande är standard; manuellt vald specialkategori skyddas. Om posten var exkluderad från budget ändras inte `includeInBudget` tyst.
- Tidigare snabbknappar **Till UH** och **Till drift** ersätts av samma **Typ**-fält i formuläret. Befintligt migrerings-/auditstöd finns kvar.
- Interna Excel-/API-/backendnamn **activities / Aktiviteter** lämnas för kompatibilitet; det är de användarvända V2-vyerna och formulären som nu heter Ärenden. Historiska Utredning-poster behålls och kan öppnas via Alla trots att nya ärenden har de fyra beslutade typerna.

## Viktigt om avsiktlig avgränsning

- Det finns ingen ny lokal databas, nytt schema eller nytt lagringsformat. Koden återanvänder transport, Excelimport/export, backendöverlapp och investeringsregler.
- Ett årsbelopp ändras i Planera, inte i ett extra parallellt formulärfält.
- Status, typ och åtgärdens karaktär anges i samma formulär. Bedömningen uppdateras efter sparning; inga preliminära inmatningsvärden påstås vara sparade/beräknade innan de har sparats.
- Separata beställningar kan behöva en egen senare UI-genomgång; i detta steg syns de i ärendet men flyttas inte eller dubbellagras.
- Kodsyntax, exempelrendering från både Planera och Ärenden, sparning av hemvist/typ med bevarad identitet och sökning har kontrollerats riktat. Automatiska regressionstester finns i `tests/issue-editor.test.js`. Hela testsamlingen och publicerad V2 behöver fortsatt köras/verifieras.
