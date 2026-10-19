# Lokalblick – tidigare app, ren datamodell och lokal lagring

Förstasidan, kartan, listorna och arbetsflödena i `frontend/v2` används fortsatt.
Den separata prototypens gränssnitt är avvecklat. Dess adress
`/frontend/lokaler/index.html` leder till den befintliga appen.

Den nya datamodellen och lagringen finns i `frontend/lokaler` och
`backend/lokaler`. Befintliga Budgetvyer och beräkningsfunktioner är oförändrade.
Ingen äldre databas migreras. Nya Excelunderlag fördelas till den nya modellen
vid granskad import. Redan anslutna äldre arbetsfiler fortsätter använda sitt
befintliga flöde; de konverteras inte automatiskt.

## Läs in Excelunderlag i webbappen

Om du har en tidigare arbetsyta öppen väljer du först **Ny ren arbetsyta**.
Den anslutna äldre filen ändras inte.

1. Öppna **Datakällor → Läs in underlag**. Flera filer/flikar kan väljas samtidigt.
2. Kontrollera varje kolumns målfält. Välj **Importera inte** direkt för sådant
   som ska lämnas utanför. Uppgifterna sparas inte som kompletterande extrafält.
3. För namnkolumner väljs personrollen, exempelvis fastighetsägarens kontakt
   eller avtalets hyresgästkontakt. E-post/PersonID kan kopplas till respektive
   namnkolumn. Om enbart namn finns måste du bekräfta att kolumnens namn
   identifierar unika personer. Ett namn med flera möjliga personer kräver ID.
4. Kontrollera resultatet per register. Identifierare, datatyper och kopplingar
   som inte går att fastställa måste rättas före import. Värdekonflikter skyddas
   och kan granskas; tomma fält kompletteras. Inget sparas före **Genomför import**.
5. I webbappen sparas resultatet lokalt i webbläsarens databas. Välj
   **Skapa Lokalblick-data / Spara som Lokalblick-data** för en arbetsbok på datorn.
   Återimport kompletterar samma arbetsyta och skapar inte nya kopior av redan
   identifierade fastigheter, objekt, avtal, personer eller kopplingar.

**Anslut Lokalblick-data** öppnar den nya arbetsboken eller en tidigare
Lokalblick-arbetsfil. Formatet identifieras när filen öppnas. Den nya arbetsboken
läses och skrivs direkt i Chrome/Edge på dator. Den nya lagringens registerdata
skickas inte till ett centralt lagrings-API när Excel används i webbläsaren.
Karttjänster och övriga befintliga integrationer har samma arbetssätt som tidigare.

Webbläsarens lokala databas är knuten till webbadressen och webbläsarprofilen.
Exportera en arbetsbok för säkerhetskopiering och för att flytta arbetsytan.
Filkopplingen kan återupptas efter omladdning när webbläsaren behåller behörigheten;
annars behöver filen anslutas igen. Använd bara en redigerare åt gången för Excel.

## Kör med lokal SQLite-databas

Installera **Node.js 24 LTS**, öppna projektmappen och kör:

```sh
npm ci
npm run lokaler
```

Öppna **http://127.0.0.1:8790**. Det är den tidigare appens gränssnitt, anslutet
till den nya databasen `local-data/lokaler.sqlite`. Import och redigering sparas
direkt och atomärt i databasen. Inga verksamhetsdata publiceras på Vercel.
Servern binder endast till loopback-adressen och är avsedd för användning på datorn.

För samma app med Excel som serverns arbetsfil:

```sh
npm run lokaler:excel
```

Arbetsfilen är då `local-data/lokaler.xlsx`. En tillfällig SQL-modell i minnet
validerar kopplingarna. Vid sparning ersätts Excel-filen via en temporär fil och
föregående version behålls som `.xlsx.bak`. Ingen parallell SQLite-fil skapas.

Fil och port kan väljas med `LOKALER_FILE` och `LOKALER_PORT`. Exempel i bash:

```sh
LOKALER_FILE=/sokvag/mina-lokaler.sqlite npm run lokaler
LOKALER_FILE=/sokvag/mina-lokaler.xlsx npm run lokaler:excel
```

I PowerShell sätts exempelvis `$env:LOKALER_FILE='C:\Lokaler\lokaler.xlsx'`
före startkommandot. Stoppa med Ctrl+C. En datafil används av en serverinstans i
taget. Efter en avbruten process kan en `.lock`-fil finnas kvar; ta bara bort den
när ingen instans använder filen. En databas av annat format avvisas och lämnas orörd.

## Uppgifterna lagras en gång

| Register | Innehåll |
| --- | --- |
| Fastigheter | FastighetsID, namn, populärnamn, adress, ort, ägarens PartID och kartposition |
| Objekt | ObjektID, FastighetsID, benämning, ytor, antal lägenheter och giltighetstid |
| Avtal | AvtalsID, ObjektID, exakt avtalsnummer, hyresgästens PartID, hyra, period och ekonomivillkor |
| Personer | PersonID, namn, e-post, telefon och eventuell part |
| Personkopplingar | PersonID, roll, ett mål-ID och giltighetstid |
| Ärenden | ÄrendeID, antingen FastighetsID eller ObjektID, ansvar via personkoppling, beskrivning, status, kostnad och tidplan |
| Beställningar | BeställningsID, ÄrendeID, belopp, beställare och uppföljning |
| Objektförändringar | Föregångare/efterföljare vid delning och sammanslagning |

Budgetplaner, indexserier, granskningsärenden, kolumnval och ändringshistorik
ligger som arbetsytemetadata, inte som dubblerade fastighets- eller personregister.
Befintliga vyer får en beräknad läsvy med de fältnamn de behöver. Exempelvis
visas objektets yta på avtalet utan att ytan sparas i Avtal. Avtalets fastighet
härleds från ObjektID. Samordnare hämtas från fastigheten, eller för en
beställning från ärendet, om egen aktuell koppling saknas.

ID:n jämförs exakt. Skiljetecken tas inte bort och avtalsnummer delas aldrig
på komma: `9(1)`, `91` och `91,1` är olika nummer. Ett nytt objekt identifieras
med ObjektID, eller inom en fastighet via en tydlig avtals-/objektidentitet.
Oklarheter ska rättas i granskningen. Personer matchas med ID/e-post, alternativt
med uttryckligen bekräftad unik namnkolumn. Samma person kan ha flera kopplingar.

Tomma objektdatum lämnas tomma. Avtals- och kontaktperioder får inte överlappa
på ett otillåtet sätt. Historik visas genom befintliga fördjupningar. Importen
hittar inte på indexvillkor, datum eller ekonomiska regler som saknas i underlaget.

## Arbetsbok och säkerhetskopior

Den nya arbetsboken har separata registerflikar med ID-kopplingar. Fliken
**Arbetsyta** är teknisk metadata för befintliga funktioner; redigera den genom
appen. För manuell Excel-redigering ska appen stängas först. Behåll ID:n,
kolumnrubriker och fliknamn. I arbetsboken används värden, inte formler.

Direkt anslutning till den nya arbetsboken har gränsen 15 MB och en worker med
30 sekunders tidsgräns. Även konverteringen i granskningsdialogen körs i en lokal worker med tidsgräns;
äldre kolumnkontroller avbryts när nya val görs. En granskad import hanterar högst 20 000 datarader åt
gången. Dela större underlag. Underlagen ändras inte av importen.

Säkerhetskopiera hela `local-data` när servern är stängd, eller hämta en Excel-kopia
från det lokala API:t `/api/lokaler/workbook`. Kopiera inte bara SQLite-filen
medan servern körs eftersom journalfiler kan behövas. Webbläsarläget kan inte
skapa en automatisk `.bak` bredvid en fil utan åtkomst till dess mapp; gör egna kopior.

## Kontroller

```sh
npm test
npm run test:lokaler-browser
npm run test:property-browser -- --baseline=/sokvag/till/orord-basversion
```

Tester använder syntetiska underlag och tillfälliga databaser. Flödestestet
verifierar förstasidan, import, återimport, redigering, omladdning och mobilvyer
för SQLite, Excel via server och Excel direkt i webbläsaren. Budgetjämförelsen
kontrollerar innehåll, layout och sparade planer mot basversionen.
