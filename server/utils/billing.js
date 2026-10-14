// All folio arithmetic lives here so bookings, invoices and reports agree.

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

// Recalculates a booking's totals from its own stored rate, nights, extra
// charges, discount and tax rate. Mutates and returns the booking.
const applyTotals = (booking) => {
  const roomCharges = round2(
    Number(booking.pricePerNight || 0) * Number(booking.totalNights || 0)
  );

  const extraCharges = round2(
    (booking.charges || []).reduce(
      (total, charge) =>
        total + Number(charge.amount || 0) * Number(charge.quantity || 1),
      0
    )
  );

  const subtotal = round2(roomCharges + extraCharges);
  const discountAmount = Math.min(round2(booking.discountAmount || 0), subtotal);
  const taxable = round2(subtotal - discountAmount);
  const taxAmount = round2((taxable * Number(booking.taxRate || 0)) / 100);

  booking.roomCharges = roomCharges;
  booking.discountAmount = discountAmount;
  booking.taxAmount = taxAmount;
  booking.totalAmount = round2(taxable + taxAmount);

  return booking;
};

const paymentStatusFor = (amountPaid, totalAmount) => {
  const paid = round2(amountPaid || 0);
  if (paid <= 0) return "unpaid";
  return paid >= round2(totalAmount) ? "paid" : "partial";
};

const balanceOf = (booking) =>
  Math.max(round2(Number(booking.totalAmount || 0) - Number(booking.amountPaid || 0)), 0);

// Read-only breakdown that also works for bookings created before taxes and
// extra charges existed.
const folioOf = (booking) => {
  const roomCharges = round2(
    Number(booking.pricePerNight || 0) * Number(booking.totalNights || 0)
  );
  const extraCharges = round2(
    (booking.charges || []).reduce(
      (total, charge) =>
        total + Number(charge.amount || 0) * Number(charge.quantity || 1),
      0
    )
  );

  return {
    roomCharges,
    extraCharges,
    subtotal: round2(roomCharges + extraCharges),
    discountAmount: round2(booking.discountAmount || 0),
    taxRate: Number(booking.taxRate || 0),
    taxAmount: round2(booking.taxAmount || 0),
    totalAmount: round2(booking.totalAmount || 0),
    amountPaid: round2(booking.amountPaid || 0),
    balance: balanceOf(booking),
  };
};

module.exports = {
  round2,
  applyTotals,
  paymentStatusFor,
  balanceOf,
  folioOf,
};
