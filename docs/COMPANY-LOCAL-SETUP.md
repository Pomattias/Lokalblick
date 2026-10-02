# Lokalblick company-local setup

## Data flow

```text
SharePoint / Teams
  → OneDrive-synced company folder
  → read-only LEB workbook
  → Lokalblick backend and its local persistence
  → same-origin Lokalblick API
  → frontend UI
```

The local company server reads the LEB file using the server-only
`LOKALBLICK_LEB_PATH` setting. The browser cannot select a source path. LEB
fields are read-only master data; user-created and user-edited Lokalblick data
is persisted by the backend in the selected JSON data file.

## Windows 365

1. Sync the approved company SharePoint/Teams folder with OneDrive.
2. Locate the current LEB workbook in the synced folder.
3. From the repository directory, run `npm run setup:company`.
4. Select the LEB workbook when prompted.
5. Select a backend data JSON file outside the Git repository.
6. Optionally select an approved coordinates JSON file outside the repository.
7. Confirm setup reports only the SF and EXT row counts.
8. Run `npm run company`.
9. Open `http://127.0.0.1:8787`.

Setup writes paths to the ignored root `.env.local`; it never copies the
workbook. Keep the backend JSON and coordinate files in an approved local
company location and back them up according to company policy.

`npm run setup:company` and `npm run company` require Node.js 20 or newer.
The server binds only to `127.0.0.1`, `localhost`, or `::1`; it does not enable
CORS and rejects cross-origin writes.

## Environment boundary

- GitHub Pages is a synthetic-data-only public demo.
- Windows 365 `localhost` is the company-local application.
- LEB is the read-only master source for imported core fields.
- Backend persistence owns all user-created and user-edited Lokalblick data.
- The frontend is UI only; company writes flow through the same-origin API.
- Do not add real workbooks, company data, local paths, `.env.local`, or
  backend JSON data to Git.

The company server serves the existing frontend assets without changing
`frontend/**` and provides a company-only API-backed data-service script at
runtime. See [the frontend contract](BACKEND_FRONTEND_CONTRACT.md) for the
required long-term client contract.
