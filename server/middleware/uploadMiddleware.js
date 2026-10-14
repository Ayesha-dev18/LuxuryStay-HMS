const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const { env } = require("../config/env");

// Identity documents live outside any web root. They are reached only through
// the authenticated document route.
const uploadDirectory = env.UPLOAD_DIR
  ? path.resolve(env.UPLOAD_DIR)
  : path.join(__dirname, "../uploads/identity");

if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, {
    recursive: true,
  });
}

// The stored extension comes from the accepted type, never from the name the
// client sent.
const EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

const unsupported = () => {
  const error = new Error("Only JPG, PNG, WEBP and PDF documents are allowed.");
  error.code = "UNSUPPORTED_FILE";
  return error;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    cb(null, crypto.randomBytes(16).toString("hex") + EXTENSIONS[file.mimetype]);
  },
});

const fileFilter = (req, file, cb) => {
  if (EXTENSIONS[file.mimetype]) cb(null, true);
  else cb(unsupported(), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 2,
    fields: 20,
    fieldSize: 20 * 1024,
  },
});

const SIGNATURES = {
  ".jpg": (head) => head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff,
  ".png": (head) => head.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  ".webp": (head) =>
    head.subarray(0, 4).toString("latin1") === "RIFF" &&
    head.subarray(8, 12).toString("latin1") === "WEBP",
  ".pdf": (head) => head.subarray(0, 5).toString("latin1") === "%PDF-",
};

// The declared type is client-controlled, so the first bytes on disk are
// checked against the format the extension claims.
const hasValidSignature = async (file) => {
  const check = SIGNATURES[path.extname(file.filename)];
  if (!check) return false;

  const handle = await fs.promises.open(file.path, "r");
  try {
    const head = Buffer.alloc(12);
    await handle.read(head, 0, 12, 0);
    return check(head);
  } finally {
    await handle.close();
  }
};

const uploadedFiles = (req) => Object.values(req.files || {}).flat();

const removeUploads = async (req) => {
  await Promise.all(
    uploadedFiles(req).map((file) => fs.promises.unlink(file.path).catch(() => {}))
  );
};

/* ---------- Encryption at rest ---------- */

// Layout of a protected file: marker, 12-byte nonce, 16-byte tag, ciphertext.
const MARKER = Buffer.from("LSENC1");

const encryptionKey = () =>
  env.DOCUMENT_KEY ? crypto.createHash("sha256").update(env.DOCUMENT_KEY).digest() : null;

// Encrypts an uploaded document in place (AES-256-GCM) once it has been
// checked and read. Without DOCUMENT_KEY the file is left as it is; the
// server warns about that at start-up.
const protectFile = async (file) => {
  const key = encryptionKey();
  if (!key || !file) return false;

  const plain = await fs.promises.readFile(file.path);
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const sealed = Buffer.concat([cipher.update(plain), cipher.final()]);

  await fs.promises.writeFile(file.path, Buffer.concat([MARKER, nonce, cipher.getAuthTag(), sealed]));
  return true;
};

// Returns a stored document's bytes, decrypting when it is protected.
// Documents saved before encryption was switched on are returned as they are.
const readDocument = async (filePath) => {
  const stored = await fs.promises.readFile(filePath);
  if (!stored.subarray(0, MARKER.length).equals(MARKER)) return stored;

  const key = encryptionKey();
  if (!key) {
    const error = new Error("This document is encrypted and DOCUMENT_KEY is not set.");
    error.code = "DOCUMENT_KEY_MISSING";
    throw error;
  }

  const nonce = stored.subarray(MARKER.length, MARKER.length + 12);
  const tag = stored.subarray(MARKER.length + 12, MARKER.length + 28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(stored.subarray(MARKER.length + 28)), decipher.final()]);
};

// Identity documents are stored by bare file name. Older records hold a full
// path, so only the base name is ever used to locate a file.
const resolveDocumentPath = (stored) => {
  const name = path.basename(String(stored || "").replace(/\\/g, "/"));
  if (!/^[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp|pdf)$/i.test(name)) return null;

  const fullPath = path.join(uploadDirectory, name);
  return fs.existsSync(fullPath) ? fullPath : null;
};

const contentTypeOf = (filePath) =>
  CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";

module.exports = {
  upload,
  uploadedFiles,
  removeUploads,
  hasValidSignature,
  resolveDocumentPath,
  protectFile,
  readDocument,
  contentTypeOf,
  unsupported,
};
