// Single source of truth for role-based access control.
// Every protected route names a permission; anything not listed is denied.

const ROLES = [
  "admin",
  "manager",
  "receptionist",
  "housekeeping",
  "staff", // legacy combined front-desk + housekeeping role, kept for existing accounts
  "guest",
];

const STAFF_ROLES = ["admin", "manager", "receptionist", "housekeeping", "staff"];

// Roles an administrator may assign when creating or editing a staff account.
const ASSIGNABLE_STAFF_ROLES = ["admin", "manager", "receptionist", "housekeeping"];

const FRONT_DESK = ["admin", "manager", "receptionist", "staff"];
const OPERATIONS = ["admin", "manager", "housekeeping", "staff"];
const MANAGEMENT = ["admin", "manager"];

const PERMISSIONS = {
  // Accounts
  "staff:view": MANAGEMENT,
  "staff:manage": ["admin"],
  "guests:view": FRONT_DESK,
  "guests:manage": ["admin"],

  // Rooms
  "rooms:view": STAFF_ROLES,
  "rooms:manage": MANAGEMENT,
  "rooms:status": FRONT_DESK,

  // Housekeeping and maintenance
  "housekeeping:manage": OPERATIONS,
  "maintenance:view": STAFF_ROLES,
  "maintenance:report": STAFF_ROLES,
  "maintenance:update": OPERATIONS,

  // Reservations
  "bookings:own": ["guest"],
  "bookings:view": FRONT_DESK,
  "bookings:create": FRONT_DESK,
  "bookings:review": FRONT_DESK,
  "bookings:edit": FRONT_DESK,
  "bookings:cancel": FRONT_DESK,
  "bookings:checkin": FRONT_DESK,
  "bookings:checkout": FRONT_DESK,

  // Billing
  "billing:view": FRONT_DESK,
  "billing:payment": FRONT_DESK,
  "billing:charges": FRONT_DESK,
  "billing:discount": MANAGEMENT,

  // Insight
  "reports:view": MANAGEMENT,
  "frontdesk:view": FRONT_DESK,
  "feedback:own": ["guest"],
  "feedback:manage": MANAGEMENT,
  "contact:manage": ["admin", "manager", "receptionist"],

  // System
  "settings:manage": ["admin"],
};

const can = (role, permission) => {
  const allowed = PERMISSIONS[permission];
  return Array.isArray(allowed) && allowed.includes(role);
};

const permissionsFor = (role) =>
  Object.keys(PERMISSIONS).filter((permission) => can(role, permission));

module.exports = {
  ROLES,
  STAFF_ROLES,
  ASSIGNABLE_STAFF_ROLES,
  PERMISSIONS,
  can,
  permissionsFor,
};
