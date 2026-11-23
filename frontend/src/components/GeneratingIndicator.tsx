import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { tokens } from "../theme/tokens";

interface GeneratingIndicatorProps {
  label?: string;
}

export function GeneratingIndicator({
  label = "Analyzing...",
}: GeneratingIndicatorProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });
  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <Animated.View
        style={[
          styles.dot,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    backgroundColor: tokens.colors.accent,
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  label: {
    color: tokens.colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
});
