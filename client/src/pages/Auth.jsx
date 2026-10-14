import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole, Mail, Phone, UserRound } from "lucide-react";

import AuthLayout from "../components/app/AuthLayout";
import { Alert, Button, PasswordField, TextField } from "../components/ui/kit";
import { homeFor, useAuth } from "../context/AppContext";
import { api } from "../lib/api";
import { passwordStrength, rules, validate } from "../lib/format";

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"];

const EMPTY = { name: "", email: "", phone: "", password: "", confirmPassword: "" };

export default function Auth() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState(location.state?.mode === "register" ? "register" : "login");
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(location.state?.notice || null);
  const [submitting, setSubmitting] = useState(false);

  const isLogin = mode === "login";

  useEffect(() => {
    document.title = isLogin ? "Sign in · LuxuryStay" : "Create account · LuxuryStay";
  }, [isLogin]);

  // The page a signed-out visitor originally asked for. Only in-app paths are
  // honoured, and only when they belong to the role that signed in.
  const destinationFor = (role) => {
    const home = homeFor(role);
    const from = location.state?.from;
    if (typeof from === "string" && from.startsWith(home)) return from;
    return home;
  };

  if (ready && user) {
    return <Navigate to={destinationFor(user.role)} replace state={location.state?.bookingSearch} />;
  }

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    setNotice(null);
    setForm((current) => ({ ...EMPTY, email: current.email }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const found = isLogin
      ? validate(form, { email: rules.email, password: rules.required("Password") })
      : validate(form, {
          name: rules.accountName,
          email: rules.email,
          phone: rules.optionalPhone,
          password: rules.password,
          confirmPassword: (value, all) =>
            value === all.password ? "" : "Passwords do not match.",
        });

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setNotice(null);

    try {
      if (isLogin) {
        const signedIn = await login(form.email.trim(), form.password);
        navigate(destinationFor(signedIn.role), {
          replace: true,
          state: location.state?.bookingSearch,
        });
        return;
      }

      const data = await api.post("/auth/register", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
      });

      setMode("login");
      setForm({ ...EMPTY, email: form.email.trim() });
      setNotice({ type: "success", text: data.message });
    } catch (error) {
      setErrors(error.fields || {});
      setNotice({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const strength = passwordStrength(form.password);

  return (
    <AuthLayout>
      <h2>{isLogin ? "Welcome back" : "Create your account"}</h2>
      <p>
        {isLogin
          ? "Sign in to manage your stay or your shift."
          : "Register as a guest to reserve rooms and follow your bookings."}
      </p>

      <form onSubmit={submit} noValidate>
        {notice && <Alert type={notice.type}>{notice.text}</Alert>}

        {!isLogin && (
          <TextField
            label="Full name"
            icon={UserRound}
            autoComplete="name"
            required
            maxLength={80}
            value={form.name}
            onChange={update("name")}
            error={errors.name}
            hint="At least 3 characters."
          />
        )}

        <TextField
          label="Email address"
          type="email"
          icon={Mail}
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={form.email}
          onChange={update("email")}
          error={errors.email}
        />

        {!isLogin && (
          <TextField
            label="Phone number"
            type="tel"
            icon={Phone}
            autoComplete="tel"
            placeholder="+92 300 1234567"
            maxLength={20}
            value={form.phone}
            onChange={update("phone")}
            error={errors.phone}
            hint="Optional. Helps the front desk reach you about your stay."
          />
        )}

        <div>
          <PasswordField
            label="Password"
            icon={LockKeyhole}
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            maxLength={72}
            value={form.password}
            onChange={update("password")}
            error={errors.password}
            hint={isLogin ? undefined : "At least 8 characters, with a letter and a number."}
          />
          {!isLogin && form.password && (
            <div className="row" style={{ marginTop: 8, flexWrap: "nowrap" }}>
              <div className="strength grow" data-level={strength} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </div>
              <span className="small muted" aria-live="polite">
                {STRENGTH_LABELS[strength]}
              </span>
            </div>
          )}
        </div>

        {!isLogin && (
          <PasswordField
            label="Confirm password"
            icon={LockKeyhole}
            autoComplete="new-password"
            required
            maxLength={72}
            value={form.confirmPassword}
            onChange={update("confirmPassword")}
            error={errors.confirmPassword}
          />
        )}

        {isLogin && (
          <div style={{ textAlign: "right", marginTop: -6 }}>
            <Link to="/forgot-password" state={{ email: form.email }} className="link small">
              Forgot your password?
            </Link>
          </div>
        )}

        <Button type="submit" size="lg" block loading={submitting}>
          {isLogin ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="auth-switch">
        {isLogin ? "New to LuxuryStay? " : "Already have an account? "}
        <button type="button" className="link" onClick={() => switchMode(isLogin ? "register" : "login")}>
          {isLogin ? "Create a guest account" : "Sign in"}
        </button>
      </p>

      {!isLogin && (
        <p className="small muted" style={{ textAlign: "center", marginTop: 10 }}>
          Staff accounts are created by a hotel administrator.
        </p>
      )}
    </AuthLayout>
  );
}
