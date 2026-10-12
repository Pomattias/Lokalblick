# Fastighet → Objekt → Avtal

Modellversion 6 inför `objects` som egen tabell och Excel-flik `Objekt`. Objekt har stabilt ID, `propertyId`, objektnummer, namn, objektarea, verksamhet, kapacitetsuppgifter, egna `start`/`end` (Giltigt fr.o.m./t.o.m.) och `predecessorIds`.

Avtal har `objectId`. Avtalets datum beskriver avtalsperioden, inte objektets livslängd. Flera avtal över tid kan referera till samma objekt. Avtalets `area` är den avtalade ytan; objektets `area` beskriver objektets egen yta. Hyra, index, tillägg, hyresgäst, avtalskontakt och dokument ligger kvar på avtalet. Objekt kan sakna avtal. Aktiviteter kan ligga på fastighet, objekt eller avtal; varje aktivitet finns en gång. `propertyId` på avtal och objektanknutna aktiviteter är en härledd kompatibilitetsprojektion, inte en alternativ hemvist.

## Migration

Befintliga objekt bevaras. Tidigare avtal utan objekt får en stabil `OBJ|<avtals-ID>`-post när fastighetskopplingen är giltig. Om källan uttryckligen har `objectNumber` återanvänds entydigt objekt på samma fastighet. Utan sådan identitet slås olika avtal aldrig automatiskt samman till ett objekt. Det provisoriska objektet har `migrationSourceContractId`, kopierad relevant fältproveniens och tomma objektdatum. Avtalsdatum används aldrig som objektdatum. Migrerade objekt kan senare kopplas ihop med rätt verkligt objekt genom redigering av avtalets objektkoppling; äldre objektsinformation finns kvar.

Migrationen är idempotent i webbläsaren, Excel och lokal backend. Backend lagrar objekten i det lokala användarlagret; de försvinner inte vid källuppdatering eller omstart. Inga skarpa källfiler ändras under utvecklingsarbetet.

## Delning och sammanslagning

Avsluta tidigare objekt med Giltigt t.o.m., skapa nya objekt med eget ID och Giltigt fr.o.m. samt välj föregående objekt. En delning har ett föregående objekt och flera efterföljare; en sammanslagning har flera föregående objekt och en efterföljare. Länkar måste ligga på samma fastighet. Datum måste finnas och föregående objekt ska avslutas före den nya periodens början. Cirkulära länkar är förbjudna. Objekt med avtal, aktiviteter eller efterföljare får inte raderas via backend-API.

## Import och användning

Kopplingstabellen kan föra kolumner till Fastigheter, Objekt, Avtal och Aktiviteter från samma flik. Bearbetning sker i föräldraordning. Objektnummer matchas inom fastigheten; fastigheten ensam identifierar aldrig ett objekt. Osäkra relationer bevaras för granskning.

Objekt finns i sidomenyn på desktop och under Mer på mobil. Objekt redigeras med generiskt formulär, där föregående objekt väljs med namn. Avtal och aktivitetsformulär har objektkoppling. Planera kan ange ett objekt som hemvist. Verksamhetsfilter och sök inkluderar objektuppgifter. Budgetrader innehåller objektkoppling men beräknas fortfarande per avtal/aktivitet, vilket undviker extra budgetrader för själva objektet.

Den fulla guidade importen i steg Fastighet → Objekt → Avtal → Aktiviteter är nästa UX-steg. Grundmodell och måltabeller finns nu; denna ändring ersätter inte kopplingstabellen med en ny importguide.
