// Formatting and small pure helpers shared by every screen.

// Stay dates are hotel calendar days stored at UTC midnight, so they are
// always formatted in UTC: the day shown never shifts with the viewer's
// timezone.
const stayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const stayShort = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const momentFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const valid = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatStayDate = (value) => {
  const date = valid(value);
  return date ? stayFormat.format(date) : "—";
};

export const formatStayShort = (value) => {
  const date = valid(value);
  return date ? stayShort.format(date) : "—";
};

export const stayDayParts = (value) => {
  const date = valid(value);
  if (!date) return { day: "—", month: "" };
  return {
    day: String(date.getUTCDate()).padStart(2, "0"),
    month: date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
  };
};

// Timestamps (payments, check-ins) are real moments and use local time.
export const formatMoment = (value) => {
  const date = valid(value);
  return date ? momentFormat.format(date) : "—";
};

export const timeAgo = (value) => {
  const date = valid(value);
  if (!date) return "";

  const seconds = Math.max(Math.round((Date.now() - date.getTime()) / 1000), 0);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} d ago`;
  return stayFormat.format(date);
};

// "YYYY-MM-DD" for a stored stay date.
export const toDateInput = (value) => {
  const date = valid(value);
  return date ? date.toISOString().slice(0, 10) : "";
};

export const addDaysToInput = (value, days) => {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

// Stay dates are calendar days at the hotel, not where the viewer happens to
// be. The timezone comes from the API; until it arrives the viewer's own is
// used.
let hotelTimeZone;

export const setHotelTimeZone = (zone) => {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    hotelTimeZone = zone;
  } catch {
    // An unknown zone is ignored and the viewer's timezone stays in use.
  }
};

// "YYYY-MM-DD" for today at the hotel, offset by whole days.
export const hotelDay = (offset = 0) => {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: hotelTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return offset === 0 ? today : addDaysToInput(today, offset);
};

export const nightsBetween = (checkIn, checkOut) => {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(Math.round((end - start) / 86400000), 0);
};

export const formatNumber = (value) => Number(value || 0).toLocaleString("en-US");

export const makeMoney = (symbol = "Rs.") => (value) => {
  const amount = Number(value || 0);
  return `${symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

export const compactNumber = (value) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number(value || 0)
  );

export const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("") || "?";

export const titleCase = (value = "") =>
  String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const ROLE_LABELS = {
  admin: "Administrator",
  manager: "Manager",
  receptionist: "Receptionist",
  housekeeping: "Housekeeping",
  staff: "Staff",
  guest: "Guest",
};

// Badge tone for every status value the API returns.
export const TONES = {
  // bookings
  pending: "warning",
  confirmed: "info",
  "checked-in": "success",
  "checked-out": "",
  rejected: "danger",
  cancelled: "danger",
  // payments
  unpaid: "danger",
  partial: "warning",
  paid: "success",
  // rooms
  available: "success",
  occupied: "info",
  reserved: "accent",
  cleaning: "warning",
  maintenance: "danger",
  // tasks and misc
  "in-progress": "info",
  completed: "success",
  verified: "success",
  new: "accent",
  read: "",
  reviewed: "success",
  resolved: "success",
  active: "success",
  inactive: "",
  low: "",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

export const ROOM_TONE_COLORS = {
  available: "var(--a-success)",
  occupied: "var(--a-info)",
  reserved: "var(--a-accent)",
  cleaning: "var(--a-warning)",
  maintenance: "var(--a-danger)",
};

/* ---------- Client-side validation (the server validates everything again) ---------- */

export const rules = {
  required: (label) => (value) =>
    String(value ?? "").trim() ? "" : `${label} is required.`,

  // A person's name on a reservation or an enquiry.
  name: (value) => {
    const text = String(value ?? "").trim();
    if (text.length < 2) return "Please enter a name of at least 2 characters.";
    if (text.length > 80) return "Name must be 80 characters or fewer.";
    return "";
  },

  // The name of an account (registration, profile, staff). Same rule as the
  // server's accountName schema.
  accountName: (value) => {
    const text = String(value ?? "").trim();
    if (text.length < 3) return "Name must be at least 3 characters.";
    if (text.length > 80) return "Name must be 80 characters or fewer.";
    if (!/^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'’-]*$/u.test(text)) return "Name can contain letters, numbers, spaces and . ' - only, and must start with a letter.";
    return "";
  },

  email: (value) =>
    /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value ?? "").trim())
      ? ""
      : "Please enter a valid email address.",

  phone: (value) => {
    const digits = String(value ?? "").replace(/[\s-]/g, "");
    return /^\+?\d{7,15}$/.test(digits) ? "" : "Please enter a valid phone number (7 to 15 digits).";
  },

  optionalPhone: (value) => (String(value ?? "").trim() ? rules.phone(value) : ""),

  password: (value) => {
    const text = String(value ?? "");
    if (text.length < 8) return "Password must be at least 8 characters.";
    if (text.length > 72) return "Password must be 72 characters or fewer.";
    if (!/[A-Za-z]/.test(text) || !/\d/.test(text)) {
      return "Password must include at least one letter and one number.";
    }
    return "";
  },
};

export const passwordStrength = (value = "") => {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value) || value.length >= 14) score += 1;
  return Math.max(score, 1);
};

// Runs a map of { field: rule | rule[] } against values; returns only failures.
export const validate = (values, schema) => {
  const errors = {};
  for (const [field, fieldRules] of Object.entries(schema)) {
    for (const rule of [].concat(fieldRules)) {
      const message = rule(values[field], values);
      if (message) {
        errors[field] = message;
        break;
      }
    }
  }
  return errors;
};
