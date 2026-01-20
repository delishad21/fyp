import "@/app/globals.css";
import AppShell from "@/components/navigation/AppShell";
import { getSession } from "@/services/user/session-definitions";
import { redirect } from "next/navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    // redirect to sign in if user tries to access app route without a session
    redirect("/auth/sign-in");
  }

  return <AppShell>{children}</AppShell>;
}
