# LuxuryStay HMS — Hotel Management System

LuxuryStay HMS is a web application for running a single hotel. It provides:

- a **public website** where visitors browse the room types and check availability;
- a **guest portal** where guests request and manage reservations;
- a **staff workspace** for the front desk, housekeeping, management and administration.

It is a MERN-stack project: MongoDB with Mongoose, Express on Node.js, and a React single-page application built with Vite.

Full project documentation (an academic report) is in [`documentation/`](documentation/README.md).

---

## Contents

1. [Project team](#project-team)
2. [GitHub repository](#github-repository)
3. [Features](#features)
4. [Technology stack](#technology-stack)
5. [Roles and permissions](#roles-and-permissions)
6. [Prerequisites](#prerequisites)
7. [Installation](#installation)
8. [Environment variables](#environment-variables)
9. [Databases](#databases)
10. [Running locally](#running-locally)
11. [Demo data and demo accounts](#demo-data-and-demo-accounts)
12. [Supervisor demo accounts](#supervisor-demo-accounts)
13. [Signing in, registering and recovering a password](#signing-in-registering-and-recovering-a-password)
14. [Creating staff accounts](#creating-staff-accounts)
15. [API overview](#api-overview)
16. [Authentication and authorization](#authentication-and-authorization)
17. [Validation rules](#validation-rules)
18. [Identity documents](#identity-documents)
19. [Testing](#testing)
20. [Production build](#production-build)
21. [Security notes](#security-notes)
22. [Known limitations](#known-limitations)
23. [Troubleshooting](#troubleshooting)
24. [Project structure](#project-structure)
25. [Git: first commit and push](#git-first-commit-and-push)

---

## Project team

| No. | Student ID | Name |
|---|---|---|
| 1 | Student1561115 | MUHAMMAD TALHA |
| 2 | Student1561444 | RAJA HARIS |
| 3 | Student1572235 | NIBRAS KHAN |
| 4 | Student1547456 | AYESHA |
| 5 | Student1550000 | MUHAMMAD AHMED |
| 6 | Student1551197 | YASH RAJ |

The names and student IDs are as recorded in the project report (`documentation/LuxuryStay_HMS_Documentation.docx`).

---

## GitHub repository

| Item | Value |
|---|---|
| Repository | [github.com/Ayesha-dev18/LuxuryStay-HMS](https://github.com/Ayesha-dev18/LuxuryStay-HMS) |
| Owner | `Ayesha-dev18` |
| Visibility | **Private** |
| Default branch | `main` |

The repository is private, so only its owner and invited collaborators can open it. To review the code, the supervisor needs **collaborator access**:

1. The owner opens the repository on GitHub, then **Settings → Collaborators → Add people**.
2. The owner enters the supervisor's GitHub username or email and sends the invitation.
3. The supervisor accepts the invitation from the email or from [github.com/notifications](https://github.com/notifications), and can then view and clone the repository.

**Read** access is enough to review the code. Login passwords for the demo accounts are not stored in the repository; they are handed over separately (see [Supervisor demo accounts](#supervisor-demo-accounts)).

---

## Features

Everything below is implemented in the source code.

- **Public website:**
  - room types (Serene Room, Signature Suite, Royal Residence), with prices and amenities read from the database;
  - an availability search;
  - room-type pages;
  - an enquiry form.
- **Guest portal:**
  - request a stay with an identity-document upload;
  - follow the request; change or cancel it while it is pending;
  - view bookings and invoices;
  - review a completed stay;
  - update the profile and password.
- **Front desk:**
  - review online requests (confirm, or reject with a reason);
  - create reservations at the desk;
  - check guests in and out;
  - record payments (cash, card, bank transfer), add extra charges, apply discounts (managers);
  - print numbered invoices.
- **Rooms and housekeeping:**
  - room inventory with statuses;
  - a cleaning queue filled by check-outs; a housekeeper starts a room (marked "Yours") and marks it clean;
  - maintenance tasks that take a room out of service until completed.
- **Management:**
  - a dashboard and period reports: revenue, occupancy, reservations, average nightly rate and guest rating;
  - review moderation;
  - website enquiries.
- **Administration:**
  - staff accounts (create, edit, assign a role, activate or deactivate; search and filter by role and status);
  - guest-account activation;
  - hotel settings (tax rate, check-in and check-out times, maximum stay, contact details).
- **Notifications:** in-app only. They expire after 60 days.
- **Double booking is prevented by the database:** a unique index on `(room, night)` in `roomnights`.
- **Layout:**
  - responsive from phone to desktop;
  - light and dark themes;
  - respects the operating system's reduced-motion setting.

## Technology stack

The versions are the ranges declared in the `package.json` files. The software installed on the development machine is listed separately below.

| Layer | Technology |
|---|---|
| Runtime | Node.js (developed and tested on 24.15.0) |
| API | Express ^5.2.1, Mongoose ^9.10.1, zod ^4.6.7, jsonwebtoken ^9.0.3, bcryptjs ^3.0.3, helmet ^8.3.0, cors ^2.8.6, express-rate-limit ^8.7.1, multer ^2.4.0, nodemailer ^10.1.0, tesseract.js ^5.1.1, dotenv ^18.0.0 |
| Database | MongoDB (developed and tested on 8.2.12, standalone; no replica set needed) |
| Client | React ^19.2.8, React Router ^7.18.4, Framer Motion ^13.4.0, lucide-react ^1.47.0, Vite ^8.3.0 |
| Tooling | nodemon, oxlint, Node's built-in test runner |

`axios` and `react-icons` are listed in `client/package.json` but are not imported anywhere.

## Roles and permissions

There are five roles. Each one is enforced by the API on every request; the client only hides what a role cannot use. The single source of truth is [`server/config/permissions.js`](server/config/permissions.js).

| Capability | Admin | Manager | Receptionist | Housekeeping | Guest |
|---|:-:|:-:|:-:|:-:|:-:|
| Own reservations, invoices, reviews, profile | | | | | ✓ |
| View, create, confirm or reject, change and cancel reservations | ✓ | ✓ | ✓ | | |
| Check in and check out | ✓ | ✓ | ✓ | | |
| Billing: view folios, record payments, add charges | ✓ | ✓ | ✓ | | own invoice |
| Apply discounts | ✓ | ✓ | | | |
| View rooms | ✓ | ✓ | ✓ | ✓ | public room types |
| Add, edit and retire rooms | ✓ | ✓ | | | |
| Change room status by hand | ✓ | ✓ | ✓ | | |
| Cleaning queue | ✓ | ✓ | | ✓ | |
| Report maintenance | ✓ | ✓ | ✓ | ✓ | |
| Start and complete maintenance | ✓ | ✓ | | ✓ | |
| Guest directory | ✓ | ✓ | ✓ | | |
| Website enquiries | ✓ | ✓ | ✓ | | |
| Dashboard reports, review moderation | ✓ | ✓ | | | |
| View the staff list | ✓ | ✓ | | | |
| Create and edit staff; activate or deactivate accounts | ✓ | | | | |
| Hotel settings | ✓ | | | | |

**Where each role lands after signing in.** Administrators and managers go to `/admin`, receptionists and housekeeping to `/staff`, and guests to `/guest`. If someone opens another role's area, they are redirected to the same page in their own area.

**Registration** always creates a guest; a role sent by the client is rejected. Staff accounts are created only by an administrator. Nobody can change their own role or status, and the last active administrator cannot be demoted or deactivated.

**Legacy role:** a `staff` role (combined front desk and housekeeping) still exists for older accounts. It cannot be assigned to new accounts.

## Prerequisites

- Node.js 20 or newer (24 recommended) with npm
- MongoDB running locally (`mongodb://127.0.0.1:27017`) or a hosted MongoDB URI
- Optional:
  - a Gmail account with an **app password**, or another SMTP account, for password-reset email;
  - internet access the first time a CNIC image is checked (the OCR engine downloads its English language data once, into `server/.ocr-cache`).

## Installation

There is no `package.json` at the project root. The API (`server/`) and the website (`client/`) are separate Node projects, so install the dependencies in each folder:

```powershell
git clone https://github.com/Ayesha-dev18/LuxuryStay-HMS.git
cd LuxuryStay-HMS

cd server
npm install
Copy-Item .env.example .env      # then edit server\.env (see below)

cd ..\client
npm install
# client\.env is only needed if the API is not at http://localhost:5000/api
```

Then create the database indexes the server requires. The command only runs when the database name you pass with `--confirm` matches the one in `MONGO_URI`:

```powershell
cd server
npm run db:indexes -- --confirm=luxurystay_dev
```

## Environment variables

`server/.env`. Copy it from [`server/.env.example`](server/.env.example) and never commit it.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGO_URI` | yes | | Connection string **including the database name**, for example `mongodb://127.0.0.1:27017/luxurystay_dev` |
| `EXPECTED_DB_NAME` | recommended | | The database the server must be connected to; the server refuses to start on any other |
| `JWT_SECRET` | yes | | At least 32 random characters; the server refuses to start with a shorter one |
| `JWT_EXPIRES_IN` | no | `12h` | Session lifetime |
| `PORT` | no | `5000` | API port |
| `NODE_ENV` | no | `development` | `production` when deployed |
| `CLIENT_URL` | no | `http://localhost:5173` | Client address, used for CORS and in password-reset links |
| `CORS_ORIGINS` | no | `CLIENT_URL` | Comma-separated allowed origins |
| `HOTEL_TIMEZONE` | no | `Asia/Karachi` | Calendar used for stay dates |
| `MAX_STAY_NIGHTS`, `MAX_ADVANCE_DAYS` | no | `30`, `365` | Booking limits |
| `EMAIL_USER`, `EMAIL_APP_PASSWORD` | for reset email | | Gmail address and its 16-letter app password |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | no | Gmail | Sender name, or another SMTP provider |
| `RESET_TOKEN_MINUTES` | no | `30` | Lifetime of a reset link |
| `DOCUMENT_KEY` | for document uploads | | At least 32 random characters; encrypts identity documents (see [Identity documents](#identity-documents)) |
| `UPLOAD_DIR`, `OCR_TIMEOUT_MS` | no | `server/uploads/identity`, `20000` | Upload folder, OCR time limit |
| `TRUST_PROXY` | no | | Set when running behind a reverse proxy |
| `LEDGER_REPAIR_ON_START` | no | `false` | Let start-up repair the room-night ledger instead of only reporting |

To generate a secret for `JWT_SECRET` or `DOCUMENT_KEY`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`client/.env` (optional): `VITE_API_URL=http://localhost:5000/api`.

## Databases

| Database | Use |
|---|---|
| `luxurystay` | production; never used for development, demo data or tests |
| `luxurystay_dev` | development and demonstration (`MONGO_URI` and `EXPECTED_DB_NAME` in `server/.env`) |
| `<name>_test` | automated tests; each test file drops and recreates it |

Safety measures in the code:

- The server stops at start-up if the database name differs from `EXPECTED_DB_NAME`, or if a required index is missing.
- `npm run create-admin`, `npm run seed:dev-rooms` and `npm run seed:dev-demo` print the database they are connected to. They refuse `luxurystay` and `luxurystay_test`, and refuse any database that doesn't match `EXPECTED_DB_NAME`.
- The test helpers refuse to clean up any database whose name doesn't end in `_test`.

## Running locally

Start MongoDB, then use two terminals. `npm run dev` runs `nodemon server.js` in `server/` and `vite` in `client/`:

```powershell
# Terminal 1: API on http://localhost:5000
cd server
npm run dev

# Terminal 2: website on http://localhost:5173
cd client
npm run dev
```

Check `http://localhost:5000/api/health`. Outside production it returns `{"success":true,"database":"connected","databaseName":"luxurystay_dev"}`.

`server/.env` is read only when the API starts. After changing it, restart the API: Ctrl+C, then `npm run dev`, or type `rs` in the nodemon terminal.

## Demo data and demo accounts

All demo people are fictional. Their email addresses end in `@demo.luxurystay.test`, and their CNIC numbers start with `00000`, which no real CNIC does.

**Creating the demo data (development only).** The seed:

- runs only on `luxurystay_dev`;
- only adds records that are missing, and never changes or deletes existing ones;
- needs `SEED_DEMO_PASSWORD` only when demo accounts still have to be created.

```powershell
cd server
$env:SEED_DEMO_PASSWORD = "<choose a password: 8+ characters with a letter and a number>"
npm run seed:dev-demo
Remove-Item Env:SEED_DEMO_PASSWORD
```

**Getting the demo password.** On the machine where the demo data was created, the password is kept in `server/.env.demo-accounts`, a local file ignored by Git (`.env.*`). Open it locally to read `SEED_DEMO_PASSWORD`. Never commit it or paste it anywhere. On a new machine the file doesn't exist: run the seed with a password of your own, and keep it in that file if you like.

**Demo accounts verified in `luxurystay_dev` on 15 October 2026.** Each was signed in through the API, except the deactivated one, which was correctly refused:

| Role | Demo email | Status |
|---|---|---|
| Admin | `zainab.mirza@demo.luxurystay.test` | active |
| Manager | `hamza.siddiqui@demo.luxurystay.test` | active |
| Receptionist | `sana.malik@demo.luxurystay.test`, `usman.tariq@demo.luxurystay.test` | active |
| Receptionist | `rehan.akhtar@demo.luxurystay.test` | **deactivated** (used to test deactivation) |
| Housekeeping | `imran.qureshi@demo.luxurystay.test`, `nadia.bibi@demo.luxurystay.test` | active |
| Guest | `amina.khan@demo.luxurystay.test` and 11 more (`omar.farooq`, `hina.aslam`, `tariq.jameel`, `zara.sheikh`, `bilal.ahmed`, `mahnoor.riaz`, `fatima.noor`, `ali.raza`, `daniel.brooks`, `sofia.rossi`, `kenji.sato`, all `@demo.luxurystay.test`) | active |

All demo accounts share the one demo password. The demo administrator is created by `create-admin`, not by the seed:

```powershell
cd server
$env:ADMIN_EMAIL = "zainab.mirza@demo.luxurystay.test"
$env:ADMIN_NAME = "Zainab Mirza"
$env:ADMIN_PASSWORD = "<the demo password>"
npm run create-admin
Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_NAME, Env:ADMIN_PASSWORD
```

**Fixing a demo account.**

- To re-activate one: sign in as the demo administrator, open **Staff**, choose **Edit** and turn on **Account active**.
- If a demo password is unknown, an administrator can set a new one under **Staff → Edit → Set a new password**.
- Accounts that are not fictional `@demo.luxurystay.test` accounts are not covered by the demo password, including the project owner's administrator account. Their passwords are not documented here and must not be changed for testing.

## Supervisor demo accounts

These sign-ins, one for each role, are for the supervisor's review of the **local development environment**: the development database `luxurystay_dev`, with the website on `http://localhost:5173/auth`. None of them is a production account; the production database `luxurystay` is never used for demonstrations. All five were confirmed to exist in `luxurystay_dev` with the roles shown, and were active on 15 October 2026. The Administrator account was re-checked on the same day: role `admin`, active, not locked.

| Role | Email | Permissions |
|---|---|---|
| Administrator | `zainab.mirza@demo.luxurystay.test` (fictional demo administrator, local development only) | Full administration, staff management, settings, reports and system oversight |
| Manager | `Arif.siddiqui@demo.luxurystay.test` | Front-desk operations, rooms, housekeeping oversight, reports, discounts, reviews and staff-list access |
| Receptionist | `tariq@luxury.com` | Reservations, check-in and check-out, payments, invoices, enquiries, guest directory and room status |
| Housekeeping | `nadia@demo.luxurystay.test` | Cleaning tasks, room cleaning status and maintenance tasks |
| Guest | `ab@luxurystay.com` | Own reservations, invoices, reviews and profile management |

**Passwords are not included in this README.** They are handed over privately in `DEMO_CREDENTIALS.md`, a local file that `.gitignore` excludes, so it is never committed or pushed.

The Administrator sign-in is the fictional demo administrator created with `npm run create-admin` (see [Demo data and demo accounts](#demo-data-and-demo-accounts)). It exists only in `luxurystay_dev`. The project owner's own administrator account is not part of the handover.

Email addresses are stored in lower case, so `Arif.siddiqui@demo.luxurystay.test` can be typed with either capitalisation. The permissions above follow `server/config/permissions.js` (see [Roles and permissions](#roles-and-permissions)).

## Signing in, registering and recovering a password

- **Sign in:** `http://localhost:5173/auth`. After 8 failed attempts, the account is locked for 15 minutes.
- **Register:** **Create a guest account** on the same page. This always creates a guest.
- **Forgot password:** `http://localhost:5173/forgot-password` emails a single-use link that expires after 30 minutes.
  - This needs `EMAIL_USER` and `EMAIL_APP_PASSWORD` (or SMTP settings), and the API must be restarted after setting them.
  - If email isn't configured, or the provider rejects the login, the page says "Password reset email is unavailable right now". It never claims an email was sent when it wasn't.
- **Sign out:** the account menu at the bottom of the sidebar. Signing out revokes the token on the server.

## Creating staff accounts

1. Sign in as an administrator and open **Staff** (`/admin/staff`).
2. Choose **Add staff member**. Enter the full name (3+ characters), email, optional phone, the role (Administrator, Manager, Receptionist or Housekeeping) and a temporary password.
3. Give the person their temporary password. They change it under **Profile**.
4. To change the role or deactivate the account later, use **Edit**. Changing a role, status or password signs that person out everywhere. Accounts are never deleted, so their history is kept.

**The first administrator** of a new database is created from the command line. The password is read from the environment and is never stored or printed:

```powershell
cd server
$env:ADMIN_EMAIL = "you@example.com"; $env:ADMIN_NAME = "Your Name"; $env:ADMIN_PASSWORD = "<strong password>"
npm run create-admin
Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_NAME, Env:ADMIN_PASSWORD
```

## API overview

The base path is `/api`. All bodies are JSON, except reservation requests with documents, which use multipart form data.

- Signed-in requests send `Authorization: Bearer <token>`.
- Errors return `{ "success": false, "message": "…" }`; validation errors also include `errors: [{ field, message }]`.
- Status codes: 401 for a missing, invalid or revoked token; 403 for a missing permission; 404 for a record you cannot see or that doesn't exist.

"Access" lists the permission each endpoint requires, from `server/config/permissions.js`.

| Method | Path | Access |
|---|---|---|
| GET | `/api/health` | public |
| POST | `/api/auth/register` | public, rate-limited |
| POST | `/api/auth/login` | public, rate-limited |
| POST | `/api/auth/logout` | signed in; ownership checked in the handler |
| GET | `/api/auth/me` | signed in; ownership checked in the handler |
| PUT | `/api/auth/me` | signed in; ownership checked in the handler |
| PUT | `/api/auth/change-password` | signed in; ownership checked in the handler |
| POST | `/api/auth/forgot-password` | public, rate-limited |
| POST | `/api/auth/reset-password/validate` | public, rate-limited |
| POST | `/api/auth/reset-password` | public, rate-limited |
| GET | `/api/bookings/availability` | `bookings:own` or `bookings:create` or `bookings:edit` |
| POST | `/api/bookings` | `bookings:own` or `bookings:create` |
| GET | `/api/bookings/my-bookings` | `bookings:own` |
| GET | `/api/bookings` | `bookings:view` |
| GET | `/api/bookings/:id` | signed in; ownership checked in the handler |
| PATCH | `/api/bookings/:id` | `bookings:own` or `bookings:edit` |
| PATCH | `/api/bookings/:id/confirm` | `bookings:review` |
| PATCH | `/api/bookings/:id/reject` | `bookings:review` |
| PATCH | `/api/bookings/:id/cancel` | `bookings:own` or `bookings:cancel` |
| PATCH | `/api/bookings/:id/check-in` | `bookings:checkin` |
| PATCH | `/api/bookings/:id/check-out` | `bookings:checkout` |
| POST | `/api/bookings/:id/payments` | `billing:payment` |
| POST | `/api/bookings/:id/charges` | `billing:charges` |
| DELETE | `/api/bookings/:id/charges/:chargeId` | `billing:charges` |
| PATCH | `/api/bookings/:id/discount` | `billing:discount` |
| GET | `/api/bookings/:id/invoice` | signed in; ownership checked in the handler |
| GET | `/api/bookings/:id/documents/:side` | signed in; ownership checked in the handler |
| POST | `/api/contact` | public, rate-limited |
| GET | `/api/contact` | `contact:manage` |
| PATCH | `/api/contact/:id/status` | `contact:manage` |
| POST | `/api/feedback` | `feedback:own` |
| GET | `/api/feedback/my` | `feedback:own` |
| GET | `/api/feedback` | `feedback:manage` |
| PATCH | `/api/feedback/:id/review` | `feedback:manage` |
| GET | `/api/maintenance` | `maintenance:view` |
| POST | `/api/maintenance` | `maintenance:report` |
| PATCH | `/api/maintenance/:id/start` | `maintenance:update` |
| PATCH | `/api/maintenance/:id/complete` | `maintenance:update` |
| GET | `/api/notifications` | signed in; ownership checked in the handler |
| PATCH | `/api/notifications/read-all` | signed in; ownership checked in the handler |
| PATCH | `/api/notifications/:id/read` | signed in; ownership checked in the handler |
| GET | `/api/public/hotel` | public |
| GET | `/api/public/rooms` | public |
| GET | `/api/reports/overview` | `reports:view` |
| GET | `/api/reports/front-desk` | `frontdesk:view` |
| GET | `/api/reports/finance` | `billing:view` |
| GET | `/api/rooms` | signed in; ownership checked in the handler |
| GET | `/api/rooms/housekeeping` | `housekeeping:manage` |
| PATCH | `/api/rooms/housekeeping/:id/start` | `housekeeping:manage` |
| PATCH | `/api/rooms/housekeeping/:id/complete` | `housekeeping:manage` |
| POST | `/api/rooms` | `rooms:manage` |
| PUT | `/api/rooms/:id` | `rooms:manage` |
| PATCH | `/api/rooms/:id/status` | `rooms:status` |
| DELETE | `/api/rooms/:id` | `rooms:manage` |
| GET | `/api/settings` | signed in; ownership checked in the handler |
| PUT | `/api/settings` | `settings:manage` |
| GET | `/api/users/staff` | `staff:view` |
| POST | `/api/users/staff` | `staff:manage` |
| GET | `/api/users/guests` | `guests:view` |
| PATCH | `/api/users/:id` | `staff:manage` or `guests:manage` |

## Authentication and authorization

- **Passwords** are hashed with bcrypt (12 rounds) and are never returned by the API.
- **Sessions** are JWTs signed with HS256. They expire after `JWT_EXPIRES_IN` and carry a token version.
  - Signing out, changing or resetting a password, a role change or deactivation increases the version, which ends every existing session.
  - Every request reloads the account, so a deactivated account stops working immediately.
- **Authorization:**
  - each protected route declares a permission;
  - handlers also check ownership, so a guest can only reach their own bookings, invoices and documents;
  - the client's route guards only shape the interface.
- **Lockout and rate limits:**
  - 8 failed sign-ins lock the account for 15 minutes;
  - per-client rate limits apply to the whole API (1,500 requests per 15 minutes), sign-in (10 failures per 15 minutes), registration (10 per hour), reset requests (5 per 15 minutes), reset-token checks (15 per 15 minutes) and enquiries (8 per hour).
- **Request safety:**
  - `helmet` security headers;
  - a CORS allow-list;
  - JSON bodies limited to 100 kb;
  - strict zod schemas (unknown fields are rejected);
  - keys that could be used for operator injection are rejected;
  - error responses never include stack traces.

## Validation rules

The client and the server apply the same rules; the server always validates again.

| Field | Rule |
|---|---|
| Account name: registration, profile, staff accounts, `create-admin` | **3 to 80 characters** after trimming; must start with a letter; letters, numbers, spaces and `. ' ’ -` only. One or two characters, or only spaces, are rejected with "Name must be at least 3 characters." |
| Guest name on a reservation, name on an enquiry | 2 to 80 characters, same character rule. These are real people's names, some of which have only two letters. |
| Email | valid address; stored in lower case; unique per account (a duplicate gives 409) |
| Password | 8 to 72 characters with at least one letter and one number. The client also requires the confirmation to match. |
| Phone | 7 to 15 digits, optional leading `+` (spaces and dashes are ignored) |
| CNIC | 13 digits, with or without dashes (`42101-1234567-1`) |
| Passport | 6 to 12 letters and digits |
| Stay | check-out after check-in, not in the past, at most `MAX_STAY_NIGHTS` nights and `MAX_ADVANCE_DAYS` ahead; guests within the room's capacity |

There is no separate username: people sign in with their email address, and the "Full name" field is the account name.

## Identity documents

- **What guests upload:** guests booking online upload a CNIC (front and back) or a passport, as JPG, PNG, WebP or PDF, up to 5 MB each and at most 2 files. The server checks each file's real signature.
- **The CNIC check:** for a CNIC, a local OCR engine (tesseract.js) compares the typed number with the number on the image. The outcome (`number-matched`, `number-mismatch`, `unreadable` or `error`) is recorded for staff. **It never confirms a booking by itself:** every online request is confirmed by a member of staff, and approving a mismatch requires a note.
- **Not official verification:** this project is not connected to NADRA or any official identity service.
- **Storage:** files are encrypted on disk with AES-256-GCM (files begin with an `LSENC1` marker) and can be opened only by front-desk staff or the booking's owner. Each viewing is logged without the content.
- **Without `DOCUMENT_KEY`:** online requests with documents are refused with 503, and nothing is stored unencrypted. To enable uploads, generate a key (see above), put it in `server/.env` as `DOCUMENT_KEY=…`, and restart the API.
  - Back the key up securely: documents encrypted with it cannot be opened without it.
  - Never commit or print it.

## Testing

**Backend.** Node's built-in test runner, 12 suites, 103 tests.

- Each test file drops and recreates `<name>_test`, where the name comes from `MONGO_URI`.
- To leave `luxurystay_test` untouched as well, point the tests at a throwaway database:

```powershell
cd server
$env:MONGO_URI = "mongodb://127.0.0.1:27017/lsverify"   # tests then use lsverify_test
npm test
Remove-Item Env:MONGO_URI
```

**Client:**

```powershell
cd client
npm run lint
npm run build
```

**Manual browser testing against a separate API.** `npm run start:test` starts an API on port 5055. It is forced onto the test database, uses a temporary upload folder and a test document key, and has email switched off.

### Results (15 October 2026)

| Check | Result |
|---|---|
| `npm test` on the isolated database `lsverify_test` | **103 tests: 103 passed, 0 failed, 0 skipped.** Document counts in `luxurystay_dev` and `luxurystay_test` were the same before and after. |
| New regression suite `registration.test.js` | 5 of 5 passed: 1- and 2-character names and blank names rejected; 3+ characters accepted; invalid characters rejected; duplicate email gives 409; profile and staff names follow the same rule |
| `npm run lint` (client) | 0 errors, 31 warnings (`react(set-state-in-effect)`) |
| `npm run build` (client) | passed |
| Browser end-to-end tests (headless Edge, isolated stack: frontend 5199 → API 5055 → `lsverify_test`) | All journeys completed: public pages and images, registration validation (1, 2 and 3 characters, invalid characters, password mismatch), registration, sign-in, sign-out, password-recovery refusal with email off, guest booking with a passport upload (stored encrypted), staff confirmation, desk reservation, check-in, payment, check-out, cleaning, maintenance, adding a room, review moderation, enquiries, staff creation, edit and deactivation, settings, guest review and cancellation. Roles calling APIs outside their permissions got 403 in every case tried. Three script mistakes (wrong labels) were corrected and those steps re-run; no application defect was found. |
| Responsive check | 13 pages for 4 roles at 390 px and 820 px: no horizontal overflow, no console errors |
| Development stack (`luxurystay_dev`) | Each role's demo account signed in through the API; the deactivated account was refused; the development API rejects a 2-character name |

**Not covered:** Firefox, Safari and real phones; load testing; automated frontend unit tests.

## Production build

```powershell
cd client
$env:VITE_API_URL = "https://<your api host>/api"; npm run build   # static files in client/dist

cd ..\server
# NODE_ENV=production, strong JWT_SECRET, real CLIENT_URL/CORS_ORIGINS, EXPECTED_DB_NAME=luxurystay
npm start
```

- Serve `client/dist` with a fallback to `index.html` for client-side routes.
- Use HTTPS for both the client and the API.
- Set `TRUST_PROXY` behind a reverse proxy.

## Security notes

- **Never commit:**
  - `DEMO_CREDENTIALS.md`, the private list of demo login passwords;
  - `.env` files (`server/.env`, `server/.env.*` except `.env.example`), which includes `server/.env.demo-accounts`;
  - `server/uploads/`;
  - the `database/` exports, which contain personal data and password hashes.

  `.gitignore` excludes all of these.
- **Keep secrets out of logs and screenshots:** `JWT_SECRET`, `DOCUMENT_KEY`, `EMAIL_APP_PASSWORD` and database credentials live only in `server/.env`. The server never prints them.
- **If a secret is exposed:** rotate it. A new `JWT_SECRET` signs everyone out; a new `DOCUMENT_KEY` makes existing documents unreadable unless they are re-encrypted.
- **Back up together:** MongoDB, `server/uploads/identity/` and `DOCUMENT_KEY` belong together, and the backups hold personal data.

## Known limitations

- **Payments and messages:**
  - payments are recorded by staff; there is no payment gateway;
  - email is used only for password reset; there are no booking or invoice emails, and no SMS.
- **Identity documents:**
  - online requests with documents need `DOCUMENT_KEY` (refused without it);
  - the CNIC check is a number comparison only: it cannot detect a forged card, and PDFs are not read by OCR;
  - the first OCR check downloads language data, so it needs internet access once.
- **Booking workflow:**
  - pending requests hold their nights until staff decide them; there is no automatic expiry or no-show handling;
  - housekeeping has no "inspected" step and no manager-assigned cleaning; rooms are claimed by whoever starts them;
  - there is no separate form for the front desk to log walk-in enquiries (enquiries come from the website form).
- **Content and reporting:**
  - room photos are bundled with the client per room type; rooms of one type share them;
  - reports can be printed but not exported;
  - no full audit log (the staff list shows last sign-in only).
- **Product scope and quality:**
  - single hotel, single currency symbol;
  - 31 lint warnings remain;
  - no automated frontend tests.
- **Demo data:** dates are fixed relative to the day of the first seed, so demo arrivals become overdue as time passes.

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| Website says "Unable to reach the server" | The API isn't running, or `VITE_API_URL` points to the wrong port. Start `npm run dev` in `server`, check `/api/health`, then hard-reload the page. |
| Sign-in shows a guest dashboard unexpectedly | A cached session from another account. It is replaced once the API responds; sign out, or clear the site's local storage. |
| API refuses to start: "Unexpected database" | `MONGO_URI` and `EXPECTED_DB_NAME` disagree. Fix `server/.env`. |
| API refuses to start: missing index | Run `npm run db:indexes -- --confirm=<database name>`. |
| "Password reset email is unavailable right now" | Email isn't configured, or Gmail rejected the login (wrong value or not an app password). Set `EMAIL_USER` and `EMAIL_APP_PASSWORD`, then restart the API. |
| "Too many failed sign-in attempts" | The account is locked for 15 minutes. Wait, or reset the password. |
| Booking with a document fails with 503 | `DOCUMENT_KEY` isn't set. See [Identity documents](#identity-documents). |
| `npm run create-admin` or a seed says "Refused" | The database is protected or doesn't match `EXPECTED_DB_NAME`. This is intentional; check `server/.env`. |
| Port already in use | Another `npm run dev` is running. Close it (Ctrl+C) or end the old node process. |

## Project structure

```text
LuxuryStay-HMS/
├─ client/                    React + Vite application
│  ├─ index.html
│  └─ src/
│     ├─ App.jsx              routes and role areas (/, /auth, /guest, /staff, /admin)
│     ├─ pages/               website, auth, guest and staff pages
│     ├─ components/          app shell, booking panels and dialogs, site sections, UI kit
│     ├─ context/             session, permissions, settings, hotel data
│     ├─ lib/                 API client, validation rules, formatting, hooks
│     ├─ styles/              design tokens and styles
│     └─ assets/              hotel and room photographs
├─ server/                    Express API
│  ├─ app.js, server.js       application and start-up checks
│  ├─ config/                 environment and permission matrix
│  ├─ middleware/             auth, validation, rate limits, uploads, errors
│  ├─ models/                 12 Mongoose models
│  ├─ routes/                 11 routers
│  ├─ services/               availability ledger, identity, OCR, invoices, notifications, settings, DB safety
│  ├─ utils/                  billing, dates, mailer, schemas, logger
│  ├─ scripts/                create-admin, seeds, index and ledger commands, test server
│  └─ tests/                  12 test suites
├─ documentation/             project report (Word and PDF), screenshots, diagrams, build tools
└─ database/                  local data exports — personal data, ignored by Git
```

## Git: first commit and push

The project is a Git repository on branch `main`, connected to `origin` (`https://github.com/Ayesha-dev18/LuxuryStay-HMS.git`). The first commit (`996840f`) has been pushed. To publish later changes:

```powershell
cd C:\Users\ESHOP\Downloads\LuxuryStay-HMS
git status            # check: no .env files, DEMO_CREDENTIALS.md, database/, uploads/ or node_modules/
git add <changed files>
git diff --cached --stat
git commit -m "<message>"
git push
```

Before pushing, confirm that `git ls-files | Select-String -Pattern "\.env$|\.env\.|database/|uploads/|DEMO_CREDENTIALS"` lists only `server/.env.example` and `client/.env.example`. Never use `git add -f` on ignored files.
