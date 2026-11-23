import { Platform, type ViewStyle } from "react-native";

export interface WebStyleExtension {
  backdropFilter?: string;
  WebkitBackdropFilter?: string;
  backgroundImage?: string;
}

export type SurfaceStyle = ViewStyle & WebStyleExtension;

export const tokens = {
  colors: {
    canvas: "#bccbda",
    canvasFallback: "#f3f6fa",
    surface: "#f8adad",
    surfaceStrong: "#1b5692",
    surfaceMuted: "#f5f8fc",
    text: "#21293d",
    textSecondary: "#4f5765",
    textMuted: "#8f939c",
    border: "#d8dee8",
    borderStrong: "#c8d0dc",
    accent: "#82b9f3f3",
    accentSoft: "#edf4ff",
    success: "#1c8261e8",
    successSoft: "#edf8f4",
    error: "#b42318",
    errorSoft: "#fff1f0",
    backgroundDot: "#231e1f",
    backgroundDotBlue: "#719bd5",
    backgroundDotViolet: "#ee6407",
  },
  motion: {
    backgroundDotOpacity: {
      min: 0.16,
      max: 0.34,
    },
  },
  radii: {
    small: 10,
    medium: 14,
    large: 16,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 32,
  },
  shadow: {
    shadowColor: "#1f2a44",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  } as SurfaceStyle,
};

export function acrylicSurface(options?: {
  backgroundColor?: string;
  borderColor?: string;
  radius?: number;
}): SurfaceStyle {
  const webAcrylic =
    Platform.OS === "web"
      ? {
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }
      : {};

  return {
    backgroundColor:
      options?.backgroundColor ??
      (Platform.OS === "web"
        ? "rgba(157, 204, 198, 0.05)"
        : "#adb9c2"),
    borderColor: options?.borderColor ?? "rgba(120, 129, 149, 0.05)",
    borderRadius: options?.radius ?? tokens.radii.medium,
    borderWidth: 1,
    ...webAcrylic,
  };
}

export function micaBackdrop(): SurfaceStyle {
  if (Platform.OS === "web") {
    return {
      backgroundColor: tokens.colors.canvasFallback,
      backgroundImage:
        "radial-gradient(circle at 12% 8%, rgba(92, 112, 142, 0.93), transparent 28%), radial-gradient(circle at 88% 18%, rgba(168, 146, 255, 0.14), transparent 24%), linear-gradient(145deg, #79d4eb 0%, #6f897f 100%)",
    };
  }

  return {
    backgroundColor: tokens.colors.canvasFallback,
  };
}
