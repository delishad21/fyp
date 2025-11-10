import { useSession } from "@/src/auth/session";
import { ThemeProvider } from "@/src/theme";
import { Slot } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  const bootstrap = useSession((s) => s.bootstrap);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Slot />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
