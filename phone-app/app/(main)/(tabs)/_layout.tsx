import { useSession } from "@/src/auth/session";
import { useTheme } from "@/src/theme";
import { Redirect, Tabs } from "expo-router";
import { Platform } from "react-native";
import { Iconify } from "react-native-iconify";

export default function MainLayout() {
  const status = useSession((s) => s.status);
  const { colors } = useTheme();

  if (status !== "auth") return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg1 },
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 15,
          fontWeight: "700",
          marginTop: 2,
        },

        tabBarStyle: {
          backgroundColor: colors.bg1,
          borderTopColor: colors.bg3,
          borderTopWidth: 1,

          height: 75,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 18 : 10,

          elevation: 0,

          ...(Platform.OS === "ios"
            ? {
                shadowColor: "#000",
                shadowOpacity: 0.08,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: -4 },
              }
            : null),
        },

        tabBarIconStyle: { marginBottom: -2 },

        tabBarItemStyle: {
          paddingHorizontal: 6,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ size, focused }) => (
            <Iconify
              icon="mingcute:home-5-line"
              size={size}
              color={colors.icon}
              style={{ opacity: focused ? 1 : 0.65 }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Leaderboard",
          tabBarIcon: ({ size, focused }) => (
            <Iconify
              icon="mingcute:award-line"
              size={size}
              color={colors.icon}
              style={{ opacity: focused ? 1 : 0.65 }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ size, focused }) => (
            <Iconify
              icon="mingcute:history-anticlockwise-line"
              size={size}
              color={colors.icon}
              style={{ opacity: focused ? 1 : 0.65 }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ size, focused }) => (
            <Iconify
              icon="mingcute:user-3-line"
              size={size}
              color={colors.icon}
              style={{ opacity: focused ? 1 : 0.65 }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          title: "Settings",
          tabBarIcon: ({ size, focused }) => (
            <Iconify
              icon="mingcute:settings-3-line"
              size={size}
              color={colors.icon}
              style={{ opacity: focused ? 1 : 0.65 }}
            />
          ),
        }}
      />
    </Tabs>
  );
}
