import { useEffect, useMemo, useRef, useState } from "react";
import { Printer } from "lucide-react";

import { useAuth, useToast } from "../../context/AppContext";
import { api } from "../../lib/api";
import {
  addDaysToInput,
  formatMoment,
  formatStayDate,
  nightsBetween,
  titleCase,
  toDateInput,
} from "../../lib/format";
import { useLoad } from "../../lib/hooks";
import { Alert, Badge, Button, DataState, Modal, SkeletonRows, TextField } from "../ui/kit";

const newRequestId = () =>
  `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/* ---------- Payment ---------- */

export function PaymentDialog({ booking, open, onClose, onDone }) {
  const { money } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ amount: "", paymentMethod: "cash", transactionReference: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // One id per opening of the form: resubmitting the same form can never be
  // applied twice by the server.
  const requestId = useRef("");

  const balance = booking?.balance || 0;

  useEffect(() => {
    if (!open) return;
    requestId.current = newRequestId();
    setForm({ amount: String(balance), paymentMethod: "cash", transactionReference: "" });
    setError("");
  }, [open, balance]);

  const submit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return setError("Enter a payment amount greater than zero.");
    }
    if (amount > balance) {
      return setError(`The payment cannot exceed the balance of ${money(balance)}.`);
    }
    if (form.paymentMethod !== "cash" && !form.transactionReference.trim()) {
      return setError("A transaction reference is required for card and bank transfer payments.");
    }

    setSaving(true);
    setError("");
    try {
      const data = await api.post(`/bookings/${booking._id}/payments`, {
        amount,
        paymentMethod: form.paymentMethod,
        transactionReference: form.transactionReference.trim(),
        requestId: requestId.current,
      });
      toast.success(data.message);
      onDone(data.booking);
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      title="Record payment"
      description={booking ? `${booking.guestDetails?.fullName} · balance ${money(balance)}` : ""}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={saving}>
            Record payment
          </Button>
        </>
      }
    >
      <form id="payment-form" className="stack" onSubmit={submit} noValidate>
        <Alert type="error">{error}</Alert>
        <TextField
          label="Amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          max={balance}
          required
          value={form.amount}
          onChange={(event) => setForm({ ...form, amount: event.target.value })}
          hint={`Outstanding balance: ${money(balance)}`}
        />
        <TextField
          as="select"
          label="Payment method"
          value={form.paymentMethod}
          onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}
        >
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank-transfer">Bank transfer</option>
        </TextField>
        <TextField
          label="Transaction reference"
          maxLength={80}
          required={form.paymentMethod !== "cash"}
          value={form.transactionReference}
          onChange={(event) => setForm({ ...form, transactionReference: event.target.value })}
          hint={form.paymentMethod === "cash" ? "Optional for cash." : "Slip or approval number."}
        />
      </form>
    </Modal>
  );
}

/* ---------- Extra charge ---------- */

export function ChargeDialog({ booking, open, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ description: "", amount: "", quantity: "1" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ description: "", amount: "", quantity: "1" });
      setError("");
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount);
    const quantity = Number(form.quantity);

    if (form.description.trim().length < 2) return setError("Describe the charge.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Enter an amount greater than zero.");
    if (!Number.isInteger(quantity) || quantity < 1) return setError("Quantity must be a whole number.");

    setSaving(true);
    setError("");
    try {
      const data = await api.post(`/bookings/${booking._id}/charges`, {
        description: form.description.trim(),
        amount,
        quantity,
      });
      toast.success(data.message);
      onDone(data.booking);
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      title="Add a charge"
      description="Extra services such as dining, laundry or transfers."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="charge-form" loading={saving}>
            Add charge
          </Button>
        </>
      }
    >
      <form id="charge-form" className="stack" onSubmit={submit} noValidate>
        <Alert type="error">{error}</Alert>
        <TextField
          label="Description"
          required
          maxLength={120}
          placeholder="Airport transfer"
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
        <div className="form-grid">
          <TextField
            label="Unit price"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
          <TextField
            label="Quantity"
            type="number"
            inputMode="numeric"
            min="1"
            max="100"
            step="1"
            required
            value={form.quantity}
            onChange={(event) => setForm({ ...form, quantity: event.target.value })}
          />
        </div>
      </form>
    </Modal>
  );
}

/* ---------- Discount ---------- */

export function DiscountDialog({ booking, open, onClose, onDone }) {
  const { money } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ amount: "", reason: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const subtotal = booking?.folio?.subtotal || 0;

  useEffect(() => {
    if (open) {
      setForm({
        amount: String(booking?.folio?.discountAmount || ""),
        reason: booking?.discountReason || "",
      });
      setError("");
    }
  }, [open, booking]);

  const submit = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount || 0);

    if (!Number.isFinite(amount) || amount < 0) return setError("Enter a discount of zero or more.");
    if (amount > subtotal) return setError(`The discount cannot exceed ${money(subtotal)}.`);

    setSaving(true);
    setError("");
    try {
      const data = await api.patch(`/bookings/${booking._id}/discount`, {
        amount,
        reason: form.reason.trim(),
      });
      toast.success(data.message);
      onDone(data.booking);
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      title="Folio discount"
      description={`Applied before tax. Subtotal ${money(subtotal)}.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="discount-form" loading={saving}>
            Save discount
          </Button>
        </>
      }
    >
      <form id="discount-form" className="stack" onSubmit={submit} noValidate>
        <Alert type="error">{error}</Alert>
        <TextField
          label="Discount amount"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.amount}
          onChange={(event) => setForm({ ...form, amount: event.target.value })}
          hint="Enter 0 to remove the discount."
        />
        <TextField
          label="Reason"
          maxLength={160}
          value={form.reason}
          onChange={(event) => setForm({ ...form, reason: event.target.value })}
        />
      </form>
    </Modal>
  );
}

/* ---------- Reason (reject / cancel) ---------- */

export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label,
  confirmLabel,
  tone,
  onSubmit,
  required = false,
  hint = "Optional. Shared with the guest.",
  cancelLabel = "Keep reservation",
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setText("");
      setError("");
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (required && !text.trim()) {
      setError("Please give a reason.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(text.trim());
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {cancelLabel}
          </Button>
          <Button type="submit" form="reason-form" variant={tone || "danger"} loading={saving}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="reason-form" className="stack" onSubmit={submit} noValidate>
        <Alert type="error">{error}</Alert>
        <TextField
          as="textarea"
          label={label}
          maxLength={300}
          rows={3}
          required={required}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError("");
          }}
          hint={hint}
        />
      </form>
    </Modal>
  );
}

/* ---------- Change stay ---------- */

export function EditStayDialog({ booking, open, onClose, onDone }) {
  const { money, can } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ checkInDate: "", checkOutDate: "", numberOfGuests: "1", roomId: "" });
  const [rooms, setRooms] = useState({ list: [], loading: false, error: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const inHouse = booking?.bookingStatus === "checked-in";
  const canMoveRoom = can("bookings:edit") && !inHouse;
  const currentRoomId = booking?.room?._id || "";

  useEffect(() => {
    if (open && booking) {
      setForm({
        checkInDate: toDateInput(booking.checkInDate),
        checkOutDate: toDateInput(booking.checkOutDate),
        numberOfGuests: String(booking.numberOfGuests),
        roomId: currentRoomId,
      });
      setError("");
    }
  }, [open, booking, currentRoomId]);

  const nights = nightsBetween(form.checkInDate, form.checkOutDate);

  // The server tells us which rooms are free for the new dates, leaving this
  // booking's own nights out of the calculation.
  useEffect(() => {
    if (!open || !booking || nights < 1) {
      setRooms({ list: [], loading: false, error: "" });
      return undefined;
    }

    let cancelled = false;
    setRooms((current) => ({ ...current, loading: true, error: "" }));

    const timer = window.setTimeout(() => {
      api
        .get("/bookings/availability", {
          checkInDate: form.checkInDate,
          checkOutDate: form.checkOutDate,
          guests: form.numberOfGuests || 1,
          excludeBookingId: booking._id,
        })
        .then((data) => !cancelled && setRooms({ list: data.rooms, loading: false, error: "" }))
        .catch(
          (failure) => !cancelled && setRooms({ list: [], loading: false, error: failure.message })
        );
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, booking, form.checkInDate, form.checkOutDate, form.numberOfGuests, nights]);

  const selected = rooms.list.find((room) => room._id === form.roomId);
  const roomFree = Boolean(selected);
  const rate = form.roomId === currentRoomId ? booking?.pricePerNight : selected?.pricePerNight;

  const submit = async (event) => {
    event.preventDefault();
    if (nights < 1) return setError("Check-out must be after check-in.");
    if (!rooms.loading && !rooms.error && !roomFree) {
      return setError("The selected room is not available for these dates.");
    }

    const changes = {};
    if (form.checkInDate !== toDateInput(booking.checkInDate)) changes.checkInDate = form.checkInDate;
    if (form.checkOutDate !== toDateInput(booking.checkOutDate)) changes.checkOutDate = form.checkOutDate;
    if (Number(form.numberOfGuests) !== booking.numberOfGuests) {
      changes.numberOfGuests = Number(form.numberOfGuests);
    }
    if (form.roomId && form.roomId !== currentRoomId) changes.roomId = form.roomId;

    if (Object.keys(changes).length === 0) return onClose();

    setSaving(true);
    setError("");
    try {
      const data = await api.patch(`/bookings/${booking._id}`, changes);
      toast.success(data.message);
      onDone(data.booking);
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      title={inHouse ? "Change departure" : "Change reservation"}
      description="Availability is checked again before anything is saved."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="stay-form" loading={saving} disabled={rooms.loading}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="stay-form" className="stack" onSubmit={submit} noValidate>
        <Alert type="error">{error || rooms.error}</Alert>
        <div className="form-grid">
          <TextField
            label="Check-in"
            type="date"
            required
            disabled={inHouse}
            value={form.checkInDate}
            onChange={(event) => {
              const checkInDate = event.target.value;
              setForm((current) => ({
                ...current,
                checkInDate,
                checkOutDate:
                  current.checkOutDate > checkInDate
                    ? current.checkOutDate
                    : addDaysToInput(checkInDate, 1),
              }));
            }}
          />
          <TextField
            label="Check-out"
            type="date"
            required
            min={addDaysToInput(form.checkInDate, 1)}
            value={form.checkOutDate}
            onChange={(event) => setForm({ ...form, checkOutDate: event.target.value })}
          />
          <TextField
            label="Guests"
            type="number"
            min="1"
            max="12"
            step="1"
            required
            disabled={inHouse}
            value={form.numberOfGuests}
            onChange={(event) => setForm({ ...form, numberOfGuests: event.target.value })}
          />
          <TextField
            as="select"
            label="Room"
            disabled={!canMoveRoom || rooms.loading}
            value={form.roomId}
            onChange={(event) => setForm({ ...form, roomId: event.target.value })}
            hint={
              rooms.loading
                ? "Checking availability…"
                : roomFree
                  ? "Available for these dates."
                  : nights > 0
                    ? "Not available for these dates."
                    : ""
            }
          >
            {!roomFree && booking?.room && (
              <option value={currentRoomId}>
                Room {booking.room.roomNumber} (unavailable)
              </option>
            )}
            {(canMoveRoom ? rooms.list : rooms.list.filter((room) => room._id === currentRoomId)).map(
              (room) => (
                <option key={room._id} value={room._id}>
                  Room {room.roomNumber} · {room.name} · {money(room.pricePerNight)}
                </option>
              )
            )}
          </TextField>
        </div>
        {nights > 0 && rate !== undefined && (
          <Alert type="info">
            {nights} night{nights === 1 ? "" : "s"} at {money(rate)} — room charges{" "}
            {money(nights * rate)} before extras and tax.
          </Alert>
        )}
      </form>
    </Modal>
  );
}

/* ---------- Invoice ---------- */

export function InvoiceDialog({ bookingId, open, onClose }) {
  const { money } = useAuth();
  const { data, loading, error, reload } = useLoad(
    () => (open && bookingId ? api.get(`/bookings/${bookingId}/invoice`) : Promise.resolve(null)),
    [open, bookingId]
  );

  const invoice = data?.invoice;
  const cash = useMemo(() => makeLines(invoice, money), [invoice, money]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="wide"
      title="Invoice"
      description={invoice?.invoiceNumber}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button icon={Printer} onClick={() => window.print()} disabled={!invoice}>
            Print invoice
          </Button>
        </>
      }
    >
      <DataState loading={loading} error={error} onRetry={reload} skeleton={<SkeletonRows rows={4} />}>
        {invoice && (
          <div className="invoice print-area">
            <div className="invoice-head">
              <div>
                <h3>{invoice.hotel.hotelName}</h3>
                <div className="small muted">
                  {[invoice.hotel.address, invoice.hotel.contactPhone, invoice.hotel.contactEmail]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="invoice-meta">
                <span className="muted">Invoice</span>
                <strong>{invoice.invoiceNumber}</strong>
                <span>Issued {formatMoment(invoice.issuedAt)}</span>
              </div>
            </div>

            <div className="invoice-parties">
              <div>
                <h4>Billed to</h4>
                <strong>{invoice.guest.name}</strong>
                <div>{invoice.guest.email}</div>
                <div>{invoice.guest.phone}</div>
                <div>{invoice.guest.address}</div>
              </div>
              <div>
                <h4>Stay</h4>
                <div>
                  {formatStayDate(invoice.stay.checkInDate)} – {formatStayDate(invoice.stay.checkOutDate)}
                </div>
                <div>
                  {invoice.stay.nights} night{invoice.stay.nights === 1 ? "" : "s"} · {invoice.stay.guests}{" "}
                  guest{invoice.stay.guests === 1 ? "" : "s"}
                </div>
                <div className="row" style={{ marginTop: 6 }}>
                  <Badge status={invoice.bookingStatus} />
                  <Badge status={invoice.paymentStatus} />
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="right">Qty</th>
                    <th className="right">Unit price</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line, index) => (
                    <tr key={index}>
                      <td>{line.description}</td>
                      <td className="right">
                        {line.quantity} {line.unit}
                        {line.quantity === 1 ? "" : "s"}
                      </td>
                      <td className="right">{money(line.unitPrice)}</td>
                      <td className="right">{money(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="invoice-totals ledger">
              {cash.map((row) => (
                <div className={`ledger-row ${row.className || ""}`} key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>

            {invoice.payments.length > 0 && (
              <>
                <div className="section-title">Payments received</div>
                <div className="ledger">
                  {invoice.payments.map((payment, index) => (
                    <div className="ledger-row" key={index}>
                      <span>
                        {formatMoment(payment.receivedAt)} · {titleCase(payment.method || "cash")}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </span>
                      <strong>{money(payment.amount)}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </DataState>
    </Modal>
  );
}

function makeLines(invoice, money) {
  if (!invoice) return [];
  const { folio } = invoice;

  return [
    { label: "Subtotal", value: money(folio.subtotal) },
    folio.discountAmount > 0 && {
      label: `Discount${invoice.discountReason ? ` (${invoice.discountReason})` : ""}`,
      value: `− ${money(folio.discountAmount)}`,
    },
    folio.taxRate > 0 && { label: `Tax (${folio.taxRate}%)`, value: money(folio.taxAmount) },
    { label: "Total", value: money(folio.totalAmount), className: "total" },
    { label: "Paid", value: money(folio.amountPaid) },
    {
      label: "Balance due",
      value: money(folio.balance),
      className: folio.balance > 0 ? "due" : "settled",
    },
  ].filter(Boolean);
}
