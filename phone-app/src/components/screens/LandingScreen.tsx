import Button from "@/src/components/ui/Button";
import { useTheme } from "@/src/theme";
import React, { useState } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import TwoToneSplitBackground from "../ui/TwoToneSplitBackground";

export default function LandingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors);
  const [splitY, setSplitY] = useState<number | null>(null);
  const defaultSplit = Math.round(Dimensions.get("window").height * 0.45);

  return (
    <View style={styles.container}>
      <TwoToneSplitBackground
        topHeight={splitY ?? defaultSplit}
        topColor={colors.bg1}
        bottomColor={colors.bg3}
      />

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
        <View style={styles.topArea}>
          <Text style={styles.title}>Quiz App</Text>
          <Text style={styles.subtitle}>
            Learn faster with daily quizzes and track your streak.
          </Text>
        </View>

        <View
          style={styles.card}
          onLayout={(e) => {
            const { y, height } = e.nativeEvent.layout;
            setSplitY(Math.max(0, Math.round(insets.top + y + height / 2)));
          }}
        >
          <Text style={styles.cardTitle}>Ready to begin?</Text>
          <Text style={styles.cardSubtitle}>
            Jump into your practice journey
          </Text>
          <Button href="/(unauth)/login" variant="primary" style={styles.full}>
            Get Started
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    container: { flex: 1 },
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
      borderRadius: 8,
      padding: 18,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: colors.bg2,
      borderColor: colors.bg4,
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
      shadowColor: "#000",
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
    full: { alignSelf: "stretch", marginTop: 4 },
  });
