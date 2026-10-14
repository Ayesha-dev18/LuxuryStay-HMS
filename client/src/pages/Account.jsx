import { useState } from "react";
import { KeyRound, LockKeyhole, Mail, Phone, Save, UserRound } from "lucide-react";

import { Alert, Avatar, Badge, Button, Card, PageHeader, PasswordField, TextField } from "../components/ui/kit";
import { useAuth, useToast } from "../context/AppContext";
import { api, session } from "../lib/api";
import { ROLE_LABELS, formatStayDate, rules, validate } from "../lib/format";

function ProfileForm() {
  const { user, applySession } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name, email: user.email, phone: user.phone || "" });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const dirty =
    form.name.trim() !== user.name || form.email.trim() !== user.email || form.phone.trim() !== (user.phone || "");

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const found = validate(form, { name: rules.accountName, email: rules.email, phone: rules.optionalPhone });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setMessage("");
    try {
      const data = await api.put("/auth/me", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      });
      applySession(data);
      setForm({ name: data.user.name, email: data.user.email, phone: data.user.phone || "" });
      toast.success(data.message);
    } catch (error) {
      setErrors(error.fields || {});
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Personal details" description="Used on reservations and to contact you">
      <form className="stack" onSubmit={submit} noValidate>
        <Alert type="error">{message}</Alert>
        <TextField label="Full name" icon={UserRound} required maxLength={80} autoComplete="name" value={form.name} onChange={update("name")} error={errors.name} />
        <TextField label="Email address" type="email" icon={Mail} required maxLength={254} autoComplete="email" value={form.email} onChange={update("email")} error={errors.email} hint="You sign in with this address." />
        <TextField label="Phone number" type="tel" icon={Phone} maxLength={20} autoComplete="tel" value={form.phone} onChange={update("phone")} error={errors.phone} hint="Optional" />
        <div className="form-actions" style={{ marginTop: 4 }}>
          <Button type="submit" icon={Save} loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

const EMPTY_PASSWORD = { currentPassword: "", newPassword: "", confirmPassword: "" };

function PasswordForm() {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_PASSWORD);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const found = validate(form, {
      currentPassword: rules.required("Current password"),
      newPassword: rules.password,
      confirmPassword: (value, all) => (value === all.newPassword ? "" : "Passwords do not match."),
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setMessage("");
    try {
      const data = await api.put("/auth/change-password", form);
      // Other devices are signed out; this one continues on the new token.
      session.save(data.token);
      setForm(EMPTY_PASSWORD);
      toast.success(`${data.message} Other devices have been signed out.`);
    } catch (error) {
      setErrors(error.fields || {});
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Password" description="Changing it signs you out on every other device">
      <form className="stack" onSubmit={submit} noValidate>
        <Alert type="error">{message}</Alert>
        <PasswordField label="Current password" icon={LockKeyhole} required autoComplete="current-password" maxLength={200} value={form.currentPassword} onChange={update("currentPassword")} error={errors.currentPassword} />
        <PasswordField label="New password" icon={KeyRound} required autoComplete="new-password" maxLength={72} value={form.newPassword} onChange={update("newPassword")} error={errors.newPassword} hint="At least 8 characters, with a letter and a number." />
        <PasswordField label="Confirm new password" icon={KeyRound} required autoComplete="new-password" maxLength={72} value={form.confirmPassword} onChange={update("confirmPassword")} error={errors.confirmPassword} />
        <div className="form-actions" style={{ marginTop: 4 }}>
          <Button type="submit" loading={saving}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function Account() {
  const { user } = useAuth();

  return (
    <>
      <PageHeader eyebrow="Account" title="Profile" description="Your details and sign-in security." />

      <section className="card card-pad row" style={{ marginBottom: 18, gap: 16 }}>
        <Avatar name={user.name} large />
        <div className="grow">
          <strong style={{ fontSize: 16 }}>{user.name}</strong>
          <div className="small muted" style={{ overflowWrap: "anywhere" }}>
            {user.email}
            {user.createdAt ? ` · member since ${formatStayDate(user.createdAt)}` : ""}
          </div>
        </div>
        <Badge plain tone="accent">
          {ROLE_LABELS[user.role] || user.role}
        </Badge>
      </section>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <ProfileForm />
        <PasswordForm />
      </div>
    </>
  );
}
