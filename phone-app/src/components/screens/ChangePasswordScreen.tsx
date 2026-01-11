import { useSession } from "@/src/auth/session";
import Button from "@/src/components/ui/Button";
import TextInput from "@/src/components/ui/TextInput";
import { useTheme } from "@/src/theme";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Iconify } from "react-native-iconify";

export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);
  const changePassword = useSession((s) => s.changePassword);
  const err = useSession((s) => s.error);
  const errs = useSession((s) => s.errors);
  const clearError = useSession((s) => s.clearError);
  const status = useSession((s) => s.status);
  const lastAuthPassword = useSession((s) => s.lastAuthPassword);
  const { requireCurrent: requireCurrentParam } = useLocalSearchParams<{
    requireCurrent?: string;
  }>();

  const forceRequireCurrent = useMemo(
    () => requireCurrentParam === "1" || requireCurrentParam === "true",
    [requireCurrentParam]
  );
  const mustChange = status === "mustChangePassword";
  const requireCurrent = forceRequireCurrent || !lastAuthPassword;
  const showBack = forceRequireCurrent && !mustChange;

  const [current, setCurrent] = useState(
    requireCurrent ? "" : lastAuthPassword ?? ""
  );
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function onSubmit() {
    setLocalErr(null);
    const currentNeeded = requireCurrent || !lastAuthPassword;
    if (!pw1 || !pw2 || (currentNeeded && !current)) {
      setLocalErr("Please fill in all fields.");
      return;
    }
    if (pw1 !== pw2) {
      setLocalErr("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const currentToSend = currentNeeded
        ? current
        : lastAuthPassword || current;
      await changePassword(currentToSend, pw1);
      router.replace("/");
    } catch {
    } finally {
      setLoading(false);
    }
  }

  function onChangeCurrent(v: string) {
    if (err || errs) clearError?.();
    setCurrent(v);
  }
  function onChangePw1(v: string) {
    if (err || errs) clearError?.();
    setPw1(v);
  }
  function onChangePw2(v: string) {
    if (err || errs) clearError?.();
    setPw2(v);
  }

  const currentNeeded = requireCurrent || !lastAuthPassword;
  const disable = loading || !pw1 || !pw2 || (currentNeeded && !current);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 20,
          paddingBottom: Math.max(insets.bottom + 28, 40),
          gap: 12,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backBtn,
              { opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Iconify
              icon="mingcute:arrow-left-line"
              size={20}
              color={colors.icon}
            />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}

        <View style={styles.titleBlock}>
          <Text style={styles.title}>Change password</Text>
          <Text style={styles.subtitle}>
            Keep your account secure with a fresh password.
          </Text>
          {!currentNeeded ? (
            <Text style={[styles.subtitle, { marginTop: 4 }]}>
              Confirm your new password below.
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          {currentNeeded ? (
            <TextInput
              id="current-password"
              label="Current password"
              secureTextEntry
              value={current}
              onValueChange={onChangeCurrent}
              placeholder="••••••••"
            />
          ) : null}

          {/* show backend validation bullets directly under the "New password" field */}
          <TextInput
            id="new-password"
            label="New password"
            secureTextEntry
            value={pw1}
            onValueChange={onChangePw1}
            placeholder="••••••••"
            error={errs || undefined}
          />

          <TextInput
            id="confirm-new-password"
            label="Confirm new password"
            secureTextEntry
            value={pw2}
            onValueChange={onChangePw2}
            placeholder="••••••••"
            error={localErr || err || undefined}
          />

          <Button
            variant="primary"
            onPress={onSubmit}
            disabled={disable}
            style={styles.fullWidth}
          >
            {loading ? "Updating…" : "Update"}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    titleBlock: {
      gap: 6,
      marginTop: 4,
      paddingHorizontal: 4,
    },
    backBtn: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    backText: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.textPrimary,
    },
    title: { fontSize: 28, fontWeight: "900", color: colors.textPrimary },
    subtitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textSecondary,
      opacity: 0.9,
    },
    card: {
      marginTop: 14,
      borderRadius: 8,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: colors.bg2,
      borderColor: colors.bg4,
      gap: 12,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
      shadowColor: "#000",
    },
    fullWidth: { alignSelf: "stretch", marginTop: 4 },
  });
