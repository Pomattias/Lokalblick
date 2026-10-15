# Fastighet → Objekt → Avtal

Modellversion 6 inför `objects` som egen tabell och Excel-flik `Objekt`. Objekt har stabilt ID, `propertyId`, objektnummer, namn, objektarea, verksamhet, kapacitetsuppgifter, egna `start`/`end` (Giltigt fr.o.m./t.o.m.) och `predecessorIds`.

Avtal har `objectId`. Avtalets datum beskriver avtalsperioden, inte objektets livslängd. Flera avtal över tid kan referera till samma objekt. Avtalets `area` är den avtalade ytan; objektets `area` beskriver objektets egen yta. Hyra, index, tillägg, hyresgäst, avtalskontakt och dokument ligger kvar på avtalet. Objekt kan sakna avtal. Aktiviteter kan ligga på fastighet, objekt eller avtal; varje aktivitet finns en gång. `propertyId` på avtal och objektanknutna aktiviteter är en härledd kompatibilitetsprojektion, inte en alternativ hemvist.

## Automatisk objekthärledning vid extern import

Lokalblick konverterar **inte** gammal Lokalblick-data. När ett nytt externt
avtalsunderlag saknar en separat objektlista kan en avtalsrad få ett deterministiskt
objekt med ID `OBJ|<avtals-ID>`, förutsatt att fastigheten är känd.

Om källan har ett objektnummer kan ett entydigt objekt på samma fastighet
återanvändas. Två avtal slås aldrig ihop till samma objekt enbart för att de
tillhör samma fastighet eller har samma adress. Objektdatum lämnas tomma vid
automatisk härledning; avtalsdatum kopieras inte till objektets livscykel.

Ingen migreringsmarkör lagras på objektet. Identiteten och kopplingen
`contract.objectId` räcker för återläsning, upprepade importer och redigering.
Objekt sparas bakom backendens företagsgräns; externa källfiler är fortsatt
separata och skrivs inte automatiskt om.

## Delning och sammanslagning

Avsluta tidigare objekt med Giltigt t.o.m., skapa nya objekt med eget ID och Giltigt fr.o.m. samt välj föregående objekt. En delning har ett föregående objekt och flera efterföljare; en sammanslagning har flera föregående objekt och en efterföljare. Länkar måste ligga på samma fastighet. Datum måste finnas och föregående objekt ska avslutas före den nya periodens början. Cirkulära länkar är förbjudna. Objekt med avtal, aktiviteter eller efterföljare får inte raderas via backend-API.

## Import och användning

Kopplingstabellen kan föra kolumner till Fastigheter, Objekt, Avtal och Aktiviteter från samma flik. Bearbetning sker i föräldraordning. Objektnummer matchas inom fastigheten; fastigheten ensam identifierar aldrig ett objekt. Osäkra relationer bevaras för granskning.

Objekt finns i sidomenyn på desktop och under Mer på mobil. Objekt redigeras med generiskt formulär, där föregående objekt väljs med namn. Avtal och aktivitetsformulär har objektkoppling. Planera kan ange ett objekt som hemvist. Verksamhetsfilter och sök inkluderar objektuppgifter. Budgetrader innehåller objektkoppling men beräknas fortfarande per avtal/aktivitet, vilket undviker extra budgetrader för själva objektet.

Den fulla guidade importen i steg Fastighet → Objekt → Avtal → Aktiviteter är nästa UX-steg. Grundmodell och måltabeller finns nu; denna ändring ersätter inte kopplingstabellen med en ny importguide.
