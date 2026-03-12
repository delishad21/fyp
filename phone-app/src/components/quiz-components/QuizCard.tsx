import { formatAvailableUntil } from "@/src/utils/dates";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function QuizCard({
  title,
  subject,
  colorHex,
  endDateISO,
  onPress,
}: {
  title: string;
  subject: string;
  colorHex: string;
  endDateISO: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.95 : 1 }]}
    >
      <View
        style={[
          cardStyles.container,
          { backgroundColor: colorHex || "#3D5CFF" },
        ]}
      >
        {/* LEFT: text */}
        <View style={cardStyles.left}>
          <Text numberOfLines={2} style={cardStyles.title}>
            {title}
          </Text>

          <Text numberOfLines={1} style={cardStyles.subject}>
            {subject}
          </Text>

          <Text numberOfLines={1} style={cardStyles.until}>
            {formatAvailableUntil(endDateISO)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: 12,
    paddingVertical: 25,
    paddingHorizontal: 16,
    marginBottom: 12,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "nowrap",

    // subtle shadow
    overflow: "hidden",
  },

  left: {
    flex: 1,
    minWidth: 0,
  },

  subject: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 17,
    marginBottom: 6,
    letterSpacing: 0.2,
  },

  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
    lineHeight: 24,
  },

  until: {
    color: "#ffffffcc",
    fontSize: 14,
    fontWeight: "700",
  },
});
