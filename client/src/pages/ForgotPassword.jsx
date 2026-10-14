import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Mail, MailCheck } from "lucide-react";

import AuthLayout from "../components/app/AuthLayout";
import { Alert, Button, TextField } from "../components/ui/kit";
import { api } from "../lib/api";
import { rules } from "../lib/format";

export default function ForgotPassword() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || "");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Reset password · LuxuryStay";
  }, []);

  const submit = async (event) => {
    event.preventDefault();

    const problem = rules.email(email);
    if (problem) return setError(problem);

    setSubmitting(true);
    setError("");
    try {
      const data = await api.post("/auth/forgot-password", { email: email.trim() });
      setSent(data.message);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSubmitting(false);
    }
    return undefined;
  };

  if (sent) {
    return (
      <AuthLayout>
        <div className="state-icon" aria-hidden="true" style={{ marginBottom: 18 }}>
          <MailCheck size={24} />
        </div>
        <h2>Check your inbox</h2>
        <p>{sent}</p>
        <div className="stack" style={{ gap: 12 }}>
          <Alert type="info">
            The link works once and expires after a short time. If nothing arrives in a few minutes,
            check your spam folder.
          </Alert>
          <Link to="/auth" className="btn btn-primary btn-lg btn-block">
            Back to sign in
          </Link>
          <button type="button" className="link" onClick={() => setSent("")}>
            Use a different email address
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2>Forgot your password?</h2>
      <p>Enter the email address on your account and we will send you a link to choose a new one.</p>

      <form onSubmit={submit} noValidate>
        <Alert type="error">{error}</Alert>
        <TextField
          label="Email address"
          type="email"
          icon={Mail}
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError("");
          }}
        />
        <Button type="submit" size="lg" block loading={submitting}>
          Send reset link
        </Button>
      </form>

      <p className="auth-switch">
        Remembered it?{" "}
        <Link to="/auth" className="link">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
