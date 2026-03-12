import Button from "@/src/components/ui/Button";
import { useEntranceAnimation } from "@/src/hooks/useEntranceAnimation";
import { useTheme } from "@/src/theme";
import { googlePalette } from "@/src/theme/google-palette";
import React from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LandingScreen() {
  const { colors } = useTheme();
  const topMotion = useEntranceAnimation({ fromY: 14, durationMs: 240 });
  const cardMotion = useEntranceAnimation({ delayMs: 80, fromY: 18, durationMs: 280 });
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);

  return (
    <View style={styles.container}>

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: Math.max(insets.bottom + 28, 40),
          paddingHorizontal: 20,
          flexGrow: 1,
          justifyContent: "center",
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[styles.topArea, topMotion]}>
          <Text style={styles.title}>Quiz App</Text>
          <Text style={styles.subtitle}>
            Learn faster with daily quizzes and track your streak.
          </Text>
        </Animated.View>

        <Animated.View style={[styles.card, cardMotion]}>
          <Text style={styles.cardTitle}>Ready to begin?</Text>
          <Text style={styles.cardSubtitle}>
            Jump into your practice journey
          </Text>
          <Button
            href="/(unauth)/login"
            variant="primary"
            style={[styles.full, styles.authPrimaryBtn]}
          >
            Get Started
          </Button>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg1 },
    topArea: {
      paddingHorizontal: 12,
      alignItems: "center",
      gap: 10,
    },
    title: {
      fontSize: 40,
      fontWeight: "900",
      color: colors.textPrimary,
      textAlign: "center",
    },
    subtitle: {
      textAlign: "center",
      fontSize: 15,
      color: colors.textSecondary,
      opacity: 0.9,
      maxWidth: 340,
    },

    card: {
      marginTop: 28,
      marginHorizontal: 16,
      borderRadius: 12,
      padding: 18,
      borderWidth: 1,
      backgroundColor: colors.bg2,
      borderColor: colors.bg4,
      gap: 12,
    },
    cardTitle: {
      fontSize: 25,
      fontWeight: "900",
      color: colors.textPrimary,
      textAlign: "center",
    },
    cardSubtitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textSecondary,
      lineHeight: 20,
      textAlign: "center",
    },
    authPrimaryBtn: {
      backgroundColor: googlePalette.blue,
    },
    full: { alignSelf: "stretch", marginTop: 4 },
  });
