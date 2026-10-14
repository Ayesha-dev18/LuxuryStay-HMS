import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { useAuth } from "../../context/AppContext";
import { useHotel } from "../../context/HotelContext";
import { startBooking } from "../../lib/bookingSearch";
import { addDaysToInput, hotelDay, nightsBetween } from "../../lib/format";

/*
  Availability search for the hotel website. It only collects the dates, the
  party size and (optionally) a room type, checks them, and hands them to the
  reservation form, which asks the server what is actually free.

  "Today" is today at the hotel, so the defaults wait until the hotel's
  timezone has arrived from the API.
*/
export default function BookingBar({ variant = "bar", categories = [], roomType = "", maxGuests }) {
  const navigate = useNavigate();
  const auth = useAuth();
  const { hotel, ready } = useHotel();
  const id = useId();

  const fixedRoom = Boolean(roomType);
  const guestLimit =
    maxGuests || Math.max(...categories.map((category) => category.maxCapacity), 0) || 6;

  const [form, setForm] = useState({ checkIn: "", checkOut: "", guests: "2", roomType });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    setForm((current) =>
      current.checkIn ? current : { ...current, checkIn: hotelDay(0), checkOut: hotelDay(1) }
    );
  }, [ready]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      roomType: fixedRoom ? roomType : current.roomType,
      guests: String(Math.min(Number(current.guests) || 1, guestLimit)),
    }));
  }, [roomType, fixedRoom, guestLimit]);

  const update = (field) => (event) => {
    const { value } = event.target;
    setError("");
    setForm((current) => {
      const next = { ...current, [field]: value };
      // Moving the arrival past the departure moves the departure with it.
      if (field === "checkIn" && value && next.checkOut <= value) {
        next.checkOut = addDaysToInput(value, 1);
      }
      return next;
    });
  };

  const submit = (event) => {
    event.preventDefault();

    const today = hotelDay(0);
    const nights = nightsBetween(form.checkIn, form.checkOut);

    if (!form.checkIn || !form.checkOut) return setError("Please choose your arrival and departure dates.");
    if (form.checkIn < today) return setError("The arrival date cannot be in the past.");
    if (nights < 1) return setError("The departure date must be after the arrival date.");
    if (nights > hotel.maxStayNights) {
      return setError(`A single stay can be at most ${hotel.maxStayNights} nights.`);
    }

    return startBooking(navigate, auth, {
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      guests: Number(form.guests),
      roomType: form.roomType,
    });
  };

  const showRoomChoice = !fixedRoom && categories.length > 1;
  const today = ready ? hotelDay(0) : undefined;

  const dates = (
    <>
      <div className="s-book-field">
        <label htmlFor={`${id}-in`}>Arrive</label>
        <input id={`${id}-in`} type="date" required min={today} value={form.checkIn} onChange={update("checkIn")} />
      </div>
      <div className="s-book-field">
        <label htmlFor={`${id}-out`}>Depart</label>
        <input
          id={`${id}-out`}
          type="date"
          required
          min={form.checkIn ? addDaysToInput(form.checkIn, 1) : today}
          value={form.checkOut}
          onChange={update("checkOut")}
        />
      </div>
    </>
  );

  return (
    <form
      className={`s-book s-book-${variant}`}
      style={{ "--fields": showRoomChoice ? 4 : 3 }}
      onSubmit={submit}
      noValidate
      aria-label="Check availability"
    >
      {variant === "card" ? <div className="s-book-dates">{dates}</div> : dates}

      <div className="s-book-field">
        <label htmlFor={`${id}-guests`}>Guests</label>
        <select id={`${id}-guests`} value={form.guests} onChange={update("guests")}>
          {Array.from({ length: guestLimit }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>
              {count} {count === 1 ? "guest" : "guests"}
            </option>
          ))}
        </select>
      </div>

      {showRoomChoice && (
        <div className="s-book-field">
          <label htmlFor={`${id}-room`}>Room</label>
          <select id={`${id}-room`} value={form.roomType} onChange={update("roomType")}>
            <option value="">Any room</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.type}>
                {category.type}
              </option>
            ))}
          </select>
        </div>
      )}

      <button type="submit" className={`btn btn-accent btn-lg ${variant === "card" ? "btn-block" : ""}`}>
        Check availability <ArrowRight size={17} aria-hidden="true" />
      </button>

      {error && (
        <p className="s-book-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
