# Lokalblick V2 – Ärenden, kategorier, genvägar och responsiv navigering

Datum: 2026-10-09. Arbetsbranch: `utveckling`.

## Beslutat arbetssätt

**Ärenden** är den gemensamma posten (Projekt, Underhåll, Drift, Önskemål). Samma `activities`-objekt går att öppna från Planera, Ärenden, Fastigheter och Avtal. Ingen duplicerad lagring, inga redigeringsflikar.

## Genomfört

1. **Ärendeformuläret:** Det verkliga ärendenamnet är större i huvudet. Ärendenamn är första, fullbreda fältet; därefter Typ, Status, Kategori, Prioritet, Beskrivning, Kopplat till, Ansvarig, planering och ekonomi.
2. **Standardkategori:** `ISSUE_CATEGORIES` i `frontend/v2/issue-editor.js` innehåller Ytskikt, Inredning, Installationer, Ventilation, Ombyggnad, Nya lokaler, Tillgänglighet, Brand och säkerhet, Utemiljö, Energi och Övrigt. Ingen fri kategoriinmatning för nya ärenden. Okända importerade kategorier, inklusive felstavningen Ytskick, visas som **tidigare kategori** tills de uttryckligen klassificeras om. Importerade data skrivs inte om automatiskt. Listan kan vid behov senare ersättas med en administrativ kodlista utan att aktivitetsmodellen skrivs om.
3. **Kopplat till** ersätter etiketten **Hemvist** i editor och Planera. Det är fortsatt den kanoniska en-till-en-kopplingen till Fastighet, Avtal eller Verksamhet (eller generell uppgift).
4. **Initiera direkt:** `+ Ärende` på Fastigheter, `+ Nytt ärende` från fastighets-/avtalseditorn och avtalsdetaljer. Kontext följer med via `propertyId` eller `contractId`; avtalets fastighet härleds och dubbellagras inte. När knappen öppnas från en befintlig editor krävs bekräftelse eftersom osparade ändringar annars skulle gå förlorade.
5. **Planering:** Planeringsår, start-/slutdatum och preliminära månader visas tillsammans i ett enda ärendeformulär. Månadsknapparna använder `planningMonths` som redan stöds av Planeras tidslinje när exakta datum saknas. Äldre `planningMonth` visas när flermånadslistan är tom. `planningMonth` och `planningQuarter` synkroniseras när bara en månad väljs. `yearAllocations` bevaras oförändrat och årsbelopp fördelas fortfarande under Planera. Ingen ny kalender eller dubbel planeringsmotor har skapats.
6. **Excel:** `Planmånader` är nytt kanoniskt kolumnnamn i aktivitetsbladet. Arrays serialiseras som kommaseparerade heltal och återläses som array. Befintliga gamla blad utan kolumnen hanteras som tom array, med stöd för gamla `Månad`.
7. **Navigering:** Fastigheter och Ärenden har egna val i desktopmenyn. Avtal är kvar. På mobil finns kompakta horisontellt skrollbara sidchips för Översikt, Fastigheter, Avtal, Ärenden, Planera, Budget och Karta. Dedikerade sidor visar inte redundant huvudväxling mellan Fastigheter/Avtal/Ärenden; Översikt kan fortfarande användas för växling.

## Kvarstående avgränsningar

- Riktiga kategorinamn från framtida administrativ `Lista` kan konsolideras senare; denna ändring bygger en begränsad standardlista med försiktig kompatibilitet för befintliga kategorier.
- Status och prioritet är befintliga formulärval, inte nya automatiska arbetsflöden.
- Budget och investeringsregler (`activityEconomics`) lämnas orörda.
- Det går fortfarande att tidsplanera via exakta datum **eller** preliminära månader; när datum finns används de före preliminära månadsmarkeringar i tidslinjen.
- Ändringen har syntaxkontrollerats och körts med riktade render-/sparprov. Regressionstester finns i `tests/issue-navigation-categories.test.js`. Hela Node-testsamlingen, browser-testning och faktiskt publicerad Vercel-preview återstår att verifiera.
