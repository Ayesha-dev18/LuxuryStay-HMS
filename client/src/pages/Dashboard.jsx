import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BedDouble,
  CalendarCheck,
  CalendarDays,
  Percent,
  RefreshCw,
  Star,
  Tag,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { Donut, TrendChart } from "../components/ui/charts";
import {
  Badge,
  Button,
  Card,
  DataState,
  EmptyState,
  PageHeader,
  SkeletonStats,
  StatCard,
  Tabs,
} from "../components/ui/kit";
import { homeFor, useAuth } from "../context/AppContext";
import { api } from "../lib/api";
import { formatNumber, hotelDay, timeAgo } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { dayGreeting, roomSegments, timelinePoints } from "../lib/reporting";
import { FrontDeskView } from "./FrontDesk";
import { HousekeepingOverview } from "./Housekeeping";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
];

// What needs doing today, each linking to the screen where it is done.
function TodayActions({ home }) {
  const { money } = useAuth();
  const { data, error } = useLoad(() => api.get("/reports/front-desk"), []);

  if (error || !data) return null;

  const { summary } = data;
  const items = [
    { to: "check-in", value: summary.arrivalsDue, label: "Arrivals to check in", cta: "Check in", alert: true },
    { to: "check-out", value: summary.departuresDue, label: "Departures due", cta: "Check out", alert: true },
    { to: "bookings", value: summary.pendingRequests, label: "Requests to review", cta: "Review", alert: true },
    { to: "housekeeping", value: summary.cleaningRooms, label: "Rooms to clean", cta: "Open queue" },
    { to: "maintenance", value: summary.openMaintenance, label: "Open maintenance", cta: "View tasks" },
    { to: "finance", value: money(summary.inHouseBalance), label: "In-house balance", cta: "Open billing", wide: true },
  ];

  return (
    <section className="tasks" aria-label="Today">
      {items.map((item) => (
        <Link
          key={item.to}
          to={`${home}/${item.to}`}
          className={`task ${item.alert && item.value > 0 ? "attention" : ""}`}
        >
          <strong style={item.wide ? { fontSize: 24, paddingTop: 6 } : undefined}>{item.value}</strong>
          <span>{item.label}</span>
          <em>
            {item.cta} <ArrowRight size={13} aria-hidden="true" />
          </em>
        </Link>
      ))}
    </section>
  );
}

function ManagementDashboard() {
  const { user, money } = useAuth();
  const home = homeFor(user.role);
  const [days, setDays] = useState("30");

  const { data, loading, error, reload } = useLoad(
    () => api.get("/reports/overview", { from: hotelDay(1 - Number(days)), to: hotelDay(0) }),
    [days]
  );

  const points = useMemo(
    () => (data ? timelinePoints(data.timeline, data.range.granularity, money) : []),
    [data, money]
  );

  const summary = data?.summary;

  return (
    <>
      <PageHeader
        eyebrow={user.role === "admin" ? "Administrator" : "Manager"}
        title={`Good ${dayGreeting()}, ${user.name.split(" ")[0]}`}
        description="What needs attention today, then how the property has performed over the period you choose."
      >
        <Tabs value={days} onChange={setDays} options={RANGES} label="Reporting period" />
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
      </PageHeader>

      <TodayActions home={home} />

      <DataState loading={loading} error={error} onRetry={reload} skeleton={<SkeletonStats count={5} />}>
        {summary && (
          <>
            <div className="stats">
              <StatCard
                feature
                label="Revenue collected"
                value={money(summary.totalRevenue)}
                hint={`${money(summary.totalOutstanding)} outstanding across all folios`}
                icon={Wallet}
              />
              <StatCard
                label="Occupancy today"
                value={`${summary.occupancyRate}%`}
                hint={`${summary.occupiedRooms} of ${summary.totalRooms} rooms occupied`}
                icon={Percent}
              />
              <StatCard
                label="Reservations made"
                value={formatNumber(summary.totalBookings)}
                hint={`${data.statusBreakdown.cancelled + data.statusBreakdown.rejected} cancelled or declined`}
                icon={CalendarDays}
              />
              <StatCard
                label="Average nightly rate"
                value={money(summary.averageNightlyRate)}
                hint={`${formatNumber(summary.nightsSold)} of ${formatNumber(summary.nightsOnOffer)} nights sold`}
                icon={Tag}
              />
              <StatCard
                label="Guest rating"
                value={summary.feedbackCount ? `${summary.averageRating} / 5` : "—"}
                hint={
                  summary.feedbackCount
                    ? `From ${summary.feedbackCount} review${summary.feedbackCount === 1 ? "" : "s"}`
                    : "No reviews yet"
                }
                icon={Star}
              />
            </div>

            <div className="grid grid-main">
              <Card
                title="Revenue"
                description={`Payments received, ${data.range.from} to ${data.range.to}`}
                actions={
                  <Link to={`${home}/reports`} className="link small">
                    Full report
                  </Link>
                }
              >
                {summary.totalRevenue > 0 ? (
                  <TrendChart data={points} format={money} label="Revenue collected over the period" />
                ) : (
                  <EmptyState
                    icon={TrendingUp}
                    title="No payments in this period"
                    message="Revenue appears here as soon as payments are recorded against folios."
                  />
                )}
              </Card>

              <Card title="Rooms right now" description={`${summary.totalRooms} active rooms`}>
                {summary.totalRooms > 0 ? (
                  <Donut
                    segments={roomSegments(summary)}
                    centerValue={`${summary.occupancyRate}%`}
                    centerLabel="Occupied"
                    label="Room status breakdown"
                  />
                ) : (
                  <EmptyState icon={BedDouble} title="No rooms yet" message="Add rooms to see occupancy." />
                )}
              </Card>
            </div>

            <div className="grid grid-main" style={{ marginTop: 20 }}>
              <Card
                title="Latest reservations"
                flush
                actions={
                  <Link to={`${home}/bookings`} className="link small">
                    View all
                  </Link>
                }
              >
                {data.recentActivity.length === 0 ? (
                  <EmptyState icon={CalendarCheck} title="No reservations yet" />
                ) : (
                  <div className="list" style={{ marginTop: 12 }}>
                    {data.recentActivity.map((item) => (
                      <Link
                        key={item.id}
                        to={`${home}/bookings?open=${item.id}`}
                        className="list-row"
                        style={{ color: "inherit" }}
                      >
                        <div className="grow">
                          <strong>{item.guestName}</strong>
                          <span>
                            Room {item.roomNumber} · {timeAgo(item.createdAt)}
                          </span>
                        </div>
                        <span className="num" style={{ fontWeight: 600 }}>
                          {money(item.totalAmount)}
                        </span>
                        <Badge status={item.bookingStatus} />
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="The period in figures" description={`${data.range.days} days`}>
                <div className="ledger">
                  <div className="ledger-row">
                    <span>Occupancy over the period</span>
                    <strong>{summary.periodOccupancyRate}%</strong>
                  </div>
                  <div className="ledger-row">
                    <span>Billed on new reservations</span>
                    <strong>{money(summary.totalBilled)}</strong>
                  </div>
                  <div className="ledger-row">
                    <span>Awaiting review</span>
                    <strong>{data.statusBreakdown.pending}</strong>
                  </div>
                  <div className="ledger-row">
                    <span>Confirmed</span>
                    <strong>{data.statusBreakdown.confirmed}</strong>
                  </div>
                  <div className="ledger-row">
                    <span>Stays completed</span>
                    <strong>{data.statusBreakdown.checkedOut}</strong>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </DataState>
    </>
  );
}

// Each role lands on the overview that matches its work.
export default function Dashboard() {
  const { can } = useAuth();

  if (can("reports:view")) return <ManagementDashboard />;
  if (can("frontdesk:view")) return <FrontDeskView greetingText={dayGreeting()} />;
  return <HousekeepingOverview greetingText={dayGreeting()} />;
}
