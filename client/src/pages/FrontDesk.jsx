import { Link } from "react-router-dom";
import { ArrowRight, BedDouble, CalendarClock, RefreshCw, Users } from "lucide-react";

import { StatusBar } from "../components/ui/charts";
import { Badge, Button, Card, DataState, EmptyState, PageHeader, Skeleton } from "../components/ui/kit";
import { homeFor, useAuth } from "../context/AppContext";
import { api } from "../lib/api";
import { formatStayShort, stayDayParts, toDateInput } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { roomSegments } from "../lib/reporting";

function ActionsSkeleton() {
  return (
    <div className="tasks" aria-busy="true" aria-label="Loading">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} height={118} radius={6} />
      ))}
    </div>
  );
}

// Today's operational picture for reception: what to do first, who is
// arriving, and which rooms are ready.
export function FrontDeskView({ greetingText }) {
  const { user, money, can } = useAuth();
  const home = homeFor(user.role);

  const { data, loading, error, reload } = useLoad(() => api.get("/reports/front-desk"), []);

  const summary = data?.summary;

  const actions = summary
    ? [
        { to: "check-in", value: summary.arrivalsDue, label: "Arrivals to check in", cta: "Check in", alert: true },
        { to: "check-out", value: summary.departuresDue, label: "Departures due", cta: "Check out", alert: true },
        { to: "bookings", value: summary.pendingRequests, label: "Requests to review", cta: "Review", alert: true },
        { to: "check-out", value: summary.inHouse, label: `Guest${summary.inHouse === 1 ? "" : "s"} in house`, cta: "View stays" },
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Front desk"
        title={greetingText ? `Good ${greetingText}, ${user.name.split(" ")[0]}` : "Front desk"}
        description="Start with what is due now, then look ahead to the week's arrivals."
      >
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
        {can("bookings:create") && (
          <Link to={`${home}/bookings?new=1`} className="btn btn-primary">
            <CalendarClock size={17} aria-hidden="true" /> New reservation
          </Link>
        )}
      </PageHeader>

      <DataState loading={loading} error={error} onRetry={reload} skeleton={<ActionsSkeleton />}>
        {summary && (
          <>
            <section className="tasks" aria-label="Due today">
              {actions.map((item) => (
                <Link
                  key={item.label}
                  to={`${home}/${item.to}`}
                  className={`task ${item.alert && item.value > 0 ? "attention" : ""}`}
                >
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                  <em>
                    {item.cta} <ArrowRight size={13} aria-hidden="true" />
                  </em>
                </Link>
              ))}
            </section>

            <div className="grid grid-main">
              <Card
                title="Arriving this week"
                description="Confirmed reservations for the next seven days"
                flush
                actions={
                  <Link to={`${home}/bookings`} className="link small">
                    All reservations
                  </Link>
                }
              >
                {data.upcomingArrivals.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No arrivals this week"
                    message="Confirmed reservations will be listed here as their dates approach."
                  />
                ) : (
                  <div className="list" style={{ marginTop: 12 }}>
                    {data.upcomingArrivals.map((booking) => {
                      const { day, month } = stayDayParts(booking.checkInDate);
                      const dueToday = toDateInput(booking.checkInDate) <= data.today;
                      return (
                        <Link
                          key={booking._id}
                          to={`${home}/bookings?open=${booking._id}`}
                          className="list-row"
                          style={{ color: "inherit" }}
                        >
                          <div className="date-tile" aria-hidden="true">
                            <strong>{day}</strong>
                            <span>{month}</span>
                          </div>
                          <div className="grow">
                            <strong>{booking.guestDetails?.fullName}</strong>
                            <span>
                              Room {booking.room?.roomNumber || "N/A"} · {booking.totalNights} night
                              {booking.totalNights === 1 ? "" : "s"} · until{" "}
                              {formatStayShort(booking.checkOutDate)}
                            </span>
                          </div>
                          {dueToday ? <Badge tone="accent">Due now</Badge> : <Badge status={booking.paymentStatus} />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Card>

              <div className="stack">
                <Card title="Room readiness" description={`${summary.totalRooms} active rooms`}>
                  {summary.totalRooms > 0 ? (
                    <StatusBar segments={roomSegments(summary)} label="Rooms by status" />
                  ) : (
                    <EmptyState icon={BedDouble} title="No rooms yet" />
                  )}
                </Card>

                <Card title="Open accounts">
                  <div className="ledger">
                    <div className="ledger-row">
                      <span>Unsettled folios of guests in house</span>
                      <strong>{money(summary.inHouseBalance)}</strong>
                    </div>
                    <div className="ledger-row">
                      <span>Maintenance tasks open</span>
                      <strong>{summary.openMaintenance}</strong>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </>
        )}
      </DataState>
    </>
  );
}

export default function FrontDesk() {
  return <FrontDeskView />;
}
