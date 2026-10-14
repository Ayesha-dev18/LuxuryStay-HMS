import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LinkIcon, LockKeyhole } from "lucide-react";

import AuthLayout from "../components/app/AuthLayout";
import { Alert, Button, PasswordField, Skeleton } from "../components/ui/kit";
import { api, session } from "../lib/api";
import { rules } from "../lib/format";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // The token is read once and then removed from the address bar, so it does
  // not stay in browser history or get sent anywhere as a referrer.
  const [token] = useState(() => params.get("token") || "");
  const [status, setStatus] = useState("checking");
  const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Choose a new password · LuxuryStay";
    window.history.replaceState(window.history.state, "", "/reset-password");

    if (!/^[a-f0-9]{64}$/.test(token)) {
      setStatus("invalid");
      return undefined;
    }

    let cancelled = false;
    api
      .post("/auth/reset-password/validate", { token })
      .then(() => !cancelled && setStatus("ready"))
      .catch((error) => {
        if (cancelled) return;
        setMessage(error.message);
        setStatus(error.status === 400 ? "invalid" : "error");
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();

    const found = {};
    const weak = rules.password(form.newPassword);
    if (weak) found.newPassword = weak;
    if (form.confirmPassword !== form.newPassword) found.confirmPassword = "Passwords do not match.";

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setMessage("");
    try {
      const data = await api.post("/auth/reset-password", { token, ...form });
      // Any session on this device belonged to the old password.
      session.clear();
      navigate("/auth", { replace: true, state: { notice: { type: "success", text: data.message } } });
    } catch (error) {
      setErrors(error.fields || {});
      setMessage(error.message);
      if (error.status === 400 && !error.errors?.length) setStatus("invalid");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "checking") {
    return (
      <AuthLayout>
        <div className="stack" aria-busy="true" aria-label="Checking your link">
          <Skeleton width="70%" height={34} />
          <Skeleton width="90%" />
          <Skeleton height={42} />
          <Skeleton height={42} />
        </div>
      </AuthLayout>
    );
  }

  if (status !== "ready") {
    return (
      <AuthLayout>
        <div className="state-icon" aria-hidden="true" style={{ marginBottom: 18 }}>
          <LinkIcon size={24} />
        </div>
        <h2>{status === "invalid" ? "This link has expired" : "We could not check this link"}</h2>
        <p>
          {status === "invalid"
            ? "Password reset links work once and expire after a short time. Request a new one to continue."
            : message || "Please try again in a moment."}
        </p>
        <div className="stack" style={{ gap: 12 }}>
          <Link to="/forgot-password" className="btn btn-primary btn-lg btn-block">
            Request a new link
          </Link>
          <Link to="/auth" className="link" style={{ textAlign: "center" }}>
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2>Choose a new password</h2>
      <p>You will be signed out on every device and can sign in again with the new password.</p>

      <form onSubmit={submit} noValidate>
        <Alert type="error">{message}</Alert>
        <PasswordField
          label="New password"
          icon={LockKeyhole}
          autoComplete="new-password"
          required
          maxLength={72}
          value={form.newPassword}
          onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
          error={errors.newPassword}
          hint="At least 8 characters, with a letter and a number."
        />
        <PasswordField
          label="Confirm new password"
          icon={LockKeyhole}
          autoComplete="new-password"
          required
          maxLength={72}
          value={form.confirmPassword}
          onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
          error={errors.confirmPassword}
        />
        <Button type="submit" size="lg" block loading={submitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
