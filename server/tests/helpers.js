// Shared test harness.
//
// Tests run against a separate "<database>_test" database on the MongoDB
// server from .env. That database is dropped at the start of every test
// file; the real database is never opened.

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../.env"), quiet: true });

process.env.NODE_ENV = "test";
process.env.CLIENT_URL = "https://hotel.example.test";
process.env.CORS_ORIGINS = "https://hotel.example.test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-1234";

const toTestUri = (uri) => {
  const match = /^(mongodb(?:\+srv)?:\/\/[^/]+)\/([^?]*)(\?.*)?$/.exec(uri || "");
  if (!match) return "mongodb://127.0.0.1:27017/luxurystay_test";
  const name = (match[2] || "luxurystay").replace(/_(dev|test)$/, "");
  return `${match[1]}/${name}_test${match[3] || ""}`;
};

// Only a name ending in "_test" is ever cleaned up.
const isPermittedTestDatabase = (name) => /^[A-Za-z0-9-]+_test$/.test(String(name || ""));

process.env.MONGO_URI = toTestUri(process.env.MONGO_URI);

// Uploaded test documents go to a temporary folder, never to the real one,
// and are encrypted with a key that exists only for the test run.
process.env.UPLOAD_DIR = require("fs").mkdtempSync(
  path.join(require("os").tmpdir(), "luxurystay-test-uploads-")
);
process.env.DOCUMENT_KEY = "test-document-key-test-document-key-1234";

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const { createApp } = require("../app");
const mailer = require("../utils/mailer");
const ocr = require("../services/ocr");
const { hotelToday, addDays, toDateOnly } = require("../utils/dates");

const User = require("../models/User");
const Room = require("../models/Room");
const Booking = require("../models/Booking");
const RoomNight = require("../models/RoomNight");
const Feedback = require("../models/Feedback");
const Maintenance = require("../models/Maintenance");
const Contact = require("../models/Contact");
const Settings = require("../models/Settings");
const Notification = require("../models/Notification");
const Counter = require("../models/Counter");
const IdentityDocument = require("../models/IdentityDocument");
const IdentityNight = require("../models/IdentityNight");

const PASSWORD = "Passw0rd!secure";
const RELAXED_LIMITS = Object.fromEntries(
  ["api", "login", "register", "passwordReset", "resetToken", "contact"].map((name) => [
    name,
    { windowMs: 60 * 1000, limit: 100000 },
  ])
);

// ocrText is what the stand-in OCR engine "reads" from any image; set
// ocrFails to make it break. The real engine is never loaded by these tests.
const state = { server: null, baseUrl: "", mails: [], failMail: false, ocrText: "", ocrFails: false };

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });

const start = async ({ rateLimits = RELAXED_LIMITS } = {}) => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  // Checked on the live connection, immediately before anything is dropped.
  const name = mongoose.connection.db.databaseName;
  if (!isPermittedTestDatabase(name)) {
    await mongoose.connection.close();
    throw new Error(`Refusing to run tests against database "${name}".`);
  }
  console.log(`[tests] database: ${name}`);

  await mongoose.connection.db.dropDatabase();
  await Promise.all(
    [User, Room, Booking, RoomNight, Feedback, Maintenance, Contact, Settings, Notification, Counter, IdentityDocument, IdentityNight].map(
      (model) => model.init()
    )
  );

  state.mails = [];
  state.failMail = false;
  mailer.setTransport({
    verify: async () => true,
    sendMail: async (message) => {
      if (state.failMail) throw new Error("SMTP provider rejected the message");
      state.mails.push(message);
      return { accepted: [message.to] };
    },
  });

  state.ocrText = "";
  state.ocrFails = false;
  ocr.setEngine({
    recognize: async () => {
      if (state.ocrFails) throw new Error("OCR engine unavailable");
      return state.ocrText;
    },
  });

  state.server = await listen(createApp({ rateLimits }));
  state.baseUrl = `http://127.0.0.1:${state.server.address().port}`;
  return state;
};

const stop = async () => {
  if (state.server) await new Promise((resolve) => state.server.close(resolve));
  await mongoose.connection.close();
};

// A second app instance on the same database, e.g. with real rate limits.
const startExtraApp = async (options) => {
  const server = await listen(createApp(options));
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const api = async (method, route, { token, body, form, baseUrl, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl || state.baseUrl}${route}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: form || (body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined),
  });

  const textBody = await response.text();
  let json = null;
  try {
    json = JSON.parse(textBody);
  } catch {
    json = null;
  }

  return { status: response.status, body: json, text: textBody, headers: response.headers };
};

let counter = 0;

const createUser = async (role, overrides = {}) => {
  counter += 1;
  const user = await User.create({
    name: `${role[0].toUpperCase()}${role.slice(1)} User`,
    email: `${role}${counter}@example.test`,
    password: await bcrypt.hash(PASSWORD, 4),
    role,
    ...overrides,
  });
  return user;
};

const login = async (user, password = PASSWORD) => {
  const result = await api("POST", "/api/auth/login", {
    body: { email: user.email, password },
  });
  if (result.status !== 200) {
    throw new Error(`Login failed for ${user.email}: ${result.status}`);
  }
  return result.body.token;
};

// Creates an account for a role and signs it in.
const actor = async (role, overrides) => {
  const user = await createUser(role, overrides);
  return { user, token: await login(user), id: String(user._id) };
};

const createRoom = async (overrides = {}) => {
  counter += 1;
  return Room.create({
    roomNumber: `T${counter}`,
    name: "Test Suite",
    type: "Signature Suite",
    pricePerNight: 10000,
    capacity: 2,
    bedType: "King bed",
    floor: 1,
    ...overrides,
  });
};

// Hotel-local day, n days from today, as YYYY-MM-DD.
const day = (offset) => toDateOnly(addDays(hotelToday(), offset));

const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.alloc(32, 1),
]);

const guestDetails = (overrides = {}) => ({
  fullName: "Amina Khan",
  phone: "+923001234567",
  email: "amina@example.test",
  address: "12 Garden Road, Karachi",
  nationality: "Pakistan",
  documentType: "passport",
  // Fictional, and different for every guest: one document belongs to one account.
  documentNumber: `TS${String((counter += 1)).padStart(7, "0")}`,
  emergencyContact: "03001234567",
  vehicleNumber: "",
  ...overrides,
});

const bookingForm = ({ roomId, checkIn, checkOut, guests = 1, details, files = true, extra = {} }) => {
  const form = new FormData();
  form.append("roomId", String(roomId));
  form.append("checkInDate", checkIn);
  form.append("checkOutDate", checkOut);
  form.append("numberOfGuests", String(guests));
  form.append("specialRequests", "");
  form.append("guestDetails", JSON.stringify(details || guestDetails()));
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  if (files) {
    form.append("documentFront", new Blob([PNG], { type: "image/png" }), "passport.png");
  }
  return form;
};

const book = (token, options) =>
  api("POST", "/api/bookings", { token, form: bookingForm(options) });

module.exports = {
  toTestUri,
  isPermittedTestDatabase,
  PASSWORD,
  PNG,
  state,
  start,
  stop,
  startExtraApp,
  api,
  createUser,
  login,
  actor,
  createRoom,
  day,
  guestDetails,
  bookingForm,
  book,
  models: { User, Room, Booking, RoomNight, Feedback, Maintenance, Contact, Settings, Notification, Counter, IdentityDocument, IdentityNight },
};
