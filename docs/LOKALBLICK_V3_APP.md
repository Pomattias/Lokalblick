# Lokalblick v3 – samlad lokal applikation

V3 är det nya databasformatet. Alla 21 verksamhetstabeller finns i samma privata
SQLite-databas. **Inga befintliga poster överförs**; V3 får en egen tom fil.

## Starta

```powershell
npm run lokalblick
```

Detta startar alltid v3, oavsett skal. Den äldre utvecklingsstarten `npm run lokaler` finns kvar för jämförelser.

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
  insyn i databasen, manuell JSON-export och **Excel-/CSV-import med kolumnmatchning**.
  Importen visar en förhandsgranskning, kräver uttryckligt godkännande och
  sparar högst 200 rader per atomisk transaktion. För Objekt/Avtal väljs
  en fastighet/ett objekt per import, så oklar automatmatchning undviks.

Alla skrivningar är explicita kommandon som valideras och sparas i SQLite-
transaktioner med versionskontroll. Ingen v2-arbetsyta kan sparas mot v3-API:t.

## Begränsningar att inte dölja

- Avancerad berikningsimport med automatiska relationer över flera Excel-flikar,
  liksom befintliga v2-vyer för budgetworkshop, revisionsplanering,
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

## Moderniserat gränssnitt

Navigeringen är grupperad efter överblick, fastigheter, förvaltning, ekonomi
samt register och data. Mobilen har en enda horisontell navigeringsrad; listan
använder en kompakt rad med namn och andra uppgifter sida vid sida.
Fastighet, objekt, avtal, ärenden och ekonomi har klickbara relationer.

Objekt och avtal visar som standard bara den version som gäller för valt
datum; knappen **Visa historik** låter användaren bläddra till avslutade
eller framtida poster. Personkopplingar ärvs vid läsning, och egen
ansvarshistorik kan fällas ut.

Kartvyn kan använda OpenStreetMap först efter att användaren valt att ladda
kartbakgrunden. Geokodning av adresser kräver ett separat godkännande och
serverns ORS_API_KEY. Adressdata skickas inte för geokodning automatiskt.

Budgeten skiljer publicerat SCB-KPI från ett manuellt scenarioindex.
Scenarioindex lagras enbart på den egna budgetversionen, och ändringar stoppas
när budgeten låsts. Indexberäknaren är indikativ och flaggar hyresposter som
kräver särskild avtalsberäkning.

### Versionsbyte

I v3 används ett utökat **färskt** schema med `budgets.scenario_index`.
En tom v3-testdatabas skapad före denna uppdatering kan tas bort och skapas
på nytt. **Ingen datamigrering erbjuds**, i enlighet med beslutet om en helt
tom nystart. Gör aldrig detta om databasen hunnit få uppgifter som ska sparas.

## Hyresberäkning och avstämning (v3)

- Hyresposters grundbelopp och avtalsvillkor sparas daterat. `reviseAgreementItem` avslutar föregående period atomiskt och skapar en ny. `updateAgreementItem` får endast stänga en period.
- **Nominell årshyresnivå** är summan av aktiva grundbelopp för valt datum utan index. Det är en årsrate, inte summan av fakturor eller periodiserade intäkter.
- **Uppräknad årshyresnivå** använder den gemensamma funktionen i `frontend/v3/rent-calculation.js`: nominell, fast årligt sammansatt procent från angivet basår, KPI med uttryckligt bastal/indexandel/indextal samt markerat hyresgolv.
- Saknat indextal, otillräcklig avtalsinformation och oklara `kpi-limited`-villkor ger **ej beräkningsbar** post, aldrig ett påhittat belopp. API:t exponerar `annualRent` (nominell), `annualRentCalculated` (null om en post är oklar), `annualRentUnresolved` och `rentCalculations`.
- Budgetens KPI-förhandsgranskning visar årsnivå per **31 december** för budgetåret. Den summerar inte flera historiska hyresperioder under samma år. SCB:s oktoberindextal eller eget scenario används bara som explicit indata och lagras inte som nya hyresgrundbelopp.
- Avtalsvyn visar nominell årshyresnivå samt kr/m² med objektets gällande area på valt datum. Saknad eller noll area ger inget kr/m²-tal.
- Kvar: dokumentera olika avtalsbundna min/max-klausuler, avtalsperiodiserade kassaflöden och full avstämning mot originalavtal före ekonomisk prognos används som beslutsunderlag.

## Minsta och högsta uppräkning per hyrespost

- Bashyra och varje tillägg har separata frivilliga procentgränser `min_percent` och `max_percent`.
- Begränsningen avser **varje års förändring av hyresbeloppet**, inte själva KPI-talet. Den normala procentuella förändringen beräknas mot föregående års KPI, och årets tillåtna höjning tillämpas på **föregående års hyra**. Varje år räknas vidare på föregående års uppräknade belopp.
- **Garanterad minimihöjning:** om min är 2 % ökar hyran med minst 2 % varje år även om KPI stiger 1 %, är 0 % eller sjunker. Detta är en faktisk hyreshöjning, inte en spärr som bara förbjuder sänkning. Exempel med 100 000 kr och min 2 %, max 5 %: KPI −3 % ger 102 000 kr, 0 % ger 102 000 kr, +3 % ger 103 000 kr och +8 % ger 105 000 kr. Ytterligare ett år med KPI under minimum ger minst 104 040 kr.
- Båda gränserna är frivilliga, och 0 % är ett giltigt värde. Negativa gränser och min över max avvisas av API:t. Metoden `kpi-limited` kräver minst en gräns. Saknat nödvändigt KPI-underlag förblir `Kräver kontroll`.
- **Beslut:** min/max gäller varje årlig reglering, var för sig för bashyra och respektive tillägg. `base_year` är det första år som har `base_amount` och `base_index` avser oktober-KPI före det året. Indexhistorik är nycklad på det hyresår som oktoberobservationen används för: exempelvis 2026 års hyresnivå använder KPI för oktober 2025. För flerårig begränsad KPI-prognos krävs föregående års KPI-observationer; saknas någon markeras posten för kontroll. Systemet hittar inte på historiska tal.

## Årlig avräkning av kostnadstillägg (v3)

- `costReconciliations` i v3-snapshot ger **förhandsgranskning**, inte debitering eller faktura. Fastställda årsutfall i `cost_evidence` (vald `annual`-rad) ligger till grund. Okomplett fakturaunderlag används inte som om det vore ett fastställt årsutfall.
- Kostnader grupperas per fastighet och kategori: värme, VA (`water`), el, kyla, avfall. Objektets andel = årets oförändrade objektarea / hela fastighetens summerade objektarea, **inklusive outhyrda objekt**. Andelen tillämpas på årets fastställda kostnad. Saknade areor eller områdesförändringar kräver manuell kontroll.
- Avtal utan ett uttryckligt tillägg av **samma typ** får status `included`: kostnaden ingår i hyran och ingen avräkning eller debitering skapas. En generisk `addition` utan klassificerad kostnadstyp matchas inte automatiskt mot exempelvis VA.
- När kategoritillägg finns och motsvarar ett oförändrat nominellt **årsbelopp** beräknas `difference = allocatedCost - annualSupplement`. Positiv differens = förslag till efterdebitering; negativ differens = förslag till tillgodo; noll = avstämt. Exempel: 100 m² / 1 000 m², fastighetens VA 50 000 kr, separat avtalat VA-tillägg 3 000 kr/år ger 5 000 − 3 000 = **2 000 kr i efterdebitering**.
- **Periodisering till faktiskt hyrd del av året:** årets kostnadsandel och avtalade tillägg räknas bara för de kalenderdagar som hyresavtalet och motsvarande tillägg gäller samtidigt. Både första och sista hyresdagen ingår; nämnaren är årets 365 eller 366 dagar. En vanlig avtalsrevision startar inte om hyresperioden. Två på varandra följande hyresgäster i samma objekt får separata avräkningar utan dubbla dagar. Avräkningen bygger på avtalets ursprungliga startdatum och senast gällande juridiska slutdatum, inte ett antaget tillträde.
- Om ett tillägg införs senare under året avräknas bara dess giltighetsdagar; övriga dagar ingår kostnaden i bashyran. Ett tillägg vars årsbelopp ändrats under året delas upp i respektive giltighetsperiod. Överlappande avtal i samma objekt eller överlappande tillägg av samma kategori flaggas för kontroll. Värderingen utgår från fastighetens fastställda helårskostnad, fördelad proportionellt över kalenderdagar; ojämn säsongsförbrukning kräver manuell kontroll.
- Avstämning markeras `review` vid ofullständiga årsutfall, förändrad area, överlapp eller KPI-reglerat tillägg. Ett faktiskt debiterat/erlagt belopp kan skilja sig från avtalad årsavgift och måste kontrolleras före slutavräkning.
- V3:s kostnadspost, fastighet och avtal visar avräkningsunderlagen. Funktionen använder existerande schema och påverkar inte `main` eller skarp data.
