import { Platform } from "react-native";

type TokenBundle = {
  radius: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };
  spacing: {
    xxs: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  typography: {
    displayFamily: string;
    bodyFamily: string;
    monoFamily: string;
    hero: number;
    title: number;
    subtitle: number;
    body: number;
    caption: number;
  };
  motion: {
    fast: number;
    normal: number;
    slow: number;
  };
};

// Product Sans family names expected from local app assets.
// If the font files are not present/loaded, React Native will gracefully fall back.
const displayFamily = Platform.select({
  ios: "ProductSans-Bold",
  android: "ProductSans-Bold",
  default: "ProductSans-Bold",
});

const bodyFamily = Platform.select({
  ios: "ProductSans-Regular",
  android: "ProductSans-Regular",
  default: "ProductSans-Regular",
});

const monoFamily = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

const baseTokens: TokenBundle = {
  radius: {
    xs: 6,
    sm: 8,
    md: 10,
    lg: 12,
    xl: 16,
    pill: 999,
  },
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  typography: {
    displayFamily: String(displayFamily || "System"),
    bodyFamily: String(bodyFamily || "System"),
    monoFamily: String(monoFamily || "monospace"),
    hero: 32,
    title: 24,
    subtitle: 18,
    body: 15,
    caption: 12,
  },
  motion: {
    fast: 140,
    normal: 220,
    slow: 320,
  },
};

export type ThemeTokens = TokenBundle;

export const lightTokens: ThemeTokens = {
  ...baseTokens,
};

export const darkTokens: ThemeTokens = {
  ...baseTokens,
};
