import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";

import { homeFor, useAuth } from "./context/AppContext";
import { useHotel } from "./context/HotelContext";
import AppShell, { NoAccess } from "./components/app/AppShell";

// Public website
const Home = lazy(() => import("./pages/Home"));
const RoomPage = lazy(() => import("./pages/RoomPage"));

// Sign-in and account recovery
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// Staff workspace
const Dashboard = lazy(() => import("./pages/Dashboard"));
const FrontDesk = lazy(() => import("./pages/FrontDesk"));
const Reservations = lazy(() => import("./pages/Reservations"));
const StayDesk = lazy(() => import("./pages/StayDesk"));
const Rooms = lazy(() => import("./pages/Rooms"));
const Housekeeping = lazy(() => import("./pages/Housekeeping"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const Billing = lazy(() => import("./pages/Billing"));
const Reports = lazy(() => import("./pages/Reports"));
const Guests = lazy(() => import("./pages/Guests"));
const StaffAccounts = lazy(() => import("./pages/StaffAccounts"));
const Feedback = lazy(() => import("./pages/Feedback"));
const Enquiries = lazy(() => import("./pages/Enquiries"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Account = lazy(() => import("./pages/Account"));

// Guest portal
const GuestHome = lazy(() => import("./pages/GuestHome"));
const BookRoom = lazy(() => import("./pages/BookRoom"));
const GuestBookings = lazy(() => import("./pages/GuestBookings"));

function PageLoader() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="spinner" style={{ width: 26, height: 26 }} />
      <span className="sr-only">Loading</span>
    </div>
  );
}

// Signed-out visitors go to sign-in and return to the page they asked for.
// A signed-in user in the wrong area is sent to their own home. These checks
// only shape the interface; the API enforces access on every request.
function RequireArea({ area }) {
  const { user, ready } = useAuth();
  const hotel = useHotel();
  const location = useLocation();

  // Stay dates depend on the hotel's timezone, so the product waits for it.
  if (!ready || !hotel.ready) return <PageLoader />;

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  }

  const home = homeFor(user.role);
  if (home !== `/${area}`) {
    // Between /admin and /staff the rest of the address is kept, so a shared
    // link opens the same page in the person's own area.
    const staffToStaff = area !== "guest" && user.role !== "guest";
    const rest = staffToStaff ? location.pathname.slice(area.length + 1) + location.search : "";
    return <Navigate to={home + rest} replace />;
  }

  return <AppShell />;
}

function Allow({ perm, children }) {
  const { canAny } = useAuth();
  if (perm && !canAny([].concat(perm))) return <NoAccess />;
  return children;
}

// The same pages serve /admin and /staff. Which ones a person can open is
// decided by their permissions, not by the address.
const staffRoutes = () => [
  <Route key="home" index element={<Dashboard />} />,
  <Route key="front-desk" path="front-desk" element={<Allow perm="frontdesk:view"><FrontDesk /></Allow>} />,
  <Route key="bookings" path="bookings" element={<Allow perm="bookings:view"><Reservations /></Allow>} />,
  <Route key="check-in" path="check-in" element={<Allow perm="bookings:checkin"><StayDesk mode="arrivals" /></Allow>} />,
  <Route key="check-out" path="check-out" element={<Allow perm="bookings:checkout"><StayDesk mode="departures" /></Allow>} />,
  <Route key="rooms" path="rooms" element={<Allow perm="rooms:view"><Rooms /></Allow>} />,
  <Route key="housekeeping" path="housekeeping" element={<Allow perm="housekeeping:manage"><Housekeeping /></Allow>} />,
  <Route key="maintenance" path="maintenance" element={<Allow perm="maintenance:view"><Maintenance /></Allow>} />,
  <Route key="finance" path="finance" element={<Allow perm="billing:view"><Billing /></Allow>} />,
  <Route key="reports" path="reports" element={<Allow perm="reports:view"><Reports /></Allow>} />,
  <Route key="guests" path="guests" element={<Allow perm="guests:view"><Guests /></Allow>} />,
  <Route key="staff" path="staff" element={<Allow perm="staff:view"><StaffAccounts /></Allow>} />,
  <Route key="create-staff" path="create-staff" element={<Navigate to="../staff" replace />} />,
  <Route key="feedback" path="feedback" element={<Allow perm="feedback:manage"><Feedback /></Allow>} />,
  <Route key="enquiries" path="enquiries" element={<Allow perm="contact:manage"><Enquiries /></Allow>} />,
  <Route key="settings" path="settings" element={<Allow perm="settings:manage"><SettingsPage /></Allow>} />,
  <Route key="account" path="account" element={<Account />} />,
  <Route key="missing" path="*" element={<NoAccess />} />,
];

function App() {
  const location = useLocation();

  return (
    <MotionConfig reducedMotion="user">
      <Suspense fallback={<PageLoader />}>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/rooms/:slug" element={<RoomPage />} />

          <Route path="/auth" element={<Auth />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/admin" element={<RequireArea area="admin" />}>
            {staffRoutes()}
          </Route>

          <Route path="/staff" element={<RequireArea area="staff" />}>
            {staffRoutes()}
          </Route>

          <Route path="/guest" element={<RequireArea area="guest" />}>
            <Route index element={<GuestHome />} />
            <Route path="book-room" element={<BookRoom />} />
            <Route path="my-bookings" element={<GuestBookings />} />
            <Route path="profile" element={<Account />} />
            <Route path="*" element={<NoAccess />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </MotionConfig>
  );
}

export default App;
