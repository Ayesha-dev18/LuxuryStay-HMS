const { z } = require("zod");

const { parseDateOnly } = require("./dates");

// Shared building blocks for request schemas. Every object schema in the
// routes is strict: unknown fields are rejected rather than ignored.

const objectId = z
  .string({ error: "A valid record id is required." })
  .regex(/^[a-f\d]{24}$/i, "A valid record id is required.");

const idParams = z.strictObject({ id: objectId });

const text = (label, min, max) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(min, min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

const optionalText = (label, max) =>
  z
    .string({ error: `${label} must be text.` })
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .optional()
    .default("");

const nameOfAtLeast = (min) =>
  z
    .string({ error: "Name is required." })
    .trim()
    .min(min, `Name must be at least ${min} characters.`)
    .max(80, "Name must be 80 characters or fewer.")
    .regex(/^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'’-]*$/u, "Name contains invalid characters.");

// A person's name as written on a reservation or an enquiry.
const personName = nameOfAtLeast(2);

// The name of an account (registration, profile, staff): at least 3 characters.
const accountName = nameOfAtLeast(3);

const email = z
  .string({ error: "Email address is required." })
  .trim()
  .toLowerCase()
  .max(254, "Email address is too long.")
  .regex(
    /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/,
    "Please enter a valid email address."
  );

// International or local numbers: optional +, 7 to 15 digits, with spaces or
// dashes allowed while typing. Stored without separators.
const phone = z
  .string({ error: "Phone number is required." })
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{5,19}$/, "Please enter a valid phone number.")
  .transform((value) => value.replace(/[\s-]/g, ""))
  .refine(
    (value) => /^\+?\d{7,15}$/.test(value),
    "Phone number must contain 7 to 15 digits."
  );

const optionalPhone = z
  .union([z.literal(""), phone])
  .optional()
  .default("");

// bcrypt only reads the first 72 bytes, so longer passwords are refused
// instead of being silently truncated.
const password = z
  .string({ error: "Password is required." })
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be 72 characters or fewer.")
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: "Password must include at least one letter and one number.",
  });

const dateOnly = (label) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .refine((value) => parseDateOnly(value) !== null, {
      message: `${label} must be a valid date (YYYY-MM-DD).`,
    })
    .transform((value) => parseDateOnly(value));

const optionalDateOnly = (label) =>
  z
    .union([z.literal(""), dateOnly(label)])
    .optional()
    .transform((value) => value || null);

const money = (label, { min = 0, max = 100000000 } = {}) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .refine(Number.isFinite, `${label} must be a number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} is too large.`)
    .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, {
      message: `${label} can have at most two decimal places.`,
    });

const wholeNumber = (label, min, max) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be ${max} or fewer.`);

const pagination = {
  page: wholeNumber("Page", 1, 100000).optional().default(1),
  limit: wholeNumber("Limit", 1, 200).optional().default(25),
};

const search = z.string().trim().max(80, "Search text is too long.").optional().default("");

// Escapes user text before it is used inside a regular expression.
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

module.exports = {
  z,
  objectId,
  idParams,
  text,
  optionalText,
  personName,
  accountName,
  email,
  phone,
  optionalPhone,
  password,
  dateOnly,
  optionalDateOnly,
  money,
  wholeNumber,
  pagination,
  search,
  escapeRegex,
};
