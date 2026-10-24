# Granskad import i den aktuella datamodellen

Importen är ett utkast fram till **Godkänn och spara import**. Den befintliga
importmotorn läser och identifierar underlaget; godkännandet avgör vilka nya
fastigheter, objekt och avtal som får sparas. Datamodellen är oförändrad.

## Förstå vad som läses in

Kolumnval och godkännandesteg använder **samma dialog**. Kopplingskedjan per
källrad, sökning och statusfilter finns både före och under godkännandet.

| Status | Betydelse i det aktuella utkastet |
| --- | --- |
| Skapas | En ny post har godkänts och kommer att skapas vid slutlig sparning. |
| Kompletteras | Saknade uppgifter på en befintlig post fylls i. |
| Ändras | Ett tidigare värde ersätts enligt dina värdeval. |
| Oförändrat | Befintliga uppgifter återanvänds utan ändrade verksamhetsvärden. |
| Läses inte in | Raden eller uppgiften är bortvald eller beror på en bortvald post. |
| Behöver ditt val | Ett förslag, fältval, värde eller en koppling behöver granskas. Säkra delar kan fortfarande ingå; raden anger när bara vissa uppgifter läses in. |

Varje källrad visar fil, flik och verkligt radnummer samt kedjan
**Fastighet → Objekt → Avtal → Priser**. Priser på samma avtal visas tillsammans.
En känd avtalskoppling förklaras exempelvis med att avtalsnumret redan finns och
att dess sparade objekt och fastighet återanvänds. En felaktig eller oklar
relation visas som ej kopplad, utan pilar som antyder en bekräftad relation.

Öppna **Visa källrad och vad kolumnerna används till** för att se originalvärde,
vald kolumnkoppling och resultat i Lokalblick. Där framgår även bortvalda
kolumner, avvikande värden som behålls och ogiltiga värden som inte används.
**Visa kolumnval och rätta** respektive **Granska föreslagen fastighetskoppling**
öppnar rätt kontroll i samma granskningsvy.

Sammanställningen uppdateras när poster godkänns eller väljs bort. Antal
källrader hålls isär från antal registerposter: en rad kan beröra en fastighet,
ett objekt, ett avtal och flera priser. Att läsa samma verksamhetsvärden från
en annan fil kan komplettera källspårningen utan att uppgifterna räknas som ändrade.

## Arbetsgång

1. **Kolumnval och förhandsgranskning.** Läs hela underlaget och granska
   föreslagna fält, befintliga kopplingar och värdeskillnader. Ändra rubrik →
   fält i fältväljaren. Exportera en importmall om källan använder andra rubriker.
   En fil kan fortfarande berika flera register.
2. **Nya fastigheter.** Varje föreslagen fastighet visas en gång, med beteckning,
   adress, eventuellt förvaltningsnummer och källrad. Inget är förmarkerat.
   Markera enskilda eller alla möjliga poster i registret. Alternativt sök fram
   en befintlig fastighet och välj att koppla förslaget dit.
3. **Nya objekt och avtal.** Godkänn på samma sätt. En post vars överordnade
   fastighet eller objekt inte godkänts visas som väntande och kan inte väljas.
   Befintliga poster behöver inte godkännas som nya igen. Tomma registersteg hoppas över.
4. **Priser.** Granska tidigare och nytt grundbelopp, avtalsnummer, perioder och
   ändrade uppräkningsvillkor för de avtal som faktiskt ingår efter valen.
   Värdevalen görs i kolumngranskningen; återvänd dit för att ändra dem.
5. **Slutkontroll.** Se faktiska antal nya, ändrade och oförändrade poster per
   register, valda fastighetskopplingar och antal poster som lämnas till senare.
   Ändringar kan granskas och det fullständiga granskningsunderlaget hämtas som JSON.
   Bekräfta först här för att spara hela det godkända utkastet.

Listorna är sökbara och visar 100 poster i taget. **Markera alla möjliga i
registret** gäller hela registret, även poster utanför den synliga sidan.
Tillbaka till kolumnval lämnar arbetsytan oförändrad och kräver nya
skapandebeslut när godkännandet öppnas igen. Avbryt importen för att kasta utkastet.

## Vad som skyddas

- Bortvalda fastigheter återskapas inte via någon senare avtalsrad eller annan
  gissad identifierare. Beroende objekt, avtal, priser, kontakter och andra
  refererande nya poster hålls tillbaka tillsammans.
- Befintliga poster raderas inte när ett nytt förslag lämnas utanför. Befintliga
  relationer får inte flyttas genom funktionen för att koppla ett nytt förslag.
- Vid uttrycklig koppling till befintlig fastighet kompletteras dess tomma fält.
  Olika sparade uppgifter lämnas för granskning; de skrivs inte över av kopplingsvalet.
- Kolumnmallar sparar fältval och format, aldrig godkännande av registerposter.
  Nya poster i nästa fil måste därför godkännas igen.
- Historik, registerantal och importkvitto avser de uppgifter som faktiskt
  sparas. Källrader för uppskjutna poster finns i granskningsunderlaget och
  posterna kan godkännas när underlaget läses in igen.
- Tidigare granskningar från andra filer bevaras. När en tidigare uppskjuten
  post godkänns markeras dess granskning som löst.
- Låsta budgetsnapshots och skarpa Exceloriginal ändras inte av granskningen.

Parter och personer som behövs för godkända uppgifter följer med och redovisas
i slutkontrollen. Automatiskt skapade personer/parter som enbart hör till
bortvalda källrader och saknar kvarvarande koppling följer inte med.
Fristående person- eller partsregister är fortfarande valda importunderlag.

## Kod och kontroll

- `frontend/lokaler/import-plan.js`: beslut bundna till den granskade posten,
  beroenden, omkoppling av nya förslag, validering, historik och kvitto. Inga skrivningar.
- `frontend/v2/import-approval.js`: stegvis dialog, sökning, urval och slutbeslut.
- `frontend/v2/import-mapping.js`: kolumnval och värdeval före godkännandet.
- Befintlig workspace-transport gör den slutliga atomära skrivningen. Separat
  bakgrundsgeokodning kan därefter spara koordinater enligt det befintliga flödet.

Verifiera med syntetiska underlag:

```sh
npm test
npm run test:approval-browser
npm run test:local-data-browser
npm run test:table-import-browser
npm run test:lokaler-browser
```

Godkännandet provas med markerade respektive alla poster, uppskjutna beroenden,
avbrott utan skrivning, ändrade källrubriker, koppling till befintlig fastighet,
sökning och urval bland 122 fastigheter, dator/mobil samt återöppning av SQLite.
Priset och kopplingarna verifieras efter sparning. Bakgrundsgeokodning stängs av
just i provet som räknar importens skrivningar. Inga skarpa verksamhetsdata används.

Verifierat 2026-10-24: 739 tester godkända, 131 JavaScript-filer syntaxkontrollerade.
Webbläsarprov för godkännandestegen, 80-raders lokaldata, tabellimport,
SQLite, båda Excel-lägena, stabila fastighetskopplingar och importens
versionsskydd är godkända.

Radförklaringarna provas även för oförändrad återimport, kompletteringar,
ändrade belopp, bortval av överordnade poster, ogiltiga datum, felaktiga
identifierare, bortvalda kolumner, omkoppling till befintlig fastighet och
okända källrubriker. Källceller läses från den redan öppnade arbetsboken först
när raden öppnas. Rapportens radspår lagras inte som en extra datatabell.
