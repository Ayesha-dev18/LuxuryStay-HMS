import { homeFor } from "../context/AppContext";

// Carries the dates, party size and room type a visitor chose on the hotel
// website through sign-in and into the reservation form.

const KEY = "luxurystaySearch";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const clean = (item) => {
  if (!item || !DATE.test(item.checkIn || "") || !DATE.test(item.checkOut || "")) return undefined;

  return {
    checkIn: item.checkIn,
    checkOut: item.checkOut,
    guests: Math.min(Math.max(Number(item.guests) || 1, 1), 12),
    roomType: typeof item.roomType === "string" ? item.roomType.slice(0, 60) : "",
  };
};

export const readSearch = (routeState) => {
  const fromRoute = clean(routeState);
  if (fromRoute) return fromRoute;

  try {
    return clean(JSON.parse(sessionStorage.getItem(KEY) || "null"));
  } catch {
    return undefined;
  }
};

export const clearSearch = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
};

// Sends the visitor to the right place for who they are. Guests go straight
// to the form, front-desk staff to a new reservation, everyone else signs in
// first and is brought back afterwards.
export const startBooking = (navigate, auth, search) => {
  const chosen = clean(search);

  try {
    if (chosen) sessionStorage.setItem(KEY, JSON.stringify(chosen));
  } catch {
    // The choice still travels in the route state below.
  }

  if (auth.user?.role === "guest") {
    navigate("/guest/book-room", { state: chosen });
    return;
  }

  if (auth.user) {
    const home = homeFor(auth.user.role);
    navigate(auth.can("bookings:create") ? `${home}/bookings?new=1` : home);
    return;
  }

  navigate("/auth", { state: { from: "/guest/book-room", bookingSearch: chosen } });
};
