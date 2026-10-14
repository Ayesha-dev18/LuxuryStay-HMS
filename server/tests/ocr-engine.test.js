const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

// Runs the real OCR engine once, on a card drawn for this project. The card is
// marked as a fictional specimen and its number belongs to nobody. Skipped
// when the engine or its language data is not available (for example offline
// on a first run), because the rest of the suite uses a stand-in engine.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-1234";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/luxurystay_test";

const ocr = require("../services/ocr");
const { extractCnicNumbers } = require("../services/identityCheck");

test("the real OCR engine reads the number from the specimen card", async (t) => {
  let text;
  try {
    text = await ocr.recognize(path.join(__dirname, "fixtures/specimen-cnic.png"));
  } catch (error) {
    await ocr.shutdown();
    t.skip(`OCR engine unavailable: ${error.message}`);
    return;
  }
  await ocr.shutdown();

  assert.deepEqual(extractCnicNumbers(text), ["4210199999999"]);
});
