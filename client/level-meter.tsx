import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { useLevels } from "./level-store";

const kBarCount = 4;

/**
 * Pill icon: a microphone when idle, and live level bars while this agent's
 * pill is recording. Bars turn to the warning color after sustained silence.
 */
export function LevelMeterIcon(props: PluginButtonIconProps) {
  const { size, color, theme } = props;
  const snapshot = useLevels();
  const recording = props.context === "agent" && snapshot.agentId === props.agentId;
  const barColor = snapshot.silent ? theme.colors.statusWarning : theme.colors.statusDanger;
  const styles = useMemo(
    () => ({
      row: {
        width: size,
        height: size,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
      },
      bar: { width: Math.max(2, Math.round(size / 6)), borderRadius: 1, backgroundColor: barColor },
    }),
    [size, barColor],
  );
  if (!recording) return <Icon name="Mic" size={size} color={color} />;
  const levels = snapshot.levels.slice(-kBarCount);
  return (
    <View style={styles.row}>
      {levels.map((level, index) => (
        // A floor keeps bars visible during pauses, so the meter reads as live.
        <View key={index} style={[styles.bar, { height: Math.max(2, size * (0.2 + 0.8 * level)) }]} />
      ))}
    </View>
  );
}
