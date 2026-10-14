import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BedDouble, CalendarPlus, MessageSquareText, RefreshCw, Users } from "lucide-react";

import BookingPanel from "../components/app/BookingPanel";
import {
  Alert,
  Badge,
  Button,
  DataState,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  StarInput,
  Stars,
  Tabs,
  TextField,
} from "../components/ui/kit";
import { useAuth, useToast } from "../context/AppContext";
import { api } from "../lib/api";
import { ROOM_TONE_COLORS, formatStayDate } from "../lib/format";
import { useLoad } from "../lib/hooks";

const GROUPS = {
  upcoming: ["pending", "confirmed", "checked-in"],
  past: ["checked-out"],
  closed: ["cancelled", "rejected"],
};

const STATUS_COLOR = {
  pending: "var(--a-warning)",
  confirmed: ROOM_TONE_COLORS.occupied,
  "checked-in": "var(--a-success)",
  "checked-out": "var(--a-line-strong)",
  cancelled: "var(--a-danger)",
  rejected: "var(--a-danger)",
};

const EMPTY_REVIEW = { rating: 0, cleanlinessRating: 0, serviceRating: 0, roomRating: 0, title: "", message: "" };

function ReviewDialog({ booking, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_REVIEW);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(EMPTY_REVIEW);
    setMessage("");
  }, [booking]);

  const submit = async (event) => {
    event.preventDefault();

    if (form.rating < 1) return setMessage("Please choose an overall rating.");
    if (form.message.trim().length < 5) return setMessage("Please tell us a little about your stay.");

    setSaving(true);
    setMessage("");
    try {
      const data = await api.post("/feedback", {
        bookingId: booking._id,
        rating: form.rating,
        title: form.title.trim(),
        message: form.message.trim(),
        cleanlinessRating: form.cleanlinessRating || null,
        serviceRating: form.serviceRating || null,
        roomRating: form.roomRating || null,
      });
      toast.success(data.message);
      onSaved();
      onClose();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const rate = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <Modal
      open={Boolean(booking)}
      onClose={onClose}
      busy={saving}
      title="How was your stay?"
      description={booking ? `${booking.room?.name || "Your room"} · ${formatStayDate(booking.checkInDate)}` : ""}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Not now
          </Button>
          <Button type="submit" form="review-form" loading={saving}>
            Submit review
          </Button>
        </>
      }
    >
      <form id="review-form" className="stack" onSubmit={submit} noValidate>
        <Alert type="error">{message}</Alert>
        <Field label="Overall rating" required>
          <StarInput value={form.rating} onChange={rate("rating")} label="Overall rating" />
        </Field>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <Field label="Cleanliness">
            <StarInput value={form.cleanlinessRating} onChange={rate("cleanlinessRating")} label="Cleanliness" />
          </Field>
          <Field label="Service">
            <StarInput value={form.serviceRating} onChange={rate("serviceRating")} label="Service" />
          </Field>
          <Field label="Room">
            <StarInput value={form.roomRating} onChange={rate("roomRating")} label="Room" />
          </Field>
        </div>
        <TextField
          label="Title"
          maxLength={100}
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          hint="Optional"
        />
        <TextField
          as="textarea"
          label="Your review"
          required
          maxLength={1000}
          rows={4}
          value={form.message}
          onChange={(event) => setForm({ ...form, message: event.target.value })}
          hint={`${form.message.length} / 1000`}
        />
      </form>
    </Modal>
  );
}

export default function GuestBookings() {
  const { money } = useAuth();
  const [params, setParams] = useSearchParams();
  const [group, setGroup] = useState("upcoming");
  const [reviewing, setReviewing] = useState(null);

  const openId = params.get("open") || "";

  const { data, loading, error, reload, refresh } = useLoad(async () => {
    const [bookings, feedback] = await Promise.all([
      api.get("/bookings/my-bookings"),
      api.get("/feedback/my"),
    ]);
    return { bookings: bookings.bookings, feedback: feedback.feedback };
  }, []);

  const bookings = useMemo(() => data?.bookings || [], [data]);

  const reviews = useMemo(() => {
    const map = new Map();
    for (const item of data?.feedback || []) map.set(String(item.booking?._id || item.booking), item);
    return map;
  }, [data]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(GROUPS).map(([key, statuses]) => [
          key,
          bookings.filter((booking) => statuses.includes(booking.bookingStatus)).length,
        ])
      ),
    [bookings]
  );

  // A booking opened from a link decides which tab is shown.
  useEffect(() => {
    const opened = bookings.find((booking) => booking._id === openId);
    if (!opened) return;
    const match = Object.entries(GROUPS).find(([, statuses]) => statuses.includes(opened.bookingStatus));
    if (match) setGroup(match[0]);
  }, [openId, bookings]);

  const visible = bookings.filter((booking) => GROUPS[group].includes(booking.bookingStatus));

  const setOpen = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set("open", id);
    else next.delete("open");
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Guest portal"
        title="My bookings"
        description="Open a reservation to see its details, change or cancel a pending request, or view your invoice."
      >
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
        <Link to="/guest/book-room" className="btn btn-primary">
          <CalendarPlus size={17} aria-hidden="true" /> Book a stay
        </Link>
      </PageHeader>

      <div style={{ marginBottom: 18 }}>
        <Tabs
          value={group}
          onChange={setGroup}
          label="Filter bookings"
          options={[
            { value: "upcoming", label: "Upcoming", count: counts.upcoming },
            { value: "past", label: "Past stays", count: counts.past },
            { value: "closed", label: "Cancelled", count: counts.closed },
          ]}
        />
      </div>

      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={visible.length === 0}
        emptyState={
          <section className="card">
            <EmptyState
              icon={BedDouble}
              title={
                group === "upcoming"
                  ? "No upcoming stays"
                  : group === "past"
                    ? "No past stays yet"
                    : "Nothing cancelled"
              }
              message={group === "upcoming" ? "Reserve a room and it will appear here." : undefined}
            >
              {group === "upcoming" && (
                <Link to="/guest/book-room" className="btn btn-primary">
                  Book a stay
                </Link>
              )}
            </EmptyState>
          </section>
        }
      >
        <div className="room-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {visible.map((booking) => {
            const review = reviews.get(booking._id);
            const billable = ["confirmed", "checked-in", "checked-out"].includes(booking.bookingStatus);

            return (
              <article
                key={booking._id}
                className="room-card-a"
                style={{ "--tone": STATUS_COLOR[booking.bookingStatus] }}
              >
                <div className="row row-between">
                  <span className="room-no">{booking.room?.roomNumber || "—"}</span>
                  <Badge status={booking.bookingStatus} />
                </div>
                <div>
                  <strong>{booking.room?.name || "Room"}</strong>
                  <div className="small muted">{booking.room?.type}</div>
                </div>
                <div className="ledger">
                  <div className="ledger-row">
                    <span>Check-in</span>
                    <strong>{formatStayDate(booking.checkInDate)}</strong>
                  </div>
                  <div className="ledger-row">
                    <span>Check-out</span>
                    <strong>{formatStayDate(booking.checkOutDate)}</strong>
                  </div>
                  <div className="ledger-row">
                    <span>
                      {booking.totalNights} night{booking.totalNights === 1 ? "" : "s"}
                    </span>
                    <strong>{money(booking.totalAmount)}</strong>
                  </div>
                </div>
                <div className="room-meta">
                  <span>
                    <Users size={14} aria-hidden="true" /> {booking.numberOfGuests} guest
                    {booking.numberOfGuests === 1 ? "" : "s"}
                  </span>
                  {billable && <Badge status={booking.paymentStatus} />}
                </div>

                {review && (
                  <div className="row" style={{ gap: 8 }}>
                    <Stars value={review.rating} />
                    <span className="small muted">Thank you for your review</span>
                  </div>
                )}

                <div className="row" style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--a-line)" }}>
                  <Button variant="secondary" size="sm" onClick={() => setOpen(booking._id)}>
                    View details
                  </Button>
                  {booking.bookingStatus === "checked-out" && !review && (
                    <Button variant="accent" size="sm" icon={MessageSquareText} onClick={() => setReviewing(booking)}>
                      Leave a review
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </DataState>

      <BookingPanel bookingId={openId} open={Boolean(openId)} onClose={() => setOpen("")} onChanged={refresh} />
      <ReviewDialog booking={reviewing} onClose={() => setReviewing(null)} onSaved={refresh} />
    </>
  );
}
