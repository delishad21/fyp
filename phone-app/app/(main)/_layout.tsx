import { useSession } from "@/src/auth/session";
import { Redirect, Stack } from "expo-router";

export default function MainLayout() {
  const status = useSession((s) => s.status);

  if (status === "loading") return null;
  if (status !== "auth") return <Redirect href="/(unauth)/landing" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Tabs live here */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* Non-tab stacks registered here */}
      <Stack.Screen name="quiz" options={{ headerShown: false }} />
      <Stack.Screen name="attempt" options={{ headerShown: false }} />
    </Stack>
  );
}
