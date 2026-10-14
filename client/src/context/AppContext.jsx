import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

import { api, session } from "../lib/api";
import { makeMoney } from "../lib/format";

/* ---------- Toasts ---------- */

const ToastContext = createContext(null);

const TOAST_ICONS = { success: CheckCircle2, error: CircleAlert, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (type, message) => {
      if (!message) return;
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, type, message }]);
      window.setTimeout(() => dismiss(id), type === "error" ? 7000 : 4500);
    },
    [dismiss]
  );

  const value = useMemo(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = TOAST_ICONS[toast.type] || Info;
            return (
              <motion.div
                key={toast.id}
                className={`toast ${toast.type}`}
                role={toast.type === "error" ? "alert" : "status"}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.25 }}
              >
                <Icon size={18} aria-hidden="true" />
                <p>{toast.message}</p>
                <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
                  <X size={16} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ---------- Theme ---------- */

const ThemeContext = createContext(null);

const storedTheme = () => {
  try {
    const saved = localStorage.getItem("ls-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Fall through to the system preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(storedTheme);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("ls-theme", next);
      } catch {
        // The choice simply will not persist.
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// The public website has its own fixed look, so the theme attribute is only
// present while a product screen (sign-in or the app) is mounted.
export function useApplyTheme() {
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => document.documentElement.removeAttribute("data-theme");
  }, [theme]);
}

/* ---------- Session ---------- */

const AuthContext = createContext(null);

const DEFAULT_SETTINGS = {
  hotelName: "LuxuryStay Hotel & Resort",
  currencySymbol: "Rs.",
  taxRate: 0,
  checkInTime: "14:00",
  checkOutTime: "12:00",
  maxStayNights: 30,
};

export const homeFor = (role) => {
  if (role === "admin" || role === "manager") return "/admin";
  if (role === "guest") return "/guest";
  return "/staff";
};

export function AuthProvider({ children }) {
  // The cached user only avoids a flash while the server confirms the
  // session. Access decisions always use what the server returns.
  const [user, setUser] = useState(() => (session.getToken() ? session.getUser() : null));
  const [permissions, setPermissions] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(() => !session.getToken());

  const applySession = useCallback((data) => {
    setUser(data.user);
    setPermissions(data.permissions || []);
    session.save(data.token, data.user);
  }, []);

  const clearSession = useCallback(() => {
    session.clear();
    setUser(null);
    setPermissions([]);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api.get("/settings");
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    } catch {
      // Defaults stay in place; screens that need settings report their own errors.
    }
  }, []);

  useEffect(() => {
    if (!session.getToken()) return undefined;

    let cancelled = false;

    api
      .get("/auth/me")
      .then((data) => {
        if (cancelled) return;
        applySession(data);
        loadSettings();
      })
      .catch((error) => {
        if (cancelled) return;
        // A network failure keeps the cached session so a brief outage does
        // not sign everyone out; a 401 has already cleared it.
        if (error.status === 401 || error.status === 403) clearSession();
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession, loadSettings]);

  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      setPermissions([]);
    };
    window.addEventListener("ls:session-expired", onExpired);
    return () => window.removeEventListener("ls:session-expired", onExpired);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const data = await api.post("/auth/login", { email, password });
      applySession(data);
      loadSettings();
      return data.user;
    },
    [applySession, loadSettings]
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // The local session is cleared either way.
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      permissions,
      settings,
      ready,
      isAuthenticated: Boolean(user),
      can: (permission) => permissions.includes(permission),
      canAny: (list) => list.some((permission) => permissions.includes(permission)),
      money: makeMoney(settings.currencySymbol),
      login,
      logout,
      applySession,
      setSettings: (next) => setSettings({ ...DEFAULT_SETTINGS, ...next }),
    }),
    [user, permissions, settings, ready, login, logout, applySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
