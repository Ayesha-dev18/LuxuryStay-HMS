import { useMemo, useState } from "react";
import { BarChart3, BedDouble, CalendarDays, Percent, Printer, TrendingUp, Wallet } from "lucide-react";

import { BarList, Donut, TrendChart } from "../components/ui/charts";
import {
  Alert,
  Button,
  Card,
  DataState,
  EmptyState,
  PageHeader,
  SkeletonStats,
  StatCard,
  TextField,
} from "../components/ui/kit";
import { useAuth } from "../context/AppContext";
import { api } from "../lib/api";
import { formatNumber, hotelDay, titleCase } from "../lib/format";
import { useLoad } from "../lib/hooks";
import { timelinePoints } from "../lib/reporting";

const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 12 months", days: 365 },
];

const STATUS_LABELS = [
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["checkedIn", "In house"],
  ["checkedOut", "Checked out"],
  ["cancelled", "Cancelled"],
  ["rejected", "Rejected"],
];

export default function Reports() {
  const { money } = useAuth();
  const [range, setRange] = useState({ from: hotelDay(-29), to: hotelDay(0) });

  const invalid = !range.from || !range.to || range.to < range.from;

  const { data, loading, error, reload } = useLoad(
    () => (invalid ? Promise.resolve(null) : api.get("/reports/overview", range)),
    [range.from, range.to]
  );

  const points = useMemo(
    () => (data ? timelinePoints(data.timeline, data.range.granularity, money) : []),
    [data, money]
  );

  const summary = data?.summary;
  const collectionRate =
    summary && summary.totalBilled > 0
      ? Math.min(Math.round((summary.totalRevenue / summary.totalBilled) * 100), 999)
      : 0;

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Reports"
        description="Performance for any period, calculated from reservations and recorded payments."
      >
        <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!data}>
          Print
        </Button>
      </PageHeader>

      <section className="card card-pad no-print" style={{ marginBottom: 18 }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <TextField
            label="From"
            type="date"
            max={range.to || undefined}
            value={range.from}
            onChange={(event) => setRange({ ...range, from: event.target.value })}
          />
          <TextField
            label="To"
            type="date"
            min={range.from || undefined}
            value={range.to}
            onChange={(event) => setRange({ ...range, to: event.target.value })}
          />
          <div className="row">
            {PRESETS.map((preset) => (
              <Button
                key={preset.days}
                variant="ghost"
                size="sm"
                onClick={() => setRange({ from: hotelDay(1 - preset.days), to: hotelDay(0) })}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
        {invalid && (
          <div style={{ marginTop: 12 }}>
            <Alert type="error">Choose a start date that is on or before the end date.</Alert>
          </div>
        )}
      </section>

      <div className="print-area">
        <DataState loading={loading} error={error} onRetry={reload} skeleton={<SkeletonStats count={4} />}>
          {summary && (
            <>
              <p className="small muted" style={{ marginBottom: 12 }}>
                {data.range.from} to {data.range.to} · {data.range.days} days · generated{" "}
                {new Date(data.generatedAt).toLocaleString("en-GB")}
              </p>

              <div className="stats">
                <StatCard feature label="Revenue collected" value={money(summary.totalRevenue)} hint="Payments received in the period" icon={Wallet} />
                <StatCard label="Occupancy" value={`${summary.periodOccupancyRate}%`} hint={`${formatNumber(summary.nightsSold)} of ${formatNumber(summary.nightsOnOffer)} room nights sold`} icon={Percent} />
                <StatCard label="Average nightly rate" value={money(summary.averageNightlyRate)} hint="Across nights sold" icon={TrendingUp} />
                <StatCard label="Reservations made" value={formatNumber(summary.totalBookings)} hint={`${money(summary.totalBilled)} billed · ${collectionRate}% collected`} icon={CalendarDays} />
              </div>

              <Card title="Revenue over time" description={`Payments received per ${data.range.granularity}`}>
                {summary.totalRevenue > 0 ? (
                  <TrendChart data={points} format={money} label="Revenue collected over the period" height={270} />
                ) : (
                  <EmptyState icon={BarChart3} title="No payments in this period" message="Choose a wider range, or record payments against folios." />
                )}
              </Card>

              <div className="grid grid-2" style={{ marginTop: 18 }}>
                <Card title="Reservation outcomes" description="Reservations created in the period, by current status">
                  {summary.totalBookings > 0 ? (
                    <BarList
                      items={STATUS_LABELS.map(([key, label]) => ({
                        label,
                        value: data.statusBreakdown[key],
                      }))}
                    />
                  ) : (
                    <EmptyState icon={CalendarDays} title="No reservations in this period" />
                  )}
                </Card>

                <Card title="How guests paid" description="Payments received in the period, by method">
                  {summary.totalRevenue > 0 ? (
                    <BarList
                      format={money}
                      color="var(--a-series-3)"
                      items={data.paymentMethods.map((item) => ({
                        label: titleCase(item.method),
                        value: item.amount,
                      }))}
                    />
                  ) : (
                    <EmptyState icon={Wallet} title="No payments in this period" />
                  )}
                </Card>

                <Card title="Folio settlement" description="Billable reservations created in the period">
                  {summary.billableBookings > 0 ? (
                    <Donut
                      label="Folio settlement"
                      centerValue={summary.billableBookings}
                      centerLabel="Folios"
                      segments={[
                        { label: "Paid in full", value: data.paymentBreakdown.paid, color: "var(--a-series-3)" },
                        { label: "Part paid", value: data.paymentBreakdown.partial, color: "var(--a-series-4)" },
                        { label: "Unpaid", value: data.paymentBreakdown.unpaid, color: "var(--a-series-2)" },
                      ]}
                    />
                  ) : (
                    <EmptyState icon={Wallet} title="No folios opened in this period" />
                  )}
                </Card>

                <Card title="Outstanding" description="All open folios, regardless of period">
                  <div className="ledger">
                    <div className="ledger-row total">
                      <span>Total outstanding</span>
                      <strong>{money(summary.totalOutstanding)}</strong>
                    </div>
                    <div className="ledger-row">
                      <span>Rooms occupied right now</span>
                      <strong>
                        {summary.occupiedRooms} of {summary.totalRooms}
                      </strong>
                    </div>
                    <div className="ledger-row">
                      <span>Rooms out of service</span>
                      <strong>{summary.maintenanceRooms + summary.cleaningRooms}</strong>
                    </div>
                    <div className="ledger-row">
                      <span>Guest rating</span>
                      <strong>
                        {summary.feedbackCount ? `${summary.averageRating} / 5 (${summary.feedbackCount})` : "No reviews"}
                      </strong>
                    </div>
                  </div>
                </Card>
              </div>

              <section className="card" style={{ marginTop: 18 }}>
                <div className="card-head">
                  <div>
                    <h2>Room performance</h2>
                    <p>Stays overlapping the period</p>
                  </div>
                </div>
                {data.roomPerformance.length === 0 ? (
                  <EmptyState icon={BedDouble} title="No stays in this period" />
                ) : (
                  <div className="table-wrap" style={{ marginTop: 14 }}>
                    <table className="table stack-sm">
                      <thead>
                        <tr>
                          <th>Room</th>
                          <th className="right">Stays</th>
                          <th className="right">Nights sold</th>
                          <th className="right">Occupancy</th>
                          <th className="right">Room revenue</th>
                          <th className="right">Collected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.roomPerformance.map((room) => (
                          <tr key={room.roomId}>
                            <td className="primary">
                              <div>
                                <strong>Room {room.roomNumber}</strong>
                                <span className="cell-sub">
                                  {room.roomName}
                                  {room.roomType ? ` · ${room.roomType}` : ""}
                                </span>
                              </div>
                            </td>
                            <td data-label="Stays" className="right num">{room.stays}</td>
                            <td data-label="Nights sold" className="right num">{room.nights}</td>
                            <td data-label="Occupancy" className="right num">{room.occupancyRate}%</td>
                            <td data-label="Room revenue" className="right num">{money(room.roomRevenue)}</td>
                            <td data-label="Collected" className="right num">{money(room.collected)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </DataState>
      </div>
    </>
  );
}
