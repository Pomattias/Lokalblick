# Lokalblick Lokaler – ny app med lokal lagring

Den nya appen är fristående från den tidigare appen. Den tidigare appens Budget,
CSS, datamodell och API ändras inte. Ingen data migreras eller konverteras från
äldre Lokalblick-filer. Den nya appen börjar med tomma register.

## Starta

Installera **Node.js 24 LTS** och kör följande i projektmappen:

```sh
npm ci
npm run lokaler
```

Öppna **http://127.0.0.1:8790**. En ny SQLite-databas skapas i
`local-data/lokaler.sqlite`. Appen binder endast till datorns loopback-adress;
den är avsedd för en användare på den datorn, inte publik fleranvändardrift.

För Excel som arbetsfil:

```sh
npm run lokaler:excel
```

Då skapas/öppnas `local-data/lokaler.xlsx`. Samma app och datakontroller används.
Excel-filen är den beständiga lagringen; ingen parallell databasfil skapas.
Tabellerna läses till en tillfällig SQL-modell i minnet medan appen körs.
Varje sparning skriver arbetsboken via en tillfällig fil och behåller föregående
version som `lokaler.xlsx.bak`.

Välj annan fil eller port med miljövariablerna `LOKALER_FILE` och `LOKALER_PORT`.
Lagring väljs med `LOKALER_STORAGE=sqlite` eller `excel`. Exempel i bash:

```sh
LOKALER_FILE=/sokvag/lokaler.sqlite npm run lokaler
LOKALER_FILE=/sokvag/lokaler.xlsx npm run lokaler:excel
```

I PowerShell: sätt exempelvis `$env:LOKALER_FILE='C:\Lokaler\lokaler.xlsx'`
före startkommandot. En datafil används av en appinstans i taget. Stäng med
Ctrl+C. Om en process avslutas abrupt kan en `.lock`-fil bli kvar; ta endast bort
låset när ingen appinstans använder datafilen.

## Excel och säkerhetskopior

Under **Lagring → Hämta Excel-kopia / mall** kan du exportera alla tabeller eller
en tom mall. Detta byter inte arbetsfil eller lagringsläge. För att fortsätta
arbeta med en exporterad fil: stoppa appen och starta Excel-läget med den filen
som `LOKALER_FILE`. Detta är ett utbyte i den nya modellen, ingen automatisk
konvertering av gamla kalkylblad.

För manuell Excel-redigering: **stäng appen först**. Behåll flikarnas namn och
kolumnrubriker. Använd ID-kolumnerna för hänvisningar, inte namn kopierade i varje
tabell. Datum anges som `ÅÅÅÅ-MM-DD` eller riktiga Excel-datum; tomma datum förblir
tomma. Använd värden, inte formler. Excel-läsningen har en gräns på 15 MB,
50 000 rader per tabell och en tidsgräns på 30 sekunder. Ogiltiga filer lämnas
orörda och ger ett felmeddelande i terminalen vid start.

Om arbetsboken ändras externt medan appen körs avvisas sparningen. Starta om
appen för att läsa filen. Excel ska inte användas för samtidig redigering.
För större mängder data rekommenderas databasläget; Excel-läget skriver hela
arbetsboken vid varje ändring.

Säkerhetskopiera hela `local-data`-mappen när appen är **stängd**, eller hämta en
Excel-kopia från appen. SQLite kan ha tillhörande `-wal`/`-shm`-filer medan den
körs; kopiera inte enbart `.sqlite`-filen då. En `.bak` ersätter inte fristående
säkerhetskopiering. Datafiler ska inte läggas i Git eller publiceras på Vercel.

## Ren datamodell

| Tabell | Äger informationen |
| --- | --- |
| Fastigheter | FastighetsID, namn, populärnamn, adress, fastighetsägare via PartID |
| Objekt | ObjektID, FastighetsID, benämning, yta, antal lägenheter, giltighetstid |
| Avtal | AvtalsID, ObjektID, exakt avtalsnummer, hyresgästens PartID, årshyra, hyrestid och avtalsvillkor |
| Ärenden | ÄrendeID, antingen FastighetsID eller ObjektID, namn, beskrivning, status, prioritet, kostnad, tidplan, noteringar |
| Beställningar | BeställningsID, ÄrendeID, namn, belopp, status |
| Personer | PersonID, namn, e-post, telefon |
| Parter | PartID, organisationsnamn |
| Personkopplingar | KopplingsID, PersonID, roll, ett mål-ID och giltighetstid |
| Objektförändringar | Föregångarens och efterföljarens ObjektID för delning/sammanslagning |

ID:n skapas automatiskt. Ett eget stabilt ID kan anges vid nyregistrering under
**Ange eget ID**. ID ändras inte när en post redigeras. Avtalsnummer är ett eget
fält: `9(1)`, `91` och `91,1` är olika nummer, och en cell delas aldrig på komma.

- Yta och antal lägenheter lagras bara på objektet. Fastigheten summerar unika,
  giltiga objekt, även vakanta. Okänd yta visas som okänd, och ofullständig summa
  markeras. Avtal visar objektets yta och beräknar årshyra/m² utan egen ytlagring.
- Ett objekt kan ha ett avtal per tidsperiod. Datumgränser är inkluderande;
  ett nytt avtal börjar tidigast dagen efter föregående slutdatum. En tom
  datumgräns är öppen. Avtal måste rymmas inom objektets angivna giltighetstid.
- Fastighetsägarens kontakter knyts till fastigheten. Hyresgästens och
  verksamhetens kontakter knyts till avtalet. Samordnare kan knytas till
  fastighet, avtal, ärende och beställning.
- Samordnare ärvs vid läsning: avtal/ärende → fastighet, beställning → ärende →
  fastighet. En egen aktuell samordnare går före en ärvd. Personuppgifter
  kopieras aldrig till ärenden eller beställningar. Saknas samordnare visas `–`.
- Alla personkopplingar har valfria datumgränser. Nuvarande kopplingar visas
  direkt; historiska och kommande visas när användaren öppnar fördjupningen.
  Vid byte avslutas tidigare samordnarperiod innan nästa börjar.
- Delning/sammanslagning: avsluta tidigare objekt, skapa nya ID:n och koppla
  föregångare/efterföljare. Perioderna ska vara åtskilda och fastigheten densamma.

Registrera parter/personer först om de behövs, därefter fastighet, objekt och
avtal. Ärenden skapas från fastighet/objekt eller Ärenden. Beställningar skapas
från ärendet. Register kan redigeras; historik bevaras genom tidsperioder. Denna
första version har ingen radering, karta, budget eller separat planeringssida.
Den nya appen använder bara den nya Excel-mallen, inte äldre importunderlag.

## Verifiera

```sh
node --test tests/lokaler.test.js
npm run test:lokaler-browser
npm test
```

Webbläsartestet använder Chromium (`LOKALBLICK_CHROMIUM_PATH` kan ändra sökväg)
och tillfälliga syntetiska data. Det provar registrering från browser till API,
lagring, personarv, export och mobilvyer i båda lagringslägena. Ingen skarp
arbetsfil används.

Den nya appens statiska version finns under `/frontend/lokaler/index.html`.
Utan ansluten lagring visas ett **skrivskyddat exempel med fiktiva data**.
Anslut en lokal Excel-arbetsbok från webbsidan för att registrera egna uppgifter,
eller använd den lokala servern för Excel/databas.

## Använd webbsidan med en lokal Excel-fil

I den publicerade nya appen: välj **Skapa Excel** för en ny tom arbetsbok, eller
**Öppna Excel** för en arbetsbok i den nya modellen. Detta kräver **Chrome eller
Edge på dator** och att du godkänner filåtkomsten i webbläsarens filväljare.
Filen läses och skrivs direkt i webbläsaren; innehållet skickas inte till API,
Vercel eller någon databas. Excel-biblioteket levereras med appen och bearbetar
arbetsboken i en worker med 30 sekunders tidsgräns så att gränssnittet inte låser sig.

Efter omladdning väljer du **Öppna Excel** igen. Filåtkomsten återansluts inte
utan ditt val. Appen använder inte localStorage för verksamhetsdata. Gör egna
säkerhetskopior via **Lagring → Hämta Excel-kopia**. Webbläsarläget kan inte skapa
en automatisk `.bak` bredvid arbetsboken med endast åtkomst till den valda filen.
Det lokala serverläget ovan har automatisk `.bak` för Excel.

Redigera inte arbetsboken samtidigt i flera flikar eller i Excel. Externa
ändringar kontrolleras före sparning och stoppar överskrivning, men filformatet
har ingen databaslåsning mellan olika program. Använd endast en redigerare åt
gången. En ny arbetsbok skrivs inte över en befintlig fil med innehåll.

En databas på datorn används via den lokala servern, inte genom att publicera
databasfilen på webben. På mobil kan den publicerade appens fiktiva exempel
visas; direkt åtkomst till lokala filer stöds inte av alla mobilwebbläsare.
