const Booking = require("../models/Booking");
const Counter = require("../models/Counter");

// Assigns an invoice number exactly once. The conditional update means two
// simultaneous calls cannot both write a number, and the unique index on
// invoiceNumber backs that up.
const ensureInvoiceNumber = async (booking) => {
  if (booking.invoiceNumber) return booking.invoiceNumber;

  const year = new Date().getUTCFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `invoice-${year}` },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" }
  );

  const candidate = `INV-${year}-${String(counter.value).padStart(5, "0")}`;

  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, invoiceNumber: null },
    { $set: { invoiceNumber: candidate } },
    { returnDocument: "after" }
  ).select("invoiceNumber");

  if (updated) {
    booking.invoiceNumber = updated.invoiceNumber;
    return updated.invoiceNumber;
  }

  const current = await Booking.findById(booking._id).select("invoiceNumber");
  booking.invoiceNumber = current?.invoiceNumber || null;
  return booking.invoiceNumber;
};

module.exports = { ensureInvoiceNumber };
