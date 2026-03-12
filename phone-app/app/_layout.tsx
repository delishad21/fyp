import { useSession } from "@/src/auth/session";
import DragScrollRoot from "@/src/components/DragScrollRoot";
import { ThemeProvider, useTheme } from "@/src/theme";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { Slot } from "expo-router";
import { useEffect } from "react";
import { Text, TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

function ThemedStatusBar() {
  const { scheme, colors } = useTheme();
  return (
    <StatusBar
      style={scheme === "dark" ? "light" : "dark"}
      backgroundColor={colors.bg1}
      translucent={false}
    />
  );
}

export default function RootLayout() {
  const bootstrap = useSession((s) => s.bootstrap);
  const [fontsLoaded] = useFonts({
    "ProductSans-Regular": require("../assets/fonts/ProductSans-Regular.ttf"),
    "ProductSans-Bold": require("../assets/fonts/ProductSans-Bold.ttf"),
  });

  // Apply a global default text face across the app.
  useEffect(() => {
    if (!fontsLoaded) return;

    const TextAny = Text as any;
    const TextInputAny = TextInput as any;

    if (!TextAny.defaultProps) TextAny.defaultProps = {};
    if (!TextInputAny.defaultProps) TextInputAny.defaultProps = {};

    const nextTextStyle = [
      { fontFamily: "ProductSans-Regular" as const },
      TextAny.defaultProps.style,
    ];
    const nextInputStyle = [
      { fontFamily: "ProductSans-Regular" as const },
      TextInputAny.defaultProps.style,
    ];

    TextAny.defaultProps = {
      ...TextAny.defaultProps,
      style: nextTextStyle,
    };
    TextInputAny.defaultProps = {
      ...TextInputAny.defaultProps,
      style: nextInputStyle,
    };
  }, [fontsLoaded]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <DragScrollRoot>
        <ThemeProvider>
          <ThemedStatusBar />
          <Slot />
        </ThemeProvider>
      </DragScrollRoot>
    </SafeAreaProvider>
  );
}
