import { Link } from "react-router-dom";
import { BedDouble, CheckCircle2, Play, RefreshCw, Sparkles, Timer, Wrench } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  DataState,
  EmptyState,
  PageHeader,
  SkeletonStats,
  StatCard,
} from "../components/ui/kit";
import { homeFor, useAuth, useToast } from "../context/AppContext";
import { api } from "../lib/api";
import { formatMoment, timeAgo } from "../lib/format";
import { useAction, useLoad } from "../lib/hooks";

function useHousekeeping() {
  const toast = useToast();
  const { busy, run } = useAction();
  const state = useLoad(() => api.get("/rooms/housekeeping"), []);

  const update = (room, step) =>
    run(`${step}-${room._id}`, async () => {
      try {
        const result = await api.patch(`/rooms/housekeeping/${room._id}/${step}`);
        toast.success(result.message);
      } catch (failure) {
        toast.error(failure.message);
      }
      state.refresh();
    });

  return { ...state, busy, update };
}

function CleaningQueue({ rooms, busy, update }) {
  const { user } = useAuth();

  if (rooms.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Every room is clean"
        message="Rooms appear here automatically when a guest checks out."
      />
    );
  }

  // The rooms this person has started come first, then rooms nobody has
  // started (the next thing to pick up), then rooms colleagues are cleaning.
  const isMine = (room) => Boolean(room.cleaningStartedAt) && String(room.cleaningBy?._id || "") === String(user.id);
  const rank = (room) => (isMine(room) ? 0 : room.cleaningStartedAt ? 2 : 1);
  const ordered = [...rooms].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="room-grid" style={{ padding: "0 24px 24px" }}>
      {ordered.map((room) => {
        const started = Boolean(room.cleaningStartedAt);
        const mine = isMine(room);
        return (
          <article
            className="room-card-a"
            key={room._id}
            style={{ "--tone": started ? "var(--a-info)" : "var(--a-warning)" }}
          >
            <div className="row row-between">
              <span className="room-no">{room.roomNumber}</span>
              {mine ? (
                <Badge tone="info">Yours · in progress</Badge>
              ) : started ? (
                <Badge tone="info">In progress</Badge>
              ) : (
                <Badge tone="warning">Waiting</Badge>
              )}
            </div>
            <div>
              <strong>{room.name}</strong>
              <div className="small muted">
                Floor {room.floor} · {room.type} · {room.bedType}
              </div>
            </div>
            <div className="small muted">
              {started
                ? `Started ${timeAgo(room.cleaningStartedAt)}${mine ? " by you" : room.cleaningBy?.name ? ` by ${room.cleaningBy.name}` : ""}`
                : "Not started yet"}
            </div>
            <div className="row" style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid var(--a-line)" }}>
              {!started && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Play}
                  loading={busy === `start-${room._id}`}
                  disabled={Boolean(busy)}
                  onClick={() => update(room, "start")}
                >
                  Start
                </Button>
              )}
              <Button
                variant="success"
                size="sm"
                icon={CheckCircle2}
                loading={busy === `complete-${room._id}`}
                disabled={Boolean(busy)}
                onClick={() => update(room, "complete")}
              >
                Mark clean
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function RecentlyCleaned({ rooms }) {
  if (rooms.length === 0) {
    return <EmptyState icon={BedDouble} title="Nothing cleaned in the last 24 hours" />;
  }

  return (
    <div className="list">
      {rooms.map((room) => (
        <div className="list-row" key={room._id}>
          <div className="grow">
            <strong>Room {room.roomNumber}</strong>
            <span>
              {formatMoment(room.lastCleanedAt)}
              {room.lastCleanedBy?.name ? ` · ${room.lastCleanedBy.name}` : ""}
            </span>
          </div>
          <Badge status={room.status} />
        </div>
      ))}
    </div>
  );
}

// Landing dashboard for housekeeping staff: the queue, plus open maintenance.
export function HousekeepingOverview({ greetingText }) {
  const { user } = useAuth();
  const home = homeFor(user.role);
  const housekeeping = useHousekeeping();
  const maintenance = useLoad(() => api.get("/maintenance", { status: "open", limit: 5 }), []);

  const queue = housekeeping.data?.rooms || [];
  const recent = housekeeping.data?.recent || [];
  const inProgress = queue.filter((room) => room.cleaningStartedAt).length;

  return (
    <>
      <PageHeader
        eyebrow="Housekeeping"
        title={`Good ${greetingText}, ${user.name.split(" ")[0]}`}
        description="Pick up the next room, mark it clean, and it goes straight back to reception."
      >
        <Button
          variant="secondary"
          icon={RefreshCw}
          onClick={() => {
            housekeeping.reload();
            maintenance.reload();
          }}
        >
          Refresh
        </Button>
      </PageHeader>

      <DataState
        loading={housekeeping.loading}
        error={housekeeping.error}
        onRetry={housekeeping.reload}
        skeleton={<SkeletonStats count={3} />}
      >
        <div className="stats">
          <StatCard feature label="Rooms to clean" value={queue.length - inProgress} hint="Waiting to be started" icon={Sparkles} />
          <StatCard label="In progress" value={inProgress} hint="Cleaning under way" icon={Timer} />
          <StatCard label="Cleaned in 24 hours" value={recent.length} hint="Released back to reception" icon={CheckCircle2} />
          <StatCard
            label="Open maintenance"
            value={maintenance.data?.open ?? "—"}
            hint={<Link to={`${home}/maintenance`} style={{ color: "inherit", textDecoration: "underline" }}>View tasks</Link>}
            icon={Wrench}
          />
        </div>

        <div className="grid grid-main">
          <Card title="Cleaning queue" description="Mark a room clean to release it for the next guest" flush>
            <div style={{ marginTop: 12 }}>
              <CleaningQueue rooms={queue} busy={housekeeping.busy} update={housekeeping.update} />
            </div>
          </Card>

          <Card
            title="Open maintenance"
            flush
            actions={
              <Link to={`${home}/maintenance`} className="link small">
                All tasks
              </Link>
            }
          >
            <DataState
              loading={maintenance.loading}
              error={maintenance.error}
              onRetry={maintenance.reload}
              empty={(maintenance.data?.tasks || []).length === 0}
              emptyState={<EmptyState icon={Wrench} title="No open maintenance" />}
            >
              <div className="list" style={{ marginTop: 12 }}>
                {(maintenance.data?.tasks || []).map((task) => (
                  <div className="list-row" key={task._id}>
                    <div className="grow">
                      <strong>{task.issueTitle}</strong>
                      <span>
                        Room {task.room?.roomNumber || "N/A"} · {timeAgo(task.createdAt)}
                      </span>
                    </div>
                    <Badge status={task.priority} />
                  </div>
                ))}
              </div>
            </DataState>
          </Card>
        </div>
      </DataState>
    </>
  );
}

export default function Housekeeping() {
  const { loading, error, data, reload, busy, update } = useHousekeeping();

  const queue = data?.rooms || [];
  const recent = data?.recent || [];

  return (
    <>
      <PageHeader
        eyebrow="Property"
        title="Housekeeping"
        description="Rooms enter this queue when a guest checks out and leave it when they are marked clean."
      >
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
      </PageHeader>

      <DataState loading={loading} error={error} onRetry={reload}>
        <div className="grid grid-main">
          <Card title="Cleaning queue" description={`${queue.length} room${queue.length === 1 ? "" : "s"} waiting`} flush>
            <div style={{ marginTop: 12 }}>
              <CleaningQueue rooms={queue} busy={busy} update={update} />
            </div>
          </Card>
          <Card title="Recently cleaned" description="Last 24 hours" flush>
            <div style={{ marginTop: 12 }}>
              <RecentlyCleaned rooms={recent} />
            </div>
          </Card>
        </div>
      </DataState>
    </>
  );
}
