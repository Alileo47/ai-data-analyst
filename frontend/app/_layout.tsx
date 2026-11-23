import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { tokens } from "../src/theme/tokens";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          title: "AI Data Analyst",
          headerTransparent: true,
          headerBlurEffect: "systemThinMaterial",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: "rgba(138, 180, 204, 0.40)" },
          headerTintColor: tokens.colors.text,
          headerTitleStyle: {
            fontSize: 16,
            fontWeight: "700",
          },
        }}
      />
    </>
  );
}
