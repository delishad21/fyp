import type { ReactNode } from "react";
import SettingsTopNav from "@/components/navigation/SettingsTopNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0">
      <SettingsTopNav />

      <div className="p-6">{children}</div>
    </div>
  );
}
