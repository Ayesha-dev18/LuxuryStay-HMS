const express = require("express");

const Room = require("../models/Room");
const Settings = require("../models/Settings");
const { env } = require("../config/env");
const { hotelToday, toDateOnly } = require("../utils/dates");

const { ROOM_TYPES } = Room;

const router = express.Router();

// What an anonymous visitor to the hotel website may read. Internal policy
// (tax handling, check-out rules) is not part of it.
const HOTEL_FIELDS = [
  "hotelName",
  "address",
  "contactEmail",
  "contactPhone",
  "currencySymbol",
  "checkInTime",
  "checkOutTime",
  "maxStayNights",
  "instagramUrl",
  "facebookUrl",
  "linkedinUrl",
];

// Read-only: the settings document is never created for an anonymous request.
const readSettings = async () => (await Settings.findOne({ key: "global" })) || new Settings();

const slugOf = (type) =>
  type
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const unique = (values) => {
  const seen = new Map();
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && !seen.has(text.toLowerCase())) seen.set(text.toLowerCase(), text);
  }
  return [...seen.values()];
};

router.get("/hotel", async (req, res) => {
  const settings = await readSettings();

  res.json({
    success: true,
    hotel: Object.fromEntries(HOTEL_FIELDS.map((field) => [field, settings[field] ?? ""])),
    // Stay dates are hotel-local calendar days; the website needs both to
    // offer the right "today" wherever the visitor is.
    timezone: env.HOTEL_TIMEZONE,
    today: toDateOnly(hotelToday()),
  });
});

// The room collection shown on the website: active rooms grouped by type,
// with the lowest nightly rate of each. Individual room status and numbers
// stay behind sign-in.
router.get("/rooms", async (req, res) => {
  const [rooms, settings] = await Promise.all([
    Room.find({ isActive: true })
      .select("type description amenities pricePerNight capacity bedType")
      .lean(),
    readSettings(),
  ]);

  const categories = ROOM_TYPES.map((type) => {
    const members = rooms.filter((room) => room.type === type);
    if (members.length === 0) return null;

    const descriptions = members
      .map((room) => String(room.description || "").trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    return {
      type,
      slug: slugOf(type),
      roomCount: members.length,
      fromPrice: Math.min(...members.map((room) => room.pricePerNight)),
      maxCapacity: Math.max(...members.map((room) => room.capacity)),
      bedTypes: unique(members.map((room) => room.bedType)),
      amenities: unique(members.flatMap((room) => room.amenities || [])).slice(0, 12),
      description: descriptions[0] || "",
    };
  }).filter(Boolean);

  res.json({
    success: true,
    currencySymbol: settings.currencySymbol,
    categories,
  });
});

module.exports = router;
