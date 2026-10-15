# Mobilkarta och navigation

Kartans Leaflet-lager isoleras i kartans egen stacking context. Mobilnavigationen och Mer-panelen har separata lager ovanför innehållet. Kartans mobilhöjd använder dynamisk viewport och ingen fast minimihöjd på 420 px. Navigationens placering och sidans bottenutrymme tar hänsyn till safe-area.

Kartans fördröjda storleksuppdatering och Leaflet 1.9.4:s fördröjda scrollzoom avbryts vid stängning. Det förhindrar fel vid snabba sidbyten efter scroll.

Regressionstest med syntetisk demodata och riktig Leaflet:

```sh
npm install --no-save --package-lock=false playwright@1.51.1 leaflet@1.9.4
npx playwright install chromium --only-shell
node scripts/mobile-map-check.mjs
npm test
```

Testet reproducerar övertäckningen med utveckling 59d8965:s CSS: Planera, Budget och Mer träffas av kartan efter scroll vid 390 × 667 px. Därefter kontrolleras rättningen vid 320 × 568, 390 × 667/844, 430 × 932 och 667 × 375 px: elementFromPoint träffar navigeringsknapparna, verkliga klick byter sida, Mer öppnas, scroll fungerar och inga JavaScript-fel uppstår. Desktop 1440 × 900 px kontrolleras också. Externa kartbilder isoleras från testet; Leaflet JS/CSS laddas från testberoendet.

Preflight undantar den befintliga tomma konfigurationsmallen .env.example; riktiga miljöfiler förblir spärrade.
