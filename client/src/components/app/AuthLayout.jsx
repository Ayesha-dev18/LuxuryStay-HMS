import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Moon, Sun } from "lucide-react";

import heroImage from "../../assets/hotel-hero.jpg";
import { useApplyTheme, useTheme } from "../../context/AppContext";
import { useHotel } from "../../context/HotelContext";
import { IconButton } from "../ui/kit";

// Shared frame for sign-in, registration and password recovery: the form on
// the left, a photograph of the hotel on the right.
export default function AuthLayout({ children }) {
  const { theme, toggle } = useTheme();
  const { hotel } = useHotel();

  useApplyTheme();

  return (
    <div className="app-auth">
      <main className="auth-panel">
        <div className="auth-top">
          <Link to="/" className="app-brand" aria-label={`${hotel.hotelName} website`}>
            <span className="app-brand-mark" aria-hidden="true">
              L
            </span>
            <span className="app-brand-text">
              <strong>LuxuryStay</strong>
              <span>Hotel &amp; Resort</span>
            </span>
          </Link>
          <IconButton
            label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            icon={theme === "dark" ? Sun : Moon}
            onClick={toggle}
          />
        </div>

        <motion.div
          className="auth-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>

        <Link to="/" className="link auth-back">
          <ArrowLeft size={15} aria-hidden="true" /> Back to the hotel website
        </Link>
      </main>

      <aside className="auth-art" style={{ "--auth-image": `url(${heroImage})` }}>
        <div className="auth-glass">
        <p className="auth-kicker">{hotel.hotelName}</p>
        <h1>
          Your stay, <em>kept in order.</em>
        </h1>
        <p>
          Reserve a room, follow your booking and keep your details up to date. Staff sign in here
          too.
        </p>
        </div>
      </aside>
    </div>
  );
}
