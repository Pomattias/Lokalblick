# Lokalblick: Visa och Redigera

**Gäller appens alla detaljredigerare och sidor som öppnar dem.**

- Visa och Redigera använder exakt samma formulär, kort, rader, sektioner och fältordning. Redigera låser enbart upp värdena.
- I Visa-läge presenteras fältvärden som vanlig text på **samma plats** där input, select eller textarea visas i Redigera. Inga avaktiverade rullistor ska visas som värden.
- Samma typsnitt, textstorlek, fälthöjd, radavstånd och containerbredd ska gälla för mobil och desktop i båda lägena. Text och formulär får aldrig ersättas med bilder.
- När Redigera aktiveras flyttas eller ersätts inte hela formuläret; fokusera inte automatiskt ett fält eller öppna tangentbordet på iPhone.
- Ärenden använder den redan införda enhetliga uppställningen; övriga redigerare (fastighet, avtal, objekt, verksamhet, person, ansvar, beställning och andra schemastyrda register) använder `editor-mode-fields.js`.
- Kontrollernas värden och namn finns kvar i DOM och lagras oförändrat. Textrepresentationen är endast visning, aldrig ett nytt datakällfält.
- När man trycker Ångra, sparar eller lämnar redigeraren gäller befintlig återställning, validering och historik.
- Hjälptexter, knappar för ytterligare åtgärder och kartor påverkas inte av värdeomkopplingen. Åtgärdsknappar kan vara visuellt reserverade för att inte ändra layouten när redigering aktiveras.

- På mobil visas en skarp grön ram med en subtil, Siri-inspirerad flerfärgad fade **utanför** linjen enbart i aktivt Redigera-läge. Ramen ligger ca 5 px från skärmkanten för att lämna mer utrymme till sidans text, samtidigt som glöden syns utanför linjen. Effekten utgörs av utåtriktade CSS-skuggor (aldrig `inset`), ligger på ett eget fixerat DOM-element direkt på `body` och påverkar inte innehåll, layout, skroll, fältstorlekar eller typografi. Den tas bort när Redigera avslutas.

## Testa vid fortsatta ändringar

1. Öppna en fastighet, ett avtal, ett objekt och ett ärende på iPhone och desktop.
2. Jämför Visa och Redigera: samma radordning, gränser, typsnitt, datumfält, bredd och höjd.
3. Redigera, ångra, spara. Kontrollera att även personer och fler-val behålls.
4. Kontrollera att ingen skarp Excel-fil eller företagsdata ändras av UI-ändringen.
