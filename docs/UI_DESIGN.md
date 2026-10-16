# Lokalblick – gemensam visuell standard

## Referens och inventering

Utgå från befintlig Översikt och Fastighetsdetalj på `utveckling` (494ac44).
Behåll grön palett, kompakta informationsrader, sökraden och redigeringsramen.
Ingen ändring av datamodell, import, API eller beräkningar.

Kodinventering omfattar Översikt, Fastighet, Objekt, Avtal, Ärenden/journal,
Planera, Budget, Karta, Datakällor, Organisation, Verksamheter och Inställningar.
Alla använder styles.css. Befintliga byggstenar är filters(), table(),
editor-mode-fields, property-person-dialog och ui-* tokens; återanvänd dessa.

Avvikelser att rätta:
- Upprepade CSS-definitioner med samma selektor skriver över gamla värden.
- Textarea saknar global typsnittsarv; generella kontroller ärver fet etiketttext.
- Dialoger har separata kant-, padding-, knapp- och rubrikregler.
- Sök i kolumnfilter och datagranskning avviker från huvudsökfältet.
- Generella objektdialoger visar tabellnamn i stället för objektets namn.
- Kontakters redigeringsknappar krymper select till en smal rest på mobil.
- Generella redigeringsfötter ändrar dialogens höjd när de visas.

## Regler

- Samma fontstack genom hela appen, även textarea och kartans popup.
- Datatext vikt 400; etiketter 500; rubriker 600. Befintliga KPI:er får betoning.
- Bastext 14 px, kompakt data 13 px, stödtext 12 px, etiketter 12 px.
- Sidrubrik 24 px; objektets huvudrubrik 20 px; sektionsrubrik 16–18 px.
- Sökinmatning 14 px; 16 px vid mobilfokus för att undvika iOS-zoom.
- Befintliga redigeringsfält och deras läsvärden använder samma 16 px på mobil.
- Avstånd 4/8/12/16 px. Kontroller 36 px, kompakta fältrader 34 px på mobil.
- Dialoger återanvänder samma yta, kant, radie, rubrik och knappar.
- Visa/redigera delar DOM, kolumner, padding, typsnitt och fälthöjd.
  Läsning visar text, aldrig en aktiv dropdown. Spara/Ångra får reserverat utrymme.
- Datumvisning använder befintlig isoDate/isoDateTime (YYYY-MM-DD).
  Native datumväljare följer webbläsarens inmatningsformat; sparat värde är ISO.
- Belopp använder befintlig svensk talformatering och uttrycklig kr/tkr/kr per år.
- Sidåtgärder använder befintlig placeViewActions och ligger höger vid sökraden.
- Gröna ramen är fast, klicktransparent och tar hänsyn till safe areas.

## Kontroll

360 tester passerade före ändring. Visuell matris: 390 och 1440 px,
alla huvudvyer samt läsa/redigera fastighet, avtal, ärende, person, part,
verksamhet och objekt. Kontrollera overflow, typografi och identisk geometri.
Vercel-preview ska kopplas till exakt commit. Markera blockerade kontroller;
en godkänd enhetstestkörning ersätter inte visuell verifiering.
