import { useTheme } from "@/src/theme";
import { Text, View } from "react-native";

/** ---------- Tiny pill tag ---------- */
export function Pill({
  text,
  bg,
  fg,
  size = "sm",
}: {
  text: string;
  bg: string;
  fg: string;
  size?: "sm" | "md";
}) {
  const { tokens } = useTheme();
  const height = size === "md" ? 30 : 24;
  const px = size === "md" ? 12 : 10;
  const fontSize = size === "md" ? 14 : 12;
  return (
    <View
      style={{
        paddingHorizontal: px,
        height,
        borderRadius: tokens.radius.sm,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{ color: fg, fontSize, fontWeight: "800", letterSpacing: 0.2 }}
      >
        {text}
      </Text>
    </View>
  );
}
