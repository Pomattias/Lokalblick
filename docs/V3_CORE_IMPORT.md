# Lokalblick v3 – begränsad import av grundregister

## Beslut och avgränsning

Den aktiva importen `frontend/v3/smart-import-ui.js` använder `scope: 'core'`.
Endast följande register får nya poster eller säkra kompletteringar:

1. Fastigheter
2. Objekt
3. Avtal
4. Hyresgäster (part med rollen hyresgäst på avtalet)

Kontaktpersoner, historiska ärenden, budgetar, fastighetskostnader, ägare,
förvaltare, prisrader och årssummeringar importeras **inte**. Även när deras
kolumner finns i källfilen listas de under **Importeras inte**.
Fälten under `coreImportFields` är en uttrycklig tillåtelselista.

## Arbetsflöde

- Filen (Excel/CSV, högst 15 MB) läses i webbläsaren; ingenting skickas för
  skrivning före aktivt godkännande.
- Välj flik. Endast tillåtna kolumner föreslås; användaren kan se och ändra
  mappningen. Alla andra kolumner ignoreras.
- Förhandsgranskningen visar oförändrade, nya och granskning samt exakt antal
  föreslagna åtgärder för fastigheter, objekt, avtal, hyresgäster och kopplingar.
- Varje osäker identitet, datum- eller areakonflikt stoppar hela importen.
  Objekt utan säker koppling kräver ett aktivt val. Inga gissade länkar.
- Spara gör **en** backendtransaktion med versionskontroll och återställning
  vid fel. Högst 200 rader och 200 åtgärder per import.
- Återimport av oförändrad fil ger noll förändringar; befintliga poster,
  versioner och avtalskopplingar skrivs inte över.

## Identifiering

- Fastighet: exakt förvaltningsnummer (kontroll av motstridigt namn/adress).
- Objekt: fastighet + objektnummer; entydig härledning från ett avtalsnummer
  kan återanvända befintligt objekt, men kan inte skapa ett nytt utan val.
- Avtal: avtalsnummer med kontrollerad objekt- och fastighetstillhörighet.
- Hyresgäst: organisationsnummer och/eller entydigt namn. Motstridiga
  nummer/namn eller befintlig annan hyresgäst på avtalet stoppar.
- En separat flik med enbart hyresgäster kan skapa/återanvända parter, **utan**
  att uppfinna fastighets- eller avtalskopplingar. Enkel flikrubrik
  `Namn` + `Organisationsnummer` känns igen om fliken heter Hyresgäster.

## Testning

Testfiler: `tests/lokalblick-v3-core-import.test.js` och
`tests/lokalblick-v3-import-scope.test.js`.

Kör med Node.js 24 LTS i en lokal, syntetisk v3-miljö:

```sh
node --test tests/lokalblick-v3-core-import.test.js tests/lokalblick-v3-import-scope.test.js
npm run test:v3
npm test
```

Manuell acceptans: en blandad fil med de fyra registren plus ägare,
kontaktpersoner, ärenden och årssummeringar ska bara föreslå de fyra tillåtna.
Bekräfta, återimportera oförändrat och kontrollera noll nya åtgärder.
Ändra ett avtals hyresgäst eller objektsnummer i källan och verifiera att
importen blockeras utan skrivning. För ändrade originalposter görs
versionshantering i registerredigeringen, inte genom import.

**Viktigt:** Dokumentationen är en specifikation, inte ett påstående om
att hela CI eller webbläsartestsviten har körts och passerat.
