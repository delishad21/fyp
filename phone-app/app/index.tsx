import { useSession } from "@/src/auth/session";
import { Redirect } from "expo-router";

export default function Index() {
  const status = useSession((s) => s.status);
  if (status === "loading") return null;
  if (status === "auth") return <Redirect href="/(main)/(tabs)/home" />;
  if (status === "mustChangePassword")
    return <Redirect href="/(unauth)/change-password" />;
  return <Redirect href="/(unauth)/landing" />;
}
