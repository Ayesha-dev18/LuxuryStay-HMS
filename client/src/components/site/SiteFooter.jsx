import { Link, useNavigate } from "react-router-dom";

import { homeFor, useAuth } from "../../context/AppContext";
import { useHotel } from "../../context/HotelContext";
import { startBooking } from "../../lib/bookingSearch";

const PROFILES = [
  { field: "instagramUrl", label: "Instagram" },
  { field: "facebookUrl", label: "Facebook" },
  { field: "linkedinUrl", label: "LinkedIn" },
];

// Contact details and profile links come from the hotel's settings. Anything
// the hotel has not filled in is simply left out.
export default function SiteFooter() {
  const { hotel } = useHotel();
  const auth = useAuth();
  const navigate = useNavigate();

  const profiles = PROFILES.filter((profile) => hotel[profile.field]);
  const hasContact = hotel.contactEmail || hotel.contactPhone || hotel.address;

  return (
    <footer className="s-foot">
      <div className="s-wrap">
        <div className="s-foot-top">
          <div>
            <Link to="/" className="s-wordmark">
              LuxuryStay
            </Link>
            <p>Rooms, suites and residences, looked after by people who notice the details.</p>
          </div>

          <div>
            <h4>Explore</h4>
            <ul>
              <li>
                <Link to={{ pathname: "/", hash: "#rooms" }}>Rooms</Link>
              </li>
              <li>
                <Link to={{ pathname: "/", hash: "#experiences" }}>Experiences</Link>
              </li>
              <li>
                <Link to={{ pathname: "/", hash: "#hotel" }}>The hotel</Link>
              </li>
              <li>
                <Link to={{ pathname: "/", hash: "#contact" }}>Contact</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>Your stay</h4>
            <ul>
              <li>
                <button type="button" onClick={() => startBooking(navigate, auth)}>
                  Reserve a room
                </button>
              </li>
              <li>
                {auth.user ? (
                  <Link to={homeFor(auth.user.role)}>
                    {auth.user.role === "guest" ? "My stays" : "Staff workspace"}
                  </Link>
                ) : (
                  <Link to="/auth">Sign in</Link>
                )}
              </li>
              {!auth.user && (
                <li>
                  <Link to="/auth" state={{ mode: "register" }}>
                    Create a guest account
                  </Link>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h4>Contact</h4>
            <ul>
              {hotel.contactEmail && (
                <li>
                  <a href={`mailto:${hotel.contactEmail}`}>{hotel.contactEmail}</a>
                </li>
              )}
              {hotel.contactPhone && (
                <li>
                  <a href={`tel:${hotel.contactPhone}`}>{hotel.contactPhone}</a>
                </li>
              )}
              {hotel.address && <li>{hotel.address}</li>}
              {!hasContact && (
                <li>
                  <Link to={{ pathname: "/", hash: "#contact" }}>Send us an enquiry</Link>
                </li>
              )}
              {profiles.map((profile) => (
                <li key={profile.field}>
                  <a href={hotel[profile.field]} target="_blank" rel="noreferrer noopener">
                    {profile.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="s-foot-bottom">
          <span>
            © {new Date().getFullYear()} {hotel.hotelName}
          </span>
          {hotel.checkInTime && hotel.checkOutTime && (
            <span>
              Check-in from {hotel.checkInTime} · Check-out by {hotel.checkOutTime}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
