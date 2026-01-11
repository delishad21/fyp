import { AttemptRow } from "@/src/api/quiz-service";
import { fmtDateTime } from "@/src/lib/attempt-helpers";
import { useTheme } from "@/src/theme";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function AttemptPickerModal({
  visible,
  onClose,
  attempts,
  selectedId,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  attempts: AttemptRow[];
  selectedId: string;
  onPick: (id: string) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType={Platform.select({ ios: "slide", android: "fade" })}
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: colors.bg1,
              borderColor: colors.bg4,
              shadowColor: "#000",
              // Ensure list stays above home indicator
              paddingBottom: 24 + Math.max(insets.bottom, 0),
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
            Select attempt
          </Text>

          <FlatList
            data={attempts}
            keyExtractor={(r) => r._id}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            contentContainerStyle={{
              paddingBottom: Math.max(insets.bottom, 0),
            }}
            renderItem={({ item }) => {
              const date = fmtDateTime(item.finishedAt || item.startedAt);
              const score =
                item.score != null && item.maxScore != null
                  ? `${item.score}/${item.maxScore}`
                  : "—";
              const isSel = item._id === selectedId;

              return (
                <Pressable
                  onPress={() => onPick(item._id)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      opacity: pressed ? 0.92 : 1,
                      backgroundColor: isSel ? colors.bg2 : colors.bg1,
                      borderColor: colors.bg4,
                      shadowColor: "#000",
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>
                      {date}
                    </Text>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontWeight: "700",
                        marginTop: 2,
                      }}
                    >
                      Attempt #{attempts.length - attempts.indexOf(item)}
                    </Text>
                  </View>
                  <Text
                    style={{ color: colors.textPrimary, fontWeight: "900" }}
                  >
                    {score}
                  </Text>
                </Pressable>
              );
            }}
          />

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              {
                opacity: pressed ? 0.9 : 1,
                borderColor: colors.bg4,
                backgroundColor: colors.bg2,
              },
            ]}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: "800" }}>
              Close
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** ---------- Styles ---------- */
const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#0008",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  modalCard: {
    width: "100%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: "70%",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 6,
  },
  modalTitle: { fontSize: 16, fontWeight: "900", marginBottom: 10 },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  closeBtn: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 14,
  },
});
