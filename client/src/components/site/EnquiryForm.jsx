import { useEffect, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

import { api } from "../../lib/api";
import { rules, validate } from "../../lib/format";
import { Alert, Button, TextField } from "../ui/kit";

// The enquiry types the API accepts.
export const ENQUIRY_TYPES = [
  "Room Reservation",
  "Dining",
  "Spa & Wellness",
  "Private Transfer",
  "General Enquiry",
];

const EMPTY = { name: "", email: "", phone: "", enquiryType: "", message: "" };

// Sends a message to the front desk. `topic` preselects the enquiry type when
// the visitor arrives from one of the experiences.
export default function EnquiryForm({ topic = "" }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState("");
  const [sent, setSent] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (topic) setForm((current) => ({ ...current, enquiryType: topic }));
  }, [topic]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const found = validate(form, {
      name: rules.name,
      email: rules.email,
      phone: rules.optionalPhone,
      enquiryType: rules.required("Enquiry type"),
      message: (value) =>
        String(value).trim().length >= 10 ? "" : "Please write at least a sentence so we can help.",
    });

    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFailure("Please correct the highlighted fields.");
      return;
    }

    setSending(true);
    setFailure("");

    try {
      const data = await api.post("/contact", {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        enquiryType: form.enquiryType,
        message: form.message.trim(),
      });
      setSent(data.message);
      setForm(EMPTY);
    } catch (error) {
      setErrors(error.fields || {});
      setFailure(error.message);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="s-form s-form-done" role="status">
        <CheckCircle2 size={32} color="var(--a-success)" aria-hidden="true" />
        <h3 style={{ margin: 0 }}>Thank you. Your message is with the front desk.</h3>
        <p className="s-lede">{sent} We reply by email to the address you gave.</p>
        <Button variant="secondary" onClick={() => setSent("")}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <div className="s-form">
      <h3>Send an enquiry</h3>
      <form onSubmit={submit} noValidate>
        <Alert type="error">{failure}</Alert>

        <div className="form-grid">
          <TextField
            label="Your name"
            required
            maxLength={80}
            autoComplete="name"
            value={form.name}
            onChange={update("name")}
            error={errors.name}
          />
          <TextField
            label="Email address"
            type="email"
            inputMode="email"
            required
            maxLength={254}
            autoComplete="email"
            value={form.email}
            onChange={update("email")}
            error={errors.email}
          />
          <TextField
            label="Phone"
            type="tel"
            maxLength={20}
            autoComplete="tel"
            value={form.phone}
            onChange={update("phone")}
            error={errors.phone}
            hint="Optional"
          />
          <TextField
            as="select"
            label="What is it about?"
            required
            value={form.enquiryType}
            onChange={update("enquiryType")}
            error={errors.enquiryType}
          >
            <option value="" disabled>
              Choose a topic
            </option>
            {ENQUIRY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </TextField>
        </div>

        <TextField
          as="textarea"
          label="Your message"
          required
          rows={5}
          maxLength={1500}
          value={form.message}
          onChange={update("message")}
          error={errors.message}
          hint={`${form.message.length} / 1500`}
        />

        <Button type="submit" variant="primary" size="lg" icon={Send} loading={sending}>
          Send enquiry
        </Button>
      </form>
    </div>
  );
}
