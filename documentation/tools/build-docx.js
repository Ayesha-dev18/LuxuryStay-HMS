// Builds LuxuryStay_HMS_Documentation.docx (condensed edition, about 25–30 pages)
// from the project itself. The full 88-page edition is build-docx-full.js.
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
const OUT = path.join(DOC, "LuxuryStay_HMS_Documentation.docx");

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
// Condensed edition (about 25–30 pages). The full 88-page edition is built by
// build-docx-full.js and kept in documentation/archive/.
const front = [];
const frontHeading = (t, breakBefore = true) => new Paragraph({ style: "FrontHeading", pageBreakBefore: breakBefore, children: [new TextRun(t)] });

front.push(frontHeading("Project Team and Declaration", false));
front.push(...table("Project team", ["No.", "Student ID", "Name", "Signature"], team.map(([id, n], i) => [String(i + 1), id, n, ""]), [7, 26, 37, 30], { size: 19, center: [0] }));
front.push(new Paragraph({ style: "Heading3", children: [new TextRun("Declaration")] }));
front.push(P("We declare that this project report and the software it describes, **LuxuryStay HMS — Hotel Management System**, are our own work, carried out as part of our academic programme. The work of others, including open-source libraries and their documentation, is acknowledged in the text and the references. This work has not been submitted for any other award."));
front.push(P(`Date: ${blank}`, { align: AlignmentType.LEFT }));
front.push(P("This declaration is a template; adjust it to the wording your institution requires.", { run: { italics: true, color: C.muted, size: 17 } }));

front.push(frontHeading("Acknowledgement and Abstract"));
front.push(new Paragraph({ style: "Heading3", children: [new TextRun("Acknowledgement")] }));
front.push(P("We thank our supervisor, ______________________, and the faculty of the ______________________ department of ______________________ for their guidance, and the maintainers of the open-source tools on which LuxuryStay HMS is built."));
front.push(new Paragraph({ style: "Heading3", children: [new TextRun("Abstract")] }));
front.push(P("Hotels must keep reservations, room status, guest identity, payments and housekeeping in step. When these live in registers, spreadsheets and separate tools, rooms are double-booked, balances are missed and managers lack a reliable view of the business."));
front.push(P(`LuxuryStay HMS is a web-based hotel management system built on the MERN stack: MongoDB with Mongoose, Express 5 on Node.js, and a React 19 single-page application built with Vite. It provides a public website with live room availability, a guest portal for reservation requests with identity-document upload, and a staff workspace for the front desk, housekeeping, management and administration. Five roles are mapped to ${Object.keys(PERMISSIONS).length} named permissions enforced on every one of the ${routeList.length} API endpoints. Double booking is prevented by a unique database index on each room-night, identity documents are encrypted with AES-256-GCM, and a local OCR engine compares a typed CNIC number with the uploaded image as a project-level check only — every online request is confirmed by staff.`));
front.push(P(`The backend has ${testTotal} automated tests in ${testSuites.length} suites, run on an isolated database, and the main user journeys were tested end to end in a browser. This report describes the requirements, architecture, data model, roles, workflows and security of the system, how to install and run it, and the verified test results.`));
front.push(new Paragraph({ children: [new TextRun({ text: "Keywords: ", bold: true, color: C.forest }), new TextRun("hotel management system, MERN stack, role-based access control, reservations, room-night ledger")], spacing: { before: 120 } }));

front.push(frontHeading("Table of Contents"));
front.push(new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }));

// ------------------------------------------------------------ main body --
const body = [];
const add = (...items) => items.forEach((i) => (Array.isArray(i) ? body.push(...i) : body.push(i)));
// A chapter that continues on the same page, after a little space.
const chapterInline = (title) => { chapter += 1; return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 420, after: 240 }, children: [new TextRun(`${chapter}  ${title}`)] }); };

// Screenshots two to a row, with captions, to keep the report compact.
const shotGrid = (items) => {
  const colW = Math.floor(CONTENT / 2);
  const imgW = 296;
  const cells = items.map(([name, caption]) => {
    figureNo[chapter] = (figureNo[chapter] || 0) + 1;
    const label = `Figure ${chapter}.${figureNo[chapter]}: ${caption}`;
    figures.push(label);
    const file = path.join(DOC, "screenshots", `${name}.png`);
    const { w, h } = pngSize(file);
    const height = Math.round((imgW * h) / w);
    const width = h > w ? Math.round((imgW * 0.55)) : imgW;
    return new TableCell({
      width: { size: colW, type: WidthType.DXA },
      borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } },
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.stone, space: 1 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: C.stone, space: 1 }, left: { style: BorderStyle.SINGLE, size: 4, color: C.stone, space: 1 }, right: { style: BorderStyle.SINGLE, size: 4, color: C.stone, space: 1 } },
          children: [new ImageRun({ type: "png", data: fs.readFileSync(file), transformation: { width, height: h > w ? Math.round((width * h) / w) : height }, altText: { title: caption, description: caption, name } })] }),
        new Paragraph({ style: "FigureCaption", spacing: { before: 20, after: 120 }, children: [new TextRun(label)] }),
      ],
    });
  });
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    const pair = cells.slice(i, i + 2);
    if (pair.length === 1) pair.push(new TableCell({ width: { size: colW, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } }, children: [new Paragraph("")] }));
    rows.push(new TableRow({ cantSplit: true, children: pair }));
  }
  return [new Table({ width: { size: colW * 2, type: WidthType.DXA }, columnWidths: [colW, colW], layout: TableLayoutType.FIXED, rows }), spacer(80)];
};

// 1 Introduction
add(chapterStart("Introduction and Objectives"));
add(P("LuxuryStay HMS is a full-stack web application that supports the daily work of a single hotel, from a visitor's first look at the website to the guest's departure and review. It brings reservations, room status, guest records, identity documents, billing, housekeeping, maintenance and reporting into one system used through a browser by guests and by every member of staff."));
add(P("The application has three parts: a **public website** that presents the room types with live prices and availability; a **guest portal** where a registered guest requests and manages stays; and a **staff workspace** whose screens and actions depend on the person's role."));
add(H2("1.1  Problem"));
add(...bullets([
  "Rooms can be promised twice when availability is checked by reading a register or spreadsheet.",
  "Identity documents are checked inconsistently and copies are stored without protection.",
  "Folios — room charges, extras, discounts, tax and part-payments — are calculated by hand.",
  "Reception does not know when housekeeping has finished a room, and maintenance issues are forgotten.",
  "Managers have no live view of occupancy, revenue or guest satisfaction, and access is not controlled per person.",
]));
add(H2("1.2  Aim and objectives"));
add(P("**Aim:** to design and implement a secure, role-based web application that manages a hotel's reservations, stays, billing, housekeeping, maintenance and reporting, with a public website and a guest portal."));
add(...numbered([
  "Present room types with real prices and availability for chosen dates.",
  "Let visitors register as guests and request reservations online with an identity document.",
  "Prevent double booking under concurrent requests by enforcing availability in the database.",
  "Support the front-desk cycle: desk reservations, review of requests, check-in, payments, charges, discounts, invoices and check-out.",
  "Connect check-out to housekeeping and track maintenance that takes rooms out of service.",
  "Give managers live dashboards and period reports.",
  "Restrict every action to the roles allowed to perform it, on the server.",
  "Protect accounts and personal data, and keep production, development and test data apart.",
], "objectives"));
add(P("This report describes the system exactly as implemented; every technical statement was checked against the source code, and features that do not exist are listed as limitations.", { run: { italics: true, color: C.muted } }));

// 2 Scope and requirements
add(chapterStart("Scope and Requirements"));
add(H2("2.1  Scope"));
add(P("**In scope:** one hotel with three room categories (Serene Room, Signature Suite, Royal Residence); public website, guest portal and staff workspace; online and desk reservations with CNIC or passport; check-in and check-out; folios, payments and numbered invoices; housekeeping, maintenance, reviews, enquiries and in-app notifications; staff accounts, settings, dashboards and reports; password reset by email."));
add(P("**Out of scope:** online card payments, official identity verification (NADRA or any government service), multiple properties or channel managers, restaurant and spa point-of-sale, and SMS or email notifications other than password reset."));
add(H2("2.2  Functional requirements"));
add(...table("Functional requirements (all implemented)", ["ID", "Requirement"], [
  ["FR-1", "Show room types with prices, amenities and capacity from the database; check availability for dates and guests."],
  ["FR-2", "Register guest accounts; sign in and out; update profile and password; reset a forgotten password by email."],
  ["FR-3", "Lock an account for 15 minutes after 8 failed sign-ins; refuse deactivated accounts."],
  ["FR-4", "Guests request stays with an identity document (CNIC front and back, or passport); requests stay pending until staff decide."],
  ["FR-5", "Staff create confirmed reservations at the desk; confirm or reject requests (rejection needs a reason)."],
  ["FR-6", "Change dates or room; guests may change only pending requests; cancel pending or confirmed reservations."],
  ["FR-7", "Never let two active reservations hold the same room on the same night."],
  ["FR-8", "Check in confirmed, verified reservations from the arrival day; check out when the folio is settled."],
  ["FR-9", "Maintain folios: room charges, extras, discount, tax, payments (cash, card, bank transfer); issue numbered invoices."],
  ["FR-10", "Manage rooms and room status; run the cleaning queue; report, start and complete maintenance."],
  ["FR-11", "Guests review completed stays; managers moderate reviews; staff handle website enquiries."],
  ["FR-12", "Dashboards and reports for 7, 30, 90 days or 12 months."],
  ["FR-13", "Administrators create, edit, activate and deactivate staff accounts and change hotel settings."],
], [10, 90], { size: 16 }));
add(H2("2.3  Non-functional requirements"));
add(...table("Non-functional requirements", ["Area", "How it is met"], [
  ["Security", "bcrypt password hashes; revocable JWT sessions; permission check on every protected endpoint; rate limits; strict input schemas; security headers; encrypted identity documents."],
  ["Integrity", "Unique (room, night) index; optimistic concurrency on bookings; atomic invoice numbers; start-up checks of database name, indexes and ledger."],
  ["Usability and accessibility", "Role-specific navigation; field-level validation messages; light and dark themes; reduced-motion support; layouts from 390 px phones to desktops."],
  ["Maintainability", "Routes, middleware, services, models and utilities separated; one permission matrix; 12 automated test suites."],
], [22, 78], { size: 16 }));

// 3 Technology
add(chapterInline("Technology Stack"));
const depList = (deps) => Object.entries(deps).map(([n, v]) => `${n} ${v}`).join(", ");
add(...table("Technology stack (versions from package.json; runtime versions as tested)", ["Layer", "Technologies"], [
  ["Runtime and database", "Node.js 24.15.0; MongoDB 8.2.12 (standalone)"],
  ["Backend", depList(serverPkg.dependencies)],
  ["Frontend", depList(clientPkg.dependencies)],
  ["Tooling", `${depList(clientPkg.devDependencies || {})}; ${depList(serverPkg.devDependencies || {})}; Node test runner`],
], [20, 80], { size: 16 }));
add(P("`axios` and `react-icons` are declared in the client but not imported anywhere.", { run: { size: 17, color: C.muted } }));

// 4 Architecture
add(chapterStart("System Architecture"));
add(P("LuxuryStay HMS has three tiers. The React application runs in the browser and calls the Express API over HTTP with JSON; the API is the only component that reads or writes MongoDB, so every rule — who may act, which nights are free, how a folio is totalled — is enforced in one place (Figure 4.1)."));
add(...bullets([
  "**Client:** `App.jsx` defines the public website (`/`, `/rooms/:slug`), authentication pages, the guest portal (`/guest`) and the staff workspace (`/admin` for administrators and managers, `/staff` for receptionists and housekeeping). A signed-in person opening another role's area is redirected to the same page in their own area. All requests go through `lib/api.js`.",
  "**API:** a fixed middleware pipeline — security headers, CORS, body limit, unsafe-key rejection, rate limits, database-ready guard — then authentication, permission check, schema validation and the handler. Shared business rules live in `services/` (availability, identity ledger, OCR, invoices, notifications, settings).",
  "**Data:** MongoDB with 12 collections; identity-document images are stored encrypted in the upload folder. Separate databases are used for production (`luxurystay`), development (`luxurystay_dev`) and tests (`<name>_test`).",
]));
add(landscape("01-system-architecture", "System architecture"));

// 5 Roles
add(chapterStart("User Roles and Permissions"));
add(...table("The five roles", ["Role", "Workspace", "Responsibilities"], [
  ["Administrator (admin)", "/admin", "Everything a manager can do, plus staff accounts, guest-account activation and hotel settings"],
  ["Manager", "/admin", "Front desk and housekeeping operations, rooms, discounts, reports, reviews; can view the staff list"],
  ["Receptionist", "/staff", "Reservations, identity review, check-in and check-out, payments and invoices, enquiries, guest directory"],
  ["Housekeeping", "/staff", "Cleaning queue (rooms they start are marked as theirs), maintenance tasks; no guest, booking or billing data"],
  ["Guest", "/guest", "Own reservations, invoices, reviews and profile"],
], [22, 12, 66], { size: 16 }));
add(P("Registration always creates a guest. Staff accounts are created only by an administrator; nobody can change their own role or status, and the last active administrator cannot be removed. A legacy `staff` role remains for older accounts but cannot be assigned."));
const roleCols = ["admin", "manager", "receptionist", "housekeeping", "guest"];
add(...table("Permission matrix (generated from server/config/permissions.js)", ["Permission", "Meaning", ...roleCols], Object.entries(PERMISSIONS).map(([perm, roles]) => [perm, permDescriptions[perm] || "", ...roleCols.map((r) => (roles.includes(r) ? "●" : ""))]), [21, 25, 9, 11, 13, 14, 7], { size: 14, mono: [0], center: [2, 3, 4, 5, 6] }));
add(landscape("02-use-case-diagram", "Use case diagram"));

// 6 Database
add(chapterStart("Database Design"));
add(P("Each Mongoose model in `server/models` maps to one MongoDB collection; references are stored as ObjectIds (Figure 6.1)."));
add(...table("Collections", ["Collection", "Purpose", "Key constraints"], [
  ["users", "Accounts, role, sign-in security fields", "email unique"],
  ["rooms", "Room number, type, rate, capacity, status, housekeeping fields", "roomNumber unique"],
  ["bookings", "Stay, guest details, identity check, folio (charges, payments), audit fields", "invoiceNumber unique when set; version-checked saves"],
  ["roomnights", "One document per room per night held by an active booking", "(room, night) unique"],
  ["identitydocuments", "Binds a normalised document number to one account", "_id is the document key"],
  ["identitynights", "Nights held by a document", "(key, night) unique"],
  ["maintenances", "Issues, priority, progress and resolution", "one open task per room (checked in handler)"],
  ["feedbacks", "Reviews of completed stays", "booking unique"],
  ["contacts", "Website enquiries", "—"],
  ["notifications", "In-app notifications for a user or roles", "expire after 60 days"],
  ["settings", "Hotel-wide settings", "key unique"],
  ["counters", "Atomic invoice sequences", "—"],
], [20, 52, 28], { size: 15, mono: [0] }));
add(H2("6.1  Integrity mechanisms"));
add(...bullets([
  "**Room-night ledger:** an active reservation inserts one `roomnights` document per night; the unique index makes MongoDB refuse a second claim, so double booking cannot happen even under simultaneous requests and without transactions.",
  "**Identity ledger:** a document number belongs to one account and holds each night once, unless the front desk approves a second room for the same guest.",
  "**Optimistic concurrency** on bookings and **atomic invoice numbers** from `counters`.",
  "**Start-up checks:** the server verifies the database name (`EXPECTED_DB_NAME`), required indexes and ledger consistency before serving requests.",
]));
add(landscape("05-database-relationships", "Collections and their references"));

// 7 Modules
add(chapterStart("System Modules"));
add(...table("Implemented modules", ["Module", "What it does"], [
  ["Public website", "Room types from GET /api/public/rooms (no room numbers or status exposed), availability search, room pages, enquiry form."],
  ["Accounts", "Registration (guests only), sign-in, sign-out (token revoked), profile, password change, password reset by email."],
  ["Guest portal", "Overview of the next stay; five-step booking (dates, room, details, identity, review); My bookings with details, invoices, changes or cancellation of pending requests, reviews."],
  ["Reservations", "List with filters and search; detail drawer with the actions the role and status allow; desk reservations confirmed immediately."],
  ["Front desk", "Arrivals and departures; check-in requires a verified booking, the arrival day and an available room; check-out requires a settled folio unless settings allow a balance; the room then goes to cleaning."],
  ["Billing", "Folios with room charges, extras, manager discounts and tax; payments with method and reference (duplicate submissions applied once); printable invoices."],
  ["Rooms and housekeeping", "Room inventory and status; cleaning queue where a housekeeper starts a room and marks it clean."],
  ["Maintenance", "Issues with priority; reporting takes a room out of service (not while occupied); completion with a note returns it."],
  ["Reports", "Dashboard and period reports: revenue, occupancy, reservations, average nightly rate, rating; printable."],
  ["Reviews and enquiries", "One review per completed stay; moderation; enquiries marked read or resolved."],
  ["Administration", "Staff accounts with search and role/status filters; guest-account activation; hotel settings."],
  ["Identity documents", "CNIC or passport upload (JPG, PNG, WebP or PDF, 5 MB, 2 files), file-signature check, local OCR comparison for CNIC, AES-256-GCM encryption."],
], [20, 80], { size: 16 }));

// 8 Security
add(chapterStart("Authentication, Authorization, Validation and Security"));
add(H2("8.1  Authentication and authorization"));
add(...bullets([
  "Passwords hashed with bcrypt (12 rounds); never returned by the API.",
  "JWT (HS256, 12 h by default) carrying a token version: signing out, changing or resetting a password, a role change or deactivation ends every session; each request reloads the account.",
  "8 failed sign-ins lock the account for 15 minutes; reset links are single-use, stored only as a hash and expire after 30 minutes; the reset response does not reveal whether an email exists.",
  "Every protected route names a permission; handlers also check ownership so a guest reaches only their own bookings, invoices and documents. Unauthorized requests receive 401 or 403 — hiding a button is never the only protection.",
]));
add(H2("8.2  Validation rules"));
add(P("The client and the server apply the same rules; the server always validates again with strict zod schemas that reject unknown fields."));
add(...table("Validation rules", ["Field", "Rule"], [
  ["Account name (registration, profile, staff, create-admin)", "3–80 characters after trimming, starting with a letter; letters, numbers, spaces and . ' ’ - only. 1 or 2 characters, or only spaces, give “Name must be at least 3 characters.”"],
  ["Guest name on a reservation, enquiry name", "2–80 characters, same character rule (real names can have two letters)"],
  ["Email", "Valid address, stored in lower case, unique per account (duplicate → 409)"],
  ["Password", "8–72 characters with a letter and a number; confirmation must match (client)"],
  ["Phone / CNIC / passport", "7–15 digits / 13 digits with or without dashes / 6–12 letters and digits"],
  ["Stay", "Check-out after check-in, not in the past, within the maximum stay and advance period and the room's capacity"],
], [32, 68], { size: 16 }));
add(P("There is no separate username: people sign in with their email address, and the Full name field is the account name. Before this release the account name accepted two characters; the three-character minimum was added on both the server (`accountName` schema) and the client (`rules.accountName`) with regression tests (Chapter 11)."));
add(H2("8.3  Request, data and database protection"));
add(...bullets([
  "Rate limits: 1,500 API requests, 10 failed sign-ins, 5 reset requests and 15 reset-token checks per 15 minutes; 10 registrations and 8 enquiries per hour.",
  "Security headers (helmet), CORS allow-list, 100 kb JSON limit, rejection of operator-injection keys, no stack traces in responses.",
  "Identity documents are encrypted with AES-256-GCM using `DOCUMENT_KEY`; without the key, uploads are refused (503) — nothing is stored unencrypted. Documents are served only to front-desk staff or the owner, and each viewing is logged without content.",
  "Secrets live only in `server/.env`, which is excluded from Git along with uploads and database exports.",
  "Maintenance scripts print the connected database and refuse the production and test databases; tests refuse any database whose name does not end in `_test`.",
]));
add(note("Identity checking", ["The CNIC check compares the typed number with the number read from the image by a local OCR engine. It is a project-level consistency check, is not connected to NADRA, never confirms a booking by itself, and approving a mismatch requires a staff note."]));

// 9 Workflows
add(chapterStart("Core Hotel Workflows"));
add(...bullets([
  "**Online request:** a guest requests a stay; the nights are held at once (pending); staff confirm after reviewing the document or reject with a reason.",
  "**Desk reservation:** staff book a walk-in or telephone guest; the document is inspected in person, so the reservation is confirmed and receives an invoice number.",
  "**Stay:** check-in from the arrival day marks the room occupied; extras, discounts and payments update the folio; check-out (balance settled) sends the room to cleaning.",
  "**Housekeeping:** the room is started (marked as that housekeeper's) and marked clean, which makes it available again.",
  "**Cancellation:** pending or confirmed reservations can be cancelled, releasing the nights; a guest cannot cancel once a payment is recorded.",
]));
add(...table("Room status changes", ["From", "Event", "To"], [
  ["available", "Guest checks in", "occupied"],
  ["occupied", "Guest checks out", "cleaning"],
  ["cleaning", "Housekeeping marks the room clean", "available"],
  ["any except occupied", "Maintenance issue reported", "maintenance"],
  ["maintenance", "Maintenance completed", "available"],
], [26, 48, 26], { size: 16 }));
add(landscape("06-booking-lifecycle", "Reservation states and transitions"));

// 10 API
add(chapterStart("API Structure"));
const groups = {};
routeList.forEach((r) => { const g = r.path.split("/")[2]; groups[g] = (groups[g] || 0) + 1; });
const groupInfo = { auth: "Registration, sign-in, profile, password change and reset", bookings: "Reservations, availability, check-in/out, payments, charges, discounts, invoices, documents", contact: "Website enquiries", feedback: "Guest reviews", maintenance: "Maintenance tasks", notifications: "In-app notifications", public: "Hotel details and room types for the website", reports: "Dashboard, front-desk and finance figures", rooms: "Rooms and housekeeping", settings: "Hotel settings", users: "Staff accounts and guest directory" };
add(P(`The API exposes ${routeList.length} endpoints under \`/api\` (plus \`GET /api/health\`) in ${Object.keys(groups).length} routers. Requests and responses are JSON, except reservation requests with documents (multipart). Signed-in requests send \`Authorization: Bearer <token>\`; errors return \`success: false\` with a message, and validation errors list the fields concerned. Appendix A lists every endpoint with its access rule.`));
add(...table("API routers", ["Base path", "Endpoints", "Responsibility"], Object.entries(groups).sort().map(([g, n]) => [`/api/${g}`, String(n), groupInfo[g] || ""]), [22, 12, 66], { size: 16, mono: [0], center: [1] }));

// 11 Testing
add(chapterStart("Testing and Results"));
add(H2("11.1  Strategy"));
add(...bullets([
  "**Automated backend tests** (Node test runner): each suite starts the real Express application against a disposable database, creates its own data and checks responses and stored documents; OCR and email are replaced by test doubles. For this report the suite ran on `lsverify_test`, so neither `luxurystay_test` nor the development data was touched.",
  "**Browser end-to-end tests** (headless Microsoft Edge) on an isolated stack — frontend on port 5199, test API on port 5055, database `lsverify_test` seeded with fictional data — covering every role's main journeys and API refusals.",
  "**Development-stack checks** on `luxurystay_dev`: each role's demo account signed in; nothing else was written.",
  "**Static checks:** client lint (oxlint) and production build (Vite).",
]));
add(...table("Backend test suites", ["Suite", "Tests", "Covers"], testSuites.map((s) => [s.file, String(s.count), {
  "auth.test.js": "Registration, sign-in, lockout, tokens, profile, security headers", "bookings.test.js": "Availability, overlap prevention, concurrency, folios",
  "create-admin.test.js": "Database guards of create-admin and the seed scripts", "db-safety.test.js": "Test-database naming, index and ledger checks, start-up refusal",
  "identity.test.js": "Uploads, OCR outcomes, encryption, staff review rules", "ocr-engine.test.js": "Real OCR on a fictional specimen card",
  "operations.test.js": "Check-in/out, housekeeping, maintenance, payments, invoices, reports", "password-reset.test.js": "Reset tokens, single use, rate limits, sign-out everywhere",
  "public.test.js": "Public hotel and room endpoints", "rbac.test.js": "Role permissions, IDOR, staff guard rails",
  "registration.test.js": "Account-name minimum of 3 characters, invalid names, duplicates", "roles.test.js": "Five roles, staff creation, permissions of new staff, filters",
}[s.file] || ""]), [28, 9, 63], { size: 15, mono: [0], center: [1] }));
add(H2("11.2  Results (15 October 2026)"));
add(...table("Verified results", ["Check", "Result"], [
  ["Backend suite (`npm test`) on lsverify_test", `${testTotal} tests: ${testTotal} passed, 0 failed, 0 skipped. Document counts of luxurystay_dev and luxurystay_test identical before and after.`],
  ["Registration regression tests", "5 of 5 passed: names of 1 and 2 characters and blank names rejected with the 3-character message; 3+ characters accepted and trimmed; invalid characters rejected; duplicate email → 409; profile and staff names use the same rule."],
  ["Browser: public site and accounts", "Room pages and images load (no broken images); registration validation for 1, 2 and 3-character names, invalid characters, password mismatch and invalid email; registration, duplicate refusal, sign-in, wrong password, sign-out; password recovery refused safely with email switched off."],
  ["Browser: workflows", "Guest booking with a passport image (stored encrypted, LSENC1), staff confirmation, desk reservation, check-in, payment, check-out, cleaning, maintenance completion, room creation, review moderation, enquiry handling, staff creation, edit and deactivation (sign-in then refused), settings change, guest review and cancellation — all completed with the expected messages. Three steps failed first because of wrong labels in the test script; they were corrected and passed."],
  ["Browser: authorization", "Receptionist, housekeeping, manager and guest received 403 for every endpoint outside their permissions that was tried (staff, settings, reports, bookings, guests, housekeeping)."],
  ["Responsive layout", "13 pages across four roles at 390 px and 820 px: no horizontal overflow, no console errors."],
  ["Data consistency after the tests", "No missing indexes; room-night ledger complete; occupied rooms match in-house guests; payment totals consistent."],
  ["Client lint and build", "0 errors, 31 warnings (react set-state-in-effect); production build succeeded."],
], [28, 72], { size: 15 }));
add(P("Not covered: Firefox, Safari and real phones; load testing; automated frontend unit tests.", { run: { italics: true, color: C.muted } }));

// 12 Screenshots
add(chapterStart("Application Screenshots"));
add(P("Screenshots were captured from the running application with fictional demonstration data: development database `luxurystay_dev` (Figures 12.1–12.16) and the isolated test environment `lsverify_test` (Figures 12.17–12.20), at 1440 × 900 unless noted. Account lists are filtered to demonstration accounts; no passwords, tokens or real documents are shown."));
add(...shotGrid([
  ["01-public-home", "Public home page"], ["09-manager-dashboard", "Management dashboard"],
  ["06-registration", "Guest registration"], ["07-registration-validation", "Registration validation: 3-character minimum"],
  ["12-reservations", "Reservations"], ["13-reservation-details", "Reservation details and folio"],
  ["15-new-reservation-form", "Desk reservation form"], ["14-invoice", "Invoice"],
  ["19-billing", "Billing"], ["20-reports", "Reports"],
  ["23b-admin-add-staff-form", "Add staff member (administrator)"], ["25b-admin-settings", "Hotel settings (administrator)"],
  ["26-receptionist-overview", "Receptionist overview"], ["31-housekeeping-queue", "Housekeeping queue: “Yours”"],
  ["33-guest-home", "Guest overview"], ["34-guest-book-room", "Guest booking flow"],
  ["e2e-guest-booked", "Guest request with uploaded document (test environment)"], ["e2e-paid", "Payment recorded, folio settled (test environment)"],
  ["e2e-checked-out", "Guest checked out; room to housekeeping (test environment)"], ["e2e-staff-managed", "Staff account edited and deactivated (test environment)"],
]));

// 13 Setup
add(chapterInline("Installation and Configuration"));
add(...numbered([
  "Install Node.js 24 and MongoDB 8; run `npm install` in `server` and in `client`.",
  "Copy `server/.env.example` to `server/.env` and set `MONGO_URI` (with the database name, e.g. `luxurystay_dev`), `EXPECTED_DB_NAME`, a 32+ character `JWT_SECRET`, and optionally `EMAIL_USER`/`EMAIL_APP_PASSWORD` (password reset) and `DOCUMENT_KEY` (document uploads).",
  "Create the required indexes: `npm run db:indexes -- --confirm=luxurystay_dev`.",
  "Create the first administrator: set `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD`, then `npm run create-admin` (refuses the production and test databases).",
  "Optional demo data: set `SEED_DEMO_PASSWORD` and run `npm run seed:dev-demo` (development database only; adds missing records only).",
  "Start the API with `npm run dev` in `server` (http://localhost:5000) and the website with `npm run dev` in `client` (http://localhost:5173); `GET /api/health` reports the connected database.",
  "Run the tests on a throwaway database: `$env:MONGO_URI = \"mongodb://127.0.0.1:27017/lsverify\"; npm test`.",
], "steps"));
add(P("Secrets are generated with `node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"` and kept only in `server/.env`. The root README.md gives the full variable list, the demo accounts and troubleshooting.", { align: AlignmentType.LEFT }));

// 14 Limitations
add(chapterInline("Known Limitations and Future Improvements"));
add(...table("Known limitations", ["Limitation", "Effect or note"], [
  ["No payment gateway", "Payments are recorded by staff."],
  ["Document uploads need DOCUMENT_KEY", "Without it, online requests with documents are refused (503)."],
  ["CNIC check compares numbers only", "Cannot detect forged cards; PDFs are not read by OCR; first use downloads OCR data."],
  ["Email for password reset only", "No booking or invoice emails, no SMS."],
  ["Pending requests do not expire", "They hold their nights until staff decide; no no-show handling."],
  ["Housekeeping has no inspection step or manager assignment", "Rooms are claimed by whoever starts them."],
  ["No walk-in enquiry form, no full audit log, no report export", "Enquiries come from the website; the staff list shows last sign-in only; reports can be printed."],
  ["Single hotel and currency; shared photos per room type", "Not suited to chains as is."],
  ["31 lint warnings; no frontend unit tests", "Behaviour verified by browser tests."],
], [40, 60], { size: 15 }));
add(P("**Future improvements:** payment gateway with refunds; confirmation emails and SMS; expiry of unanswered requests; housekeeping assignment and inspection; per-room photos and seasonal rates; report export; two-factor authentication for staff; automated frontend tests; deployment scripts and backups."));

// 15 Conclusion and references
add(chapterStart("Conclusion and References"));
add(P("LuxuryStay HMS meets its aim of a secure, role-based web application for running a hotel. Visitors explore rooms and availability, guests request and manage stays, staff handle the full cycle from reservation to check-out, housekeeping and maintenance, and managers follow performance on live dashboards. Its key design decisions protect correctness and data: availability is enforced by a unique database index, sessions are revocable, every endpoint checks a named permission, identity documents are encrypted and never treated as officially verified, and production, development and test data are kept apart by enforced safeguards. The automated and browser tests reported in Chapter 11 support these claims, and the limitations in Chapter 14 point to clear next steps."));
add(H2("References"));
add(...numbered([
  "Node.js documentation and test runner. https://nodejs.org/api/",
  "Express 5. https://expressjs.com/ — MongoDB manual. https://www.mongodb.com/docs/manual/ — Mongoose. https://mongoosejs.com/docs/",
  "React. https://react.dev/ — Vite. https://vite.dev/ — React Router. https://reactrouter.com/ — Motion. https://motion.dev/",
  "Zod. https://zod.dev/ — Helmet. https://helmetjs.github.io/ — express-rate-limit. https://express-rate-limit.mintlify.app/ — Multer. https://github.com/expressjs/multer",
  "Jones, M., Bradley, J. and Sakimura, N. (2015) JSON Web Token (JWT), RFC 7519. https://www.rfc-editor.org/rfc/rfc7519",
  "Tesseract.js. https://github.com/naptha/tesseract.js — Nodemailer. https://nodemailer.com/",
  "OWASP Cheat Sheet Series (Authentication, Password Storage, Forgot Password). https://cheatsheetseries.owasp.org/",
  "NIST FIPS 197 (AES) and SP 800-38D (GCM). https://csrc.nist.gov/",
], "refs"));

// Appendix A
chapter = "A";
add(H1("Appendix A  API Endpoints"));
add(P(`All ${routeList.length} endpoints, extracted from the route files; \`GET /api/health\` is defined in \`app.js\` and is public. "Signed in" means the handler checks ownership or role itself.`, { run: { size: 18 } }));
add(...table("API endpoints", ["Method", "Path", "Access"], routeList.map((r) => [r.method, r.path, accessOf(r).replace("signed in; ownership or role checked in the handler", "signed in")]), [11, 47, 42], { size: 14, mono: [0, 1] }));


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
