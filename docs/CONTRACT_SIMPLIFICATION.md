# Lokalblick V2 – Avtal: kompakt editor och fortsatt rensning

Datum: 2026-10-09. Arbetsbranch: `utveckling`.

## Beslut och nu genomfört

- En kompakt avtalseditor utan åtta automatiskt genererade flikar.
- Visar Fastighet, Fastighetsägare, Hyresgäst, Kontaktperson, avtalsnummer, standardiserad lokalkategori och area.
- Fastighetsägaren hämtas från **fastigheten** (`property.ownerPartyId`). Avtalets `businessPartyId` är hyresgästen, inte fastighetsägaren.
- Avtalstid: Fr.o.m., T.o.m., uppsägningstid och automatisk förlängning. En läsbar härledd uppsägningsdag och möjlig förlängning visas från sparade villkor.
- Hyra/index med bashyra, basår, indexandel och KPI-bastal; **Tillägg** (tidigare Media) visas kompakt och kan indexeras separat.
- **Fastighetsskatt** behålls som eget fält och egen kostnadsdel i avtal, fastighetskalkyl och budget.
- KPI-bastal hämtas från befintlig beräkningsmotor eller avtalat uttryckligt bastal; den manuella standardinmatningen för bastal är borttagen från normalvyn.
- Länk till avtalsdokument kan visas om den finns och är en HTTP(S)-länk.
- Importerad data som inte visas av editorn bevaras tills beroendekartläggning och backend-migrering är klar.

## Verklig borttagning ur backend – kvarstående arbetsuppgift

Användaren har uttryckligen beslutat att rödkryssade fält ska **tas bort ur både UI och backend**, inte bara döljas. I första, säkra frontendsteget visas de inte i avtalets editor. **De är ännu inte fysiskt borttagna ur backend, import eller lagrad data.**

Följande är markerade för faktisk rensning när beroenden är hanterade:
- `source` (Källa)
- `use` (Verksamhetstyp)
- `ekotObject` (Objekt i Ekot)
- `annualContractDrift` (Media per år)
- `costCenterOperations` och `costCenterPremises` (Kostnadsställen)
- `moveInDate` och `moveOutDate`
- `originalTerm`

Kontrollera alltid importadapter, Excelmodell, lokal backendpersistens, berikning, historiska poster, ekonomi och budget. Identifierade beroenden:
- `annualContractDrift` är äldre källfält för **samma Tillägg**. Det används nu endast som fallback när indexerat/kanoniskt tillägg saknas, och ska inte adderas ovanpå Tillägg. Vid sparning av ett äldre, oindexerat avtal förs värdet över till `baseAdditions` och det dubbla värdet nollställs.
- `annualPropertyTax` är **fortsatt aktivt** och ingår separat i beräknad årskostnad och budget. Ta inte bort fältet.
- `moveInDate`/`moveOutDate` prioriteras framför avtalstider i `budgetPeriod`. Att ta bort dem ändrar årets andel av hyran.
- `source` används för spårbarhet och kan styra källprioritet/berikning.
- `use`, `ekotObject` och kostnadsställen kan förekomma i källadapter/mappning.

**Rensa inte produktions-/företagsdata automatiskt.** Ta backup, ersätt nödvändiga härledningar och testa migreringen innan fälten avvecklas fysiskt. Behåll `main` orörd.

## Nästa beslut

- Uppsägning: eget tillstånd och datum för faktiskt uppsagt avtal. Den nya förhandsberäkningen antar att avtalet löper vidare tills något annat registreras; den har medvetet **inte** kopplats till budgetens `budgetPeriod` ännu.
- Flera separata hyrestillägg: befintlig modell har **ett aggregerat tillägg med egen indexering** (`baseAdditions`, `additionBaseYear`, `additionIndexPercent`). Flera tillägg med individuell indexering kräver separat datamodell/migrering.
- KPI-bastal: importerade avtalade explicita bastal respekteras av beräkningsmotorn; de är inte editerbara i den förenklade normalvyn.
- Beräknad hyra/uppsägningsdatum i editorn uppdateras efter sparning, inte live när man skriver.
- Lokalkategori: äldre och okända värden visas tills de aktivt kategoriseras; gör en kontrollerad migrering av kategorier, inte massbyte utifrån osäkra tolkningar.

## Beslut 2026-10-09: Media är Tillägg, fastighetsskatt ska finnas kvar

Den kanoniska kostnadssummeringen är nu:

**Årskostnad = indexerad bashyra + indexerat tillägg + fastighetsskatt**.

- `annualContractDrift` representerar äldre benämning **Media**, inte en separat fjärde kostnad.
- Om inga användbara kanoniska tillägg finns kan den äldre mediesumman användas som **ett** tilläggsvärde för historiska importer, aldrig adderat ovanpå tillägget.
- För äldre oindexerade avtal kan avtalseditorn föra över beloppet till `baseAdditions` och ange 0 % index. Om användaren i stället anger indexvillkor som ännu behöver kontrolleras behålls det äldre källvärdet som säkerhetsfallback.
- `annualPropertyTax` (**Fastighetsskatt**) behålls fullt ut. Den redigeras separat och tas med i årskostnad och budget utan indexuppräkning.
- V1, arbetsbokens äldre "Media per år"-kolumn och backendens importalias är ännu inte slutmigrerade. Ta inte bort gamla företagsdata innan importadaptrar, backendoverlays och exportformat kan hantera migreringen. Den gamla benämningen får inte leva kvar som en separat kostnad när migreringen är klar.
