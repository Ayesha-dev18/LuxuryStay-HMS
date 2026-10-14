// Generates the documentation diagrams as SVG/HTML and renders them to PNG
// with headless Edge. Every element reflects the actual source code.
//   node diagrams.js <outDir>
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const OUT = path.resolve(process.argv[2]);
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
fs.mkdirSync(OUT, { recursive: true });

const C = {
  forest: "#123C32", emerald: "#0B2923", ivory: "#F7F4EC", paper: "#FBF9F4",
  copper: "#B98256", copperDeep: "#8A5A35", stone: "#E8E1D5", charcoal: "#202722",
  muted: "#5E665F", line: "#7C857E", mint: "#E4ECE7",
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------------------------------------------------------- primitives
const text = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-family="${o.serif ? "Fraunces" : "DM Sans"}, sans-serif" font-size="${o.size || 15}" font-weight="${o.weight || 400}" fill="${o.fill || C.charcoal}" text-anchor="${o.anchor || "start"}"${o.italic ? ' font-style="italic"' : ""}${o.ls ? ` letter-spacing="${o.ls}"` : ""}>${esc(s)}</text>`;

const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 12}" fill="${o.fill || "#fff"}" stroke="${o.stroke || C.stone}" stroke-width="${o.sw || 1.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`;

// A line with an arrowhead at the end (and optionally at the start).
const arrow = (pts, o = {}) => {
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const color = o.color || C.line;
  const id = o.color === C.copper ? "ac" : o.color === C.forest ? "af" : "ag";
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${o.sw || 1.8}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""} marker-end="url(#${o.open ? "open" : id})"${o.both ? ` marker-start="url(#${id}s)"` : ""}/>`;
};

const label = (x, y, s, o = {}) => {
  const w = s.length * (o.size || 13) * 0.53 + 14;
  const ax = o.anchor === "start" ? x : o.anchor === "end" ? x - w : x - w / 2;
  return `<rect x="${ax}" y="${y - (o.size || 13) - 3}" width="${w}" height="${(o.size || 13) + 9}" rx="5" fill="${o.bg || C.paper}"/>` +
    text(ax + w / 2, y, s, { size: o.size || 13, fill: o.fill || C.muted, anchor: "middle", weight: o.weight || 500 });
};

const defs = `<defs>
  ${[["ag", C.line], ["ac", C.copper], ["af", C.forest]].map(([id, col]) => `
  <marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${col}"/></marker>
  <marker id="${id}s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${col}"/></marker>`).join("")}
  <marker id="open" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto"><path d="M0,0 L11,6 L0,12 z" fill="#fff" stroke="${C.forest}" stroke-width="1.4"/></marker>
  <filter id="sh" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#123C32" flood-opacity="0.10"/></filter>
</defs>`;

const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=block" rel="stylesheet">
<style>html,body{margin:0;padding:0;background:${C.paper}}svg{display:block}</style></head>
<body><svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}
<rect width="${w}" height="${h}" fill="${C.paper}"/>${body}</svg></body></html>`;

// A titled card with a list of lines.
const card = (x, y, w, title, lines, o = {}) => {
  const lh = o.lh || 22;
  const h = o.h || 52 + lines.length * lh + 10;
  let s = `<g filter="url(#sh)">${rect(x, y, w, h, { fill: o.fill || "#fff", stroke: o.stroke || C.stone, r: 14 })}</g>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="40" rx="14" fill="${o.head || C.forest}"/><rect x="${x}" y="${y + 26}" width="${w}" height="14" fill="${o.head || C.forest}"/>`;
  s += text(x + 16, y + 27, title, { size: o.titleSize || 17, weight: 600, fill: "#fff", serif: o.serifTitle !== false });
  lines.forEach((line, i) => {
    const t = typeof line === "string" ? { s: line } : line;
    s += text(x + 16, y + 66 + i * lh, t.s, { size: t.size || o.size || 14, fill: t.ref ? C.copperDeep : t.muted ? C.muted : C.charcoal, weight: t.bold ? 600 : 400 });
  });
  return { svg: s, h, x, y, w };
};

const render = (name, w, h, body) => {
  const html = path.join(OUT, "source", `${name}.html`);
  fs.mkdirSync(path.dirname(html), { recursive: true });
  fs.writeFileSync(html, page(w, h, body));
  const png = path.join(OUT, `${name}.png`);
  execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
    `--window-size=${w},${h}`, `--screenshot=${png}`, "--virtual-time-budget=6000", "--run-all-compositor-stages-before-draw",
    `--user-data-dir=${path.join(require("os").tmpdir(), "luxurystay-diagrams")}`, "file:///" + html.replace(/\\/g, "/")], { stdio: "ignore" });
  console.log("rendered", name);
};

// ============================================================ 1. architecture
(() => {
  const W = 1600, H = 940;
  let b = "";
  const tier = (x, w, t) => text(x, 46, t, { size: 13, weight: 700, fill: C.copperDeep, ls: 2.5 });
  b += tier(40, 380, "CLIENT TIER") + tier(470, 700, "APPLICATION TIER") + tier(1220, 340, "DATA AND EXTERNAL SERVICES");
  b += `<line x1="40" y1="58" x2="1560" y2="58" stroke="${C.copper}" stroke-width="1.2" opacity="0.5"/>`;

  // Client
  b += `<g filter="url(#sh)">${rect(40, 80, 380, 700, { fill: "#fff", r: 18 })}</g>`;
  b += text(62, 704, "Talks to the API over HTTP with JSON;", { size: 13, fill: C.muted });
  b += text(62, 724, "signed-in requests carry", { size: 13, fill: C.muted });
  b += text(62, 744, "Authorization: Bearer <JWT>.", { size: 13, fill: C.muted });
  b += text(62, 116, "Web browser", { serif: true, size: 22, weight: 600, fill: C.forest });
  b += text(62, 142, "React 19 single-page application, built with Vite 8", { size: 13.5, fill: C.muted });
  const areas = [
    ["Public website", "/   /rooms/:slug"],
    ["Authentication", "/auth  /forgot-password  /reset-password"],
    ["Guest portal", "/guest/*  (guest role)"],
    ["Staff workspace", "/admin/*  (administrator, manager)"],
    ["", "/staff/*  (receptionist, housekeeping)"],
  ];
  let yy = 166;
  areas.forEach(([t, s]) => {
    if (t) { b += rect(60, yy, 340, s.includes("admin") ? 82 : 58, { fill: C.mint, stroke: "#CFDDD5", r: 10 }); b += text(76, yy + 24, t, { size: 15, weight: 600, fill: C.forest }); b += text(76, yy + 45, s, { size: 13, fill: C.charcoal }); yy += s.includes("admin") ? 0 : 70; }
    else { b += text(76, yy + 66, s, { size: 13, fill: C.charcoal }); yy += 94; }
  });
  b += rect(60, 470, 340, 92, { fill: C.ivory, stroke: C.stone, r: 10 });
  b += text(76, 496, "lib/api.js", { size: 15, weight: 600, fill: C.forest });
  b += text(76, 518, "fetch wrapper for every API call", { size: 13 });
  b += text(76, 538, "Bearer JWT; session kept in localStorage", { size: 13 });
  b += rect(60, 574, 340, 92, { fill: C.ivory, stroke: C.stone, r: 10 });
  b += text(76, 600, "React Router 7 · Framer Motion", { size: 13.5, weight: 600, fill: C.forest });
  b += text(76, 622, "Role-based route guards (RequireArea,", { size: 13 });
  b += text(76, 642, "Allow) mirror the server's permissions", { size: 13 });

  // Application
  b += `<g filter="url(#sh)">${rect(470, 80, 700, 830, { fill: "#fff", r: 18 })}</g>`;
  b += text(492, 116, "LuxuryStay API", { serif: true, size: 22, weight: 600, fill: C.forest });
  b += text(492, 142, "Node.js 24 · Express 5 · port 5000 (PORT)", { size: 13.5, fill: C.muted });
  b += text(492, 176, "REQUEST PIPELINE (app.js)", { size: 12, weight: 700, fill: C.copperDeep, ls: 1.5 });
  const steps = [
    "helmet security headers",
    "CORS allow-list (CLIENT_URL / CORS_ORIGINS)",
    "JSON body ≤ 100 kb · unsafe-key rejection",
    "rate limiters (API, login, register, reset, contact)",
    "database-ready guard (503 while disconnected)",
    "11 routers under /api/*",
    "protect: JWT (HS256) + tokenVersion check",
    "requirePermission: role → permission matrix",
    "validate: strict zod schemas",
    "route handler",
    "central error handler (no stack traces to clients)",
  ];
  steps.forEach((s, i) => {
    const y = 192 + i * 64;
    b += rect(492, y, 336, 46, { fill: i === 9 ? C.forest : C.mint, stroke: i === 9 ? C.forest : "#CFDDD5", r: 9 });
    b += text(508, y + 28, s, { size: 13.5, weight: i === 9 ? 600 : 500, fill: i === 9 ? "#fff" : C.charcoal });
    if (i < steps.length - 1) b += arrow([[660, y + 46], [660, y + 63]], { color: C.forest, sw: 1.6 });
  });
  b += text(850, 176, "SERVICES AND UTILITIES", { size: 12, weight: 700, fill: C.copperDeep, ls: 1.5 });
  const services = [
    ["services/availability", "room-night ledger; no double booking"],
    ["services/identityLedger", "one document → one account; nights"],
    ["services/identityCheck + ocr", "local tesseract.js CNIC number check"],
    ["middleware/uploadMiddleware", "multer limits, file signatures, AES-256-GCM"],
    ["services/invoices", "atomic invoice numbers (counters)"],
    ["services/notify · settings", "notifications; hotel settings (read-only)"],
    ["utils/billing · dates", "folio arithmetic; hotel time zone"],
    ["utils/mailer", "nodemailer (Gmail or SMTP host)"],
    ["services/dbSafety", "start-up index and ledger checks"],
  ];
  services.forEach(([t, s], i) => {
    const y = 192 + i * 76;
    b += rect(848, y, 302, 60, { fill: C.ivory, stroke: C.stone, r: 9 });
    b += text(862, y + 25, t, { size: 13.5, weight: 600, fill: C.forest });
    b += text(862, y + 46, s, { size: 12.5, fill: C.charcoal });
  });
  b += arrow([[828, 855], [848, 855]], { color: C.copper });
  b += text(862, 892, "Route handlers call these services.", { size: 12.5, fill: C.muted });

  // Data
  b += `<g filter="url(#sh)">${rect(1220, 80, 340, 470, { fill: "#fff", r: 18 })}</g>`;
  b += text(1242, 116, "MongoDB 8.2", { serif: true, size: 22, weight: 600, fill: C.forest });
  b += text(1242, 142, "local server 127.0.0.1:27017 · Mongoose 9", { size: 13, fill: C.muted });
  [["luxurystay", "production (untouched by tests)"], ["luxurystay_dev", "development, demo data"], ["luxurystay_test", "automated tests only"]].forEach(([n, d], i) => {
    const y = 160 + i * 52;
    b += rect(1240, y, 300, 42, { fill: i === 1 ? C.mint : C.ivory, stroke: C.stone, r: 8 });
    b += text(1254, y + 18, n, { size: 13.5, weight: 600, fill: C.forest });
    b += text(1254, y + 35, d, { size: 12, fill: C.muted });
  });
  b += text(1242, 340, "12 collections", { size: 14, weight: 600, fill: C.copperDeep });
  ["users · rooms · bookings · roomnights", "identitydocuments · identitynights", "maintenances · feedbacks · contacts", "notifications · settings · counters"].forEach((s, i) => (b += text(1242, 366 + i * 22, s, { size: 13 })));
  b += text(1242, 470, "EXPECTED_DB_NAME pins the server", { size: 12.5, fill: C.muted });
  b += text(1242, 490, "to one database; start-up refuses a", { size: 12.5, fill: C.muted });
  b += text(1242, 510, "mismatch or a missing index.", { size: 12.5, fill: C.muted });

  b += `<g filter="url(#sh)">${rect(1220, 590, 340, 150, { fill: "#fff", r: 18 })}</g>`;
  b += text(1242, 624, "Upload directory", { serif: true, size: 19, weight: 600, fill: C.forest });
  b += text(1242, 650, "Identity-document images,", { size: 13 });
  b += text(1242, 670, "encrypted at rest (AES-256-GCM,", { size: 13 });
  b += text(1242, 690, "LSENC1 header) with DOCUMENT_KEY.", { size: 13 });
  b += text(1242, 714, "Served only to staff or the owner.", { size: 12.5, fill: C.muted });

  b += `<g filter="url(#sh)">${rect(1220, 780, 340, 120, { fill: "#fff", r: 18 })}</g>`;
  b += text(1242, 814, "Email provider", { serif: true, size: 19, weight: 600, fill: C.forest });
  b += text(1242, 840, "Gmail app password or SMTP host", { size: 13 });
  b += text(1242, 860, "Password-reset links only", { size: 13 });

  // Connections
  b += arrow([[420, 300], [470, 300]], { color: C.forest, both: true, sw: 2.2 });
  b += arrow([[1170, 300], [1220, 300]], { color: C.forest, both: true, sw: 2.2 });
  b += arrow([[1170, 664], [1220, 664]], { color: C.copper, sw: 2 });
  b += arrow([[1170, 840], [1220, 840]], { color: C.copper, sw: 2 });
  render("01-system-architecture", W, H, b);
})();

// ============================================================ 2. use cases
(() => {
  const W = 1600, H = 1000;
  let b = "";
  const actor = (x, y, name, sub) => {
    let s = `<g stroke="${C.forest}" stroke-width="2.4" fill="none" stroke-linecap="round"><circle cx="${x}" cy="${y}" r="15" fill="${C.ivory}"/><line x1="${x}" y1="${y + 15}" x2="${x}" y2="${y + 58}"/><line x1="${x - 26}" y1="${y + 30}" x2="${x + 26}" y2="${y + 30}"/><line x1="${x}" y1="${y + 58}" x2="${x - 20}" y2="${y + 90}"/><line x1="${x}" y1="${y + 58}" x2="${x + 20}" y2="${y + 90}"/></g>`;
    s += text(x, y + 116, name, { size: 16, weight: 600, anchor: "middle", fill: C.forest });
    if (sub) s += text(x, y + 136, sub, { size: 12, anchor: "middle", fill: C.muted });
    return s;
  };
  b += rect(250, 30, 1100, 940, { fill: "#fff", stroke: C.forest, sw: 2, r: 20 });
  b += text(800, 66, "LuxuryStay HMS", { serif: true, size: 24, weight: 600, anchor: "middle", fill: C.forest });

  const pkg = (x, y, title, cases) => {
    const rows = Math.ceil(cases.length / 2);
    const h = 52 + rows * 62;
    let s = rect(x, y, 500, h, { fill: C.paper, stroke: C.copper, r: 14, dash: "6 5" });
    s += text(x + 18, y + 30, title, { size: 15, weight: 700, fill: C.copperDeep });
    cases.forEach((c, i) => {
      const cx = x + 130 + (i % 2) * 240, cy = y + 74 + Math.floor(i / 2) * 62;
      s += `<ellipse cx="${cx}" cy="${cy}" rx="113" ry="25" fill="#fff" stroke="${C.forest}" stroke-width="1.6"/>`;
      const words = c.split("|");
      words.forEach((w, k) => (s += text(cx, cy + 5 - (words.length - 1) * 8 + k * 16, w, { size: 13, anchor: "middle" })));
    });
    return { s, h, y, x };
  };
  const left = [
    ["Public website", ["Browse room collection", "View room-type details", "Check availability", "Send an enquiry", "Register guest account", "Sign in / reset|password"]],
    ["Guest portal", ["Request reservation|with ID document", "Change or cancel own|pending request", "View own bookings|and invoices", "Review a completed stay", "Update profile|and password"]],
    ["Front desk", ["Create desk reservation", "Confirm or reject|requests", "Check in / check out", "Record payments|and charges", "Print invoices", "Set room status", "Answer enquiries", "Search guest directory"]],
  ];
  const right = [
    ["Administration", ["Create and edit|staff accounts", "Deactivate guest|accounts", "Edit hotel settings|(tax, times, contacts)"]],
    ["Management", ["View dashboard|and reports", "Add, edit and retire|rooms", "Apply folio discounts", "Moderate guest reviews", "View staff list"]],
    ["Housekeeping and maintenance", ["Work the cleaning|queue", "Report a maintenance|issue", "Start and complete|maintenance"]],
  ];
  let y = 92; const lp = left.map(([t, c]) => { const p = pkg(280, y, t, c); y += p.h + 22; return p; });
  y = 92; const rp = right.map(([t, c]) => { const p = pkg(820, y, t, c); y += p.h + 22; return p; });
  [...lp, ...rp].forEach((p) => (b += p.s));

  const la = [["Visitor", "not signed in"], ["Guest", "role: guest"], ["Receptionist", "role: receptionist"]];
  const ra = [["Administrator", "role: admin"], ["Manager", "role: manager"], ["Housekeeping", "role: housekeeping"]];
  la.forEach(([n, s], i) => { const p = lp[i]; const cy = p.y + p.h / 2 - 60; b += actor(120, cy, n, s); b += `<line x1="150" y1="${cy + 40}" x2="280" y2="${p.y + p.h / 2}" stroke="${C.forest}" stroke-width="1.6"/>`; });
  ra.forEach(([n, s], i) => { const p = rp[i]; const cy = p.y + p.h / 2 - 60; b += actor(1480, cy, n, s); b += `<line x1="1450" y1="${cy + 40}" x2="1320" y2="${p.y + p.h / 2}" stroke="${C.forest}" stroke-width="1.6"/>`; });

  // Generalisation (inherits permissions)
  const gy = (p) => p.y + p.h / 2 - 60;
  b += arrow([[120, gy(lp[1]) - 22], [120, gy(lp[0]) + 150]], { open: true, color: C.forest });
  b += arrow([[1480, gy(rp[1]) - 22], [1480, gy(rp[0]) + 150]], { open: true, color: C.forest });
  const note = 820 + 0, ny = rp[2].y + rp[2].h + 26;
  b += rect(note, ny, 500, 96, { fill: C.ivory, stroke: C.stone, r: 12 });
  b += text(note + 18, ny + 28, "Hollow arrows show inherited permissions:", { size: 13.5, weight: 600, fill: C.forest });
  b += text(note + 18, ny + 50, "a guest can do everything a visitor can; an administrator", { size: 13 });
  b += text(note + 18, ny + 70, "everything a manager can. A manager also holds every", { size: 13 });
  b += text(note + 18, ny + 88, "front-desk and housekeeping permission (config/permissions.js).", { size: 13 });
  render("02-use-case-diagram", W, H, b);
})();

// ============================================================ 3. DFD level 0
(() => {
  const W = 1600, H = 900;
  let b = "";
  const ent = (x, y, w, t, s) => rect(x, y, w, 76, { fill: C.forest, stroke: C.forest, r: 6 }) + text(x + w / 2, y + 34, t, { size: 17, weight: 600, anchor: "middle", fill: "#fff", serif: true }) + (s ? text(x + w / 2, y + 58, s, { size: 12.5, anchor: "middle", fill: "#D8E4DD" }) : "");
  b += `<circle cx="800" cy="440" r="170" fill="#fff" stroke="${C.copper}" stroke-width="3" filter="url(#sh)"/>`;
  b += text(800, 412, "0", { size: 18, weight: 700, anchor: "middle", fill: C.copperDeep });
  b += text(800, 446, "LuxuryStay HMS", { serif: true, size: 28, weight: 600, anchor: "middle", fill: C.forest });
  b += text(800, 476, "web application and API", { size: 14, anchor: "middle", fill: C.muted });

  b += ent(40, 160, 300, "Visitor / Guest", "public website and guest portal");
  b += ent(40, 620, 300, "Email provider", "Gmail or SMTP host");
  b += ent(1260, 110, 300, "Front-desk staff", "receptionist");
  b += ent(1260, 400, 300, "Housekeeping staff", "housekeeping");
  b += ent(1260, 690, 300, "Manager / Administrator", "manager, admin");

  const flow = (pts, lines, lx, ly, color = C.forest) => arrow(pts, { color }) + lines.map((l, i) => label(lx, ly + i * 20, l, { size: 12.5, fill: C.charcoal })).join("");
  b += flow([[340, 180], [690, 330]], ["registration, sign-in, reservation requests", "with ID images, reviews, enquiries"], 540, 196);
  b += flow([[650, 365], [340, 220]], ["availability and prices, booking status,", "invoices, notifications"], 470, 320, C.copper);
  b += flow([[690, 560], [340, 655]], ["password-reset message"], 510, 640, C.copper);
  b += flow([[1260, 135], [930, 320]], ["desk reservations, identity decisions,", "check-in/out, payments and charges"], 1120, 168);
  b += flow([[945, 345], [1260, 175]], ["arrivals, departures, folios,", "requests to review"], 1110, 296, C.copper);
  b += flow([[1260, 425], [970, 425]], ["cleaning progress, maintenance reports"], 1112, 410);
  b += flow([[970, 470], [1260, 470]], ["cleaning queue, open tasks"], 1112, 500, C.copper);
  b += flow([[1260, 712], [930, 560]], ["rooms, discounts, staff accounts,", "settings, review moderation"], 1130, 600);
  b += flow([[910, 575], [1260, 750]], ["dashboards and reports"], 1060, 720, C.copper);

  b += rect(40, 790, 640, 70, { fill: C.ivory, stroke: C.stone, r: 10 });
  b += `<line x1="60" y1="814" x2="110" y2="814" stroke="${C.forest}" stroke-width="2"/><line x1="60" y1="840" x2="110" y2="840" stroke="${C.copper}" stroke-width="2"/>`;
  b += text(124, 819, "data entering the system", { size: 13.5 }) + text(124, 845, "data returned by the system", { size: 13.5 });
  render("03-dfd-level-0", W, H, b);
})();

// ============================================================ 4. DFD level 1
(() => {
  const W = 1600, H = 1060;
  let b = "";
  const ents = [["Visitor / Guest", 40], ["Front-desk staff", 360], ["Housekeeping", 680], ["Manager / Admin", 1000], ["Email provider", 1320]];
  ents.forEach(([t, x]) => (b += rect(x, 30, 240, 60, { fill: C.forest, stroke: C.forest, r: 6 }) + text(x + 120, 67, t, { size: 16, weight: 600, anchor: "middle", fill: "#fff", serif: true })));
  const procs = [
    ["1.0", "Accounts and", "settings", 160], ["2.0", "Reservations", "", 420], ["3.0", "Stays and", "billing", 680],
    ["4.0", "Housekeeping and", "maintenance", 940], ["5.0", "Reports and", "dashboards", 1200], ["6.0", "Reviews and", "enquiries", 1450],
  ];
  const PY = 420;
  procs.forEach(([n, a, c, x]) => {
    b += `<circle cx="${x}" cy="${PY}" r="92" fill="#fff" stroke="${C.copper}" stroke-width="2.6" filter="url(#sh)"/>`;
    b += text(x, PY - 30, n, { size: 15, weight: 700, anchor: "middle", fill: C.copperDeep });
    b += text(x, PY + 2, a, { serif: true, size: 18, weight: 600, anchor: "middle", fill: C.forest });
    if (c) b += text(x, PY + 26, c, { serif: true, size: 18, weight: 600, anchor: "middle", fill: C.forest });
  });
  const stores = [["D1", "users", 30], ["D2", "rooms", 250], ["D3", "bookings", 470], ["D4", "roomnights · identity", 690], ["D5", "maintenances", 910], ["D6", "feedbacks · contacts", 1130], ["D7", "settings · counters ·", 1350]];
  const SY = 820;
  stores.forEach(([id, t, x]) => {
    b += `<g><rect x="${x}" y="${SY}" width="200" height="62" fill="#fff"/><line x1="${x}" y1="${SY}" x2="${x + 200}" y2="${SY}" stroke="${C.forest}" stroke-width="2"/><line x1="${x}" y1="${SY + 62}" x2="${x + 200}" y2="${SY + 62}" stroke="${C.forest}" stroke-width="2"/><line x1="${x}" y1="${SY}" x2="${x}" y2="${SY + 62}" stroke="${C.forest}" stroke-width="2"/><line x1="${x + 48}" y1="${SY}" x2="${x + 48}" y2="${SY + 62}" stroke="${C.forest}" stroke-width="1.4"/></g>`;
    b += text(x + 24, SY + 37, id, { size: 15, weight: 700, anchor: "middle", fill: C.copperDeep });
    b += text(x + 58, SY + (id === "D7" ? 28 : 37), t, { size: 13.5, weight: 600 });
    if (id === "D7") b += text(x + 58, SY + 46, "notifications", { size: 13.5, weight: 600 });
    if (id === "D4") b += text(x + 58, SY + 54, "documents/nights", { size: 11.5, fill: C.muted });
  });
  const P = Object.fromEntries(procs.map(([n, , , x]) => [n, x]));
  const S = Object.fromEntries(stores.map(([id, , x]) => [id, x + 100]));
  const E = Object.fromEntries(ents.map(([t, x]) => [t, x + 120]));
  // Entity -> process flows
  const ep = [["Visitor / Guest", "1.0"], ["Visitor / Guest", "2.0"], ["Visitor / Guest", "6.0"], ["Front-desk staff", "2.0"], ["Front-desk staff", "3.0"], ["Front-desk staff", "6.0"], ["Housekeeping", "4.0"], ["Manager / Admin", "1.0"], ["Manager / Admin", "5.0"], ["Manager / Admin", "6.0"]];
  ep.forEach(([e, p], i) => (b += arrow([[E[e] + ((i % 3) - 1) * 18, 90], [P[p], PY - 94]], { color: C.forest, sw: 1.5 })));
  b += arrow([[P["1.0"] + 60, PY - 70], [E["Email provider"] - 30, 90]], { color: C.copper, sw: 1.8, dash: "7 5" });
  b += label(1050, 200, "reset link", { size: 12.5, fill: C.copperDeep });
  // Process <-> store flows (read and write unless noted)
  const ps = [["1.0", "D1"], ["1.0", "D7"], ["2.0", "D1"], ["2.0", "D2"], ["2.0", "D3"], ["2.0", "D4"], ["2.0", "D7"], ["3.0", "D2"], ["3.0", "D3"], ["3.0", "D4"], ["3.0", "D7"], ["4.0", "D2"], ["4.0", "D5"], ["4.0", "D7"], ["5.0", "D2"], ["5.0", "D3"], ["5.0", "D5"], ["5.0", "D6"], ["6.0", "D3"], ["6.0", "D6"], ["6.0", "D7"]];
  ps.forEach(([p, d]) => {
    const readOnly = p === "5.0";
    b += arrow([[P[p], PY + 94], [S[d], SY]], { color: readOnly ? C.copper : C.line, sw: 1.3, both: !readOnly, dash: readOnly ? "6 4" : undefined });
  });
  b += rect(40, 940, 760, 92, { fill: C.ivory, stroke: C.stone, r: 10 });
  b += `<line x1="60" y1="966" x2="110" y2="966" stroke="${C.forest}" stroke-width="2"/><line x1="60" y1="992" x2="110" y2="992" stroke="${C.line}" stroke-width="2"/><line x1="60" y1="1016" x2="110" y2="1016" stroke="${C.copper}" stroke-width="2" stroke-dasharray="6 4"/>`;
  b += text(124, 971, "requests from people outside the system", { size: 13.5 });
  b += text(124, 997, "process reads and writes the data store", { size: 13.5 });
  b += text(124, 1021, "read-only (reports) or outbound email", { size: 13.5 });
  render("04-dfd-level-1", W, H, b);
})();

// ============================================================ 5. database
(() => {
  const W = 1600, H = 1460;
  let b = "";
  const R = (s) => ({ s, ref: true });
  const M = (s) => ({ s, muted: true });
  const users = card(40, 60, 380, "users", [
    "_id : ObjectId", "name · email (unique) · phone", "password (bcrypt hash, 12 rounds)",
    "role : admin | manager | receptionist |", "         housekeeping | staff | guest", "isActive · tokenVersion",
    "failedLoginCount · lockUntil · lastLoginAt", "resetTokenHash · resetTokenExpires", "passwordChangedAt", R("createdBy → users"), M("createdAt · updatedAt"),
  ]);
  const bookings = card(610, 60, 400, "bookings", [
    R("guest → users"), R("room → rooms"), "checkInDate · checkOutDate · numberOfGuests",
    "guestDetails { fullName, phone, email, address,", "  nationality, documentType, documentNumber,", "  documentFront/Back, emergencyContact, vehicle }",
    "verificationStatus · verificationMethod", "identityCheck { status, extractedNumber, detail }",
    "bookingStatus : pending | confirmed | rejected |", "  checked-in | checked-out | cancelled",
    "totalNights · pricePerNight · roomCharges", R("charges[ ] { description, amount, qty, addedBy }"),
    "discountAmount · taxRate · taxAmount · totalAmount", R("payments[ ] { amount, method, reference, receivedBy }"),
    "amountPaid · paymentStatus : unpaid | partial | paid", "invoiceNumber (unique when set)",
    R("createdBy · verifiedBy · checkedInBy ·"), R("checkedOutBy · cancelledBy → users"), M("timestamps · optimistic concurrency"),
  ]);
  const rooms = card(1200, 60, 360, "rooms", [
    "roomNumber (unique) · name · floor", "type : Serene Room | Signature Suite |", "         Royal Residence",
    "description · amenities[ ] · bedType", "pricePerNight · capacity",
    "status : available | occupied | reserved |", "            cleaning | maintenance", "isActive",
    "cleaningStartedAt", R("cleaningBy · lastCleanedBy → users"), "lastCleanedAt", M("createdAt · updatedAt"),
  ]);
  const iddocs = card(40, 700, 380, "identitydocuments", ["_id : normalised document key", "      e.g. cnic:<13 digits>", R("guest → users  (one owner per document)"), M("createdAt")]);
  const idnights = card(40, 900, 380, "identitynights", ["key  (identitydocuments._id)", "night : Date", R("booking → bookings"), M("unique (key, night)")]);
  const nights = card(1200, 700, 360, "roomnights", [R("room → rooms"), "night : Date", R("booking → bookings"), M("unique (room, night)  — no double booking")]);
  const maint = card(1200, 900, 360, "maintenances", [R("room → rooms"), "issueTitle · description", "priority : low | medium | high | urgent", "status : pending | in-progress | completed", R("reportedBy · startedBy · completedBy → users"), "startedAt · completedAt · resolutionNote"]);
  const fb = card(610, 760, 400, "feedbacks", [R("guest → users"), R("booking → bookings  (unique: one review per stay)"), R("room → rooms"), "rating 1–5 · cleanliness · service · room", "title · message", "status : new | reviewed", R("reviewedBy → users · reviewedAt")]);
  const notif = card(40, 1100, 380, "notifications", [R("user → users   or   roles[ ]"), "type · title · message", "entity · entityId", R("readBy[ ] → users"), M("expires automatically after 60 days")]);
  const settings = card(610, 1060, 400, "settings", ["key : \"global\" (unique)", "hotelName · address · contactEmail · contactPhone", "currencySymbol · taxRate · maxStayNights", "checkInTime · checkOutTime", "allowCheckoutWithBalance · social links", R("updatedBy → users")]);
  const contacts = card(1200, 1150, 360, "contacts", ["name · email · phone", "enquiryType : Room Reservation | Dining |", "  Spa & Wellness | Private Transfer | General", "message · status : new | read | resolved"]);
  const counters = card(610, 1300, 400, "counters", ["_id : e.g. \"invoice-2026\"", "value : atomic sequence for invoice numbers"], { h: 106 });
  [users, bookings, rooms, iddocs, idnights, nights, maint, fb, notif, settings, contacts, counters].forEach((c) => (b += c.svg));

  const tag = (x, y, s) => label(x, y, s, { size: 12, fill: C.copperDeep, bg: C.paper, weight: 600 });
  b += arrow([[610, 115], [420, 115]], { color: C.copper, sw: 2 }) + tag(515, 106, "guest  N : 1");
  b += arrow([[1010, 137], [1200, 137]], { color: C.copper, sw: 2 }) + tag(1105, 128, "room  N : 1");
  b += arrow([[1380, 60], [1380, 34], [230, 34], [230, 58]], { color: C.line, sw: 1.4, dash: "6 4" }) + tag(800, 38, "cleaningBy / lastCleanedBy → users");
  b += arrow([[230, 700], [230, 60 + users.h]], { color: C.copper, sw: 2 }) + tag(230, 680, "guest  N : 1");
  b += arrow([[230, 900], [230, 700 + iddocs.h]], { color: C.copper, sw: 2 }) + tag(230, 884, "key  N : 1");
  b += arrow([[420, 990], [560, 990], [560, 60 + bookings.h - 30], [610, 60 + bookings.h - 30]], { color: C.copper, sw: 2 }) + tag(560, 1010, "booking  N : 1");
  b += arrow([[1380, 700], [1380, 60 + rooms.h]], { color: C.copper, sw: 2 }) + tag(1380, 684, "room  N : 1");
  b += arrow([[1200, 760], [1100, 760], [1100, 60 + bookings.h - 60], [1010, 60 + bookings.h - 60]], { color: C.copper, sw: 2 }) + tag(1100, 744, "booking  N : 1");
  b += arrow([[1560, 960], [1585, 960], [1585, 200], [1560, 200]], { color: C.copper, sw: 2 }) + tag(1540, 620, "room");
  b += arrow([[810, 760], [810, 60 + bookings.h]], { color: C.copper, sw: 2 }) + tag(810, 740, "booking  1 : 1");
  b += rect(40, 1300, 540, 130, { fill: C.ivory, stroke: C.stone, r: 12 });
  b += text(60, 1328, "Reading the diagram", { size: 15, weight: 700, fill: C.forest });
  b += text(60, 1352, "Copper fields hold an ObjectId that references the named", { size: 13 });
  b += text(60, 1372, "collection. Arrows show the main relationships; references to", { size: 13 });
  b += text(60, 1392, "users by staff (createdBy, receivedBy, …) are listed in the", { size: 13 });
  b += text(60, 1412, "fields only, to keep the diagram readable.", { size: 13 });
  render("05b-database-collections-detail", W, H, b);
})();

// ============================================================ 5. database overview
(() => {
  const W = 1600, H = 1090;
  let b = "";
  const box = (x, y, title, lines, o = {}) => {
    const w = 380, h = 50 + lines.length * 28 + 14;
    let r = `<g filter="url(#sh)">${rect(x, y, w, h, { fill: "#fff", r: 14 })}</g>`;
    r += `<rect x="${x}" y="${y}" width="${w}" height="46" rx="14" fill="${o.head || C.forest}"/><rect x="${x}" y="${y + 30}" width="${w}" height="16" fill="${o.head || C.forest}"/>`;
    r += text(x + 18, y + 31, title, { size: 22, weight: 600, fill: "#fff", serif: true });
    lines.forEach((l, i) => (r += text(x + 18, y + 76 + i * 28, l.replace(/^\*/, ""), { size: 18, fill: l.startsWith("*") ? C.copperDeep : C.charcoal })));
    return r;
  };
  b += box(40, 60, "users", ["accounts, roles, sign-in security", "email unique · role · isActive", "*createdBy → users"]);
  b += box(610, 60, "bookings", ["*guest → users", "*room → rooms", "*createdBy · verifiedBy · checkedInBy ·", "*checkedOutBy · cancelledBy → users", "charges[ ] and payments[ ] embedded"]);
  b += box(1180, 60, "rooms", ["roomNumber unique · type · status", "*cleaningBy · lastCleanedBy → users"]);
  b += box(40, 410, "identitydocuments", ["_id = normalised document key", "*guest → users"]);
  b += box(610, 440, "feedbacks", ["*guest → users", "*booking → bookings (unique)", "*room → rooms", "*reviewedBy → users"]);
  b += box(1180, 410, "roomnights", ["*room → rooms", "*booking → bookings", "unique (room, night)"]);
  b += box(40, 650, "identitynights", ["*key → identitydocuments", "*booking → bookings", "unique (key, night)"]);
  b += box(610, 700, "settings", ["key \"global\" (unique)", "*updatedBy → users"]);
  b += box(1180, 650, "maintenances", ["*room → rooms", "*reportedBy · startedBy ·", "*completedBy → users"]);
  b += box(40, 890, "notifications", ["*user · readBy[ ] → users, or roles[ ]", "expire after 60 days"]);
  b += box(610, 900, "counters", ["invoice number sequences"]);
  b += box(1180, 900, "contacts", ["website enquiries (no references)"]);
  const tag = (x, y, s2) => label(x, y, s2, { size: 16, fill: C.copperDeep, bg: C.paper, weight: 600 });
  b += arrow([[610, 130], [420, 130]], { color: C.copper, sw: 2.4 }) + tag(515, 120, "guest");
  b += arrow([[990, 130], [1180, 130]], { color: C.copper, sw: 2.4 }) + tag(1085, 120, "room");
  b += arrow([[1370, 60], [1370, 32], [230, 32], [230, 58]], { color: C.line, sw: 1.8, dash: "7 5" }) + tag(800, 38, "cleaningBy / lastCleanedBy");
  b += arrow([[230, 410], [230, 200]], { color: C.copper, sw: 2.4 }) + tag(230, 312, "guest");
  b += arrow([[230, 650], [230, 524]], { color: C.copper, sw: 2.4 }) + tag(230, 594, "key");
  b += arrow([[420, 720], [560, 720], [560, 236], [610, 236]], { color: C.copper, sw: 2.4 }) + tag(560, 600, "booking");
  b += arrow([[1180, 470], [1090, 470], [1090, 236], [990, 236]], { color: C.copper, sw: 2.4 }) + tag(1090, 360, "booking");
  b += arrow([[1370, 410], [1370, 174]], { color: C.copper, sw: 2.4 }) + tag(1370, 300, "room");
  b += arrow([[800, 440], [800, 276]], { color: C.copper, sw: 2.4 }) + tag(800, 370, "booking");
  b += arrow([[1560, 720], [1588, 720], [1588, 150], [1560, 150]], { color: C.copper, sw: 2.4 }) + tag(1588, 820, "room");
  b += text(40, 1060, "Copper fields hold an ObjectId referencing the named collection. Arrows show the main relationships; staff references to users are listed in the boxes only.", { size: 16, fill: C.muted });
  render("05-database-relationships", W, H, b);
})();

// ============================================================ 6. booking lifecycle
(() => {
  const W = 1600, H = 760;
  let b = "";
  const st = (x, y, t, s, o = {}) => {
    let r = `<g filter="url(#sh)">${rect(x, y, 230, 92, { fill: o.fill || "#fff", stroke: o.stroke || C.forest, sw: 2, r: 46 })}</g>`;
    r += text(x + 115, y + 42, t, { serif: true, size: 21, weight: 600, anchor: "middle", fill: o.tc || C.forest });
    r += text(x + 115, y + 66, s, { size: 12.5, anchor: "middle", fill: o.sc || C.muted });
    return r;
  };
  b += `<circle cx="70" cy="280" r="16" fill="${C.forest}"/>`;
  b += st(250, 120, "pending", "online request, holds nights");
  b += st(250, 420, "confirmed", "holds nights · invoice no.");
  b += st(720, 420, "checked-in", "room occupied");
  b += st(1190, 420, "checked-out", "room → cleaning", { fill: C.forest, tc: "#fff", sc: "#D8E4DD" });
  b += st(720, 120, "rejected", "reason recorded", { stroke: C.copper, tc: C.copperDeep });
  b += st(720, 620 - 10, "cancelled", "nights released", { stroke: C.copper, tc: C.copperDeep });
  b += arrow([[86, 280], [160, 280], [160, 166], [250, 166]], { color: C.forest });
  b += label(160, 108, "guest books online", { size: 12.5, fill: C.charcoal });
  b += label(160, 130, "(ID image uploaded)", { size: 12.5 });
  b += arrow([[86, 288], [160, 288], [160, 466], [250, 466]], { color: C.forest });
  b += label(160, 520, "front desk books", { size: 12.5, fill: C.charcoal });
  b += label(160, 542, "(ID seen in person)", { size: 12.5 });
  b += arrow([[365, 212], [365, 420]], { color: C.forest }) + label(450, 300, "staff confirm after", { size: 12.5, fill: C.charcoal }) + label(450, 322, "identity review", { size: 12.5 });
  b += arrow([[480, 166], [720, 166]], { color: C.copper }) + label(600, 150, "staff reject (reason required)", { size: 12.5, fill: C.charcoal });
  b += arrow([[480, 466], [720, 466]], { color: C.forest }) + label(600, 410, "check in from the arrival", { size: 12.5, fill: C.charcoal }) + label(600, 432, "day; room available", { size: 12.5 });
  b += arrow([[950, 466], [1190, 466]], { color: C.forest }) + label(1070, 410, "check out; balance settled", { size: 12.5, fill: C.charcoal }) + label(1070, 432, "unless settings allow", { size: 12.5 });
  b += arrow([[440, 212], [440, 250], [650, 250], [650, 680], [720, 680]], { color: C.copper, dash: "6 4" });
  b += arrow([[365, 512], [365, 632], [720, 632]], { color: C.copper }) + label(500, 616, "guest or staff cancel", { size: 12.5, fill: C.charcoal });
  b += label(668, 300, "a pending request can also be cancelled", { size: 12.5, anchor: "start" });
  b += rect(1110, 90, 450, 200, { fill: C.ivory, stroke: C.stone, r: 14 });
  b += text(1132, 122, "Rules enforced by the API", { size: 15, weight: 700, fill: C.forest });
  ["pending, confirmed and checked-in hold room nights", "(unique room + night index prevents overlaps).", "A guest may change only a pending request and", "may not cancel once a payment is recorded.", "After check-in only the departure date can change.", "Invoice numbers come from the counters collection."].forEach((s, i) => (b += text(1132, 150 + i * 22, s, { size: 13 })));
  render("06-booking-lifecycle", W, H, b);
})();

// ============================================================ 7. request sequence
(() => {
  const W = 1600, H = 1020;
  let b = "";
  const lanes = [["Guest browser", "React SPA", 150], ["Express API", "POST /api/bookings", 560], ["Services", "OCR · ledgers · crypto", 1000], ["MongoDB", "luxurystay_dev", 1420]];
  lanes.forEach(([t, s, x]) => {
    b += `<g filter="url(#sh)">${rect(x - 130, 30, 260, 70, { fill: C.forest, stroke: C.forest, r: 12 })}</g>`;
    b += text(x, 62, t, { serif: true, size: 19, weight: 600, anchor: "middle", fill: "#fff" });
    b += text(x, 86, s, { size: 12.5, anchor: "middle", fill: "#D8E4DD" });
    b += `<line x1="${x}" y1="100" x2="${x}" y2="LIFELINE_END" stroke="${C.line}" stroke-width="1.5" stroke-dasharray="6 6"/>`;
  });
  const X = Object.fromEntries(lanes.map(([t, , x]) => [t, x]));
  let y = 140;
  const msg = (from, to, s, o = {}) => {
    const a = X[from], c = X[to];
    let r;
    if (a === c) {
      r = arrow([[a, y], [a + 70, y], [a + 70, y + 26], [a + 6, y + 26]], { color: o.color || C.forest, sw: 1.6 });
      r += text(a + 84, y + 18, s, { size: 13.5 });
      y += 62;
    } else {
      r = arrow([[a, y], [c + (c > a ? -4 : 4), y]], { color: o.color || C.forest, sw: 1.8, dash: o.dash });
      r += label((a + c) / 2, y - 8, s, { size: 13, fill: C.charcoal, bg: C.paper });
      y += 54;
    }
    return r;
  };
  b += msg("Guest browser", "Express API", "1  multipart form: stay, guest details, CNIC/passport images");
  b += msg("Express API", "Express API", "2  protect: verify JWT + tokenVersion; rate limit");
  b += msg("Express API", "Express API", "3  multer: ≤ 5 MB, ≤ 2 images; zod validation; stay rules");
  b += msg("Express API", "Services", "4  check file signatures (JPEG/PNG/WebP)");
  b += msg("Express API", "MongoDB", "5  room, guest's active stays, settings (tax, max nights)");
  b += msg("Express API", "Services", "6  CNIC only: OCR reads the number and compares it");
  b += msg("Services", "Express API", "number-matched / number-mismatch / unreadable", { color: C.copper, dash: "6 4" });
  b += msg("Express API", "Services", "7  encrypt images in place (AES-256-GCM)");
  b += msg("Express API", "MongoDB", "8  claim room nights (unique room + night)");
  b += msg("Express API", "MongoDB", "9  bind document to account; claim identity nights");
  b += msg("Express API", "MongoDB", "10  save booking: pending, server-side price and tax");
  b += msg("Express API", "MongoDB", "11  notify front desk (notifications)");
  b += msg("Express API", "Guest browser", "12  201 Created — verification pending", { color: C.copper, dash: "6 4" });
  b += rect(40, y + 6, 1520, 76, { fill: C.ivory, stroke: C.stone, r: 12 });
  b += text(60, y + 36, "If any night is already taken, the nights claimed by this request are released and the API answers 409; a matching CNIC", { size: 13.5 });
  b += text(60, y + 60, "number never confirms a booking by itself — a member of staff must confirm it. Without DOCUMENT_KEY, uploads are refused (503).", { size: 13.5 });
  b = b.split("LIFELINE_END").join(String(y + 6));
  render("07-reservation-request-sequence", W, y + 104, b);
})();
