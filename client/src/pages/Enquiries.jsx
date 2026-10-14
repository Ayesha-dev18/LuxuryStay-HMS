import { useState } from "react";
import { CheckCircle2, Mail, MailOpen, Phone, RefreshCw } from "lucide-react";

import {
  Avatar,
  Badge,
  Button,
  DataState,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  Tabs,
} from "../components/ui/kit";
import { useToast } from "../context/AppContext";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import { useAction, useDebounced, useLoad } from "../lib/hooks";

const LIMIT = 10;

export default function Enquiries() {
  const toast = useToast();
  const { busy, run } = useAction();

  const [status, setStatus] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);

  const search = useDebounced(searchText.trim());

  const { data, loading, error, reload, refresh } = useLoad(
    () => api.get("/contact", { status, search, page, limit: LIMIT }),
    [status, search, page]
  );

  const enquiries = data?.enquiries || [];

  const setEnquiryStatus = (enquiry, next) =>
    run(`${enquiry._id}-${next}`, async () => {
      try {
        const result = await api.patch(`/contact/${enquiry._id}/status`, { status: next });
        toast.success(result.message);
      } catch (failure) {
        toast.error(failure.message);
      }
      refresh();
    });

  const tabs = [
    { value: "all", label: "All" },
    { value: "new", label: "New", count: data?.unread },
    { value: "read", label: "Read" },
    { value: "resolved", label: "Resolved" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Enquiries"
        description="Messages sent through the contact form on the hotel website."
      >
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
      </PageHeader>

      <section className="card">
        <div className="toolbar">
          <Tabs
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={tabs}
            label="Filter enquiries"
          />
          <SearchInput
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              setPage(1);
            }}
            placeholder="Name, email or message"
            label="Search enquiries"
          />
        </div>

        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          empty={enquiries.length === 0}
          emptyState={
            <EmptyState
              icon={Mail}
              title={search || status !== "all" ? "No enquiries match" : "No enquiries yet"}
              message="New messages from the website appear here."
            />
          }
        >
          <div className="list">
            {enquiries.map((enquiry) => (
              <article className="list-row" key={enquiry._id} style={{ alignItems: "flex-start" }}>
                <Avatar name={enquiry.name} large />
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}>
                    <strong style={{ display: "inline" }}>{enquiry.name}</strong>
                    <Badge plain tone="accent">
                      {enquiry.enquiryType}
                    </Badge>
                    <Badge status={enquiry.status} />
                  </div>
                  <span style={{ overflowWrap: "anywhere" }}>
                    {enquiry.email}
                    {enquiry.phone ? ` · ${enquiry.phone}` : ""} · {timeAgo(enquiry.createdAt)}
                  </span>
                  <p style={{ marginTop: 8, color: "var(--a-ink-2)", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                    {enquiry.message}
                  </p>
                  <div className="row" style={{ marginTop: 10 }}>
                    <a className="btn btn-secondary btn-sm" href={`mailto:${encodeURIComponent(enquiry.email)}`}>
                      <Mail size={15} aria-hidden="true" /> Reply by email
                    </a>
                    {enquiry.phone && (
                      <a className="btn btn-secondary btn-sm" href={`tel:${enquiry.phone.replace(/[^+\d]/g, "")}`}>
                        <Phone size={15} aria-hidden="true" /> Call
                      </a>
                    )}
                    {enquiry.status === "new" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={MailOpen}
                        loading={busy === `${enquiry._id}-read`}
                        disabled={Boolean(busy)}
                        onClick={() => setEnquiryStatus(enquiry, "read")}
                      >
                        Mark read
                      </Button>
                    )}
                    {enquiry.status !== "resolved" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={CheckCircle2}
                        loading={busy === `${enquiry._id}-resolved`}
                        disabled={Boolean(busy)}
                        onClick={() => setEnquiryStatus(enquiry, "resolved")}
                      >
                        Mark resolved
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={page} limit={LIMIT} total={data?.total || 0} onPage={setPage} />
        </DataState>
      </section>
    </>
  );
}
