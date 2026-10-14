import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, CalendarPlus, RefreshCw } from "lucide-react";

import BookingPanel from "../components/app/BookingPanel";
import ReservationForm from "../components/app/ReservationForm";
import {
  Avatar,
  Badge,
  Button,
  DataState,
  EmptyState,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Tabs,
  TextField,
} from "../components/ui/kit";
import { useAuth } from "../context/AppContext";
import { api } from "../lib/api";
import { formatStayShort } from "../lib/format";
import { useDebounced, useLoad } from "../lib/hooks";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "checked-in", label: "In house" },
  { value: "checked-out", label: "Checked out" },
  { value: "cancelled,rejected", label: "Closed" },
];

const LIMIT = 20;

export default function Reservations() {
  const { can, money } = useAuth();
  const [params, setParams] = useSearchParams();

  const [status, setStatus] = useState("");
  const [searchText, setSearchText] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);

  const search = useDebounced(searchText.trim());
  const openId = params.get("open") || "";
  const creating = params.get("new") === "1" && can("bookings:create");

  // Any change of filter returns to the first page.
  useEffect(() => {
    setPage(1);
  }, [status, search, range.from, range.to]);

  const rangeInvalid = range.from && range.to && range.to < range.from;

  const { data, loading, error, reload, refresh } = useLoad(
    () =>
      api.get("/bookings", {
        status,
        search,
        from: rangeInvalid ? "" : range.from,
        to: rangeInvalid ? "" : range.to,
        page,
        limit: LIMIT,
      }),
    [status, search, range.from, range.to, page]
  );

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const bookings = data?.bookings || [];
  const filtered = Boolean(status || search || range.from || range.to);

  return (
    <>
      <PageHeader
        eyebrow="Reservations"
        title="Reservations"
        description="Review requests, manage stays and open any reservation to see its full record."
      >
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
        {can("bookings:create") && (
          <Button icon={CalendarPlus} onClick={() => setParam("new", "1")}>
            New reservation
          </Button>
        )}
      </PageHeader>

      <section className="card">
        <div className="toolbar">
          <Tabs value={status} onChange={setStatus} options={STATUS_TABS} label="Filter by status" />
        </div>
        <div className="toolbar">
          <SearchInput
            value={searchText}
            onChange={setSearchText}
            placeholder="Guest, email, phone, room or invoice"
            label="Search reservations"
          />
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <TextField
              type="date"
              aria-label="Check-in from"
              value={range.from}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
            />
            <span className="muted">to</span>
            <TextField
              type="date"
              aria-label="Check-in to"
              min={range.from || undefined}
              value={range.to}
              onChange={(event) => setRange({ ...range, to: event.target.value })}
              error={rangeInvalid ? "End date is before the start date." : ""}
            />
          </div>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatus("");
                setSearchText("");
                setRange({ from: "", to: "" });
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          empty={bookings.length === 0}
          emptyState={
            <EmptyState
              icon={CalendarDays}
              title={filtered ? "No reservations match these filters" : "No reservations yet"}
              message={
                filtered
                  ? "Try a different status, date range or search term."
                  : "Reservations appear here as soon as guests book or the front desk creates one."
              }
            />
          }
        >
          <div className="table-wrap">
            <table className="table stack-sm">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Room</th>
                  <th>Stay</th>
                  <th className="right">Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr
                    key={booking._id}
                    className="clickable"
                    tabIndex={0}
                    onClick={() => setParam("open", booking._id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setParam("open", booking._id);
                      }
                    }}
                    aria-label={`Open reservation for ${booking.guestDetails.fullName}`}
                  >
                    <td className="primary">
                      <div className="cell-main">
                        <Avatar name={booking.guestDetails.fullName} />
                        <div>
                          <strong>{booking.guestDetails.fullName}</strong>
                          <span>{booking.guestDetails.phone}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Room">
                      <div>
                        <strong>{booking.room?.roomNumber || "N/A"}</strong>
                        <span className="cell-sub">{booking.room?.type}</span>
                      </div>
                    </td>
                    <td data-label="Stay">
                      <div>
                        {formatStayShort(booking.checkInDate)} – {formatStayShort(booking.checkOutDate)}
                        <span className="cell-sub">
                          {booking.totalNights} night{booking.totalNights === 1 ? "" : "s"} ·{" "}
                          {booking.numberOfGuests} guest{booking.numberOfGuests === 1 ? "" : "s"}
                        </span>
                      </div>
                    </td>
                    <td data-label="Total" className="right num">
                      <strong>{money(booking.totalAmount)}</strong>
                    </td>
                    <td data-label="Payment">
                      <Badge status={booking.paymentStatus} />
                    </td>
                    <td data-label="Status">
                      <Badge status={booking.bookingStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={LIMIT} total={data?.total || 0} onPage={setPage} />
        </DataState>
      </section>

      <BookingPanel
        bookingId={openId}
        open={Boolean(openId)}
        onClose={() => setParam("open", "")}
        onChanged={refresh}
      />

      <Modal
        open={creating}
        onClose={() => setParam("new", "")}
        size="xl"
        title="New reservation"
        description="For walk-in and telephone bookings. The room is held the moment the reservation is created."
      >
        <ReservationForm
          staffMode
          onCancel={() => setParam("new", "")}
          onCreated={(booking) => {
            refresh();
            const next = new URLSearchParams(params);
            next.delete("new");
            next.set("open", booking._id);
            setParams(next, { replace: true });
          }}
        />
      </Modal>
    </>
  );
}
