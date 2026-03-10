import type { ReactNode } from "react";
import RewardsTopNav from "@/components/navigation/RewardsTopNav";

export default function RewardsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0">
      <RewardsTopNav />
      <div className="p-6">{children}</div>
    </div>
  );
}
