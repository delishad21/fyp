import "@/app/globals.css";
import { TopBar } from "@/components/navigation/TopBar";
import { SideBar } from "@/components/navigation/SideBar";
import { getSession } from "@/services/user/session-definitions";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    // user tried to hit a protected route -> bounce to sign-in
    redirect("/auth/sign-in");
  }

  return (
    <div className="flex flex-row h-screen">
      <SideBar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 min-h-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
