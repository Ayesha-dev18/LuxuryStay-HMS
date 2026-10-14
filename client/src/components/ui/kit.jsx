import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Eye,
  EyeOff,
  Inbox,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";

import { TONES, titleCase } from "../../lib/format";

/* ---------- Buttons ---------- */

export function Button({
  variant = "primary",
  size,
  block,
  loading,
  icon: Icon,
  children,
  className = "",
  type = "button",
  disabled,
  ...rest
}) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size ? `btn-${size}` : "",
    block ? "btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? (
        <span className="spinner" aria-hidden="true" />
      ) : (
        Icon && <Icon size={size === "sm" ? 15 : 17} aria-hidden="true" />
      )}
      {children}
    </button>
  );
}

export function IconButton({ label, icon: Icon, className = "", size = 18, ...rest }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...rest}>
      <Icon size={size} aria-hidden="true" />
    </button>
  );
}

/* ---------- Layout pieces ---------- */

export function PageHeader({ eyebrow, title, description, children }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}

export function Card({ title, description, actions, children, className = "", flush = false }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {flush ? children : <div className="card-body">{children}</div>}
    </section>
  );
}

export function StatCard({ label, value, hint, icon: Icon, feature = false }) {
  return (
    <div className={`stat ${feature ? "feature" : ""}`}>
      <div className="stat-label">
        {Icon && <Icon size={14} aria-hidden="true" />}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Badge({ status, tone, children, plain = false }) {
  const resolved = tone ?? TONES[status] ?? "";
  return (
    <span className={`badge ${resolved} ${plain ? "plain" : ""}`}>
      {children ?? titleCase(status)}
    </span>
  );
}

export function Avatar({ name = "", large = false }) {
  const letters =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "?";

  return (
    <span className={`avatar ${large ? "lg" : ""}`} aria-hidden="true">
      {letters}
    </span>
  );
}

/* ---------- States ---------- */

export function EmptyState({ icon: Icon = Inbox, title, message, children }) {
  return (
    <div className="state">
      <div className="state-icon" aria-hidden="true">
        <Icon size={24} />
      </div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state error" role="alert">
      <div className="state-icon" aria-hidden="true">
        <CircleAlert size={24} />
      </div>
      <h3>We could not load this</h3>
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" icon={RefreshCw} onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 14, radius, style }) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="stack" style={{ padding: 20, gap: 16 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div className="row" key={index} style={{ flexWrap: "nowrap", gap: 14 }}>
          <Skeleton width={38} height={38} radius={10} />
          <div className="grow stack" style={{ gap: 8 }}>
            <Skeleton width={`${62 - index * 6}%`} />
            <Skeleton width="34%" height={10} />
          </div>
          <Skeleton width={70} height={22} radius={999} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div className="stats" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <div className="stat" key={index}>
          <Skeleton width="55%" height={10} />
          <Skeleton width="60%" height={34} />
          <Skeleton width="70%" height={10} />
        </div>
      ))}
    </div>
  );
}

// Renders exactly one of: loading, error, empty or the content.
export function DataState({ loading, error, empty, onRetry, skeleton, emptyState, children }) {
  if (loading) return skeleton ?? <SkeletonRows />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (empty) return emptyState ?? <EmptyState title="Nothing here yet" />;
  return children;
}

export function Alert({ type = "info", children }) {
  if (!children) return null;
  return (
    <div className={`alert ${type}`} role={type === "error" ? "alert" : "status"}>
      <CircleAlert size={17} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/* ---------- Form controls ---------- */

export function Field({ label, error, hint, required, children, className = "", htmlFor }) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <span className="field-error" id={htmlFor ? `${htmlFor}-error` : undefined} role="alert">
          <CircleAlert size={13} aria-hidden="true" />
          {error}
        </span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  );
}

// Label, control and error message wired together for assistive technology.
export function TextField({
  label,
  error,
  hint,
  required,
  icon: Icon,
  className = "",
  as = "input",
  children,
  ...rest
}) {
  const id = useId();
  const Control = as;
  const controlClass = as === "select" ? "select" : as === "textarea" ? "textarea" : "input";

  const control = (
    <Control
      id={id}
      className={controlClass}
      required={required}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...rest}
    >
      {children}
    </Control>
  );

  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={id}>
      {Icon ? (
        <div className="input-wrap">
          <Icon size={16} aria-hidden="true" />
          {control}
        </div>
      ) : (
        control
      )}
    </Field>
  );
}

export function PasswordField({ label, error, hint, required, icon: Icon, className = "", ...rest }) {
  const id = useId();
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} error={error} hint={hint} required={required} className={className} htmlFor={id}>
      <div className="input-wrap">
        {Icon && <Icon size={16} aria-hidden="true" />}
        <input
          id={id}
          className="input has-action"
          style={Icon ? undefined : { paddingLeft: 12 }}
          type={visible ? "text" : "password"}
          required={required}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...rest}
        />
        <button
          type="button"
          className="input-action"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </Field>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search", label }) {
  return (
    <div className="search">
      <Search size={16} aria-hidden="true" />
      <input
        className="input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
        maxLength={80}
      />
    </div>
  );
}

export function Tabs({ value, onChange, options, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={`tab ${value === option.value ? "active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className="count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Pagination({ page, limit, total, onPage }) {
  const pages = Math.max(Math.ceil(total / limit), 1);
  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="table-foot">
      <span>
        Showing {first}–{last} of {total}
      </span>
      <div className="pager">
        <Button
          variant="secondary"
          size="sm"
          icon={ChevronLeft}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <span className="num">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight size={15} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function Stars({ value = 0, size = 15 }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={star <= value ? "" : "off"}
          fill={star <= value ? "currentColor" : "none"}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function StarInput({ value, onChange, label }) {
  return (
    <div className="star-input row" role="radiogroup" aria-label={label} style={{ gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          className={star <= value ? "on" : ""}
          onClick={() => onChange(star === value ? 0 : star)}
        >
          <Star size={24} fill={star <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

/* ---------- Modal ---------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let openDialogs = 0;

function Dialog({ onClose, title, description, size, drawer, children, footer, busy, labelId }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);

  useEffect(() => {
    closeRef.current = onClose;
    busyRef.current = busy;
  });

  useEffect(() => {
    const previous = document.activeElement;
    const panel = panelRef.current;

    openDialogs += 1;
    document.body.style.overflow = "hidden";

    // Focus moves into the dialog: the first field if there is one, otherwise
    // the dialog itself.
    const target =
      panel.querySelector("[data-autofocus]") ||
      panel.querySelector(".modal-body input, .modal-body select, .modal-body textarea") ||
      panel;
    target.focus({ preventScroll: true });

    const onKey = (event) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.stopPropagation();
        closeRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      openDialogs -= 1;
      if (openDialogs === 0) document.body.style.overflow = "";
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <motion.div
      className={`app-overlay ${drawer ? "drawer" : ""}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <motion.div
        ref={panelRef}
        className={`modal ${size || ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        tabIndex={-1}
        initial={drawer ? { x: 40, opacity: 0 } : { y: 24, opacity: 0, scale: 0.96, rotateX: 8 }}
        animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotateX: 0 }}
        style={{ transformPerspective: 1200 }}
        exit={drawer ? { x: 40, opacity: 0 } : { y: 12, opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="modal-head no-print">
          <div>
            <h2 id={labelId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="Close" icon={X} onClick={onClose} disabled={busy} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot no-print">{footer}</div>}
      </motion.div>
    </motion.div>
  );
}

export function Modal({ open, ...props }) {
  const labelId = useId();

  return createPortal(
    <AnimatePresence>{open && <Dialog key="dialog" labelId={labelId} {...props} />}</AnimatePresence>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "primary",
  busy,
  onConfirm,
  onClose,
  children,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p style={{ color: "var(--a-ink-2)" }}>{message}</p>
      {children}
    </Modal>
  );
}
