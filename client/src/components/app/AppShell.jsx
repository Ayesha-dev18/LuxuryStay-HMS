import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  ChevronsUpDown,
  ConciergeBell,
  DoorOpen,
  Globe,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  UserCog,
  UserRound,
  Users,
  Wrench,
  X,
} from "lucide-react";

import { homeFor, useApplyTheme, useAuth, useTheme } from "../../context/AppContext";
import { ROLE_LABELS } from "../../lib/format";
import { useClickOutside } from "../../lib/hooks";
import { Avatar, Button, EmptyState, IconButton } from "../ui/kit";
import Notifications from "./Notifications";

// One navigation definition for every staff role. An item appears only when
// the signed-in user holds its permission; the server enforces the same
// permission on the data behind it.
const STAFF_NAV = [
  {
    label: "Today",
    items: [
      { to: "", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "front-desk", label: "Front desk", icon: ConciergeBell, perm: "frontdesk:view", also: "reports:view" },
      { to: "check-in", label: "Arrivals", icon: LogIn, perm: "bookings:checkin" },
      { to: "check-out", label: "Departures", icon: DoorOpen, perm: "bookings:checkout" },
    ],
  },
  {
    label: "Guests",
    items: [
      { to: "bookings", label: "Reservations", icon: CalendarDays, perm: "bookings:view" },
      { to: "guests", label: "Guest directory", icon: Users, perm: "guests:view" },
      { to: "feedback", label: "Reviews", icon: Star, perm: "feedback:manage" },
      { to: "enquiries", label: "Enquiries", icon: Mail, perm: "contact:manage" },
    ],
  },
  {
    label: "House",
    items: [
      { to: "rooms", label: "Rooms", icon: BedDouble, perm: "rooms:view" },
      { to: "housekeeping", label: "Housekeeping", icon: Sparkles, perm: "housekeeping:manage" },
      { to: "maintenance", label: "Maintenance", icon: Wrench, perm: "maintenance:view" },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "finance", label: "Billing", icon: Receipt, perm: "billing:view" },
      { to: "reports", label: "Reports", icon: BarChart3, perm: "reports:view" },
      { to: "staff", label: "Staff", icon: UserCog, perm: "staff:view" },
      { to: "settings", label: "Settings", icon: Settings, perm: "settings:manage" },
    ],
  },
];

const GUEST_NAV = [
  {
    label: "Your stay",
    items: [
      { to: "", label: "Overview", icon: LayoutDashboard, end: true },
      { to: "book-room", label: "Book a stay", icon: CalendarPlus },
      { to: "my-bookings", label: "My bookings", icon: CalendarCheck },
      { to: "profile", label: "Profile", icon: UserRound },
    ],
  },
];

function UserMenu({ home, isGuest }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useClickOutside(wrapRef, () => setOpen(false), open);

  const signOut = async () => {
    setLeaving(true);
    await logout();
    navigate("/auth", { replace: true });
  };

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="popover-wrap grow" ref={wrapRef}>
      <button
        type="button"
        className="side-user"
        style={{ width: "100%" }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Avatar name={user.name} />
        <span className="side-user-text grow">
          <strong>{user.name}</strong>
          <span>{ROLE_LABELS[user.role] || user.role}</span>
        </span>
        <ChevronsUpDown size={15} className="collapse-hide muted" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="popover up"
            style={{ width: 248 }}
            role="menu"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
          >
            <div className="popover-head">
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block" }}>{user.name}</strong>
                <span className="muted small" style={{ overflowWrap: "anywhere" }}>
                  {user.email}
                </span>
              </div>
            </div>
            <div className="menu-list">
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => go(isGuest ? "/guest/profile" : `${home}/account`)}
              >
                <UserRound size={16} aria-hidden="true" /> Profile and password
              </button>
              <button type="button" role="menuitem" className="menu-item" onClick={() => go("/")}>
                <Globe size={16} aria-hidden="true" /> Hotel website
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu-item danger"
                onClick={signOut}
                disabled={leaving}
              >
                <LogOut size={16} aria-hidden="true" /> {leaving ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const readCollapsed = () => {
  try {
    return localStorage.getItem("ls-sidebar") === "collapsed";
  } catch {
    return false;
  }
};

export default function AppShell() {
  const { user, can, settings } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();

  useApplyTheme();

  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [navOpen, setNavOpen] = useState(false);

  const isGuest = user.role === "guest";
  const home = homeFor(user.role);

  const groups = useMemo(() => {
    const source = isGuest ? GUEST_NAV : STAFF_NAV;
    return source
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => (!item.perm || can(item.perm)) && (!item.also || can(item.also))
        ),
      }))
      .filter((group) => group.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, user.role]);

  // The page being shown, for the bar above the content.
  const current = useMemo(() => {
    const path = location.pathname.replace(/\/+$/, "");
    const items = groups.flatMap((group) => group.items);
    const match = items.find((item) => item.to && path.startsWith(`${home}/${item.to}`));
    if (match) return match.label;
    if (path === home) return items[0]?.label || "Overview";
    return path.endsWith("/account") ? "Profile" : "";
  }, [location.pathname, groups, home]);

  // The drawer closes whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (event) => event.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem("ls-sidebar", value ? "open" : "collapsed");
      } catch {
        // Preference will not persist.
      }
      return !value;
    });
  };

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className={`app ${collapsed ? "is-collapsed" : ""} ${navOpen ? "nav-open" : ""}`}>
      <a className="app-skip" href="#main">
        Skip to content
      </a>

      <aside className="app-side" aria-label="Primary">
        <NavLink to={home} className="app-brand" end>
          <span className="app-brand-mark" aria-hidden="true">
            L
          </span>
          <span className="app-brand-text">
            <strong>LuxuryStay</strong>
            <span>{isGuest ? "Guest portal" : "Hotel operations"}</span>
          </span>
        </NavLink>

        <nav className="app-nav">
          <LayoutGroup id="app-nav">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="app-nav-label">{group.label}</div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to ? `${home}/${item.to}` : home}
                    end={item.end}
                    className={({ isActive }) => `app-nav-link ${isActive ? "active" : ""}`}
                    title={collapsed ? item.label : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="app-nav-active"
                            className="app-nav-active"
                            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            aria-hidden="true"
                          />
                        )}
                        <item.icon size={17} strokeWidth={1.75} aria-hidden="true" />
                        <span>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </LayoutGroup>
        </nav>

        <div className="app-side-foot">
          <UserMenu home={home} isGuest={isGuest} />
          <IconButton
            className="collapse-toggle"
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            icon={collapsed ? PanelLeftOpen : PanelLeftClose}
            onClick={toggleCollapsed}
          />
          <IconButton
            className="menu-toggle"
            label="Close menu"
            icon={X}
            onClick={() => setNavOpen(false)}
          />
        </div>
      </aside>

      <button
        type="button"
        className="app-scrim"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={() => setNavOpen(false)}
      />

      <div className="app-main">
        <header className="app-bar">
          <IconButton
            className="menu-toggle"
            label="Open menu"
            icon={Menu}
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          />
          <div className="app-crumbs">
            <span>{settings.hotelName}</span>
            <strong>{current}</strong>
          </div>
          <time className="app-date">{today}</time>
          <IconButton
            label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            icon={theme === "dark" ? Sun : Moon}
            onClick={toggle}
          />
          <Notifications home={home} isGuest={isGuest} />
        </header>

        <main className="app-content" id="main" tabIndex={-1}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}

export function NoAccess() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <EmptyState
      icon={ShieldCheck}
      title="You do not have access to this page"
      message="Your role does not include this area. If you need it, ask an administrator."
    >
      <Button variant="secondary" onClick={() => navigate(homeFor(user.role))}>
        Back to overview
      </Button>
    </EmptyState>
  );
}
