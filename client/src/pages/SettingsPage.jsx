import { useEffect, useState } from "react";
import { Save } from "lucide-react";

import { Alert, Button, Card, DataState, PageHeader, Switch, TextField } from "../components/ui/kit";
import { useAuth, useToast } from "../context/AppContext";
import { api } from "../lib/api";
import { formatMoment, rules } from "../lib/format";
import { useLoad } from "../lib/hooks";

const FIELDS = [
  "hotelName",
  "address",
  "contactEmail",
  "contactPhone",
  "currencySymbol",
  "taxRate",
  "checkInTime",
  "checkOutTime",
  "maxStayNights",
  "allowCheckoutWithBalance",
  "instagramUrl",
  "facebookUrl",
  "linkedinUrl",
];

const LINKS = [
  { field: "instagramUrl", label: "Instagram" },
  { field: "facebookUrl", label: "Facebook" },
  { field: "linkedinUrl", label: "LinkedIn" },
];

const toForm = (settings) => ({
  ...Object.fromEntries(FIELDS.map((field) => [field, settings[field] ?? ""])),
  taxRate: String(settings.taxRate ?? 0),
  maxStayNights: String(settings.maxStayNights ?? 30),
  allowCheckoutWithBalance: Boolean(settings.allowCheckoutWithBalance),
});

export default function SettingsPage() {
  const { setSettings } = useAuth();
  const toast = useToast();

  // Always edited from the server's copy, not the cached one.
  const { data, loading, error, reload } = useLoad(() => api.get("/settings"), []);

  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.settings) setForm(toForm(data.settings));
  }, [data]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const saved = data?.settings ? toForm(data.settings) : null;
  const dirty = Boolean(form && saved && FIELDS.some((field) => form[field] !== saved[field]));

  const submit = async (event) => {
    event.preventDefault();

    const found = {};
    const taxRate = Number(form.taxRate);
    const maxStayNights = Number(form.maxStayNights);

    if (form.hotelName.trim().length < 2) found.hotelName = "Hotel name is required.";
    if (form.contactEmail.trim() && rules.email(form.contactEmail)) found.contactEmail = rules.email(form.contactEmail);
    if (rules.optionalPhone(form.contactPhone)) found.contactPhone = rules.optionalPhone(form.contactPhone);
    if (!form.currencySymbol.trim()) found.currencySymbol = "Currency symbol is required.";
    if (form.taxRate === "" || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 50) {
      found.taxRate = "Tax rate must be between 0 and 50.";
    }
    if (!Number.isInteger(maxStayNights) || maxStayNights < 1 || maxStayNights > 365) {
      found.maxStayNights = "Maximum stay must be a whole number from 1 to 365.";
    }

    for (const { field } of LINKS) {
      const link = form[field].trim();
      if (link && !/^https:\/\/\S{4,}$/.test(link)) found[field] = "Links must start with https://.";
    }

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setMessage("");
    try {
      const result = await api.put("/settings", {
        instagramUrl: form.instagramUrl.trim(),
        facebookUrl: form.facebookUrl.trim(),
        linkedinUrl: form.linkedinUrl.trim(),
        hotelName: form.hotelName.trim(),
        address: form.address.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        currencySymbol: form.currencySymbol.trim(),
        taxRate,
        checkInTime: form.checkInTime,
        checkOutTime: form.checkOutTime,
        maxStayNights,
        allowCheckoutWithBalance: form.allowCheckoutWithBalance,
      });
      // The whole app (prices, invoices, booking rules) reads these values.
      setSettings(result.settings);
      toast.success(result.message);
      reload({ silent: true });
    } catch (failure) {
      setErrors(failure.fields || {});
      setMessage(failure.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Hotel-wide configuration. Changes are saved on the server and apply to everyone immediately."
      >
        <Button type="submit" form="settings-form" icon={Save} loading={saving} disabled={!dirty}>
          Save settings
        </Button>
      </PageHeader>

      <DataState loading={loading || (!form && !error)} error={error} onRetry={reload}>
        {form && (
          <form id="settings-form" className="stack" onSubmit={submit} noValidate>
            <Alert type="error">{message}</Alert>

            <div className="grid grid-2">
              <Card title="Hotel details" description="Shown on the website, on invoices and across the product">
                <div className="stack">
                  <TextField label="Hotel name" required maxLength={80} value={form.hotelName} onChange={update("hotelName")} error={errors.hotelName} />
                  <TextField label="Address" maxLength={200} value={form.address} onChange={update("address")} error={errors.address} />
                  <div className="form-grid">
                    <TextField label="Contact email" type="email" maxLength={254} value={form.contactEmail} onChange={update("contactEmail")} error={errors.contactEmail} />
                    <TextField label="Contact phone" type="tel" maxLength={20} value={form.contactPhone} onChange={update("contactPhone")} error={errors.contactPhone} />
                  </div>
                </div>
              </Card>

              <Card title="Pricing and tax" description="Applied by the server when a reservation is created">
                <div className="stack">
                  <div className="form-grid">
                    <TextField label="Currency symbol" required maxLength={6} value={form.currencySymbol} onChange={update("currencySymbol")} error={errors.currencySymbol} />
                    <TextField label="Tax rate (%)" type="number" inputMode="decimal" min="0" max="50" step="0.01" required value={form.taxRate} onChange={update("taxRate")} error={errors.taxRate} />
                  </div>
                  <Alert type="info">
                    A new tax rate applies to reservations made from now on. Existing folios keep the rate
                    they were created with.
                  </Alert>
                </div>
              </Card>

              <Card title="Stay rules" description="Used when validating reservations">
                <div className="form-grid">
                  <TextField label="Check-in from" type="time" required value={form.checkInTime} onChange={update("checkInTime")} error={errors.checkInTime} />
                  <TextField label="Check-out by" type="time" required value={form.checkOutTime} onChange={update("checkOutTime")} error={errors.checkOutTime} />
                  <TextField className="span-2" label="Maximum nights per stay" type="number" min="1" max="365" step="1" required value={form.maxStayNights} onChange={update("maxStayNights")} error={errors.maxStayNights} />
                </div>
              </Card>

              <Card
                title="Website links"
                description="Shown in the website footer. Leave a field empty to hide that link."
              >
                <div className="stack">
                  {LINKS.map(({ field, label }) => (
                    <TextField
                      key={field}
                      label={label}
                      type="url"
                      inputMode="url"
                      maxLength={200}
                      placeholder="https://"
                      value={form[field]}
                      onChange={update(field)}
                      error={errors[field]}
                    />
                  ))}
                </div>
              </Card>

              <Card title="Check-out policy">
                <div className="row row-between" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                  <div>
                    <strong>Allow check-out with an unpaid balance</strong>
                    <p className="small muted" style={{ marginTop: 4 }}>
                      When off, the front desk must settle the folio before a guest can be checked out.
                    </p>
                  </div>
                  <Switch
                    checked={form.allowCheckoutWithBalance}
                    onChange={(value) => setForm((current) => ({ ...current, allowCheckoutWithBalance: value }))}
                    label="Allow check-out with an unpaid balance"
                  />
                </div>
              </Card>
            </div>

            {data?.settings?.updatedAt && (
              <p className="small muted">Last saved {formatMoment(data.settings.updatedAt)}.</p>
            )}
          </form>
        )}
      </DataState>
    </>
  );
}
