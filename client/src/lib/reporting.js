import { ROOM_TONE_COLORS } from "./format";

// Shapes report data from the API for the chart components.

export const timelinePoints = (timeline, granularity, money) =>
  timeline.map((point) => {
    const date = new Date(`${point.key}${granularity === "month" ? "-01" : ""}T00:00:00Z`);
    const label =
      granularity === "month"
        ? date.toLocaleString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
        : date.toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    return {
      key: point.key,
      label,
      title: label,
      value: point.revenue,
      note: `${point.bookings} booking${point.bookings === 1 ? "" : "s"} · ${money(point.revenue)}`,
    };
  });

export const roomSegments = (summary) => [
  { label: "Occupied", value: summary.occupiedRooms, color: ROOM_TONE_COLORS.occupied },
  { label: "Available", value: summary.availableRooms, color: ROOM_TONE_COLORS.available },
  { label: "Reserved", value: summary.reservedRooms, color: ROOM_TONE_COLORS.reserved },
  { label: "Cleaning", value: summary.cleaningRooms, color: ROOM_TONE_COLORS.cleaning },
  { label: "Maintenance", value: summary.maintenanceRooms, color: ROOM_TONE_COLORS.maintenance },
];

export const dayGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
};
