import { useSession } from "@/src/auth/session";
import { hexToRgba } from "@/src/lib/color-utils";
import { googlePalette } from "@/src/theme/google-palette";
import { useTheme } from "@/src/theme";
import { Redirect, Tabs } from "expo-router";
import { Platform } from "react-native";
import { Iconify } from "react-native-iconify";

export default function MainLayout() {
  const status = useSession((s) => s.status);
  const { colors, tokens } = useTheme();

  if (status !== "auth") return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg1 },
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: tokens.typography.bodyFamily,
          fontWeight: "700",
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: colors.bg2,
          borderColor: colors.bg4,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderTopLeftRadius: tokens.radius.lg,
          borderTopRightRadius: tokens.radius.lg,
          height: Platform.OS === "ios" ? 90 : 74,
          paddingTop: 0,
          paddingBottom: 0,
          paddingHorizontal: 0,
          overflow: "hidden",
        },
        tabBarActiveBackgroundColor: colors.bg3,
        tabBarIconStyle: { marginTop: 5, marginBottom: -2 },
        tabBarItemStyle: {
          paddingHorizontal: 0,
          paddingTop: 0,
          paddingBottom: 0,
          borderRadius: 0,
          marginVertical: 0,
          flex: 1,
          justifyContent: "center",
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarActiveTintColor: googlePalette.blue,
          tabBarIcon: ({ size, color, focused }) => (
            <Iconify
              icon="mingcute:home-5-line"
              size={size}
              color={focused ? googlePalette.blue : color}
              style={{ opacity: focused ? 1 : 0.75 }}
            />
          ),
          tabBarActiveBackgroundColor: hexToRgba(googlePalette.blue, 0.18),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Leaderboard",
          tabBarActiveTintColor: googlePalette.red,
          tabBarIcon: ({ size, color, focused }) => (
            <Iconify
              icon="mingcute:award-line"
              size={size}
              color={focused ? googlePalette.red : color}
              style={{ opacity: focused ? 1 : 0.75 }}
            />
          ),
          tabBarActiveBackgroundColor: hexToRgba(googlePalette.red, 0.18),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarActiveTintColor: googlePalette.green,
          tabBarIcon: ({ size, color, focused }) => (
            <Iconify
              icon="mingcute:history-anticlockwise-line"
              size={size}
              color={focused ? googlePalette.green : color}
              style={{ opacity: focused ? 1 : 0.75 }}
            />
          ),
          tabBarActiveBackgroundColor: hexToRgba(googlePalette.green, 0.18),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarActiveTintColor: googlePalette.yellow,
          tabBarIcon: ({ size, color, focused }) => (
            <Iconify
              icon="mingcute:user-3-line"
              size={size}
              color={focused ? googlePalette.yellow : color}
              style={{ opacity: focused ? 1 : 0.75 }}
            />
          ),
          tabBarActiveBackgroundColor: hexToRgba(googlePalette.yellow, 0.2),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          title: "Settings",
          tabBarIcon: ({ size, color, focused }) => (
            <Iconify
              icon="mingcute:settings-3-line"
              size={size}
              color={focused ? googlePalette.blue : color}
              style={{ opacity: focused ? 1 : 0.75 }}
            />
          ),
          tabBarActiveBackgroundColor: hexToRgba(googlePalette.blue, 0.18),
        }}
      />
    </Tabs>
  );
}
