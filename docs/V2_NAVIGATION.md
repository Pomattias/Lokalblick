# Lokalblick V2 – navigation och portföljöversikt

Datum 2026-10-09. Genomfört på `utveckling`.

## Desktopmeny

Följande separata menyalternativ visas i vänsterspalten:

1. Översikt – egen startsida med överskådliga portföljtal, aktivitetsfördelning och genvägar.
2. Fastighet – den **befintliga fastighetslistan** som tidigare låg under Översikt → Fastigheter.
3. Avtal – den befintliga avtalslistan.
4. Aktiviteter – den befintliga gemensamma ärendelistan, med filter Projekt / Underhåll / Drift / Önskemål.
5. Planera – oförändrad planering med redigerbar tidslinje.
6. Budget – oförändrad.
7. Karta – oförändrad, men klick på en fastighet leder nu till **Fastighet**.
8. Datakällor – oförändrad.
9. Organisation – oförändrad.
10. Inställningar – oförändrad.

Översiktens nya grafiska startsida använder **befintlig** `scope`, `activities` och hyresberäkningar; inga nya datatabeller eller poster skapas. Den är en första, lätt grafisk version och kan byggas ut med fler visualiseringar när grundnavigationen har bekräftats stabil.

## Förebygger tidigare regression

- `frontend/v2/editor.js`, `frontend/v2/property-editor.js`, `frontend/v2/contract-editor.js` och `frontend/v2/issue-editor.js` är **inte ändrade**.
- Inga ändringar av `openEditor`, `closeEditor`, `readEditor`, sparning eller mappning mot Excel/backend.
- Översikt, Fastighet, Avtal och Aktiviteter använder bara olika *presentationer och ingångar* till samma befintliga data.
- De dolda flikarna i tabellvyerna tas bort när sidan redan har ett eget menyval; inget parallellt filter/tabsystem skapas.
- På mobil återanvänds navigationen som en kompakt horisontellt skrollbar chiprad så att nya vyer också går att nå.

Riktade funktionskontroller omfattar dashboard, fastighets- och avtalslistorna, aktivitetsfilter, redigeringsknappar samt att Planeras befintliga grafiska tidslinje kan renderas. Regressionstester finns i `tests/navigation-desktop.test.js`.

Publicerad app ska även klicktestas i webbläsaren: öppna/stäng/ändra Avtal, Fastighet och Aktivitet, samt byt meny och kontrollera att sparad planering visas som tidigare.
