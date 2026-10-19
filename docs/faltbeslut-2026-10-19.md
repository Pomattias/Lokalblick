# Fältbeslut 2026-10-19

Underlag: användarens justerade `Lokalblick-faltgenomgang-2026-10-19.xlsx`
och instruktionen om förenkling från `f3a08cd` på `utveckling`.

## Genomfört i den rena lokala modellen

- Avtal har ett enda `id` (AvtalsID), vars värde är avtalsnumret. Ingen separat
  `number`-kolumn. Importen känner igen både AvtalsID och Avtalsnummer som rubrik
  för samma fält; skiljetecken bevaras. Referenser använder detta ID.
- Avtalets enda partsrelation är `tenant_party_id` (Hyresgäst).
  `business_comment` ersätts av textfältet `business` (Verksamhet).
  Inga verksamhetsregister eller AvtalVerksamhet skapas.
- `staff_count` ersätts av två valfria heltalsfält: `workplace_count`
  (Antal arbetsplatser) och `hub_count` (Antal hubbplatser). Detta är tolkningen
  av Excelnoteringen ”arbetsplats/hubb”; sammansatta gamla värden delas inte
  automatiskt utan bevaras i ändringsloggen.
- Borttaget på Fastigheter: `kind`, `geo_source`, `geo_confirmed_at`,
  `geo_confirmed_by`. Koordinaterna behålls och kartplacering fungerar fortsatt.
- Borttaget på Objekt: `name`, `usage`, `unit_id`. ObjektID, fastighetskoppling,
  giltighet, ytor, antal lägenheter och objektkategori behålls.
- Borttaget på Avtal: `number`, `cost_center` samt ersatta fält ovan.
- Borttaget på Ärenden: `phase` (uttryckligen begärt i uppdraget).
- Personer finns en gång i personregistret och kopplas där till en part.
  De tre kontaktrollerna är ägarens kontakt, hyresgästens kontakt och vår
  ansvarige. Kontaktkolumner i importen skapar personer och daterade kopplingar,
  inte namnkopior på fastighet/avtal/ärende/beställning.

## En lagringsplats för personkopplingar

SQLite och den rena Excel-arbetsboken lagrar `contacts`. V2 använder
`assignments` som en tillfällig projektion för befintliga kontaktvyer och
ansvarshistorik. Dessa läggs inte i arbetsytans metadata. Ärvda kopplingar
identifieras som beräknade och skrivs inte tillbaka som egna kontakter.

Den äldre företagsanslutningen använder fortfarande sitt befintliga
Ansvar-register; verksamhetsregistren är borttagna som skrivbara entiteter.
Äldre ansvarsroller kan läsas som historik, men erbjuds inte vid nya val.
Den äldre Excel-adaptern behåller inläsningskompatibilitet för tidigare underlag.
Ansvar exporteras en gång, inte både som tabell och full metadatakopia.

## Spårbarhet och befintliga arbetsytor

En befintlig lokal databas från föregående schema valideras innan den uppdateras.
En separat `*.before-simplify-*.sqlite` skapas, tabeller byggs om i en transaktion,
och referenser följer det nya AvtalsID:t. Borttagna värden och tidigare identiteter
sparas i ändringsloggen. Tvetydiga identiteter avbryter uppdateringen.
Om en budget refererar till ett AvtalsID som behöver ändras avbryts också
uppdateringen och den befintliga arbetsytan lämnas orörd. Använd då en ny ren
arbetsyta för underlagen; budgetens kopplingar och snapshots skrivs inte om.
Excel läses utan att originalfilen skrivs över; ordinarie sparning behåller backup.
Importens fältändringar behåller källa, flik och rad i postens ändringshistorik.

## Avgränsning

Fält utan beslut lämnas oförändrade. Årshyra markerades **Utred** med önskemålet
att läsa in värdet och beräkna aktuell hyra. Befintlig bashyra, indexregler,
avtalade tillägg och skattefält bevaras; inga beräkningsregler ändras.

Budgetens markup, CSS, beräkningskod och planformat ändras inte. Delade
avtalsformulär behåller de tidigare Budget-kontrollerna när de öppnas från
Budget, medan de vanliga V2-detaljvyerna använder den förenklade formen.
Låsta budgetsnapshots konverteras inte. `main` ändras inte.
