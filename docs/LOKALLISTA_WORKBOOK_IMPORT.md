# Import av LOKALLISTA BERIKNING – grundregister och matchad berikning

## Arbetsbokens verkliga struktur

Analyserad lokalt: `LOKALLISTA BERIKNING(1).xlsx`. Arbetsboken ska aldrig
läggas i GitHub eller någon publik förhandsmiljö.

| Blad | Data | Behandling |
| --- | ---: | --- |
| Lokallista | 154 avtalsrader | **Grundregister** |
| Lokalbestånd | 108 rader | Berikning |
| Fastighetslista | 87 rader | Berikning |
| Lokaldata | 145 rader (exklusive summeringsrad) | Berikning |
| SF / EXT | Referensflikar | Ej separat import |
| Beställningar | Operativa rader | Inte i grundimport |
| Årshjul | Planering | Inte i grundimport |

Lokallista innehåller 97 distinkta Förvaltningsobjekt och 154 unika
avtalsnummer (bevara skiljetecken, t.ex. `9(1)` och `91` är olika nummer).

## Matchningshierarki

1. **Avtalsnummer**, exakt efter trim/case-normalisering, utan att ta bort
   skiljetecken. Avtalet bestämmer objekt och fastighet.
2. **Förvaltningsobjekt**, exakt, bestämmer fastighet.
3. **Fastighetsbeteckning + adress**, eller unik adress med husnummer mot
   befintlig fastighet vars tillfälliga namn fortfarande är adressen.
   Verifiera att ingen motsägande identifierare finns.
4. I annat fall utelämnas berikningsraden eller den osäkra deluppgiften,
   utan att skapa nytt objekt eller avtal.

Vid en första inläsning skapas huvudregistren från Lokallista innan andra
flikar läses. Deras ursprungsfält skyddas från överskrivning samma importtillfälle.

## Kolumner med avvikande betydelse

- `Lokallista` kolumn A, även om rubrikcellen ger `#NAME?`:
  Förvaltningsobjekt på fastighet.
- `Lokalbestånd → Objektsnummer / Förvaltningsobjekt`:
  fastighetens Förvaltningsobjekt, inte ett nytt ObjektID.
- `Fastighetslista → Objekt. nr`: vanligtvis förvaltningsnummer;
  en okänd kod får inte användas för att skapa eller flytta fastighet.
- `Lokalbestånd/Lokaldata → Verksamhet`: verksamhet/platsnamn
  på avtalet, **inte** en ny juridisk hyresgäst.
- `Fastighetslista → m2`: objektarea endast när objektskoppling är
  säker; annars lämnas arean utanför, men fastighetsuppgifter läses.
- `Lokaldata → Objekt i Ekot`: separat källreferens och inte
  tillåten som kanoniskt ObjektID utan entydig matchning.
- `Lokaldata → Hyra 2026` och `Hyra (kr/kvm)`:
  härledda totalsiffror som inte importeras; formelfel ignoreras.
- Kontakter, historiska ärenden, planering och beställningar ingår
  inte i denna grundimport.

## Kontrolldata från arbetsboken

Preliminär exakt/försiktig matchning mot Lokallista:

- Lokalbestånd: 62 rader via exakt Avtalsnummer, 22 via
  Förvaltningsobjekt, 3 via unik exakt adress, 21 utan entydig träff.
- Fastighetslista: 22 via numret i `Objekt. nr`, 42 via unik
  exakt adress, 23 utan direkt träff.
- Lokaldata: 80 via Avtalsnummer, 41 via unik exakt adress, 24 utan
  direkt träff (summeringsraden räknas inte).

Det här är diagnostiska kandidater, inte ett påstående om att alla rader
kommer att sparas. Namn/adresser/identifierare valideras igen i importen.

## Acceptanskriterier

1. Lokallista skapas först; ingen kompletteringsflik skapar nya avtal
   eller objekt.
2. Samma fil två gånger ger inga dubbletter.
3. Fastighetslista utan ObjektID berikar en säker fastighetsmatch
   och lämnar objektarea utanför utan en felruta per rad.
4. En sammanställningsrad i Lokaldata skapar ingen post.
5. En felaktig fastighetsbeteckning utan nummer blir inte kanoniskt namn.
6. Okända avtal eller lokalreferenser hindrar inte en separat säker
   fastighetsberikning.
7. Inga skarpa data skrivs till main, CI-fixtures eller publika system.

Kör `node --test tests/lokalblick-workbook-master.test.js` och
`npm test` med syntetiska data; komplettera därefter med ett manuellt
förhandsgranskningstest i isolerad utvecklingsdatabas.
