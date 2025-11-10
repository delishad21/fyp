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
      style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
    >
      <View
        style={[
          cardStyles.container,
          { backgroundColor: colorHex || "#3D5CFF" },
        ]}
      >
        <Text numberOfLines={1} style={cardStyles.subject}>
          {subject}
        </Text>
        <Text numberOfLines={2} style={cardStyles.title}>
          {title}
        </Text>
        <Text numberOfLines={1} style={cardStyles.until}>
          {formatAvailableUntil(endDateISO)}
        </Text>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  subject: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 8,
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 10,
  },
  until: {
    color: "#ffffffcc",
    fontSize: 12,
    fontWeight: "500",
  },
});
