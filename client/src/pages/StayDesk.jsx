import { useState } from "react";
import { DoorOpen, LogIn, RefreshCw, Wallet } from "lucide-react";

import BookingPanel from "../components/app/BookingPanel";
import { PaymentDialog } from "../components/app/BookingDialogs";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  DataState,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  Tabs,
} from "../components/ui/kit";
import { useAuth, useToast } from "../context/AppContext";
import { api } from "../lib/api";
import { formatStayShort, toDateInput } from "../lib/format";
import { useAction, useDebounced, useLoad } from "../lib/hooks";

const LIMIT = 20;

const MODES = {
  arrivals: {
    eyebrow: "Front desk",
    title: "Check-in",
    description:
      "Confirmed reservations whose stay has started. A guest can be checked in once their room is clean and free.",
    tabs: [
      { value: "arrivals", label: "Due now" },
      { value: "upcoming", label: "Upcoming" },
    ],
    emptyTitle: "No arrivals waiting",
    emptyMessage: "Confirmed reservations appear here on their check-in date.",
  },
  departures: {
    eyebrow: "Front desk",
    title: "Check-out",
    description:
      "Guests currently in house. The folio must be settled before a guest can be checked out.",
    tabs: [
      { value: "departures", label: "Due today" },
      { value: "inhouse", label: "All in house" },
    ],
    emptyTitle: "No departures waiting",
    emptyMessage: "Guests appear here on their departure date.",
  },
};

export default function StayDesk({ mode }) {
  const config = MODES[mode];
  const { money, can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction();

  const [view, setView] = useState(config.tabs[0].value);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState("");
  const [checkingOut, setCheckingOut] = useState(null);
  const [paying, setPaying] = useState(null);

  const search = useDebounced(searchText.trim());

  const { data, loading, error, reload, refresh } = useLoad(() => {
    const query =
      view === "upcoming"
        ? { status: "confirmed", sort: "checkin" }
        : { view, sort: mode === "arrivals" ? "checkin" : "checkout" };
    return api.get("/bookings", { ...query, search, page, limit: LIMIT });
  }, [view, search, page, mode]);

  const bookings = data?.bookings || [];
  const today = data?.today || "";

  const perform = (key, path, done) =>
    run(key, async () => {
      try {
        const result = await api.patch(path);
        toast.success(result.message);
      } catch (failure) {
        toast.error(failure.message);
      }
      // The list is reloaded either way: a refused action usually means the
      // record changed (a new balance, a room no longer free).
      done?.();
      refresh();
    });

  const changeView = (next) => {
    setView(next);
    setPage(1);
  };

  return (
    <>
      <PageHeader eyebrow={config.eyebrow} title={config.title} description={config.description}>
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
      </PageHeader>

      <section className="card">
        <div className="toolbar">
          <Tabs value={view} onChange={changeView} options={config.tabs} label="View" />
          <SearchInput
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              setPage(1);
            }}
            placeholder="Guest, phone or room"
            label="Search guests"
          />
        </div>

        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          empty={bookings.length === 0}
          emptyState={
            <EmptyState
              icon={mode === "arrivals" ? LogIn : DoorOpen}
              title={search ? "No guests match your search" : config.emptyTitle}
              message={search ? "Check the spelling or try the room number." : config.emptyMessage}
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
                  <th className="right">Balance</th>
                  <th>Status</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => {
                  const roomStatus = booking.room?.status;
                  const stayStarted = toDateInput(booking.checkInDate) <= today;
                  const roomReady = ["available", "reserved"].includes(roomStatus);

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
                            <span>{booking.guestDetails.phone}</span>
                          </div>
                        </button>
                      </td>
                      <td data-label="Room">
                        <div>
                          <strong>{booking.room?.roomNumber || "N/A"}</strong>
                          {mode === "arrivals" && roomStatus && (
                            <span className="cell-sub">
                              <Badge status={roomStatus} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Stay">
                        {formatStayShort(booking.checkInDate)} – {formatStayShort(booking.checkOutDate)}
                      </td>
                      <td data-label="Balance" className="right num">
                        <strong style={{ color: booking.balance > 0 ? "var(--a-danger)" : "var(--a-success)" }}>
                          {money(booking.balance)}
                        </strong>
                      </td>
                      <td data-label="Status">
                        <Badge status={booking.paymentStatus} />
                      </td>
                      <td className="right actions">
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          {mode === "arrivals" ? (
                            <Button
                              size="sm"
                              icon={LogIn}
                              loading={busy === booking._id}
                              disabled={!stayStarted || !roomReady || Boolean(busy)}
                              title={
                                !stayStarted
                                  ? "Check-in opens on the arrival date"
                                  : !roomReady
                                    ? `The room is ${roomStatus}`
                                    : undefined
                              }
                              onClick={() => perform(booking._id, `/bookings/${booking._id}/check-in`)}
                            >
                              Check in
                            </Button>
                          ) : (
                            <>
                              {booking.balance > 0 && can("billing:payment") && (
                                <Button variant="accent" size="sm" icon={Wallet} onClick={() => setPaying(booking)}>
                                  Pay
                                </Button>
                              )}
                              <Button size="sm" icon={DoorOpen} onClick={() => setCheckingOut(booking)}>
                                Check out
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={LIMIT} total={data?.total || 0} onPage={setPage} />
        </DataState>
      </section>

      <ConfirmDialog
        open={Boolean(checkingOut)}
        onClose={() => setCheckingOut(null)}
        title={`Check out ${checkingOut?.guestDetails.fullName || "guest"}?`}
        message={
          checkingOut?.balance > 0
            ? `There is an outstanding balance of ${money(checkingOut.balance)}. Record the payment first.`
            : "The folio is settled. The room will be handed to housekeeping for cleaning."
        }
        confirmLabel="Check out"
        busy={busy === "check-out"}
        onConfirm={() =>
          perform("check-out", `/bookings/${checkingOut._id}/check-out`, () => setCheckingOut(null))
        }
      />

      <PaymentDialog booking={paying} open={Boolean(paying)} onClose={() => setPaying(null)} onDone={refresh} />

      <BookingPanel bookingId={openId} open={Boolean(openId)} onClose={() => setOpenId("")} onChanged={refresh} />
    </>
  );
}
