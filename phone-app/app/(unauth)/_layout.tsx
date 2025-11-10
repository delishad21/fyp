import { Stack } from "expo-router";
export default function UnauthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="landing" />
      <Stack.Screen name="login" />
      <Stack.Screen name="change-password" />
    </Stack>
  );
}
