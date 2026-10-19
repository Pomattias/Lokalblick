ExcelJS 4.4.0: `node_modules/exceljs/dist/exceljs.min.js`.
MIT license in EXCELJS-LICENSE.txt. Used only inside the local Excel worker.
Vendored to support local data without a runtime CDN dependency.
To update, change the package dependency, copy this distribution and license,
and rerun the Excel round-trip and browser flow tests.

SheetJS xlsx 0.18.5: `node_modules/xlsx/dist/xlsx.full.min.js`, same pinned
parser as the existing import. Apache 2.0 license in XLSX-LICENSE.txt. Used by
the local conversion worker; no source values are transmitted to a CDN.
