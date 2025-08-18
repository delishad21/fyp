import schedule from "./tempdata/schedule.json";
import { CardShell, Pill } from "../ui/ui";

type Schedule = {
  days: string[];
  rows: { class: string; cells: string[][] }[];
};

export default function ScheduleCard() {
  const data = schedule as Schedule;

  return (
    <CardShell title="Class Schedules for the Week">
      <div className="grid grid-cols-8 gap-1">
        {/* header */}
        <div className="text-sm font-medium text-[var(--color-text-secondary)]">
          Class
        </div>
        {data.days.map((d) => (
          <div
            key={d}
            className="text-sm font-medium text-center text-[var(--color-text-secondary)]"
          >
            {d}
          </div>
        ))}

        {/* rows */}
        {data.rows.map((row) => (
          <div key={row.class} className="contents">
            <div className="font-semibold">{row.class}</div>
            {row.cells.map((cell, idx) => (
              <div
                key={idx}
                className="h-20 bg-[var(--color-bg2)] border border-[var(--color-bg4)] rounded-md p-1.5 space-y-1 overflow-hidden"
              >
                {cell.length > 0 &&
                  cell.map((t, i) => <Pill key={i} text={t} />)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </CardShell>
  );
}
