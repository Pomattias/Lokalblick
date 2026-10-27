# Lokalblick v3 – ren databas från början

Denna databasmodell består av **21 verksamhetstabeller** (och tekniska `store_meta`).
Inga migrationsskript, äldre prototypkolumner, datakonverteringar eller befintliga
verksamhetsdata ingår. Skapandefunktionen avvisar alltid en redan existerande fil.

## Skapa en helt ny tom databas

Med Node 24:

```bash
npm run db:v3:create -- /valfri/privat/sökväg/lokalblick-v3.sqlite
npm run test:db-v3
```

Filen ska ligga på en **privat lokal volym/servermiljö**, aldrig i en publik
Vercel-katalog eller i GitHub. Ingen databas skapas automatiskt av en deployment.

## Ägarskap och nycklar

- `properties → objects → agreements → agreement_items` är identitetskedjan.
- `objects.id` är beständigt; `object_number` är unikt per fastighet.
- `object_versions` har unik kombination `(object_id,valid_from)`. Area och
  övriga föränderliga objektfakta finns endast här. Slutdag härleds från nästa
  startdatum och eventuellt `objects.ended_on`.
- `agreement_versions` har unik kombination `(agreement_id,valid_from)`.
  `legal_end_on` beskriver juridisk avtalssluttid, inte versionens slut.
- `party_people` är en daterad medlems-/företrädarrelation. Personkopplingar kräver giltig partsanknytning under hela kopplingens period.
- `stakeholder_assignments` äger part+person+roll+datum och precis **en**
  fastighets-/objekts-/avtals-/ärende-/beställningsreferens. Ärvda kontakter
  härleds vid läsning via `resolvedStakeholders`, aldrig genom kopierade rader.
  Prioritet: avtal > objekt > fastighet. Hyresgästrollen kan endast knytas till
  avtal; hyresgästkontakt ärvs enbart för samma part som avtalets hyresgäst.
- `recurring_costs` är prognos/årliga kostnadsposter,
  `cost_evidence` fakturor/årsutfall,
  `budgets` + `budget_lines` låsta eller öppna budgetversioner.
- `inspections` är daterade tillfällen, `inspection_points` bedömningar på
  utrymmen eller byggnadsdelar.

## Viktig integrationsgräns

Detta är **en körbar ny databasgrund**, inte ett dolt utbyte av befintlig v2-lagring.
Den pågående frontend-/Excel-adaptern och `backend/lokaler/store.js` använder
fortfarande den tidigare rena tabellmodellen och **ska inte** anslutas till
v3-filen innan v3-fältmappning, skrivflöden och UI är färdiganpassade.
Det finns ingen migration; första skarpa v3-arbetsytan skapas tom.

SQL: `backend/lokaler/v3/schema.sql`.
API: `backend/lokaler/v3/database.js`.
Test: `tests/lokalblick-v3-database.test.js`.
