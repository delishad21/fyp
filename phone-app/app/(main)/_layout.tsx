import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { Redirect, Stack } from "expo-router";

export default function MainLayout() {
  const status = useSession((s) => s.status);
  const { colors } = useTheme();

  if (status === "loading") return null;
  if (status !== "auth") return <Redirect href="/(unauth)/landing" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg1 },
      }}
    >
      {/* Tabs live here */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      {/* Non-tab stacks registered here */}
      <Stack.Screen name="quiz" options={{ headerShown: false }} />
      <Stack.Screen name="attempt/index" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="students/[studentId]" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="avatar-customize" options={{ headerShown: false }} />
      <Stack.Screen name="badge-inventory" options={{ headerShown: false }} />
      <Stack.Screen name="reward-item" options={{ headerShown: false }} />
      <Stack.Screen name="change-password" options={{ headerShown: false }} />
    </Stack>
  );
}
