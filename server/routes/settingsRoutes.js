const express = require("express");

const { protect, requirePermission } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { getSettings, toPublicSettings } = require("../services/settings");
const { z, text, phone, email, wholeNumber } = require("../utils/schemas");

const router = express.Router();

router.use(protect);

const time = (label) =>
  z
    .string({ error: `${label} is required.` })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be a time such as 14:00.`);

const profileLink = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .max(200, "Links must be 200 characters or fewer.")
      .regex(/^https:\/\/[^\s]{4,}$/, "Links must start with https://."),
  ])
  .optional();

const updateSchema = z
  .strictObject({
    hotelName: text("Hotel name", 2, 80).optional(),
    address: z.string().trim().max(200, "Address must be 200 characters or fewer.").optional(),
    contactEmail: z.union([z.literal(""), email]).optional(),
    contactPhone: z.union([z.literal(""), phone]).optional(),
    currencySymbol: text("Currency symbol", 1, 6).optional(),
    taxRate: z.coerce
      .number({ error: "Tax rate must be a number." })
      .min(0, "Tax rate cannot be negative.")
      .max(50, "Tax rate cannot be more than 50%.")
      .optional(),
    checkInTime: time("Check-in time").optional(),
    checkOutTime: time("Check-out time").optional(),
    maxStayNights: wholeNumber("Maximum stay", 1, 365).optional(),
    allowCheckoutWithBalance: z.boolean({ error: "This setting must be on or off." }).optional(),
    instagramUrl: profileLink,
    facebookUrl: profileLink,
    linkedinUrl: profileLink,
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No changes were provided." });

// Every signed-in user reads the same non-sensitive settings: they drive
// prices, tax lines and invoices throughout the interface.
router.get("/", async (req, res) => {
  res.json({ success: true, settings: toPublicSettings(await getSettings()) });
});

router.put(
  "/",
  requirePermission("settings:manage"),
  validate({ body: updateSchema }),
  async (req, res) => {
    const settings = await getSettings();

    Object.assign(settings, req.valid.body, { updatedBy: req.user._id });
    await settings.save();

    res.json({
      success: true,
      message: "Settings saved. New reservations will use these values.",
      settings: toPublicSettings(settings),
    });
  }
);

module.exports = router;
