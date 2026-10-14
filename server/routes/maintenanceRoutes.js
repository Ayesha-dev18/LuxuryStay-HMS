const express = require("express");

const Maintenance = require("../models/Maintenance");
const Room = require("../models/Room");
const Booking = require("../models/Booking");
const { protect, requirePermission } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { notify, OPERATIONS_ROLES } = require("../services/notify");
const { conflict, notFound } = require("../utils/httpError");
const { z, objectId, idParams, text, optionalText, pagination } = require("../utils/schemas");

const router = express.Router();

router.use(protect);

const PRIORITIES = ["low", "medium", "high", "urgent"];
const OPEN_STATUSES = ["pending", "in-progress"];

const createSchema = z.strictObject({
  roomId: objectId,
  issueTitle: text("Issue title", 3, 120),
  description: text("Description", 5, 1000),
  priority: z
    .enum(PRIORITIES, { error: "Invalid maintenance priority." })
    .optional()
    .default("medium"),
});

const listSchema = z.strictObject({
  ...pagination,
  status: z
    .enum(["all", "open", "pending", "in-progress", "completed"])
    .optional()
    .default("all"),
});

const completeSchema = z.strictObject({
  resolutionNote: optionalText("Resolution note", 500),
});

const populateTask = (query) =>
  query
    .populate("room", "roomNumber name type floor status isActive")
    .populate("reportedBy startedBy completedBy", "name role");

const assertTaskExists = async (id) => {
  if (!(await Maintenance.exists({ _id: id }))) {
    throw notFound("Maintenance task not found.");
  }
};

router.get(
  "/",
  requirePermission("maintenance:view"),
  validate({ query: listSchema }),
  async (req, res) => {
    const { page, limit, status } = req.valid.query;

    const filter =
      status === "all" ? {} : { status: status === "open" ? { $in: OPEN_STATUSES } : status };

    const [tasks, total, open] = await Promise.all([
      populateTask(
        Maintenance.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
      ),
      Maintenance.countDocuments(filter),
      Maintenance.countDocuments({ status: { $in: OPEN_STATUSES } }),
    ]);

    res.json({ success: true, total, open, page, limit, count: tasks.length, tasks });
  }
);

router.post(
  "/",
  requirePermission("maintenance:report"),
  validate({ body: createSchema }),
  async (req, res) => {
    const { roomId, issueTitle, description, priority } = req.valid.body;

    const room = await Room.findById(roomId);
    if (!room) throw notFound("Room not found.");
    if (!room.isActive) throw conflict("This room is currently inactive.");

    if (room.status === "occupied") {
      throw conflict("An occupied room cannot be moved to maintenance. Check the guest out first.");
    }

    if (await Maintenance.exists({ room: room._id, status: { $in: OPEN_STATUSES } })) {
      throw conflict("This room already has an active maintenance task.");
    }

    // Taking the room out of service is guarded on it not being occupied, so
    // it cannot collide with a check-in happening at the same moment.
    const taken = await Room.findOneAndUpdate(
      { _id: room._id, isActive: true, status: { $ne: "occupied" } },
      { $set: { status: "maintenance", cleaningStartedAt: null, cleaningBy: null } }
    );
    if (!taken) throw conflict("This room was just occupied. Please refresh.");

    let task;
    try {
      task = await Maintenance.create({
        room: room._id,
        issueTitle,
        description,
        priority,
        reportedBy: req.user._id,
      });
    } catch (error) {
      await Room.updateOne(
        { _id: room._id, status: "maintenance" },
        { $set: { status: taken.status } }
      );
      throw error;
    }

    const upcoming = await Booking.countDocuments({
      room: room._id,
      bookingStatus: { $in: ["pending", "confirmed"] },
    });

    await notify({
      roles: ["admin", ...OPERATIONS_ROLES],
      type: "maintenance",
      title: `Maintenance reported for room ${room.roomNumber}`,
      message: `${issueTitle} (${priority} priority).`,
      entity: "maintenance",
      entityId: task._id,
    });

    res.status(201).json({
      success: true,
      message:
        upcoming > 0
          ? `Maintenance issue reported. This room has ${upcoming} upcoming reservation${upcoming === 1 ? "" : "s"} that may need to be moved.`
          : "Maintenance issue reported successfully.",
      task: await populateTask(Maintenance.findById(task._id)),
    });
  }
);

router.patch(
  "/:id/start",
  requirePermission("maintenance:update"),
  validate({ params: idParams }),
  async (req, res) => {
    const task = await Maintenance.findOneAndUpdate(
      { _id: req.valid.params.id, status: "pending" },
      { $set: { status: "in-progress", startedAt: new Date(), startedBy: req.user._id } },
      { returnDocument: "after" }
    );

    if (!task) {
      await assertTaskExists(req.valid.params.id);
      throw conflict("Only pending maintenance tasks can be started.");
    }

    res.json({
      success: true,
      message: "Maintenance work started.",
      task: await populateTask(Maintenance.findById(task._id)),
    });
  }
);

router.patch(
  "/:id/complete",
  requirePermission("maintenance:update"),
  validate({ params: idParams, body: completeSchema }),
  async (req, res) => {
    const task = await Maintenance.findOneAndUpdate(
      { _id: req.valid.params.id, status: { $in: OPEN_STATUSES } },
      {
        $set: {
          status: "completed",
          completedAt: new Date(),
          completedBy: req.user._id,
          resolutionNote: req.valid.body.resolutionNote,
        },
      },
      { returnDocument: "after" }
    );

    if (!task) {
      await assertTaskExists(req.valid.params.id);
      throw conflict("This maintenance task has already been completed.");
    }

    // The room returns to service only if it is still in maintenance.
    await Room.updateOne(
      { _id: task.room, status: "maintenance" },
      { $set: { status: "available" } }
    );

    res.json({
      success: true,
      message: "Maintenance completed. The room is available again.",
      task: await populateTask(Maintenance.findById(task._id)),
    });
  }
);

module.exports = router;
