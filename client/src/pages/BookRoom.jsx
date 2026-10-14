import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ReservationForm from "../components/app/ReservationForm";
import { PageHeader } from "../components/ui/kit";
import { clearSearch, readSearch } from "../lib/bookingSearch";

export default function BookRoom() {
  const navigate = useNavigate();
  const location = useLocation();

  // Dates, party size and room type chosen on the hotel website carry over.
  const initialSearch = useMemo(() => readSearch(location.state), [location.state]);

  return (
    <>
      <PageHeader
        eyebrow="Your next stay"
        title="Book a stay"
        description={
          initialSearch?.roomType
            ? `You chose the ${initialSearch.roomType}. Check the dates, then tell us who is staying.`
            : "Choose your dates to see which rooms are free, then tell us who is staying."
        }
      />
      <ReservationForm
        initialSearch={initialSearch}
        onCreated={(booking) => {
          clearSearch();
          navigate(`/guest/my-bookings?open=${booking._id}`, { replace: true });
        }}
      />
    </>
  );
}
