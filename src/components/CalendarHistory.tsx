export interface CalendarReportManifestItem {
  date: string;
  title: string;
  reportPath: string;
  pdfPath: string;
  generatedAt: string;
}

export interface CalendarHistoryProps {
  manifest: CalendarReportManifestItem[];
  currentDate?: string;
  basePath?: string;
  title?: string;
  subtitle?: string;
  className?: string;
  idPrefix?: string;
}

function normalizeHref(basePath: string, path: string): string {
  if (/^(https?:|mailto:|#)/.test(path)) return path;
  const base = basePath.length === 0 ? "" : basePath.endsWith("/") ? basePath : `${basePath}/`;
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${cleanPath}`;
}

function formatReportDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatGeneratedAt(value: string): string {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Generated time unavailable";

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "America/New_York"
  }).format(new Date(value));
}

function sortedAscending(manifest: CalendarReportManifestItem[]): CalendarReportManifestItem[] {
  return [...manifest].sort((left, right) => left.date.localeCompare(right.date));
}

function latestDate(manifest: CalendarReportManifestItem[]): string | undefined {
  return sortedAscending(manifest).at(-1)?.date;
}

function NavigationLink({
  basePath,
  item,
  label
}: {
  basePath: string;
  item: CalendarReportManifestItem | null;
  label: string;
}) {
  if (!item) {
    return (
      <span className="calendar-history__nav-link calendar-history__nav-link--disabled" aria-disabled="true">
        {label}
      </span>
    );
  }

  return (
    <a className="calendar-history__nav-link" href={normalizeHref(basePath, item.reportPath)}>
      {label}
    </a>
  );
}

export function CalendarHistory({
  basePath = "",
  className,
  currentDate,
  idPrefix = "calendar-history",
  manifest,
  subtitle = "Daily research artifacts stay linked by date, with adjacent sessions one tap away.",
  title = "Report Calendar"
}: CalendarHistoryProps) {
  const chronological = sortedAscending(manifest);
  const activeDate = currentDate ?? latestDate(manifest);
  const activeIndex = activeDate ? chronological.findIndex((item) => item.date === activeDate) : -1;
  const previous = activeIndex > 0 ? chronological[activeIndex - 1] : null;
  const next = activeIndex >= 0 && activeIndex < chronological.length - 1 ? chronological[activeIndex + 1] : null;
  const latest = chronological.at(-1);
  const displayItems = [...chronological].reverse();
  const containerClassName = ["calendar-history", className].filter(Boolean).join(" ");

  return (
    <section className={containerClassName} aria-labelledby={`${idPrefix}-title`}>
      <style>{calendarHistoryStyles}</style>
      <header className="calendar-history__header">
        <div>
          <span className="calendar-history__eyebrow">{displayItems.length} archived sessions</span>
          <h2 id={`${idPrefix}-title`}>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <nav className="calendar-history__nav" aria-label="Adjacent report sessions">
          <NavigationLink basePath={basePath} item={previous} label="Previous Session" />
          <NavigationLink basePath={basePath} item={next} label="Next Session" />
        </nav>
      </header>

      <ol className="calendar-history__list">
        {displayItems.map((item) => {
          const active = item.date === activeDate;
          return (
            <li className={active ? "calendar-history__item calendar-history__item--active" : "calendar-history__item"} key={item.date}>
              <time dateTime={item.date}>{formatReportDate(item.date)}</time>
              <div>
                <a className="calendar-history__report-link" href={normalizeHref(basePath, item.reportPath)}>
                  {item.title}
                </a>
                <span>Generated {formatGeneratedAt(item.generatedAt)}</span>
              </div>
              <a className="calendar-history__pdf-link" href={normalizeHref(basePath, item.pdfPath)}>
                PDF for {item.date}
              </a>
            </li>
          );
        })}
      </ol>

      <footer className="calendar-history__footer">
        <span>Latest session</span>
        <strong>{latest ? formatReportDate(latest.date) : "n/a"}</strong>
      </footer>
    </section>
  );
}

const calendarHistoryStyles = `
.calendar-history {
  display: grid;
  gap: 14px;
  color: var(--text, #eef5e8);
}

.calendar-history__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: end;
}

.calendar-history__eyebrow {
  display: block;
  margin-bottom: 7px;
  color: var(--gold, #d9b64f);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.calendar-history h2,
.calendar-history p {
  margin: 0;
}

.calendar-history h2 {
  font-size: clamp(1.25rem, 2vw, 1.7rem);
  line-height: 1.12;
}

.calendar-history__header p {
  color: var(--muted, #91a199);
  font-size: 0.84rem;
  font-weight: 760;
  line-height: 1.42;
}

.calendar-history__nav {
  display: inline-flex;
  gap: 8px;
  justify-content: flex-end;
}

.calendar-history__nav-link,
.calendar-history__pdf-link {
  border: 1px solid var(--line-strong, rgba(217, 182, 79, 0.36));
  border-radius: 8px;
  background: color-mix(in srgb, var(--gold, #d9b64f) 12%, transparent);
  color: var(--text, #eef5e8);
  padding: 8px 10px;
  font-size: 0.74rem;
  font-weight: 900;
  text-decoration: none;
  text-transform: uppercase;
}

.calendar-history__nav-link--disabled {
  border-color: var(--line, rgba(191, 207, 193, 0.14));
  background: transparent;
  color: var(--dim, #687779);
}

.calendar-history__list {
  display: grid;
  gap: 1px;
  overflow: hidden;
  margin: 0;
  border: 1px solid var(--line, rgba(191, 207, 193, 0.14));
  border-radius: 8px;
  background: var(--line, rgba(191, 207, 193, 0.14));
  padding: 0;
  list-style: none;
}

.calendar-history__item {
  display: grid;
  grid-template-columns: 126px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  min-width: 0;
  background: var(--surface-soft, rgba(11, 18, 17, 0.94));
  padding: 12px;
}

.calendar-history__item--active {
  background: color-mix(in srgb, var(--green, #6fd3a1) 10%, var(--surface-soft, rgba(11, 18, 17, 0.94)));
  box-shadow: inset 3px 0 0 var(--green, #6fd3a1);
}

.calendar-history__item time,
.calendar-history__item span,
.calendar-history__footer span {
  color: var(--dim, #687779);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.calendar-history__item div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.calendar-history__report-link {
  overflow: hidden;
  color: var(--text, #eef5e8);
  font-size: 0.9rem;
  font-weight: 900;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.calendar-history__report-link:hover,
.calendar-history__pdf-link:hover,
.calendar-history__nav-link:hover {
  color: var(--green, #6fd3a1);
}

.calendar-history__footer {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid var(--line, rgba(191, 207, 193, 0.14));
  border-radius: 8px;
  background: var(--surface-soft, rgba(11, 18, 17, 0.94));
  padding: 10px 12px;
}

.calendar-history__footer strong {
  color: var(--gold, #d9b64f);
  font-size: 0.82rem;
  font-weight: 900;
}

@media (max-width: 760px) {
  .calendar-history__header,
  .calendar-history__item {
    grid-template-columns: 1fr;
  }

  .calendar-history__nav {
    justify-content: flex-start;
  }

  .calendar-history__report-link {
    white-space: normal;
  }
}
`;
