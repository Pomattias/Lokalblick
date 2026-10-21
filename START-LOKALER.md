# Lokalblick – tidigare app, ren datamodell och lokal lagring

Förstasidan, kartan, listorna och arbetsflödena i `frontend/v2` används fortsatt.
Den separata prototypens gränssnitt är avvecklat. Dess adress
`/frontend/lokaler/index.html` leder till den befintliga appen.

Den nya datamodellen och lagringen finns i `frontend/lokaler` och
`backend/lokaler`. Befintliga Budgetvyer och beräkningsfunktioner är oförändrade.
Databaser från andra eller äldre appar migreras inte. Nya Excelunderlag fördelas till den nya modellen
vid granskad import. Redan anslutna äldre arbetsfiler fortsätter använda sitt
befintliga flöde; de konverteras inte automatiskt.

## Underhåll och besiktningar

Öppna **Underhåll** eller **Öppna underhåll** på en fastighet eller ett objekt.
Fastighetens gemensamma delar kopplas direkt till fastigheten; objektets delar
kopplas till objektet. Det skapas inget extra objekt för fastighetens underhåll.
Välj fastighet och eventuellt objekt och lägg till rum/utrymmen, exempelvis
kök, hall eller toalett, med bedömning och fritext. Vid behov kan du fälla ut
**Delar (valfritt)** och lägga till exempelvis tak, golv eller el med egna
bedömningar. Inget m²-fält behövs för rummet. En rums- eller delbedömning startar
en pågående besiktning vid behov. Datum och besiktningsperson ska vara ifyllda
innan protokollet avslutas. Nya besiktningar börjar med **Ej kontrollerad**;
tidigare bedömningar bevaras i historiken. Bild- och dokumentreferenser finns
under **Bild (förberett)**. Referenser till lokala filer laddas inte upp; de öppnas i
företagets filhanterare. Denna etapp innehåller ingen bilduppladdning.

**Brist** skapar direkt ett vanligt ärende av typen **Underhåll**. Ett redan länkat
ärende eller ett öppet ärende från samma rum/del vid en tidigare besiktning
återanvänds. **Öppna ärende** visar åtgärd, ansvarig, prioritet, tidplan och kostnad.
Ärendet visar besiktningsunderlaget med länk tillbaka; kommentarerna hämtas från
besiktningen och lagras inte en gång till på ärendet. **OK** vid en senare kontroll
ändrar inte tidigare bedömningar och avslutar inte ärendet automatiskt. Åtgärden
avslutas i ärendet. Importerade brister kopplas på samma sätt. Äldre olänkade
brister kan kopplas till ett befintligt ärende via **Skapa underhållsärende**.
Nya underhållsärenden tas inte automatiskt med i budget.

Demon innehåller en köksbrist med nytt ärende, en pågående åtgärd i fastighetens
entré samt en åtgärdad brist i hallen med en senare OK-bedömning. Toaletten kan
användas för att prova en ny rumsbedömning. Alla exempel är syntetiska. **Återställ
demo** återställer exemplen utan att ändra någon ansluten Excel-fil.

Avsluta när samtliga bedömningar är kontrollerade. Avslutade protokoll bevaras;
historik öppnas aktivt. En ny besiktning återanvänder delarna men inga gamla
bedömningar eller kommentarer. Underhållsansvar (ägare/hyresgäst) kan anges
gemensamt på fastigheten/objektet och ändras för en enskild del.

**Läs in besiktningar** tolkar matriser med skickkolumner, kommentarer och
årsbelopp eller tidsintervall. Koppla valda flikar till befintliga ObjektID och
granska strukturen innan inläsning. Sammanställningar importeras inte som nya
kostnader. Årsbelopp och intervall bevaras som källunderlag på besiktningspunkten;
de skapar inte budgetrader, fastighetskostnader eller avtalsposter. Osäkra datum
lämnas tomma med varning. Övriga källuppgifter finns under **Importerat underlag**.
En identisk återimport skapar inga nya protokoll. Ändrade underlag blir en ny
historisk besiktning och skriver inte över tidigare bedömningar. Om utrymmens
namn eller struktur ändras i underlaget behöver kopplingarna granskas igen.

De fyra nya registren **Utrymmen**, **Delar**, **Besiktningar** och
**Besiktningspunkter** använder samma modell och Excel-/SQLite-lagring som övriga
appen. De kan också läsas genom den vanliga tabellstyrda importguiden med
beständiga ID:n. En aktuell Lokalblick-arbetsbok utan dessa register öppnas med
tomma underhållstabeller, som följer med vid nästa sparning. Budget och dess
historiska snapshots ändras inte.

## Läs in övriga Excelunderlag i webbappen

Om du har en tidigare arbetsyta öppen väljer du först **Ny ren arbetsyta**.
Den anslutna äldre filen ändras inte.

1. Öppna **Datakällor → Läs in underlag**. Flera filer/flikar kan väljas samtidigt.
2. Godkänn föreslagen **Huvudtabell** per flik. Fältväljaren visar den tabellens
   fält först; närliggande tabeller och sökning bland alla fält finns kvar.
   Välj **Importera inte** direkt för kolumner som ska lämnas utanför.
   Om raden under rubrikerna innehåller Lokalblick-fält väljer du
   **Innehåller Lokalblick-fältnamn**. En identifierad möjlig matchningsrad
   kräver ett aktivt ja/nej; vanlig data behandlas aldrig tyst som instruktion.
   Exempel: `Fastighet.Fastighetsbeteckning`, `Avtal.Fr.o.m.`, `Avtal.Bashyra`.
   Även stabila tekniska fält-ID:n kan användas. Okända/borttagna fält varnas.
   Explicit matchningsrad går före tidigare godkända val, därefter aktuella
   fältnamn/alternativa namn och automatiska förslag. Tidigare godkända val
   kan återanvändas i liknande filer; en ändrad datarad tolkas inte som en mallrad.
3. Välj personrollen för namnkolumnen, exempelvis fastighetsägarens kontakt
   eller avtalets hyresgästkontakt. Importen hittar eller skapar personen i
   **Personer** och skapar sedan den daterade kopplingen till fastigheten/avtalet.
   PersonID skapas internt vid behov; namnkolumnen behöver inte innehålla ett ID.
   PersonID och e-post kan också kopplas från egna kolumner. Befintliga personer
   återanvänds via ID, e-post eller ett entydigt namn och part. Flera möjliga
   personer med samma namn lämnas för granskning.
   **Förvaltare / Fastighetsförvaltare** föreslår fastighetsägarens kontakt på
   fastigheten. En eventuell källkod i exempelvis `MGR001 Anna Testsson` kan
   skiljas från namnet. Koden behöver inte vara personens PersonID. Formatet
   **Källkod och namn i samma cell** kan väljas om automatiken inte räcker.
   Förhandsgranskningen visar namnet och formatvalet återanvänds nästa gång.
   Personen lagras en gång, med koppling via FastighetsID och PersonID.
   Oklara personkopplingar lämnas separat för granskning; övriga giltiga
   uppgifter på raden läses in. Rätta personvalet och återimportera för att
   komplettera kopplingen. Ogiltiga grundidentifierare/relationer stoppar raden.
4. Gör klart fältvalen och välj **Kontrollera poster**. Ändrade fält startar
   ingen ny fullständig konvertering förrän du begär kontrollen.
   Kontrollera sedan resultatet per register. Identifierare, datatyper och kopplingar
   som inte går att fastställa visas med flik, källrad, kolumn och ursprungsvärde.
   Felaktiga rader blockeras som standard. Du kan aktivt välja **Importera endast
   godkända rader**; övriga rader sparas då i granskningsunderlaget med sina valda
   källvärden och lämnar inga halva poster. Inget sparas före **Genomför import**.
   Fastigheten är grunden. En senare tabell kompletterar samma FastighetsID
   och lägger bara till nya fastigheter när de inte redan finns. Om FastighetsID
   saknas kan ett redan känt ObjektID eller AvtalsID hitta rätt fastighet.
   Vanliga värdeskillnader stoppar inte annan säker berikning. Välj gemensamt
   **Behåll alla sparade värden** eller **Använd ny information**, eller gör
   undantag under **Välj värde per post**. Upprepade förslag blir ett enda val,
   med samtliga källrader kvar. Flera olika nya värden för samma uppgift kräver
   ett enskilt val. Olösta skillnader behåller det sparade värdet och kan
   granskas senare. Samma princip används för objekt, avtal och övriga register.
   Valda värden valideras tillsammans och besluten sparas i historiken.
   Osäkra ID:n eller kopplingar får aldrig automatiskt flytta en befintlig post.
5. I webbappen sparas resultatet lokalt i webbläsarens databas. Välj
   **Skapa Lokalblick-data / Spara som Lokalblick-data** för en arbetsbok på datorn.
   Återimport kompletterar samma arbetsyta och skapar inte nya kopior av redan
   identifierade fastigheter, objekt, avtal, personer eller kopplingar.

Kolumnval, bortval och tolkningsregler följer med vid återimport. Efter en genomförd
import visas ett kompakt **Importresultat** i Datakällor:
nya, kompletterade och oförändrade poster, inlästa respektive avvisade källrader
och bortvalda kolumner. Använda kolumnkopplingar är hopfällda; granskningsfel
visas direkt. Räknarna omfattar bara poster som berörs av just importen.
Senaste resultatet per underlag sparas i befintligt källregister och följer med
databasen och Excel-kopian. Det skapas för nya importer, inte retroaktivt.
Bortval görs före importen och återanvänds nästa gång; det raderar inte tidigare data.

Berikningsunderlag med flikarna **EXT**, **SF**, **Lokalbestånd**, **Fastighetslista**,
**Lokaldata**, **Årshjul** och **Beställningar** använder samma importguide.
Alternativa rubriker föreslår aktuella modellfält; Årshjul föreslår Ärenden.
Förvaltarens e-post och telefon kopplas till personens namnkolumn.
Verksamhet och Kommentar verksamhet går till skilda befintliga avtalsfält.
Tomma okända kolumner väljs bort som förslag. Dubbla tillägg, ursprunglig avtalstid,
redan uppräknad årshyra och oförklarade prioritetskoder kräver ett aktivt val.
Text som ”ingår” tolkas inte som ett belopp. Saknas motsvarande fält i modellen
visas detta; ingen extra informationslagring skapas. Ärenden behöver ÄrendeID,
beställningar behöver BeställningsID och koppling till ÄrendeID. Guiden varnar
om identifierarkolumnerna saknas. Lägg till beständiga ID:n i underlaget innan
dessa flikar importeras; använd inte radnummer som byts när filen sorteras.

Fastighetsägaren väljs på fastigheten och hyresgästen på avtalet. Deras
organisationsnummer lagras en gång i **Parter → Organisationsnummer**, som text
med tio siffror (visas som `000000-0000`). Numret kan ändras vid respektive
koppling och i partregistret. Samma part kan vara både fastighetsägare och hyresgäst.
I underlag används **Fastighetsägare**, **Orgnr fastighetsägare**, **Hyresgäst**
och **Orgnr hyresgäst**. På en blandad rad knyts varje nummer till rätt part;
det sparas inte dubbelt på fastighet eller avtal. Kända organisationsnummer
återanvänds. Motstridiga namn/ID:n och nummer lämnas för granskning.

En sammansatt rubrik som **Objektsnummer / Förvaltningsobjekt** kräver ett aktivt val av rätt ID.
Dubbla rubriker återanvänder sparade val endast när kolumnordningen är densamma.
Regeln **Vid avvikelse** gäller den aktuella fliken och kolumnen. Datumkolumner
kan uttryckligen tolkas som svenska/amerikanska datum eller Excel-tal med
1900-/1904-system. Tvåsiffriga år och ogiltiga kalenderdatum gissas aldrig.
Webblänkar använder Excels verkliga länkmål, inte visningstexten. För en länk som
inte är giltig kan du uttryckligen välja att läsa övriga uppgifter och spara
länkvärdet för rättning. **Exportera granskningsunderlag** hämtar felen lokalt.

**Anslut Lokalblick-data** öppnar den nya arbetsboken eller en tidigare
Lokalblick-arbetsfil. Formatet identifieras när filen öppnas. Den nya arbetsboken
läses och skrivs direkt i Chrome/Edge på dator. Den nya lagringens registerdata
skickas inte till ett centralt lagrings-API när Excel används i webbläsaren.
Karttjänster och övriga befintliga integrationer har samma arbetssätt som tidigare.

Webbläsarens lokala databas är knuten till webbadressen och webbläsarprofilen.
Exportera en arbetsbok för säkerhetskopiering och för att flytta arbetsytan.
Filkopplingen kan återupptas efter omladdning när webbläsaren behåller behörigheten;
annars behöver filen anslutas igen. Använd bara en redigerare åt gången för Excel.
Omläsning och sparning kan inte köras samtidigt i samma anslutning. Appen begär
exklusiv skrivning och kontrollerar filens innehåll efter att skrivningen öppnats.
En upptäckt extern ändring avbryter sparningen. Vid fel frigörs filåtgärden så att
du kan läsa om och försöka igen; appens data och version uppdateras först när
skrivningen har slutförts. Detta ersätter inte företagets säkerhetskopiering.

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
| Objekt | ObjektID, FastighetsID, ytor, antal lägenheter, objektkategori och giltighetstid |
| Avtal | AvtalsID (= exakt avtalsnummer), ObjektID, hyresgästens PartID, verksamhetstext, antal arbetsplatser/hubbplatser, hyrestid, uppsägning och beskrivande uppgifter |
| Avtalsposter | PostID, AvtalsID, typ, grundbelopp, giltighet och egna uppräkningsvillkor |
| Fastighetskostnader | KostnadsID, FastighetsID, kategori, budgeterat årsbelopp och giltighet |
| Kostnadsunderlag | UnderlagsID, KostnadsID, årsutfall eller faktura med belopp, period och dokumentlänk |
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
med entydigt namn och part. Samma person kan ha flera kopplingar.
Personens part finns i personregistret. Kontaktrollerna är ägarens kontakt,
hyresgästens kontakt och vår ansvarige. Verksamhet är en beskrivning på avtalet,
inte ett separat partsregister eller en relation.

En arbetsyta från den rena modellens föregående schema (`f3a08cd`) kan läsas
med det förenklade schemat. SQLite valideras och säkerhetskopieras separat innan
tabellerna byggs om atomärt. Borttagna värden och gamla avtalsidentiteter bevaras
i ändringsloggen. Budgetplaner konverteras inte. Ekonomiska fält flyttas till avtalsposter med samma beräkningsvillkor.
Se [fältbeslut och avgränsningar](docs/faltbeslut-2026-10-19.md).

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

## Hyra, tillägg och fastighetens kostnader

På avtalet finns **Hyra och tillägg → Lägg till post** även i demo och äldre arbetsytor.
Välj kostnadsslag, exempelvis Värme eller VA. Benämningen föreslås automatiskt
och kan ändras; flera poster av samma slag visas på egna rader med sina namn.
Varje post har eget belopp, period och uppräkning. Flera tillägg av samma typ
kan finnas samtidigt. Bashyrans perioder får inte överlappa (slutdatum är
inkluderande). Årstakten avser dagens datum för innevarande år, annars
1 januari för valt år. Kalenderkostnaden beräknas för varje posts faktiska
dagar inom avtalets period; befintlig budget använder fortsatt inflyttning/
utflyttning när de finns. Skottår räknas med 366 dagar. Indexreglerna och
budgetens scenarioindex fungerar som tidigare, nu per post.

På **Fastighetsuppgifter → Kostnader** väljs år. Kostnadsregistret är samma
`recurringCosts` som tidigare, nu med FastighetsID som enda ägare. Under
**Underlag** kan fakturor, negativa kreditfakturor och manuellt/importerat
årsutfall registreras. Fakturor över årsskiften fördelas på kostnadsperiodens
dagar. Fakturadatum avgör inte kostnadsåret. Dokument anges som frivillig länk.

Ett markerat **Använd årsutfallet** ersätter fakturasumman för kostnaden och
året. Avmarkera för att använda fakturor. Fakturorna räknas som färdigt utfall
först när året markerats komplett på kostnaden och kostnadsperioderna täcker
hela dess giltiga del av året. Annars visas summan som preliminär; den förs
inte till budgetens färdiga utfall. Kategorisummeringar beräknas från valda
underlag, utan sparad tredje beloppstabell. Varje kostnad kan ha ett årsutfall
per år och varje fakturareferens får förekomma en gång per kostnad.

Avtalsposter och fastighetskostnader delar kategorikoder för värme, VA, el,
kyla, sopor och övrigt. Flaggan för framtida avräkning gör ingen beräkning.
Fördelningsnycklar, avräkning, efterdebitering och kreditering mellan parter
är inte implementerade.

### Övergång från den rena modellens tidigare ekonomi

När en befintlig ren SQLite/Excel-arbetsyta öppnas flyttas bashyra, tillägg,
fastighetsskatt och uppräkningsvillkor till separata avtalsposter. De tidigare
beloppsfälten avvecklas fysiskt från Avtal. Arbetsytans gamla `recurringCosts`
flyttas till Fastighetskostnader; deras `actuals` blir Kostnadsunderlag av typen
Årsutfall. Tidigare avtalskopplade löpande utgifter blir fastighetens kostnader,
inte hyresgästens tillägg. Ursprunglig koppling och fulla värden bevaras i
ändringsloggen; budgetens tidigare urval kan därför fortfarande återskapas.

Migrering valideras innan skrivning. SQLite får en separat säkerhetskopia
`*.before-simplify-*.sqlite` och byggs om i en transaktion. Excel behåller
filkonfliktskontroll och serverlägets `.bak`. Motstridiga identiteter eller
relationer avbryter utan att skriva över originalet. Ingen låst budgetplan,
historisk snapshot eller indexserie skrivs om.

Excel-exporten innehåller de tre nya registerflikarna. Äldre breda
underlagskolumner för hyra/tillägg/skatt fördelas vid granskad import till
beständiga avtalsposter. Återimport uppdaterar samma ID med konfliktskydd,
inte nya kopior. Nya separata registerflikar kan importeras med PostID,
AvtalsID, KostnadsID och UnderlagsID. Flera separata tillägg måste ha olika
PostID; en äldre enkel tilläggskolumn representerar en enda post. Indexandel
lagras som andel 0–1; importen accepterar även procenttal över 1 upp till 100.

De äldre källstyrda arbetsfilerna/företagsadaptrarna behåller sin läskompatibilitet;
den nya ekonomimodellen används i den rena arbetsytan med SQLite eller Excel.
Budgetens befintliga formulär får beräknade kompatibilitetsfält. Ändring av en
enskild gammal ekonomikomponent sparas på dess post. Om flera poster motsvarar
samma gamla kontroll görs ändringen på Avtalssidan för att undvika tvetydig
massändring. Dessa kompatibilitetsfält lagras inte en gång till på avtalet.

Äldre avtals samlade tillägg visas som Tilläggshyra tills användaren anger ett
kostnadsslag. Appen gissar inte att ett okategoriserat belopp avser värme eller VA.
När en post ändras/läggs till flyttas det avtalets tidigare ekonomifält till samma
postregister, med ursprunget kvar i ändringsloggen. De härledda beloppsfälten
sparas inte som extra kopior i demo, äldre Excel-arbetsytor eller företagslagring.
Budgetens befintliga kontroller behålls.

Importens felhantering kan verifieras med syntetiska data genom
`node scripts/import-stability-browser-check.mjs` (Chromium/Playwright).

### Tabellstyrd import och mall

**Godkänn fältval och hämta mall** skapar en lokal Excelmall med originalrubriker
och förifylld matchningsrad. Mallen innehåller inga verksamhetsrader.
Ekonomifält pekar på **Avtalsposter** eller **Fastighetskostnader**, aldrig på
avtalets lagrade grunduppgifter. Breda kolumner som Bashyra/Tillägg får en
posttyp; ange **Gäller avtalspost** om flera belopp på samma rad ska skapa
olika avtalsposter. En post per datarad använder vanliga PostID/AvtalsID.

Kolumnmatchningen kommer direkt från modellens fältdefinitioner. Den tidigare
`cleanProfiles`-översättningen från äldre fältlistor har avvecklats för aktuell
import. Befintlig lagring, validering, ansvarskopplingar och beräkningsmotor
återanvänds. Excel avkodas en gång per vald fil; den parsade arbetsboken och
workern återanvänds under granskningen. Fältanalysen använder upp till 100
exempelvärden, medan samtliga valda rader kontrolleras före sparning.

En unik fastighetsbeteckning kan identifiera en befintlig post. Vid flera
träffar väljs rätt fastighet i radens postgranskning. ID:n och relationer
kontrolleras fortfarande innan importen får ändra data.

Verifiera guiden med `npm run test:table-import-browser` (Chromium/Playwright).
