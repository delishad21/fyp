import { createTheme } from "@mui/material";

/**
 * MUI palette must use parseable colors (hex).
 * We set HEX fallbacks here, then map MUI's CSS vars to your Tailwind tokens in CssBaseline.
 */
export function getMuiTheme(mode: "light" | "dark") {
  const light = {
    textPrimary: "#1A1A1A",
    textSecondary: "#555555",
    bg1: "#FFFFFF",
    bg3: "#EFEFEF",
    divider: "#E3E3E3",
  };
  const dark = {
    textPrimary: "#F0F0F0",
    textSecondary: "#9A9A9A",
    bg1: "#161616",
    bg3: "#303030",
    divider: "#464646",
  };
  const f = mode === "dark" ? dark : light;

  return createTheme({
    cssVariables: true, // enables --mui-palette-* vars
    palette: {
      mode,
      primary: { main: "#3D5CFF" }, // hex fallback
      text: { primary: f.textPrimary, secondary: f.textSecondary },
      background: { default: f.bg1, paper: f.bg3 },
      divider: f.divider,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          /* Alias MUI's palette vars to your Tailwind tokens */
          ":root": {
            "--mui-palette-primary-main": "var(--color-primary)",
            "--mui-palette-text-primary": "var(--color-text-primary)",
            "--mui-palette-text-secondary": "var(--color-text-secondary)",
            "--mui-palette-background-default": "var(--color-bg1)",
            "--mui-palette-background-paper": "var(--color-bg3)",
            "--mui-palette-divider": "var(--color-bg4)",
          },
          '[data-theme="dark"]': {
            "--mui-palette-primary-main": "var(--color-primary)",
            "--mui-palette-text-primary": "var(--color-text-primary)",
            "--mui-palette-text-secondary": "var(--color-text-secondary)",
            "--mui-palette-background-default": "var(--color-bg1)",
            "--mui-palette-background-paper": "var(--color-bg3)",
            "--mui-palette-divider": "var(--color-bg4)",
          },
        },
      },
    },
  });
}
