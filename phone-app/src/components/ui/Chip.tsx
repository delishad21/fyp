import { Text, View } from "react-native";

export function Chip({
  text,
  bg,
  fg,
}: {
  text: string;
  bg: string;
  fg: string;
}) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        height: 22,
        borderRadius: 999,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: "800" }}>{text}</Text>
    </View>
  );
}
