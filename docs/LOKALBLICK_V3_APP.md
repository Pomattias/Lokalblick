# Lokalblick v3 – samlad lokal applikation

V3 är det nya databasformatet. Alla 21 verksamhetstabeller finns i samma privata
SQLite-databas. **Inga befintliga poster överförs**; V3 får en egen tom fil.

## Starta

```powershell
$env:LOKALER_SCHEMA = "v3"
npm run lokaler
```

Öppna **http://127.0.0.1:8790/** på samma dator. Databasen skapas i
`%LOCALAPPDATA%\Lokalblick\lokalblick-v3.sqlite` på Windows, eller i
`~/.local/share/Lokalblick/` på andra system. Med `LOKALER_FILE` väljer du
en privat plats. Befintliga filer öppnas bara om de är v3. Ingen migration körs.

## Nuvarande arbetsflöden

- Översikt med öppen ärendestock, objektversioner och ekonomisummering.
- Fastighet → Objekt → Avtal med unikt objektsnummer+startdatum,
  historiska objekt- och avtalsversioner, hyra och tillägg.
- Parter, personer, daterad parttillhörighet, rollkopplingar och arv.
- Ärenden med avgränsad hemvist, status och beställningar.
- Fastighetskostnader, faktura/årsutfall och årssummering utan dubbelräkning
  av årsutfall och underliggande fakturor.
- Budgetar med år, scenario och version, poster och permanent låsning.
- Utrymmen, byggnadsdelar, daterade besiktningar och bedömningspunkter.
- Fastigheters adress/koordinater, datamodell för samtliga tabeller,
  insyn i databasen och manuell JSON-export på den lokala datorn.

Alla skrivningar är explicita kommandon som valideras och sparas i SQLite-
transaktioner med versionskontroll. Ingen v2-arbetsyta kan sparas mot v3-API:t.

## Begränsningar att inte dölja

- Befintliga v2-vyer för Excelimport, budgetworkshop, revisionsplanering,
  extern KPI-indexhämtning och komplett kartinteraktion är ännu inte porterade
  till den nya v3-klienten. Den nya klienten har däremot direktvyer för registren
  och deras samband; den ska vara den enda klient som används med v3-data.
- Den befintliga Vercel-previewn får källkod för gränssnittet men
  **inte** databasen eller lokala API-anrop. Verksamhetsdata stannar lokalt.
- JSON-export är en manuell nedladdning och innebär inte att uppgifter
  skickas till molnet.

## Verifiering

```bash
npm test
npm run test:v3
npm run test:v3-browser
```

GitHub Actions kör hela testsuiten och v3-webbläsarflödet med syntetiska
databasposter. Testerna berör inte några skarpa filer.
