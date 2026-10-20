import { type PluginTimelineItemProps, useRpc } from "@getpaseo/plugin/client";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { MessageKey } from "../shared/i18n";
import { discardDraftRpc, sendDraftRpc } from "../shared/rpc";
import type { JobRow } from "../shared/timeline";
import { useTranslate } from "./locale";

const kTitleKeys: Record<JobRow["state"], MessageKey> = {
  transcribing: "row.transcribing",
  review: "row.review",
  sent: "row.sent",
  discarded: "row.discarded",
  empty: "row.empty",
  failed: "row.failed",
};

export function DictationRow({ agentId, item, theme }: PluginTimelineItemProps<JobRow>) {
  const t = useTranslate();
  const row = item.data;
  const jobId = row.jobId;
  const send = useRpc(sendDraftRpc);
  const discard = useRpc(discardDraftRpc);
  const [draft, setDraft] = useState(row.text);
  const [editing, setEditing] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const styles = useMemo(
    () => ({
      card: {
        gap: 8,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      title: { color: theme.colors.foregroundMuted, fontSize: 12 },
      text: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
      error: { color: theme.colors.statusDanger, fontSize: 12 },
      input: {
        color: theme.colors.foreground,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 8,
        minHeight: 60,
      },
      actions: { flexDirection: "row" as const, gap: 8, flexWrap: "wrap" as const },
      primary: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: theme.colors.accent },
      primaryText: { color: theme.colors.accentForeground },
      secondary: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      secondaryText: { color: theme.colors.foreground },
    }),
    [theme],
  );

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, []);
  const onSend = useCallback(
    () => run(() => send({ agentId, jobId, text: draft })),
    [run, send, agentId, jobId, draft],
  );
  const onDiscard = useCallback(
    () => run(() => discard({ agentId, jobId })),
    [run, discard, agentId, jobId],
  );

  const seconds = Math.max(1, Math.round(row.durationMillis / 1000));
  const reviewing = row.state === "review";
  return (
    <View style={styles.card}>
      <Text style={styles.title}>🎙 {t(kTitleKeys[row.state], { seconds })}</Text>
      {reviewing && editing ? (
        <TextInput style={styles.input} multiline value={draft} onChangeText={setDraft} />
      ) : row.text && row.state !== "sent" ? (
        <Text style={styles.text}>{row.text}</Text>
      ) : null}
      {row.error ? <Text style={styles.error}>{row.error}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {reviewing ? (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onSend} style={styles.primary}>
            <Text style={styles.primaryText}>{t("row.send")}</Text>
          </Pressable>
          {!editing ? (
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setEditing(true)} style={styles.secondary}>
              <Text style={styles.secondaryText}>{t("row.edit")}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={onDiscard} style={styles.secondary}>
            <Text style={styles.secondaryText}>{t("row.discard")}</Text>
          </Pressable>
        </View>
      ) : null}
      {row.raw ? (
        <Pressable accessibilityRole="button" onPress={() => setShowRaw((value) => !value)}>
          <Text style={styles.muted}>
            {showRaw ? "▾" : "▸"} {t("row.raw")}
          </Text>
          {showRaw ? <Text style={styles.muted}>{row.raw}</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}
