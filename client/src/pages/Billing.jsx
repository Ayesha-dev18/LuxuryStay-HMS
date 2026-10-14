import { useState } from "react";
import { CircleDollarSign, FileText, Receipt, RefreshCw, RotateCcw, Wallet } from "lucide-react";

import BookingPanel from "../components/app/BookingPanel";
import { InvoiceDialog, PaymentDialog } from "../components/app/BookingDialogs";
import {
  Avatar,
  Badge,
  Button,
  DataState,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  SkeletonStats,
  StatCard,
  Tabs,
} from "../components/ui/kit";
import { useAuth } from "../context/AppContext";
import { api } from "../lib/api";
import { formatStayShort } from "../lib/format";
import { useDebounced, useLoad } from "../lib/hooks";

const LIMIT = 20;

const TABS = [
  { value: "all", label: "All folios" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Part paid" },
  { value: "paid", label: "Paid" },
];

export default function Billing() {
  const { money, can } = useAuth();

  const [payment, setPayment] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState("");
  const [paying, setPaying] = useState(null);
  const [invoiceId, setInvoiceId] = useState("");

  const search = useDebounced(searchText.trim());

  const summary = useLoad(() => api.get("/reports/finance"), []);
  const folios = useLoad(
    () => api.get("/bookings", { view: "billable", payment, search, page, limit: LIMIT }),
    [payment, search, page]
  );

  const refreshAll = () => {
    summary.refresh();
    folios.refresh();
  };

  const bookings = folios.data?.bookings || [];
  const totals = summary.data?.summary;

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Billing"
        description="Every confirmed reservation has a folio. Payments are recorded here and totals are calculated by the server."
      >
        <Button
          variant="secondary"
          icon={RefreshCw}
          onClick={() => {
            summary.reload();
            folios.reload();
          }}
        >
          Refresh
        </Button>
      </PageHeader>

      <DataState
        loading={summary.loading}
        error={summary.error}
        onRetry={summary.reload}
        skeleton={<SkeletonStats count={4} />}
      >
        {totals && (
          <div className="stats">
            <StatCard
              feature
              label="Collected"
              value={money(totals.totalRevenue)}
              hint={`of ${money(totals.totalBilled)} billed`}
              icon={Wallet}
            />
            <StatCard
              label="Outstanding"
              value={money(totals.totalOutstanding)}
              hint={`${totals.unpaidBookings + totals.partialBookings} folio${totals.unpaidBookings + totals.partialBookings === 1 ? "" : "s"} with a balance`}
              icon={CircleDollarSign}
            />
            <StatCard
              label="Settled folios"
              value={totals.paidBookings}
              hint={`${totals.partialBookings} part paid · ${totals.unpaidBookings} unpaid`}
              icon={Receipt}
            />
            <StatCard
              label="Refunds due"
              value={money(totals.refundsDue)}
              hint={
                totals.refundCount
                  ? `${totals.refundCount} cancelled after payment`
                  : "No cancelled paid reservations"
              }
              icon={RotateCcw}
            />
          </div>
        )}
      </DataState>

      <section className="card">
        <div className="toolbar">
          <Tabs
            value={payment}
            onChange={(value) => {
              setPayment(value);
              setPage(1);
            }}
            options={TABS}
            label="Filter by payment status"
          />
          <SearchInput
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              setPage(1);
            }}
            placeholder="Guest, room or invoice number"
            label="Search folios"
          />
        </div>

        <DataState
          loading={folios.loading}
          error={folios.error}
          onRetry={folios.reload}
          empty={bookings.length === 0}
          emptyState={
            <EmptyState
              icon={Receipt}
              title={payment !== "all" || search ? "No folios match" : "No folios yet"}
              message="A folio is opened when a reservation is confirmed."
            />
          }
        >
          <div className="table-wrap">
            <table className="table stack-sm">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Invoice</th>
                  <th>Stay</th>
                  <th className="right">Total</th>
                  <th className="right">Paid</th>
                  <th className="right">Balance</th>
                  <th>Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => {
                  const cancelled = booking.bookingStatus === "cancelled";
                  return (
                    <tr key={booking._id}>
                      <td className="primary">
                        <button
                          type="button"
                          className="cell-main"
                          style={{ border: 0, background: "none", padding: 0, color: "inherit", textAlign: "left" }}
                          onClick={() => setOpenId(booking._id)}
                        >
                          <Avatar name={booking.guestDetails.fullName} />
                          <div>
                            <strong>{booking.guestDetails.fullName}</strong>
                            <span>Room {booking.room?.roomNumber || "N/A"}</span>
                          </div>
                        </button>
                      </td>
                      <td data-label="Invoice" className="num">
                        {booking.invoiceNumber || "—"}
                      </td>
                      <td data-label="Stay">
                        {formatStayShort(booking.checkInDate)} – {formatStayShort(booking.checkOutDate)}
                      </td>
                      <td data-label="Total" className="right num">
                        {money(booking.totalAmount)}
                      </td>
                      <td data-label="Paid" className="right num">
                        {money(booking.folio.amountPaid)}
                      </td>
                      <td data-label="Balance" className="right num">
                        <strong>{cancelled ? "—" : money(booking.balance)}</strong>
                      </td>
                      <td data-label="Status">
                        {cancelled ? <Badge tone="warning">Refund due</Badge> : <Badge status={booking.paymentStatus} />}
                      </td>
                      <td className="right actions">
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          {!cancelled && booking.balance > 0 && can("billing:payment") && (
                            <Button variant="accent" size="sm" icon={Wallet} onClick={() => setPaying(booking)}>
                              Pay
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={FileText}
                            onClick={() => setInvoiceId(booking._id)}
                          >
                            Invoice
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={LIMIT} total={folios.data?.total || 0} onPage={setPage} />
        </DataState>
      </section>

      <PaymentDialog booking={paying} open={Boolean(paying)} onClose={() => setPaying(null)} onDone={refreshAll} />
      <InvoiceDialog bookingId={invoiceId} open={Boolean(invoiceId)} onClose={() => setInvoiceId("")} />
      <BookingPanel bookingId={openId} open={Boolean(openId)} onClose={() => setOpenId("")} onChanged={refreshAll} />
    </>
  );
}
