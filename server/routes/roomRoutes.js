const express = require("express");

const Room = require("../models/Room");
const Booking = require("../models/Booking");
const Maintenance = require("../models/Maintenance");
const { can } = require("../config/permissions");
const { protect, requirePermission } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { badRequest, conflict, notFound } = require("../utils/httpError");
const { z, idParams, text, optionalText, money, wholeNumber } = require("../utils/schemas");

const { ROOM_TYPES, ROOM_STATUSES } = Room;
const { ACTIVE_STATUSES } = Booking;

const router = express.Router();

router.use(protect);

const GUEST_FIELDS =
  "roomNumber name type description amenities pricePerNight capacity bedType floor status";

const roomFields = {
  roomNumber: z
    .string({ error: "Room number is required." })
    .trim()
    .regex(/^[A-Za-z0-9-]{1,10}$/, "Room number may contain letters, digits and dashes only."),
  name: text("Room name", 2, 80),
  type: z.enum(ROOM_TYPES, { error: "Please choose a valid room type." }),
  description: optionalText("Description", 600),
  amenities: z
    .array(text("Amenity", 1, 40), { error: "Amenities must be a list." })
    .max(20, "A room can list up to 20 amenities.")
    .optional()
    .default([]),
  pricePerNight: money("Price per night", { min: 1, max: 10000000 }),
  capacity: wholeNumber("Capacity", 1, 12),
  bedType: text("Bed type", 2, 40),
  floor: wholeNumber("Floor", 1, 200),
};

const createRoomSchema = z.strictObject(roomFields);

const updateRoomSchema = z
  .strictObject({
    roomNumber: roomFields.roomNumber.optional(),
    name: roomFields.name.optional(),
    type: roomFields.type.optional(),
    description: z.string().trim().max(600, "Description must be 600 characters or fewer.").optional(),
    amenities: z.array(text("Amenity", 1, 40)).max(20).optional(),
    pricePerNight: roomFields.pricePerNight.optional(),
    capacity: roomFields.capacity.optional(),
    bedType: roomFields.bedType.optional(),
    floor: roomFields.floor.optional(),
    isActive: z.boolean({ error: "Active must be true or false." }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No changes were provided." });

const statusSchema = z.strictObject({
  status: z.enum(ROOM_STATUSES, { error: "Invalid room status." }),
});

// Status changes a person may make by hand. "occupied" is only ever set by
// check-in and "maintenance" only by a maintenance request, so the room
// status cannot drift away from the bookings and tasks behind it.
const MANUAL_TRANSITIONS = {
  available: ["reserved", "cleaning"],
  reserved: ["available", "cleaning"],
  cleaning: ["available"],
  maintenance: ["available", "cleaning"],
  occupied: ["cleaning", "available"],
};

const assertManualTransition = async (room, next) => {
  if (next === room.status) {
    throw badRequest(`This room is already marked ${room.status}.`);
  }

  if (next === "occupied") {
    throw conflict("A room becomes occupied when its guest is checked in.");
  }

  if (next === "maintenance") {
    throw conflict("Report a maintenance issue to move a room into maintenance.");
  }

  if (!MANUAL_TRANSITIONS[room.status]?.includes(next)) {
    throw conflict(`A room cannot move from ${room.status} to ${next}.`);
  }

  if (room.status === "occupied") {
    const inHouse = await Booking.exists({ room: room._id, bookingStatus: "checked-in" });
    if (inHouse) {
      throw conflict("This room has a guest in house. Check the guest out first.");
    }
  }

  if (room.status === "maintenance") {
    const openTask = await Maintenance.exists({
      room: room._id,
      status: { $in: ["pending", "in-progress"] },
    });
    if (openTask) {
      throw conflict("Complete the open maintenance task before releasing this room.");
    }
  }
};

// Staff see the full inventory; guests see active rooms with public fields.
router.get("/", async (req, res) => {
  const isStaff = can(req.user.role, "rooms:view");

  const rooms = isStaff
    ? await Room.find()
        .populate("lastCleanedBy cleaningBy", "name")
        .sort({ floor: 1, roomNumber: 1 })
    : await Room.find({ isActive: true })
        .select(GUEST_FIELDS)
        .sort({ pricePerNight: 1, roomNumber: 1 });

  res.json({ success: true, count: rooms.length, rooms });
});

router.get(
  "/housekeeping",
  requirePermission("housekeeping:manage"),
  async (req, res) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [queue, recent] = await Promise.all([
      Room.find({ status: "cleaning", isActive: true })
        .populate("cleaningBy", "name")
        .sort({ cleaningStartedAt: -1, floor: 1, roomNumber: 1 }),
      Room.find({ lastCleanedAt: { $gte: since } })
        .populate("lastCleanedBy", "name")
        .sort({ lastCleanedAt: -1 })
        .limit(12),
    ]);

    res.json({ success: true, count: queue.length, rooms: queue, recent });
  }
);

router.patch(
  "/housekeeping/:id/start",
  requirePermission("housekeeping:manage"),
  validate({ params: idParams }),
  async (req, res) => {
    const room = await Room.findOneAndUpdate(
      { _id: req.valid.params.id, status: "cleaning", isActive: true, cleaningStartedAt: null },
      { $set: { cleaningStartedAt: new Date(), cleaningBy: req.user._id } },
      { returnDocument: "after" }
    ).populate("cleaningBy", "name");

    if (!room) {
      throw conflict("This room is not waiting for cleaning, or cleaning has already started.");
    }

    res.json({ success: true, message: "Cleaning started.", room });
  }
);

router.patch(
  "/housekeeping/:id/complete",
  requirePermission("housekeeping:manage"),
  validate({ params: idParams }),
  async (req, res) => {
    const room = await Room.findOneAndUpdate(
      { _id: req.valid.params.id, status: "cleaning", isActive: true },
      {
        $set: {
          status: "available",
          lastCleanedAt: new Date(),
          lastCleanedBy: req.user._id,
          cleaningStartedAt: null,
          cleaningBy: null,
        },
      },
      { returnDocument: "after" }
    );

    if (!room) throw conflict("Only active rooms awaiting cleaning can be completed.");

    res.json({
      success: true,
      message: "Room cleaning completed. The room is available again.",
      room,
    });
  }
);

router.post(
  "/",
  requirePermission("rooms:manage"),
  validate({ body: createRoomSchema }),
  async (req, res) => {
    if (await Room.exists({ roomNumber: req.valid.body.roomNumber })) {
      throw conflict("This room number already exists.");
    }

    const room = await Room.create(req.valid.body);

    res.status(201).json({ success: true, message: "Room added successfully.", room });
  }
);

router.put(
  "/:id",
  requirePermission("rooms:manage"),
  validate({ params: idParams, body: updateRoomSchema }),
  async (req, res) => {
    const changes = req.valid.body;
    const room = await Room.findById(req.valid.params.id);

    if (!room) throw notFound("Room not found.");

    if (changes.roomNumber && changes.roomNumber !== room.roomNumber) {
      if (await Room.exists({ roomNumber: changes.roomNumber, _id: { $ne: room._id } })) {
        throw conflict("This room number already exists.");
      }
    }

    if (changes.isActive === false && room.isActive) {
      const held = await Booking.exists({
        room: room._id,
        bookingStatus: { $in: ACTIVE_STATUSES },
      });
      if (held) {
        throw conflict(
          "This room has active reservations. Move or cancel them before deactivating it."
        );
      }
    }

    if (changes.capacity !== undefined && changes.capacity < room.capacity) {
      const tooLarge = await Booking.exists({
        room: room._id,
        bookingStatus: { $in: ACTIVE_STATUSES },
        numberOfGuests: { $gt: changes.capacity },
      });
      if (tooLarge) {
        throw conflict("An active reservation has more guests than this capacity allows.");
      }
    }

    // Existing reservations keep the nightly rate they were booked at.
    Object.assign(room, changes);
    await room.save();

    res.json({ success: true, message: "Room updated successfully.", room });
  }
);

router.patch(
  "/:id/status",
  requirePermission("rooms:status"),
  validate({ params: idParams, body: statusSchema }),
  async (req, res) => {
    const { status } = req.valid.body;
    const room = await Room.findById(req.valid.params.id);

    if (!room) throw notFound("Room not found.");
    if (!room.isActive) throw conflict("This room is inactive.");

    await assertManualTransition(room, status);

    const previous = room.status;
    const update = { status };

    if (status === "cleaning") {
      update.cleaningStartedAt = null;
      update.cleaningBy = null;
    }

    // Guarded on the status that was validated, so two people changing the
    // same room cannot both win.
    const updated = await Room.findOneAndUpdate(
      { _id: room._id, status: previous },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!updated) throw conflict("This room was just updated by someone else. Please refresh.");

    res.json({ success: true, message: "Room status updated successfully.", room: updated });
  }
);

// A room with any history is deactivated, not deleted, so past bookings and
// invoices keep pointing at a real record.
router.delete(
  "/:id",
  requirePermission("rooms:manage"),
  validate({ params: idParams }),
  async (req, res) => {
    const room = await Room.findById(req.valid.params.id);

    if (!room) throw notFound("Room not found.");

    const [hasBookings, hasTasks] = await Promise.all([
      Booking.exists({ room: room._id }),
      Maintenance.exists({ room: room._id }),
    ]);

    if (hasBookings || hasTasks) {
      throw conflict(
        "This room has booking or maintenance history and cannot be deleted. Deactivate it instead."
      );
    }

    await room.deleteOne();

    res.json({ success: true, message: "Room deleted successfully." });
  }
);

module.exports = router;
