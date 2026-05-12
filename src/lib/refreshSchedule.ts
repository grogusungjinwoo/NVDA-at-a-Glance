const NEW_YORK_TIME_ZONE = "America/New_York";
const REFRESH_HOUR = 20;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getZonedParts(date: Date, timeZone = NEW_YORK_TIME_ZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

function zonedTimeToUtc(parts: Pick<ZonedParts, "year" | "month" | "day" | "hour" | "minute" | "second">, timeZone = NEW_YORK_TIME_ZONE): Date {
  const desiredAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let estimate = desiredAsUtc;

  for (let index = 0; index < 2; index += 1) {
    const actual = getZonedParts(new Date(estimate), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    estimate += desiredAsUtc - actualAsUtc;
  }

  return new Date(estimate);
}

function addLocalDays(parts: ZonedParts, days: number): ZonedParts {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  const [year, month, day] = next.toISOString().slice(0, 10).split("-").map(Number);

  return { ...parts, year, month, day };
}

export function getNextRefreshTime(now = new Date()): Date {
  const current = getZonedParts(now);
  let refreshDay = current;
  let candidate = zonedTimeToUtc({ ...refreshDay, hour: REFRESH_HOUR, minute: 0, second: 0 });

  if (now.getTime() >= candidate.getTime()) {
    refreshDay = addLocalDays(current, 1);
    candidate = zonedTimeToUtc({ ...refreshDay, hour: REFRESH_HOUR, minute: 0, second: 0 });
  }

  return candidate;
}

export function formatRefreshCountdown(now = new Date()): string {
  const nextRefresh = getNextRefreshTime(now);
  const totalMinutes = Math.max(1, Math.ceil((nextRefresh.getTime() - now.getTime()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function formatEasternTimestamp(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}
