# Lokalblick – GitHub- och Vercel-flöde

## Syfte

Minska onödiga Vercel-deployments på Hobby utan att förlora automatiska GitHub-tester.
Ändringen gäller enbart den här kodbasens gren `utveckling`. Ändra inte
`main`, produktionsdomäner, skarpa data eller anslutningsuppgifter.

## Automatiska tester

- Vid varje push till `utveckling` och pull request mot `utveckling` körs
  `.github/workflows/tests.yml`, precis som tidigare.
- När flera nya commits kommer till samma gren/PR avbryts äldre
  GitHub Actions-körningar och den senaste körningen får slutföras.
- Alla tidigare teststeg finns kvar; ingen kontroll har inaktiverats.
- Avbrutna tidigare körningar är avsiktligt inte liktydigt med godkänt test.

## Vercel publicerar inte automatiskt varje utvecklingscommit

- `vercel.json` anger `git.deploymentEnabled.utveckling = false`.
- Det gäller **automatiska Git-utlösta** deployments för just `utveckling`.
- `main` har ingen ny regel och påverkas inte av denna ändring.
- En befintlig preview-URL kan därför visa en äldre commit än GitHub. Kontrollera
  alltid commit-SHA innan du använder en preview för godkännande.

## Skapa en preview vid behov

1. Samla och verifiera arbetet lokalt, gör normalt **en** commit per färdig uppgift
   till `utveckling` enligt `AGENTS.md`.
2. Kontrollera GitHub Actions för den exakta commiten. Vid rött testresultat:
   rapportera orsaken; en grön Vercel-build ersätter **inte** godkända tester.
3. Begär en **manuell Vercel Preview-deployment** för den aktuella SHA:n via
   Vercel API/ChatGPT:s anslutna Vercel-verktyg med `gitSource` satt till
   `Pomattias/Lokalblick`, `ref: utveckling` och den avsedda SHA:n.
   Kontrollera att målmiljön är `preview`, aldrig `production`.
   Alternativt från en lokalt uppdaterad arbetskopia som är kopplad till
   Vercel-projektet: `vercel deploy` (utan `--prod`).
4. Kontrollera deploymentstatus, fungerande preview och att SHA:n överensstämmer
   med GitHub. Ingen automatisk publicering behöver återaktiveras.

## Verifiering och återställning

- Testa att en vanlig push till `utveckling` startar GitHub Actions men
  **inte** en automatisk Vercel-preview.
- Testa vid behov en enda explicit manuell Preview-deployment.
- Om flödet behöver återställas: ta bort `utveckling: false` ur
  `vercel.json` på `utveckling` (behåll `main` orört).
- Förändringen påverkar endast publiceringsflödet, inte appens funktion eller
  skarpa verksamhetsdata.
