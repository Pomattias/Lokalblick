# KPI: avtalshyra och budgetscenario

Beslut 2026-10-15. Detta är ett domänkontrakt för Lokalblick V2.

## Två skilda beräkningar – en gemensam motor

1. **Ordinarie avtalshyra** (visas på avtal, fastigheter, nyckeltal):
   `LokalblickCalculations.annualValues(contract, year, 0, indexSeries)`,
   `propertyAnnualCost(data, propertyId, year)` och `budgetRows(data, year)`.
   Använd endast tillgänglig fastställd oktober-KPI för avtalsåret och tillämplig
   indexserie, eller avtalad särskild uppräkningsmetod. Saknas underlag visas
   **Behöver kontroll**. Ändringar i `budgetPlans.preliminaryIndex` får aldrig
   påverka dessa belopp.
2. **Budgetscenario** (Budget, olåst budgetförslag, förhandsvisning):
   `budgetScenarioRows(data, year)`, `budgetProposal(data, year)`,
   `budgetScenarioIndex(data, year, ownIndex)`.
   Användarens `budgetPlans[year].preliminaryIndex` kan ersätta även ett
   fastställt oktoberindex, men endast *här*. Saknas oktober får senaste
   publicerade jämförbara månadsindex användas och märks *Preliminär*.

Båda vägarna går genom samma `annualValues` och `budgetRows` med det
**explicita** valet `{scenario:true}`. Den tidigare implicita flaggan
`allowLatestKpi` är borttagen.

## Bevara historiken

- Ändra inte kontraktets KPI-bas, referensår, indexandel, tillägg eller
  fastighetens identitet när budgetscenariot justeras.
- Låsta budgetar visar lagrade `plan.lines`; återberäkna eller skriv aldrig
  över en låst baslinje. Nya antaganden kräver en ny budgetversion.
- Årsbudgetens löpande driftkostnader hör till exakt en fastighet eller ett avtal
  (`recurringCosts`). Engångsåtgärder tillhör `activities` (Ärenden).
  Belopp som redan ingår i hyra, indexerade tillägg eller fastighetsskatt
  får inte räknas två gånger.

## Regression och gränssnitt

- `tests/kpi-scenario-separation.test.js` är grundkontraktet för denna regel.
- Testa ordinarie avtalshyra, scenario med/utan eget KPI, senaste
  månadsindex innan oktober och låst budget. Kör `npm test` på `utveckling`.
- Budgetvyn ska visa **Avtalshyra utan scenario** separat från
  **Preliminär hyra** och tydligt märka det manuella fältet som scenario.
- Företagsdata hanteras fortsatt i den privata backenden/Excel-källan.
  Vercels preview är inte en datalagringsplats för företagsdata.

## Fortsatt arkitekturförenkling

Fasa ut äldre dubblerad budget-/kostnadslogik en modul i taget efter
beroendeinventering och körda migrationstester. Innan äldre `operations`
eller `driftCosts` tas bort helt måste äldre källfiler och lokala
lagringsversioner hanteras utan att data tappas eller en årsrad
felaktigt blir en kostnad som återkommer tills vidare.
