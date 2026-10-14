# LuxuryStay HMS — Documentation

This folder holds the project documentation for **LuxuryStay HMS — Hotel Management System** and everything needed to rebuild it.

| Item | What it is |
|---|---|
| `LuxuryStay_HMS_Documentation.docx` | The project report: condensed edition, 29 pages, editable |
| `LuxuryStay_HMS_Documentation.pdf` | The same report exported to PDF by Microsoft Word |
| `archive/` | The previous full edition (88 pages, 14 October 2026), Word and PDF, kept unchanged |
| `screenshots/` | 45 screenshots from the running application (PNG, 1440 × 900 unless noted). Files starting `e2e-` come from the isolated test environment (`lsverify_test`); the others come from `luxurystay_dev`. |
| `diagrams/` | Architecture, use-case, data-flow, database, lifecycle and sequence diagrams (PNG) |
| `diagrams/source/` | The HTML/SVG source of each diagram |
| `tools/` | Scripts that capture the screenshots, draw the diagrams, build the Word file and export the PDF |

Before submission, fill in the blanks on the cover page (institution, department, programme, supervisor, session, date), the declaration and the acknowledgement. Open the `.docx` in Word, make the changes, then save and export the PDF again (see step 5 below).

## What the document is based on

- **Source code:** every technical statement was checked against `server/` and `client/`. The permission matrix, API endpoint list, dependency versions, npm scripts, test suites and directory tree are read from the source each time the document is built.
- **Screenshots:** taken from the application running locally against `luxurystay_dev`, using fictional demonstration accounts and records. Account lists are filtered to `@demo.luxurystay.test` addresses. No production data, passwords, tokens or real identity documents appear.
- **Test results:** the document reports only checks that were actually run, with their dates (Chapter 11).

## Regenerating the documentation

You need Windows with Microsoft Word, Microsoft Edge, Node.js and the project's own requirements (MongoDB and the server and client dependencies).

### 1. Install the tools

```powershell
cd documentation\tools
npm install
```

### 2. Start the application on the development database

In two terminals:

```powershell
cd server
npm run dev        # API on http://localhost:5000, database luxurystay_dev
```

```powershell
cd client
npm run dev        # website on http://localhost:5173
```

Check that `http://localhost:5000/api/health` reports `"databaseName":"luxurystay_dev"`.

The screenshots use the fictional demo accounts. If they don't exist yet, create them first. The seed adds missing records only and refuses every database except `luxurystay_dev`.

```powershell
cd server
$env:SEED_DEMO_PASSWORD = "<choose a password for the demo accounts>"
npm run seed:dev-demo
Remove-Item Env:SEED_DEMO_PASSWORD
```

### 3. Capture the screenshots

The demo password is read from `server\.env.demo-accounts`, a local file ignored by Git. It is never written into the screenshots or any other file.

```powershell
cd documentation\tools
$env:DEMO_PW = ((Get-Content ..\..\server\.env.demo-accounts | Select-String '^SEED_DEMO_PASSWORD=').Line -split '=',2)[1]
$env:WALK_BASE = "http://localhost:5173"
node capture-screenshots.js screenshot-plan.js ..\screenshots
Remove-Item Env:DEMO_PW, Env:WALK_BASE
```

The plan (`screenshot-plan.js`) signs in as the demo administrator, manager, receptionist, housekeeping and guest accounts. The demo administrator (`zainab.mirza@demo.luxurystay.test`) is created with `npm run create-admin`, using the same demo password. It opens forms and dialogs but never submits them, so no data changes. Look through the new images before using them.

### 4. Draw the diagrams

```powershell
cd documentation\tools
node diagrams.js ..\diagrams
```

The diagrams load the Fraunces and DM Sans fonts from Google Fonts, so an internet connection is needed.

### 5. Build the Word document and export the PDF

```powershell
cd documentation\tools
node build-docx.js           # writes ..\LuxuryStay_HMS_Documentation.docx (condensed edition)
# node build-docx-full.js    # optional: the full 88-page edition, written to ..\archive\LuxuryStay_HMS_Documentation_full.docx
cscript //nologo export-pdf.js
```

`export-pdf.js` opens the document in Word, updates the table of contents, list of figures, list of tables and page numbers, saves the `.docx`, and exports the matching PDF.

**Run `build-docx.js` only to regenerate from scratch: it overwrites the `.docx`, including any text you added in Word.** After editing the document in Word, run only `export-pdf.js`, or update the fields in Word (select all, then F9) and export the PDF from Word.

## Notes

- Fonts: the Word and PDF files use **Georgia** for headings and **Segoe UI** for body text. Both ship with Windows and are close to the website's Fraunces and DM Sans, which are not installed on the PC that built the document.
- Diagrams are placed on landscape pages so that their text stays readable when printed. `diagrams/05b-database-collections-detail.png` lists every field of every collection. It is too detailed to print legibly inside the document, but it can be opened on its own.
- Screens that could not be captured, and why, are listed in Section 23.8 of the archived full edition. The condensed report's screenshots and their sources are described in Chapter 12.
