import { useEffect, useState } from "react";
import { LockKeyhole, Mail, Pencil, Phone, RefreshCw, UserCog, UserPlus, UserRound } from "lucide-react";

import {
  Alert,
  Avatar,
  Badge,
  Button,
  DataState,
  EmptyState,
  Modal,
  PageHeader,
  Pagination,
  PasswordField,
  SearchInput,
  Switch,
  Tabs,
  TextField,
} from "../components/ui/kit";
import { useAuth, useToast } from "../context/AppContext";
import { api } from "../lib/api";
import { ROLE_LABELS, formatMoment, rules, validate } from "../lib/format";
import { useDebounced, useLoad } from "../lib/hooks";

const LIMIT = 20;

const ROLES = [
  { value: "receptionist", label: "Receptionist", note: "Reservations, check-in and check-out, payments." },
  { value: "housekeeping", label: "Housekeeping", note: "Cleaning queue and maintenance tasks." },
  { value: "manager", label: "Manager", note: "Everything operational, plus reports and room setup." },
  { value: "admin", label: "Administrator", note: "Full access, including staff accounts and settings." },
];

const TABS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Deactivated" },
];

function StaffDialog({ member, open, onClose, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const isSelf = member?.id === user.id;
  // Legacy "staff" accounts keep their role until an administrator picks a new one.
  const legacyRole = member && !ROLES.some((role) => role.value === member.role);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setMessage("");
    setForm({
      name: member?.name || "",
      email: member?.email || "",
      phone: member?.phone || "",
      role: member?.role || "receptionist",
      isActive: member ? member.isActive : true,
      password: "",
    });
  }, [open, member]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();

    const found = validate(form, {
      name: rules.accountName,
      email: rules.email,
      phone: rules.optionalPhone,
      ...(member && !form.password ? {} : { password: rules.password }),
    });

    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setMessage("");

    try {
      let data;

      if (member) {
        const changes = {};
        if (form.name.trim() !== member.name) changes.name = form.name.trim();
        if (form.email.trim().toLowerCase() !== member.email) changes.email = form.email.trim();
        if ((form.phone || "").trim() !== (member.phone || "")) changes.phone = form.phone.trim();
        if (!isSelf && form.role !== member.role) changes.role = form.role;
        if (!isSelf && form.isActive !== member.isActive) changes.isActive = form.isActive;
        if (!isSelf && form.password) changes.password = form.password;

        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }

        data = await api.patch(`/users/${member.id}`, changes);
      } else {
        data = await api.post("/users/staff", {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          role: form.role,
          password: form.password,
        });
      }

      toast.success(data.message);
      onSaved();
      onClose();
    } catch (error) {
      setErrors(error.fields || {});
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const roleNote = ROLES.find((role) => role.value === form.role)?.note;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="wide"
      title={member ? `Edit ${member.name}` : "Add a staff member"}
      description={
        member
          ? "Changing the role, status or password signs this person out everywhere."
          : "The role decides what this person can see and do. It is enforced on the server."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="staff-form" loading={saving}>
            {member ? "Save changes" : "Create account"}
          </Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={submit} noValidate>
        <div style={{ marginBottom: message ? 16 : 0 }}>
          <Alert type="error">{message}</Alert>
        </div>
        <div className="form-grid">
          <TextField label="Full name" icon={UserRound} required maxLength={80} value={form.name || ""} onChange={update("name")} error={errors.name} />
          <TextField label="Email address" type="email" icon={Mail} required maxLength={254} value={form.email || ""} onChange={update("email")} error={errors.email} />
          <TextField label="Phone number" type="tel" icon={Phone} maxLength={20} value={form.phone || ""} onChange={update("phone")} error={errors.phone} hint="Optional" />
          <TextField
            as="select"
            label="Role"
            disabled={isSelf}
            value={form.role || "receptionist"}
            onChange={update("role")}
            error={errors.role}
            hint={isSelf ? "You cannot change your own role." : roleNote}
          >
            {legacyRole && <option value={member.role}>{ROLE_LABELS[member.role] || member.role} (legacy)</option>}
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </TextField>
          {!isSelf && (
            <PasswordField
              className="span-2"
              label={member ? "Set a new password" : "Temporary password"}
              icon={LockKeyhole}
              required={!member}
              autoComplete="new-password"
              maxLength={72}
              value={form.password || ""}
              onChange={update("password")}
              error={errors.password}
              hint={
                member
                  ? "Leave blank to keep the current password."
                  : "At least 8 characters with a letter and a number. Ask them to change it after signing in."
              }
            />
          )}
          {member && !isSelf && (
            <div className="span-2 row row-between card card-pad" style={{ boxShadow: "none" }}>
              <div>
                <strong>Account active</strong>
                <div className="small muted">Deactivated staff cannot sign in. Their history is kept.</div>
              </div>
              <Switch
                checked={Boolean(form.isActive)}
                onChange={(value) => setForm((current) => ({ ...current, isActive: value }))}
                label="Account active"
              />
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default function StaffAccounts() {
  const { can, user } = useAuth();

  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(undefined);

  const search = useDebounced(searchText.trim());
  const manage = can("staff:manage");

  const { data, loading, error, reload, refresh } = useLoad(
    () => api.get("/users/staff", { status, role, search, page, limit: LIMIT }),
    [status, role, search, page]
  );

  const members = data?.users || [];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Staff"
        description={
          manage
            ? "Create accounts, assign roles and deactivate people who have left."
            : "The hotel team and their roles. Only administrators can change accounts."
        }
      >
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
        {manage && (
          <Button icon={UserPlus} onClick={() => setEditing(null)}>
            Add staff member
          </Button>
        )}
      </PageHeader>

      <section className="card">
        <div className="toolbar">
          <Tabs
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={TABS}
            label="Filter staff"
          />
          <select
            className="select"
            style={{ width: "auto", minHeight: 40 }}
            aria-label="Filter by role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All roles</option>
            {[...ROLES].reverse().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <SearchInput
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              setPage(1);
            }}
            placeholder="Name, email or phone"
            label="Search staff"
          />
        </div>

        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          empty={members.length === 0}
          emptyState={<EmptyState icon={UserCog} title="No staff accounts match" />}
        >
          <div className="table-wrap">
            <table className="table stack-sm">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Last sign-in</th>
                  <th>Status</th>
                  {manage && <th className="right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="primary">
                      <div className="cell-main">
                        <Avatar name={member.name} />
                        <div>
                          <strong>
                            {member.name}
                            {member.id === user.id ? " (you)" : ""}
                          </strong>
                          <span style={{ overflowWrap: "anywhere" }}>{member.email}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Role">
                      <Badge plain tone={member.role === "admin" ? "accent" : "info"}>
                        {ROLE_LABELS[member.role] || member.role}
                      </Badge>
                    </td>
                    <td data-label="Phone">{member.phone || "—"}</td>
                    <td data-label="Last sign-in">
                      {member.lastLoginAt ? formatMoment(member.lastLoginAt) : "Never"}
                    </td>
                    <td data-label="Status">
                      <Badge status={member.isActive ? "active" : "inactive"}>
                        {member.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </td>
                    {manage && (
                      <td className="right actions">
                        <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(member)}>
                          Edit
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={LIMIT} total={data?.total || 0} onPage={setPage} />
        </DataState>
      </section>

      {manage && (
        <StaffDialog
          member={editing}
          open={editing !== undefined}
          onClose={() => setEditing(undefined)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
