import type { ReactNode } from "react";
import SettingsTopNav from "@/components/navigation/SettingsTopNav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0">
      <div className="bg-[var(--color-bg3)]">
        <SettingsTopNav />
      </div>

      <div className="p-6">{children}</div>
    </div>
  );
}
