import { Link } from "react-router-dom";
import { BedDouble, CalendarPlus, Clock3, MoonStar, Wallet } from "lucide-react";

import {
  Badge,
  Card,
  DataState,
  EmptyState,
  PageHeader,
  SkeletonStats,
  StatCard,
} from "../components/ui/kit";
import heroImage from "../assets/hotel-hero.jpg";
import { useAuth } from "../context/AppContext";
import { api } from "../lib/api";
import { formatStayDate, stayDayParts, toDateInput } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { dayGreeting } from "../lib/reporting";
import { mediaForType } from "../lib/roomMedia";

const UPCOMING = ["pending", "confirmed", "checked-in"];

const STATUS_NOTE = {
  pending: "A member of staff is reviewing your identity document. You will be notified as soon as the stay is confirmed.",
  confirmed: "Your room is reserved. We look forward to welcoming you.",
  "checked-in": "You are checked in. The front desk is here whenever you need anything.",
};

// The next stay, shown first and large. Without one, an invitation to book.
function NextStay({ booking, settings }) {
  if (!booking) {
    return (
      <section className="stay-hero">
        <div className="stay-hero-body">
          <div className="page-eyebrow">Your next stay</div>
          <h2>Nothing planned yet.</h2>
          <p>Choose your dates to see which rooms are free. Reserving takes a few minutes.</p>
          <Link to="/guest/book-room" className="btn btn-accent" style={{ marginTop: 6 }}>
            <CalendarPlus size={17} aria-hidden="true" /> Book a stay
          </Link>
        </div>
        <div className="stay-hero-media">
          <img src={heroImage} alt="" />
        </div>
      </section>
    );
  }

  return (
    <section className="stay-hero">
      <div className="stay-hero-body">
        <div className="row" style={{ gap: 12 }}>
          <div className="page-eyebrow">{booking.bookingStatus === "checked-in" ? "Your stay" : "Your next stay"}</div>
          <Badge status={booking.bookingStatus} />
        </div>
        <h2>
          {formatStayDate(booking.checkInDate)}
          <br />
          to {formatStayDate(booking.checkOutDate)}
        </h2>
        <p>{STATUS_NOTE[booking.bookingStatus]}</p>
        <div className="row" style={{ marginTop: 4 }}>
          <Link to={`/guest/my-bookings?open=${booking._id}`} className="btn btn-accent">
            View booking
          </Link>
          <Link to="/guest/book-room" className="btn btn-secondary">
            Book another stay
          </Link>
        </div>
        <div className="stay-hero-facts">
          <div>
            <span>Room</span>
            {booking.room?.name || "Room"} · {booking.room?.roomNumber || "—"}
          </div>
          <div>
            <span>Nights</span>
            {booking.totalNights}
          </div>
          <div>
            <span>Guests</span>
            {booking.numberOfGuests}
          </div>
          <div>
            <span>Check-in from</span>
            {settings.checkInTime}
          </div>
        </div>
      </div>
      <div className="stay-hero-media">
        <img src={mediaForType(booking.room?.type).image} alt="" />
      </div>
    </section>
  );
}

export default function GuestHome() {
  const { user, money, settings } = useAuth();
  const { data, loading, error, reload } = useLoad(() => api.get("/bookings/my-bookings"), []);

  const bookings = data?.bookings || [];
  const active = bookings
    .filter((booking) => UPCOMING.includes(booking.bookingStatus))
    .sort((a, b) => toDateInput(a.checkInDate).localeCompare(toDateInput(b.checkInDate)));

  const next = active[0];
  const later = active.slice(1, 6);
  const nights = bookings
    .filter((booking) => booking.bookingStatus === "checked-out")
    .reduce((total, booking) => total + booking.totalNights, 0);
  const balance = active.reduce(
    (total, booking) => total + (booking.bookingStatus === "pending" ? 0 : booking.balance),
    0
  );

  return (
    <>
      <PageHeader
        eyebrow="Guest portal"
        title={`Good ${dayGreeting()}, ${user.name.split(" ")[0]}`}
        description="Your reservations, your stay details and your profile, in one place."
      />

      <DataState loading={loading} error={error} onRetry={reload} skeleton={<SkeletonStats count={3} />}>
        <NextStay booking={next} settings={settings} />

        <div className="stats">
          <StatCard label="Active reservations" value={active.length} hint="Pending, confirmed or in house" icon={Clock3} />
          <StatCard label="Nights stayed" value={nights} hint="Across completed stays" icon={MoonStar} />
          <StatCard label="Balance due" value={money(balance)} hint="Payable at the front desk" icon={Wallet} />
        </div>

        <div className="grid grid-main">
          <Card
            title="Also coming up"
            flush
            actions={
              <Link to="/guest/my-bookings" className="link small">
                All bookings
              </Link>
            }
          >
            {later.length === 0 ? (
              <EmptyState
                icon={BedDouble}
                title={next ? "No other stays planned" : "No upcoming stays"}
                message="When you reserve a room it appears here with its status."
              />
            ) : (
              <div className="list" style={{ marginTop: 12 }}>
                {later.map((booking) => {
                  const { day, month } = stayDayParts(booking.checkInDate);
                  return (
                    <Link
                      key={booking._id}
                      to={`/guest/my-bookings?open=${booking._id}`}
                      className="list-row"
                      style={{ color: "inherit" }}
                    >
                      <div className="date-tile" aria-hidden="true">
                        <strong>{day}</strong>
                        <span>{month}</span>
                      </div>
                      <div className="grow">
                        <strong>{booking.room?.name || "Room"}</strong>
                        <span>
                          {formatStayDate(booking.checkInDate)} – {formatStayDate(booking.checkOutDate)}
                        </span>
                      </div>
                      <Badge status={booking.bookingStatus} />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Good to know">
            <div className="ledger">
              <div className="ledger-row">
                <span>Check-in from</span>
                <strong>{settings.checkInTime}</strong>
              </div>
              <div className="ledger-row">
                <span>Check-out by</span>
                <strong>{settings.checkOutTime}</strong>
              </div>
              <div className="ledger-row">
                <span>Longest single stay</span>
                <strong>{settings.maxStayNights} nights</strong>
              </div>
            </div>
            <p className="small muted" style={{ marginTop: 14 }}>
              A reservation is confirmed once a member of staff has reviewed your identity document.
              You can change or cancel a request while it is still pending.
            </p>
          </Card>
        </div>
      </DataState>
    </>
  );
}
