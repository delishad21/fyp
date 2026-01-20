"use client";

import { useEffect, useState } from "react";
import { SideBar } from "@/components/navigation/SideBar";
import { TopBar } from "@/components/navigation/TopBar";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1100px)");
    const apply = () => {
      if (mq.matches) setCollapsed(true);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <SideBar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          className="shrink-0"
          onToggleSidebar={() => setCollapsed((v) => !v)}
          sidebarCollapsed={collapsed}
        />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
