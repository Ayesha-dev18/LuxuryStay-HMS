import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api } from "../lib/api";
import { makeMoney, setHotelTimeZone } from "../lib/format";

/*
  What the hotel website knows without anyone signing in: the hotel's public
  details, its timezone, and the room collection with current prices. All of
  it comes from the API; nothing here is a hardcoded fact about the hotel.
*/

const HotelContext = createContext(null);

const DEFAULT_HOTEL = {
  hotelName: "LuxuryStay Hotel & Resort",
  address: "",
  contactEmail: "",
  contactPhone: "",
  currencySymbol: "Rs.",
  checkInTime: "",
  checkOutTime: "",
  maxStayNights: 30,
  instagramUrl: "",
  facebookUrl: "",
  linkedinUrl: "",
};

export function HotelProvider({ children }) {
  const [hotel, setHotel] = useState(DEFAULT_HOTEL);
  const [ready, setReady] = useState(false);
  const [rooms, setRooms] = useState({ categories: [], loading: false, loaded: false, error: "" });

  useEffect(() => {
    let cancelled = false;

    api
      .get("/public/hotel")
      .then((data) => {
        if (cancelled) return;
        setHotelTimeZone(data.timezone);
        setHotel({ ...DEFAULT_HOTEL, ...data.hotel });
      })
      .catch(() => {
        // The defaults stay; pages that need live data report their own errors.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadRooms = useCallback(async () => {
    setRooms((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await api.get("/public/rooms");
      setRooms({ categories: data.categories, loading: false, loaded: true, error: "" });
    } catch (error) {
      setRooms({ categories: [], loading: false, loaded: false, error: error.message });
    }
  }, []);

  const value = useMemo(
    () => ({ hotel, ready, rooms, loadRooms, money: makeMoney(hotel.currencySymbol) }),
    [hotel, ready, rooms, loadRooms]
  );

  return <HotelContext.Provider value={value}>{children}</HotelContext.Provider>;
}

export const useHotel = () => useContext(HotelContext);

// The room collection, fetched the first time a page asks for it.
export function useRoomCollection() {
  const { rooms, loadRooms } = useHotel();

  useEffect(() => {
    if (!rooms.loaded && !rooms.loading && !rooms.error) loadRooms();
  }, [rooms.loaded, rooms.loading, rooms.error, loadRooms]);

  return { ...rooms, loading: rooms.loading || (!rooms.loaded && !rooms.error), reload: loadRooms };
}
