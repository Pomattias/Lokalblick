# Lokalblick – designkomponenter, steg 1

Detta är det nya **additiva** CSS-lagret i `frontend/v2/design-system.css`, laddat efter `styles.css`. Befintliga komponenter använder ännu sina tidigare klasser. Det är avsiktligt så att funktion och utseende inte förändras oavsiktligt i steg 1.

## Designvariabler

| Grupp | Variabler |
|---|---|
| Färg | `--ui-color-text`, `--ui-color-muted`, `--ui-color-border`, `--ui-color-surface`, `--ui-color-page`, `--ui-color-primary`, `--ui-color-primary-soft`, `--ui-color-warning`, `--ui-color-focus` |
| Mellanrum | `--ui-space-1` till `--ui-space-5`: 4/8/12/16/24 px |
| Rundning | `--ui-radius-sm/md/lg/pill`: 6/9/12/999 px |
| Höjd | `--ui-height-compact`: 36 px, `--ui-height-control`: 42 px |
| Text | `--ui-font-xs/sm/base/lg`: 11/12/14/18 px |

Färgerna pekar på Lokalblicks existerande teman (`--ink`, `--muted`, `--line`, `--paper`, `--bg`, `--accent`, `--soft`, `--warning`). Ingen ny palett skapas.

## Klasser och avsedd användning

| Komponent | Klasser | Användning |
|---|---|---|
| Standardknapp | `ui-button` | Normal dialog-/formularaktion |
| Primär knapp | `ui-button ui-button--primary` | En primär handling som Spara |
| Sekundär / diskret | `ui-button`, `ui-button ui-button--quiet` | Ångra, Stäng, diskret navigation |
| Kompakt knapp | `ui-button ui-button--compact` | Filter- och tabellhandlingar |
| Pillform | `ui-button ui-button--pill` | Typfilter, lägesval |
| Formulärfält | `ui-field`, `ui-field ui-field--compact` | Input, select, textarea |
| Informationskort | `ui-card`, `ui-card ui-card--compact` | KPI, portföljrad, sammanfattning |
| Filter | `ui-filter` | Filterytor, aktiva värden |
| Information | `ui-label`, `ui-read-value` | Kompakt etikett och läslägesvärde |

### Exempel (markupprototyp – koppla inte bort fungerande dataattribut)
```html
<button type="button" class="ui-button ui-button--compact ui-button--pill">Projekt</button>
<button type="submit" class="ui-button ui-button--primary">Spara</button>
<input name="title" class="ui-field" />
<article class="ui-card ui-card--compact">...</article>
```

### Regler för kommande steg
- Lägg till klasser på befintliga kontroller; behåll `name`, `data-*`, `type`, `aria-*` och events.
- Ändra en vy i taget, ta jämförelseskärmbilder på 390/430 px mobil och desktop.
- Ta inte bort äldre CSS innan den aktuella vyn är verifierad visuellt och funktionellt.
- Testa låsning/Redigera/Ångra/Spara, journal och iOS-tangentbord när editorstilar ändras.
- Låt kartans helskärm och Excelmappningens tabellscroll vara uttryckliga undantag.
- Bevara `main` och `utveckling` oförändrade tills ändringarna kan mergas kontrollerat.

Steg 1 är **inte en färdig UI-harmonisering** utan ett stabilt komponentkontrakt för fortsättningen.
