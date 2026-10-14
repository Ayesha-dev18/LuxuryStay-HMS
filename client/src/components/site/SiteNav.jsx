import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, UserRound, X } from "lucide-react";

import { homeFor, useAuth } from "../../context/AppContext";
import { startBooking } from "../../lib/bookingSearch";

const LINKS = [
  { hash: "#rooms", label: "Rooms" },
  { hash: "#experiences", label: "Experiences" },
  { hash: "#hotel", label: "The hotel" },
  { hash: "#contact", label: "Contact" },
];

const EASE = [0.22, 1, 0.36, 1];

// Site navigation. Transparent over a photograph, solid once the page scrolls
// (or always, on pages without a photograph at the top).
export default function SiteNav({ solid = false }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The menu closes on navigation and on Escape, and holds the page still.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const account = auth.user
    ? { to: homeFor(auth.user.role), label: auth.user.role === "guest" ? "My stays" : "Workspace" }
    : { to: "/auth", label: "Sign in" };

  const reserve = () => {
    setOpen(false);
    startBooking(navigate, auth);
  };

  return (
    <header className={`s-nav ${scrolled || solid ? "is-solid" : ""} ${open ? "is-open" : ""}`}>
      <div className="s-wrap s-nav-inner">
        <Link to="/" className="s-wordmark" aria-label="LuxuryStay Hotel and Resort, home">
          LuxuryStay
          <span>Hotel &amp; Resort</span>
        </Link>

        <nav className="s-nav-links" aria-label="Main">
          {LINKS.map((link) => (
            <Link key={link.hash} to={{ pathname: "/", hash: link.hash }}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="s-nav-actions">
          <Link to={account.to} className="s-nav-signin">
            <UserRound size={16} aria-hidden="true" /> {account.label}
          </Link>
          <button type="button" className="btn btn-accent" onClick={reserve}>
            Reserve
          </button>
          <button
            type="button"
            className="s-burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="site-menu"
            className="s-menu"
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <nav aria-label="Menu">
              {LINKS.map((link, index) => (
                <motion.div
                  key={link.hash}
                  initial={{ opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.12 + index * 0.07, ease: EASE }}
                >
                  <Link to={{ pathname: "/", hash: link.hash }} onClick={() => setOpen(false)}>
                    <small>0{index + 1}</small>
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </nav>

            <motion.div
              className="s-menu-actions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.45 }}
            >
              <button type="button" className="btn btn-accent btn-lg" onClick={reserve}>
                Reserve a stay
              </button>
              <Link to={account.to} className="btn btn-secondary btn-lg">
                {account.label}
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
