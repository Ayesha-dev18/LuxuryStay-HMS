const { env } = require("../config/env");

// Stay dates are hotel-local calendar days. They travel as "YYYY-MM-DD" strings
// and are stored as UTC midnight, so the same day is the same value everywhere.

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Returns a Date at UTC midnight, or null when the string is not a real day.
const parseDateOnly = (value) => {
  if (typeof value !== "string") return null;

  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
};

const toDateOnly = (date) => new Date(date).toISOString().slice(0, 10);

// Today's calendar day at the hotel, as a UTC-midnight Date.
const hotelToday = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.HOTEL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return parseDateOnly(parts);
};

const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

const nightsBetween = (checkIn, checkOut) =>
  Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS);

// Every night a stay occupies: check-in up to, but not including, check-out.
const listNights = (checkIn, checkOut) => {
  const nights = [];
  for (let day = checkIn.getTime(); day < checkOut.getTime(); day += DAY_MS) {
    nights.push(new Date(day));
  }
  return nights;
};

module.exports = {
  DAY_MS,
  parseDateOnly,
  toDateOnly,
  hotelToday,
  addDays,
  nightsBetween,
  listNights,
};
