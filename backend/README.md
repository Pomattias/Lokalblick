# Lokalblick backend

Backend är gränsen mellan Lokalblicks UI och företagets data.

## Produktionsprincip

Frontend får aldrig läsa eller skriva direkt till Excel, SharePoint eller Dataverse med hemligheter i klientkod. Frontend anropar endast ett autentiserat API.

```
Teams / webbläsare
       |
       | Entra ID-token
       v
Lokalblick frontend
       |
       | /api/*
       v
Lokalblick backend
       |
       +-- SharePoint / Microsoft Lists
       +-- Dokumentbibliotek (LEB, avtal, projekt)
       +-- ev. Dataverse
```

## Ansvar

Backend ska:
- verifiera användaren via Microsoft Entra ID
- kontrollera behörighet/roll
- läsa och skriva strukturerad data
- hämta aktuell LEB-fil från företagets SharePoint
- normalisera SF + EXT server-side
- bevara kompletteringar när LEB uppdateras
- skapa årsbudget från avtal och tidsatta behov
- logga ändringar i ansvar, projekt, ärenden och budget
- aldrig exponera Graph-hemligheter eller app credentials till frontend

## Lagring

Rekommenderad första produktionsversion:
- SharePoint dokumentbibliotek: LEB och dokument
- Microsoft Lists eller Dataverse for Teams: personer, tilldelningar, projekt, UH, driftärenden, önskemål och budgetunderlag
- Entra-grupper: åtkomst till Lokalblick

Den publika GitHub Pages-versionen använder aldrig denna backend och innehåller endast demodata.


## Kartdata

Fastighet kan ha `latitude` och `longitude`. I produktion ska adressgeokodning ske server-side eller via en av organisationen godkänd karttjänst. Företagsadresser ska inte skickas från den publika GitHub-klienten till en extern geokodningstjänst.

Frontend ska endast få tillbaka de koordinater och fastighetsuppgifter den inloggade användaren har rätt att se.


## Datakällor som adapters

Backend är leverantörsoberoende. `LokalblickRepository` använder en `LokalblickSourceAdapter`.

Första adapterfamiljer:
- M365 / SharePoint / Microsoft Lists
- extern fastighets- eller verksamhets-API
- senare SQL / Dataverse / andra kundsystem

Alla normaliserar till samma Lokalblick-modell. Frontend behöver därför inte veta var kundens data faktiskt ligger.
