import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { Link, router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function ProfileScreen() {
  const { colors } = useTheme();
  const logout = useSession((s) => s.logout);

  async function onLogout() {
    await logout();
    router.replace("/");
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg1 }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Profile</Text>

      {/* Settings */}
      <Link href="/(main)/(tabs)/settings" asChild>
        <Pressable style={[styles.tile, { backgroundColor: colors.bg2 }]}>
          <Text style={{ color: colors.textPrimary, fontWeight: "600" }}>
            Settings
          </Text>
        </Pressable>
      </Link>

      {/* Logout */}
      <Pressable
        onPress={onLogout}
        style={[styles.logoutBtn, { borderColor: colors.bg3 }]}
      >
        <Text
          style={{
            color: colors.error,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          Log out
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  tile: { padding: 14, borderRadius: 12 },
  logoutBtn: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
});
