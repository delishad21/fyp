import type { ReactNode } from "react";

export default function HomeLayout({ children }: { children: ReactNode }) {
  return <div className="p-6">{children}</div>;
}
