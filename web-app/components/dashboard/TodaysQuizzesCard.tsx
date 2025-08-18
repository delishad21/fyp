import quizzes from "./tempdata/todays-quizzes.json";
import { CardShell, ClassBadge, ThinProgress } from "../ui/ui";

type Row = {
  class: string;
  subject: string;
  name: string;
  participation: number;
  average: number;
};

export default function TodaysQuizzesCard() {
  const rows = quizzes as Row[];
  return (
    <CardShell title="Today’s Quizzes">
      <div className="space-y-2">
        {rows.map((q, i) => (
          <div
            key={i}
            className="grid grid-cols-[90px_1fr_2fr_160px_160px] items-center gap-3 bg-[var(--color-bg2)] border border-[var(--color-bg4)] rounded-md px-3 py-2"
          >
            <div>
              <ClassBadge label={q.class} />
            </div>

            <div className="flex items-center gap-2">
              {/* little status dot to match mock */}
              <span className="w-2 h-2 rounded-full bg-[#FF6B6B]" />
              <span>{q.subject}</span>
            </div>

            <div className="truncate text-[var(--color-text-secondary)]">
              {q.name}
            </div>

            <div className="flex items-center gap-2">
              <ThinProgress value={q.participation} />
              <span className="w-10 text-right text-sm">
                {q.participation}%
              </span>
            </div>

            <div className="flex items-center gap-2">
              <ThinProgress value={q.average} />
              <span className="w-10 text-right text-sm">{q.average}%</span>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}
