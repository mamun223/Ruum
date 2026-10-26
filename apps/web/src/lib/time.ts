export const EASTERN = "America/New_York";

const parts = (iso: string, timeZone: string) => {
  const d = new Date(iso);
  return {
    time: d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" }),
    date: d.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }),
    zone:
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
        .formatToParts(d)
        .find((p) => p.type === "timeZoneName")?.value ?? "",
  };
};

/** Time at the match location, e.g. { time: "2:30 PM", date: "Sat, Oct 24", zone: "GMT+9" } */
export const localTime = (iso: string, timeZone: string) => parts(iso, timeZone);

/** Same instant in US Eastern Time (EDT/EST handled by the zone) */
export const easternTime = (iso: string) => parts(iso, EASTERN);

/** "Today" / "Tomorrow" / "Sun, Oct 26" for a location-local date */
export function dayLabel(dayOffset: number, localDate: string): string {
  if (dayOffset === 0) return "Today";
  if (dayOffset === 1) return "Tomorrow";
  if (dayOffset === -1) return "Yesterday";
  return new Date(`${localDate}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Split "6-3 7-6(5)" into per-player set games: [["6","7"], ["3","6"]] with tiebreak marks */
export function splitScore(score: string | null): [string[], string[]] {
  const p1: string[] = [];
  const p2: string[] = [];
  for (const set of (score ?? "").trim().split(/[\s,]+/).filter(Boolean)) {
    const m = set.match(/^(\d+)-(\d+)(?:\((\d+)\))?$/);
    if (!m) continue;
    const [, a, b, tb] = m;
    p1.push(tb && Number(a) < Number(b) ? `${a}⁽${tb}⁾` : a);
    p2.push(tb && Number(b) < Number(a) ? `${b}⁽${tb}⁾` : b);
  }
  return [p1, p2];
}
