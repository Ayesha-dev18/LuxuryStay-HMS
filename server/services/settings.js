const Settings = require("../models/Settings");

const PUBLIC_FIELDS = [
  "hotelName",
  "address",
  "contactEmail",
  "contactPhone",
  "currencySymbol",
  "taxRate",
  "checkInTime",
  "checkOutTime",
  "maxStayNights",
  "allowCheckoutWithBalance",
  "instagramUrl",
  "facebookUrl",
  "linkedinUrl",
];

// Returns the stored settings, or unsaved defaults when there are none yet.
// Reading never writes: the document is created only when an administrator
// saves a change.
const getSettings = async () =>
  (await Settings.findOne({ key: "global" })) || new Settings({ key: "global" });

const toPublicSettings = (settings) => {
  const result = {};
  for (const field of PUBLIC_FIELDS) result[field] = settings[field];
  result.updatedAt = settings.updatedAt;
  return result;
};

module.exports = { getSettings, toPublicSettings, PUBLIC_FIELDS };
