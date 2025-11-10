import Button from "@/src/components/ui/Button";
import ThemeToggle from "@/src/components/ui/ThemeToggle";
import { useTheme } from "@/src/theme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function LandingScreen() {
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
      backgroundColor: colors.bg1,
    },
    title: {
      fontSize: 28,
      fontWeight: "800",
      marginBottom: 8,
      color: colors.textPrimary,
    },
    subtitle: {
      opacity: 0.8,
      textAlign: "center",
      marginBottom: 24,
      fontSize: 16,
      color: colors.textSecondary,
    },
  });

  return (
    <View style={styles.container}>
      <ThemeToggle />
      <Text style={styles.title}>Quiz App</Text>
      <Text style={styles.subtitle}>Learn faster with daily quizzes.</Text>
      <Button href="/(unauth)/login" variant="primary">
        Get Started
      </Button>
    </View>
  );
}
