// Builds LuxuryStay_HMS_Documentation.docx from the project itself.
//
//   cd documentation/tools && npm install && node build-docx.js
//
// Tables that describe the code (permissions, API endpoints, dependencies,
// test suites, directory tree) are read from the source when the document is
// built, so they always match the project. Screenshots and diagrams are read
// from ../screenshots and ../diagrams.
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, ImageRun, PageBreak, Header, Footer, PageNumber,
  NumberFormat, TableOfContents, PageOrientation, StyleLevel, LevelFormat, VerticalAlign, TabStopType, TableLayoutType,
} = require("docx");

const DOC = path.resolve(__dirname, "..");
const ROOT = path.resolve(DOC, "..");
const SERVER = path.join(ROOT, "server");
const CLIENT = path.join(ROOT, "client");
// The full 88-page edition. It writes its own file and never replaces the main report.
const OUT = path.join(DOC, "archive", "LuxuryStay_HMS_Documentation_full.docx");

// ------------------------------------------------------------------ theme --
const C = {
  forest: "123C32", emerald: "0B2923", ivory: "F7F4EC", paper: "FBF9F4", copper: "B98256",
  copperDeep: "8A5A35", stone: "E8E1D5", charcoal: "202722", muted: "5E665F", mint: "E4ECE7",
};
const SERIF = "Georgia";
const SANS = "Segoe UI";
const MONO = "Consolas";

// A4, content width 9076 DXA (6.30 in).
const PAGE = { width: 11906, height: 16838 };
const MARGIN = { top: 1300, bottom: 1250, left: 1530, right: 1300, header: 560, footer: 520 };
const CONTENT = PAGE.width - MARGIN.left - MARGIN.right;
const IMG_W = 600; // px at 96 dpi = 6.25 in
// Landscape pages for diagrams: A4 turned, narrower margins.
const LMARGIN = { top: 1000, bottom: 950, left: 1100, right: 1100, header: 480, footer: 450 };
const L_IMG_W = Math.floor(((PAGE.height - LMARGIN.left - LMARGIN.right) / 1440) * 96) - 8;

// --------------------------------------------------------------- helpers --
// **bold** and `code` inside a string become formatted runs.
const runs = (text, base = {}) => {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, ...base }));
    else out.push(new TextRun({ text: tok.slice(1, -1), font: MONO, size: (base.size || 20) - 2, color: C.emerald, ...base, bold: false }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
};

const P = (text, o = {}) => new Paragraph({ children: runs(text, o.run || {}), spacing: { after: o.after ?? 140, before: o.before ?? 0 }, alignment: o.align || AlignmentType.JUSTIFIED, keepNext: o.keepNext, style: o.style });
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(text)] });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
const bullets = (items, level = 0) => items.map((t) => new Paragraph({ numbering: { reference: "bullets", level }, children: runs(t), spacing: { after: 70 } }));
const numbered = (items, ref = "steps") => items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 70 } }));
const spacer = (after = 120) => new Paragraph({ children: [], spacing: { after } });

const cellBorders = { top: { style: BorderStyle.SINGLE, size: 4, color: C.stone }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.stone }, left: { style: BorderStyle.SINGLE, size: 4, color: C.stone }, right: { style: BorderStyle.SINGLE, size: 4, color: C.stone } };

let tableNo = {};
let figureNo = {};
let chapter = 0;
const tables = [];
const figures = [];

const tableCaption = (caption) => {
  if (chapter === 0) return new Paragraph({ style: "PlainCaption", children: [new TextRun(caption)], keepNext: true });
  tableNo[chapter] = (tableNo[chapter] || 0) + 1;
  const label = `Table ${chapter}.${tableNo[chapter]}: ${caption}`;
  tables.push(label);
  return new Paragraph({ style: "TableCaption", children: [new TextRun(label)], keepNext: true });
};

// Table with a forest header row and light zebra rows.
const table = (caption, headers, rows, widths, o = {}) => {
  const total = widths.reduce((a, b) => a + b, 0);
  const scaled = widths.map((w) => Math.round((w / total) * CONTENT));
  scaled[scaled.length - 1] += CONTENT - scaled.reduce((a, b) => a + b, 0);
  const size = o.size || 17;
  const head = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((h, i) => new TableCell({
      width: { size: scaled[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: C.forest },
      borders: cellBorders,
      margins: { top: 70, bottom: 70, left: 100, right: 100 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size, font: SANS })], spacing: { after: 0 } })],
    })),
  });
  const body = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((c, i) => new TableCell({
      width: { size: scaled[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: ri % 2 ? C.paper : "FFFFFF" },
      borders: cellBorders,
      margins: { top: 50, bottom: 50, left: 100, right: 100 },
      children: String(c).split("\n").map((line) => new Paragraph({
        children: runs(line, { size, ...(o.mono && o.mono.includes(i) ? { font: MONO, color: C.emerald } : {}), ...(o.boldFirst && i === 0 ? { bold: true } : {}) }),
        spacing: { after: 0 },
        alignment: o.center && o.center.includes(i) ? AlignmentType.CENTER : AlignmentType.LEFT,
      })),
    })),
  }));
  return [
    tableCaption(caption),
    new Table({ width: { size: CONTENT, type: WidthType.DXA }, columnWidths: scaled, layout: TableLayoutType.FIXED, rows: [head, ...body] }),
    spacer(200),
  ];
};

// Ivory call-out box with a copper left rule.
const note = (title, lines) => new Table({
  width: { size: CONTENT, type: WidthType.DXA },
  columnWidths: [CONTENT],
  rows: [new TableRow({ children: [new TableCell({
    width: { size: CONTENT, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: C.ivory },
    borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.SINGLE, size: 24, color: C.copper } },
    margins: { top: 120, bottom: 120, left: 220, right: 200 },
    children: [
      new Paragraph({ children: [new TextRun({ text: title, bold: true, color: C.forest, font: SANS, size: 20 })], spacing: { after: 60 } }),
      ...lines.map((l) => new Paragraph({ children: runs(l, { size: 19 }), spacing: { after: 40 } })),
    ],
  })] })],
});

// Monospaced block on a stone background.
const code = (lines) => new Table({
  width: { size: CONTENT, type: WidthType.DXA },
  columnWidths: [CONTENT],
  rows: [new TableRow({ children: [new TableCell({
    width: { size: CONTENT, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: "F1EDE4" },
    borders: cellBorders,
    margins: { top: 100, bottom: 100, left: 160, right: 160 },
    children: lines.map((l) => new Paragraph({ children: [new TextRun({ text: l || " ", font: MONO, size: 16, color: C.emerald })], spacing: { after: 0 } })),
  })] })],
});

const pngSize = (file) => {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

const figure = (file, caption, o = {}) => {
  figureNo[chapter] = (figureNo[chapter] || 0) + 1;
  const label = `Figure ${chapter}.${figureNo[chapter]}: ${caption}`;
  figures.push(label);
  const { w, h } = pngSize(file);
  const width = o.width || IMG_W;
  let height = Math.round((width * h) / w);
  let finalW = width;
  const maxH = o.maxH || 760;
  if (height > maxH) { finalW = Math.round((width * maxH) / height); height = maxH; }
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { before: 120, after: 60 },
      border: o.border === false ? undefined : { top: { style: BorderStyle.SINGLE, size: 4, color: C.stone, space: 2 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.stone, space: 2 }, left: { style: BorderStyle.SINGLE, size: 4, color: C.stone, space: 2 }, right: { style: BorderStyle.SINGLE, size: 4, color: C.stone, space: 2 } },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width: finalW, height }, altText: { title: caption, description: caption, name: path.basename(file) } })],
    }),
    new Paragraph({ style: "FigureCaption", children: [new TextRun(label)] }),
  ];
};
const shot = (name, caption, o) => figure(path.join(DOC, "screenshots", `${name}.png`), caption, o);
const diagram = (name, caption, o) => figure(path.join(DOC, "diagrams", `${name}.png`), caption, { border: false, ...o });
// A diagram on its own landscape page, optionally with a heading and text above it.
const landscape = (name, caption, before = []) => ({ landscape: [...before, ...figure(path.join(DOC, "diagrams", `${name}.png`), caption, { border: false, width: L_IMG_W, maxH: before.length > 1 ? 520 : before.length ? 565 : 615 })] });

const chapterStart = (title) => { chapter += 1; return H1(`${chapter}  ${title}`); };

// ------------------------------------------------------ facts from source --
const pkg = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
const serverPkg = pkg(SERVER);
const clientPkg = pkg(CLIENT);
const { ROLES, PERMISSIONS } = require(path.join(SERVER, "config", "permissions.js"));

const routeList = (() => {
  const app = fs.readFileSync(path.join(SERVER, "app.js"), "utf8");
  const mounts = {};
  for (const m of app.matchAll(/app\.use\("(\/api\/[a-z-]+)",\s*(?:create)?([A-Za-z]+?)(?:Router)?(?:\(limiters\))?\)/g)) mounts[m[2].toLowerCase().replace(/routes$/, "")] = m[1];
  const out = [];
  for (const file of fs.readdirSync(path.join(SERVER, "routes")).sort()) {
    const src = fs.readFileSync(path.join(SERVER, "routes", file), "utf8");
    const base = mounts[file.replace(/Routes\.js$/, "").toLowerCase()];
    const routerProtected = /router\.use\(protect\)/.test(src);
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]*)"([\s\S]*?)(?:async\s*\(|\(req, res)/g)) {
      const between = m[3];
      const perms = [...between.matchAll(/requirePermission\(([^)]*)\)/g)].flatMap((x) => [...x[1].matchAll(/"([^"]+)"/g)].map((y) => y[1]));
      const signedIn = routerProtected || /\bprotect\b/.test(between);
      const limiter = (between.match(/limiters\.([a-zA-Z]+)/) || [])[1];
      out.push({ method: m[1].toUpperCase(), path: base + (m[2] === "/" ? "" : m[2]), perms, signedIn, limiter, file });
    }
  }
  return out;
})();

const testSuites = fs.readdirSync(path.join(SERVER, "tests")).filter((f) => f.endsWith(".test.js")).sort().map((f) => {
  const src = fs.readFileSync(path.join(SERVER, "tests", f), "utf8");
  const names = [...src.matchAll(/^test\("([^"]+)"/gm)].map((m) => m[1]);
  return { file: f, count: names.length, names };
});
const testTotal = testSuites.reduce((a, s) => a + s.count, 0);

const tree = (() => {
  const skip = new Set(["node_modules", "dist", "uploads", ".ocr-cache", ".git", "documentation", "docs", "database"]);
  const lines = [];
  const walk = (dir, prefix, depth) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => !skip.has(e.name) && !(e.name.startsWith(".env") && e.name !== ".env.example") && !e.name.startsWith("edge-profile"))
      .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    entries.forEach((e, i) => {
      const last = i === entries.length - 1;
      if (e.isDirectory() && depth >= 3) { lines.push(`${prefix}${last ? "└─ " : "├─ "}${e.name}/ …`); return; }
      if (!e.isDirectory() && depth >= 3) return;
      lines.push(`${prefix}${last ? "└─ " : "├─ "}${e.name}${e.isDirectory() ? "/" : ""}`);
      if (e.isDirectory()) walk(path.join(dir, e.name), prefix + (last ? "   " : "│  "), depth + 1);
    });
  };
  lines.push("LuxuryStay-HMS/");
  walk(ROOT, "", 1);
  return lines;
})();

const permDescriptions = {
  "staff:view": "View staff accounts", "staff:manage": "Create and edit staff accounts",
  "guests:view": "View the guest directory", "guests:manage": "Activate or deactivate guest accounts",
  "rooms:view": "View all rooms and their status", "rooms:manage": "Add, edit and retire rooms",
  "rooms:status": "Change a room's status", "housekeeping:manage": "Work the cleaning queue",
  "maintenance:view": "View maintenance tasks", "maintenance:report": "Report a maintenance issue",
  "maintenance:update": "Start and complete maintenance", "bookings:own": "Make and manage own reservations",
  "bookings:view": "View all reservations", "bookings:create": "Create reservations at the desk",
  "bookings:review": "Confirm or reject requests", "bookings:edit": "Change reservation dates or room",
  "bookings:cancel": "Cancel any reservation", "bookings:checkin": "Check guests in",
  "bookings:checkout": "Check guests out", "billing:view": "View folios and invoices",
  "billing:payment": "Record payments", "billing:charges": "Add or remove extra charges",
  "billing:discount": "Apply discounts", "reports:view": "View dashboard reports",
  "frontdesk:view": "View the front-desk summary", "feedback:own": "Review own completed stays",
  "feedback:manage": "Moderate guest reviews", "contact:manage": "Handle website enquiries",
  "settings:manage": "Change hotel settings",
};

const accessOf = (r) => {
  if (r.perms.length) return r.perms.join(" or ");
  if (!r.signedIn) return r.limiter ? `public (rate limit: ${r.limiter})` : "public";
  return "signed in; ownership or role checked in the handler";
};

// ================================================================ content ==
const today = "14 October 2026";
const blank = "________________________________";

// ------------------------------------------------------------ cover page --
const cover = [];
cover.push(new Paragraph({ children: [new TextRun({ text: "PROJECT REPORT", font: SANS, size: 20, bold: true, color: C.copperDeep, characterSpacing: 60 })], spacing: { before: 200, after: 360 } }));
cover.push(new Table({
  width: { size: CONTENT, type: WidthType.DXA }, columnWidths: [CONTENT],
  rows: [new TableRow({ children: [new TableCell({
    width: { size: CONTENT, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: C.forest },
    borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.SINGLE, size: 36, color: C.copper }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
    margins: { top: 520, bottom: 480, left: 480, right: 480 },
    children: [
      new Paragraph({ children: [new TextRun({ text: "LuxuryStay HMS", font: SERIF, size: 76, color: "FFFFFF" })], spacing: { after: 120 } }),
      new Paragraph({ children: [new TextRun({ text: "Hotel Management System", font: SERIF, size: 40, italics: true, color: "E2C3A6" })], spacing: { after: 280 } }),
      new Paragraph({ children: [new TextRun({ text: "A MERN-stack web application for hotel reservations, front-desk operations, billing, housekeeping, maintenance and management reporting", font: SANS, size: 21, color: "DCE6E0" })], spacing: { after: 0 } }),
    ],
  })] })],
}));
cover.push(spacer(360));
cover.push(new Paragraph({ children: [new TextRun({ text: "Submitted by", font: SANS, size: 19, bold: true, color: C.copperDeep, characterSpacing: 30 })], spacing: { after: 120 } }));
const team = [
  ["Student1561115", "MUHAMMAD TALHA"], ["Student1561444", "RAJA HARIS"], ["Student1572235", "NIBRAS KHAN"],
  ["Student1547456", "AYESHA"], ["Student1550000", "MUHAMMAD AHMED"], ["Student1551197", "YASH RAJ"],
];
const plainTable = (rows, widths, o = {}) => {
  const total = widths.reduce((a, b) => a + b, 0);
  const scaled = widths.map((w) => Math.round((w / total) * CONTENT));
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA }, columnWidths: scaled, layout: TableLayoutType.FIXED,
    rows: rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => new TableCell({
      width: { size: scaled[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: o.fill ? o.fill(ri, i) : "FFFFFF" },
      borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.stone } },
      margins: { top: o.pad ?? 70, bottom: o.pad ?? 70, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: c, font: i === 0 && o.firstMono ? MONO : SANS, size: o.size || 20, bold: o.boldCol === i, color: o.color ? o.color(i) : C.charcoal })], spacing: { after: 0 } })],
    })) })),
  });
};
cover.push(plainTable(team.map(([id, n], i) => [String(i + 1), id, n]), [6, 30, 64], { boldCol: 2, color: (i) => (i === 0 ? C.copperDeep : i === 1 ? C.muted : C.forest) }));
cover.push(spacer(360));
cover.push(new Paragraph({ children: [new TextRun({ text: "Academic submission", font: SANS, size: 19, bold: true, color: C.copperDeep, characterSpacing: 30 })], spacing: { after: 120 } }));
cover.push(plainTable([
  ["Institution", blank], ["Department", blank], ["Programme / course", blank], ["Supervisor", blank], ["Academic session", blank], ["Submission date", blank],
], [32, 68], { fill: (r, i) => (i === 0 ? C.ivory : "FFFFFF"), boldCol: 0, color: (i) => (i === 0 ? C.forest : C.muted), pad: 95 }));
cover.push(spacer(300));
cover.push(new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text: `Documentation prepared from the project source code and the running application, ${today}.`, font: SANS, size: 17, italics: true, color: C.muted })] }));

// ---------------------------------------------------------- front matter --
const front = [];
const frontHeading = (t) => new Paragraph({ style: "FrontHeading", pageBreakBefore: true, children: [new TextRun(t)] });

front.push(new Paragraph({ style: "FrontHeading", children: [new TextRun("Project Team and Student IDs")] }));
front.push(P("The following students developed LuxuryStay HMS and prepared this documentation."));
front.push(...table("Project team", ["No.", "Student ID", "Name", "Signature"], team.map(([id, n], i) => [String(i + 1), id, n, ""]), [7, 26, 37, 30], { size: 19, center: [0] }));
front.push(P("Individual responsibilities are not stated here because they were not provided for this document. Space is left for the team to record them if the institution requires it.", { run: { italics: true, color: C.muted, size: 18 } }));
front.push(spacer(80));
front.push(...table("Individual responsibilities (to be completed by the team)", ["Student", "Responsibilities"], team.map(([, n]) => [n, ""]), [32, 68], { size: 19 }));

front.push(frontHeading("Declaration"));
front.push(P("We, the undersigned, declare that this project report and the software it describes, **LuxuryStay HMS — Hotel Management System**, are our own work, carried out as part of our academic programme. Where we have used the work of others, including open-source libraries, frameworks and documentation, it is acknowledged in the text and in the references. This work has not been submitted for any other award."));
front.push(P("This template should be adjusted to the exact wording required by the institution before submission.", { run: { italics: true, color: C.muted, size: 18 } }));
front.push(spacer(120));
front.push(plainTable(team.map(([id, n]) => [n, id, "Signature: ______________________"]), [36, 26, 38], { boldCol: 0, color: (i) => (i === 0 ? C.forest : C.charcoal), pad: 150 }));
front.push(spacer(200));
front.push(P(`Date: ${blank}`, { align: AlignmentType.LEFT }));

front.push(frontHeading("Acknowledgement"));
front.push(P("We thank our supervisor, ______________________, for guidance throughout the project, and the faculty of the ______________________ department of ______________________ for the knowledge and facilities that made this work possible. We also acknowledge the maintainers of the open-source tools on which LuxuryStay HMS is built, including Node.js, Express, MongoDB, Mongoose, React and Vite."));
front.push(P("This acknowledgement is a template; the team may personalise it before submission.", { run: { italics: true, color: C.muted, size: 18 } }));

front.push(frontHeading("Abstract"));
front.push(P("Hotels of every size must keep reservations, room status, guest identity, payments and housekeeping in step. When these are tracked on paper, in spreadsheets or in separate tools, rooms can be double-booked, balances can be missed, and managers lack a reliable view of occupancy and revenue."));
front.push(P(`LuxuryStay HMS is a web-based hotel management system built on the MERN stack: MongoDB with Mongoose, Express 5 on Node.js, and a React 19 single-page application built with Vite. It provides a public website where visitors browse room types and check availability; a guest portal for reservation requests with identity-document upload, booking history, invoices and reviews; and a staff workspace for the front desk, housekeeping, management and administration. Access is controlled by ${ROLES.length} roles mapped to ${Object.keys(PERMISSIONS).length} named permissions, enforced on every API endpoint.`));
front.push(P(`The system stores its data in ${12} MongoDB collections and exposes ${routeList.length} REST endpoints. Double booking is prevented by a room-night ledger backed by a unique database index, identity documents are encrypted at rest with AES-256-GCM, and a local OCR engine compares the CNIC number a guest types with the number on the uploaded image. This is a project-level check only and is not an official identity verification; every online request is confirmed by a member of staff. Passwords are hashed with bcrypt, sessions use signed JSON Web Tokens that can be revoked, and sign-in, registration and password-reset requests are rate-limited.`));
front.push(P(`The backend has ${testTotal} automated tests across ${testSuites.length} suites that run against an isolated test database. This report describes the requirements, architecture, database design, modules, security model and workflows of the system, explains how to install and run it, reports the test results, and presents screenshots captured from the running application with fictional demonstration data.`));
front.push(new Paragraph({ children: [new TextRun({ text: "Keywords: ", bold: true, color: C.forest }), new TextRun("hotel management system, MERN stack, reservations, role-based access control, room-night ledger, React, Express, MongoDB")], spacing: { before: 120 } }));

front.push(frontHeading("Table of Contents"));
front.push(new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }));
front.push(frontHeading("List of Figures"));
front.push(new TableOfContents("List of Figures", { hyperlink: true, stylesWithLevels: [new StyleLevel("Figure Caption", 1)] }));
front.push(frontHeading("List of Tables"));
front.push(new TableOfContents("List of Tables", { hyperlink: true, stylesWithLevels: [new StyleLevel("Table Caption", 1)] }));

// ------------------------------------------------------------ main body --
const body = [];
const add = (...items) => items.forEach((i) => (Array.isArray(i) ? body.push(...i) : body.push(i)));
// (landscape items are objects with a "landscape" array and are pushed as they are)

// 1 Introduction
add(chapterStart("Introduction"));
add(H2("1.1  Overview"));
add(P("LuxuryStay HMS — Hotel Management System is a full-stack web application that supports the daily work of a hotel, from the first visit to the public website to the guest's departure and review. It brings reservations, room status, guest records, identity documents, billing, housekeeping, maintenance and management reporting into one system that every member of staff uses through a browser."));
add(P("The application has three faces. The **public website** presents the hotel and its room types with live availability and prices. The **guest portal** lets a registered guest request a stay, follow its status, view invoices and review a completed stay. The **staff workspace** gives each role — receptionist, housekeeping, manager and administrator — the screens and actions its work requires, and nothing more."));
add(H2("1.2  Purpose of this document"));
add(P("This report documents the system as it is implemented. It explains the problem the system addresses, states its requirements, and describes its architecture, data model, modules, security controls and workflows. It also explains how to install, configure and run the project, reports the results of the tests that were run, and shows screenshots taken from the running application."));
add(H2("1.3  How this document was prepared"));
add(...bullets([
  "Every technical statement was checked against the source code in the `server` and `client` folders. Tables of permissions, API endpoints, dependencies, test suites and the directory structure were generated directly from the source files.",
  "Screenshots were captured from the application running locally against the development database `luxurystay_dev`, using fictional demonstration accounts and records. No production data appears in this document.",
  "Features that are not implemented are labelled as limitations or future enhancements; they are not presented as existing functionality.",
]));
add(H2("1.4  Document conventions"));
add(P("File and folder names, configuration keys, commands and API paths are set in a monospaced font, for example `server/app.js` or `GET /api/public/rooms`. Monetary amounts are shown in Pakistani rupees (Rs.), the currency symbol configured by default in the application."));

// 2 Background
add(chapterStart("Background and Problem Statement"));
add(H2("2.1  Background"));
add(P("A hotel sells a perishable product: a room for a night. Every night that a room stands empty is revenue that cannot be recovered, and every night that is sold twice creates a guest who cannot be accommodated. Running a hotel therefore depends on knowing, at any moment, which rooms are free, which guests are arriving or leaving, what each guest owes, and which rooms are ready to be sold."));
add(P("In smaller and mid-sized properties this information is often kept in registers, spreadsheets, messaging groups and separate accounting tools. Each source is updated by different people at different times, so the picture is rarely complete or current."));
add(H2("2.2  Problem statement"));
add(P("Without a single, shared system a hotel typically faces the following problems:"));
add(...bullets([
  "**Double booking and lost availability.** Two staff members, or a staff member and an online request, can promise the same room for the same night.",
  "**Unverified guests.** Identity documents are checked inconsistently, and copies are stored without protection.",
  "**Billing errors.** Room charges, extras, discounts, tax and part-payments are calculated by hand, so balances are missed or disputed.",
  "**Slow room turnover.** Reception does not know when housekeeping has finished a room, and maintenance issues are reported verbally and forgotten.",
  "**No management view.** Occupancy, revenue, average nightly rate and guest satisfaction must be compiled manually, if at all.",
  "**Weak access control.** Shared logins or paper records give every employee access to every record.",
]));
add(H2("2.3  Proposed solution"));
add(P("LuxuryStay HMS addresses these problems with a single web application backed by one database. Availability is decided by the database itself, identity documents are checked and stored securely, folios are calculated by the server, housekeeping and maintenance are part of the same workflow as check-out, and managers see live dashboards. Each user signs in with an individual account whose role determines what they can see and do."));

// 3 Aim and objectives
add(chapterStart("Project Aim and Objectives"));
add(H2("3.1  Aim"));
add(P("To design and implement a secure, role-based web application that manages a hotel's reservations, stays, billing, housekeeping, maintenance and reporting, with a public website and a guest portal, using the MERN stack."));
add(H2("3.2  Objectives"));
add(...numbered([
  "Provide a public website that presents room types with real prices and availability for chosen dates.",
  "Allow visitors to register as guests and request reservations online, including upload of an identity document.",
  "Prevent double booking under concurrent requests by enforcing room availability in the database.",
  "Support the full front-desk cycle: desk reservations, review of online requests, check-in, check-out, payments, extra charges, discounts and invoices.",
  "Connect check-out with housekeeping so that rooms move through cleaning before they can be sold again, and track maintenance issues that take rooms out of service.",
  "Give managers a dashboard and reports of occupancy, revenue, reservations, average nightly rate and guest ratings over a chosen period.",
  "Restrict every action to the roles allowed to perform it, on both the server and the user interface.",
  "Protect accounts and personal data with hashed passwords, revocable tokens, rate limiting, input validation and encryption of identity documents.",
  "Keep production, development and test data in separate databases with safeguards against accidental writes.",
], "objectives"));

// 4 Scope and limitations
add(chapterStart("Project Scope and Limitations"));
add(H2("4.1  In scope"));
add(...bullets([
  "A single hotel property with three room categories: Serene Room, Signature Suite and Royal Residence.",
  "Public website, guest self-service portal and staff workspace in one React application.",
  "Reservations made online by guests and at the desk by staff, with identity documents (CNIC or passport).",
  "Check-in, check-out, folio management (room charges, extras, discount, tax), payment recording and invoice numbering.",
  "Housekeeping queue, maintenance tasks, guest reviews, website enquiries and in-app notifications.",
  "Staff account management, guest directory, hotel settings, dashboards and printable reports.",
  "Password reset by email, account lockout and role-based access control.",
]));
add(H2("4.2  Out of scope"));
add(...bullets([
  "Online card payments through a payment gateway. Payments are recorded by staff after they are received at the desk (cash, card terminal or bank transfer).",
  "Official verification of identity with NADRA or any government service. The CNIC check compares two numbers only.",
  "Multiple properties, channel managers and integration with online travel agencies.",
  "Point-of-sale for restaurants or spa, payroll, inventory and accounting ledgers.",
  "SMS or push notifications; notifications are shown inside the application only.",
]));
add(H2("4.3  Limitations"));
add(P("The known limitations of the current implementation, including configuration-dependent features, are listed in Chapter 24, Known Issues and Limitations."));

// 5 Existing vs proposed
add(chapterStart("Existing System and Proposed System"));
add(H2("5.1  Existing system"));
add(P("The project does not replace a particular hotel's software. The \"existing system\" considered here is the manual or semi-manual practice common in small and mid-sized hotels: reservations written in a register or spreadsheet, room status communicated by telephone or messaging, identity documents photocopied into a file, folios calculated by hand, and reports assembled at the end of the month."));
add(H2("5.2  Proposed system"));
add(P("LuxuryStay HMS replaces these separate records with one web application and one database. The comparison below summarises the difference."));
add(...table("Existing practice compared with LuxuryStay HMS", ["Area", "Manual or semi-manual practice", "LuxuryStay HMS"], [
  ["Availability", "Checked by reading a register; two people can sell the same night", "Each night of each room can be held by one reservation only (unique database index)"],
  ["Online requests", "Telephone or email; re-typed by staff", "Guests request stays in the portal; staff confirm or reject with a recorded reason"],
  ["Identity documents", "Photocopies in a file", "Uploaded images encrypted at rest; one document bound to one account; CNIC number compared by OCR"],
  ["Billing", "Calculated by hand", "Server calculates room charges, extras, discount and tax; payments recorded with method and reference; numbered invoices"],
  ["Room readiness", "Verbal hand-over between housekeeping and reception", "Check-out moves the room to the cleaning queue; housekeeping releases it; maintenance takes rooms out of service"],
  ["Reporting", "Compiled manually", "Live dashboard and period reports of revenue, occupancy, reservations and ratings"],
  ["Access", "Shared records or logins", "Individual accounts, six roles, permission check on every API call"],
], [18, 38, 44]));

// 6 Feasibility
add(chapterStart("Feasibility Study"));
add(H2("6.1  Technical feasibility"));
add(P("The system uses mature, widely documented open-source technologies: Node.js, Express, MongoDB, Mongoose, React and Vite. All of them run on an ordinary Windows, macOS or Linux computer, and the complete system was installed and run on a Windows 10 laptop for this project. No special hardware is required. Features with external dependencies degrade safely: password-reset email needs a mail account, and identity-document upload needs an encryption key (Chapter 20)."));
add(H2("6.2  Operational feasibility"));
add(P("Each role sees a workspace focused on its own tasks, so staff need little training: a receptionist starts from arrivals and departures, housekeeping from the cleaning queue, and a manager from the dashboard. The application runs in any modern browser and adapts to tablet and phone screens (Figure 23.40), so staff do not need dedicated terminals."));
add(H2("6.3  Economic feasibility"));
add(P("All libraries and tools used are free and open source, and the OCR engine runs locally, so there are no licence or per-request fees. Running costs are limited to hosting (a server for the API and MongoDB, or a managed MongoDB service) and an email account for password-reset messages. No cost figures were measured as part of this project."));
add(H2("6.4  Legal and ethical feasibility"));
add(P("Guest identity data is personal data. The system limits who can see identity documents, encrypts document images at rest, and never claims to verify identity officially: the CNIC check is a comparison of two numbers and every online request is confirmed by a person. The project has no integration with NADRA. All data shown in this report is fictional."));

// 7 Functional requirements
add(chapterStart("Functional Requirements"));
add(P("The functional requirements below are stated as they are implemented. The status column records whether each requirement is present in the code; requirements that depend on configuration are noted."));
const FR = [
  ["FR-01", "Public website", "Show room types with description, amenities, capacity, bed types and lowest nightly price; show hotel details from settings.", "Implemented"],
  ["FR-02", "Public website", "Check availability for chosen dates and number of guests, then continue to sign-in or booking.", "Implemented"],
  ["FR-03", "Public website", "Accept enquiries (name, email, phone, enquiry type, message) with a rate limit.", "Implemented"],
  ["FR-04", "Accounts", "Register a guest account; sign in; sign out; view and update own profile; change password.", "Implemented"],
  ["FR-05", "Accounts", "Reset a forgotten password through a single-use emailed link that expires.", "Implemented (needs email configuration)"],
  ["FR-06", "Accounts", "Lock an account for 15 minutes after 8 failed sign-ins.", "Implemented"],
  ["FR-07", "Reservations", "Guest requests a stay with stay dates, guest details and an identity document image (CNIC front and back, or passport).", "Implemented (needs DOCUMENT_KEY)"],
  ["FR-08", "Reservations", "Compare the typed CNIC number with the number read by OCR and record the outcome for staff.", "Implemented"],
  ["FR-09", "Reservations", "Staff create confirmed reservations at the desk after inspecting the document in person.", "Implemented"],
  ["FR-10", "Reservations", "Staff confirm or reject pending requests; rejection requires a reason; approving a number mismatch requires a note.", "Implemented"],
  ["FR-11", "Reservations", "Change dates or room of a reservation; a guest may change only a pending request; after check-in only the departure date may change.", "Implemented"],
  ["FR-12", "Reservations", "Cancel pending or confirmed reservations; a guest cannot cancel once a payment is recorded.", "Implemented"],
  ["FR-13", "Reservations", "Never allow two active reservations to hold the same room on the same night.", "Implemented"],
  ["FR-14", "Front desk", "Check in confirmed, verified reservations from the arrival date when the room is available; mark the room occupied.", "Implemented"],
  ["FR-15", "Front desk", "Check out guests when the balance is settled (unless settings allow a balance); send the room to cleaning.", "Implemented"],
  ["FR-16", "Billing", "Maintain a folio: room charges, extra charges, discount, tax, payments (cash, card, bank transfer) and balance.", "Implemented"],
  ["FR-17", "Billing", "Assign sequential invoice numbers and show a printable invoice to staff and to the guest who owns the booking.", "Implemented"],
  ["FR-18", "Rooms", "Add, edit and retire rooms; set room status; list rooms with filters.", "Implemented"],
  ["FR-19", "Housekeeping", "Show rooms awaiting cleaning; start cleaning; mark clean to release the room.", "Implemented"],
  ["FR-20", "Maintenance", "Report issues with priority; start and complete tasks with a resolution note; take the room out of service while open.", "Implemented"],
  ["FR-21", "Reviews", "Guests review completed stays once; managers mark reviews as reviewed.", "Implemented"],
  ["FR-22", "Enquiries", "Staff list enquiries and mark them read or resolved.", "Implemented"],
  ["FR-23", "Reports", "Dashboard and reports for 7, 30 and 90 days or 12 months: revenue collected, occupancy, reservations, average nightly rate, rating.", "Implemented"],
  ["FR-24", "Administration", "Create and edit staff accounts and roles; activate or deactivate guest accounts; edit hotel settings.", "Implemented"],
  ["FR-25", "Notifications", "Record in-app notifications for roles or users, mark them read, and expire them after 60 days.", "Implemented"],
];
add(...table("Functional requirements", ["ID", "Module", "Requirement", "Status"], FR, [9, 15, 56, 20], { size: 16 }));

// 8 Non-functional requirements
add(chapterStart("Non-Functional Requirements"));
add(...table("Non-functional requirements", ["Category", "Requirement", "How the implementation meets it"], [
  ["Security", "Passwords are never stored in plain text.", "bcrypt hashes; minimum 8 characters with a letter and a number."],
  ["Security", "Sessions can be ended on demand.", "JWT (HS256, 12 h by default) carries a token version; signing out, changing or resetting a password increments it and invalidates old tokens."],
  ["Security", "Abuse of public endpoints is limited.", "Rate limits on the API, sign-in, registration, password reset, reset-token checks and enquiries."],
  ["Security", "Only allowed roles can act.", "Every protected route declares a permission; anything not listed is denied."],
  ["Privacy", "Identity documents are protected.", "AES-256-GCM encryption at rest; served only to front-desk staff or the booking's owner."],
  ["Integrity", "No double booking, even under concurrent requests.", "Unique (room, night) index in `roomnights`; claims are atomic inserts."],
  ["Integrity", "Simultaneous edits do not overwrite each other.", "Optimistic concurrency on bookings (document version checked on save)."],
  ["Reliability", "The server refuses an unsafe start.", "Start-up checks the database name against `EXPECTED_DB_NAME`, required indexes and the night ledger."],
  ["Usability", "Each role sees only its own tasks.", "Role-specific navigation and dashboards; clear validation messages next to fields."],
  ["Accessibility", "Respect user motion preferences.", "Framer Motion configured with `reducedMotion=\"user\"`; light and dark themes."],
  ["Portability", "Runs on common platforms and browsers.", "Node.js and MongoDB on Windows, macOS or Linux; responsive layout down to phone width."],
  ["Maintainability", "Code is organised by responsibility.", "Routes, middleware, services, models and utilities separated; validation schemas shared; automated tests."],
], [16, 34, 50], { size: 16 }));

// 9 Hardware and software
add(chapterStart("Hardware and Software Requirements"));
add(H2("9.1  Environment used for development and testing"));
add(...table("Verified development environment", ["Item", "Version or detail"], [
  ["Operating system", "Windows 10 Pro (10.0.19045)"],
  ["Node.js", "24.15.0"],
  ["MongoDB server", "8.2.12 (local, 127.0.0.1:27017)"],
  ["Browser used for verification and screenshots", "Microsoft Edge (Chromium), headless and desktop"],
  ["Package manager", "npm (bundled with Node.js)"],
], [40, 60]));
add(H2("9.2  Recommended requirements"));
add(P("The following are reasonable recommendations for running the system; they were not measured as minimums."));
add(...table("Recommended hardware and software", ["Component", "Recommendation"], [
  ["Processor", "Dual-core 64-bit processor or better"],
  ["Memory", "8 GB RAM for development (the OCR engine and MongoDB run on the same machine)"],
  ["Storage", "2 GB free for dependencies, database and uploaded documents"],
  ["Server software", "Node.js 24 or later; MongoDB 8 or later (local or hosted)"],
  ["Client", "A current version of Chrome, Edge, Firefox or Safari"],
  ["Network", "Internet access on first OCR use (to download English language data once) and for password-reset email"],
], [30, 70]));

// 10 Technology stack
add(chapterStart("Technology Stack"));
add(P("Versions below are the ranges declared in the project's `package.json` files."));
const depRows = (deps, purpose) => Object.entries(deps).map(([n, v]) => [n, v, purpose[n] || ""]);
const serverPurpose = {
  bcryptjs: "Password hashing", cors: "Cross-origin allow-list", dotenv: "Loads configuration from .env", express: "HTTP server and routing",
  "express-rate-limit": "Rate limiting", helmet: "Security headers", jsonwebtoken: "Signed session tokens", mongoose: "MongoDB object modelling",
  multer: "Multipart uploads of identity documents", nodemailer: "Password-reset email", "tesseract.js": "Local OCR of CNIC images", zod: "Request validation",
  nodemon: "Restarts the server during development",
};
const clientPurpose = {
  axios: "Declared dependency (requests are made with fetch in lib/api.js)", "framer-motion": "Animation and motion preferences", "lucide-react": "Icons", react: "User interface library",
  "react-dom": "Browser rendering", "react-icons": "Additional icons", "react-router-dom": "Client-side routing",
  "@vitejs/plugin-react": "React support for Vite", oxlint: "Linting", vite: "Development server and production build",
  "@types/react": "Type definitions for editors", "@types/react-dom": "Type definitions for editors",
};
add(...table("Backend dependencies (server/package.json)", ["Package", "Version", "Purpose"], [...depRows(serverPkg.dependencies, serverPurpose), ...depRows(serverPkg.devDependencies || {}, serverPurpose).map((r) => [r[0] + " (dev)", r[1], r[2]])], [30, 16, 54], { mono: [0] }));
add(...table("Frontend dependencies (client/package.json)", ["Package", "Version", "Purpose"], [...depRows(clientPkg.dependencies, clientPurpose), ...depRows(clientPkg.devDependencies || {}, clientPurpose).map((r) => [r[0] + " (dev)", r[1], r[2]])], [30, 16, 54], { mono: [0] }));
add(...table("Other technologies", ["Technology", "Use in the project"], [
  ["MongoDB 8", "Document database; three separate databases for production, development and tests"],
  ["Node.js test runner (node:test)", "Backend automated tests"],
  ["Google Fonts: Fraunces and DM Sans", "Display and body typefaces of the web interface"],
  ["JSON Web Token (RFC 7519)", "Bearer tokens for signed-in requests"],
], [34, 66]));

// 11 Architecture
add(chapterStart("System Architecture"));
add(P("LuxuryStay HMS follows a three-tier architecture. The React application runs in the browser and talks to the Express API over HTTP using JSON. The API is the only component that reads or writes the database, so every rule — who may act, which nights are free, how a folio is totalled — is enforced in one place."));
add(landscape("01-system-architecture", "System architecture of LuxuryStay HMS"));
add(H2("11.1  Client tier"));
add(P("The client is a single-page application created with Vite. `App.jsx` defines four areas: the public website (`/`, `/rooms/:slug`), authentication pages, the guest portal (`/guest/*`) and the staff workspace (`/admin/*` for administrators and managers, `/staff/*` for receptionists and housekeeping). `RequireArea` and `Allow` components hide routes a role cannot use, mirroring the server's permission list. Each signed-in person is kept in their own area: opening `/staff/...` as an administrator or manager, or `/admin/...` as a receptionist or housekeeper, redirects to the same page in their own area, and a guest is sent to `/guest`. All requests pass through `src/lib/api.js`, which adds the bearer token, turns network failures into clear messages and signs the user out when the server rejects a token."));
add(H2("11.2  Application tier"));
add(P("The API is created in `server/app.js` and started by `server/server.js`. Each request passes through a fixed pipeline of middleware before it reaches a route handler: security headers, CORS, body-size limit, rejection of unsafe keys, rate limiting, a database-ready guard, authentication, permission check and schema validation. Business rules that several routes share live in `services/` (availability, identity ledger, OCR, invoices, notifications, settings) and `utils/` (billing arithmetic, hotel dates, mail, validation schemas)."));
add(H2("11.3  Data tier"));
add(P(`MongoDB stores ${12} collections, described in Chapter 14. Three databases are used: \`luxurystay\` for production, \`luxurystay_dev\` for development and demonstration, and \`luxurystay_test\` for automated tests. The server refuses to start if \`EXPECTED_DB_NAME\` is set and does not match the database it connected to, or if a required index is missing. Identity-document images are stored on disk in the upload directory, encrypted, and are never served to the public.`));

// 12 Roles and use cases
add(chapterStart("Use Cases and User Roles"));
add(H2("12.1  User roles"));
add(...table("User roles", ["Role", "Who", "Workspace", "Main responsibilities"], [
  ["Visitor", "Anyone not signed in", "Public website", "Browse rooms, check availability, send enquiries, register"],
  ["guest", "Registered guest", "/guest", "Request and manage own reservations, view invoices, review stays, manage profile"],
  ["receptionist", "Front-desk staff", "/staff", "Reservations, identity review, check-in and check-out, payments, enquiries"],
  ["housekeeping", "Housekeeping staff", "/staff", "Cleaning queue, maintenance tasks"],
  ["manager", "Hotel manager", "/admin", "Everything at the front desk and in housekeeping, plus rooms, discounts, reports and reviews"],
  ["admin", "System administrator", "/admin", "Everything a manager can do, plus staff accounts, guest accounts and hotel settings"],
  ["staff", "Legacy role", "/staff", "Kept for older accounts; combined front desk and housekeeping; not assignable to new accounts"],
], [14, 18, 13, 55]));
add(H2("12.2  Permission matrix"));
add(P(`The matrix below is generated from \`server/config/permissions.js\`, the single source of truth for access control. A dot means the role holds the permission.`));
const roleCols = ["admin", "manager", "receptionist", "housekeeping", "staff", "guest"];
add(...table("Role permission matrix", ["Permission", "Meaning", ...roleCols], Object.entries(PERMISSIONS).map(([perm, roles]) => [perm, permDescriptions[perm] || "", ...roleCols.map((r) => (roles.includes(r) ? "●" : ""))]), [21, 21, 8, 10, 12, 13, 7, 8], { size: 14, mono: [0], center: [2, 3, 4, 5, 6, 7] }));
add(landscape("02-use-case-diagram", "Use case diagram grouped by workspace", [H2("12.3  Use case diagram")]));
add(H2("12.4  Main use case descriptions"));
add(...table("Main use cases", ["Use case", "Actor", "Pre-conditions", "Main flow", "Outcome"], [
  ["Request a reservation", "Guest", "Signed in; document image available", "Choose dates and room; enter details; upload CNIC (front and back) or passport; submit", "Pending request holding the nights; front desk notified"],
  ["Confirm a request", "Receptionist", "Pending request", "Open request; compare document and OCR result; confirm (note needed if numbers differ)", "Confirmed booking with invoice number; guest notified"],
  ["Check in", "Receptionist", "Confirmed, verified booking; arrival day reached; room available", "Open arrival; check in", "Booking checked-in; room occupied"],
  ["Record a payment", "Receptionist", "Billable booking", "Enter amount, method and optional reference", "Payment added; paid/partial status updated"],
  ["Check out", "Receptionist", "Checked-in booking; balance settled unless allowed by settings", "Open departure; check out", "Booking checked-out; room sent to cleaning"],
  ["Clean a room", "Housekeeping", "Room in cleaning", "Start; mark clean", "Room available again"],
  ["View reports", "Manager", "Signed in", "Choose period", "Revenue, occupancy, reservations, rate and ratings"],
  ["Create a staff account", "Administrator", "Signed in", "Enter name, email, role and password", "New staff member can sign in"],
], [17, 13, 22, 28, 20], { size: 15 }));

// 13 DFD
add(chapterStart("Data Flow Diagrams"));
add(P("The data flow diagrams show how information moves between the people who use the system, its main processes and its data stores. They are derived from the routes and services in the code."));
add(P("Level 0 treats the system as a single process and shows who exchanges data with it. Level 1 divides the system into six processes; each data store corresponds to one or more MongoDB collections, and process 5.0 (reports) only reads."));
add(landscape("03-dfd-level-0", "Data flow diagram, level 0 (context)", [H2("13.1  Context diagram (level 0)")]));
add(landscape("04-dfd-level-1", "Data flow diagram, level 1", [H2("13.2  Level 1 diagram")]));

// 14 Database
add(chapterStart("Database Design and MongoDB Collections"));
add(P("LuxuryStay HMS uses MongoDB through Mongoose models in `server/models`. Each model maps to one collection; collection names are the lower-case plural that Mongoose derives from the model name. References between collections are stored as ObjectIds."));
add(...table("MongoDB collections", ["Collection", "Model file", "Purpose", "Important indexes"], [
  ["users", "User.js", "Staff and guest accounts, roles, sign-in security fields", "email unique; role + isActive; resetTokenHash"],
  ["rooms", "Room.js", "Rooms, type, price, capacity, status, housekeeping fields", "roomNumber unique; isActive + status"],
  ["bookings", "Booking.js", "Reservations with guest details, identity check, folio, payments and audit fields", "guest + createdAt; room + status + dates; invoiceNumber unique (when set)"],
  ["roomnights", "RoomNight.js", "One document per room per night held by an active booking", "room + night unique; booking"],
  ["identitydocuments", "IdentityDocument.js", "Binds a normalised document number to one guest account", "_id is the document key"],
  ["identitynights", "IdentityNight.js", "Nights held by a document, preventing duplicate stays with one document", "key + night unique; booking"],
  ["maintenances", "Maintenance.js", "Maintenance issues and their progress", "room + status; status + createdAt"],
  ["feedbacks", "Feedback.js", "Guest reviews of completed stays", "booking unique; guest + createdAt; status + createdAt"],
  ["contacts", "Contact.js", "Enquiries from the website", "status + createdAt"],
  ["notifications", "Notification.js", "In-app notifications for a user or roles", "user; roles; createdAt (expires after 60 days)"],
  ["settings", "Settings.js", "Hotel-wide settings (one document)", "key unique"],
  ["counters", "Counter.js", "Atomic sequences for invoice numbers", "_id"],
], [21, 21, 33, 25], { size: 15, mono: [0, 1] }));
add(P("Figure 14.1 shows how the collections reference each other. A version listing every field of every collection is provided as `documentation/diagrams/05b-database-collections-detail.png`; the tables in Section 14.1 give the fields of the three central collections."));
add(landscape("05-database-relationships", "Collections and their references"));
add(H2("14.1  Key collections in detail"));
add(...table("users", ["Field", "Type", "Notes"], [
  ["name", "String", "Required, up to 80 characters"], ["email", "String", "Required, unique, lower-case"], ["phone", "String", "Optional"],
  ["password", "String", "bcrypt hash; never returned by the API"], ["role", "String", ROLES.join(" | ")], ["isActive", "Boolean", "Deactivated accounts cannot sign in"],
  ["tokenVersion", "Number", "Incremented to revoke issued tokens"], ["failedLoginCount, lockUntil", "Number, Date", "Lockout after repeated failures"],
  ["lastLoginAt, passwordChangedAt", "Date", "Audit"], ["resetTokenHash, resetTokenExpires", "String, Date", "Hash of the reset token only"], ["createdBy", "ObjectId → users", "Staff member who created the account"],
], [32, 22, 46], { size: 16, mono: [0] }));
add(...table("rooms", ["Field", "Type", "Notes"], [
  ["roomNumber", "String", "Required, unique"], ["name", "String", "Required"], ["type", "String", "Serene Room | Signature Suite | Royal Residence"],
  ["description, amenities", "String, [String]", "Shown on the website"], ["pricePerNight", "Number", "Required, ≥ 0"], ["capacity, bedType, floor", "Number, String, Number", "Required"],
  ["status", "String", "available | occupied | reserved | cleaning | maintenance"], ["isActive", "Boolean", "Retired rooms are hidden"],
  ["cleaningStartedAt, cleaningBy", "Date, ObjectId → users", "Housekeeping in progress"], ["lastCleanedAt, lastCleanedBy", "Date, ObjectId → users", "Last completed cleaning"],
], [32, 26, 42], { size: 16, mono: [0] }));
add(...table("bookings", ["Field", "Type", "Notes"], [
  ["guest, room", "ObjectId → users, rooms", "Required"], ["checkInDate, checkOutDate", "Date", "Hotel dates (time zone Asia/Karachi by default)"],
  ["numberOfGuests, totalNights", "Number", "Within room capacity and maximum stay"],
  ["guestDetails", "Embedded object", "fullName, phone, email, address, nationality, documentType (cnic | passport), documentNumber, documentFront/Back (file names), emergencyContact, vehicleNumber"],
  ["verificationStatus, verificationMethod", "String", "pending | verified | rejected; number-match | staff-review | staff-in-person"],
  ["identityCheck", "Embedded object", "status (not-applicable | number-matched | number-mismatch | unreadable | error), extractedNumber, detail, checkedAt"],
  ["bookingStatus", "String", "pending | confirmed | rejected | checked-in | checked-out | cancelled"],
  ["pricePerNight, roomCharges, charges[ ]", "Number, [Charge]", "Rate fixed at booking time; extras with quantity"],
  ["discountAmount, taxRate, taxAmount, totalAmount", "Number", "Calculated by utils/billing.js"],
  ["payments[ ], amountPaid, paymentStatus", "[Payment], Number, String", "amount, method (cash | card | bank-transfer), reference, receivedBy, receivedAt; unpaid | partial | paid"],
  ["invoiceNumber", "String", "INV-<year>-<sequence>, unique when set"],
  ["createdBy, verifiedBy, checkedInBy, checkedOutBy, cancelledBy", "ObjectId → users", "Audit trail with matching timestamps"],
], [32, 22, 46], { size: 16, mono: [0] }));
add(H2("14.2  Integrity mechanisms"));
add(...bullets([
  "**Room-night ledger.** When a reservation becomes active, one `roomnights` document is inserted for each night. The unique (room, night) index makes MongoDB itself refuse a second claim, so double booking is impossible even without multi-document transactions.",
  "**Identity ledger.** `identitydocuments` binds a document number to one account, and `identitynights` prevents the same document holding two stays on one night unless the front desk approves it.",
  "**Optimistic concurrency.** Bookings carry a version number; a save based on an outdated copy is rejected instead of overwriting a colleague's change.",
  "**Atomic invoice numbers.** `counters` holds a sequence per year, incremented atomically; a booking receives a number exactly once.",
  "**Start-up checks.** The server verifies the database name, the presence of required indexes and the consistency of the night ledger before accepting requests.",
]));

// 15 Modules
add(chapterStart("Module-by-Module Explanation"));
const module_ = (title, text, items) => [H2(title), P(text), ...(items ? bullets(items) : [])];
add(...module_("15.1  Public website", "The public pages (`Home.jsx`, `RoomPage.jsx`) present the hotel, its experiences and the three room types. Room data comes from `GET /api/public/rooms`, which groups active rooms by type and returns the lowest price, largest capacity and combined amenities without revealing room numbers or status. A booking bar checks availability for chosen dates and passes the search to the guest booking flow after sign-in. The enquiry form posts to `POST /api/contact`."));
add(...module_("15.2  Authentication and accounts", "Visitors register as guests; staff accounts are created by an administrator. Sign-in returns a token and the user's permissions. The profile page lets every user update their details and change their password. The forgot-password flow emails a single-use link that expires after 30 minutes by default; only a hash of the token is stored."));
add(...module_("15.3  Guest portal", "The guest overview shows the next stay, active reservations, nights stayed and the balance due. The booking flow has five steps — dates, room, guest details, identity document and review — and submits a pending request. My bookings lists upcoming, past and cancelled stays with details, invoices and the option to review a completed stay."));
add(...module_("15.4  Reservations", "Staff see all reservations with filters by status and date and a search across guest, email, phone, room and invoice. A reservation drawer shows stay, guest, identity and folio details and offers the actions the role and status allow: confirm or reject, change dates or room, cancel, check in or out, record a payment, add a charge, apply a discount or open the invoice. The new-reservation form books walk-in and telephone guests directly as confirmed."));
add(...module_("15.5  Front desk: check-in and check-out", "The front-desk overview counts arrivals, departures, requests to review and guests in house, lists the week's arrivals and shows room readiness. Check-in requires a confirmed and verified reservation, the arrival day, and a room that is available rather than occupied, cleaning or under maintenance. Check-out requires a settled balance unless the hotel settings allow otherwise and sends the room to the cleaning queue."));
add(...module_("15.6  Billing and invoices", "Each billable reservation has a folio. Room charges are the nightly rate fixed at booking multiplied by the nights; extra charges carry a description, amount and quantity; managers may apply a discount with a reason; tax uses the rate from settings at booking time. Payments are recorded with method and optional reference, and repeated submissions of the same payment form are recognised and applied once. The billing page lists folios with collected, outstanding and settled totals, and the invoice dialog can be printed from the browser."));
add(...module_("15.7  Rooms", "Managers add, edit and retire rooms (type, name, number, floor, rate, capacity, bed type, amenities, description). The rooms page filters by status and shows each room's current state. Front-desk roles may change a room's status where the workflow allows it."));
add(...module_("15.8  Housekeeping", "When a guest checks out, the room enters the cleaning queue. Housekeeping staff start a room, which records who is cleaning it, and mark it clean, which makes it available and records the time and person. Rooms a housekeeper has started are listed first and marked as theirs (“Yours · in progress”), so each person sees the rooms they are responsible for. The housekeeping overview shows rooms to clean, cleaning in progress, rooms cleaned in the last 24 hours and open maintenance."));
add(...module_("15.9  Maintenance", "Any staff member can report an issue for a room with a priority (low, medium, high or urgent). An occupied room cannot be reported until its guest has checked out, and a room can have only one open task. Reporting an issue takes the room out of service; housekeeping, managers and administrators start and complete tasks with a resolution note, after which the room returns to service."));
add(...module_("15.10  Reports and dashboard", "The management dashboard combines today's operational counts with performance over 7, 30 or 90 days or 12 months: revenue collected, occupancy, reservations made, average nightly rate and guest rating, with a revenue chart and room-status breakdown. The reports page provides the same figures for a custom date range and can be printed."));
add(...module_("15.11  Reviews and enquiries", "Guests may review each completed stay once, with an overall rating, cleanliness, service and room ratings, a title and a message. Managers see the rating breakdown and mark reviews as reviewed. Website enquiries are listed for administrators, managers and receptionists, who can reply by email and mark them read or resolved."));
add(...module_("15.12  Staff accounts, guest directory and settings", "Administrators create and edit staff accounts and roles; managers can view the staff list. The list can be searched by name, email or phone and filtered by status (active or deactivated) and by role. New staff receive a temporary password that they change after signing in; changing a role, status or password signs the person out everywhere, and at least one active administrator must always remain. The guest directory shows each guest's reservations, total paid and last stay, and administrators can deactivate an account without deleting its history. Hotel settings (name, address, contact details, currency symbol, tax rate, check-in and check-out times, maximum stay, check-out with balance, social links) can be changed only by an administrator."));
add(...module_("15.13  Identity documents and verification", "A guest booking online uploads the front and back of a CNIC or a passport image (JPEG, PNG or WebP, up to 5 MB each). The server checks the file signature, then, for a CNIC, runs local OCR with tesseract.js and compares the number read with the number typed. The result — number-matched, number-mismatch, unreadable or error — is recorded for staff; it never confirms a booking by itself. Images are encrypted with AES-256-GCM before they are stored and can be opened only by front-desk staff or the booking's owner."));
add(note("Important", ["The CNIC comparison is a project-level consistency check. LuxuryStay HMS is not connected to NADRA or any official identity service and does not claim to verify anyone's identity."]));
add(...module_("15.14  Notifications", "Important events — new requests, confirmations, payments, maintenance — create notifications addressed to a user or to roles. The notification bell shows unread items, refreshes periodically and lets users mark items read. Notifications are deleted automatically after 60 days."));

// 16 Frontend design
add(chapterStart("Frontend Design and User Interface"));
add(H2("16.1  Design system"));
add(P("The interface uses a restrained luxury palette defined as CSS custom properties in `client/src/styles/tokens.css` and applied consistently across the website and the workspaces."));
add(...table("Colour tokens", ["Token", "Value", "Use"], [
  ["Forest", "#123C32", "Primary headings, navigation, primary buttons"], ["Emerald", "#0B2923", "Dark panels and hero overlays"],
  ["Ivory", "#F7F4EC", "Page background"], ["Copper", "#B98256", "Accents, call-to-action buttons, section dividers"],
  ["Stone", "#E8E1D5", "Borders and quiet surfaces"], ["Charcoal", "#202722", "Body text"],
], [20, 20, 60], { mono: [1] }));
add(P("Headings are set in Fraunces, a high-contrast serif, and body text in DM Sans, both loaded from Google Fonts. Surfaces use a four-step elevation scale and radii of 6, 10, 16 and 24 pixels."));
add(H2("16.2  Layout"));
add(...bullets([
  "**Website:** full-width hero with a booking bar, a layered room carousel, room sections, experiences, gallery and enquiry form.",
  "**Workspaces:** a fixed forest-green sidebar with role-specific navigation, a top bar with breadcrumb, date, theme switch and notifications, and a content area of cards, tables and drawers.",
  "**Dialogs and drawers:** forms such as new reservation, add room, record payment and report issue open in focused dialogs; reservation details open in a side drawer.",
]));
add(H2("16.3  Depth and motion"));
add(P("Cards and room images use subtle three-dimensional tilt and parallax (`components/ui/Tilt.jsx`, `lib/useParallax.js`) and Framer Motion transitions. Motion follows the operating system's reduced-motion setting, so users who prefer less movement see static layouts."));
add(H2("16.4  Responsiveness and accessibility"));
add(P("Layouts adapt from desktop to phone width; the website navigation collapses into a menu and tables become stacked cards on narrow screens (Figure 23.40). Form fields have visible labels, required markers and error messages next to the field; a light and a dark theme are available."));

// 17 Backend API
add(chapterStart("Backend APIs and Request Flow"));
add(H2("17.1  API structure"));
const groups = {};
routeList.forEach((r) => { const g = r.path.split("/")[2]; groups[g] = (groups[g] || 0) + 1; });
add(P(`The API exposes ${routeList.length} endpoints under \`/api\`, grouped into ${Object.keys(groups).length} routers. The full list with access rules is in Appendix A.`));
const groupInfo = { auth: "Registration, sign-in, profile, password change and reset", bookings: "Reservations, check-in/out, payments, charges, discounts, invoices, documents", contact: "Website enquiries", feedback: "Guest reviews", maintenance: "Maintenance tasks", notifications: "In-app notifications", public: "Hotel details and room types for the website", reports: "Dashboard, front-desk and finance figures", rooms: "Rooms and housekeeping", settings: "Hotel settings", users: "Staff accounts and guest directory" };
add(...table("API routers", ["Base path", "Endpoints", "Responsibility"], Object.entries(groups).sort().map(([g, n]) => [`/api/${g}`, String(n), groupInfo[g] || ""]), [24, 13, 63], { mono: [0], center: [1] }));
add(H2("17.2  Request and response conventions"));
add(...bullets([
  "Requests and responses use JSON, except reservation requests with documents, which use multipart form data.",
  "Signed-in requests send `Authorization: Bearer <token>`. A missing, expired or revoked token returns 401; a missing permission returns 403.",
  "Successful responses contain `success: true` and the requested data; errors contain `success: false` and a message, and validation errors also list the fields concerned.",
  "Unknown fields are rejected by strict zod schemas, and requests whose body or query contains keys that could be used for operator injection are rejected with 400.",
  "`GET /api/health` reports whether the database is connected (and, outside production, its name).",
]));
add(landscape("07-reservation-request-sequence", "Request flow of an online reservation", [H2("17.3  Example: an online reservation request"), P("The sequence follows `POST /api/bookings` for a guest's online request, as implemented in `routes/bookingRoutes.js`.")]));

// 18 Security
add(chapterStart("Authentication, Authorization and Security"));
add(H2("18.1  Authentication"));
add(...bullets([
  "Passwords are hashed with bcrypt and must have 8–72 characters including a letter and a number.",
  "Sign-in issues a JWT signed with HS256 that expires after `JWT_EXPIRES_IN` (12 hours by default). The token carries the user id and a token version.",
  "Every protected request reloads the user; the request is refused if the account is inactive or the token version is out of date. Signing out, changing a password and resetting a password increment the version, ending all other sessions.",
  "After 8 failed sign-ins an account is locked for 15 minutes.",
  "Password-reset links contain a random 32-byte token; only its hash is stored, it expires after 30 minutes by default, and it can be used once. The reset response is identical whether or not the email belongs to an account.",
]));
add(H2("18.2  Authorization"));
add(P("Authorization is role-based. `config/permissions.js` lists each permission and the roles that hold it (Table 12.2); `requirePermission` guards each protected route, and handlers additionally check ownership where a guest acts on their own booking. The client hides what a role cannot use, but the server is the authority."));
add(H2("18.3  Protection of requests"));
add(...table("Rate limits (server/middleware/rateLimiters.js)", ["Limiter", "Window", "Limit"], [
  ["All /api requests", "15 minutes", "1,500 requests"], ["Sign-in", "15 minutes", "10 attempts"], ["Registration", "60 minutes", "10 accounts"],
  ["Password-reset requests", "15 minutes", "5 requests"], ["Reset-token checks and password changes", "15 minutes", "15 requests"], ["Enquiries", "60 minutes", "8 messages"],
], [46, 24, 30]));
add(...bullets([
  "`helmet` sets security headers; CORS allows only the configured client origins.",
  "JSON bodies are limited to 100 kb; strict schemas reject unexpected fields.",
  "Uploads are limited to two images of up to 5 MB, accepted only when the file signature matches JPEG, PNG or WebP.",
  "Errors are logged on the server without exposing stack traces to clients.",
]));
add(H2("18.4  Data protection"));
add(...bullets([
  "Identity-document images are encrypted with AES-256-GCM using a key derived from `DOCUMENT_KEY`; encrypted files start with an `LSENC1` marker. Without the key, new uploads are refused.",
  "Secrets (JWT secret, email credentials, document key, database URI) are read from environment variables and are not stored in source control; `.env` files are ignored by Git.",
  "Reset tokens and passwords are stored only as hashes and never returned by the API.",
]));
add(H2("18.5  Database safety"));
add(...bullets([
  "`EXPECTED_DB_NAME` pins the server to one database; start-up stops if the connected database differs.",
  "The server does not build indexes automatically at start-up; missing indexes are reported, and `npm run db:indexes -- --confirm=<database>` creates them only when the database name is confirmed.",
  "Tests run only on a database whose name ends in `_test`; the helper refuses any other name.",
  "Maintenance scripts (`create-admin`, `seed:dev-rooms`, `seed:dev-demo`) print the connected database and refuse the production and test databases.",
]));

// 19 Workflows
add(landscape("06-booking-lifecycle", "Reservation states and transitions", [chapterStart("Booking and Room Management Workflows"), H2("19.1  Reservation lifecycle")]));
add(P("A reservation made online starts as **pending** and holds its nights immediately, so no one else can take the room while staff review it. Staff confirm it after reviewing the identity document or reject it with a reason. A reservation made at the desk starts as **confirmed** because the document was inspected in person. Pending, confirmed and checked-in reservations hold room nights; rejected, cancelled and checked-out ones release them."));
add(H2("19.2  Availability"));
add(P("Availability is decided by the `roomnights` collection. To hold a stay, the server inserts one document per night in date order; if any night already exists, the insert fails on the unique index, the nights just inserted are removed and the request is refused with a conflict. Search results use the same ledger together with a check of active bookings, so the website, the guest portal and the desk always agree."));
add(H2("19.3  Room status"));
add(...table("Room status transitions", ["From", "Event", "To"], [
  ["available", "Guest checks in", "occupied"],
  ["occupied", "Guest checks out", "cleaning"],
  ["cleaning", "Housekeeping marks the room clean", "available"],
  ["any status except occupied", "Maintenance issue reported", "maintenance"],
  ["maintenance", "Maintenance completed", "available"],
  ["available ↔ reserved; available, reserved, maintenance or occupied → cleaning; cleaning, maintenance or occupied → available", "Front desk changes the status by hand (rooms:status)", "chosen status"],
  ["any", "Manual change to occupied or maintenance", "refused: these follow check-in and maintenance reports"],
], [26, 48, 26]));
add(H2("19.4  Check-in and check-out rules"));
add(...bullets([
  "Only confirmed and verified reservations can be checked in, from the arrival date and before the departure date.",
  "The room must be active and available; a room still being cleaned or under maintenance blocks check-in with a clear message.",
  "Check-out requires the folio to be settled unless the setting `allowCheckoutWithBalance` is enabled.",
  "Invoice numbers are assigned when a desk reservation is created or a request is confirmed, and otherwise at the first payment, at check-out or when the invoice is first opened.",
]));

// 20 Installation
add(chapterStart("Installation and Environment Configuration"));
add(H2("20.1  Prerequisites"));
add(...bullets(["Node.js 24 or later with npm", "MongoDB 8 running locally (default `mongodb://127.0.0.1:27017`) or a hosted MongoDB URI", "A Gmail account with an app password, or another SMTP account, if password-reset email is required"]));
add(H2("20.2  Install dependencies"));
add(code(["cd LuxuryStay-HMS/server", "npm install", "", "cd ../client", "npm install"]));
add(spacer());
add(H2("20.3  Server configuration"));
add(P("Copy `server/.env.example` to `server/.env` and fill in the values. Never commit `.env`."));
add(...table("Server environment variables", ["Variable", "Required", "Purpose"], [
  ["PORT", "No (5000)", "Port of the API"], ["NODE_ENV", "No", "development or production"],
  ["MONGO_URI", "Yes", "MongoDB connection string including the database name"], ["EXPECTED_DB_NAME", "Recommended", "Database the server must connect to; start-up stops on a mismatch"],
  ["JWT_SECRET", "Yes", "At least 32 random characters for signing tokens"], ["JWT_EXPIRES_IN", "No (12h)", "Token lifetime"],
  ["CLIENT_URL", "No (http://localhost:5173)", "Client address used in reset links and CORS"], ["CORS_ORIGINS", "No", "Comma-separated allowed origins"],
  ["HOTEL_TIMEZONE", "No (Asia/Karachi)", "Calendar used for stay dates"], ["MAX_STAY_NIGHTS, MAX_ADVANCE_DAYS", "No (30, 365)", "Booking limits"],
  ["EMAIL_USER, EMAIL_APP_PASSWORD", "For reset email", "Gmail address and 16-letter app password"], ["EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_SECURE", "No", "Sender name and an alternative SMTP server"],
  ["RESET_TOKEN_MINUTES", "No (30)", "Lifetime of reset links"], ["DOCUMENT_KEY", "For document uploads", "At least 32 random characters; encrypts identity documents"],
  ["UPLOAD_DIR, OCR_TIMEOUT_MS", "No", "Upload folder and OCR time limit"], ["TRUST_PROXY", "No", "Set when running behind a reverse proxy"],
  ["LEDGER_REPAIR_ON_START", "No (false)", "Lets start-up repair the night ledger instead of only reporting"],
], [36, 20, 44], { size: 16, mono: [0] }));
add(note("Generating secrets", ["`node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"` prints a suitable value for JWT_SECRET or DOCUMENT_KEY. Keep DOCUMENT_KEY safe: encrypted documents cannot be opened without it."]));
add(spacer());
add(H2("20.4  Client configuration"));
add(P("The client reads `VITE_API_URL` and defaults to `http://localhost:5000/api`. Copy `client/.env.example` to `client/.env` only if the API runs elsewhere."));
add(H2("20.5  Prepare the database"));
add(code([
  "cd server",
  "# Create the indexes the server requires (the name must be confirmed)",
  "npm run db:indexes -- --confirm=luxurystay_dev",
  "",
  "# Create the first administrator (refuses luxurystay and luxurystay_test)",
  "$env:ADMIN_EMAIL = \"admin@example.com\"",
  "$env:ADMIN_PASSWORD = \"<choose a strong password>\"",
  "npm run create-admin",
  "",
  "# Optional: fictional demonstration data for luxurystay_dev only",
  "$env:SEED_DEMO_PASSWORD = \"<password for the demo accounts>\"",
  "npm run seed:dev-demo",
]));
add(spacer());

// 21 Running
add(chapterStart("How to Run the Project Locally"));
add(P("Start MongoDB, then run the API and the client in two terminals."));
add(code(["# Terminal 1 — API on http://localhost:5000", "cd LuxuryStay-HMS/server", "npm run dev", "", "# Terminal 2 — client on http://localhost:5173", "cd LuxuryStay-HMS/client", "npm run dev"]));
add(spacer());
add(...table("Local addresses", ["Address", "What it is"], [
  ["http://localhost:5173", "Website, guest portal and staff workspace"],
  ["http://localhost:5000/api/health", "API health check, e.g. {\"success\":true,\"database\":\"connected\",\"databaseName\":\"luxurystay_dev\"}"],
  ["http://localhost:5173/auth", "Sign-in and registration"],
], [36, 64], { mono: [0] }));
add(H2("21.1  Useful scripts"));
const scriptRows = [
  ...Object.entries(serverPkg.scripts).map(([k, v]) => ["server", `npm run ${k}`, v]),
  ...Object.entries(clientPkg.scripts).map(([k, v]) => ["client", `npm run ${k}`, v]),
];
add(...table("npm scripts", ["Folder", "Command", "Runs"], scriptRows, [12, 32, 56], { size: 16, mono: [1, 2] }));
add(P("`npm run start:test` starts a separate API on port 5055 that is forced onto the test database, uses temporary uploads and sends no email; it is intended for manual testing without touching development data."));
add(P("`npm test` runs the backend tests on `<database>_test`, which each test file drops and recreates. To keep `luxurystay_test` untouched as well, point the tests at a throwaway database: in PowerShell, `$env:MONGO_URI = \"mongodb://127.0.0.1:27017/lsverify\"; npm test` runs everything on `lsverify_test`."));
add(H2("21.2  Production build"));
add(P("`npm run build` in `client` produces static files in `client/dist`, which any static web server can host. The API is started with `npm start` and must have `NODE_ENV=production`, a strong `JWT_SECRET`, the production `CLIENT_URL` and, behind a proxy, `TRUST_PROXY`."));

// 22 Testing
add(chapterStart("Testing Methodology and Test Results"));
add(H2("22.1  Methodology"));
add(...bullets([
  "**Automated backend tests** use the Node.js test runner (`node:test`). Each suite starts the real Express application against the isolated `luxurystay_test` database, creates its own data and checks responses and stored documents. OCR and email are replaced by test doubles. For this report the suite was run on a separate throwaway database, `lsverify_test`, so that neither `luxurystay_test` nor the development data was touched.",
  "**Database safety tests** start the real server with a wrong `EXPECTED_DB_NAME` and run the maintenance scripts against protected database names to prove that they refuse before writing.",
  "**Static checks and build:** the client is linted with oxlint and built with Vite.",
  "**Browser verification:** scripted sessions in Microsoft Edge signed in as each role, opened the main screens and checked visible content and the browser console for errors.",
]));
add(H2("22.2  Automated test suites"));
add(...table("Backend test suites (server/tests)", ["Suite", "Tests", "Area covered"], testSuites.map((s) => [s.file, String(s.count), {
  "auth.test.js": "Registration, sign-in, lockout, tokens, profile", "bookings.test.js": "Reservations, availability, overlap prevention, folios",
  "create-admin.test.js": "Database guard of create-admin and the development seed scripts", "db-safety.test.js": "Test-database naming, read-only settings, index and ledger checks, start-up refusal",
  "identity.test.js": "Document upload, OCR outcomes, encryption, staff review rules", "ocr-engine.test.js": "Real OCR engine on a fictional specimen image",
  "operations.test.js": "Check-in/out, housekeeping, maintenance, payments, invoices", "password-reset.test.js": "Reset tokens, single use, rate limits, sign-out everywhere",
  "public.test.js": "Public hotel and room endpoints", "rbac.test.js": "Role permissions on protected endpoints", "roles.test.js": "The five roles, staff creation by administrators, permissions of new staff, role and status filters",
}[s.file] || ""]), [30, 10, 60], { mono: [0], center: [1] }));
add(H2("22.3  Results"));
add(...table("Test results", ["Check", "Date", "Result"], [
  ["Full backend suite (`npm test`) on the isolated database lsverify_test", today, `${testTotal} tests, ${testTotal} passed, 0 failed`],
  ["Record counts of luxurystay_dev and luxurystay_test before and after the suite", today, "Identical; the production database was not opened"],
  ["Client production build (`npm run build`)", today, "Succeeded"],
  ["Client lint (`oxlint`)", today, "0 errors, 31 warnings (react set-state-in-effect)"],
  ["Browser check of the development stack (website, sign-in, manager, receptionist, housekeeping and guest screens)", today, "All screens loaded with demonstration data; no browser console errors"],
  ["Browser check of all five roles on the development stack (fictional demo accounts)", today, "Each role reached its own dashboard; a receptionist was created and later deactivated through the Staff page; the deactivated account could not sign in; restricted pages showed \"You do not have access\"; 38 of 38 area-redirect checks passed"],
], [52, 18, 30], { size: 16 }));
add(note("What was not run", [
  "The suite was not run against luxurystay_test, to leave that database untouched; it was run on lsverify_test instead.",
  "There are no automated frontend unit tests and no load or performance tests.",
  "Administrator screens were verified with a fictional demo administrator, not with the project owner's administrator account.",
]));

// 23 Screenshots
add(chapterStart("Application Screenshots"));
add(P("All screenshots were captured on 14 October 2026 from the application running locally (client on port 5173, API on port 5000, database `luxurystay_dev`) at a 1440 × 900 desktop viewport, unless noted. All names, email addresses, phone numbers and document numbers are fictional demonstration data; CNIC numbers deliberately begin with 00000, which no real CNIC does. Lists that contain accounts were filtered to the demonstration accounts."));
add(H2("23.1  Public website"));
add(shot("01-public-home", "Public home page with booking bar and room carousel"));
add(shot("02-public-room-collection", "Room collection section on the home page"));
add(shot("03-room-details", "Room-type page: amenities and availability check"));
add(shot("03b-room-details-booking", "Room-type page: photo gallery"));
add(H2("23.2  Authentication"));
add(shot("04-sign-in", "Sign-in page"));
add(shot("05-sign-in-validation", "Sign-in validation messages"));
add(shot("06-registration", "Guest registration form"));
add(shot("07-registration-validation", "Registration validation messages"));
add(shot("08-forgot-password", "Forgot-password page"));
add(H2("23.3  Management workspace (manager)"));
add(P("The manager uses the same `/admin` workspace as the administrator; administrator-only pages are noted below.", { keepNext: true }));
add(shot("09-manager-dashboard", "Management dashboard: today's tasks and 30-day performance"));
add(shot("10-manager-dashboard-charts", "Dashboard revenue chart, latest reservations and period figures"));
add(shot("11-front-desk", "Front-desk overview"));
add(shot("12-reservations", "Reservations list with status filters and search"));
add(shot("13-reservation-details", "Reservation drawer with stay, guest and folio details"));
add(shot("14-invoice", "Invoice dialog"));
add(shot("15-new-reservation-form", "New reservation form with available rooms"));
add(shot("16-rooms", "Room management"));
add(shot("17-add-room-form", "Add room form"));
add(shot("18-guest-directory", "Guest directory (filtered to demonstration accounts)"));
add(shot("19-billing", "Billing: folios, collected and outstanding totals"));
add(shot("20-reports", "Reports for a chosen period"));
add(shot("21-reviews", "Guest reviews and rating breakdown"));
add(shot("22-enquiries", "Website enquiries"));
add(shot("23-staff-accounts", "Staff list (manager view, filtered to demonstration accounts)"));
add(shot("23b-admin-add-staff-form", "Add staff member form (administrator), with validation messages"));
add(shot("24-maintenance", "Maintenance tasks"));
add(shot("25-settings-manager-no-access", "Settings is restricted to administrators: the page a manager sees"));
add(shot("25b-admin-settings", "Hotel settings (administrator)"));
add(H2("23.4  Receptionist"));
add(shot("26-receptionist-overview", "Receptionist overview"));
add(shot("27-arrivals", "Arrivals (check-in)"));
add(shot("28-departures", "Departures (check-out) with no departures waiting"));
add(shot("29-record-payment-form", "Record payment dialog"));
add(H2("23.5  Housekeeping"));
add(shot("30-housekeeping-overview", "Housekeeping overview"));
add(shot("31-housekeeping-queue", "Cleaning queue: the room this housekeeper started is marked as theirs"));
add(shot("32-report-issue-form", "Report a maintenance issue"));
add(H2("23.6  Guest portal"));
add(shot("33-guest-home", "Guest overview with the next stay"));
add(shot("34-guest-book-room", "Booking flow: dates and room selection"));
add(shot("35-guest-my-bookings", "My bookings"));
add(shot("36-guest-profile", "Guest profile and password"));
add(H2("23.7  Responsive layout"));
add(shot("37-mobile-home", "Home page at phone width (390 × 844)", { width: 230, maxH: 520 }));
add(H2("23.8  Screens not captured"));
add(...bullets([
  "**The project owner's administrator account.** Administrator screens (Figures 23.25 and 23.28) were captured with a fictional demo administrator, Zainab Mirza; the owner's own account was not used.",
  "**Submitting the staff form.** The form is shown with its validation messages; creating and deactivating an account through it was verified in the browser (Chapter 22) but not photographed.",
  "**Guest reservation submission and the identity-review screen with documents.** The development configuration has no `DOCUMENT_KEY`, so uploads are refused (Chapter 24); no real or fictional identity-document images were uploaded.",
  "**Password-reset email and reset page with a valid link.** Sending email was not part of documentation; the forgot-password page is shown in Figure 23.9.",
]));

// 24 Known issues
add(chapterStart("Known Issues and Limitations"));
add(...table("Known issues and limitations", ["#", "Issue", "Effect", "Remedy"], [
  ["1", "Document uploads need `DOCUMENT_KEY`", "Without it, online reservation requests with documents are refused with 503", "Set a strong DOCUMENT_KEY in server/.env"],
  ["2", "Password-reset email needs a mail account", "Without valid credentials the reset page reports that email is unavailable", "Set EMAIL_USER and a Gmail app password, or SMTP settings; restart the API"],
  ["3", "CNIC check is a number comparison only", "It cannot detect a forged card that shows the typed number", "Staff review every online request; official verification is out of scope"],
  ["4", "OCR language data is downloaded on first use", "The first CNIC check needs internet access and is slower", "Run one check after installation; data is cached in server/.ocr-cache"],
  ["5", "No online payment gateway", "Payments are recorded manually by staff", "Future enhancement"],
  ["6", "Room photographs are bundled with the client by room type", "Rooms of one type share the same images; staff cannot upload photos", "Future enhancement"],
  ["7", "Notifications are in-app only", "No SMS or email notifications for reservations", "Future enhancement"],
  ["8", "31 lint warnings (react set-state-in-effect)", "No functional effect observed; possible extra renders", "Refactor the affected effects"],
  ["9", "No automated frontend tests or load tests", "UI regressions are found by manual or scripted browser checks", "Add component and end-to-end tests"],
  ["10", "Single property, single currency symbol", "Not suited to hotel chains as is", "Future enhancement"],
  ["11", "Demonstration data uses fixed dates", "As days pass, demo arrivals become overdue", "Re-create the development database and re-run the seed"],
], [5, 30, 35, 30], { size: 15, center: [0] }));

// 25 Future
add(chapterStart("Future Enhancements"));
add(...bullets([
  "Online payments through a payment gateway, with refunds linked to cancellations.",
  "Email and SMS confirmations and reminders for guests.",
  "Per-room photo uploads and a richer room editor.",
  "Rate plans: seasonal prices, weekend rates, packages and promotional codes.",
  "Multi-property support and integration with channel managers.",
  "Export of reports to spreadsheet and PDF, and scheduled email reports for managers.",
  "Two-factor authentication for staff accounts.",
  "End-to-end browser tests and frontend component tests in continuous integration.",
  "Deployment scripts (for example, containers) and automated backups.",
]));

// 26 Conclusion
add(chapterStart("Conclusion"));
add(P("LuxuryStay HMS meets its aim of providing a secure, role-based web application for running a hotel. Visitors can explore rooms and check availability, guests can request and manage stays online, and staff can handle the full cycle of reservation, identity review, check-in, billing, check-out, housekeeping and maintenance, while managers follow performance on live dashboards."));
add(P("The project's most important technical decisions protect correctness and data: availability is enforced by a unique database index so that double booking cannot occur, sessions can be revoked, every endpoint checks a named permission, identity documents are encrypted and are never treated as officially verified, and production, development and test data are kept apart by enforced safeguards. The automated test suite and browser checks reported in Chapter 22 support these claims."));
add(P("The limitations listed in Chapter 24 — chiefly manual payment recording, configuration-dependent document upload and email, and the absence of frontend automated tests — point to clear next steps. The modular structure of the code provides a sound base for the enhancements proposed in Chapter 25."));

// 27 References
add(chapterStart("References and Technical Resources"));
add(...numbered([
  "Node.js documentation. https://nodejs.org/docs/latest/api/",
  "Node.js test runner (node:test). https://nodejs.org/api/test.html",
  "Express 5 documentation. https://expressjs.com/",
  "MongoDB manual. https://www.mongodb.com/docs/manual/",
  "Mongoose documentation. https://mongoosejs.com/docs/",
  "React documentation. https://react.dev/",
  "Vite documentation. https://vite.dev/guide/",
  "React Router documentation. https://reactrouter.com/",
  "Framer Motion documentation. https://motion.dev/",
  "Zod documentation. https://zod.dev/",
  "Jones, M., Bradley, J. and Sakimura, N. (2015) JSON Web Token (JWT), RFC 7519. https://www.rfc-editor.org/rfc/rfc7519",
  "jsonwebtoken package. https://github.com/auth0/node-jsonwebtoken",
  "Helmet documentation. https://helmetjs.github.io/",
  "express-rate-limit documentation. https://express-rate-limit.mintlify.app/",
  "Multer documentation. https://github.com/expressjs/multer",
  "Tesseract.js documentation. https://github.com/naptha/tesseract.js",
  "Nodemailer documentation. https://nodemailer.com/",
  "OWASP Cheat Sheet Series: Authentication, Password Storage and Forgot Password. https://cheatsheetseries.owasp.org/",
  "NIST (2001) Advanced Encryption Standard (AES), FIPS 197; and NIST SP 800-38D (2007), Galois/Counter Mode. https://csrc.nist.gov/",
  "Google Fonts: Fraunces and DM Sans. https://fonts.google.com/",
], "refs"));

// Appendices
chapter = "A";
add(H1("Appendix A  API Endpoints"));
add(P(`All ${routeList.length} endpoints, extracted from the route files. "Access" lists the permission required; endpoints marked "signed in" check ownership or role inside the handler.`));
add(...table("API endpoints", ["Method", "Path", "Access"], routeList.map((r) => [r.method, r.path, accessOf(r)]), [11, 44, 45], { size: 15, mono: [0, 1] }));
add(P("`GET /api/health` is defined in `app.js` and is public.", { run: { size: 18 } }));
chapter = "B";
add(H1("Appendix B  Configuration Examples"));
add(P("Example `server/.env` for local development. Values in angle brackets must be replaced; no real secrets are shown."));
add(code([
  "PORT=5000",
  "NODE_ENV=development",
  "MONGO_URI=mongodb://127.0.0.1:27017/luxurystay_dev",
  "EXPECTED_DB_NAME=luxurystay_dev",
  "JWT_SECRET=<at least 32 random characters>",
  "JWT_EXPIRES_IN=12h",
  "CLIENT_URL=http://localhost:5173",
  "HOTEL_TIMEZONE=Asia/Karachi",
  "EMAIL_USER=<gmail address>",
  "EMAIL_APP_PASSWORD=<16-letter Gmail app password>",
  "DOCUMENT_KEY=<at least 32 random characters>",
]));
add(spacer());
add(P("Example `client/.env` (only needed when the API is not at the default address):"));
add(code(["VITE_API_URL=http://localhost:5000/api"]));
add(spacer());
chapter = "C";
add(H1("Appendix C  Project Directory Structure"));
add(P("Generated from the project folder; dependency, build, upload and secret files are omitted."));
const chunk = 60;
for (let i = 0; i < tree.length; i += chunk) { add(code(tree.slice(i, i + chunk))); add(spacer(60)); }
chapter = "D";
add(H1("Appendix D  Automated Test Cases"));
add(P("Names of the backend tests, as written in the test files."));
testSuites.forEach((s) => add(...table(s.file, ["#", "Test"], s.names.map((n, i) => [String(i + 1), n]), [7, 93], { size: 15, center: [0] })));

// ============================================================= document ==
const headerPara = (text) => new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.copper, space: 4 } }, children: [new TextRun({ text, font: SANS, size: 15, color: C.muted })] })] });
const footerPara = () => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: SANS, size: 17, color: C.forest })] })] });

// Splits the body into portrait sections and landscape diagram pages.
function bodySections() {
  const out = [];
  let current = [];
  const head = { default: headerPara("LuxuryStay HMS — Project Documentation") };
  const foot = { default: footerPara() };
  const flush = () => {
    if (!current.length) return;
    const first = out.length === 0;
    out.push({ properties: { page: { size: PAGE, margin: MARGIN, pageNumbers: first ? { start: 1, formatType: NumberFormat.DECIMAL } : { formatType: NumberFormat.DECIMAL } } }, headers: head, footers: foot, children: current });
    current = [];
  };
  for (const item of body) {
    if (item && item.landscape) {
      flush();
      out.push({ properties: { page: { size: { ...PAGE, orientation: PageOrientation.LANDSCAPE }, margin: LMARGIN, pageNumbers: { formatType: NumberFormat.DECIMAL } } }, headers: head, footers: foot, children: item.landscape });
    } else current.push(item);
  }
  flush();
  return out;
}

const doc = new Document({
  creator: "LuxuryStay HMS project team",
  title: "LuxuryStay HMS — Hotel Management System: Project Documentation",
  description: "Project documentation for LuxuryStay HMS",
  styles: {
    default: { document: { run: { font: SANS, size: 20, color: C.charcoal }, paragraph: { spacing: { line: 288 } } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: SERIF, size: 40, color: C.forest }, paragraph: { spacing: { before: 0, after: 280 }, outlineLevel: 0, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.copper, space: 8 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: SERIF, size: 28, color: C.forest }, paragraph: { spacing: { before: 300, after: 140 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: SANS, size: 21, bold: true, color: C.copperDeep }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2, keepNext: true } },
      { id: "FrontHeading", name: "Front Heading", basedOn: "Normal", next: "Normal", run: { font: SERIF, size: 40, color: C.forest }, paragraph: { spacing: { after: 280 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.copper, space: 8 } } } },
      { id: "FigureCaption", name: "Figure Caption", basedOn: "Normal", next: "Normal", run: { font: SANS, size: 17, italics: true, color: C.copperDeep }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 40, after: 260 } } },
      { id: "PlainCaption", name: "Plain Caption", basedOn: "Normal", next: "Normal", run: { font: SANS, size: 17, bold: true, color: C.forest }, paragraph: { spacing: { before: 120, after: 80 }, keepNext: true } },
      { id: "TableCaption", name: "Table Caption", basedOn: "Normal", next: "Normal", run: { font: SANS, size: 17, bold: true, color: C.forest }, paragraph: { spacing: { before: 120, after: 80 }, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } }, run: { color: C.copper } } }, { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 800, hanging: 260 } } } }] },
      ...["steps", "objectives", "refs"].map((reference) => ({ reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 340 } }, run: { color: C.copperDeep, bold: true } } }] })),
    ],
  },
  sections: [
    { properties: { page: { size: PAGE, margin: MARGIN } }, children: cover },
    { properties: { page: { size: PAGE, margin: MARGIN, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } }, headers: { default: headerPara("LuxuryStay HMS — Hotel Management System") }, footers: { default: footerPara() }, children: front },
    ...bodySections(),
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUT, buffer);
  console.log("written", OUT, `${Math.round(buffer.length / 1024)} KB`);
  console.log(`figures ${figures.length}, tables ${tables.length}, endpoints ${routeList.length}, tests ${testTotal}`);
});
