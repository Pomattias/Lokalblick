# Granskad import

Importen är ett utkast tills **Spara import** eller **Spara berikning** väljs.
Avbryt och Escape gör ingen skrivning. Källfilen och låsta budgetsnapshots ändras inte.

## Första inläsningen

1. Välj flikar. Kontrollera fältförslagen i filtabellens rubriker.
2. Välj vilka nya fastigheter, objekt och avtal som ska skapas i **Nya poster att välja**.
   Markera enskilda eller hela det filtrerade urvalet. Inget är förmarkerat.
3. Kontrollera resultatet och välj **Spara import**. Det är den enda sparningen.

Ett objekt kräver en vald fastighet och ett avtal ett valt objekt. Beroende priser
följer avtalet. Personer och bolag som hör till valda poster följer första importen;
infererade poster som enbart hör till bortvalda rader lämnas utanför.
Olika värden inom första underlaget kan granskas separat.

## Berikning av en befintlig arbetsyta

När arbetsytan redan har registerposter öppnas **Berika befintliga uppgifter**.
Grundregeln är fast: fyll tomma fält, behåll sparade värden, nummer och kopplingar.
Det finns inga separata godkännanden för vanliga värdeskillnader.
Ett annat angivet ägarbolag ersätter inte fastighetens sparade ägare och skapar
inte ett konkurrerande bolag. Den identifierade ägarens tomma organisationsnummer
kan fortfarande kompletteras.

| Nya poster | Beteende |
| --- | --- |
| **Importera ej nya** (förvalt) | Berika befintliga poster. Skapa inga nya fastigheter, objekt, avtal, personer eller bolag. |
| **Importera nya – välj i listan** | Visa en gemensam urvalslista för dessa fem register. Markera enskilda eller alla i urvalet. |

Nya kontaktkopplingar och prisposter hör till den identifierade, tillåtna hemvisten.
En bortvald ny person får inga kontaktkopplingar; en bortvald fastighet får inga
nya objekt eller avtal. Ett bortvalt nytt bolag lämnar den frivilliga bolagskopplingen
tom utan att rulla tillbaka annan giltig komplettering. Sparade poster raderas inte.

Välj **Spara berikning** för en samlad atomär skrivning. Ingen extra kryssruta för
partiell import behövs: säkra delar sparas och utelämnade uppgifter redovisas.
Stegvis sparning av enskilda register ingår inte.

## Förstå vad som läses in

- **Det här kommer att sparas** räknar verkliga registerposter och kompletteringar.
  Radstatusarna räknar källrader. En rad kan berika en fastighet även om objektuppgifter utelämnas.
- **Uppgifter som lämnas utanför** är en kort tabell med register, kolumn, orsak,
  ett exempel och antal källrader. Samma problem upprepas inte hundra gånger.
  **Visa rader** filtrerar filtabellen till just problemet; **Välj kolumn** går till fältvalet.
- Saknat ObjektID eller AvtalsID hindrar objekt-/avtalsuppgifter, aldrig säker
  fastighetsberikning. Ingen av fastighetens möjliga objekt gissas fram.
  En fastighetskontakt kan behandlas även när objektuppgifter saknar identifierare.
- Ogiltiga fält markeras i sin exakta cell med en konkret feltext. Fältfel är
  skilda från helt avvisade rader, osäkra kopplingar och bortvalda nya poster.
- Vid berikning är okända kolumner initialt **Importera ej**. Användaren kan välja
  tabell/fält direkt i rubriken. Väljs en ny oklar destination måste den rättas eller väljas bort.
- Ett bevarat fält kan visa **Sparat värde** under filens värde. Ingen jämförelse behöver godkännas.
- Filens värden, bortval och källrader finns kvar i samma tabell. Bortval stryks över.

## Redigering och tabellutseende

Varje kolumn behåller filens rubrik och har separata **Tabell**- och **Kolumn**-val
samt **Importera ej**. Färg betecknar register, aldrig säkerhet. Alla importtabeller,
valdialoger och formulär använder samma typsnitt och svenska begrepp.
**Bolag / organisation** är benämningen för parter i importgränssnittet.

**Visa / redigera** öppnar cellerna direkt. **Klart** avslutar redigeringen men sparar inte.
Beskrivande uppgifter kan korrigeras uttryckligen även vid berikning; de valideras
på vanligt sätt. Delade fastighets-/objektuppgifter uppdateras på alla berörda
källrader, medan nummer korrigeras per källrad. Prisceller hålls isär per avtalspost.
Bortval/remappning gör en äldre cellkorrigering inaktiv. Arbetsboken skrivs inte om.

Saknas fastighetsbeteckning visas **Fastighetsbeteckning saknas**, aldrig adress
som ersättningsetikett. Fyll i cellen/kompletteringskolumnen nu eller redigera
fastigheten efter importen. Den läsbara kedjan är **Fastighet → Objekt → Avtal → Priser**.
Generiska interna ID:n visas inte som verksamhetsnummer.

**Personer i importen** visar en rad per person: namn, e-post, telefon,
**Bolag / organisation**, resultat. Nya personer som lämnas utanför får orsaken
**Importera ej nya** eller **Ej vald**. Namn med olika person-ID slås inte ihop.
Personuppgifter ändras en gång för alla kopplingar. Ägarens kontaktperson kan
företräda flera bolag; bolag gissas inte från samordnarrollen eller adressen.
Roll och mål kan ändras för nya kopplingar i källradens detaljer.

Filtabellen visar 30 rader, personer/nya poster 100 åt gången. Massval gäller även
matchande poster utanför den synliga sidan. Ett manuellt fastighetsval visar högst
25 sökbara kandidatrader, med nummer, beteckning och adress; sökningen utgår från
filens beteckning. Ingen lång lista med 97 separata knappar behövs.

## Säkra kopplingar och nummer

- Fastighet har flera objekt; objekt kan ha flera avtal. Olika avtals-ID får ha
  samma eller överlappande perioder. Avtals-ID är unikt och avtalet måste rymmas
  inom objektets giltighetstid. Regler för bashyra per avtal gäller fortfarande.
- Sparad avtals-/objektskoppling och angivna nummer går före adress eller namn.
  Motstridiga identifierare flyttar aldrig en sparad koppling.
- För nya poster ger förvaltningsnummer `4201` fastighet `SF4201`.
  Avtal `SF4201-001-03` ger objekt `SF4201-001`; avtalsnumret och dess nollor bevaras.
  Kostnadsställe är en avtalsuppgift, ingen fastighetsidentifierare.
- Adress-/namnmatchning gäller bara fastigheter sparade före importen, när raden
  saknar fastighets-, förvaltnings-, objekts- och avtalsnummer. Första inläsningen
  sammanför aldrig nya numrerade fastigheter genom snarlika adresser.
- Exakt en match på både beteckning och normaliserad adress kopplas automatiskt,
  om eventuell ort stämmer. Raden visar **Kopplad automatiskt** och sparat nummer.
  Matchningen spåras som `property-designation-address` i historiken.
- Enbart adress, olika beteckningar eller flera kandidater kräver ett uttryckligt
  val. Vid berikning öppnas detta via **Välj fastighetskoppling** under raden.
  **Jämför uppgifter** visar mer underlag vid behov. TESTET 14 och TESTET 11 är olika beteckningar.
- **Egen fastighet** är ett skapandebeslut. Det kan bara verkställas när nya poster
  tillåts. Att visa eller filtrera tabellen godkänner aldrig något.

## Datum och validering

Datum visas och redigeras som **ÅÅÅÅ-MM-DD**, även med amerikanskt Excel-format
`m/d/yy`. Det underliggande Excel-värdet och vald datumtolkning används; formatet
i originalfilen ändras inte. Tvåsiffriga år och text som ”Se avtal” gissas inte.
Ogiltiga datum behåller sin text och får en felbeskrivning kopplad till rätt cell.
ID, källkod och telefonnummer behandlas inte som datum.

Kolumnmallar sparar fältval och format, aldrig godkännande av nya poster.
Importkvitto, historik och registerantal avser det som faktiskt sparats.
Tidigare granskningar från andra filer behålls. Rättad återimport kan lösa tidigare
utelämnade uppgifter utan att duplicera identifierade poster.

## Kod och verifiering

| Modul | Ansvar |
| --- | --- |
| `frontend/lokaler/import-model.js` | Tolka, identifiera, komplettera och validera utan skrivning. |
| `frontend/lokaler/import-plan.js` | Nya poster, beroenden, slutligt utfall och historik. |
| `frontend/lokaler/import-explanation.js` | Härled rad-/fältresultat från det faktiska utkastet. |
| `frontend/v2/import-mapping.js` | Session, fältval, redigering och ett slutligt sparbeslut. |
| `frontend/v2/import-table.js`, `import-people.js`, `import-approval.js` | Enhetliga tabeller och val. |
| `frontend/v2/import-problems.js` | Kompakt problemlista som leder till samma filtabell. |

```sh
npm test
npm run test:enrichment-browser
npm run test:property-enrichment-browser
npm run test:inline-edit-browser
npm run test:import-date-browser
```

Kontrollerna använder enbart syntetiska underlag. De följer fil → tabell → worker →
API → SQLite/server-Excel, inklusive avbryt utan skrivning, urval av nya register,
behållna ägare, saknade objektnummer, återimport, mobilbredd och oförändrad låst Budget.
