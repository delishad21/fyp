import { formatAvailableUntil } from "@/src/utils/dates";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Iconify } from "react-native-iconify";

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
      style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
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

        {/* RIGHT: chevron */}
        <View style={cardStyles.chevronWrap}>
          <Iconify icon="mingcute:right-line" size={22} color="#ffffffdd" />
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: 5,
    paddingVertical: 25,
    paddingHorizontal: 16,
    marginBottom: 12,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "nowrap",

    // subtle shadow
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  left: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },

  subject: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
    marginBottom: 6,
    letterSpacing: 0.2,
  },

  title: {
    color: "#fff",
    fontSize: 21,
    fontWeight: "700",
    marginBottom: 8,
    lineHeight: 23,
  },

  until: {
    color: "#ffffffcc",
    fontSize: 14,
    fontWeight: "700",
  },

  chevronWrap: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0, // CRITICAL
  },
});
