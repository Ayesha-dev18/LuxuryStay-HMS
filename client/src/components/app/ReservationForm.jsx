import { useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, CalendarDays, Car, Check, IdCard, Mail, MapPin, Phone, UserRound, Users } from "lucide-react";

import { useAuth, useToast } from "../../context/AppContext";
import { api } from "../../lib/api";
import { addDaysToInput, formatStayDate, hotelDay, nightsBetween, rules, validate } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";
import { Alert, Badge, Button, EmptyState, Field, Skeleton, TextField } from "../ui/kit";

const FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const documentRule = (value, all) => {
  const text = String(value || "").trim().toUpperCase();
  if (all.documentType === "cnic") {
    return /^\d{5}-?\d{7}-?\d$/.test(text) ? "" : "CNIC must be 13 digits, for example 42101-1234567-1.";
  }
  return /^[A-Z0-9]{6,12}$/.test(text) ? "" : "Passport number must be 6 to 12 letters and digits.";
};

const checkFile = (file) => {
  if (!file) return "";
  if (!FILE_TYPES.includes(file.type)) return "Only JPG, PNG, WEBP and PDF files are allowed.";
  if (file.size > MAX_FILE_BYTES) return "The file must be 5MB or smaller.";
  return "";
};

/*
  The reservation form used by guests (online booking, with identity upload)
  and by the front desk (walk-ins and phone bookings). Room availability and
  the price shown are always fetched from the server for the chosen dates;
  the server recalculates and re-checks everything when the form is submitted.
*/
export default function ReservationForm({ staffMode = false, initialSearch, onCreated, onCancel }) {
  const { user, money, settings } = useAuth();
  const toast = useToast();

  const [stay, setStay] = useState(() => ({
    checkInDate: initialSearch?.checkIn || hotelDay(0),
    checkOutDate: initialSearch?.checkOut || hotelDay(1),
    guests: String(initialSearch?.guests || 1),
  }));
  const [roomId, setRoomId] = useState("");
  const [details, setDetails] = useState(() => ({
    fullName: staffMode ? "" : user.name,
    email: staffMode ? "" : user.email,
    phone: staffMode ? "" : user.phone || "",
    address: "",
    nationality: "Pakistan",
    documentType: "cnic",
    documentNumber: "",
    emergencyContact: "",
    vehicleNumber: "",
    specialRequests: "",
  }));
  const [files, setFiles] = useState({ front: null, back: null });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Front desk only: shown after the server reports that this document
  // already holds a stay over these dates.
  const [overlapAsked, setOverlapAsked] = useState(false);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [availability, setAvailability] = useState({ rooms: [], taxRate: 0, loading: true, error: "" });

  // The room type picked on the hotel website, if the guest came from there.
  const preferredType = initialSearch?.roomType || "";
  const preselected = useRef(false);

  const nights = nightsBetween(stay.checkInDate, stay.checkOutDate);
  const search = useDebounced(stay, 300);

  useEffect(() => {
    const guests = Number(search.guests);
    const valid =
      nightsBetween(search.checkInDate, search.checkOutDate) > 0 && Number.isInteger(guests) && guests > 0;

    if (!valid) {
      setAvailability({ rooms: [], taxRate: 0, loading: false, error: "" });
      return undefined;
    }

    let cancelled = false;
    setAvailability((current) => ({ ...current, loading: true, error: "" }));

    api
      .get("/bookings/availability", {
        checkInDate: search.checkInDate,
        checkOutDate: search.checkOutDate,
        guests,
      })
      .then((data) => {
        if (cancelled) return;
        // Rooms of the type chosen on the website are listed first.
        const rooms = preferredType
          ? [...data.rooms].sort(
              (a, b) => Number(b.type === preferredType) - Number(a.type === preferredType)
            )
          : data.rooms;

        setAvailability({ rooms, taxRate: data.taxRate, loading: false, error: "" });
        // A room that is no longer free for the new dates is deselected. The
        // first time rooms load, the chosen type is selected for the guest.
        const fallback = preselected.current
          ? ""
          : rooms.find((room) => room.type === preferredType)?._id || "";
        preselected.current = true;
        setRoomId((current) => (rooms.some((room) => room._id === current) ? current : fallback));
      })
      .catch((error) => {
        if (cancelled) return;
        setAvailability({ rooms: [], taxRate: 0, loading: false, error: error.message });
        setRoomId("");
      });

    return () => {
      cancelled = true;
    };
  }, [search, preferredType]);

  const room = useMemo(
    () => availability.rooms.find((item) => item._id === roomId),
    [availability.rooms, roomId]
  );

  const roomTotal = room ? room.pricePerNight * nights : 0;
  const tax = Math.round(roomTotal * availability.taxRate) / 100;

  const setDetail = (field) => (event) => {
    const { value } = event.target;
    setDetails((current) => ({
      ...current,
      [field]: value,
      ...(field === "documentType" ? { documentNumber: "" } : {}),
    }));
    setErrors((current) => ({ ...current, [field]: "" }));
    if (field === "documentType") setFiles({ front: null, back: null });
  };

  const pickFile = (side) => (event) => {
    const file = event.target.files?.[0] || null;
    const problem = checkFile(file);
    if (problem) event.target.value = "";
    setFiles((current) => ({ ...current, [side]: problem ? null : file }));
    setErrors((current) => ({ ...current, [side]: problem }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const found = validate(details, {
      fullName: rules.name,
      email: rules.email,
      phone: rules.phone,
      address: (value) =>
        String(value).trim().length >= 5 ? "" : "Please enter the full address.",
      nationality: rules.required("Nationality"),
      documentNumber: documentRule,
      emergencyContact: rules.phone,
    });

    if (nights < 1) found.checkOutDate = "Check-out must be after check-in.";
    if (nights > settings.maxStayNights) {
      found.checkOutDate = `A stay can be at most ${settings.maxStayNights} nights.`;
    }
    if (!roomId) found.room = "Please choose an available room.";

    // Guests must attach their document; at the desk it is checked in person.
    if (!staffMode) {
      if (!files.front) {
        found.front =
          details.documentType === "cnic"
            ? "Please upload the front of your CNIC."
            : "Please upload a copy of your passport.";
      }
      if (details.documentType === "cnic" && !files.back) {
        found.back = "Please upload the back of your CNIC.";
      }
    }

    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError("Please correct the highlighted fields.");
      return;
    }

    const payload = new FormData();
    payload.append("roomId", roomId);
    payload.append("checkInDate", stay.checkInDate);
    payload.append("checkOutDate", stay.checkOutDate);
    payload.append("numberOfGuests", stay.guests);
    payload.append("specialRequests", details.specialRequests.trim());
    payload.append(
      "guestDetails",
      JSON.stringify({
        fullName: details.fullName.trim(),
        phone: details.phone.trim(),
        email: details.email.trim(),
        address: details.address.trim(),
        nationality: details.nationality.trim(),
        documentType: details.documentType,
        documentNumber: details.documentNumber.trim(),
        emergencyContact: details.emergencyContact.trim(),
        vehicleNumber: details.vehicleNumber.trim(),
      })
    );
    if (files.front) payload.append("documentFront", files.front);
    if (files.back && details.documentType === "cnic") payload.append("documentBack", files.back);
    if (staffMode && allowOverlap) payload.append("allowSameDocumentOverlap", "true");

    setSubmitting(true);
    setFormError("");

    try {
      const data = await api.upload("/bookings", payload);
      toast.success(data.message);
      onCreated(data.booking);
    } catch (error) {
      setFormError(error.message);
      const fields = {};
      for (const [key, message] of Object.entries(error.fields || {})) {
        fields[key.replace("guestDetails.", "")] = message;
      }
      setErrors(fields);
      if (staffMode && error.status === 409 && /confirm that explicitly/.test(error.message)) {
        setOverlapAsked(true);
        return;
      }
      // The room was taken while the form was open: refresh what is free.
      if (error.status === 409) {
        setRoomId("");
        setStay((current) => ({ ...current }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isCnic = details.documentType === "cnic";

  // Progress through the form, worked out from what is filled in.
  const steps = [
    { label: "Dates", done: nights > 0 },
    { label: "Room", done: Boolean(roomId) },
    { label: "Your details", done: Boolean(details.fullName && details.email && details.phone && details.address && details.emergencyContact) },
    { label: "Identity", done: Boolean(details.documentNumber && (staffMode || (files.front && (!isCnic || files.back)))) },
  ];
  const current = steps.findIndex((step) => !step.done);

  return (
    <form onSubmit={submit} noValidate>
      {!staffMode && (
        <ol className="steps" aria-label="Booking progress">
          {steps.map((step, index) => (
            <li
              key={step.label}
              className={`step ${step.done ? "done" : ""} ${index === current ? "current" : ""}`}
              aria-current={index === current ? "step" : undefined}
            >
              <i aria-hidden="true">{step.done ? <Check size={13} strokeWidth={2.5} /> : index + 1}</i>
              {step.label}
            </li>
          ))}
          <li className={`step ${current === -1 ? "current" : ""}`}>
            <i aria-hidden="true">{steps.length + 1}</i>
            Review and send
          </li>
        </ol>
      )}
      <div className={staffMode ? "stack" : "grid grid-main"} style={{ alignItems: "start" }}>
        <div className="stack">
          <section className="card card-pad">
            <div className="section-title">
              <CalendarDays size={15} aria-hidden="true" /> Stay dates
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              <TextField
                label="Check-in"
                type="date"
                required
                min={hotelDay(0)}
                value={stay.checkInDate}
                onChange={(event) => {
                  const checkInDate = event.target.value;
                  setStay((current) => ({
                    ...current,
                    checkInDate,
                    checkOutDate:
                      current.checkOutDate > checkInDate
                        ? current.checkOutDate
                        : addDaysToInput(checkInDate, 1),
                  }));
                }}
              />
              <TextField
                label="Check-out"
                type="date"
                required
                min={addDaysToInput(stay.checkInDate, 1) || hotelDay(1)}
                value={stay.checkOutDate}
                onChange={(event) => {
                  setStay((current) => ({ ...current, checkOutDate: event.target.value }));
                  setErrors((current) => ({ ...current, checkOutDate: "" }));
                }}
                error={errors.checkOutDate}
              />
              <TextField
                label="Guests"
                type="number"
                icon={Users}
                min="1"
                max="12"
                step="1"
                required
                value={stay.guests}
                onChange={(event) => setStay((current) => ({ ...current, guests: event.target.value }))}
              />
            </div>
          </section>

          <section className="card card-pad">
            <div className="section-title">
              <BedDouble size={15} aria-hidden="true" /> Available rooms
            </div>
            {errors.room && (
              <div style={{ marginBottom: 12 }}>
                <Alert type="error">{errors.room}</Alert>
              </div>
            )}
            {availability.loading ? (
              <div className="room-grid" aria-busy="true" aria-label="Checking availability">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} height={132} radius={18} />
                ))}
              </div>
            ) : availability.error ? (
              <Alert type="error">{availability.error}</Alert>
            ) : availability.rooms.length === 0 ? (
              <EmptyState
                icon={BedDouble}
                title="No rooms free for these dates"
                message="Try different dates or fewer guests."
              />
            ) : (
              <>
              {preferredType && !availability.rooms.some((item) => item.type === preferredType) && (
                <div style={{ marginBottom: 14 }}>
                  <Alert type="info">
                    No {preferredType} is free for these dates. The rooms below are available, or try
                    different dates.
                  </Alert>
                </div>
              )}
              <div className="room-grid" role="radiogroup" aria-label="Available rooms">
                {availability.rooms.map((item) => (
                  <button
                    type="button"
                    key={item._id}
                    role="radio"
                    aria-checked={roomId === item._id}
                    className={`room-card-a ${roomId === item._id ? "selected" : ""}`}
                    style={{ "--tone": roomId === item._id ? "var(--a-deep-3)" : "var(--a-line-strong)" }}
                    onClick={() => {
                      setRoomId(item._id);
                      setErrors((current) => ({ ...current, room: "" }));
                    }}
                  >
                    <div className="row row-between">
                      <span className="room-no">{item.roomNumber}</span>
                      {roomId === item._id ? <Badge tone="accent">Selected</Badge> : <Badge tone="success">Available</Badge>}
                    </div>
                    <div>
                      <strong>{item.name}</strong>
                      <div className="small muted">{item.type}</div>
                    </div>
                    <div className="room-meta">
                      <span>
                        <Users size={14} aria-hidden="true" /> Up to {item.capacity}
                      </span>
                      <span>
                        <BedDouble size={14} aria-hidden="true" /> {item.bedType}
                      </span>
                    </div>
                    <div className="room-price">
                      {money(item.pricePerNight)} <small>/ night</small>
                    </div>
                  </button>
                ))}
              </div>
              </>
            )}
          </section>

          <section className="card card-pad">
            <div className="section-title">
              <UserRound size={15} aria-hidden="true" /> Guest details
            </div>
            <div className="form-grid">
              <TextField
                label="Full name"
                icon={UserRound}
                required
                maxLength={80}
                autoComplete="name"
                value={details.fullName}
                onChange={setDetail("fullName")}
                error={errors.fullName}
              />
              <TextField
                label="Email address"
                type="email"
                icon={Mail}
                required
                maxLength={254}
                autoComplete="email"
                value={details.email}
                onChange={setDetail("email")}
                error={errors.email}
                hint={staffMode ? "The reservation is linked to this guest account (created if new)." : undefined}
              />
              <TextField
                label="Phone number"
                type="tel"
                icon={Phone}
                required
                maxLength={20}
                placeholder="+92 300 1234567"
                autoComplete="tel"
                value={details.phone}
                onChange={setDetail("phone")}
                error={errors.phone}
              />
              <TextField
                label="Emergency contact"
                type="tel"
                icon={Phone}
                required
                maxLength={20}
                value={details.emergencyContact}
                onChange={setDetail("emergencyContact")}
                error={errors.emergencyContact}
              />
              <TextField
                label="Nationality"
                icon={MapPin}
                required
                maxLength={60}
                value={details.nationality}
                onChange={setDetail("nationality")}
                error={errors.nationality}
              />
              <TextField
                label="Vehicle number"
                icon={Car}
                maxLength={20}
                value={details.vehicleNumber}
                onChange={setDetail("vehicleNumber")}
                hint="Optional"
              />
              <TextField
                className="span-2"
                label="Address"
                icon={MapPin}
                required
                maxLength={200}
                autoComplete="street-address"
                value={details.address}
                onChange={setDetail("address")}
                error={errors.address}
              />
            </div>

            <div className="section-title">
              <IdCard size={15} aria-hidden="true" /> Identity
            </div>
            <div className="form-grid">
              <TextField as="select" label="Document type" value={details.documentType} onChange={setDetail("documentType")}>
                <option value="cnic">CNIC</option>
                <option value="passport">Passport</option>
              </TextField>
              <TextField
                label={isCnic ? "CNIC number" : "Passport number"}
                icon={IdCard}
                required
                maxLength={20}
                placeholder={isCnic ? "42101-1234567-1" : "AB1234567"}
                value={details.documentNumber}
                onChange={setDetail("documentNumber")}
                error={errors.documentNumber}
              />
              <Field
                label={isCnic ? "CNIC front" : "Passport copy"}
                required={!staffMode}
                error={errors.front}
                hint={staffMode ? "Optional at the desk. JPG, PNG, WEBP or PDF up to 5MB." : "JPG, PNG, WEBP or PDF up to 5MB."}
              >
                <div className="file-drop">
                  <input
                    key={`front-${details.documentType}`}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    aria-label={isCnic ? "CNIC front" : "Passport copy"}
                    onChange={pickFile("front")}
                  />
                </div>
              </Field>
              {isCnic && (
                <Field label="CNIC back" required={!staffMode} error={errors.back}>
                  <div className="file-drop">
                    <input
                      key="back"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      aria-label="CNIC back"
                      onChange={pickFile("back")}
                    />
                  </div>
                </Field>
              )}
              {!staffMode && isCnic && (
                <div className="span-2">
                  <Alert type="info">
                    We read the number on your CNIC image and compare it with the number you typed, and
                    a member of staff then reviews your document before confirming. This is a check
                    within this hotel system only. It is not verification with NADRA or any official
                    record, and the original document is inspected at check-in.
                  </Alert>
                </div>
              )}
              <TextField
                as="textarea"
                className="span-2"
                label="Special requests"
                maxLength={600}
                rows={3}
                value={details.specialRequests}
                onChange={setDetail("specialRequests")}
                hint="Optional"
              />
            </div>
          </section>
        </div>

        <aside className="summary-card">
          <div className="page-eyebrow">
            Reservation summary
          </div>
          <h2>{room ? room.name : "Your stay"}</h2>
          <p className="muted small" style={{ margin: "4px 0 16px" }}>
            {room ? `Room ${room.roomNumber} · ${room.type}` : "Choose dates and a room to see the price."}
          </p>

          <div className="ledger">
            <div className="ledger-row">
              <span>Check-in</span>
              <strong>{formatStayDate(stay.checkInDate)}</strong>
            </div>
            <div className="ledger-row">
              <span>Check-out</span>
              <strong>{formatStayDate(stay.checkOutDate)}</strong>
            </div>
            <div className="ledger-row">
              <span>Nights</span>
              <strong>{nights}</strong>
            </div>
            {room && (
              <>
                <div className="ledger-row">
                  <span>
                    {nights} × {money(room.pricePerNight)}
                  </span>
                  <strong>{money(roomTotal)}</strong>
                </div>
                {availability.taxRate > 0 && (
                  <div className="ledger-row">
                    <span>Tax ({availability.taxRate}%)</span>
                    <strong>{money(tax)}</strong>
                  </div>
                )}
                <div className="ledger-row total">
                  <span>Total</span>
                  <strong>{money(roomTotal + tax)}</strong>
                </div>
              </>
            )}
          </div>

          {submitting && !staffMode && (
            <p className="small" role="status" style={{ marginTop: 14, color: "#c3d1c9" }}>
              Uploading your document and reading the CNIC number. This can take a few seconds.
            </p>
          )}

          {staffMode && overlapAsked && (
            <label className="check" style={{ marginTop: 16, color: "#f7f4ec" }}>
              <input
                type="checkbox"
                checked={allowOverlap}
                onChange={(event) => setAllowOverlap(event.target.checked)}
              />
              <span>
                This guest is deliberately taking another room for the same dates. The approval is
                recorded under your name.
              </span>
            </label>
          )}

          {formError && (
            <div style={{ marginTop: 16 }}>
              <Alert type="error">{formError}</Alert>
            </div>
          )}

          <div className="stack" style={{ gap: 10, marginTop: 18 }}>
            <Button type="submit" variant="accent" size="lg" block loading={submitting} disabled={availability.loading}>
              {staffMode ? "Create reservation" : "Request reservation"}
            </Button>
            {onCancel && (
              <Button variant="ghost" block onClick={onCancel} disabled={submitting}>
                Cancel
              </Button>
            )}
          </div>

          <p className="muted small" style={{ marginTop: 14 }}>
            {staffMode
              ? "Front desk reservations are confirmed immediately. The final price is calculated by the server."
              : `Your request stays pending until a member of staff has reviewed your identity document. Check-in from ${settings.checkInTime}, check-out by ${settings.checkOutTime}.`}
          </p>
        </aside>
      </div>
    </form>
  );
}
