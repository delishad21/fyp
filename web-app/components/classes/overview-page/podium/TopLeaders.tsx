import {
  TopOverallScoreItem,
  TopParticipationItem,
  TopStreakItem,
} from "@/services/class/actions/get-top-students-action";
import PodiumCard from "./PodiumCard";

type PodiumWinnerShape = {
  userId: string;
  className: string;
  displayName: string;
  photoUrl?: string | null;
  rightText: string;
  subText?: string;
};

function toPodium<T>(arr: T[], map: (x: T) => PodiumWinnerShape) {
  const [first, second, third] = [arr[0], arr[1], arr[2]] as (T | undefined)[];
  const wrap = (v?: T) => (v ? map(v) : undefined);
  return { center: wrap(first), left: wrap(second), right: wrap(third) };
}

function toTwoDecimals(num: number) {
  return Math.round(num * 100) / 100;
}

export default function TopLeaders({
  topOverallScore,
  topParticipation,
  topStreak,
}: {
  topOverallScore: TopOverallScoreItem[];
  topParticipation: TopParticipationItem[];
  topStreak: TopStreakItem[];
}) {
  const podiumScore = toPodium(topOverallScore, (s) => ({
    userId: s.userId,
    className: s.className,
    displayName: s.displayName,
    photoUrl: s.photoUrl ?? undefined,
    rightText: `${toTwoDecimals(s.overallScore)} pts`,
    subText: `${toTwoDecimals(s.avgScorePct)}% avg.`,
  }));

  const podiumPart = toPodium(topParticipation, (s) => ({
    userId: s.userId,
    className: s.className,
    displayName: s.displayName,
    photoUrl: s.photoUrl ?? undefined,
    rightText: `${toTwoDecimals(s.participationPct)}%`,
    subText: `${s.participationCount} quizzes`,
  }));

  const podiumStreak = toPodium(topStreak, (s) => ({
    userId: s.userId,
    className: s.className,
    displayName: s.displayName,
    photoUrl: s.photoUrl ?? undefined,
    rightText: `${s.currentStreak} Days`,
  }));

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <PodiumCard title="Highest Streak" {...podiumStreak} />
      <PodiumCard title="Highest Participation" {...podiumPart} />
      <PodiumCard title="Highest Overall Score" {...podiumScore} />
    </div>
  );
}
