import { useSession } from "@/src/auth/session";
import Button from "@/src/components/ui/Button";
import TextInput from "@/src/components/ui/TextInput";
import { useTheme } from "@/src/theme";
import { router } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const changePassword = useSession((s) => s.changePassword);
  const err = useSession((s) => s.error);
  const errs = useSession((s) => s.errors);
  const clearError = useSession((s) => s.clearError);

  const [current, setCurrent] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function onSubmit() {
    setLocalErr(null);
    if (!current || !pw1 || !pw2) {
      setLocalErr("Please fill in all fields.");
      return;
    }
    if (pw1 !== pw2) {
      setLocalErr("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await changePassword(current, pw1);
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

  const disable = loading || !current || !pw1 || !pw2;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Change Password
      </Text>

      <TextInput
        id="current-password"
        label="Current password"
        secureTextEntry
        value={current}
        onValueChange={onChangeCurrent}
        placeholder="••••••••"
      />

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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 12 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  fullWidth: { alignSelf: "stretch" },
  errorBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
});
