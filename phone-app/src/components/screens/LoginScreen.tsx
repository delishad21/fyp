import { useSession } from "@/src/auth/session";
import Button from "@/src/components/ui/Button";
import TextInput from "@/src/components/ui/TextInput";
import ThemeToggle from "@/src/components/ui/ThemeToggle";
import { useTheme } from "@/src/theme";
import { router } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LoginScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);
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
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 20,
          paddingBottom: Math.max(insets.bottom + 28, 40),
          gap: 12,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <ThemeToggle variant="inline" />
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.title}>Log in</Text>
          <Text style={styles.subtitle}>Welcome back</Text>
        </View>

        <View style={styles.card}>
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
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },
    headerRow: {
      alignItems: "flex-end",
      width: "100%",
    },
    titleBlock: {
      gap: 6,
      marginTop: 4,
      paddingHorizontal: 4,
    },
    title: { fontSize: 35, fontWeight: "900", color: colors.textPrimary },
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
