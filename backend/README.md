# Lokalblick backend

Backend är gränsen mellan Lokalblicks UI och företagets data.

## Lokal utvecklingsversion

Den första backend-versionen kan köras lokalt på Windows 365:

```powershell
npm run company
```

Standardadress är `http://127.0.0.1:8787`.

Backend serverar även `frontend/` lokalt, så företagsversionen kan köras same-origin utan att Excel/LEB eller koordinater behöver gå via Vercel.

## Geokodning

Fastigheternas adresser geokodas server-side med Azure Maps. Frontend skickar endast fastighets-ID, adress och eventuella befintliga koordinater till den lokala Lokalblick-backenden. Backend:

1. använder redan sparad koordinat om adressen är oförändrad
2. registrerar befintliga källkoordinater som ett backendägt overlay
3. geokodar endast nya eller ändrade adresser
4. sparar koordinaterna i `LOKALBLICK_COORDINATES_PATH`
5. skickar tillbaka latitud/longitud, status, confidence och provider till frontend

Azure Maps batch-geokodning hanterar upp till 100 adresser per anrop. Lokalblick delar därför större importer i block om 100.

Utvecklingskonfiguration:

```text
AZURE_MAPS_SUBSCRIPTION_KEY=<hemlig nyckel>
LOKALBLICK_HOST=127.0.0.1
LOKALBLICK_PORT=8787
```

Lägg verkliga värden i den lokala miljön, aldrig i GitHub. För produktion bör Azure Maps anropas med Microsoft Entra ID/managed identity i stället för en delad nyckel.

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
       +-- Azure Maps / godkänd geokodning
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

LEB/Excel är master för källdata. Lokalblicks kompletteringar och overlays ägs av backend. Geokoordinater är därför backend-data och skrivs inte automatiskt tillbaka till Excel.

Den lokala coordinate store-filen skrivs atomiskt och ligger utanför repo som standard. När användaren uttryckligen väljer att skriva till en Excel-källa kan frontendens vanliga write-back-flöde fortfarande exportera de koordinater som finns i den aktuella arbetsmodellen.

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
