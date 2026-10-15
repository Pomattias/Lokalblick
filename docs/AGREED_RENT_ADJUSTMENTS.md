# Avtalad hyresjustering

Hyra och tillägg är separata komponenter på avtal, inte budgetinställningar. Äldre kontrakt utan uttrycklig metod fortsätter att använda sin tidigare KPI-beräkning.

## Fält per komponent

Prefix är rent (hyra) eller addition (tillägg).
- AdjustmentMethod: kpi, none, fixed eller kpi-limited.
- BaseYear: referensåret för oktober-KPI. Avtalat basbelopp avser följande hyresår (BaseYear + 1).
- BaseIndex: KPI-bastal (avtalets serie); om tomt läses fastställt oktoberindex.
- IndexPercent: KPI-andel lagras mellan 0 och 1, visas som 0–100 %.
- AnnualPercent: fast årlig ökning i procentenheter, endast fixed.
- MinPercent och MaxPercent: min/max avtalad årlig ökning, kan anges var för sig, endast kpi-limited.
- LimitBasis: rent (gränser gäller faktiska hyresförändringen), index (gränser gäller KPI-förändringen innan indexandel).

## Beräkningsprincip

- none ger avtalat oförändrat basbelopp.
- fixed: bashyran multipliceras med (1 + procent / 100) för varje år efter BaseYear + 1.
- kpi följer tidigare formel oförändrat.
- kpi-limited använder KPI oktober föregående år jämfört med oktober året innan; årsvis min/max tillämpas på KPI eller hyresförändringen enligt avtal och föregående års hyra blir nästa års beräkningsbas.
- Saknade eller motstridiga mellanliggande KPI-tal ger Behöver kontroll. Strict budgetlåsning ska inte tillåta detta.
- Budgetens preliminära oktoberindex kan användas i sista prognosåret, men ändrar aldrig avtalsregel.

Excel-fliken Avtal innehåller de nya avtalsvillkoren. Låsta budgetversioner bevarar historiska rader.
