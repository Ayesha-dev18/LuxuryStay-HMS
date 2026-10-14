const express = require("express");

const User = require("../models/User");
const Booking = require("../models/Booking");
const { STAFF_ROLES, ASSIGNABLE_STAFF_ROLES } = require("../config/permissions");
const { protect, requirePermission } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { hashPassword } = require("./authRoutes");
const { conflict, notFound, forbidden, badRequest } = require("../utils/httpError");
const {
  z,
  idParams,
  accountName,
  email,
  phone,
  optionalPhone,
  password,
  pagination,
  search,
  escapeRegex,
} = require("../utils/schemas");

const router = express.Router();

router.use(protect);

const staffRole = z.enum(ASSIGNABLE_STAFF_ROLES, {
  error: "Please choose a valid staff role.",
});

const createStaffSchema = z.strictObject({
  name: accountName,
  email,
  phone: optionalPhone,
  password,
  role: staffRole,
});

const updateUserSchema = z
  .strictObject({
    name: accountName.optional(),
    email: email.optional(),
    phone: z.union([z.literal(""), phone]).optional(),
    role: staffRole.optional(),
    isActive: z.boolean({ error: "Status must be true or false." }).optional(),
    password: password.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No changes were provided.",
  });

const listSchema = z.strictObject({
  ...pagination,
  search,
  status: z.enum(["all", "active", "inactive"]).optional().default("all"),
  role: z.enum(["all", ...STAFF_ROLES]).optional().default("all"),
});

const buildFilter = ({ search: term, status }) => {
  const filter = {};

  if (status === "active") filter.isActive = { $ne: false };
  if (status === "inactive") filter.isActive = false;

  if (term) {
    const pattern = new RegExp(escapeRegex(term), "i");
    filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
  }

  return filter;
};

// At least one active administrator must always remain.
const assertNotLastAdmin = async (user) => {
  const others = await User.countDocuments({
    role: "admin",
    isActive: { $ne: false },
    _id: { $ne: user._id },
  });

  if (others === 0) {
    throw conflict("At least one active administrator account is required.");
  }
};

router.get(
  "/staff",
  requirePermission("staff:view"),
  validate({ query: listSchema }),
  async (req, res) => {
    const { page, limit, role } = req.valid.query;

    const filter = {
      ...buildFilter(req.valid.query),
      role: role === "all" ? { $in: STAFF_ROLES } : role,
    };

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ isActive: -1, role: 1, name: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page,
      limit,
      users: users.map((user) => user.toSafeObject()),
    });
  }
);

// Staff accounts are created by administrators only. The role comes from a
// fixed list and is checked on the server.
router.post(
  "/staff",
  requirePermission("staff:manage"),
  validate({ body: createStaffSchema }),
  async (req, res) => {
    const { name, email: address, phone, password: plain, role } = req.valid.body;

    if (await User.exists({ email: address })) {
      throw conflict("An account with this email already exists.");
    }

    const user = await User.create({
      name,
      email: address,
      phone,
      password: await hashPassword(plain),
      role,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: "Staff account created successfully.",
      user: user.toSafeObject(),
    });
  }
);

// Guest accounts with their reservation history summarised.
router.get(
  "/guests",
  requirePermission("guests:view"),
  validate({ query: listSchema.omit({ role: true }) }),
  async (req, res) => {
    const { page, limit } = req.valid.query;
    const filter = { ...buildFilter(req.valid.query), role: "guest" };

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    const stats = await Booking.aggregate([
      { $match: { guest: { $in: users.map((user) => user._id) } } },
      { $sort: { checkInDate: -1 } },
      {
        $group: {
          _id: "$guest",
          bookings: { $sum: 1 },
          inHouse: {
            $sum: { $cond: [{ $eq: ["$bookingStatus", "checked-in"] }, 1, 0] },
          },
          totalPaid: { $sum: { $ifNull: ["$amountPaid", 0] } },
          lastStay: { $first: "$checkInDate" },
          phone: { $first: "$guestDetails.phone" },
          nationality: { $first: "$guestDetails.nationality" },
        },
      },
    ]);

    const byGuest = new Map(stats.map((item) => [String(item._id), item]));

    res.json({
      success: true,
      total,
      page,
      limit,
      guests: users.map((user) => {
        const record = byGuest.get(String(user._id));
        const safe = user.toSafeObject();
        return {
          ...safe,
          phone: safe.phone || record?.phone || "",
          nationality: record?.nationality || "",
          bookings: record?.bookings || 0,
          inHouse: (record?.inHouse || 0) > 0,
          totalPaid: record?.totalPaid || 0,
          lastStay: record?.lastStay || null,
        };
      }),
    });
  }
);

// Accounts are never deleted: bookings, payments and audit fields refer to
// them. They are deactivated instead.
router.patch(
  "/:id",
  requirePermission("staff:manage", "guests:manage"),
  validate({ params: idParams, body: updateUserSchema }),
  async (req, res) => {
    const changes = req.valid.body;
    const target = await User.findById(req.valid.params.id);

    if (!target) throw notFound("Account not found.");

    const isSelf = String(target._id) === String(req.user._id);

    if (isSelf && (changes.role !== undefined || changes.isActive !== undefined)) {
      throw forbidden("You cannot change your own role or status.");
    }

    if (isSelf && changes.password !== undefined) {
      throw forbidden("Use the change password option in your profile.");
    }

    if (target.role === "guest") {
      if (changes.role !== undefined) {
        throw badRequest("Guest accounts cannot be given a staff role. Create a staff account instead.");
      }
      if (changes.password !== undefined) {
        throw badRequest("Guests reset their own password from the sign-in page.");
      }
    }

    const demoting = changes.role !== undefined && changes.role !== "admin";
    const deactivating = changes.isActive === false;

    if (target.role === "admin" && target.isActive !== false && (demoting || deactivating)) {
      await assertNotLastAdmin(target);
    }

    if (changes.email !== undefined && changes.email !== target.email) {
      if (await User.exists({ email: changes.email, _id: { $ne: target._id } })) {
        throw conflict("An account with this email already exists.");
      }
      target.email = changes.email;
    }

    if (changes.name !== undefined) target.name = changes.name;
    if (changes.phone !== undefined) target.phone = changes.phone;

    let revoke = false;

    if (changes.role !== undefined && changes.role !== target.role) {
      target.role = changes.role;
      revoke = true;
    }

    if (changes.isActive !== undefined && changes.isActive !== (target.isActive !== false)) {
      target.isActive = changes.isActive;
      revoke = true;
    }

    if (changes.password !== undefined) {
      target.password = await hashPassword(changes.password);
      target.passwordChangedAt = new Date();
      revoke = true;
    }

    // A change of role, status or password ends the account's open sessions.
    if (revoke) target.tokenVersion = (target.tokenVersion || 0) + 1;

    await target.save();

    res.json({
      success: true,
      message: "Account updated successfully.",
      user: target.toSafeObject(),
    });
  }
);

module.exports = router;
