import { AttemptRow } from "@/src/api/quiz-service";
import { Pill } from "@/src/components/ui/Pill";
import { fmtDateTime } from "@/src/lib/attempt-helpers";
import { useTheme } from "@/src/theme";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Iconify } from "react-native-iconify";

export function AttemptHeader({
  insetsTop,
  colors,
  meta,
  currentRow,
  onOpenPicker,
}: {
  insetsTop: number;
  colors: ReturnType<typeof useTheme>["colors"];
  meta: {
    quizName: string;
    subject: string | null;
    subjectColorHex: string | null;
    topic: string | null;
    score: number | null;
    maxScore: number | null;
    state: string | null;
    stateBg: string;
    stateFg: string;
  };
  currentRow: AttemptRow | null;
  onOpenPicker: () => void;
}) {
  return (
    <View
      style={[
        styles.header,
        { borderBottomColor: colors.bg2, paddingTop: insetsTop },
      ]}
    >
      {/* Left: quiz name + subject/topic */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
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

      {/* Right: score + state pill + attempt picker */}
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
          <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>
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

        <Pressable
          onPress={onOpenPicker}
          style={({ pressed }) => [
            styles.pickerBtn,
            {
              opacity: pressed ? 0.9 : 1,
              borderColor: colors.bg3,
              backgroundColor: colors.bg2,
            },
          ]}
        >
          <Text
            style={{ color: colors.textPrimary, fontWeight: "800" }}
            numberOfLines={1}
          >
            {fmtDateTime(currentRow?.finishedAt || currentRow?.startedAt)}
          </Text>
          <Iconify
            icon="mingcute:down-line"
            size={16}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 100,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: "900" },
  subjectDot: { width: 8, height: 8, borderRadius: 999 },

  pickerBtn: {
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 160,
  },
});
