import { Pill } from "@/src/components/ui/Pill";
import { googlePalette } from "@/src/theme/google-palette";
import { useTheme } from "@/src/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Iconify } from "react-native-iconify";

export function AttemptHeader({
  insetsTop,
  colors,
  meta,
  onBack,
}: {
  insetsTop: number;
  colors: ReturnType<typeof useTheme>["colors"];
  meta: {
    quizName: string;
    quizVersion: number;
    subject: string | null;
    subjectColorHex: string | null;
    topic: string | null;
    score: number | null;
    maxScore: number | null;
    state: string | null;
    stateBg: string;
    stateFg: string;
  };
  onBack?: () => void;
}) {
  return (
    <View
      style={[
        styles.header,
        {
          borderBottomColor: colors.bg4,
          paddingTop: insetsTop + 6,
          backgroundColor: colors.bg1,
        },
      ]}
    >
      {/* Left: quiz name + subject/topic */}
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: 10 }}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [
              styles.backBtn,
              {
                backgroundColor: colors.bg2,
                borderColor: colors.bg4,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Iconify
              icon="mingcute:arrow-left-line"
              size={18}
              color={colors.icon}
            />
          </Pressable>
        ) : null}

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[styles.title, { color: googlePalette.blue }]}
            numberOfLines={1}
          >
            {meta.quizName}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
            }}
          >
            <View
              style={[
                styles.subjectDot,
                { backgroundColor: meta.subjectColorHex || colors.primary },
              ]}
            />
            <Text
              style={{ color: colors.textSecondary, fontWeight: "700" }}
              numberOfLines={1}
            >
              {meta.subject || "—"}
              {meta.topic ? ` • ${meta.topic}` : ""}
            </Text>
          </View>
        </View>
      </View>

      {/* Right: score + state pill */}
      <View style={{ alignItems: "flex-end", gap: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <Text style={{ color: googlePalette.red, fontWeight: "900" }}>
            {meta.score != null && meta.maxScore != null
              ? `${meta.score}/${meta.maxScore}`
              : "—"}
          </Text>
          <Pill
            text={meta.state || "unknown"}
            bg={meta.stateBg}
            fg={meta.stateFg}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "900" },
  subjectDot: { width: 8, height: 8, borderRadius: 999 },

  backBtn: {
    height: 34,
    width: 34,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
});
