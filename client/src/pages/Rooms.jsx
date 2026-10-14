import { useEffect, useMemo, useState } from "react";
import { BedDouble, Layers, Pencil, Plus, Power, RefreshCw, Trash2, Users } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  DataState,
  EmptyState,
  Modal,
  PageHeader,
  SearchInput,
  Skeleton,
  Tabs,
  TextField,
} from "../components/ui/kit";
import { useAuth, useToast } from "../context/AppContext";
import { api } from "../lib/api";
import { ROOM_TONE_COLORS, formatMoment, titleCase } from "../lib/format";
import { useAction, useLoad } from "../lib/hooks";

const ROOM_TYPES = ["Serene Room", "Signature Suite", "Royal Residence"];

// Mirrors the transitions the server allows by hand. "Occupied" is set by
// check-in and "maintenance" by a maintenance request.
const NEXT_STATUS = {
  available: ["reserved", "cleaning"],
  reserved: ["available", "cleaning"],
  cleaning: ["available"],
  maintenance: ["available", "cleaning"],
  occupied: ["cleaning", "available"],
};

const EMPTY_ROOM = {
  roomNumber: "",
  name: "",
  type: ROOM_TYPES[0],
  pricePerNight: "",
  capacity: "2",
  bedType: "King bed",
  floor: "1",
  amenities: "",
  description: "",
};

function RoomDialog({ room, open, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_ROOM);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setMessage("");
    setForm(
      room
        ? {
            roomNumber: room.roomNumber,
            name: room.name,
            type: room.type,
            pricePerNight: String(room.pricePerNight),
            capacity: String(room.capacity),
            bedType: room.bedType,
            floor: String(room.floor),
            amenities: (room.amenities || []).join(", "),
            description: room.description || "",
          }
        : EMPTY_ROOM
    );
  }, [open, room]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const found = {};
    const price = Number(form.pricePerNight);
    const capacity = Number(form.capacity);
    const floor = Number(form.floor);

    if (!/^[A-Za-z0-9-]{1,10}$/.test(form.roomNumber.trim())) {
      found.roomNumber = "Use up to 10 letters, digits or dashes.";
    }
    if (form.name.trim().length < 2) found.name = "Room name is required.";
    if (!Number.isFinite(price) || price < 1) found.pricePerNight = "Enter a nightly price above zero.";
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 12) {
      found.capacity = "Capacity must be a whole number from 1 to 12.";
    }
    if (!Number.isInteger(floor) || floor < 1) found.floor = "Floor must be 1 or higher.";
    if (form.bedType.trim().length < 2) found.bedType = "Bed type is required.";

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const body = {
      roomNumber: form.roomNumber.trim(),
      name: form.name.trim(),
      type: form.type,
      pricePerNight: price,
      capacity,
      bedType: form.bedType.trim(),
      floor,
      description: form.description.trim(),
      amenities: form.amenities
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };

    setSaving(true);
    setMessage("");
    try {
      const data = room ? await api.put(`/rooms/${room._id}`, body) : await api.post("/rooms", body);
      toast.success(data.message);
      onSaved();
      onClose();
    } catch (error) {
      setErrors(error.fields || {});
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="wide"
      title={room ? `Edit room ${room.roomNumber}` : "Add a room"}
      description={
        room
          ? "Price changes apply to new reservations. Existing reservations keep their rate."
          : "New rooms start as available."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="room-form" loading={saving}>
            {room ? "Save changes" : "Add room"}
          </Button>
        </>
      }
    >
      <form id="room-form" onSubmit={submit} noValidate>
        <div style={{ marginBottom: message ? 16 : 0 }}>
          <Alert type="error">{message}</Alert>
        </div>
        <div className="form-grid">
          <TextField label="Room number" required maxLength={10} value={form.roomNumber} onChange={update("roomNumber")} error={errors.roomNumber} />
          <TextField label="Floor" type="number" min="1" step="1" required value={form.floor} onChange={update("floor")} error={errors.floor} />
          <TextField className="span-2" label="Room name" required maxLength={80} value={form.name} onChange={update("name")} error={errors.name} />
          <TextField as="select" label="Room type" value={form.type} onChange={update("type")} error={errors.type}>
            {ROOM_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </TextField>
          <TextField label="Bed type" required maxLength={40} value={form.bedType} onChange={update("bedType")} error={errors.bedType} />
          <TextField label="Price per night" type="number" inputMode="decimal" min="1" step="0.01" required value={form.pricePerNight} onChange={update("pricePerNight")} error={errors.pricePerNight} />
          <TextField label="Capacity (guests)" type="number" min="1" max="12" step="1" required value={form.capacity} onChange={update("capacity")} error={errors.capacity} />
          <TextField className="span-2" label="Amenities" maxLength={400} placeholder="Balcony, Sea view, Butler service" value={form.amenities} onChange={update("amenities")} error={errors.amenities} hint="Separate with commas." />
          <TextField as="textarea" className="span-2" label="Description" maxLength={600} rows={3} value={form.description} onChange={update("description")} error={errors.description} />
        </div>
      </form>
    </Modal>
  );
}

export default function Rooms() {
  const { can, money } = useAuth();
  const toast = useToast();
  const { busy, run } = useAction();

  const [status, setStatus] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [editing, setEditing] = useState(undefined);
  const [confirm, setConfirm] = useState(null);

  const { data, loading, error, reload, refresh } = useLoad(() => api.get("/rooms"), []);

  const rooms = useMemo(() => data?.rooms || [], [data]);
  const manage = can("rooms:manage");
  const changeStatus = can("rooms:status");

  const counts = useMemo(() => {
    const result = { all: rooms.length, inactive: 0 };
    for (const room of rooms) {
      if (!room.isActive) result.inactive += 1;
      else result[room.status] = (result[room.status] || 0) + 1;
    }
    return result;
  }, [rooms]);

  const visible = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    return rooms.filter((room) => {
      if (status === "inactive" ? room.isActive : status !== "all" && (!room.isActive || room.status !== status)) {
        return false;
      }
      if (!term) return true;
      return [room.roomNumber, room.name, room.type, room.bedType].some((value) =>
        String(value).toLowerCase().includes(term)
      );
    });
  }, [rooms, status, searchText]);

  const tabs = [
    { value: "all", label: "All", count: counts.all },
    ...["available", "occupied", "reserved", "cleaning", "maintenance"].map((value) => ({
      value,
      label: titleCase(value),
      count: counts[value] || 0,
    })),
    ...(counts.inactive ? [{ value: "inactive", label: "Inactive", count: counts.inactive }] : []),
  ];

  const mutate = (key, request) =>
    run(key, async () => {
      try {
        const result = await request();
        toast.success(result.message);
      } catch (failure) {
        toast.error(failure.message);
      }
      setConfirm(null);
      refresh();
    });

  return (
    <>
      <PageHeader
        eyebrow="Property"
        title="Rooms"
        description="Live status of every room. Occupancy follows check-in and check-out; maintenance follows open requests."
      >
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
        {manage && (
          <Button icon={Plus} onClick={() => setEditing(null)}>
            Add room
          </Button>
        )}
      </PageHeader>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="toolbar" style={{ borderBottom: 0 }}>
          <Tabs value={status} onChange={setStatus} options={tabs} label="Filter by status" />
          <SearchInput value={searchText} onChange={setSearchText} placeholder="Room number, name or type" label="Search rooms" />
        </div>
      </section>

      <DataState
        loading={loading}
        error={error}
        onRetry={reload}
        empty={visible.length === 0}
        skeleton={
          <div className="room-grid" aria-busy="true" aria-label="Loading rooms">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} height={210} radius={18} />
            ))}
          </div>
        }
        emptyState={
          <section className="card">
            <EmptyState
              icon={BedDouble}
              title={rooms.length === 0 ? "No rooms yet" : "No rooms match"}
              message={
                rooms.length === 0
                  ? "Add the first room to start taking reservations."
                  : "Try a different status or search term."
              }
            >
              {rooms.length === 0 && manage && (
                <Button icon={Plus} onClick={() => setEditing(null)}>
                  Add room
                </Button>
              )}
            </EmptyState>
          </section>
        }
      >
        <div className="room-grid">
          {visible.map((room) => (
            <article
              key={room._id}
              className={`room-card-a ${room.isActive ? "" : "inactive"}`}
              style={{ "--tone": room.isActive ? ROOM_TONE_COLORS[room.status] : "var(--a-line-strong)" }}
            >
              <div className="row row-between">
                <span className="room-no">{room.roomNumber}</span>
                {room.isActive ? <Badge status={room.status} /> : <Badge status="inactive" />}
              </div>
              <div>
                <strong>{room.name}</strong>
                <div className="small muted">{room.type}</div>
              </div>
              <div className="room-meta">
                <span>
                  <Users size={14} aria-hidden="true" /> {room.capacity} guests
                </span>
                <span>
                  <BedDouble size={14} aria-hidden="true" /> {room.bedType}
                </span>
                <span>
                  <Layers size={14} aria-hidden="true" /> Floor {room.floor}
                </span>
              </div>
              {room.amenities?.length > 0 && (
                <div className="chips">
                  {room.amenities.slice(0, 4).map((amenity) => (
                    <span className="chip" key={amenity}>
                      {amenity}
                    </span>
                  ))}
                </div>
              )}
              <div className="row row-between" style={{ marginTop: "auto" }}>
                <div className="room-price">
                  {money(room.pricePerNight)} <small>/ night</small>
                </div>
                {room.lastCleanedAt && (
                  <span className="small muted" title={`Last cleaned ${formatMoment(room.lastCleanedAt)}`}>
                    Cleaned {formatMoment(room.lastCleanedAt).split(",")[0]}
                  </span>
                )}
              </div>

              {(manage || changeStatus) && (
                <div className="row" style={{ paddingTop: 12, borderTop: "1px solid var(--a-line)" }}>
                  {changeStatus && room.isActive && (
                    <select
                      className="select"
                      style={{ minHeight: 34, flex: 1, fontSize: 13 }}
                      aria-label={`Change status of room ${room.roomNumber}`}
                      value=""
                      disabled={Boolean(busy)}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (next) {
                          mutate(`status-${room._id}`, () =>
                            api.patch(`/rooms/${room._id}/status`, { status: next })
                          );
                        }
                      }}
                    >
                      <option value="">Set status…</option>
                      {(NEXT_STATUS[room.status] || []).map((next) => (
                        <option key={next} value={next}>
                          Mark {next}
                        </option>
                      ))}
                    </select>
                  )}
                  {manage && (
                    <>
                      <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(room)}>
                        Edit
                      </Button>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ width: 32, height: 32 }}
                        aria-label={room.isActive ? `Deactivate room ${room.roomNumber}` : `Reactivate room ${room.roomNumber}`}
                        title={room.isActive ? "Deactivate" : "Reactivate"}
                        onClick={() => setConfirm({ type: room.isActive ? "deactivate" : "activate", room })}
                      >
                        <Power size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ width: 32, height: 32 }}
                        aria-label={`Delete room ${room.roomNumber}`}
                        title="Delete"
                        onClick={() => setConfirm({ type: "delete", room })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </DataState>

      <RoomDialog room={editing} open={editing !== undefined} onClose={() => setEditing(undefined)} onSaved={refresh} />

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        busy={Boolean(busy)}
        tone={confirm?.type === "activate" ? "primary" : "danger"}
        title={
          confirm?.type === "delete"
            ? `Delete room ${confirm.room.roomNumber}?`
            : confirm?.type === "deactivate"
              ? `Deactivate room ${confirm.room.roomNumber}?`
              : `Reactivate room ${confirm?.room.roomNumber}?`
        }
        message={
          confirm?.type === "delete"
            ? "Only rooms that have never been booked can be deleted. Rooms with history should be deactivated instead."
            : confirm?.type === "deactivate"
              ? "The room will no longer be offered for new reservations. Its history is kept."
              : "The room will be offered for reservations again."
        }
        confirmLabel={
          confirm?.type === "delete" ? "Delete room" : confirm?.type === "deactivate" ? "Deactivate" : "Reactivate"
        }
        onConfirm={() =>
          mutate("confirm", () =>
            confirm.type === "delete"
              ? api.delete(`/rooms/${confirm.room._id}`)
              : api.put(`/rooms/${confirm.room._id}`, { isActive: confirm.type === "activate" })
          )
        }
      />
    </>
  );
}
