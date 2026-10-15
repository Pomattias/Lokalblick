/* Overview presentation order: the filter chips mirror the tables below. */
scopeAllSectionsHtml = function(contracts) {
  return '<div class="scope-all-sections">' +
    scopeContractsSectionHtml(contracts) +
    scopeActivitySectionHtml(contracts,"project","Projekt","project") +
    scopeActivitySectionHtml(contracts,"maintenance","Underhåll","maintenance") +
    scopeActivitySectionHtml(contracts,"drift","Drift","driftIssue") +
    scopeActivitySectionHtml(contracts,"wish","Önskemål","wish") +
  '</div>';
};

portfolioContentTabsHtml = function(contracts) {
  const items = portfolioActivityItems(contracts);
  const counts = {
    contracts: contracts.length,
    project: items.filter(function(x){return x.group === "project";}).length,
    maintenance: items.filter(function(x){return x.group === "maintenance";}).length,
    drift: items.filter(function(x){return x.group === "drift" || x.group === "operations";}).length,
    wish: items.filter(function(x){return x.group === "wish";}).length
  };
  const modes = [
    ["contracts","Avtal","Avtal, area och årskostnad"],
    ["project","Projekt","Projekt, tid och budget"],
    ["maintenance","Underhåll","Behov, planering och kostnad"],
    ["drift","Drift","Driftkostnader och ärenden"],
    ["wish","Önskemål","Önskemål och övriga behov"]
  ];
  return '<div class="view-choice-bar" role="tablist" aria-label="Filtrera poster">' + modes.map(function(mode) {
    const active = portfolioExplorer.section === mode[0];
    return '<button class="view-choice ' + (active ? "active" : "") + '" type="button" data-portfolio-section="' + mode[0] +
      '" role="tab" aria-selected="' + (active ? "true" : "false") + '" title="' + esc(mode[2]) + '">' +
      '<span>' + esc(mode[1]) + '</span><strong>' + counts[mode[0]] + '</strong>' +
    '</button>';
  }).join("") + '</div>';
};

/* Keep the compact mobile overview aligned with the desktop table order. */
mobilePropertyOverviewHtml = function(contracts) {
  const cs=propertyContractsForContext(contracts);
  const items=portfolioActivityItems(cs);
  const cards=[
    ["contracts","Avtal",cs],
    ["project","Projekt",items.filter(function(x){return x.group==="project";})],
    ["maintenance","Underhåll",items.filter(function(x){return x.group==="maintenance";})],
    ["drift","Drift",items.filter(function(x){return x.group==="drift"||x.group==="operations";})],
    ["wish","Önskemål",items.filter(function(x){return x.group==="wish";})]
  ];
  return '<div class="mobile-property-overview-grid">' + cards.map(function(card){
    const total=card[0]==="contracts"
      ? card[2].reduce(function(s,c){return s+totalContractCost(c);},0)
      : card[2].reduce(function(s,x){return s+(Number(x.cost)||0);},0);
    return '<button type="button" data-portfolio-section="' + card[0] + '"><span>' + esc(card[1]) + '</span><strong>' + card[2].length + '</strong><small>' + money(total) + (card[0]==="contracts"?"/år":"") + '</small><b>→</b></button>';
  }).join("") + '</div>' + mobileActivitiesHubHtml(cs);
};
