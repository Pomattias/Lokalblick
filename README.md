# Lokalblick — MVP

Lokalblick är en första styrningsapp för att samla LEB-baserad fastighets- och avtalsdata med projekt, underhåll, drift, personer och arbetsfördelning.

## V1 prioriterar

1. Dashboard med nyckeltal och diagram
2. Fastighetstabell — en rad per LEB-objekt
3. Avtalstabell — SF + EXT
4. Projekt, underhåll och drift som 1:N-poster
5. Personer och tilldelningar till fastigheter/projekt
6. Arbetsfördelning och belastningsdiagram

Karta är medvetet uppskjuten till nästa steg.

## LEB-import

Appen läser en Excel-fil lokalt i webbläsaren och förväntar sig två flikar:

- `SF`
- `EXT`

Excel-filen eller dess rådata skickas inte till GitHub av appen. Importen görs klient-side via SheetJS och normaliseras till två kärnobjekt:

- `Fastighet` — unikt förvaltningsobjekt
- `Avtal` — ett eller flera avtal per fastighet

## Datamodell

```text
Fastighet
├── Avtal                 1:N
├── Projekt               1:N
├── Underhållsbehov       1:N
├── Drift                 1:N
└── Tilldelning           1:N
      └── Person

Projekt
└── Tilldelning           1:N
      └── Person
```

En person kan vara kopplad till flera fastigheter och projekt. En fastighet eller ett projekt kan ha flera personer med olika roller och procentuell omfattning.

## Lagring i denna MVP

Kompletteringar sparas i `localStorage` i den aktuella webbläsaren. Det är avsiktligt i prototypen för att kunna testa informationsmodellen innan Microsoft Lists/SharePoint/Graph kopplas in.

Nästa backendsteg är ett adapterlager mot Microsoft 365, utan att UI eller datamodellen behöver göras om.

## Köra lokalt

Detta är en statisk app utan byggsteg. Servera katalogen med valfri lokal webbserver, till exempel:

```bash
python3 -m http.server 8080
```

Öppna sedan `http://localhost:8080`.
