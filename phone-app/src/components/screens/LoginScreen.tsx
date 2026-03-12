import { useSession } from "@/src/auth/session";
import Button from "@/src/components/ui/Button";
import TextInput from "@/src/components/ui/TextInput";
import ThemeToggle from "@/src/components/ui/ThemeToggle";
import { useEntranceAnimation } from "@/src/hooks/useEntranceAnimation";
import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import { router } from "expo-router";
import React, { useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LoginScreen() {
  const { colors } = useTheme();
  const titleMotion = useEntranceAnimation({ fromY: 12, durationMs: 230 });
  const formMotion = useEntranceAnimation({ delayMs: 70, fromY: 18, durationMs: 280 });
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

        <Animated.View style={[styles.titleBlock, titleMotion]}>
          <Text style={styles.title}>Log in</Text>
          <Text style={styles.subtitle}>Welcome back</Text>
        </Animated.View>

        <Animated.View style={[styles.card, formMotion]}>
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

          <Button
            variant="primary"
            onPress={onSignIn}
            style={[styles.fullWidth, styles.authPrimaryBtn]}
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </Animated.View>
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
    title: { fontSize: 38, fontWeight: "900", color: colors.textPrimary },
    subtitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textSecondary,
      opacity: 0.9,
    },
    card: {
      marginTop: 14,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      backgroundColor: colors.bg2,
      borderColor: colors.bg4,
      gap: 12,
    },
    authPrimaryBtn: {
      backgroundColor: googlePalette.blue,
    },
    fullWidth: { alignSelf: "stretch", marginTop: 4 },
  });
