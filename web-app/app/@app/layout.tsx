import "@/app/globals.css";
import { TopBar } from "@/components/navigation/TopBar";
import { SideBar } from "@/components/navigation/SideBar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-row h-screen">
      <SideBar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 min-h-0 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
