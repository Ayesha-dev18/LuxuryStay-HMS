import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BellRing,
  CalendarCheck,
  Mail,
  MessageSquareText,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

import { api } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { useClickOutside } from "../../lib/hooks";
import { EmptyState } from "../ui/kit";

const NOTE_ICONS = {
  booking: CalendarCheck,
  payment: Receipt,
  housekeeping: Sparkles,
  maintenance: Wrench,
  feedback: MessageSquareText,
  contact: Mail,
  account: ShieldCheck,
};

export default function Notifications({ home, isGuest }) {
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ notifications: [], unread: 0, failed: false });

  const load = useCallback(async () => {
    try {
      const data = await api.get("/notifications");
      setState({ notifications: data.notifications, unread: data.unread, failed: false });
    } catch {
      setState((current) => ({ ...current, failed: true }));
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [load]);

  useClickOutside(wrapRef, () => setOpen(false), open);

  const linkFor = (note) => {
    if (isGuest) return "/guest/my-bookings";
    const map = {
      booking: `${home}/bookings?open=${note.entityId}`,
      room: `${home}/housekeeping`,
      maintenance: `${home}/maintenance`,
      feedback: `${home}/feedback`,
      contact: `${home}/enquiries`,
    };
    return map[note.entity] || home;
  };

  const openNote = async (note) => {
    setOpen(false);
    if (!note.read) {
      setState((current) => ({
        ...current,
        unread: Math.max(current.unread - 1, 0),
        notifications: current.notifications.map((item) =>
          item.id === note.id ? { ...item, read: true } : item
        ),
      }));
      api.patch(`/notifications/${note.id}/read`).catch(() => load());
    }
    navigate(linkFor(note));
  };

  const markAll = async () => {
    try {
      await api.patch("/notifications/read-all");
      await load();
    } catch {
      setState((current) => ({ ...current, failed: true }));
    }
  };

  return (
    <div className="popover-wrap" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Notifications${state.unread ? `, ${state.unread} unread` : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) load();
        }}
      >
        {state.unread > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {state.unread > 0 && <span className="dot">{state.unread > 9 ? "9+" : state.unread}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="popover"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="popover-head">
              <strong>Notifications</strong>
              {state.unread > 0 && (
                <button type="button" className="link small" onClick={markAll}>
                  Mark all read
                </button>
              )}
            </div>
            <div className="popover-body">
              {state.failed && state.notifications.length === 0 ? (
                <EmptyState title="Notifications are unavailable" message="Please try again shortly." />
              ) : state.notifications.length === 0 ? (
                <EmptyState icon={Bell} title="You are all caught up" message="New activity will appear here." />
              ) : (
                state.notifications.map((note) => {
                  const Icon = NOTE_ICONS[note.type] || Bell;
                  return (
                    <button
                      type="button"
                      key={note.id}
                      className={`note-item ${note.read ? "" : "unread"}`}
                      onClick={() => openNote(note)}
                    >
                      <span className="note-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span>
                        <strong>{note.title}</strong>
                        <p>{note.message}</p>
                        <time dateTime={note.createdAt}>{timeAgo(note.createdAt)}</time>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
