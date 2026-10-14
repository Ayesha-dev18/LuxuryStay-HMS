import { useEffect, useState } from "react";
import {
  BadgePercent,
  Ban,
  CalendarClock,
  Check,
  DoorOpen,
  FileText,
  IdCard,
  LogIn,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";

import { useAuth, useToast } from "../../context/AppContext";
import { api } from "../../lib/api";
import { formatMoment, formatStayDate, titleCase } from "../../lib/format";
import { useAction, useLoad } from "../../lib/hooks";
import { Alert, Badge, Button, ConfirmDialog, DataState, Modal, SkeletonRows } from "../ui/kit";

// How a reservation's identity document was dealt with. The wording is
// deliberate: a number match is never called verification of a person.
const VERIFICATION_LABELS = {
  "number-match": { tone: "info", text: "CNIC number matched" },
  "staff-review": { tone: "success", text: "Document reviewed by staff" },
  "staff-in-person": { tone: "success", text: "Document seen at desk" },
};

const CHECK_NOTES = {
  "number-matched": {
    type: "info",
    title: "CNIC number matched",
    text: (check) =>
      `The number entered (${check.extractedNumber}) was read from the uploaded image. Open the document before confirming: a match does not show that the card is genuine or belongs to the guest, and the original is inspected at check-in.`,
  },
  "number-mismatch": {
    type: "warning",
    title: "Number does not match the image",
    text: (check, details) =>
      `The guest entered ${details.documentNumber}, but ${check.extractedNumber} was read from the image. Open the document and compare before deciding. Approving needs a note.`,
  },
  unreadable: {
    type: "warning",
    title: "Number could not be read",
    text: () => "No CNIC number could be read from the uploaded image. Open the document and compare it with the number entered.",
  },
  error: {
    type: "warning",
    title: "Automatic check did not run",
    text: () => "The image could not be checked automatically. Open the document and compare it with the number entered.",
  },
};

function IdentityCheckNote({ booking, staff }) {
  const check = booking.identityCheck;
  const note = CHECK_NOTES[check?.status];
  if (!note) return null;

  // Guests are told the outcome in plain words, without the staff instructions.
  const guestText = {
    "number-matched": "The CNIC number you entered matched your uploaded image. A member of staff will review your document and confirm the reservation. Please bring the original; it is inspected at check-in.",
    "number-mismatch": "The CNIC number you entered did not match your uploaded image. A member of staff is reviewing your document.",
    unreadable: "We could not read the number on your uploaded image. A member of staff is reviewing your document.",
    error: "Your document could not be checked automatically. A member of staff is reviewing it.",
  }[check.status];

  return (
    <div style={{ marginTop: 14 }}>
      <Alert type={note.type}>
        <strong>{note.title}.</strong> {staff ? note.text(check, booking.guestDetails) : guestText}
        <span className="small" style={{ display: "block", marginTop: 6, opacity: 0.85 }}>
          {check.disclaimer}
        </span>
      </Alert>
    </div>
  );
}
import {
  ChargeDialog,
  DiscountDialog,
  EditStayDialog,
  InvoiceDialog,
  PaymentDialog,
  ReasonDialog,
} from "./BookingDialogs";

const BILLABLE = ["confirmed", "checked-in", "checked-out"];

export function FolioLedger({ booking }) {
  const { money } = useAuth();
  const { folio } = booking;

  return (
    <div className="ledger">
      <div className="ledger-row">
        <span>
          Room · {booking.totalNights} night{booking.totalNights === 1 ? "" : "s"} ×{" "}
          {money(booking.pricePerNight)}
        </span>
        <strong>{money(folio.roomCharges)}</strong>
      </div>
      {folio.extraCharges > 0 && (
        <div className="ledger-row">
          <span>Extra charges</span>
          <strong>{money(folio.extraCharges)}</strong>
        </div>
      )}
      {folio.discountAmount > 0 && (
        <div className="ledger-row">
          <span>Discount{booking.discountReason ? ` · ${booking.discountReason}` : ""}</span>
          <strong>− {money(folio.discountAmount)}</strong>
        </div>
      )}
      {folio.taxRate > 0 && (
        <div className="ledger-row">
          <span>Tax ({folio.taxRate}%)</span>
          <strong>{money(folio.taxAmount)}</strong>
        </div>
      )}
      <div className="ledger-row total">
        <span>Total</span>
        <strong>{money(folio.totalAmount)}</strong>
      </div>
      <div className="ledger-row">
        <span>Paid</span>
        <strong>{money(folio.amountPaid)}</strong>
      </div>
      <div className={`ledger-row ${folio.balance > 0 ? "due" : "settled"}`}>
        <span>Balance</span>
        <strong>{money(folio.balance)}</strong>
      </div>
    </div>
  );
}

/*
  The full record of one reservation with every action the signed-in user is
  allowed to take on it. Buttons shown here mirror server permissions; the
  server checks each action again.
*/
export default function BookingPanel({ bookingId, open, onClose, onChanged }) {
  const { can, money, user } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction();
  const [dialog, setDialog] = useState("");
  const [booking, setBooking] = useState(null);
  const [chargeToRemove, setChargeToRemove] = useState(null);
  const [viewer, setViewer] = useState(null);

  const closeDocument = () => {
    if (viewer) URL.revokeObjectURL(viewer.url);
    setViewer(null);
  };

  const { data, loading, error, reload } = useLoad(
    () => (open && bookingId ? api.get(`/bookings/${bookingId}`) : Promise.resolve(null)),
    [open, bookingId]
  );

  useEffect(() => {
    setBooking(data?.booking || null);
  }, [data]);

  useEffect(() => {
    if (!open) setDialog("");
  }, [open]);

  const applied = (updated) => {
    setBooking(updated);
    onChanged?.(updated);
  };

  const act = (key, request) =>
    run(key, async () => {
      try {
        const result = await request();
        toast.success(result.message);
        applied(result.booking);
      } catch (failure) {
        toast.error(failure.message);
        // The record may have changed underneath us; show its current state.
        reload({ silent: true });
      }
    });

  const openDocument = (side) =>
    run(`doc-${side}`, async () => {
      try {
        const file = await api.file(`/bookings/${bookingId}/documents/${side}`);
        setViewer({ ...file, side });
      } catch (failure) {
        toast.error(failure.message);
      }
    });

  const status = booking?.bookingStatus;
  const isGuest = user.role === "guest";
  const openFolio = status === "confirmed" || status === "checked-in";
  const hasFolio = BILLABLE.includes(status) || (status === "cancelled" && booking?.folio.amountPaid > 0);

  const canEdit =
    (can("bookings:edit") && ["pending", "confirmed", "checked-in"].includes(status)) ||
    (isGuest && status === "pending");
  const canCancel =
    ["pending", "confirmed"].includes(status) &&
    (can("bookings:cancel") || (isGuest && booking?.folio.amountPaid === 0));

  const details = booking?.guestDetails || {};

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        drawer
        title={booking ? details.fullName : "Reservation"}
        description={
          booking
            ? `Room ${booking.room?.roomNumber || "N/A"} · ${formatStayDate(booking.checkInDate)} – ${formatStayDate(booking.checkOutDate)}`
            : ""
        }
        footer={
          booking && (
            <>
              {status === "pending" && can("bookings:review") && (
                <>
                  <Button variant="danger-soft" icon={X} onClick={() => setDialog("reject")}>
                    Reject
                  </Button>
                  <Button
                    variant="success"
                    icon={Check}
                    loading={busy === "confirm"}
                    onClick={() =>
                      booking.identityCheck?.status === "number-mismatch"
                        ? setDialog("confirm-note")
                        : act("confirm", () => api.patch(`/bookings/${bookingId}/confirm`))
                    }
                  >
                    Confirm
                  </Button>
                </>
              )}
              {status === "confirmed" && can("bookings:checkin") && (
                <Button
                  icon={LogIn}
                  loading={busy === "check-in"}
                  onClick={() => act("check-in", () => api.patch(`/bookings/${bookingId}/check-in`))}
                >
                  Check in
                </Button>
              )}
              {status === "checked-in" && can("bookings:checkout") && (
                <Button icon={DoorOpen} onClick={() => setDialog("check-out")}>
                  Check out
                </Button>
              )}
              {hasFolio && booking.balance > 0 && can("billing:payment") && status !== "cancelled" && (
                <Button variant="accent" icon={Wallet} onClick={() => setDialog("payment")}>
                  Record payment
                </Button>
              )}
            </>
          )
        }
      >
        <DataState loading={loading} error={error} onRetry={reload} skeleton={<SkeletonRows rows={6} />}>
          {booking && (
            <>
              <div className="row" style={{ marginBottom: 18 }}>
                <Badge status={status} />
                {hasFolio && <Badge status={booking.paymentStatus} />}
                {booking.verificationStatus === "verified" && (
                  <Badge tone={VERIFICATION_LABELS[booking.verificationMethod]?.tone || "success"}>
                    {VERIFICATION_LABELS[booking.verificationMethod]?.text || "Document reviewed"}
                  </Badge>
                )}
                {booking.invoiceNumber && (
                  <Badge plain tone="accent">
                    {booking.invoiceNumber}
                  </Badge>
                )}
              </div>

              {status === "cancelled" && booking.folio.amountPaid > 0 && (
                <Alert type="warning">
                  This reservation was cancelled after {money(booking.folio.amountPaid)} was paid. A refund is
                  due to the guest.
                </Alert>
              )}
              {booking.decisionNote && status === "rejected" && (
                <Alert type="info">Reason: {booking.decisionNote}</Alert>
              )}
              {booking.cancellationReason && status === "cancelled" && (
                <div style={{ marginTop: 10 }}>
                  <Alert type="info">Cancellation note: {booking.cancellationReason}</Alert>
                </div>
              )}

              <div className="section-title">Stay</div>
              <dl className="dl">
                <div>
                  <dt>Room</dt>
                  <dd>
                    {booking.room
                      ? `${booking.room.roomNumber} · ${booking.room.name}`
                      : "Room no longer exists"}
                  </dd>
                </div>
                <div>
                  <dt>Room type</dt>
                  <dd>{booking.room?.type || "—"}</dd>
                </div>
                <div>
                  <dt>Check-in</dt>
                  <dd>{formatStayDate(booking.checkInDate)}</dd>
                </div>
                <div>
                  <dt>Check-out</dt>
                  <dd>{formatStayDate(booking.checkOutDate)}</dd>
                </div>
                <div>
                  <dt>Nights</dt>
                  <dd>{booking.totalNights}</dd>
                </div>
                <div>
                  <dt>Guests</dt>
                  <dd>{booking.numberOfGuests}</dd>
                </div>
                {booking.checkedInAt && (
                  <div>
                    <dt>Checked in</dt>
                    <dd>{formatMoment(booking.checkedInAt)}</dd>
                  </div>
                )}
                {booking.checkedOutAt && (
                  <div>
                    <dt>Checked out</dt>
                    <dd>{formatMoment(booking.checkedOutAt)}</dd>
                  </div>
                )}
              </dl>
              {booking.specialRequests && (
                <p className="small" style={{ marginTop: 12, color: "var(--a-ink-2)" }}>
                  <strong>Special requests:</strong> {booking.specialRequests}
                </p>
              )}

              {(canEdit || canCancel) && (
                <div className="row" style={{ marginTop: 14 }}>
                  {canEdit && (
                    <Button variant="secondary" size="sm" icon={CalendarClock} onClick={() => setDialog("edit")}>
                      {status === "checked-in" ? "Change departure" : "Change dates or room"}
                    </Button>
                  )}
                  {canCancel && (
                    <Button variant="danger-soft" size="sm" icon={Ban} onClick={() => setDialog("cancel")}>
                      Cancel reservation
                    </Button>
                  )}
                </div>
              )}

              <div className="section-title">Guest</div>
              <dl className="dl">
                <div>
                  <dt>Email</dt>
                  <dd>{details.email}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{details.phone}</dd>
                </div>
                <div>
                  <dt>Nationality</dt>
                  <dd>{details.nationality}</dd>
                </div>
                <div>
                  <dt>{details.documentType === "cnic" ? "CNIC" : "Passport"}</dt>
                  <dd>{details.documentNumber}</dd>
                </div>
                <div>
                  <dt>Emergency contact</dt>
                  <dd>{details.emergencyContact}</dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd>{details.vehicleNumber || "—"}</dd>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <dt>Address</dt>
                  <dd>{details.address}</dd>
                </div>
              </dl>

              <IdentityCheckNote booking={booking} staff={can("bookings:review")} />

              <div className="row" style={{ marginTop: 14 }}>
                {booking.documents.front ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={IdCard}
                    loading={busy === "doc-front"}
                    onClick={() => openDocument("front")}
                  >
                    View document{booking.documents.back ? " (front)" : ""}
                  </Button>
                ) : (
                  <span className="muted small">No identity document was uploaded.</span>
                )}
                {booking.documents.back && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={IdCard}
                    loading={busy === "doc-back"}
                    onClick={() => openDocument("back")}
                  >
                    View document (back)
                  </Button>
                )}
              </div>

              <div className="section-title">Folio</div>
              <FolioLedger booking={booking} />

              <div className="row" style={{ marginTop: 14 }}>
                {openFolio && can("billing:charges") && (
                  <Button variant="secondary" size="sm" icon={Plus} onClick={() => setDialog("charge")}>
                    Add charge
                  </Button>
                )}
                {openFolio && can("billing:discount") && (
                  <Button variant="secondary" size="sm" icon={BadgePercent} onClick={() => setDialog("discount")}>
                    Discount
                  </Button>
                )}
                {hasFolio && (
                  <Button variant="secondary" size="sm" icon={FileText} onClick={() => setDialog("invoice")}>
                    Invoice
                  </Button>
                )}
              </div>

              {booking.charges?.length > 0 && (
                <>
                  <div className="section-title">Extra charges</div>
                  <div className="ledger">
                    {booking.charges.map((charge) => (
                      <div className="ledger-row" key={charge._id}>
                        <span>
                          {charge.description}
                          {charge.quantity > 1 ? ` × ${charge.quantity}` : ""}
                        </span>
                        <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <strong>{money(charge.amount * charge.quantity)}</strong>
                          {openFolio && can("billing:charges") && (
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ width: 28, height: 28 }}
                              aria-label={`Remove ${charge.description}`}
                              onClick={() => setChargeToRemove(charge)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {booking.payments?.length > 0 && (
                <>
                  <div className="section-title">Payments</div>
                  <div className="ledger">
                    {booking.payments.map((payment) => (
                      <div className="ledger-row" key={payment._id}>
                        <span>
                          {formatMoment(payment.receivedAt)} · {titleCase(payment.method)}
                          {payment.reference ? ` · ${payment.reference}` : ""}
                          {payment.receivedBy?.name ? ` · ${payment.receivedBy.name}` : ""}
                        </span>
                        <strong>{money(payment.amount)}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </DataState>
      </Modal>

      <Modal
        open={Boolean(viewer)}
        onClose={closeDocument}
        size="wide"
        title="Identity document"
        description={viewer ? `${viewer.side === "front" ? "Front" : "Back"} · visible to authorised staff and the guest only` : ""}
      >
        {viewer &&
          (viewer.type === "application/pdf" ? (
            <iframe
              src={viewer.url}
              title="Identity document"
              style={{ width: "100%", height: "70vh", border: 0, borderRadius: 10 }}
            />
          ) : (
            <img
              src={viewer.url}
              alt={`Identity document, ${viewer.side}`}
              style={{ display: "block", maxWidth: "100%", margin: "0 auto", borderRadius: 10 }}
            />
          ))}
      </Modal>

      {booking && (
        <>
          <PaymentDialog
            booking={booking}
            open={dialog === "payment"}
            onClose={() => setDialog("")}
            onDone={applied}
          />
          <ChargeDialog
            booking={booking}
            open={dialog === "charge"}
            onClose={() => setDialog("")}
            onDone={applied}
          />
          <DiscountDialog
            booking={booking}
            open={dialog === "discount"}
            onClose={() => setDialog("")}
            onDone={applied}
          />
          <EditStayDialog
            booking={booking}
            open={dialog === "edit"}
            onClose={() => setDialog("")}
            onDone={applied}
          />
          <InvoiceDialog bookingId={bookingId} open={dialog === "invoice"} onClose={() => setDialog("")} />
          <ReasonDialog
            open={dialog === "confirm-note"}
            onClose={() => setDialog("")}
            title="Approve despite the mismatch?"
            description="A different CNIC number was read from the uploaded image. Record why you are approving this request, for example that you compared the document yourself."
            label="Reason for approval"
            confirmLabel="Approve request"
            tone="success"
            required
            cancelLabel="Back"
            hint="Required. Kept with the reservation."
            onSubmit={async (note) => {
              const result = await api.patch(`/bookings/${bookingId}/confirm`, { note });
              toast.success(result.message);
              applied(result.booking);
            }}
          />
          <ReasonDialog
            open={dialog === "reject"}
            onClose={() => setDialog("")}
            title="Reject this request?"
            description="The dates are released and the guest is notified."
            label="Reason"
            confirmLabel="Reject request"
            required
            hint="Required. The guest sees this reason."
            onSubmit={async (note) => {
              const result = await api.patch(`/bookings/${bookingId}/reject`, { note });
              toast.success(result.message);
              applied(result.booking);
            }}
          />
          <ReasonDialog
            open={dialog === "cancel"}
            onClose={() => setDialog("")}
            title="Cancel this reservation?"
            description="The room becomes available for these dates again. This cannot be undone."
            label="Reason"
            confirmLabel="Cancel reservation"
            onSubmit={async (reason) => {
              const result = await api.patch(`/bookings/${bookingId}/cancel`, { reason });
              toast.success(result.message);
              applied(result.booking);
            }}
          />
          <ConfirmDialog
            open={dialog === "check-out"}
            onClose={() => setDialog("")}
            title="Check this guest out?"
            message={
              booking.balance > 0
                ? `There is an outstanding balance of ${money(booking.balance)}. It must be settled before check-out.`
                : "The folio is settled. The room will be handed to housekeeping for cleaning."
            }
            confirmLabel="Check out"
            busy={busy === "check-out"}
            onConfirm={async () => {
              await act("check-out", () => api.patch(`/bookings/${bookingId}/check-out`));
              setDialog("");
            }}
          />
          <ConfirmDialog
            open={Boolean(chargeToRemove)}
            onClose={() => setChargeToRemove(null)}
            title="Remove this charge?"
            message={chargeToRemove ? `${chargeToRemove.description} will be removed from the folio.` : ""}
            confirmLabel="Remove charge"
            tone="danger"
            busy={busy === "remove-charge"}
            onConfirm={async () => {
              await act("remove-charge", () =>
                api.delete(`/bookings/${bookingId}/charges/${chargeToRemove._id}`)
              );
              setChargeToRemove(null);
            }}
          />
        </>
      )}
    </>
  );
}
