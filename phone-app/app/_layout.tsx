import { useSession } from "@/src/auth/session";
import DragScrollRoot from "@/src/components/DragScrollRoot";
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
      <DragScrollRoot>
        <ThemeProvider>
          <Slot />
        </ThemeProvider>
      </DragScrollRoot>
    </SafeAreaProvider>
  );
}
