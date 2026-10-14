const Notification = require("../models/Notification");
const logger = require("../utils/logger");

// Notifications are a convenience. A failure to record one must never fail
// the operation that triggered it, so errors are logged and swallowed here.
const notify = async ({ user = null, roles = [], type, title, message, entity = null, entityId = null }) => {
  try {
    await Notification.create({ user, roles, type, title, message, entity, entityId });
  } catch (error) {
    logger.error("Notification could not be recorded", error, { type });
  }
};

const FRONT_DESK_ROLES = ["admin", "manager", "receptionist", "staff"];
const OPERATIONS_ROLES = ["manager", "housekeeping", "staff"];
const MANAGEMENT_ROLES = ["admin", "manager"];

module.exports = {
  notify,
  FRONT_DESK_ROLES,
  OPERATIONS_ROLES,
  MANAGEMENT_ROLES,
};
