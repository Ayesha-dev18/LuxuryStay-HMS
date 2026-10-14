import { useState } from "react";
import { CheckCircle2, MessageSquareText, RefreshCw, Star, ThumbsUp } from "lucide-react";

import { BarList } from "../components/ui/charts";
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataState,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  SkeletonStats,
  Stars,
  StatCard,
  Tabs,
} from "../components/ui/kit";
import { useToast } from "../context/AppContext";
import { api } from "../lib/api";
import { formatStayShort, timeAgo } from "../lib/format";
import { useAction, useDebounced, useLoad } from "../lib/hooks";

const LIMIT = 10;

const TABS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewed", label: "Reviewed" },
];

export default function Feedback() {
  const toast = useToast();
  const { busy, run } = useAction();

  const [status, setStatus] = useState("all");
  const [rating, setRating] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);

  const search = useDebounced(searchText.trim());

  const { data, loading, error, reload, refresh } = useLoad(
    () => api.get("/feedback", { status, rating, search, page, limit: LIMIT }),
    [status, rating, search, page]
  );

  const items = data?.feedback || [];
  const summary = data?.summary;

  const markReviewed = (item) =>
    run(item._id, async () => {
      try {
        const result = await api.patch(`/feedback/${item._id}/review`);
        toast.success(result.message);
      } catch (failure) {
        toast.error(failure.message);
      }
      refresh();
    });

  const reset = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Guest feedback"
        description="Reviews left by guests after check-out."
      >
        <Button variant="secondary" icon={RefreshCw} onClick={() => reload()} disabled={loading}>
          Refresh
        </Button>
      </PageHeader>

      {summary ? (
        <div className="grid grid-main" style={{ marginBottom: 18 }}>
          <div className="stats" style={{ marginBottom: 0 }}>
            <StatCard feature label="Average rating" value={summary.totalFeedback ? `${summary.averageRating} / 5` : "—"} hint={`${summary.totalFeedback} review${summary.totalFeedback === 1 ? "" : "s"}`} icon={Star} />
            <StatCard label="Five-star stays" value={summary.fiveStar} hint="Rated 5 out of 5" icon={ThumbsUp} />
            <StatCard label="Awaiting review" value={summary.newFeedback} hint={`${summary.reviewed} reviewed`} icon={MessageSquareText} />
          </div>
          <Card title="Rating breakdown">
            <BarList
              color="var(--a-series-4)"
              items={data.ratingBreakdown.map((row) => ({
                label: `${row.rating} star${row.rating === 1 ? "" : "s"}`,
                value: row.count,
              }))}
            />
          </Card>
        </div>
      ) : (
        loading && <SkeletonStats count={3} />
      )}

      <section className="card">
        <div className="toolbar">
          <Tabs value={status} onChange={reset(setStatus)} options={TABS} label="Filter by status" />
          <select
            className="select"
            style={{ width: "auto", minHeight: 40 }}
            aria-label="Filter by rating"
            value={rating}
            onChange={(event) => reset(setRating)(event.target.value)}
          >
            <option value="all">All ratings</option>
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} star{value === 1 ? "" : "s"}
              </option>
            ))}
          </select>
          <SearchInput value={searchText} onChange={reset(setSearchText)} placeholder="Search review text" />
        </div>

        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          empty={items.length === 0}
          emptyState={
            <EmptyState
              icon={MessageSquareText}
              title={summary?.totalFeedback ? "No reviews match these filters" : "No reviews yet"}
              message="Guests can leave a review from their bookings once they have checked out."
            />
          }
        >
          <div className="list">
            {items.map((item) => (
              <article className="list-row" key={item._id} style={{ alignItems: "flex-start" }}>
                <Avatar name={item.guest?.name || "Guest"} large />
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}>
                    <strong style={{ display: "inline" }}>{item.guest?.name || "Guest"}</strong>
                    <Stars value={item.rating} />
                    <Badge status={item.status} />
                  </div>
                  <span>
                    Room {item.room?.roomNumber || "N/A"}
                    {item.booking
                      ? ` · ${formatStayShort(item.booking.checkInDate)} – ${formatStayShort(item.booking.checkOutDate)}`
                      : ""}{" "}
                    · {timeAgo(item.createdAt)}
                  </span>
                  {item.title && <strong style={{ marginTop: 8 }}>{item.title}</strong>}
                  <p style={{ marginTop: 4, color: "var(--a-ink-2)", overflowWrap: "anywhere" }}>{item.message}</p>
                  {(item.cleanlinessRating || item.serviceRating || item.roomRating) && (
                    <div className="chips" style={{ marginTop: 8 }}>
                      {item.cleanlinessRating && <span className="chip">Cleanliness {item.cleanlinessRating}/5</span>}
                      {item.serviceRating && <span className="chip">Service {item.serviceRating}/5</span>}
                      {item.roomRating && <span className="chip">Room {item.roomRating}/5</span>}
                    </div>
                  )}
                </div>
                {item.status === "new" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={CheckCircle2}
                    loading={busy === item._id}
                    disabled={Boolean(busy)}
                    onClick={() => markReviewed(item)}
                  >
                    Mark reviewed
                  </Button>
                )}
              </article>
            ))}
          </div>
          <Pagination page={page} limit={LIMIT} total={data?.total || 0} onPage={setPage} />
        </DataState>
      </section>
    </>
  );
}
