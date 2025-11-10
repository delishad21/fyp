import { useSession } from "@/src/auth/session";
import Button from "@/src/components/ui/Button";
import TextInput from "@/src/components/ui/TextInput";
import ThemeToggle from "@/src/components/ui/ThemeToggle";
import { useTheme } from "@/src/theme";
import { router } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function LoginScreen() {
  const { colors } = useTheme();
  const signIn = useSession((s) => s.signIn);
  const err = useSession((s) => s.error);
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSignIn() {
    if (!username || !password) return;
    setLoading(true);
    try {
      await signIn(username.trim(), password);
      router.replace("/");
    } catch {
      // do nothing: the store already set useSession().error
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      <ThemeToggle />
      <Text style={[styles.title, { color: colors.textPrimary }]}>Log in</Text>

      <TextInput
        id="username"
        label="Username"
        placeholder="your.username"
        autoCapitalize="none"
        keyboardType="visible-password"
        value={username}
        onValueChange={setU}
      />
      <TextInput
        id="password"
        label="Password"
        placeholder="••••••••"
        secureTextEntry
        value={password}
        onValueChange={setP}
        error={!loading && err ? err : undefined}
      />

      <Button variant="primary" onPress={onSignIn} style={styles.fullWidth}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 12 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  fullWidth: { alignSelf: "stretch" },
});
