# AGENTS.md – Arbetsregler för Lokalblick

## Commits och publicering – obligatoriskt

- **En färdig uppgift = normalt en commit.** Gör inte en commit för varje delsteg, filändring, UI-justering eller felsökning inom samma uppgift.
- Genomför alla tillhörande ändringar, inklusive testuppdateringar, i arbetskopian och granska helheten **innan** du skapar commit. Samla ändringarna i en enda logisk commit med beskrivande meddelande.
- Kör relevanta tester, syntaxkontroller och kvalitetssäkring före commit. Redovisa tydligt vad som är testat och vad som återstår.
- Om en uppgift består av flera justeringar, behåll dem som ej committade ändringar tills hela uppgiften är klar. Undvik mellancommits enbart för att spara progression.
- Separata commits är tillåtna när användaren uttryckligen ber om det eller när förändringar är verkligt självständiga, färdiga och bör kunna återställas separat. Motivera då uppdelningen.
- **Publicera inte på Vercel efter varje deländring.** Skapa normalt en deployment först när hela uppgiften är färdig, kontrollerad och samlat committad. Verifiera deployment-status innan du påstår att ändringen syns på webben.
- Beakta Vercels bygg- och API-kvoter. Undvik upprepade deploymentförsök vid känd kvotspärr. Meddela användaren om GitHub och Vercel inte ligger på samma commit.
- Arbeta som standard i branch `utveckling`. Uppdatera inte `main` utan uttryckligt uppdrag.
- Ändra inte skarpa Excel-filer eller verksamhetsdata vid kodarbete; använd testdata eller kopior om inte användaren uttryckligen godkänner annat.

## När redigeringsverktyget bara kan skapa en commit per fil

Vissa verktyg skriver direkt till GitHub och skapar en commit för varje filändring. **Använd inte sådana verktyg för ett flerstegsarbete om du kan använda en arbetskopia, en batch-commit eller en pull request med samlade ändringar.** Om det saknas möjlighet att samla flera filändringar till en commit, informera användaren om begränsningen innan arbetet påbörjas och välj en lämplig metod i stället för att tyst skapa många delcommits.

## Produktprinciper

- Återanvänd befintlig kod och datamodell. Hellre mindre kod än ny kod.
- En aktivitet registreras en gång och länkas till den mest specifika korrekta hemvisten (avtal, fastighet, verksamhet, område eller generell).
- Låt uppgifter visas från flera vyer utan dubbellagring.
- Håll företagsdata inom godkänd lokal miljö; publicera inte verksamhetsdata i externa utvecklingsmiljöer.
