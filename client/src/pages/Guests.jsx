import { useState } from "react";
import { RefreshCw, UserCheck, UserX, Users } from "lucide-react";

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
import { formatStayDate } from "../lib/format";
import { useAction, useDebounced, useLoad } from "../lib/hooks";

const LIMIT = 20;

const TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Deactivated" },
];

export default function Guests() {
  const { can, money } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction();

  const [status, setStatus] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState(null);

  const search = useDebounced(searchText.trim());
  const manage = can("guests:manage");

  const { data, loading, error, reload, refresh } = useLoad(
    () => api.get("/users/guests", { status, search, page, limit: LIMIT }),
    [status, search, page]
  );

  const guests = data?.guests || [];

  const toggle = () =>
    run("toggle", async () => {
      try {
        const result = await api.patch(`/users/${target.id}`, { isActive: !target.isActive });
        toast.success(
          result.user.isActive ? "Guest account reactivated." : "Guest account deactivated."
        );
      } catch (failure) {
        toast.error(failure.message);
      }
      setTarget(null);
      refresh();
    });

  return (
    <>
      <PageHeader
        eyebrow="Reservations"
        title="Guests"
        description="Guest accounts with their reservation history. Accounts are deactivated, never deleted, so past stays and invoices stay intact."
      >
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
      </PageHeader>

      <section className="card">
        <div className="toolbar">
          <Tabs
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={TABS}
            label="Filter guests"
          />
          <SearchInput
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              setPage(1);
            }}
            placeholder="Name, email or phone"
            label="Search guests"
          />
        </div>

        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          empty={guests.length === 0}
          emptyState={
            <EmptyState
              icon={Users}
              title={search || status !== "all" ? "No guests match" : "No guests yet"}
              message="Guests appear here when they register or when the front desk books for them."
            />
          }
        >
          <div className="table-wrap">
            <table className="table stack-sm">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Phone</th>
                  <th className="right">Reservations</th>
                  <th className="right">Total paid</th>
                  <th>Last stay</th>
                  <th>Status</th>
                  {manage && <th className="right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => (
                  <tr key={guest.id}>
                    <td className="primary">
                      <div className="cell-main">
                        <Avatar name={guest.name} />
                        <div>
                          <strong>{guest.name}</strong>
                          <span style={{ overflowWrap: "anywhere" }}>{guest.email}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Phone">{guest.phone || "—"}</td>
                    <td data-label="Reservations" className="right num">
                      {guest.bookings}
                    </td>
                    <td data-label="Total paid" className="right num">
                      {money(guest.totalPaid)}
                    </td>
                    <td data-label="Last stay">{guest.lastStay ? formatStayDate(guest.lastStay) : "—"}</td>
                    <td data-label="Status">
                      {!guest.isActive ? (
                        <Badge status="inactive">Deactivated</Badge>
                      ) : guest.inHouse ? (
                        <Badge tone="success">In house</Badge>
                      ) : (
                        <Badge status="active" />
                      )}
                    </td>
                    {manage && (
                      <td className="right actions">
                        <Button
                          variant={guest.isActive ? "danger-soft" : "secondary"}
                          size="sm"
                          icon={guest.isActive ? UserX : UserCheck}
                          onClick={() => setTarget(guest)}
                        >
                          {guest.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={LIMIT} total={data?.total || 0} onPage={setPage} />
        </DataState>
      </section>

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        busy={busy === "toggle"}
        tone={target?.isActive ? "danger" : "primary"}
        title={target?.isActive ? `Deactivate ${target?.name}?` : `Reactivate ${target?.name}?`}
        message={
          target?.isActive
            ? "The guest will be signed out and will not be able to sign in or book. Their reservations and invoices are kept."
            : "The guest will be able to sign in and book again."
        }
        confirmLabel={target?.isActive ? "Deactivate account" : "Reactivate account"}
        onConfirm={toggle}
      />
    </>
  );
}
