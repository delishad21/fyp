import upcoming from "./tempdata/upcoming-quizzes.json";
import { CardShell, ClassBadge } from "../ui/ui";

type Item = {
  date: string;
  weekday: string;
  title: string;
  meta: string;
  class: string;
};

export default function UpcomingQuizzesCard() {
  const items = upcoming as Item[];
  return (
    <CardShell title="Upcoming Quizzes">
      <div className="space-y-3">
        {items.map((it, i) => (
          <div
            key={i}
            className="flex items-start gap-3 bg-[var(--color-bg2)] border border-[var(--color-bg4)] rounded-md p-3"
          >
            <div className="text-lg">📅</div>
            <div className="flex-1">
              <div className="text-sm text-[var(--color-text-secondary)]">
                {new Date(it.date).toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}{" "}
                ({it.weekday})
              </div>
              <div className="font-semibold">{it.title}</div>
              <div className="text-sm text-[var(--color-text-secondary)]">
                {it.meta}
              </div>
            </div>
            <ClassBadge label={it.class} />
          </div>
        ))}
      </div>
    </CardShell>
  );
}
