import { useEffect, useState } from "react";
import { CheckCircle2, Play, Plus, RefreshCw, Wrench } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  DataState,
  EmptyState,
  Modal,
  PageHeader,
  Pagination,
  Tabs,
  TextField,
} from "../components/ui/kit";
import { useAuth, useToast } from "../context/AppContext";
import { api } from "../lib/api";
import { formatMoment, timeAgo } from "../lib/format";
import { useAction, useLoad } from "../lib/hooks";

const LIMIT = 15;

const TABS = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
];

function ReportDialog({ open, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ roomId: "", issueTitle: "", description: "", priority: "medium" });
  const [rooms, setRooms] = useState({ list: [], error: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setForm({ roomId: "", issueTitle: "", description: "", priority: "medium" });
    setMessage("");

    api
      .get("/rooms")
      .then((data) => {
        if (cancelled) return;
        // Occupied rooms and rooms already in maintenance cannot take a new request.
        setRooms({
          list: data.rooms.filter(
            (room) => room.isActive && !["occupied", "maintenance"].includes(room.status)
          ),
          error: "",
        });
      })
      .catch((error) => !cancelled && setRooms({ list: [], error: error.message }));

    return () => {
      cancelled = true;
    };
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();

    if (!form.roomId) return setMessage("Please choose a room.");
    if (form.issueTitle.trim().length < 3) return setMessage("Give the issue a short title.");
    if (form.description.trim().length < 5) return setMessage("Describe the issue.");

    setSaving(true);
    setMessage("");
    try {
      const data = await api.post("/maintenance", {
        roomId: form.roomId,
        issueTitle: form.issueTitle.trim(),
        description: form.description.trim(),
        priority: form.priority,
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      title="Report a maintenance issue"
      description="The room is taken out of service until the task is completed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="maintenance-form" loading={saving}>
            Report issue
          </Button>
        </>
      }
    >
      <form id="maintenance-form" className="stack" onSubmit={submit} noValidate>
        <Alert type="error">{message || rooms.error}</Alert>
        <TextField
          as="select"
          label="Room"
          required
          value={form.roomId}
          onChange={(event) => setForm({ ...form, roomId: event.target.value })}
          hint="Occupied rooms are not listed. Check the guest out first."
        >
          <option value="">Choose a room</option>
          {rooms.list.map((room) => (
            <option key={room._id} value={room._id}>
              Room {room.roomNumber} · {room.name} ({room.status})
            </option>
          ))}
        </TextField>
        <TextField
          label="Issue"
          required
          maxLength={120}
          placeholder="Air conditioner not cooling"
          value={form.issueTitle}
          onChange={(event) => setForm({ ...form, issueTitle: event.target.value })}
        />
        <TextField
          as="textarea"
          label="Details"
          required
          maxLength={1000}
          rows={4}
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
        <TextField
          as="select"
          label="Priority"
          value={form.priority}
          onChange={(event) => setForm({ ...form, priority: event.target.value })}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </TextField>
      </form>
    </Modal>
  );
}

function CompleteDialog({ task, onClose, onSaved }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNote("");
    setMessage("");
  }, [task]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const data = await api.patch(`/maintenance/${task._id}/complete`, { resolutionNote: note.trim() });
      toast.success(data.message);
      onSaved();
      onClose();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(task)}
      onClose={onClose}
      busy={saving}
      title="Complete this task?"
      description={task ? `Room ${task.room?.roomNumber || "N/A"} returns to service.` : ""}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="complete-form" variant="success" loading={saving}>
            Mark completed
          </Button>
        </>
      }
    >
      <form id="complete-form" className="stack" onSubmit={submit}>
        <Alert type="error">{message}</Alert>
        <TextField
          as="textarea"
          label="What was done?"
          maxLength={500}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          hint="Optional"
        />
      </form>
    </Modal>
  );
}

export default function Maintenance() {
  const { can } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction();

  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [reporting, setReporting] = useState(false);
  const [completing, setCompleting] = useState(null);

  const { data, loading, error, reload, refresh } = useLoad(
    () => api.get("/maintenance", { status, page, limit: LIMIT }),
    [status, page]
  );

  const tasks = data?.tasks || [];
  const canUpdate = can("maintenance:update");

  const start = (task) =>
    run(task._id, async () => {
      try {
        const result = await api.patch(`/maintenance/${task._id}/start`);
        toast.success(result.message);
      } catch (failure) {
        toast.error(failure.message);
      }
      refresh();
    });

  return (
    <>
      <PageHeader
        eyebrow="Property"
        title="Maintenance"
        description="Reported issues, who is working on them and when they were resolved."
      >
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
        {can("maintenance:report") && (
          <Button icon={Plus} onClick={() => setReporting(true)}>
            Report issue
          </Button>
        )}
      </PageHeader>

      <section className="card">
        <div className="toolbar">
          <Tabs
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={TABS.map((tab) =>
              tab.value === "open" && data ? { ...tab, count: data.open } : tab
            )}
            label="Filter tasks"
          />
        </div>

        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          empty={tasks.length === 0}
          emptyState={
            <EmptyState
              icon={Wrench}
              title={status === "open" ? "No open maintenance tasks" : "No tasks to show"}
              message={status === "open" ? "Every room is in working order." : undefined}
            />
          }
        >
          <div className="table-wrap">
            <table className="table stack-sm">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Room</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Timeline</th>
                  {canUpdate && <th className="right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task._id}>
                    <td className="primary" style={{ maxWidth: 360 }}>
                      <div>
                        <strong>{task.issueTitle}</strong>
                        <span className="cell-sub" style={{ whiteSpace: "normal" }}>
                          {task.description}
                        </span>
                        {task.resolutionNote && (
                          <span className="cell-sub" style={{ whiteSpace: "normal" }}>
                            Resolution: {task.resolutionNote}
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Room">
                      <strong>{task.room?.roomNumber || "N/A"}</strong>
                    </td>
                    <td data-label="Priority">
                      <Badge status={task.priority} />
                    </td>
                    <td data-label="Status">
                      <Badge status={task.status} />
                    </td>
                    <td data-label="Timeline">
                      <div>
                        Reported {timeAgo(task.createdAt)}
                        <span className="cell-sub">
                          {task.reportedBy?.name ? `by ${task.reportedBy.name}` : ""}
                          {task.completedAt
                            ? ` · completed ${formatMoment(task.completedAt)}`
                            : task.startedAt
                              ? ` · started ${formatMoment(task.startedAt)}`
                              : ""}
                        </span>
                      </div>
                    </td>
                    {canUpdate && (
                      <td className="right actions">
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          {task.status === "pending" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={Play}
                              loading={busy === task._id}
                              disabled={Boolean(busy)}
                              onClick={() => start(task)}
                            >
                              Start
                            </Button>
                          )}
                          {task.status !== "completed" && (
                            <Button variant="success" size="sm" icon={CheckCircle2} onClick={() => setCompleting(task)}>
                              Complete
                            </Button>
                          )}
                        </div>
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

      <ReportDialog open={reporting} onClose={() => setReporting(false)} onSaved={refresh} />
      <CompleteDialog task={completing} onClose={() => setCompleting(null)} onSaved={refresh} />
    </>
  );
}
