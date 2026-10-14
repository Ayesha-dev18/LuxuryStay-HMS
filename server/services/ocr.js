const fs = require("fs");
const path = require("path");

const { env } = require("../config/env");
const logger = require("../utils/logger");

// Reads the text printed on an image. The engine runs entirely on this
// server: no image or number is sent to any outside service, and nothing here
// talks to NADRA or any other official register.

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

let engine = null;
let worker = null;

// Tesseract is loaded on first use so the server starts (and the tests run)
// without it.
const defaultEngine = {
  async recognize(filePath) {
    if (!worker) {
      const { createWorker } = require("tesseract.js");
      // Language data is downloaded once and kept here for later starts.
      const cachePath = path.join(__dirname, "../.ocr-cache");
      fs.mkdirSync(cachePath, { recursive: true });
      worker = await createWorker("eng", 1, {
        cachePath,
        logger: () => {},
        errorHandler: (error) => logger.error("OCR worker error", error instanceof Error ? error : new Error(String(error))),
      });
    }

    const { data } = await worker.recognize(filePath);
    return data.text || "";
  },
};

// Tests swap in a fake engine; nothing else should call this.
const setEngine = (replacement) => {
  engine = replacement;
};

const withTimeout = (promise, ms) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error("OCR timed out");
      error.code = "OCR_TIMEOUT";
      reject(error);
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

const canRead = (filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());

// Returns the text found in an image. Throws when the engine is unavailable
// or too slow; the caller treats that as "could not check", never as a pass.
const recognize = (filePath) =>
  withTimeout((engine || defaultEngine).recognize(filePath), env.OCR_TIMEOUT_MS);

const shutdown = async () => {
  if (worker) {
    await worker.terminate().catch(() => {});
    worker = null;
  }
};

module.exports = { recognize, canRead, setEngine, shutdown };
