import {
  type PluginSurfaceProps,
  type SettingsState,
  useRpc,
  useSettings,
} from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, TextInput } from "react-native";
import { testConnectionRpc } from "../shared/rpc";
import { type VoicePromptSettings, voicePromptSettings } from "../shared/settings";
import { type Translate, useTranslate } from "./locale";
import { notifySettingsSaved } from "./readiness-bus";

const kAutosaveDelayMillis = 700;

type Ready = Extract<SettingsState<typeof voicePromptSettings.schema>, { status: "ready" }>;

// Text fields edit a draft that autosaves shortly after typing stops and when
// the screen closes; switches and selects save at once. Numbers and headers
// stay as text in the draft so partial input is not lost while typing.
interface Draft {
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyCommand: string;
  apiKeyCommandTtlSeconds: string;
  extraHeaders: string;
  contextTurns: string;
  contextMaxChars: string;
  promptAddendum: string;
}

function toDraft(values: VoicePromptSettings): Draft {
  return {
    baseUrl: values.baseUrl,
    model: values.model,
    apiKey: values.apiKey,
    apiKeyCommand: values.apiKeyCommand,
    apiKeyCommandTtlSeconds: String(values.apiKeyCommandTtlSeconds),
    extraHeaders: Object.entries(values.extraHeaders)
      .map(([name, value]) => `${name}: ${value}`)
      .join("\n"),
    contextTurns: String(values.contextTurns),
    contextMaxChars: String(values.contextMaxChars),
    promptAddendum: values.promptAddendum,
  };
}

function parseHeaders(text: string): Record<string, string> | null {
  const headers: Record<string, string> = {};
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) return null;
    headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return headers;
}

function parseCount(text: string): number | null {
  return /^\s*\d+\s*$/.test(text) ? Number(text) : null;
}

function fromDraft(
  draft: Draft,
  values: VoicePromptSettings,
  t: Translate,
): { values: VoicePromptSettings } | { error: string } {
  const ttl = parseCount(draft.apiKeyCommandTtlSeconds);
  const turns = parseCount(draft.contextTurns);
  const maxChars = parseCount(draft.contextMaxChars);
  if (ttl === null || turns === null || maxChars === null) return { error: t("settings.invalidNumber") };
  const extraHeaders = parseHeaders(draft.extraHeaders);
  if (!extraHeaders) return { error: t("settings.invalidHeaders") };
  return {
    values: {
      ...values,
      baseUrl: draft.baseUrl,
      model: draft.model,
      apiKey: draft.apiKey,
      apiKeyCommand: draft.apiKeyCommand,
      apiKeyCommandTtlSeconds: ttl,
      extraHeaders,
      contextTurns: turns,
      contextMaxChars: maxChars,
      promptAddendum: draft.promptAddendum,
    },
  };
}

function Editor({ settings, theme }: { settings: Ready; theme: PluginSurfaceProps["theme"] }) {
  const t = useTranslate();
  const test = useRpc(testConnectionRpc);
  // Draft text survives immediate saves from switches and selects; autosave
  // merges it over the latest stored values.
  const [fields, setFields] = useState(() => toDraft(settings.values));
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const styles = useMemo(
    () => ({
      ok: { color: theme.colors.statusSuccess },
      error: { color: theme.colors.statusDanger },
      multiline: {
        minWidth: 240,
        minHeight: 72,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
        color: theme.colors.foreground,
        fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" }),
        fontSize: 13,
        textAlignVertical: "top" as const,
      },
    }),
    [theme],
  );

  const field = useCallback(
    (name: keyof Draft) => (text: string) => {
      setFields((current) => ({ ...current, [name]: text }));
      setDirty(true);
    },
    [],
  );
  const saveNow = useCallback(
    (patch: Partial<VoicePromptSettings>) =>
      void settings
        .save({ ...settings.values, ...patch }, settings.revision)
        .then((saved) => saved && notifySettingsSaved()),
    [settings],
  );
  const saveDraft = useCallback(async () => {
    const parsed = fromDraft(fields, settings.values, t);
    if ("error" in parsed) {
      setStatus({ ok: false, text: parsed.error });
      return;
    }
    setDirty(false);
    const saved = await settings.save(parsed.values, settings.revision);
    setStatus(saved ? { ok: true, text: t("settings.saved") } : null);
    if (saved) notifySettingsSaved();
  }, [fields, settings, t]);

  // Autosave once typing pauses. The plugin SettingsInput exposes no blur
  // event, so a short debounce stands in for Paseo's own save-on-blur.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void saveDraft(), kAutosaveDelayMillis);
    return () => clearTimeout(timer);
  }, [dirty, saveDraft]);

  // Flush a pending edit when the screen closes before the debounce fires.
  const flush = useRef<() => void>(() => {});
  flush.current = () => {
    if (dirty) void saveDraft();
  };
  useEffect(() => () => flush.current(), []);
  const runTest = useCallback(async () => {
    setTesting(true);
    try {
      const result = await test({});
      setStatus({ ok: result.ok, text: result.detail });
    } catch (error) {
      setStatus({ ok: false, text: error instanceof Error ? error.message : String(error) });
    } finally {
      setTesting(false);
    }
  }, [test]);

  const values = settings.values;
  // Only switches and selects wait for an in-flight save; text fields stay
  // editable so autosave never interrupts typing.
  const disabled = settings.saving;
  return (
    <>
      <SettingsSection title={t("settings.model.section")}>
        <SettingsCard>
          <SettingsInput
            label={t("settings.model.baseUrl")}
            hint={t("settings.model.baseUrlHint")}
            initialValue={fields.baseUrl}
            onChangeText={field("baseUrl")}
          />
          <SettingsInput
            label={t("settings.model.model")}
            hint={t("settings.model.modelHint")}
            initialValue={fields.model}
            onChangeText={field("model")}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.auth.section")}>
        <SettingsCard>
          <SettingsSelect
            label={t("settings.auth.mode")}
            value={values.authMode}
            options={[
              { label: t("settings.auth.key"), value: "key" },
              { label: t("settings.auth.command"), value: "command" },
              { label: t("settings.auth.none"), value: "none" },
            ]}
            onValueChange={(authMode) => saveNow({ authMode })}
            disabled={disabled}
          />
          {values.authMode === "key" ? (
            <SettingsInput
              label={t("settings.auth.apiKey")}
              hint={t("settings.auth.apiKeyHint")}
              initialValue={fields.apiKey}
              onChangeText={field("apiKey")}
              secureTextEntry
            />
          ) : null}
          {values.authMode === "command" ? (
            <SettingsInput
              label={t("settings.auth.command.label")}
              hint={t("settings.auth.command.hint")}
              initialValue={fields.apiKeyCommand}
              onChangeText={field("apiKeyCommand")}
            />
          ) : null}
          {values.authMode === "command" ? (
            <SettingsInput
              label={t("settings.auth.ttl")}
              hint={t("settings.auth.ttlHint")}
              initialValue={fields.apiKeyCommandTtlSeconds}
              onChangeText={field("apiKeyCommandTtlSeconds")}
            />
          ) : null}
          {/* SettingsInput is single-line, so headers use a themed multiline input. */}
          <SettingsRow label={t("settings.auth.headers")} hint={t("settings.auth.headersHint")}>
            <TextInput
              accessibilityLabel={t("settings.auth.headers")}
              defaultValue={fields.extraHeaders}
              onChangeText={field("extraHeaders")}
              placeholder={"X-Example: value\nX-Other: value"}
              placeholderTextColor={theme.colors.foregroundMuted}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={styles.multiline}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.context.section")}>
        <SettingsCard>
          <SettingsInput
            label={t("settings.context.turns")}
            hint={t("settings.context.turnsHint")}
            initialValue={fields.contextTurns}
            onChangeText={field("contextTurns")}
          />
          <SettingsInput
            label={t("settings.context.maxChars")}
            initialValue={fields.contextMaxChars}
            onChangeText={field("contextMaxChars")}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.behavior.section")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("settings.behavior.review")}
            hint={t("settings.behavior.reviewHint")}
            value={values.reviewBeforeSend}
            onValueChange={(reviewBeforeSend) => saveNow({ reviewBeforeSend })}
            disabled={disabled}
          />
          <SettingsInput
            label={t("settings.behavior.prompt")}
            initialValue={fields.promptAddendum}
            onChangeText={field("promptAddendum")}
          />
          <SettingsSelect
            label={t("settings.behavior.language")}
            value={values.uiLanguage}
            options={[
              { label: t("settings.behavior.languageSystem"), value: "system" },
              { label: "English", value: "en" },
              { label: "简体中文", value: "zh-CN" },
            ]}
            onValueChange={(uiLanguage) => saveNow({ uiLanguage })}
            disabled={disabled}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsCard>
        <SettingsAction
          label={t("settings.test")}
          actionLabel={testing ? t("settings.testing") : t("settings.test")}
          onPress={() => void runTest()}
          disabled={testing}
        />
        {status || settings.saveError ? (
          <SettingsRow label="">
            <Text style={status?.ok ? styles.ok : styles.error}>
              {settings.saveError ?? status?.text}
            </Text>
          </SettingsRow>
        ) : null}
      </SettingsCard>
    </>
  );
}

export function PreferencesScreen({ theme }: PluginSurfaceProps) {
  const t = useTranslate();
  const settings = useSettings(voicePromptSettings);
  const style = useMemo(() => ({ color: theme.colors.statusDanger }), [theme]);
  if (settings.status === "loading") return null;
  if (settings.status !== "ready") {
    return <Text style={style}>{t("settings.loadFailed", { error: settings.error })}</Text>;
  }
  return <Editor settings={settings} theme={theme} />;
}
