// Screenshot plan for the documentation. Runs against the development stack
// (frontend :5173 -> API :5000 -> luxurystay_dev) with the fictional demo
// accounts created by `npm run seed:dev-demo`. Forms and dialogs are opened
// but never submitted, so no data is changed.
//
// The demo password is read from DEMO_PW and never written anywhere.
const PW = process.env.DEMO_PW;
if (!PW) throw new Error("Set DEMO_PW to the demo-account password (server/.env.demo-accounts).");

const signIn = (email, home) => [
  ["signout"], ["goto", "/auth"], ["wait", 1800],
  ["fill", "Email address", email], ["fill", "Password", PW],
  ["click", "Sign in"], ["wait", 3500],
  ["eval", "location.pathname", home],
];
const top = ["eval", "(window.scrollTo(0,0), '')", ""];
const go = (path, wait = 2800) => [["goto", path], ["wait", wait], top];
// Search boxes have no visible label, so they are filled by placeholder.
const search = (placeholder, value) => ["eval", `(() => { const el = document.querySelector('input[placeholder="${placeholder}"]'); if (!el) return 'NO INPUT'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, '${value}'); el.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()`, "ok"];

module.exports = [
  ["size", 1440, 900],

  // Public website
  ["signout"], ...go("/", 4000),
  ["shot", "01-public-home"],
  ["eval", "(document.querySelector('.s-room').scrollIntoView({block:'start'}), window.scrollBy(0,-90), '')", ""], ["wait", 1800],
  ["shot", "02-public-room-collection"],
  ...go("/rooms/signature-suite", 3500),
  ["scroll", 560], ["wait", 2500], ["shot", "03-room-details"],
  ["scroll", 1300], ["wait", 2500], ["shot", "03b-room-details-booking"],

  // Authentication
  ...go("/auth", 2200),
  ["shot", "04-sign-in"],
  ["click", "Sign in"], ["wait", 900],
  ["shot", "05-sign-in-validation"],
  ["click", "Create a guest account"], ["wait", 1200],
  ["shot", "06-registration"],
  ["click", "Create account"], ["wait", 900],
  ["shot", "07-registration-validation"],
  ...go("/forgot-password", 2000),
  ["shot", "08-forgot-password"],

  // Manager (the /admin area)
  ...signIn("hamza.siddiqui@demo.luxurystay.test", "/admin"),
  ["wait", 1500], ["shot", "09-manager-dashboard"],
  ["scroll", 700], ["wait", 1200], ["shot", "10-manager-dashboard-charts"],
  ...go("/admin/front-desk"), ["shot", "11-front-desk"],
  ...go("/admin/bookings"), ["shot", "12-reservations"],
  ["clickSel", "tbody tr", 1], ["wait", 2200], ["shot", "13-reservation-details"],
  ["click", "Invoice"], ["wait", 2200], ["shot", "14-invoice"],
  ...go("/admin/bookings"),
  ["click", "New reservation"], ["wait", 2000], ["shot", "15-new-reservation-form"],
  ...go("/admin/rooms"), ["shot", "16-rooms"],
  ["click", "Add room", 0], ["wait", 1500], ["shot", "17-add-room-form"],
  // Only the fictional demo accounts are shown.
  ...go("/admin/guests"), search("Name, email or phone", "demo.luxurystay.test"), ["wait", 2000],
  ["expectNot", "gmail.com"], ["shot", "18-guest-directory"],
  ...go("/admin/finance"), ["shot", "19-billing"],
  ...go("/admin/reports", 3500), ["shot", "20-reports"],
  ...go("/admin/feedback"), ["shot", "21-reviews"],
  ...go("/admin/enquiries"), ["shot", "22-enquiries"],
  ...go("/admin/staff"), search("Name, email or phone", "demo.luxurystay.test"), ["wait", 2000],
  ["expectNot", "gmail.com"], ["shot", "23-staff-accounts"],
  ...go("/admin/maintenance"), ["shot", "24-maintenance"],
  ...go("/admin/settings"), ["shot", "25-settings-manager-no-access"],

  // Administrator (fictional demo administrator created with npm run create-admin)
  ...signIn("zainab.mirza@demo.luxurystay.test", "/admin"),
  ...go("/admin/settings"), ["shot", "25b-admin-settings"],
  ...go("/admin/staff"),
  ["click", "Add staff member"], ["wait", 1500], ["click", "Create account"], ["wait", 800], ["shot", "23b-admin-add-staff-form"],

  // Receptionist
  ...signIn("sana.malik@demo.luxurystay.test", "/staff"),
  ["wait", 1200], ["shot", "26-receptionist-overview"],
  ...go("/staff/check-in"), ["shot", "27-arrivals"],
  ...go("/staff/check-out"), ["shot", "28-departures"],
  ...go("/staff/bookings"), search("Guest, email, phone, room or invoice", "Mahnoor"), ["wait", 2000],
  ["clickSel", "tbody tr", 0], ["wait", 2500],
  ["click", "Record payment", 0], ["wait", 1800], ["shot", "29-record-payment-form"],

  // Housekeeping
  ...signIn("imran.qureshi@demo.luxurystay.test", "/staff"),
  ["wait", 1200], ["shot", "30-housekeeping-overview"],
  ...go("/staff/housekeeping"), ["shot", "31-housekeeping-queue"],
  ...go("/staff/maintenance"),
  ["click", "Report issue", 0], ["wait", 1500], ["shot", "32-report-issue-form"],

  // Guest
  ...signIn("amina.khan@demo.luxurystay.test", "/guest"),
  ["wait", 1500], ["shot", "33-guest-home"],
  ...go("/guest/book-room", 3500), ["shot", "34-guest-book-room"],
  ...go("/guest/my-bookings", 3000), ["shot", "35-guest-my-bookings"],
  ...go("/guest/profile"), ["shot", "36-guest-profile"],

  // Responsive layout
  ["signout"], ["size", 390, 844], ...go("/", 3500),
  ["shot", "37-mobile-home"],
];
