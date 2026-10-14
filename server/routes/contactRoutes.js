const express = require("express");

const Contact = require("../models/Contact");
const { protect, requirePermission } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { notify } = require("../services/notify");
const { notFound } = require("../utils/httpError");
const {
  z,
  idParams,
  text,
  personName,
  email,
  optionalPhone,
  pagination,
  search,
  escapeRegex,
} = require("../utils/schemas");

const ENQUIRY_TYPES = [
  "Room Reservation",
  "Dining",
  "Spa & Wellness",
  "Private Transfer",
  "General Enquiry",
];

const createSchema = z.strictObject({
  name: personName,
  email,
  phone: optionalPhone,
  enquiryType: z.enum(ENQUIRY_TYPES, { error: "Please choose an enquiry type." }),
  message: text("Message", 10, 1500),
});

const listSchema = z.strictObject({
  ...pagination,
  search,
  status: z.enum(["all", "new", "read", "resolved"]).optional().default("all"),
});

const statusSchema = z.strictObject({
  status: z.enum(["new", "read", "resolved"], { error: "Invalid enquiry status." }),
});

const createContactRouter = (limiters) => {
  const router = express.Router();

  // Public: the enquiry form on the website. Rate limited per address.
  router.post("/", limiters.contact, validate({ body: createSchema }), async (req, res) => {
    const enquiry = await Contact.create(req.valid.body);

    await notify({
      roles: ["admin", "manager", "receptionist"],
      type: "contact",
      title: `New enquiry: ${enquiry.enquiryType}`,
      message: `${enquiry.name} sent a message through the website.`,
      entity: "contact",
      entityId: enquiry._id,
    });

    // The stored record is not echoed back to an anonymous caller.
    res.status(201).json({
      success: true,
      message: "Your enquiry has been sent successfully.",
    });
  });

  router.get(
    "/",
    protect,
    requirePermission("contact:manage"),
    validate({ query: listSchema }),
    async (req, res) => {
      const { page, limit, search: term, status } = req.valid.query;
      const filter = {};

      if (status !== "all") filter.status = status;

      if (term) {
        const pattern = new RegExp(escapeRegex(term), "i");
        filter.$or = [{ name: pattern }, { email: pattern }, { message: pattern }];
      }

      const [enquiries, total, unread] = await Promise.all([
        Contact.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Contact.countDocuments(filter),
        Contact.countDocuments({ status: "new" }),
      ]);

      res.json({ success: true, total, unread, page, limit, enquiries });
    }
  );

  router.patch(
    "/:id/status",
    protect,
    requirePermission("contact:manage"),
    validate({ params: idParams, body: statusSchema }),
    async (req, res) => {
      const enquiry = await Contact.findOneAndUpdate(
        { _id: req.valid.params.id },
        { $set: { status: req.valid.body.status } },
        { returnDocument: "after" }
      );

      if (!enquiry) throw notFound("Enquiry not found.");

      res.json({ success: true, message: "Enquiry updated.", enquiry });
    }
  );

  return router;
};

module.exports = { createContactRouter };
